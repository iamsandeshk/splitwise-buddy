import { useEffect, useRef, useState } from 'react';
import {
  X, Info, CheckCircle2, Zap, ExternalLink, AlertCircle,
  Bell, Star, Rocket, Gift, Megaphone, Trophy, Heart, Sparkles,
  ShoppingCart, CreditCard, Shield, Download, Globe, MessageCircle,
  Flame, Package,
} from 'lucide-react';
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
  } catch { /* ignore */ }
  return new Set<string>();
}

function saveDismissed(set: Set<string>): void {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(set)));
}

// Map for __ICON__Name → lucide component
const ICON_COMPONENT_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Bell, Star, Rocket, Gift, Zap, CheckCircle2, AlertCircle, Info,
  Megaphone, Trophy, Heart, Sparkles, ShoppingCart, CreditCard, Shield,
  Download, Globe, MessageCircle, Flame, Package,
};

function renderEmojiOrIcon(emoji?: string, fallback?: React.ReactNode, size = 16) {
  if (!emoji) return fallback ?? null;
  if (emoji.startsWith('__ICON__')) {
    const name = emoji.slice('__ICON__'.length);
    const Comp = ICON_COMPONENT_MAP[name];
    return Comp ? <Comp size={size} /> : fallback ?? null;
  }
  return <span className="text-[15px] leading-none">{emoji}</span>;
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
  const latestIdRef = useRef<string | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let unsub: (() => void) | undefined;
    try {
      unsub = subscribeToNotifications((incoming) => {
        try {
          const newest = incoming[0] ?? null;

          incoming.forEach((n) => {
            if (!seenIdsRef.current.has(n.id)) {
              seenIdsRef.current.add(n.id);
              if (!getDismissed().has(n.id)) {
                void scheduleLocalPush(n.title, n.body);
              }
            }
          });

          if (newest && newest.id !== latestIdRef.current) {
            if (latestIdRef.current !== null) {
              const fresh = new Set<string>();
              setDismissed(fresh);
              saveDismissed(fresh);
            }
            latestIdRef.current = newest.id;
          }

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

  const latest = notifications.find((n) => !dismissed.has(n.id)) ?? null;

  if (hasError || !latest) return null;

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(dismissed);
    next.add(latest.id);
    setDismissed(next);
    saveDismissed(next);
  };

  const ts = getTypeStyle(latest.type);

  return (
    <div
      className="relative overflow-hidden flex items-start gap-3 px-4 pt-3.5 pb-3.5"
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
        {renderEmojiOrIcon(latest.emoji, ts.iconNode, 15)}
      </div>

      {/* Text column — contains everything including Try button */}
      <div className="flex-1 min-w-0">
        {/* Label + timestamp row — padded right to avoid X button overlap */}
        <div className="flex items-center gap-2 mb-[3px] pr-7">
          <span
            className="font-mono text-[9px] uppercase tracking-[0.2em] font-bold"
            style={{ color: ts.labelColor }}
          >
            {ts.label}
          </span>
          <span className="ml-auto text-[9px] font-mono text-muted-foreground/45 shrink-0">
            {timeAgo(latest.createdAt)}
          </span>
        </div>

        <p className="text-[13px] font-bold text-foreground leading-snug tracking-tight pr-7">
          {latest.title}
        </p>

        {latest.body && (
          <p className="text-[11.5px] text-muted-foreground mt-[3px] leading-snug">
            {latest.body}
          </p>
        )}

        {/* Try button — sits naturally below body text, no X overlap */}
        {latest.link && (
          <a
            href={latest.link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-2.5 inline-flex items-center gap-1 px-3 py-1.5 rounded-[0.6rem] font-bold text-[11px] tracking-wide transition-all active:scale-95 hover:opacity-90"
            style={{
              background: `color-mix(in srgb, ${ts.accentColor} 18%, transparent)`,
              color: ts.accentColor,
              border: `1px solid color-mix(in srgb, ${ts.accentColor} 35%, transparent)`,
            }}
          >
            Try
            <ExternalLink size={10} strokeWidth={2.5} />
          </a>
        )}
      </div>

      {/* Dismiss — top-right corner, no longer overlaps Try */}
      <button
        type="button"
        onClick={handleDismiss}
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
}
