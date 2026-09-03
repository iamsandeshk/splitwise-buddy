import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  LayoutGrid,
  Link as LinkIcon,
  MessageCircle,
  RefreshCw,
  Shield,
  Sparkles,
  Star,
  Target,
  Users,
  WalletCards,
  Calendar,
  CloudUpload,
  Trash2,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { removeTestProAccess, useBilling } from '@/hooks/useBilling';
import { useProGate } from '@/hooks/useProGate';
import { isDevOverrideEmail, getProStatusCache } from '@/lib/proAccess';
import { getCurrentGoogleUser, signInWithGoogle } from '@/integrations/firebase/auth';
import { isAdminEmail } from '@/integrations/firebase/admin';
import { getAccountProfile } from '@/lib/storage';

const PRO_FEATURES = [
  { icon: Star, name: 'Ad-free Experience', desc: 'No more interruptions while managing your money.' },
  { icon: WalletCards, name: 'Unlimited Financial Accounts', desc: 'Create and manage unlimited bank, savings, and credit accounts.' },
  { icon: RefreshCw, name: 'Unlimited Recurring Payments', desc: 'Schedule and auto-post unlimited recurring income and expenses.' },
  { icon: Users, name: 'Unlimited Shared Members', desc: 'Add more than 3 persons in individual shared history.' },
  { icon: LayoutGrid, name: 'Multiple Groups', desc: 'Create more than 1 sharing group in the Shared tab.' },
  { icon: LinkIcon, name: 'Unlimited Links', desc: 'Save and organize more than 4 useful links.' },
  { icon: Target, name: 'Financial Freedom', desc: 'Manage more than 1 personal goal and loan.' },
  { icon: WalletCards, name: 'Subscription Mastery', desc: 'Track unlimited recurring subscriptions.' },

  { icon: LayoutGrid, name: 'Grouped Links', desc: 'Organize your links into multiple categories.' },
  { icon: RefreshCw, name: 'Friend Collaboration', desc: 'Real-time cloud sync with friends and group members.' },
  { icon: Shield, name: 'Advanced Data Security', desc: 'Unlimited daily backups and automated cloud sync.' },
  { icon: CloudUpload, name: 'Cloud Backup & Restore', desc: 'Securely backup and load your data across devices.' },
  { icon: MessageCircle, name: 'Priority Dev Support', desc: 'Get quick responses and direct support from the developer.' },
];

const PRO_FEATURE_BY_NAME = Object.fromEntries(
  PRO_FEATURES.map((feature) => [feature.name, feature]),
) as Record<string, (typeof PRO_FEATURES)[number]>;

const FEATURE_GROUPS: Array<{ title: string; items: string[]; cardTone: string }> = [
  {
    title: 'Core Experience',
    items: ['Ad-free Experience', 'Unlimited Financial Accounts', 'Financial Freedom'],
    cardTone: 'bg-card/90',
  },
  {
    title: 'Sharing & Collaboration',
    items: ['Unlimited Shared Members', 'Multiple Groups', 'Friend Collaboration'],
    cardTone: 'bg-card/80',
  },
  {
    title: 'Organization & Tools',
    items: ['Unlimited Recurring Payments', 'Unlimited Links', 'Grouped Links', 'Subscription Mastery'],
    cardTone: 'bg-card/80',
  },
  {
    title: 'Security & Support',
    items: ['Advanced Data Security', 'Cloud Backup & Restore', 'Priority Dev Support'],
    cardTone: 'bg-card/60',
  },
];

export default function ProUpgradeScreen() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isPro, loading: proLoading, subscription } = useProGate();
  const { products, purchaseLifetime, restorePurchases, loading, error } = useBilling();
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [refreshSpinning, setRefreshSpinning] = useState(false);
  const [removingTestPro, setRemovingTestPro] = useState(false);
  const isNative = Capacitor.isNativePlatform();
  const isEffectivePro = isPro;
  const isTestPro = Boolean(
    isEffectivePro && isAdminEmail(getCurrentGoogleUser()?.email),
  );

  const lifetimeProduct = useMemo(() => products.find((item) => item.plan === 'lifetime') || products[0], [products]);

  const handlePurchase = async () => {
    // Mandatory Google Sign-in before purchase
    if (!getCurrentGoogleUser()) {
      toast({
        title: 'Sign In Required',
        description: 'Please sign in with your Google account first to securely link your Lifetime Pro access.',
      });
      try {
        const signedInUser = await signInWithGoogle();
        if (!signedInUser) return;
      } catch (err) {
        toast({
          title: 'Sign In Failed',
          description: (err as Error).message || 'Google sign-in is required to purchase Pro.',
          variant: 'destructive',
        });
        return;
      }
    }

    setPurchasing(true);
    try {
      await purchaseLifetime();
      const cached = getProStatusCache();
      if (cached.isPro) {
        toast({
          title: 'Lifetime Pro Unlocked!',
          description: 'Your Lifetime Pro access is active. Thank you for supporting SplitMate!',
        });
      }
    } catch (purchaseError) {
      toast({
        title: 'Purchase failed',
        description: (purchaseError as Error).message || 'Could not start purchase flow.',
        variant: 'destructive',
      });
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const restored = await restorePurchases();
      toast({
        title: restored ? 'Lifetime Pro restored!' : 'No active purchase found',
        description: restored ? 'Your Lifetime Pro purchase was revalidated and synced.' : 'Google Play did not return an active Lifetime Pro purchase.',
      });
    } catch (restoreError) {
      toast({
        title: 'Restore failed',
        description: (restoreError as Error).message || 'Could not restore purchases.',
        variant: 'destructive',
      });
    } finally {
      setRestoring(false);
    }
  };


  const handleRefreshStore = async () => {
    setRefreshSpinning(true);
    window.setTimeout(() => setRefreshSpinning(false), 700);
    await handleRestore();
  };

  const handleRemoveTestPro = async () => {
    setRemovingTestPro(true);
    try {
      await removeTestProAccess();
      toast({ title: 'Test Pro removed', description: 'The test entitlement was removed from this account.' });
    } catch (removeError) {
      toast({
        title: 'Could not remove test Pro',
        description: (removeError as Error).message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setRemovingTestPro(false);
    }
  };

  const handleContactDev = () => {
    const mailto = 'mailto:try.sandeshk@gmail.com?subject=SplitMate%20Pro%20Support';
    if (Capacitor.isNativePlatform()) {
      window.location.href = mailto;
      return;
    }
    window.open(mailto, '_blank');
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-24 selection:bg-primary/20">
      <div className="relative min-h-[380px] pt-14 px-6 pb-12 overflow-hidden flex flex-col justify-end bg-gradient-to-b from-background via-background to-muted/20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.14),transparent_32%),radial-gradient(circle_at_left_20%_bottom_20%,hsl(var(--primary)/0.08),transparent_30%)] z-0" />
        <div className="absolute top-0 right-0 w-80 h-80 bg-primary/15 blur-[110px] -mr-40 -mt-40 animate-pulse" />
        <div className="absolute top-16 left-8 w-40 h-40 bg-cyan-500/10 blur-[80px] animate-pulse delay-700" />
        <div className="absolute bottom-16 right-16 w-24 h-24 rounded-full bg-foreground/5 blur-2xl" />

        <div className="relative z-30 mb-auto flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-2xl bg-card/80 border border-border flex items-center justify-center text-foreground active:scale-90 transition-all focus:outline-none backdrop-blur-md shadow-sm"
          >
            <ArrowLeft size={20} strokeWidth={2.5} />
          </button>

          {!isEffectivePro && (
            <button
              onClick={() => void handleRestore()}
              disabled={restoring || loading || proLoading}
              className="flex items-center gap-2 h-10 px-4 rounded-2xl bg-card/80 border border-border text-foreground text-xs font-bold tracking-wide active:scale-95 transition-all focus:outline-none backdrop-blur-md shadow-sm disabled:opacity-50"
            >
              {restoring ? <><RefreshCw size={14} className="animate-spin" /> Restoring…</> : <>Restore <RefreshCw size={14} /></>}
            </button>
          )}
        </div>

        <div className="relative z-20 mt-12 space-y-4 max-w-[320px]">
          <h1 className="text-5xl font-black italic tracking-tighter uppercase leading-[0.9] animate-in slide-in-from-bottom-8 duration-700 delay-100 text-foreground">
            Pro <span className="text-primary tracking-[-0.05em] block">Access.</span>
          </h1>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest leading-loose max-w-[280px] animate-in slide-in-from-bottom-10 duration-1000 delay-200">
            Unlock the full potential of your financial journey with SplitMate Lifetime Pro.
          </p>

          <div className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-card/80 border border-border text-[10px] font-black uppercase tracking-widest text-foreground/80 backdrop-blur-md animate-in fade-in duration-1000 delay-300 shadow-sm">
            <Sparkles size={12} className="text-primary" />
            {isPro ? 'Pro Active · Lifetime' : 'Pay Once · Forever Unlocked'}
          </div>
        </div>
      </div>

      <div className="px-5 -mt-4 relative z-20 space-y-10">
        {!isEffectivePro && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-2.5">
              <div
                className="relative w-full flex items-center justify-between gap-4 px-4 py-4 rounded-2xl border border-primary bg-primary/10 transition-all duration-200"
              >
                {/* 60% OFF badge */}
                <div className="absolute -top-3 right-3 flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary text-white text-[10px] font-black uppercase tracking-widest shadow-lg animate-pulse">
                  🔥 60% OFF · Limited Time
                </div>

                {/* Left: plan name + cadence */}
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm font-black uppercase tracking-widest leading-none text-primary">
                    Lifetime Access
                  </p>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide mt-1 font-semibold">
                    One time payment · Forever unlocked
                  </p>
                </div>

                {/* Right: price */}
                <div className="flex items-center gap-3 shrink-0">
                  {lifetimeProduct?.loading && !lifetimeProduct?.localizedPrice ? (
                    <div className="h-6 w-16 rounded-lg bg-muted/40 animate-pulse" />
                  ) : lifetimeProduct?.localizedPrice ? (
                    <p className="text-xl font-black italic tracking-tighter leading-none text-foreground">
                      {lifetimeProduct.localizedPrice}
                    </p>
                  ) : (
                    <p className="text-xs font-semibold text-muted-foreground">
                      Price unavailable
                    </p>
                  )}
                  <div className="w-5 h-5 rounded-full border-2 border-primary bg-primary flex items-center justify-center shrink-0">
                    <div className="w-2 h-2 rounded-full bg-white" />
                  </div>
                </div>
              </div>
            </div>

            {/* Single Continue button */}
            <Button
              type="button"
              variant="premium"
              className="w-full h-12 rounded-2xl text-sm font-bold tracking-wide shadow-lg"
              disabled={loading || lifetimeProduct?.loading || proLoading || purchasing || !isNative}
              onClick={() => void handlePurchase()}
            >
              {purchasing ? 'Processing...' : lifetimeProduct?.loading ? 'Loading price...' : 'Get Lifetime Pro'}
            </Button>
          </div>
        )}

        <div className="space-y-5">
          <div className="flex items-center gap-4 px-2">
            <h2 className="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Inside The Pro Pass</h2>
            <div className="h-[1px] flex-1 bg-gradient-to-r from-primary/30 to-transparent" />
          </div>

          <div className="space-y-5">
            {FEATURE_GROUPS.map((group) => (
              <div key={group.title} className="space-y-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-[0.25em] px-2">
                  {group.title}
                </p>

                <div className={cn(
                  'rounded-xl border border-border/10 overflow-hidden',
                  group.cardTone
                )}>
                  {group.items.map((featureName, index) => {
                    const feature = PRO_FEATURE_BY_NAME[featureName];
                    if (!feature) return null;

                    return (
                      <div
                        key={feature.name}
                        className={cn(
                          'flex gap-3 p-3.5',
                          index !== group.items.length - 1 && 'border-b border-border/10'
                        )}
                      >
                        <div className="mt-0.5 text-primary">
                          <feature.icon size={16} strokeWidth={2.3} />
                        </div>

                        <div className="space-y-0.5">
                          <p className="text-sm font-semibold text-foreground">
                            {feature.name}
                          </p>
                          <p className="text-[11px] text-muted-foreground leading-snug">
                            {feature.desc}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-card/80 border border-border shadow-sm space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center border",
                isEffectivePro ? "bg-amber-500/10 border-amber-500/20" : "bg-muted/40 border-border/10"
              )}>
                {isEffectivePro ? (
                  <img
                    src="/assets/pro-verified-gold.png"
                    alt="Pro verified"
                    className="w-6 h-6 object-contain"
                  />
                ) : (
                  <Shield size={20} className="text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-foreground">Your current status</h3>
                <p className={cn("text-xs truncate font-medium", isEffectivePro ? "text-primary" : "text-muted-foreground")}>
                  {isEffectivePro ? 'Pro Active · Lifetime' : 'Free Tier'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {!isEffectivePro && (
                <Button
                  type="button"
                  variant="secondary"
                  className="h-9 px-4 rounded-full text-xs font-medium"
                  onClick={() => void handleRestore()}
                  disabled={restoring || loading || proLoading}
                >
                  {restoring ? 'Restoring...' : 'Restore'}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                className="h-9 w-9 rounded-full border border-border/20"
                onClick={() => void handleRefreshStore()}
                disabled={restoring || loading || proLoading || !isNative}
                aria-label="Refresh store"
              >
                <RefreshCw size={16} className={refreshSpinning || restoring ? 'animate-spin' : ''} />
              </Button>
            </div>
          </div>

          {isEffectivePro && subscription && (
            <div className="mt-2 pt-3 border-t border-border/10 space-y-2">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Calendar size={12} />
                <span className="text-[10px] uppercase tracking-wider font-bold">Plan Details</span>
              </div>
              <p className="text-xs font-medium text-foreground">
                SplitMate Pro Lifetime Access {subscription.isTestPurchase ? '(License Test)' : '(One-time purchase)'}
              </p>
              {subscription.startDate && (
                <p className="text-[11px] text-muted-foreground">
                  Unlocked on {new Date(subscription.startDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                </p>
              )}
              {subscription.orderId && (
                <p className="text-[11px] text-muted-foreground break-all">
                  Google Play Order ID: {subscription.orderId}
                </p>
              )}
              {isTestPro && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 mt-2 rounded-full border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() => void handleRemoveTestPro()}
                  disabled={removingTestPro}
                >
                  <Trash2 size={14} />
                  {removingTestPro ? 'Removing...' : 'Remove Test Pro'}
                </Button>
              )}
            </div>
          )}

          {error && (
            <p className="text-[10px] font-bold text-destructive uppercase tracking-[0.18em] leading-relaxed">
              {error}
            </p>
          )}
        </div>

        <div className="pb-2 flex justify-center">
          <button
            type="button"
            onClick={handleContactDev}
            className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary/90 hover:text-primary active:scale-95 transition-all"
          >
            Contact Dev
          </button>
        </div>

      </div>
    </div>
  );
}
