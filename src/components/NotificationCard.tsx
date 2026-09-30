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

const TYPE_STYLES: Record<string, { bg: string; border: string; icon: React.ReactNode; accentText: string }> = {
  info: {
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/25',
    icon: <Info size={15} className="text-blue-400 shrink-0" />,
    accentText: 'text-blue-400',
  },
  warning: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/25',
    icon: <AlertCircle size={15} className="text-amber-400 shrink-0" />,
    accentText: 'text-amber-400',
  },
  success: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/25',
    icon: <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />,
    accentText: 'text-emerald-400',
  },
  promo: {
    bg: 'bg-primary/10',
    border: 'border-primary/25',
    icon: <Zap size={15} className="text-primary shrink-0" />,
    accentText: 'text-primary',
  },
};

function getStyle(type?: string) {
  return TYPE_STYLES[type || 'info'] || TYPE_STYLES.info;
}

function timeAgo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  } catch {
    return '';
  }
}

export function NotificationCard() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(getDismissed);
  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unsub = subscribeToNotifications((incoming) => {
      // Fire system push for truly new notifications (not previously seen in this session)
      incoming.forEach((n) => {
        if (!seenIdsRef.current.has(n.id)) {
          seenIdsRef.current.add(n.id);
          // Only push system notification for ones that aren't already dismissed
          if (!getDismissed().has(n.id)) {
            void scheduleLocalPush(n.title, n.body);
          }
        }
      });
      setNotifications(incoming);
    });
    return () => unsub();
  }, []);

  const visible = notifications.filter((n) => !dismissed.has(n.id));

  const handleDismiss = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    saveDismissed(next);
  };

  if (visible.length === 0) return null;

  return (
    <div className="space-y-2.5">
      {visible.map((n) => {
        const style = getStyle(n.type);
        return (
          <div
            key={n.id}
            className={`relative rounded-2xl border px-4 py-3.5 overflow-hidden transition-all ${style.bg} ${style.border}`}
            style={{
              boxShadow: '0 2px 12px -4px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
            }}
          >
            {/* Subtle glow stripe top */}
            <div
              className="absolute top-0 inset-x-0 h-px opacity-50"
              style={{ background: `linear-gradient(90deg, transparent, currentColor, transparent)` }}
            />

            {/* Dismiss button */}
            <button
              onClick={(e) => handleDismiss(n.id, e)}
              className="absolute top-2.5 right-2.5 w-6 h-6 rounded-full bg-muted/60 hover:bg-muted border border-border/30 flex items-center justify-center transition-all active:scale-90"
              title="Dismiss notification"
              type="button"
            >
              <X size={12} className="text-muted-foreground" />
            </button>

            <div className="flex items-start gap-3 pr-7">
              {/* Icon / Emoji */}
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${style.bg} border ${style.border}`}>
                {n.emoji ? (
                  <span className="text-base leading-none">{n.emoji}</span>
                ) : (
                  style.icon
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`font-mono text-[9px] uppercase tracking-[0.18em] font-semibold ${style.accentText}`}>
                    {n.type === 'promo' ? 'Announcement' : n.type === 'warning' ? 'Alert' : n.type === 'success' ? 'Update' : 'Info'}
                  </span>
                  <span className="text-[9px] text-muted-foreground/60 font-mono ml-auto shrink-0">
                    {timeAgo(n.createdAt)}
                  </span>
                </div>

                <p className="text-sm font-bold text-foreground leading-tight tracking-tight">
                  {n.title}
                </p>

                {n.body && (
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                    {n.body}
                  </p>
                )}

                {n.link && (
                  <a
                    href={n.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1 mt-2 text-xs font-semibold ${style.accentText} hover:underline`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    Learn more <ExternalLink size={11} />
                  </a>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
