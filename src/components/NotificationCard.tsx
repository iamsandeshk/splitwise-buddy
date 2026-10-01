import { useEffect, useRef, useState } from 'react';
import { X, Info, CheckCircle2, Zap, ExternalLink, AlertCircle } from 'lucide-react';
import {
  subscribeToNotifications,
  scheduleLocalPush,
  type AppNotification,
} from '@/integrations/firebase/notifications';

const DISMISSED_KEY = 'splitmate_dismissed_notifications';

function getDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* ignore parse errors */ }
  return new Set<string>();
}

function saveDismissed(set: Set<string>): void {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(set)));
}

interface TypeStyle {
  accentColor: string;
  labelColor: string;
  iconNode: React.ReactNode;
  label: string;
}

const TYPE_MAP: Record<string, TypeStyle> = {
  info: {
    accentColor: 'hsl(215 80% 60%)',
    labelColor: 'hsl(215 80% 70%)',
    iconNode: <Info size={14} />,
    label: 'INFO',
  },
  warning: {
    accentColor: 'hsl(38 92% 55%)',
    labelColor: 'hsl(38 92% 65%)',
    iconNode: <AlertCircle size={14} />,
    label: 'ALERT',
  },
  success: {
    accentColor: 'hsl(152 60% 48%)',
    labelColor: 'hsl(152 60% 58%)',
    iconNode: <CheckCircle2 size={14} />,
    label: 'UPDATE',
  },
  promo: {
    accentColor: 'hsl(var(--primary))',
    labelColor: 'hsl(var(--primary))',
    iconNode: <Zap size={14} />,
    label: 'NEW',
  },
};

function getTypeStyle(type?: string): TypeStyle {
  return TYPE_MAP[type || 'info'] ?? TYPE_MAP.info;
}

function timeAgo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  } catch {
    return '';
  }
}

export function NotificationCard() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(getDismissed);
  const [hasError, setHasError] = useState(false);
  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let unsub: (() => void) | undefined;
    try {
      unsub = subscribeToNotifications((incoming) => {
        try {
          incoming.forEach((n) => {
            if (!seenIdsRef.current.has(n.id)) {
              seenIdsRef.current.add(n.id);
              if (!getDismissed().has(n.id)) {
                void scheduleLocalPush(n.title, n.body);
              }
            }
          });
          setNotifications(incoming);
        } catch (err) {
          console.warn('[NotificationCard] update error:', err);
        }
      });
    } catch (err) {
      console.warn('[NotificationCard] subscribe error:', err);
      setHasError(true);
    }
    return () => { try { unsub?.(); } catch { /* ignore */ } };
  }, []);

  const visible = notifications.filter((n) => !dismissed.has(n.id));

  if (hasError || visible.length === 0) return null;

  const handleDismiss = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    saveDismissed(next);
  };



  return (
    <div className="space-y-2">
      {visible.map((n) => {
        const ts = getTypeStyle(n.type);
        return (
          <div
            key={n.id}
            className="relative overflow-hidden flex items-start gap-3 px-4 py-3.5"
            style={{
              background: 'hsl(var(--card) / 0.75)',
              border: '1px solid hsl(var(--border) / 0.45)',
              borderRadius: '1.1rem',
              boxShadow: '0 1px 8px -3px rgba(0,0,0,0.35)',
            }}
          >
            {/* Left accent bar */}
            <div
              className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
              style={{ background: ts.accentColor, opacity: 0.9 }}
            />

            {/* Icon bubble */}
            <div
              className="shrink-0 w-[34px] h-[34px] rounded-[0.7rem] flex items-center justify-center mt-0.5"
              style={{
                background: `color-mix(in srgb, ${ts.accentColor} 15%, transparent)`,
                color: ts.accentColor,
              }}
            >
              {n.emoji ? (
                <span className="text-[15px] leading-none">{n.emoji}</span>
              ) : (
                ts.iconNode
              )}
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0 pr-6">
              <div className="flex items-center gap-2 mb-[3px]">
                <span
                  className="font-mono text-[9px] uppercase tracking-[0.2em] font-bold"
                  style={{ color: ts.labelColor }}
                >
                  {ts.label}
                </span>
                <span className="ml-auto text-[9px] font-mono text-muted-foreground/45 shrink-0">
                  {timeAgo(n.createdAt)}
                </span>
              </div>

              <p className="text-[13px] font-bold text-foreground leading-snug tracking-tight">
                {n.title}
              </p>

              {n.body && (
                <p className="text-[11.5px] text-muted-foreground mt-[3px] leading-snug">
                  {n.body}
                </p>
              )}

              {n.link && (
                <a
                  href={n.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-semibold hover:underline"
                  style={{ color: ts.accentColor }}
                >
                  Learn more <ExternalLink size={10} />
                </a>
              )}
            </div>

            {/* Dismiss */}
            <button
              type="button"
              onClick={(e) => handleDismiss(n.id, e)}
              className="absolute top-2.5 right-2.5 w-[22px] h-[22px] rounded-full flex items-center justify-center transition-all active:scale-90"
              style={{
                background: 'hsl(var(--muted) / 0.55)',
                border: '1px solid hsl(var(--border) / 0.3)',
              }}
              title="Dismiss"
            >
              <X size={11} className="text-muted-foreground" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
