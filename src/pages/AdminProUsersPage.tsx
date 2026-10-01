import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Crown,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldBan,
  Mail,
  AlertTriangle,
  Check,
  X,
  Copy,
  Lock,
  User,
  Key,
  Ban,
  Search,
  CheckCircle2,
  ChevronDown,
  Bell,
  Plus,
  Trash2,
  Send,
  Info,
  Zap,
  AlertCircle,
  // Icon picker icons
  Star,
  Rocket,
  Gift,
  Megaphone,
  Trophy,
  Heart,
  Sparkles,
  ShoppingCart,
  CreditCard,
  Download,
  Globe,
  MessageCircle,
  Flame,
  Package,
  type LucideIcon,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  fetchAllProUsers,
  revokeProForUser,
  fetchBannedUsers,
  banUser,
  unbanUser,
  verifyAdminPasswordWithFirebase,
  type ProUserEntry,
  type BannedUserEntry,
} from '@/integrations/firebase/admin';
import {
  fetchAllNotifications,
  pushNotification,
  deleteNotification,
  type AppNotification,
} from '@/integrations/firebase/notifications';
import { getCurrentGoogleUser } from '@/integrations/firebase/auth';
import { clearProStatusCache } from '@/lib/proAccess';

// 20 icon options for the notification icon picker
const ICON_PICKER_OPTIONS: { name: string; icon: LucideIcon; label: string }[] = [
  { name: 'Bell',          icon: Bell,          label: 'Bell'      },
  { name: 'Star',          icon: Star,          label: 'Star'      },
  { name: 'Rocket',        icon: Rocket,        label: 'Rocket'    },
  { name: 'Gift',          icon: Gift,          label: 'Gift'      },
  { name: 'Zap',           icon: Zap,           label: 'Zap'       },
  { name: 'CheckCircle2',  icon: CheckCircle2,  label: 'Check'     },
  { name: 'AlertCircle',   icon: AlertCircle,   label: 'Alert'     },
  { name: 'Info',          icon: Info,          label: 'Info'      },
  { name: 'Megaphone',     icon: Megaphone,     label: 'Announce'  },
  { name: 'Trophy',        icon: Trophy,        label: 'Trophy'    },
  { name: 'Heart',         icon: Heart,         label: 'Heart'     },
  { name: 'Sparkles',      icon: Sparkles,      label: 'Sparkle'   },
  { name: 'ShoppingCart',  icon: ShoppingCart,  label: 'Shop'      },
  { name: 'CreditCard',    icon: CreditCard,    label: 'Payment'   },
  { name: 'Shield',        icon: Shield,        label: 'Shield'    },
  { name: 'Download',      icon: Download,      label: 'Download'  },
  { name: 'Globe',         icon: Globe,         label: 'Global'    },
  { name: 'MessageCircle', icon: MessageCircle, label: 'Message'   },
  { name: 'Flame',         icon: Flame,         label: 'Hot'       },
  { name: 'Package',       icon: Package,       label: 'Package'   },
];

// Custom type config for icon picker accent colours
const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  info:    { label: 'Info',    color: 'text-blue-400',    bg: 'bg-blue-500/10 border-blue-500/30'    },
  warning: { label: 'Warning', color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/30'  },
  success: { label: 'Success', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' },
  promo:   { label: 'Promo',   color: 'text-primary',     bg: 'bg-primary/10 border-primary/30'      },
};

export default function AdminProUsersPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'pro' | 'banned' | 'notifications'>('pro');
  const [users, setUsers] = useState<ProUserEntry[]>([]);
  const [bannedUsers, setBannedUsers] = useState<BannedUserEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [revokingUid, setRevokingUid] = useState<string | null>(null);
  const [confirmRevokeUid, setConfirmRevokeUid] = useState<string | null>(null);
  const [unbanningId, setUnbanningId] = useState<string | null>(null);

  // Ban User modal
  const [showBanModal, setShowBanModal] = useState(false);
  const [banIdentifier, setBanIdentifier] = useState('');
  const [banReason, setBanReason] = useState('');
  const [isBanning, setIsBanning] = useState(false);

  const [refreshing, setRefreshing] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [isVerifyingPassword, setIsVerifyingPassword] = useState(false);
  const [hasAdminAccess, setHasAdminAccess] = useState(false);
  const [showInactiveUsers, setShowInactiveUsers] = useState(false);

  // Notifications state
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [deletingNotifId, setDeletingNotifId] = useState<string | null>(null);
  const [showPushForm, setShowPushForm] = useState(false);
  const [pushTitle, setPushTitle] = useState('');
  const [pushBody, setPushBody] = useState('');
  const [pushEmoji, setPushEmoji] = useState('');
  const [pushType, setPushType] = useState<'info' | 'warning' | 'success' | 'promo'>('info');
  const [pushLink, setPushLink] = useState('');
  const [isPushing, setIsPushing] = useState(false);

  // Icon picker state
  const [showIconPicker, setShowIconPicker] = useState(false);

  // Notification action sheet
  const [selectedNotif, setSelectedNotif] = useState<AppNotification | null>(null);
  const [isSendingAgain, setIsSendingAgain] = useState(false);

  const currentUser = getCurrentGoogleUser();

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [proList, banList] = await Promise.all([
        fetchAllProUsers(),
        fetchBannedUsers(),
      ]);

      // Sort Pro users: active first, then by startDate descending
      proList.sort((a, b) => {
        if (a.isPro && !a.isExpired && (!b.isPro || b.isExpired)) return -1;
        if (b.isPro && !b.isExpired && (!a.isPro || a.isExpired)) return 1;
        const dateA = a.startDate ? new Date(a.startDate).getTime() : 0;
        const dateB = b.startDate ? new Date(b.startDate).getTime() : 0;
        return dateB - dateA;
      });

      setUsers(proList);
      setBannedUsers(banList);
    } catch (err) {
      setError((err as Error).message || 'Failed to load admin data.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    setNotifLoading(true);
    try {
      const list = await fetchAllNotifications();
      setNotifications(list);
    } catch (err) {
      toast({ title: 'Error', description: (err as Error).message || 'Failed to load notifications.', variant: 'destructive' });
    } finally {
      setNotifLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (hasAdminAccess) {
      void loadData();
      void loadNotifications();
    } else {
      setLoading(false);
    }
  }, [hasAdminAccess, loadData, loadNotifications]);

  const handlePasswordUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifyingPassword(true);
    setPasswordError(false);

    try {
      const isValid = await verifyAdminPasswordWithFirebase(passwordInput, currentUser?.email);
      if (isValid) {
        setHasAdminAccess(true);
        setPasswordError(false);
        setLoading(true);
        toast({ title: 'Admin Unlocked', description: 'Welcome to SplitMate Admin Panel.' });
      } else {
        setPasswordError(true);
        toast({ title: 'Access Denied', description: 'Incorrect admin password.', variant: 'destructive' });
      }
    } catch (err) {
      setPasswordError(true);
      toast({ title: 'Verification Error', description: (err as Error).message || 'Could not verify password with Firebase.', variant: 'destructive' });
    } finally {
      setIsVerifyingPassword(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    if (activeTab === 'notifications') {
      await loadNotifications();
    } else {
      await loadData();
    }
    setRefreshing(false);
    toast({ title: 'Refreshed', description: 'Admin data updated.' });
  };

  const handleBanUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const identifier = banIdentifier.trim().toLowerCase();
    if (!identifier) {
      toast({ title: 'Invalid Identifier', description: 'Please enter a Gmail ID or User UID.', variant: 'destructive' });
      return;
    }

    setIsBanning(true);
    try {
      await banUser(identifier, banReason.trim());
      toast({ title: 'User Banned 🚫', description: `${identifier} has been added to the ban list and Pro revoked.` });
      setBanIdentifier('');
      setBanReason('');
      setShowBanModal(false);
      await loadData();
    } catch (err) {
      toast({ title: 'Ban Failed', description: (err as Error).message || 'Could not ban user.', variant: 'destructive' });
    } finally {
      setIsBanning(false);
    }
  };

  const handleUnbanUser = async (id: string) => {
    setUnbanningId(id);
    try {
      await unbanUser(id);
      setBannedUsers(prev => prev.filter(u => u.id !== id && u.identifier !== id));
      toast({ title: 'User Unbanned', description: `${id} has been removed from the ban list.` });
    } catch (err) {
      toast({ title: 'Unban Failed', description: (err as Error).message || 'Could not unban user.', variant: 'destructive' });
    } finally {
      setUnbanningId(null);
    }
  };

  const handleRevoke = async (uid: string) => {
    setRevokingUid(uid);
    try {
      const target = users.find((user) => user.uid === uid);
      await revokeProForUser(uid, target?.email);

      const currentGoogleUser = getCurrentGoogleUser();
      if (currentGoogleUser?.uid === uid || currentGoogleUser?.email === uid) {
        clearProStatusCache();
        localStorage.removeItem('splitmate_pro_override');
      }

      // Update local state
      setUsers(prev =>
        prev.map(u => u.uid === uid ? { ...u, isPro: false, isExpired: true, subscriptionState: 'expired' } : u)
      );
      setConfirmRevokeUid(null);
      toast({ title: 'Pro Revoked', description: `Pro access revoked for user ${uid.slice(0, 8)}...` });
    } catch (err) {
      toast({
        title: 'Revoke Failed',
        description: (err as Error).message || 'Could not revoke Pro.',
        variant: 'destructive',
      });
    } finally {
      setRevokingUid(null);
    }
  };

  const handleSendRevocationEmail = (user: ProUserEntry) => {
    const userEmail = user.email || '';
    const subject = encodeURIComponent('SplitMate Pro – Purchase Verification Notice');
    const body = encodeURIComponent(
`Dear ${user.name || 'User'},

We noticed that your SplitMate Pro purchase (Order ID: ${user.orderId || user.purchaseToken || 'N/A'}) could not be verified through Google Play.

Your Pro access has been revoked as the payment could not be confirmed. This may happen due to:
• Payment refund or chargeback
• Modified/tampered APK installation
• Unauthorized purchase method

If you believe this is an error, please reply with your Google Play order receipt screenshot (GPA Order ID).

Best regards,
SplitMate Team
try.sandeshk@gmail.com`
    );

    const mailto = `mailto:${userEmail}?subject=${subject}&body=${body}`;
    if (Capacitor.isNativePlatform()) {
      window.location.href = mailto;
    } else {
      window.open(mailto, '_blank');
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: 'Copied', description: `${label} copied to clipboard.` });
    }).catch(() => {});
  };

  // ── Notification handlers ──────────────────────────────────────────────────
  const handlePushNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pushTitle.trim() || !pushBody.trim()) {
      toast({ title: 'Required fields missing', description: 'Title and body are required.', variant: 'destructive' });
      return;
    }
    setIsPushing(true);
    try {
      await pushNotification({ title: pushTitle, body: pushBody, emoji: pushEmoji || undefined, type: pushType, link: pushLink || undefined });
      toast({ title: '✅ Notification Pushed!', description: 'It is now live for all users.' });
      setPushTitle('');
      setPushBody('');
      setPushEmoji('');
      setPushLink('');
      setPushType('info');
      setShowPushForm(false);
      await loadNotifications();
    } catch (err) {
      toast({ title: 'Push Failed', description: (err as Error).message || 'Could not push notification.', variant: 'destructive' });
    } finally {
      setIsPushing(false);
    }
  };

  const handleDeleteNotification = async (id: string) => {
    setDeletingNotifId(id);
    try {
      await deleteNotification(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
      toast({ title: 'Notification Deleted', description: 'Removed from Firestore.' });
    } catch (err) {
      toast({ title: 'Delete Failed', description: (err as Error).message || 'Could not delete.', variant: 'destructive' });
    } finally {
      setDeletingNotifId(null);
      setSelectedNotif(null);
    }
  };

  const handleSendAgain = async (n: AppNotification) => {
    setIsSendingAgain(true);
    try {
      await pushNotification({
        title: n.title,
        body: n.body,
        emoji: n.emoji,
        type: n.type,
        link: n.link,
      });
      toast({ title: '✅ Re-sent!', description: 'Notification pushed again to all users.' });
      setSelectedNotif(null);
      await loadNotifications();
    } catch (err) {
      toast({ title: 'Send Failed', description: (err as Error).message || 'Could not push.', variant: 'destructive' });
    } finally {
      setIsSendingAgain(false);
    }
  };

  const handleEditNotif = (n: AppNotification) => {
    setPushTitle(n.title);
    setPushBody(n.body);
    setPushEmoji(n.emoji || '');
    setPushType(n.type || 'info');
    setPushLink(n.link || '');
    setShowPushForm(true);
    setSelectedNotif(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  function notifTypeIcon(type?: string) {
    if (type === 'warning') return <AlertCircle size={14} className="text-amber-400" />;
    if (type === 'success') return <CheckCircle2 size={14} className="text-emerald-400" />;
    if (type === 'promo') return <Zap size={14} className="text-primary" />;
    return <Info size={14} className="text-blue-400" />;
  }


  // Password Prompt Screen
  if (!hasAdminAccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-card rounded-3xl border border-border/40 p-6 space-y-6 shadow-2xl">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-3">
              <Shield size={28} className="text-amber-500" />
            </div>
            <h1 className="text-xl font-black uppercase tracking-tight text-foreground">Admin Verification</h1>
            <p className="text-xs text-muted-foreground">Enter admin password verified via Firebase Firestore.</p>
          </div>

          <form onSubmit={handlePasswordUnlock} className="space-y-4">
            <div className="space-y-1.5">
              <div className="relative">
                <Key size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder="Enter Admin Password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className={cn("pl-10 h-12 rounded-xl bg-muted/40", passwordError && "border-destructive")}
                  autoFocus
                />
              </div>
              {passwordError && (
                <p className="text-[11px] text-destructive font-medium pl-1">Incorrect admin password.</p>
              )}
            </div>

            <Button
              type="submit"
              variant="default"
              className="w-full h-12 rounded-xl font-bold bg-amber-500 hover:bg-amber-600 text-black"
              disabled={isVerifyingPassword}
            >
              {isVerifyingPassword ? (
                <>
                  <RefreshCw size={14} className="animate-spin mr-2" />
                  Verifying with Firebase...
                </>
              ) : (
                'Unlock Admin Panel'
              )}
            </Button>
          </form>

          <Button variant="ghost" className="w-full text-xs text-muted-foreground" onClick={() => navigate(-1)}>
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  // Filtered lists
  const query = searchQuery.trim().toLowerCase();
  const filteredUsers = users.filter(u =>
    !query ||
    u.name?.toLowerCase().includes(query) ||
    u.email?.toLowerCase().includes(query) ||
    u.orderId?.toLowerCase().includes(query) ||
    u.uid?.toLowerCase().includes(query)
  );

  const activeFilteredUsers = filteredUsers.filter(u => u.isPro && !u.isExpired);
  const inactiveFilteredUsers = filteredUsers.filter(u => !u.isPro || u.isExpired);

  const filteredBanned = bannedUsers.filter(b =>
    !query ||
    b.identifier?.toLowerCase().includes(query) ||
    b.email?.toLowerCase().includes(query) ||
    b.uid?.toLowerCase().includes(query) ||
    b.reason?.toLowerCase().includes(query)
  );

  const activeProCount = users.filter(u => u.isPro && !u.isExpired).length;

  return (
    <div className="min-h-screen bg-background text-foreground pb-24 selection:bg-primary/20">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border/40 px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-xl bg-card border border-border/40 flex items-center justify-center text-foreground active:scale-90 transition-all shadow-sm"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-base font-black uppercase tracking-tight text-foreground flex items-center gap-2">
              Admin Panel
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                PRO & BAN
              </span>
            </h1>
            <p className="text-[11px] text-muted-foreground">
              {activeProCount} Active Pro · {bannedUsers.length} Banned · {notifications.length} Notifs
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="w-9 h-9 rounded-xl bg-card border border-border/40 flex items-center justify-center text-foreground active:scale-90 transition-all shadow-sm"
            title="Refresh list"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="p-4 max-w-2xl mx-auto space-y-4">
        {/* Action Bar - only show ban button when not on notifications tab */}
        {activeTab !== 'notifications' && (
        <div>
          <Button
            onClick={() => setShowBanModal(true)}
            variant="outline"
            className="w-full h-11 rounded-2xl font-bold text-xs border-destructive/40 text-destructive hover:bg-destructive/10 flex items-center justify-center gap-2"
          >
            <ShieldBan size={16} />
            Ban User
          </Button>
        </div>
        )}

        {/* Tab Switcher */}
        <div className="flex rounded-2xl bg-muted/40 p-1 border border-border/20">
          <button
            onClick={() => setActiveTab('pro')}
            className={cn(
              'flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5',
              activeTab === 'pro'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Crown size={14} className={activeTab === 'pro' ? 'text-amber-500' : ''} />
            Pro ({users.length})
          </button>
          <button
            onClick={() => setActiveTab('banned')}
            className={cn(
              'flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5',
              activeTab === 'banned'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Ban size={14} className={activeTab === 'banned' ? 'text-destructive' : ''} />
            Banned ({bannedUsers.length})
          </button>
          <button
            onClick={() => setActiveTab('notifications')}
            className={cn(
              'flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5',
              activeTab === 'notifications'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Bell size={14} className={activeTab === 'notifications' ? 'text-blue-400' : ''} />
            Notifs ({notifications.length})
          </button>
        </div>

        {/* Search - only on pro/banned tabs */}
        {activeTab !== 'notifications' && (
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={activeTab === 'pro' ? "Search by name, Gmail, Order ID..." : "Search banned user or reason..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-11 rounded-xl bg-card border-border/40 text-xs"
          />
        </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="py-16 text-center space-y-3">
            <RefreshCw size={24} className="animate-spin text-amber-500 mx-auto" />
            <p className="text-xs text-muted-foreground">Loading admin records from Firebase...</p>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/20 text-center space-y-2">
            <AlertTriangle size={20} className="text-destructive mx-auto" />
            <p className="text-xs font-bold text-destructive">{error}</p>
            <Button size="sm" variant="outline" onClick={handleRefresh} className="text-xs">Retry</Button>
          </div>
        )}

        {/* PRO USERS TAB */}
        {activeTab === 'pro' && !loading && !error && (
          <div className="space-y-3">
            {activeFilteredUsers.length === 0 && inactiveFilteredUsers.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-xs">
                No Pro subscription records found.
              </div>
            ) : (
              <>
                {/* Active Pro Users */}
                {activeFilteredUsers.length === 0 ? (
                  <div className="py-6 text-center text-muted-foreground text-xs bg-card/40 rounded-2xl border border-border/20">
                    No active Lifetime Pro subscribers found.
                  </div>
                ) : (
                  activeFilteredUsers.map((user) => {
                    const isActive = user.isPro && !user.isExpired;
                    const isConfirming = confirmRevokeUid === user.uid;

                    return (
                      <div
                        key={user.uid}
                        className={cn(
                          'rounded-2xl border overflow-hidden transition-all bg-card',
                          isActive ? 'border-emerald-500/20' : 'border-border/30 opacity-75'
                        )}
                      >
                        <div className="p-4 space-y-3">
                          {/* User Header */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={cn(
                                'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                                isActive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted/40 text-muted-foreground'
                              )}>
                                <Crown size={18} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-black text-foreground truncate">
                                  {user.name || 'User'}
                                </p>
                                <p className="text-xs text-muted-foreground font-medium truncate flex items-center gap-1">
                                  <Mail size={11} className="shrink-0" />
                                  {user.email || 'No Gmail Linked'}
                                </p>
                              </div>
                            </div>

                            <div className={cn(
                              'px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0',
                              isActive
                                ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                                : 'bg-red-500/10 text-red-500 border border-red-500/20'
                            )}>
                              {isActive ? 'Lifetime Pro' : 'Revoked / Expired'}
                            </div>
                          </div>

                          {/* Details Grid */}
                          <div className="grid grid-cols-2 gap-x-4 gap-y-2 p-3 rounded-xl bg-muted/20 text-[11px]">
                            <div>
                              <span className="text-muted-foreground block text-[10px] uppercase font-bold">User UID</span>
                              <span className="font-mono text-foreground truncate block">{user.uid.slice(0, 16)}...</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground block text-[10px] uppercase font-bold">Unlocked On</span>
                              <span className="font-semibold text-foreground">
                                {user.startDate ? new Date(user.startDate).toLocaleDateString() : '—'}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground block text-[10px] uppercase font-bold">Plan / Type</span>
                              <span className="font-semibold text-foreground capitalize">{user.purchaseType || user.plan}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground block text-[10px] uppercase font-bold">Test Account</span>
                              <span className={cn('font-bold', user.isTestPurchase ? 'text-amber-500' : 'text-foreground')}>
                                {user.isTestPurchase ? 'Yes (License Test)' : 'No (Real User)'}
                              </span>
                            </div>
                          </div>

                          {/* Order ID */}
                          {user.orderId && (
                            <button
                              onClick={() => copyToClipboard(user.orderId, 'Google Play Order ID')}
                              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-muted/30 border border-border/20 text-left group active:scale-[0.98] transition-all"
                            >
                              <Copy size={13} className="text-muted-foreground shrink-0 group-hover:text-primary" />
                              <div className="min-w-0 flex-1">
                                <p className="text-[10px] text-muted-foreground font-black uppercase tracking-wider">Play Store Order ID</p>
                                <p className="text-xs font-mono font-semibold text-foreground truncate">{user.orderId}</p>
                              </div>
                            </button>
                          )}

                          {/* Actions */}
                          {isActive && !isConfirming && (
                            <div className="flex gap-2 pt-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 h-9 rounded-xl text-[11px] font-bold border-destructive/30 text-destructive hover:bg-destructive/10"
                                onClick={() => setConfirmRevokeUid(user.uid)}
                              >
                                <ShieldAlert size={13} className="mr-1.5" />
                                Revoke Pro
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-9 rounded-xl text-[11px] font-bold border-destructive/30 text-destructive hover:bg-destructive/10"
                                onClick={() => {
                                  setBanIdentifier(user.email || user.uid);
                                  setShowBanModal(true);
                                }}
                              >
                                <Ban size={13} className="mr-1" />
                                Ban
                              </Button>
                              {user.email && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-9 rounded-xl text-[11px] font-bold"
                                  onClick={() => handleSendRevocationEmail(user)}
                                >
                                  <Mail size={13} className="mr-1.5" />
                                  Email
                                </Button>
                              )}
                            </div>
                          )}

                          {/* Confirm Revoke Dialog */}
                          {isConfirming && (
                            <div className="rounded-xl bg-destructive/5 border border-destructive/20 p-3 space-y-3">
                              <div className="flex items-center gap-2">
                                <AlertTriangle size={14} className="text-destructive" />
                                <p className="text-xs font-bold text-destructive">Confirm Revoke Pro?</p>
                              </div>
                              <p className="text-[11px] text-muted-foreground">
                                This will immediately remove Pro access for this user in Firebase and app cache.
                              </p>
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="flex-1 h-8 rounded-lg text-[11px]"
                                  onClick={() => setConfirmRevokeUid(null)}
                                  disabled={revokingUid === user.uid}
                                >
                                  <X size={12} className="mr-1" /> Cancel
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  className="flex-1 h-8 rounded-lg text-[11px] font-bold"
                                  onClick={() => handleRevoke(user.uid)}
                                  disabled={revokingUid === user.uid}
                                >
                                  {revokingUid === user.uid ? (
                                    <RefreshCw size={12} className="animate-spin mr-1" />
                                  ) : (
                                    <Check size={12} className="mr-1" />
                                  )}
                                  Confirm Revoke
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}

                {/* Collapsible Revoked / Inactive Users */}
                {inactiveFilteredUsers.length > 0 && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setShowInactiveUsers(!showInactiveUsers)}
                      className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-card border border-border/30 hover:bg-muted/20 active:scale-[0.99] transition-all text-left group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500 shrink-0">
                          <Ban size={15} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-foreground">
                            Revoked / Expired ({inactiveFilteredUsers.length})
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {showInactiveUsers ? 'Tap to hide past entries' : 'Tap to expand past or revoked records'}
                          </p>
                        </div>
                      </div>
                      <ChevronDown
                        size={16}
                        className={cn(
                          'text-muted-foreground transition-transform duration-200 shrink-0',
                          showInactiveUsers && 'rotate-180 text-foreground'
                        )}
                      />
                    </button>

                    {showInactiveUsers && (
                      <div className="mt-3 space-y-3">
                        {inactiveFilteredUsers.map((user) => {
                          const isActive = user.isPro && !user.isExpired;
                          const isConfirming = confirmRevokeUid === user.uid;

                          return (
                            <div
                              key={user.uid}
                              className={cn(
                                'rounded-2xl border overflow-hidden transition-all bg-card',
                                isActive ? 'border-emerald-500/20' : 'border-border/30 opacity-75'
                              )}
                            >
                              <div className="p-4 space-y-3">
                                {/* User Header */}
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <div className={cn(
                                      'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                                      isActive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted/40 text-muted-foreground'
                                    )}>
                                      <Crown size={18} />
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-sm font-black text-foreground truncate">
                                        {user.name || 'User'}
                                      </p>
                                      <p className="text-xs text-muted-foreground font-medium truncate flex items-center gap-1">
                                        <Mail size={11} className="shrink-0" />
                                        {user.email || 'No Gmail Linked'}
                                      </p>
                                    </div>
                                  </div>

                                  <div className={cn(
                                    'px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0',
                                    isActive
                                      ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                                      : 'bg-red-500/10 text-red-500 border border-red-500/20'
                                  )}>
                                    {isActive ? 'Lifetime Pro' : 'Revoked / Expired'}
                                  </div>
                                </div>

                                {/* Details Grid */}
                                <div className="grid grid-cols-2 gap-x-4 gap-y-2 p-3 rounded-xl bg-muted/20 text-[11px]">
                                  <div>
                                    <span className="text-muted-foreground block text-[10px] uppercase font-bold">User UID</span>
                                    <span className="font-mono text-foreground truncate block">{user.uid.slice(0, 16)}...</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground block text-[10px] uppercase font-bold">Unlocked On</span>
                                    <span className="font-semibold text-foreground">
                                      {user.startDate ? new Date(user.startDate).toLocaleDateString() : '—'}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground block text-[10px] uppercase font-bold">Plan / Type</span>
                                    <span className="font-semibold text-foreground capitalize">{user.purchaseType || user.plan}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground block text-[10px] uppercase font-bold">Test Account</span>
                                    <span className={cn('font-bold', user.isTestPurchase ? 'text-amber-500' : 'text-foreground')}>
                                      {user.isTestPurchase ? 'Yes (License Test)' : 'No (Real User)'}
                                    </span>
                                  </div>
                                </div>

                                {/* Order ID */}
                                {user.orderId && (
                                  <button
                                    onClick={() => copyToClipboard(user.orderId, 'Google Play Order ID')}
                                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-muted/30 border border-border/20 text-left group active:scale-[0.98] transition-all"
                                  >
                                    <Copy size={13} className="text-muted-foreground shrink-0 group-hover:text-primary" />
                                    <div className="min-w-0 flex-1">
                                      <p className="text-[10px] text-muted-foreground font-black uppercase tracking-wider">Play Store Order ID</p>
                                      <p className="text-xs font-mono font-semibold text-foreground truncate">{user.orderId}</p>
                                    </div>
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* BANNED USERS TAB */}
        {activeTab === 'banned' && !loading && !error && (
          <div className="space-y-3">
            {filteredBanned.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-xs">
                No banned users found.
              </div>
            ) : (
              filteredBanned.map((banned) => (
                <div
                  key={banned.id}
                  className="p-4 rounded-2xl bg-card border border-destructive/20 space-y-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
                        <Ban size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-black text-foreground truncate">
                          {banned.identifier}
                        </p>
                        <p className="text-xs text-destructive font-medium truncate">
                          {banned.reason || 'App modification / violation'}
                        </p>
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-xl text-xs font-bold border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 shrink-0"
                      onClick={() => handleUnbanUser(banned.id)}
                      disabled={unbanningId === banned.id}
                    >
                      {unbanningId === banned.id ? (
                        <RefreshCw size={12} className="animate-spin mr-1" />
                      ) : (
                        <CheckCircle2 size={12} className="mr-1" />
                      )}
                      Unban
                    </Button>
                  </div>

                  <div className="p-2.5 rounded-xl bg-muted/20 text-[10px] text-muted-foreground flex justify-between">
                    <span>Banned by: <strong className="text-foreground">{banned.bannedBy}</strong></span>
                    <span>{banned.bannedAt ? new Date(banned.bannedAt).toLocaleDateString() : '—'}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* NOTIFICATIONS TAB */}
        {activeTab === 'notifications' && (
          <div className="space-y-4">
            {/* Compose button */}
            <button
              onClick={() => setShowPushForm((v) => !v)}
              className="w-full h-11 rounded-2xl font-bold text-xs border border-blue-500/30 text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 flex items-center justify-center gap-2 transition-all"
            >
              {showPushForm ? <X size={15} /> : <Plus size={15} />}
              {showPushForm ? 'Cancel' : 'Push New Notification'}
            </button>

            {/* Compose form */}
            {showPushForm && (
              <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-3">
                <h3 className="text-sm font-black text-foreground flex items-center gap-2">
                  <Send size={15} className="text-blue-400" /> Compose Notification
                </h3>
                <form onSubmit={handlePushNotification} className="space-y-3">
                  {/* Title row */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Title *</label>
                    <Input
                      placeholder="e.g. New Feature 🎉"
                      value={pushTitle}
                      onChange={(e) => setPushTitle(e.target.value)}
                      className="h-10 rounded-xl bg-muted/40 text-xs"
                      required
                    />
                  </div>

                  {/* Body */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Body / Message *</label>
                    <textarea
                      placeholder="Write the notification message here..."
                      value={pushBody}
                      onChange={(e) => setPushBody(e.target.value)}
                      className="w-full h-20 px-3 py-2.5 rounded-xl bg-muted/40 border border-border/40 text-xs text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                      required
                    />
                  </div>

                  {/* Type selector pills */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Type</label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(Object.entries(TYPE_CONFIG) as [string, { label: string; color: string; bg: string }][]).map(([val, cfg]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setPushType(val as 'info' | 'warning' | 'success' | 'promo')}
                          className={cn(
                            'flex flex-col items-center gap-1 py-2 rounded-xl border text-[10px] font-bold transition-all active:scale-95',
                            pushType === val
                              ? `${cfg.bg} ${cfg.color} shadow-sm`
                              : 'bg-muted/30 border-border/30 text-muted-foreground hover:bg-muted/50'
                          )}
                        >
                          <span className={pushType === val ? cfg.color : 'text-muted-foreground'}>{cfg.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Icon picker */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold uppercase text-muted-foreground">Icon</label>
                      {pushEmoji && (
                        <button
                          type="button"
                          onClick={() => { setPushEmoji(''); setShowIconPicker(false); }}
                          className="text-[9px] text-muted-foreground/60 hover:text-destructive font-medium"
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    {/* Selected preview / toggle */}
                    <button
                      type="button"
                      onClick={() => setShowIconPicker(v => !v)}
                      className="w-full flex items-center gap-2.5 h-10 px-3 rounded-xl bg-muted/40 border border-border/40 text-xs text-left transition-all hover:bg-muted/60"
                    >
                      {pushEmoji ? (
                        pushEmoji.startsWith('__ICON__') ? (() => {
                          const opt = ICON_PICKER_OPTIONS.find(o => `__ICON__${o.name}` === pushEmoji);
                          return opt ? (
                            <>
                              <opt.icon size={14} className="text-blue-400 shrink-0" />
                              <span className="text-foreground font-medium">{opt.label}</span>
                            </>
                          ) : null;
                        })() : (
                          <><span className="text-base leading-none">{pushEmoji}</span><span className="text-foreground font-medium">Custom emoji</span></>
                        )
                      ) : (
                        <span className="text-muted-foreground">Pick an icon or type emoji…</span>
                      )}
                      <ChevronDown size={13} className={cn('ml-auto text-muted-foreground transition-transform', showIconPicker && 'rotate-180')} />
                    </button>

                    {showIconPicker && (
                      <div className="rounded-xl border border-border/40 bg-muted/20 p-2 space-y-2">
                        {/* 20 lucide icon grid */}
                        <div className="grid grid-cols-5 gap-1.5">
                          {ICON_PICKER_OPTIONS.map((opt) => {
                            const isSelected = pushEmoji === `__ICON__${opt.name}`;
                            return (
                              <button
                                key={opt.name}
                                type="button"
                                onClick={() => {
                                  setPushEmoji(isSelected ? '' : `__ICON__${opt.name}`);
                                  setShowIconPicker(false);
                                }}
                                className={cn(
                                  'flex flex-col items-center gap-1 p-2 rounded-xl border text-[9px] font-bold transition-all active:scale-90',
                                  isSelected
                                    ? 'bg-blue-500/15 border-blue-500/40 text-blue-400'
                                    : 'bg-muted/30 border-border/20 text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                                )}
                                title={opt.label}
                              >
                                <opt.icon size={16} />
                                <span className="leading-none truncate w-full text-center">{opt.label}</span>
                              </button>
                            );
                          })}
                        </div>

                        {/* Custom emoji text input */}
                        <div className="pt-1 border-t border-border/30 flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground shrink-0">Or emoji:</span>
                          <input
                            type="text"
                            placeholder="🎉"
                            value={pushEmoji.startsWith('__ICON__') ? '' : pushEmoji}
                            onChange={(e) => setPushEmoji(e.target.value)}
                            className="flex-1 h-8 px-2.5 rounded-lg bg-muted/40 border border-border/30 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                            maxLength={4}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Link */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Link (optional)</label>
                    <Input
                      placeholder="https://..."
                      value={pushLink}
                      onChange={(e) => setPushLink(e.target.value)}
                      className="h-10 rounded-xl bg-muted/40 text-xs"
                      type="url"
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-11 rounded-xl font-bold text-xs bg-blue-600 hover:bg-blue-700 text-white"
                    disabled={isPushing}
                  >
                    {isPushing ? (
                      <><RefreshCw size={13} className="animate-spin mr-1.5" /> Pushing...</>
                    ) : (
                      <><Send size={13} className="mr-1.5" /> Push to All Users</>
                    )}
                  </Button>
                </form>
              </div>
            )}

            {/* Notifications List */}
            {notifLoading ? (
              <div className="py-12 text-center space-y-3">
                <RefreshCw size={22} className="animate-spin text-blue-400 mx-auto" />
                <p className="text-xs text-muted-foreground">Loading notifications...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <Bell size={28} className="text-muted-foreground/40 mx-auto" />
                <p className="text-xs text-muted-foreground">No notifications pushed yet.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {notifications.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => setSelectedNotif(n)}
                    className="w-full rounded-2xl border border-border/30 bg-card p-4 flex items-start gap-3 text-left active:scale-[0.98] transition-all hover:border-border/60 hover:bg-muted/20"
                  >
                    <div className="w-9 h-9 rounded-xl bg-muted/40 border border-border/20 flex items-center justify-center shrink-0">
                      {n.emoji ? (
                        <span className="text-base">{n.emoji}</span>
                      ) : (
                        notifTypeIcon(n.type)
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-bold text-foreground truncate">{n.title}</span>
                        <span className={cn(
                          'px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider shrink-0',
                          n.type === 'warning' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' :
                          n.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                          n.type === 'promo' ? 'bg-primary/10 text-primary border border-primary/20' :
                          'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                        )}>
                          {n.type}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-snug line-clamp-2">{n.body}</p>
                      <p className="text-[10px] text-muted-foreground/50 mt-1 font-mono">
                        {new Date(n.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {/* tap hint */}
                    <div className="w-6 h-6 rounded-lg bg-muted/40 flex items-center justify-center shrink-0 self-center">
                      <ChevronDown size={13} className="text-muted-foreground -rotate-90" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Notification Action Sheet */}
      {selectedNotif && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end justify-center p-4"
          onClick={() => setSelectedNotif(null)}
        >
          <div
            className="w-full max-w-sm bg-card rounded-3xl border border-border/30 p-5 space-y-4 shadow-2xl animate-in slide-in-from-bottom-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Preview */}
            <div className="flex items-center gap-3 pb-3 border-b border-border/30">
              <div className="w-10 h-10 rounded-xl bg-muted/40 border border-border/20 flex items-center justify-center shrink-0">
                {selectedNotif.emoji ? (
                  <span className="text-lg">{selectedNotif.emoji}</span>
                ) : (
                  notifTypeIcon(selectedNotif.type)
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-foreground truncate">{selectedNotif.title}</p>
                <p className="text-[11px] text-muted-foreground truncate">{selectedNotif.body}</p>
              </div>
              <button
                onClick={() => setSelectedNotif(null)}
                className="w-7 h-7 rounded-full bg-muted/40 flex items-center justify-center text-muted-foreground shrink-0"
              >
                <X size={14} />
              </button>
            </div>

            {/* Actions */}
            <div className="space-y-2">
              {/* Send Again */}
              <button
                onClick={() => handleSendAgain(selectedNotif)}
                disabled={isSendingAgain}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 text-blue-400 font-bold text-sm active:scale-[0.98] transition-all"
              >
                {isSendingAgain ? (
                  <RefreshCw size={16} className="animate-spin shrink-0" />
                ) : (
                  <Send size={16} className="shrink-0" />
                )}
                <div className="text-left">
                  <p className="text-sm font-bold">Send Again</p>
                  <p className="text-[10px] font-normal text-blue-400/70">Push this notification to all users now</p>
                </div>
              </button>

              {/* Edit */}
              <button
                onClick={() => handleEditNotif(selectedNotif)}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-muted/40 border border-border/30 hover:bg-muted/70 text-foreground font-bold text-sm active:scale-[0.98] transition-all"
              >
                <Send size={16} className="shrink-0 text-muted-foreground" style={{ transform: 'rotate(45deg)' }} />
                <div className="text-left">
                  <p className="text-sm font-bold">Edit &amp; Send</p>
                  <p className="text-[10px] font-normal text-muted-foreground">Pre-fill the compose form with this notification</p>
                </div>
              </button>

              {/* Delete */}
              <button
                onClick={() => handleDeleteNotification(selectedNotif.id)}
                disabled={deletingNotifId === selectedNotif.id}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-destructive/10 border border-destructive/20 hover:bg-destructive/20 text-destructive font-bold text-sm active:scale-[0.98] transition-all"
              >
                {deletingNotifId === selectedNotif.id ? (
                  <RefreshCw size={16} className="animate-spin shrink-0" />
                ) : (
                  <Trash2 size={16} className="shrink-0" />
                )}
                <div className="text-left">
                  <p className="text-sm font-bold">Delete</p>
                  <p className="text-[10px] font-normal text-destructive/70">Remove from Firestore permanently</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {showBanModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-card rounded-3xl border border-destructive/40 p-6 space-y-5 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center justify-center text-destructive">
                  <ShieldBan size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black uppercase text-destructive">Ban User</h3>
                  <p className="text-[11px] text-muted-foreground">Block app access by Gmail ID or UID</p>
                </div>
              </div>
              <button
                onClick={() => setShowBanModal(false)}
                className="w-8 h-8 rounded-full bg-muted/40 flex items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleBanUserSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase text-muted-foreground">Gmail ID or User UID *</label>
                <Input
                  placeholder="e.g. baduser@gmail.com or UID"
                  value={banIdentifier}
                  onChange={(e) => setBanIdentifier(e.target.value)}
                  className="h-11 rounded-xl bg-muted/40"
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase text-muted-foreground">Ban Reason</label>
                <Input
                  placeholder="e.g. Modded APK / Chargeback"
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  className="h-11 rounded-xl bg-muted/40"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 h-11 rounded-xl text-xs"
                  onClick={() => setShowBanModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  className="flex-1 h-11 rounded-xl text-xs font-bold"
                  disabled={isBanning}
                >
                  {isBanning ? <RefreshCw size={14} className="animate-spin mr-1.5" /> : <Ban size={14} className="mr-1.5" />}
                  Confirm Ban
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
