import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  Home, User, Users, ExternalLink, Ellipsis,
  Landmark, Target, Repeat, WalletCards, PieChart, ArrowLeftRight, CreditCard, ListOrdered
} from 'lucide-react';
import { getTabConfig, type TabConfig, getLiquidGlassEnabled } from '@/lib/storage';

interface BottomNavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const ALL_NAV_ITEMS = [
  { id: 'home',          label: 'Home',     icon: Home },
  { id: 'personal',      label: 'Personal', icon: User },
  { id: 'transactions',  label: 'Txn',      icon: ListOrdered },
  { id: 'shared',        label: 'Split',    icon: Users },
  { id: 'links',         label: 'Links',    icon: ExternalLink },
  { id: 'categories',    label: 'Category', icon: PieChart },
  { id: 'budgets',       label: 'Budget',   icon: WalletCards },
  { id: 'accounts',      label: 'Accounts', icon: CreditCard },
  { id: 'loans',         label: 'Loans',    icon: Landmark },
  { id: 'goals',         label: 'Goals',    icon: Target },
  { id: 'subscriptions', label: 'Subs',     icon: Repeat },
  { id: 'converter',     label: 'Conv',     icon: ArrowLeftRight },
  { id: 'more',          label: 'More',     icon: Ellipsis },
];

const GLASS_STYLES = `
  @keyframes lg-squish {
    0%   { transform: scaleX(1)    scaleY(1);    border-radius: 2rem; }
    25%  { transform: scaleX(1.12) scaleY(0.82); border-radius: 2.5rem; }
    55%  { transform: scaleX(0.94) scaleY(1.06); border-radius: 1.8rem; }
    75%  { transform: scaleX(1.03) scaleY(0.97); border-radius: 2rem; }
    100% { transform: scaleX(1)    scaleY(1);    border-radius: 2rem; }
  }

  @keyframes lg-icon-pop {
    0%   { transform: scale(1)    translateY(0px); }
    40%  { transform: scale(1.22) translateY(-3px); }
    65%  { transform: scale(0.96) translateY(0px); }
    80%  { transform: scale(1.06) translateY(-1px); }
    100% { transform: scale(1.1)  translateY(-1px); }
  }

  @keyframes lg-icon-sink {
    0%   { transform: scale(1.1) translateY(-1px); }
    100% { transform: scale(1)   translateY(0px); }
  }

  @keyframes lg-ripple {
    0%   { transform: scale(0);   opacity: 0.4; }
    100% { transform: scale(3.2); opacity: 0;   }
  }

  @keyframes lg-sheen {
    0%   { left: -100%; }
    100% { left:  200%; }
  }

  .lg-bar {
    position: relative;
    border-radius: 3rem;
    padding: 5px 6px;
    backdrop-filter: blur(80px) saturate(180%) brightness(110%);
    -webkit-backdrop-filter: blur(80px) saturate(180%) brightness(110%);
    transition: background 0.3s ease, border-color 0.3s ease;
    isolation: isolate;
  }

  .light .lg-bar {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.55);
    box-shadow:
      0 0 0 0.5px rgba(0,0,0,0.04),
      0 4px 24px rgba(0,0,0,0.07),
      inset 0 1.5px 0 rgba(255,255,255,0.90),
      inset 0 -1px 0 rgba(0,0,0,0.02);
  }

  :root:not(.light) .lg-bar {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.12);
    box-shadow:
      0 0 0 0.5px rgba(255,255,255,0.07),
      0 6px 32px rgba(0,0,0,0.50),
      inset 0 1px 0 rgba(255,255,255,0.20),
      inset 0 -1px 0 rgba(0,0,0,0.12);
  }

  .lg-glass-active.lg-bar::before {
    content: '';
    position: absolute;
    top: -0.5px; left: 8%; width: 84%; height: 1px;
    pointer-events: none;
    z-index: 20;
    border-radius: 50%;
  }
  .light .lg-glass-active.lg-bar::before {
    background: linear-gradient(90deg,
      transparent, rgba(255,255,255,1) 50%, transparent);
  }
  :root:not(.light) .lg-glass-active.lg-bar::before {
    background: linear-gradient(90deg,
      transparent, rgba(255,255,255,0.55) 50%, transparent);
  }

  .lg-bubble {
    position: absolute;
    top: -1px; bottom: -1px;
    border-radius: 2rem;
    pointer-events: none;
    z-index: 0;
    overflow: hidden;
    transition:
      left  0.48s cubic-bezier(0.34, 1.52, 0.64, 1),
      width 0.48s cubic-bezier(0.34, 1.52, 0.64, 1);
  }

  .light .lg-bubble {
    background: rgba(255,255,255,0.78);
    border: 1px solid rgba(255,255,255,0.95);
    box-shadow:
      inset 0 1.5px 0 rgba(255,255,255,1),
      inset 0 -1px 0 rgba(0,0,0,0.04),
      0 2px 14px rgba(0,0,0,0.08),
      0 0 0 0.5px rgba(0,0,0,0.03);
  }

  :root:not(.light) .lg-bubble {
    background: linear-gradient(
      150deg,
      rgba(255,255,255,0.20) 0%,
      rgba(160,190,255,0.14) 35%,
      rgba(200,155,255,0.12) 65%,
      rgba(255,255,255,0.18) 100%
    );
    border: 1px solid rgba(255,255,255,0.26);
    box-shadow:
      inset 0 1.5px 0 rgba(255,255,255,0.55),
      inset 0 -1px 0 rgba(0,0,0,0.14),
      inset 1px 0 rgba(255,255,255,0.18),
      inset -1px 0 rgba(255,255,255,0.10),
      0 4px 20px rgba(0,0,0,0.32),
      0 0 0 0.5px rgba(255,255,255,0.08);
  }

  .lg-glass-active .lg-bubble::before {
    content: '';
    position: absolute;
    top: 0; left: 8%; width: 84%; height: 1px;
    border-radius: 50%;
    pointer-events: none;
    z-index: 2;
  }
  .light .lg-glass-active .lg-bubble::before {
    background: linear-gradient(90deg,
      transparent, rgba(255,255,255,1) 50%, transparent);
  }
  :root:not(.light) .lg-glass-active .lg-bubble::before {
    background: linear-gradient(90deg,
      transparent 0%,
      rgba(140,180,255,0.95) 30%,
      rgba(210,160,255,0.95) 65%,
      transparent 100%
    );
  }

  .lg-bubble::after {
    content: '';
    position: absolute;
    top: 0; bottom: 0;
    width: 40%;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255,255,255,0.22),
      transparent
    );
    pointer-events: none;
    left: -100%;
    z-index: 3;
  }
  .lg-bubble.morphing::after {
    animation: lg-sheen 0.52s cubic-bezier(0.4,0,0.2,1) forwards;
  }
  .lg-bubble.morphing {
    animation: lg-squish 0.52s cubic-bezier(0.34,1.52,0.64,1) forwards;
  }

  .lg-tab-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 8px 0;
    flex: 1;
    min-width: 0;
    background: none;
    border: none;
    border-radius: 2rem;
    cursor: pointer;
    position: relative;
    z-index: 1;
    overflow: hidden;
    -webkit-tap-highlight-color: transparent;
    transition: transform 0.18s cubic-bezier(0.34,1.56,0.64,1);
  }
  .lg-tab-btn:active {
    transform: scale(0.86);
  }

  .lg-icon {
    height: 23px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* ── LIGHT inactive icon */
  .light .lg-icon.inactive {
    color: rgba(0,0,0,0.45);
    transform: scale(1) translateY(0px);
    filter: none;
    transition:
      color 0.22s ease,
      transform 0.35s cubic-bezier(0.34,1.56,0.64,1),
      filter 0.22s ease;
  }

  /* ── DARK inactive icon — WHITE */
  :root:not(.light) .lg-icon.inactive {
    color: rgba(255,255,255,0.80);
    transform: scale(1) translateY(0px);
    filter: none;
    transition:
      color 0.22s ease,
      transform 0.35s cubic-bezier(0.34,1.56,0.64,1),
      filter 0.22s ease;
  }

  /* ── LIGHT active icon */
  .light .lg-icon.active {
    color: rgba(0,95,210,1);
    transform: scale(1.10) translateY(-1px);
    filter: drop-shadow(0 2px 5px rgba(0,95,210,0.30));
    transition:
      color 0.22s ease,
      transform 0.42s cubic-bezier(0.34,1.56,0.64,1),
      filter 0.22s ease;
  }

  /* ── DARK active icon — pure white with glow */
  :root:not(.light) .lg-icon.active {
    color: rgba(255,255,255,1);
    transform: scale(1.10) translateY(-1px);
    filter: drop-shadow(0 0 10px rgba(180,200,255,0.65));
    transition:
      color 0.22s ease,
      transform 0.42s cubic-bezier(0.34,1.56,0.64,1),
      filter 0.22s ease;
  }

  .lg-icon.active.popping {
    animation: lg-icon-pop 0.45s cubic-bezier(0.34,1.56,0.64,1) forwards;
  }

  .lg-label {
    font-size: 9.5px;
    letter-spacing: 0.01em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 100%;
    text-align: center;
    padding: 0 2px;
    transition: color 0.22s ease, opacity 0.22s ease;
  }

  /* ── LIGHT labels */
  .light .lg-label.inactive {
    color: rgba(0,0,0,0.42);
    font-weight: 600;
  }
  .light .lg-label.active {
    color: rgba(0,95,210,1);
    font-weight: 700;
  }

  /* ── DARK labels — white and bold */
  :root:not(.light) .lg-label.inactive {
    color: rgba(255,255,255,0.80);
    font-weight: 600;
  }
  :root:not(.light) .lg-label.active {
    color: rgba(255,255,255,1);
    font-weight: 700;
  }

  .lg-ripple {
    position: absolute;
    border-radius: 50%;
    width: 36px; height: 36px;
    top: 50%; left: 50%;
    margin: -18px 0 0 -18px;
    pointer-events: none;
    z-index: 4;
    animation: lg-ripple 0.5s cubic-bezier(0.4,0,0.2,1) forwards;
  }
  .light .lg-ripple {
    background: rgba(0,80,200,0.15);
  }
  :root:not(.light) .lg-ripple {
    background: rgba(255,255,255,0.18);
  }
`;

function useInjectStyles(id: string, css: string) {
  useEffect(() => {
    let el = document.getElementById(id) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = id;
      document.head.appendChild(el);
    }
    el.textContent = css;
    return () => { document.getElementById(id)?.remove(); };
  }, [css]);
}

export const BottomNavigation = ({ activeTab, onTabChange }: BottomNavigationProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const bubbleRef    = useRef<HTMLDivElement>(null);
  const [pillStyle, setPillStyle]      = useState({ left: 0, width: 0 });
  const [morphing, setMorphing]        = useState(false);
  const [poppingTab, setPoppingTab]    = useState<string | null>(null);
  const [tabConfig, setTabConfigState] = useState<TabConfig[]>(getTabConfig());
  const [liquidGlassEnabled, setLiquidGlassEnabled] = useState(() => getLiquidGlassEnabled());

  useInjectStyles('lg-nav-styles', GLASS_STYLES);

  useEffect(() => {
    setTabConfigState(getTabConfig());
    const onChangeTabs = () => setTabConfigState(getTabConfig());
    const onChangeLiquid = (e: any) => setLiquidGlassEnabled(e.detail);
    window.addEventListener('splitmate_tab_config_changed', onChangeTabs);
    window.addEventListener('splitmate_liquid_glass_changed', onChangeLiquid);
    return () => {
      window.removeEventListener('splitmate_tab_config_changed', onChangeTabs);
      window.removeEventListener('splitmate_liquid_glass_changed', onChangeLiquid);
    };
  }, []);

  const navItems = useMemo(() => {
    const configMap = new Map(tabConfig.map(t => [t.id, t]));
    return tabConfig
      .filter(t => t.visible)
      .map(t => ALL_NAV_ITEMS.find(n => n.id === t.id))
      .filter(Boolean) as typeof ALL_NAV_ITEMS;
  }, [tabConfig]);

  const updatePill = useCallback(() => {
    if (!containerRef.current) return;
    const el = containerRef.current.querySelector(
      `[data-tab="${activeTab}"]`
    ) as HTMLElement;
    if (el) setPillStyle({ left: el.offsetLeft, width: el.offsetWidth });
  }, [activeTab]);

  useEffect(() => {
    const t = setTimeout(updatePill, 10);
    window.addEventListener('resize', updatePill);
    return () => { clearTimeout(t); window.removeEventListener('resize', updatePill); };
  }, [updatePill]);

  const handleTabChange = useCallback((tab: string) => {
    if (tab === activeTab) return;

    setMorphing(true);
    setTimeout(() => setMorphing(false), 540);

    if (liquidGlassEnabled) {
      setPoppingTab(tab);
      setTimeout(() => setPoppingTab(null), 460);
    }

    const btn = containerRef.current?.querySelector(
      `[data-tab="${tab}"]`
    ) as HTMLElement;
    if (btn && liquidGlassEnabled) {
      const r = document.createElement('div');
      r.className = 'lg-ripple';
      btn.appendChild(r);
      setTimeout(() => r.remove(), 520);
    }

    onTabChange(tab);
  }, [activeTab, onTabChange]);

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 flex justify-center pointer-events-none"
      style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}
    >
      <div className={`lg-bar pointer-events-auto mx-2 max-w-[440px] w-[calc(100%-1rem)] ${liquidGlassEnabled ? 'lg-glass-active' : ''}`}
        style={{
          background: liquidGlassEnabled ? undefined : 'hsl(var(--secondary) / 0.82)',
          border: liquidGlassEnabled ? undefined : '1px solid hsl(var(--border) / 0.2)',
          backdropFilter: liquidGlassEnabled ? undefined : 'blur(12px)',
          WebkitBackdropFilter: liquidGlassEnabled ? undefined : 'blur(12px)',
          boxShadow: liquidGlassEnabled ? undefined : '0 10px 30px -10px rgba(0,0,0,0.1)',
        }}
      >
        <div
          ref={containerRef}
          className="flex items-center justify-around relative px-[2px]"
        >
          <div
            ref={bubbleRef}
            className={`lg-bubble${morphing && liquidGlassEnabled ? ' morphing' : ''}`}
            style={{
              left:  pillStyle.left - 4,
              width: pillStyle.width + 8,
              transition: liquidGlassEnabled ? undefined : 'left 0.3s ease, width 0.3s ease',
              background: liquidGlassEnabled ? undefined : 'hsl(var(--foreground) / 0.12)',
              border: liquidGlassEnabled ? undefined : '1px solid hsl(var(--foreground) / 0.1)',
              boxShadow: liquidGlassEnabled ? undefined : 'none',
              backdropFilter: liquidGlassEnabled ? undefined : 'none',
              WebkitBackdropFilter: liquidGlassEnabled ? undefined : 'none',
            }}
          />

          {navItems.map((item) => {
            const Icon      = item.icon;
            const isActive  = activeTab === item.id;
            const isPopping = poppingTab === item.id;
            const shouldFillIcon = isActive && item.id !== 'accounts';

            return (
              <button
                key={item.id}
                data-tab={item.id}
                onClick={() => handleTabChange(item.id)}
                className="lg-tab-btn"
              >
                <div
                  className={[
                    'lg-icon',
                    isActive  ? 'active'   : 'inactive',
                    isActive && isPopping && liquidGlassEnabled ? 'popping' : '',
                  ].join(' ').trim()}
                  style={{
                    transition: liquidGlassEnabled ? undefined : 'color 0.22s ease, transform 0.2s ease, filter 0.22s ease'
                  }}
                >
                  {item.id === 'home' && isActive ? (
                    <svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                      <defs>
                        <mask id="home-door-mask">
                          <rect width="24" height="24" fill="white" />
                          <path
                            d="M11 17C11 16.4477 11.4477 16 12 16C12.5523 16 13 16.4477 13 17V22.5H11V17Z"
                            fill="black"
                          />
                        </mask>
                      </defs>
                      <path
                        d="M12.9265 1.45423C12.3934 1.01257 11.6067 1.01257 11.0736 1.45423L2.16456 8.83515C1.6705 9.24443 1.34009 9.8519 1.34009 10.495V20.5C1.34009 21.6046 2.23552 22.5 3.34009 22.5H8.34009C8.89237 22.5 9.34009 22.0523 9.34009 21.5V16C9.34009 14.8954 10.2355 14 11.3401 14H12.6599C13.7645 14 14.6599 14.8954 14.6599 16V21.5C14.6599 22.0523 15.1076 22.5 15.6599 22.5H20.6599C21.7645 22.5 22.6599 21.6046 22.6599 20.5V10.495C22.6599 9.8519 22.3295 9.24443 21.8354 8.83515L12.9265 1.45423Z"
                        fill="currentColor"
                        mask="url(#home-door-mask)"
                      />
                    </svg>
                  ) : item.id === 'links' && isActive ? (
                    <svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                      <path
                        d="M19 19H5V5H12V2H5C3.34315 2 2 3.34315 2 5V19C2 20.6569 3.34315 22 5 22H19C20.6569 22 22 20.6569 22 19V13H19V19Z"
                        fill="currentColor"
                      />
                      <path
                        d="M14 2V5H18.5L7.5 16L9.5 18L20.5 7V11.5H23V2H14Z"
                        fill="currentColor"
                      />
                    </svg>
                  ) : (
                    <Icon
                      size={22}
                      strokeWidth={isActive ? (item.id === 'accounts' ? 2.9 : 2.8) : 2.4}
                      fill={shouldFillIcon ? 'currentColor' : 'none'}
                    />
                  )}
                </div>

                <span 
                  className={`lg-label ${isActive ? 'active' : 'inactive'}`}
                  style={{
                    transition: liquidGlassEnabled ? undefined : 'transform 0.2s ease, opacity 0.2s ease, color 0.1s ease'
                  }}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};