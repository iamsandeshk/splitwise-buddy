import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import {
  ChevronLeft,
  Database,
  CloudUpload,
  RotateCcw,
  Sparkles,
  FileJson,
  User,
  Users,
  Landmark,
  Target,
  Repeat,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  FileUp,
  FileDown,
  Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import { useProGate } from '@/hooks/useProGate';
import {
  getAccountProfile,
  saveAccountProfile,
  exportAllData,
  importData,
  getPersonalExpenses,
  getSharedExpenses,
  getGroups,
  getLinks,
  getLoans,
  getGoals,
  getSubscriptions,
  isAutoBackupGracePeriodActive,
  getAutoBackupProRemovedAt,
  AUTO_BACKUP_GRACE_PERIOD_MS,
  triggerForceSync,
  AccountProfile,
} from '@/lib/storage';
import {
  getCurrentGoogleUser,
  getGooglePhotoUrl,
  signInWithGoogle,
  subscribeGoogleAuth,
} from '@/integrations/firebase/auth';
import {
  loadBackupForCurrentUser,
  saveBackupForCurrentUser,
} from '@/integrations/firebase/backup';

const APP_VERSION = '4.7';

export default function BackupRestorePage() {
  const navigate = useNavigate();
  const { isPro: isEffectivePro } = useProGate();

  const [profile, setProfile] = useState<AccountProfile>(() => getAccountProfile());
  const [isGoogleConnected, setIsGoogleConnected] = useState<boolean>(() =>
    Boolean(getCurrentGoogleUser() || getAccountProfile().email)
  );
  const [googleUser, setGoogleUser] = useState(() => getCurrentGoogleUser());
  const [isGoogleAuthBusy, setIsGoogleAuthBusy] = useState(false);
  const [isCloudBackupBusy, setIsCloudBackupBusy] = useState(false);
  const [isCloudRestoreBusy, setIsCloudRestoreBusy] = useState(false);
  const [cloudBackupUpdatedAt, setCloudBackupUpdatedAt] = useState<Date | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Modals
  const [showExportModal, setShowExportModal] = useState(false);
  const [showCloudBackupModal, setShowCloudBackupModal] = useState(false);
  const [showRestoreConfirmModal, setShowRestoreConfirmModal] = useState<'cloud' | 'file' | null>(null);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Hardware back button support
  const handleBack = useCallback(() => {
    if (showExportModal || showCloudBackupModal || showRestoreConfirmModal) {
      setShowExportModal(false);
      setShowCloudBackupModal(false);
      setShowRestoreConfirmModal(null);
      setPendingImportFile(null);
      return;
    }

    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/', { state: { tabId: 'account' } });
    }
  }, [navigate, showExportModal, showCloudBackupModal, showRestoreConfirmModal]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let handleRef: { remove: () => Promise<void> } | null = null;
    const attach = async () => {
      handleRef = await CapacitorApp.addListener('backButton', () => {
        handleBack();
      });
    };

    void attach();
    return () => {
      if (handleRef) void handleRef.remove();
    };
  }, [handleBack]);

  // Sync Google auth state & fetch last cloud backup date
  useEffect(() => {
    const unsubscribe = subscribeGoogleAuth((user) => {
      setGoogleUser(user);
      setIsGoogleConnected(Boolean(user));
      if (!user) {
        setCloudBackupUpdatedAt(null);
        return;
      }

      void loadBackupForCurrentUser({ enforceFreeLimit: false })
        .then((backup) => {
          setCloudBackupUpdatedAt(backup?.updatedAt ?? null);
        })
        .catch(() => {
          setCloudBackupUpdatedAt(null);
        });
    });

    return () => unsubscribe();
  }, []);

  // Compute live data counts
  const stats = useMemo(() => {
    return {
      personal: getPersonalExpenses().length,
      shared: getSharedExpenses().length,
      groups: getGroups().length,
      loans: getLoans().length,
      goals: getGoals().length,
      subscriptions: getSubscriptions().length,
      links: getLinks().length,
    };
  }, []);

  const totalItemsCount = useMemo(() => {
    return (
      stats.personal +
      stats.shared +
      stats.groups +
      stats.loans +
      stats.goals +
      stats.subscriptions +
      stats.links
    );
  }, [stats]);

  // Google sign in handler
  const handleGoogleSignIn = async () => {
    setIsGoogleAuthBusy(true);
    try {
      const user = await signInWithGoogle();
      if (!user) {
        toast({ title: 'Redirecting to Google', description: 'Complete sign in and return to app.' });
        return;
      }
      setGoogleUser(user);
      setIsGoogleConnected(true);
      toast({ title: 'Signed in with Google', description: 'Cloud backup is now available.' });
      const backup = await loadBackupForCurrentUser({ enforceFreeLimit: false }).catch(() => null);
      setCloudBackupUpdatedAt(backup?.updatedAt ?? null);
    } catch (error) {
      const rawMessage = (error as { message?: string } | null)?.message ?? 'Unknown sign-in error.';
      toast({
        title: 'Google sign in failed',
        description: rawMessage,
        variant: 'destructive',
      });
    } finally {
      setIsGoogleAuthBusy(false);
    }
  };

  // Daily backup toggle
  const handleToggleDailyBackup = () => {
    const next = !profile.nightlyBackupEnabled;
    const currentSaved = getAccountProfile();
    const updated = { ...currentSaved, nightlyBackupEnabled: next };
    const saved = saveAccountProfile(updated);
    if (!saved) return;
    setProfile(updated);
    window.dispatchEvent(new Event('splitmate_account_changed'));
    toast({
      title: next ? 'Daily Auto-Backup Enabled' : 'Daily Auto-Backup Disabled',
      description: next
        ? 'Your data will automatically sync every night at 12:00 AM.'
        : 'Daily automated backup is turned off.',
    });
  };

  // Perform Cloud Backup
  const executeCloudBackup = async () => {
    setShowCloudBackupModal(false);
    if (!isGoogleConnected) {
      toast({ title: 'Sign in required', description: 'Sign in with Google to save cloud backup.', variant: 'destructive' });
      return;
    }

    setIsCloudBackupBusy(true);
    try {
      const payload = exportAllData();
      await saveBackupForCurrentUser(payload, APP_VERSION);
      triggerForceSync();

      const now = new Date();
      setCloudBackupUpdatedAt(now);
      toast({
        title: 'Cloud Backup Complete',
        description: 'All your data has been securely saved to the cloud.',
      });
    } catch (error) {
      const message = (error as { message?: string } | null)?.message || 'Could not upload backup to cloud.';
      const isDailyLimit = /free cloud backup already used for today/i.test(message);
      toast({
        title: isDailyLimit ? 'Daily limit reached' : 'Cloud backup failed',
        description: message,
        variant: isDailyLimit ? 'default' : 'destructive',
      });
    } finally {
      setIsCloudBackupBusy(false);
    }
  };

  // Perform Cloud Restore
  const executeCloudRestore = async () => {
    setShowRestoreConfirmModal(null);
    if (!isGoogleConnected) {
      toast({ title: 'Sign in required', description: 'Sign in with Google to restore cloud backup.', variant: 'destructive' });
      return;
    }

    setIsCloudRestoreBusy(true);
    try {
      const backup = await loadBackupForCurrentUser();
      if (!backup?.payload) {
        toast({ title: 'No cloud backup found', description: 'Save a backup first from this account.' });
        return;
      }

      const success = importData(backup.payload);
      if (!success) {
        toast({ title: 'Restore failed', description: 'Backup format is invalid.', variant: 'destructive' });
        return;
      }

      setCloudBackupUpdatedAt(backup.updatedAt ?? new Date());
      toast({
        title: 'Restore Successful!',
        description: 'Your transactions and data have been restored.',
      });
      setTimeout(() => {
        window.location.reload();
      }, 700);
    } catch {
      toast({ title: 'Cloud restore failed', description: 'Could not restore backup from cloud.', variant: 'destructive' });
    } finally {
      setIsCloudRestoreBusy(false);
    }
  };

  // Perform Local File Export
  const executeExportFile = async () => {
    setShowExportModal(false);
    setIsExporting(true);
    try {
      const data = exportAllData();
      const fileName = `splitmate-backup-${new Date().toISOString().split('T')[0]}.json`;

      if (Capacitor.isNativePlatform()) {
        const saved = await Filesystem.writeFile({
          path: `backups/${fileName}`,
          data,
          directory: Directory.Documents,
          encoding: Encoding.UTF8,
          recursive: true,
        });

        const canShare = await Share.canShare();
        if (canShare.value) {
          await Share.share({
            title: 'SplitMate Backup',
            text: 'Your SplitMate backup JSON file is ready.',
            url: saved.uri,
            dialogTitle: 'Save or share backup file',
          });
        }

        toast({
          title: 'Exported Successfully!',
          description: `Saved to Documents/backups/${fileName}`,
        });
      } else {
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();

        setTimeout(() => {
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }, 200);

        toast({ title: 'Exported!', description: `Saved as ${fileName}` });
      }
    } catch {
      toast({ title: 'Export Failed', description: 'Unable to save the backup file.', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  // File selection for Import
  const handleFilePicked = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPendingImportFile(file);
    setShowRestoreConfirmModal('file');
    event.target.value = '';
  };

  // Perform File Import after confirmation
  const executeFileImport = async () => {
    if (!pendingImportFile) return;
    setShowRestoreConfirmModal(null);
    setIsImporting(true);
    try {
      const text = await pendingImportFile.text();
      const success = importData(text);
      if (success) {
        toast({ title: 'Data Restored!', description: 'Backup file imported successfully.' });
        setTimeout(() => window.location.reload(), 800);
      } else {
        toast({ title: 'Import Failed', description: 'Invalid JSON backup format.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Import Failed', description: "Could not read the selected file.", variant: 'destructive' });
    } finally {
      setIsImporting(false);
      setPendingImportFile(null);
    }
  };

  const formattedSyncDate = useMemo(() => {
    if (!cloudBackupUpdatedAt) return 'Not synced yet';
    return cloudBackupUpdatedAt.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [cloudBackupUpdatedAt]);

  return (
    <div className="min-h-screen bg-background text-foreground pb-24 selection:bg-primary/20">
      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFilePicked}
        className="hidden"
      />

      {/* Top Header */}
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/20 px-5 pt-12 pb-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="w-10 h-10 rounded-2xl bg-secondary/70 border border-border/50 flex items-center justify-center text-foreground active:scale-90 transition-all focus:outline-none"
            aria-label="Back to Settings"
          >
            <ChevronLeft size={20} strokeWidth={2.5} />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Backup &amp; Restore</h1>
            <p className="text-[11px] text-muted-foreground font-medium">Cloud sync &amp; local data safety</p>
          </div>
        </div>

        {/* Sync status badge in header */}
        {isGoogleConnected && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary/80 border border-border/30 text-[10px] font-semibold text-muted-foreground">
            <div className={cn('w-2 h-2 rounded-full', cloudBackupUpdatedAt ? 'bg-success animate-pulse' : 'bg-amber-500')} />
            <span className="hidden xs:inline">{cloudBackupUpdatedAt ? 'Cloud Active' : 'Unsynced'}</span>
          </div>
        )}
      </div>

      <div className="px-5 pt-5 space-y-6 max-w-xl mx-auto">
        {/* ── SECTION 1: Cloud Backup & Restore ── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">Cloud Sync</span>
            {isGoogleConnected && (
              <span className="text-[10px] text-muted-foreground">
                Last sync: <span className="font-semibold text-foreground">{formattedSyncDate}</span>
              </span>
            )}
          </div>

          <div className="ios-card-modern rounded-3xl p-4 space-y-3.5">
            {/* Google Account Status Banner */}
            {isGoogleConnected ? (
              <div className="flex items-center justify-between gap-3 p-3.5 rounded-3xl bg-secondary/35 border border-border/20">
                <div className="flex items-center gap-3 min-w-0">
                  {getGooglePhotoUrl(googleUser) || profile.avatar ? (
                    <img
                      src={getGooglePhotoUrl(googleUser) || profile.avatar}
                      alt="Google avatar"
                      className="w-10 h-10 rounded-2xl object-cover border border-border/30 shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-2xl bg-primary/15 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                      {profile.name?.charAt(0)?.toUpperCase() || 'U'}
                    </div>
                  )}
                  <div className="min-w-0 text-left">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-bold truncate text-foreground">
                        {googleUser?.displayName || profile.name || 'Google User'}
                      </p>
                      <span className="px-1.5 py-0.5 rounded-full bg-success/15 text-success text-[9px] font-bold">
                        Connected
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {googleUser?.email || profile.email || 'Cloud backup enabled'}
                    </p>
                  </div>
                </div>

                <div className="shrink-0">
                  <div className="w-9 h-9 rounded-2xl bg-background/80 border border-border/20 flex items-center justify-center shadow-xs">
                    <CloudUpload size={16} className="text-primary" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-3xl bg-secondary/35 border border-border/30 text-left space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                    <Database size={20} />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-xs font-bold text-foreground">Connect Google to Enable Cloud Backup</h3>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Save your data securely to the cloud. Seamlessly switch devices or restore your records at any time.
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleGoogleSignIn}
                  disabled={isGoogleAuthBusy}
                  className="w-full py-2.5 px-4 rounded-2xl bg-primary text-primary-foreground text-xs font-bold tracking-wide flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-sm disabled:opacity-50"
                >
                  {isGoogleAuthBusy ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" /> Connecting…
                    </>
                  ) : (
                    <>
                      <CloudUpload size={14} /> Connect Google Account
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Cloud Actions (Save & Load) */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => setShowCloudBackupModal(true)}
                disabled={!isGoogleConnected || isCloudBackupBusy}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-3xl transition-all text-left group',
                  isGoogleConnected
                    ? 'bg-secondary/50 hover:bg-secondary/80 border border-border/30 active:scale-[0.98]'
                    : 'bg-secondary/20 border border-border/10 opacity-60 cursor-not-allowed'
                )}
              >
                <div className="w-9 h-9 rounded-2xl bg-background/80 shadow-xs flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  {isCloudBackupBusy ? (
                    <RefreshCw size={16} className="text-primary animate-spin" />
                  ) : (
                    <CloudUpload size={16} className="text-primary" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-foreground leading-tight">Cloud Save</p>
                  <p className="text-[10px] text-muted-foreground font-medium truncate">Backup</p>
                </div>
              </button>

              <button
                onClick={() => setShowRestoreConfirmModal('cloud')}
                disabled={!isGoogleConnected || isCloudRestoreBusy}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-3xl transition-all text-left group',
                  isGoogleConnected
                    ? 'bg-secondary/50 hover:bg-secondary/80 border border-border/30 active:scale-[0.98]'
                    : 'bg-secondary/20 border border-border/10 opacity-60 cursor-not-allowed'
                )}
              >
                <div className="w-9 h-9 rounded-2xl bg-background/80 shadow-xs flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  {isCloudRestoreBusy ? (
                    <RefreshCw size={16} className="text-amber-500 animate-spin" />
                  ) : (
                    <RotateCcw size={16} className="text-amber-500" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-foreground leading-tight">Cloud Load</p>
                  <p className="text-[10px] text-muted-foreground font-medium truncate">Restore</p>
                </div>
              </button>
            </div>
          </div>
        </section>

        {/* ── SECTION 2: Daily Auto Backup ── */}
        <section className="space-y-3">
          <span className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase px-1">
            Automated Backups
          </span>

          <div
            onClick={handleToggleDailyBackup}
            className="ios-card-modern rounded-3xl p-4 flex items-center justify-between gap-4 cursor-pointer active:scale-[0.99] transition-all"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div
                className={cn(
                  'w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-300 shrink-0 shadow-xs',
                  profile.nightlyBackupEnabled
                    ? 'bg-success/15 text-success rotate-6'
                    : 'bg-secondary/70 text-muted-foreground'
                )}
              >
                <Sparkles size={18} />
              </div>
              <div className="text-left min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-foreground">Daily Auto-Backup</h3>
                  {profile.nightlyBackupEnabled && (
                    <span className="px-1.5 py-0.5 rounded-full bg-success/15 text-success text-[9px] font-bold">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                  {!isEffectivePro && isAutoBackupGracePeriodActive()
                    ? (() => {
                        const removedAt = getAutoBackupProRemovedAt();
                        const remainingMs = removedAt
                          ? Math.max(0, AUTO_BACKUP_GRACE_PERIOD_MS - (Date.now() - removedAt))
                          : 0;
                        const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
                        return `Grace period: turns off in ${remainingHours}h unless Pro restored`;
                      })()
                    : 'Syncs snapshot automatically every night at 12:00 AM'}
                </p>
              </div>
            </div>

            {/* Radix Switch: thumb translates cleanly to the right when checked */}
            <div className="shrink-0 pointer-events-none">
              <Switch
                checked={Boolean(profile.nightlyBackupEnabled)}
                className="data-[state=checked]:bg-success"
              />
            </div>
          </div>
        </section>

        {/* ── SECTION 3: Local Offline Backup (JSON) ── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
              Local File (Offline)
            </span>
            <span className="text-[10px] text-muted-foreground font-medium">Standard JSON</span>
          </div>

          <div className="ios-card-modern rounded-3xl p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2.5">
              {/* Export JSON Button */}
              <button
                onClick={() => setShowExportModal(true)}
                disabled={isExporting}
                className="flex items-center gap-3 p-3 rounded-3xl bg-secondary/50 hover:bg-secondary/80 border border-border/30 transition-all active:scale-[0.98] text-left group"
              >
                <div className="w-9 h-9 rounded-2xl bg-background/80 shadow-xs flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform text-foreground">
                  {isExporting ? <RefreshCw size={16} className="animate-spin text-primary" /> : <FileDown size={16} />}
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-foreground leading-tight">Export File</h4>
                  <p className="text-[10px] text-muted-foreground font-medium truncate">JSON File</p>
                </div>
              </button>

              {/* Import JSON Button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="flex items-center gap-3 p-3 rounded-3xl bg-secondary/50 hover:bg-secondary/80 border border-border/30 transition-all active:scale-[0.98] text-left group"
              >
                <div className="w-9 h-9 rounded-2xl bg-background/80 shadow-xs flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform text-foreground">
                  {isImporting ? <RefreshCw size={16} className="animate-spin text-primary" /> : <FileUp size={16} />}
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-foreground leading-tight">Import File</h4>
                  <p className="text-[10px] text-muted-foreground font-medium truncate">JSON File</p>
                </div>
              </button>
            </div>

            <p className="text-[10px] text-muted-foreground/80 px-1 pt-1 leading-relaxed">
              Exported files include personal expenses, shared groups, loans, savings targets, and subscriptions. They
              can be transferred to any device running SplitMate.
            </p>
          </div>
        </section>

        {/* ── SECTION 4: Live Data Statistics Breakdown ── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
              Current Stored Data
            </span>
            <span className="text-[11px] font-bold text-primary">{totalItemsCount} Total Records</span>
          </div>

          <div className="ios-card-modern rounded-3xl p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {[
                { label: 'Personal Expenses', count: stats.personal, icon: User, color: 'text-blue-500 bg-blue-500/10' },
                { label: 'Shared Expenses', count: stats.shared, icon: Users, color: 'text-violet-500 bg-violet-500/10' },
                { label: 'Groups', count: stats.groups, icon: Layers, color: 'text-emerald-500 bg-emerald-500/10' },
                { label: 'Loans & Debts', count: stats.loans, icon: Landmark, color: 'text-amber-500 bg-amber-500/10' },
                { label: 'Savings Goals', count: stats.goals, icon: Target, color: 'text-rose-500 bg-rose-500/10' },
                { label: 'Subscriptions', count: stats.subscriptions, icon: Repeat, color: 'text-cyan-500 bg-cyan-500/10' },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-3xl bg-secondary/35 border border-border/20 flex flex-col justify-between gap-2 transition-all hover:bg-secondary/50"
                >
                  <div className="flex items-center justify-between">
                    <div className={cn('w-8 h-8 rounded-2xl flex items-center justify-center shrink-0 shadow-xs', item.color)}>
                      <item.icon size={15} />
                    </div>
                    <span className="text-sm font-black text-foreground tabular-nums px-2 py-0.5 rounded-xl bg-background/70 border border-border/20 shadow-xs">
                      {item.count}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-foreground leading-snug">{item.label}</p>
                    <p className="text-[9px] text-muted-foreground mt-0.5">Records</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── SECTION 5: Privacy & Security Badge ── */}
        <div className="ios-card-modern rounded-3xl p-4 flex items-start gap-3.5">
          <div className="w-9 h-9 rounded-2xl bg-success/10 text-success flex items-center justify-center shrink-0 mt-0.5">
            <ShieldCheck size={18} />
          </div>
          <div className="space-y-0.5 text-left">
            <h4 className="text-xs font-bold text-foreground">Private &amp; Secure</h4>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Your financial data belongs exclusively to you. Cloud backups are stored securely within your personal
              authenticated space, and local exports never leave your device without your consent.
            </p>
          </div>
        </div>
      </div>

      {/* ── CONFIRMATION MODAL: Cloud Backup / Export Breakdown ── */}
      {(showExportModal || showCloudBackupModal) && (
        <div
          className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center p-4 sm:p-0"
          style={{ background: 'hsl(0 0% 0% / 0.55)', backdropFilter: 'blur(8px)' }}
          onClick={() => {
            setShowExportModal(false);
            setShowCloudBackupModal(false);
          }}
        >
          <div
            className="w-full max-w-sm rounded-[2rem] overflow-hidden animate-in fade-in slide-in-from-bottom-6 duration-200 bg-card border border-border/40 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 space-y-5 text-center">
              <div
                className={cn(
                  'w-16 h-16 rounded-full mx-auto flex items-center justify-center shadow-inner',
                  showExportModal ? 'bg-primary/10 text-primary' : 'bg-success/10 text-success'
                )}
              >
                {showExportModal ? <FileJson size={28} /> : <CloudUpload size={28} />}
              </div>

              <div>
                <h3 className="text-xl font-bold text-foreground">
                  {showExportModal ? 'Export Data Snapshot' : 'Save Cloud Backup'}
                </h3>
                <p className="text-xs text-muted-foreground mt-1.5 font-medium">
                  {showExportModal
                    ? 'Download a complete JSON file containing all your local records.'
                    : 'Upload your latest data to your secure Google Cloud container.'}
                </p>
              </div>

              <div className="bg-secondary/40 p-3.5 rounded-3xl border border-border/20 space-y-2 text-left">
                {[
                  { label: 'Personal Expenses', count: stats.personal, icon: User },
                  { label: 'Shared Expenses & Groups', count: stats.shared + stats.groups, icon: Users },
                  { label: 'Loans & Debts', count: stats.loans, icon: Landmark },
                  { label: 'Savings Goals', count: stats.goals, icon: Target },
                  { label: 'Subscriptions', count: stats.subscriptions, icon: Repeat },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-0.5">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <item.icon size={12} />
                      <span>{item.label}</span>
                    </div>
                    <span className="font-bold text-foreground">{item.count}</span>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-2.5 pt-1">
                <button
                  onClick={showExportModal ? executeExportFile : executeCloudBackup}
                  className="w-full py-3.5 rounded-2xl font-bold text-xs bg-primary text-primary-foreground shadow-md active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  {showExportModal ? <FileDown size={16} /> : <CloudUpload size={16} />}
                  {showExportModal ? 'Export Backup File' : 'Upload to Cloud'}
                </button>
                <button
                  onClick={() => {
                    setShowExportModal(false);
                    setShowCloudBackupModal(false);
                  }}
                  className="w-full py-3 rounded-2xl font-bold text-xs text-muted-foreground bg-secondary/80 hover:bg-secondary active:scale-95 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIRMATION MODAL: Restore Warning ── */}
      {showRestoreConfirmModal && (
        <div
          className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center p-4 sm:p-0"
          style={{ background: 'hsl(0 0% 0% / 0.55)', backdropFilter: 'blur(8px)' }}
          onClick={() => {
            setShowRestoreConfirmModal(null);
            setPendingImportFile(null);
          }}
        >
          <div
            className="w-full max-w-sm rounded-[2rem] overflow-hidden animate-in fade-in slide-in-from-bottom-6 duration-200 bg-card border border-border/40 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 space-y-5 text-center">
              <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center bg-amber-500/15 text-amber-500 shadow-inner">
                <AlertTriangle size={28} />
              </div>

              <div>
                <h3 className="text-xl font-bold text-foreground">
                  {showRestoreConfirmModal === 'cloud' ? 'Restore from Cloud?' : 'Restore from Backup File?'}
                </h3>
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                  Restoring will update and merge existing local data with the records from the backup. We recommend
                  exporting a local backup first if you want to keep current changes.
                </p>
              </div>

              {pendingImportFile && (
                <div className="p-3 rounded-2xl bg-secondary/50 border border-border/20 text-xs font-mono text-muted-foreground truncate">
                  {pendingImportFile.name} ({(pendingImportFile.size / 1024).toFixed(1)} KB)
                </div>
              )}

              <div className="flex flex-col gap-2.5 pt-1">
                <button
                  onClick={showRestoreConfirmModal === 'cloud' ? executeCloudRestore : executeFileImport}
                  className="w-full py-3.5 rounded-2xl font-bold text-xs bg-amber-500 hover:bg-amber-600 text-white shadow-md active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <RotateCcw size={16} /> Yes, Restore Data
                </button>
                <button
                  onClick={() => {
                    setShowRestoreConfirmModal(null);
                    setPendingImportFile(null);
                  }}
                  className="w-full py-3 rounded-2xl font-bold text-xs text-muted-foreground bg-secondary/80 hover:bg-secondary active:scale-95 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
