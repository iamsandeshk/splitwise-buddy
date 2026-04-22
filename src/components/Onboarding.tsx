import { useState } from 'react';
import { useEffect } from 'react';
import { Wallet, Users, BookmarkPlus, BarChart3, ChevronRight, ChevronLeft, Sun, Moon, Monitor, Check, Plus, Home, User, ExternalLink, Settings, Tag, ArrowDownRight, ArrowUpRight, Folder, Pin, UserCircle2, MessageSquare } from 'lucide-react';
import { CURRENCIES, setCurrency, setOnboardingDone, saveAccountProfile, importData, type CurrencyInfo } from '@/lib/storage';
import { setStoredTheme, type ThemeMode } from '@/lib/theme';
import { signInWithGoogle, getGooglePhotoUrl } from '@/integrations/firebase/auth';
import { loadBackupForCurrentUser } from '@/integrations/firebase/backup';
import { useToast } from '@/hooks/use-toast';

interface OnboardingProps {
  onComplete: () => void;
}

/* ── Mini UI Preview Components ── */

function DashboardPreview() {
  return (
    <div className="w-full max-w-[280px] mx-auto space-y-2.5">
      {/* Balance card */}
      <div className="rounded-2xl p-4 text-left"
        style={{ background: 'hsl(var(--primary) / 0.08)', border: '1px solid hsl(var(--primary) / 0.12)' }}>
        <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest">Net Balance</p>
        <p className="text-2xl font-extrabold mt-1" style={{ color: 'hsl(var(--success))' }}>+₹2,450</p>
        <div className="flex gap-2 mt-2.5">
          <div className="flex-1 rounded-lg px-2.5 py-1.5" style={{ background: 'hsl(var(--success) / 0.1)' }}>
            <p className="text-[8px] text-muted-foreground">Incoming</p>
            <p className="text-[11px] font-bold" style={{ color: 'hsl(var(--success))' }}>₹3,200</p>
          </div>
          <div className="flex-1 rounded-lg px-2.5 py-1.5" style={{ background: 'hsl(var(--danger) / 0.1)' }}>
            <p className="text-[8px] text-muted-foreground">Outgoing</p>
            <p className="text-[11px] font-bold" style={{ color: 'hsl(var(--danger))' }}>₹750</p>
          </div>
        </div>
      </div>
      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl py-2.5 px-3 flex items-center gap-2"
          style={{ background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary-glow)))', color: 'white' }}>
          <Plus size={12} /> <span className="text-[10px] font-bold">Personal</span>
        </div>
        <div className="rounded-xl py-2.5 px-3 flex items-center gap-2"
          style={{ background: 'hsl(var(--card) / 0.9)', border: '1px solid hsl(var(--border) / 0.3)' }}>
          <Users size={12} className="text-primary" /> <span className="text-[10px] font-semibold">Shared</span>
        </div>
      </div>
    </div>
  );
}

function PersonalPreview() {
  const items = [
    { emoji: '🍕', name: 'Pizza Night', amount: '₹450', cat: 'Food & Dining' },
    { emoji: '🚗', name: 'Uber Ride', amount: '₹180', cat: 'Transportation' },
    { emoji: '🛍️', name: 'New Shoes', amount: '₹2,200', cat: 'Shopping' },
  ];
  return (
    <div className="w-full max-w-[280px] mx-auto space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl px-3.5 py-2.5"
          style={{ background: 'hsl(var(--card) / 0.8)', border: '1px solid hsl(var(--border) / 0.2)' }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
            style={{ background: 'hsl(var(--secondary) / 0.6)' }}>
            {item.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold truncate">{item.name}</p>
            <p className="text-[9px] text-muted-foreground">{item.cat}</p>
          </div>
          <p className="text-[11px] font-bold">{item.amount}</p>
        </div>
      ))}
      {/* Add button hint */}
      <div className="flex justify-center pt-1">
        <div className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary-glow)))', boxShadow: '0 4px 16px -4px hsl(var(--primary) / 0.5)' }}>
          <Plus size={16} color="white" />
        </div>
      </div>
    </div>
  );
}

function SharedPreview() {
  const people = [
    { name: 'Ajay', initial: 'A', amount: '+₹1,200', positive: true },
    { name: 'Priya', initial: 'P', amount: '-₹800', positive: false },
  ];
  return (
    <div className="w-full max-w-[280px] mx-auto space-y-2">
      {people.map((p, i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl px-3.5 py-2.5"
          style={{ background: 'hsl(var(--card) / 0.8)', border: '1px solid hsl(var(--border) / 0.2)' }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold"
            style={{
              background: p.positive ? 'hsl(var(--success) / 0.12)' : 'hsl(var(--danger) / 0.12)',
              color: p.positive ? 'hsl(var(--success))' : 'hsl(var(--danger))',
            }}>
            {p.initial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold">{p.name}</p>
            <p className="text-[9px] text-muted-foreground">{p.positive ? 'Owes you' : 'You owe'}</p>
          </div>
          <p className="text-[11px] font-bold" style={{ color: p.positive ? 'hsl(var(--success))' : 'hsl(var(--danger))' }}>
            {p.amount}
          </p>
          <div className="text-[8px] px-2 py-1 rounded-lg font-bold"
            style={{ background: 'hsl(var(--primary) / 0.12)', color: 'hsl(var(--primary))' }}>
            Settle
          </div>
        </div>
      ))}
    </div>
  );
}

function LinksPreview() {
  const links = [
    { name: 'Twitter', domain: 'twitter.com', icon: '𝕏' },
    { name: 'GitHub', domain: 'github.com', icon: '🐙' },
  ];
  return (
    <div className="w-full max-w-[280px] mx-auto space-y-2">
      {/* Group */}
      <div className="rounded-2xl p-3 flex items-center gap-3"
        style={{ background: 'hsl(var(--card) / 0.8)', border: '1px solid hsl(var(--border) / 0.2)' }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: 'hsl(210, 100%, 55% / 0.15)' }}>
          <Folder size={15} style={{ color: 'hsl(210, 100%, 55%)' }} />
        </div>
        <div className="flex-1">
          <p className="text-[11px] font-semibold">Work Tools</p>
          <p className="text-[9px] text-muted-foreground">3 links</p>
        </div>
        <Pin size={9} className="text-primary" />
      </div>
      {/* Links */}
      {links.map((l, i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl px-3.5 py-2.5"
          style={{ background: 'hsl(var(--card) / 0.8)', border: '1px solid hsl(var(--border) / 0.2)' }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm"
            style={{ background: 'hsl(var(--secondary) / 0.6)' }}>
            {l.icon}
          </div>
          <div className="flex-1">
            <p className="text-[11px] font-semibold">{l.name}</p>
            <p className="text-[9px] text-muted-foreground">{l.domain}</p>
          </div>
          <ExternalLink size={12} className="text-muted-foreground/40" />
        </div>
      ))}
    </div>
  );
}

function SmsPermissionPreview() {
  return (
    <div className="w-full max-w-[280px] mx-auto rounded-3xl p-4 text-left" style={{ background: 'hsl(var(--card) / 0.78)', border: '1px solid hsl(var(--border) / 0.2)' }}>
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))' }}>
          <MessageSquare size={18} />
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Android permission</p>
          <p className="text-sm font-bold">SMS capture stays on</p>
        </div>
      </div>

      <div className="mt-4 space-y-2 text-xs text-muted-foreground leading-relaxed">
        <p>SplitMate asks for READ_SMS only when you turn on SMS capture from SMS Transactions.</p>
        <p>Only financial transaction SMS are processed, and parsed results are stored in SMS Transactions for manual review.</p>
      </div>
    </div>
  );
}

const STEPS = [
  {
    icon: Wallet,
    color: 'hsl(var(--primary))',
    title: 'Welcome to SplitMate',
    subtitle: 'Your simple expense tracker',
    description: 'Track personal spending, split bills with friends, and save your favourite links — all in one place.',
    preview: DashboardPreview,
  },
  {
    icon: BarChart3,
    color: 'hsl(211, 100%, 58%)',
    title: 'Personal Expenses',
    subtitle: 'Know where your money goes',
    description: 'Add expenses, categorise them, and see beautiful charts of your spending patterns.',
    preview: PersonalPreview,
  },
  {
    icon: Users,
    color: 'hsl(270, 50%, 60%)',
    title: 'Split with Friends',
    subtitle: 'Never lose track of who owes what',
    description: 'Record shared expenses, track balances with each person, and settle up when ready.',
    preview: SharedPreview,
  },
  {
    icon: BookmarkPlus,
    color: 'hsl(var(--success))',
    title: 'Save Links',
    subtitle: 'Your personal bookmark manager',
    description: 'Save websites, organise them into groups, and access them anytime.',
    preview: LinksPreview,
  },
];

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [selectedTheme, setSelectedTheme] = useState<ThemeMode>('system');
  const [selectedCurrency, setSelectedCurrency] = useState<string>('INR');
  const { toast } = useToast();

  const isFeatureStep = step < STEPS.length;
  const isThemeStep = step === STEPS.length;
  const isCurrencyStep = step === STEPS.length + 1;
  const isPermissionStep = step === STEPS.length + 2;
  const isSignInStep = step === STEPS.length + 3;
  const totalSteps = STEPS.length + 4;

  const handleNext = () => {
    if (step < totalSteps - 1) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleFinish = () => {
    setStoredTheme(selectedTheme);
    setCurrency(selectedCurrency);
    setOnboardingDone();
    onComplete();
  };

  const handleThemeSelect = (mode: ThemeMode) => {
    setSelectedTheme(mode);
    setStoredTheme(mode);
  };

  const themes: { id: ThemeMode; label: string; icon: typeof Sun; desc: string }[] = [
    { id: 'light', label: 'Light', icon: Sun, desc: 'Clean & bright' },
    { id: 'dark', label: 'Dark', icon: Moon, desc: 'Easy on the eyes' },
    { id: 'system', label: 'System', icon: Monitor, desc: 'Match your device' },
  ];

  return (
    <div className="fixed inset-0 z-[9999] bg-background flex flex-col">
      {/* Progress dots */}
      <div className="flex justify-center gap-1.5 pt-12 pb-4">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className="h-1 rounded-full transition-all duration-400"
            style={{
              width: i === step ? '24px' : '6px',
              background: i === step
                ? 'hsl(var(--primary))'
                : i < step
                  ? 'hsl(var(--primary) / 0.4)'
                  : 'hsl(var(--border) / 0.5)',
            }}
          />
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 overflow-y-auto">
        {isFeatureStep && (() => {
          const s = STEPS[step];
          const Icon = s.icon;
          const Preview = s.preview;
          return (
            <div className="flex flex-col items-center text-center max-w-sm w-full">
              {/* Title + subtitle */}
              <div className="mb-5">
                <h1 className="text-2xl font-extrabold mb-1.5">{s.title}</h1>
                <p className="text-sm font-semibold text-primary">{s.subtitle}</p>
              </div>

              {/* Mini UI preview */}
              <div className="w-full mb-5">
                <Preview />
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed max-w-[260px]">
                {s.description}
              </p>
            </div>
          );
        })()}

        {isThemeStep && (
          <div className="flex flex-col items-center text-center max-w-sm w-full">
            <div className="relative mb-8">
              <div
                className="w-24 h-24 rounded-[2rem] flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, hsl(var(--foreground) / 0.1), hsl(var(--foreground) / 0.05))',
                  border: '1px solid hsl(var(--border) / 0.3)',
                }}
              >
                {selectedTheme === 'light' ? <Sun size={40} className="text-foreground" /> :
                 selectedTheme === 'dark' ? <Moon size={40} className="text-foreground" /> :
                 <Monitor size={40} className="text-foreground" />}
              </div>
            </div>

            <h1 className="text-2xl font-extrabold mb-2">Choose your look</h1>
            <p className="text-sm text-muted-foreground mb-8">Pick a theme that feels right</p>

            <div className="w-full space-y-3">
              {themes.map((t) => {
                const TIcon = t.icon;
                const active = selectedTheme === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => handleThemeSelect(t.id)}
                    className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-left transition-all duration-200"
                    style={{
                      background: active ? 'hsl(var(--primary) / 0.1)' : 'hsl(var(--card) / 0.7)',
                      border: `1.5px solid ${active ? 'hsl(var(--primary) / 0.4)' : 'hsl(var(--border) / 0.25)'}`,
                    }}
                  >
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{
                        background: active ? 'hsl(var(--primary) / 0.15)' : 'hsl(var(--secondary) / 0.6)',
                      }}
                    >
                      <TIcon size={18} className={active ? 'text-primary' : 'text-muted-foreground'} />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-sm">{t.label}</p>
                      <p className="text-[11px] text-muted-foreground">{t.desc}</p>
                    </div>
                    {active && (
                      <div className="w-6 h-6 rounded-full flex items-center justify-center"
                        style={{ background: 'hsl(var(--primary))' }}>
                        <Check size={14} color="white" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {isCurrencyStep && (
          <div className="flex flex-col items-center text-center max-w-sm w-full">
            <div className="relative mb-8">
              <div
                className="w-24 h-24 rounded-[2rem] flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, hsl(var(--success) / 0.15), hsl(var(--success) / 0.05))',
                  border: '1px solid hsl(var(--success) / 0.2)',
                }}
              >
                <span className="text-4xl font-bold" style={{ color: 'hsl(var(--success))' }}>
                  {CURRENCIES.find(c => c.code === selectedCurrency)?.symbol || '₹'}
                </span>
              </div>
            </div>

            <h1 className="text-2xl font-extrabold mb-2">Your currency</h1>
            <p className="text-sm text-muted-foreground mb-6">Choose your primary currency</p>

            <div className="w-full relative">
            <div className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none z-10" style={{ background: 'linear-gradient(to bottom, transparent, hsl(var(--background)))' }} />
            <div className="grid grid-cols-2 gap-2.5 max-h-[320px] overflow-y-auto pb-8">
              {CURRENCIES.map((cur) => {
                const active = selectedCurrency === cur.code;
                return (
                  <button
                    key={cur.code}
                    onClick={() => setSelectedCurrency(cur.code)}
                    className="flex items-center gap-3 px-4 py-3.5 rounded-2xl text-left transition-all duration-200"
                    style={{
                      background: active ? 'hsl(var(--primary) / 0.1)' : 'hsl(var(--card) / 0.7)',
                      border: `1.5px solid ${active ? 'hsl(var(--primary) / 0.4)' : 'hsl(var(--border) / 0.25)'}`,
                    }}
                  >
                    <span className="text-lg font-bold flex-shrink-0 w-7 text-center"
                      style={{ color: active ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }}>
                      {cur.symbol}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-xs">{cur.code}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{cur.name}</p>
                    </div>
                    {active && (
                      <Check size={14} className="text-primary flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
            </div>
          </div>
        )}

        {isPermissionStep && (
          <div className="flex flex-col items-center text-center max-w-sm w-full">
            <div className="relative mb-8">
              <div
                className="w-24 h-24 rounded-[2rem] flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, hsl(var(--primary) / 0.15), hsl(var(--primary) / 0.05))',
                  border: '1px solid hsl(var(--primary) / 0.2)',
                }}
              >
                <MessageSquare size={40} className="text-primary" />
              </div>
            </div>

            <h1 className="text-2xl font-extrabold mb-2">Enable SMS capture</h1>
            <p className="text-sm text-muted-foreground mb-6">We’ll ask Android for SMS access so transaction messages can be detected automatically.</p>

            <SmsPermissionPreview />
          </div>
        )}

        {isSignInStep && (
          <div className="flex flex-col items-center text-center max-w-sm w-full">
            <div className="relative mb-8">
              <div
                className="w-24 h-24 rounded-[2rem] flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, hsl(var(--primary) / 0.15), hsl(var(--primary) / 0.05))',
                  border: '1px solid hsl(var(--primary) / 0.2)',
                }}
              >
                <div className="relative">
                  <UserCircle2 size={42} className="text-primary" />
                  <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-background border-2 border-primary flex items-center justify-center">
                    <Check size={10} className="text-primary" />
                  </div>
                </div>
              </div>
            </div>

            <h1 className="text-2xl font-extrabold mb-2">Save your progress</h1>
            <p className="text-sm text-muted-foreground mb-10 leading-relaxed px-4">
              Sign in with your Google account to sync your data across devices and prevent data loss if you reinstall.
            </p>

            <div className="w-full space-y-4">
              <button
                onClick={async () => {
                  try {
                    const user = await signInWithGoogle();
                    if (user) {
                      const googleProvider = user.providerData.find((provider) => provider.providerId === 'google.com');
                      saveAccountProfile({
                        name: (user.displayName || googleProvider?.displayName || 'Guest').trim(),
                        email: (user.email || googleProvider?.email || '').trim(),
                        bio: '',
                        avatar: getGooglePhotoUrl(user) || googleProvider?.photoURL || undefined,
                      });
                      toast({
                        title: "Sign In Successful!",
                        description: `Welcome, ${user.displayName || 'Friend'}! You can restore cloud data later from Settings.`
                      });
                      handleFinish();
                    }
                  } catch (error: any) {
                    toast({
                      title: "Sign In Failed",
                      description: error.message || "Could not connect to Google.",
                      variant: "destructive"
                    });
                  }
                }}
                className="w-full h-14 rounded-2xl font-bold text-sm flex items-center justify-center gap-3 transition-all duration-200 active:scale-[0.98]"
                style={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border) / 0.3)',
                  color: 'hsl(var(--foreground))',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                }}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Sign in with Google
              </button>

              <button
                onClick={handleFinish}
                className="w-full py-4 text-xs text-muted-foreground font-bold uppercase tracking-widest hover:text-foreground transition-all duration-200"
              >
                Continue as Guest
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div className="flex-shrink-0 px-6 pb-16 pt-4">
        <div className="flex items-center justify-center max-w-sm mx-auto w-full gap-4">
          {/* Left Action: Skip or Back */}
          <div className="flex-1">
            {isFeatureStep ? (
              <button
                onClick={handleFinish}
                className="w-full h-[68px] rounded-[34px] font-black text-[15px] uppercase tracking-wider text-muted-foreground bg-secondary/80 border border-border/10 active:scale-[0.96] transition-all"
              >
                Skip
              </button>
            ) : (step > 0 && (
              <button
                onClick={handleBack}
                className="w-[68px] h-[68px] rounded-full flex items-center justify-center bg-secondary border border-border/10 active:scale-[0.9] transition-all"
              >
                <ChevronLeft size={28} className="text-muted-foreground" />
              </button>
            ))}
          </div>

          {/* Right Action: Next or Let's Go */}
          <div className={`${isFeatureStep || isThemeStep || isCurrencyStep || isPermissionStep ? 'flex-1' : 'hidden'}`}>
            {!isSignInStep && (
              <button
                onClick={handleNext}
                className="w-full h-[68px] rounded-[34px] font-black text-[15px] uppercase tracking-tight flex items-center justify-center transition-all duration-300 active:scale-[0.96]"
                style={{
                  background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary-glow)))',
                  color: 'white',
                  boxShadow: '0 12px 30px -10px hsl(var(--primary) / 0.6)',
                }}
              >
                <span>{step === 0 ? "Let's Go" : isCurrencyStep ? 'Setup' : 'Continue'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
