import { useEffect, useState, useRef, type PropsWithChildren } from 'react';
import { ShieldAlert, Mail } from 'lucide-react';
import { doc, onSnapshot, getFirestore } from 'firebase/firestore';
import { subscribeGoogleAuth, getCurrentGoogleUser, getFirebaseApp } from '@/integrations/firebase/auth';
import { checkIsUserBanned } from '@/integrations/firebase/admin';
import { getAccountProfile } from '@/lib/storage';
import { clearProStatusCache } from '@/lib/proAccess';

export function BannedGuard({ children }: PropsWithChildren) {
  const [bannedInfo, setBannedInfo] = useState<{ isBanned: boolean; reason?: string }>({ isBanned: false });
  const isLockedRef = useRef(false);

  useEffect(() => {
    if (isLockedRef.current) return;

    const verifyBan = async () => {
      if (isLockedRef.current) return;

      const googleUser = getCurrentGoogleUser();
      const profile = getAccountProfile();
      const email = googleUser?.email || profile?.email;
      const uid = googleUser?.uid;

      if (!email && !uid) return;

      const result = await checkIsUserBanned(email, uid);
      if (result.isBanned) {
        isLockedRef.current = true;
        clearProStatusCache();
        localStorage.removeItem('splitmate_pro_override');
        setBannedInfo(result);
      }
    };

    // Initial check on mount
    void verifyBan();

    // Re-check when user auth changes
    const unsubAuth = subscribeGoogleAuth((user) => {
      if (user && !isLockedRef.current) {
        void checkIsUserBanned(user.email, user.uid).then((res) => {
          if (res.isBanned) {
            isLockedRef.current = true;
            clearProStatusCache();
            localStorage.removeItem('splitmate_pro_override');
            setBannedInfo(res);
          } else {
            setBannedInfo({ isBanned: false });
          }
        });
      }
    });

    // Event-driven ban listener: fires ONLY when admin adds/removes a ban in config/bans
    let unsubBansDoc = () => {};
    try {
      const db = getFirestore(getFirebaseApp());
      const bansConfigRef = doc(db, 'config', 'bans');
      unsubBansDoc = onSnapshot(bansConfigRef, () => {
        if (!isLockedRef.current) {
          void verifyBan();
        }
      }, () => {});
    } catch {
      /* ignore */
    }

    return () => {
      unsubAuth();
      unsubBansDoc();
    };
  }, []);

  if (bannedInfo.isBanned) {
    return (
      <div className="fixed inset-0 z-[999999] bg-background flex items-center justify-center p-6 text-center select-none">
        <div className="max-w-md w-full p-8 rounded-3xl bg-card border border-destructive/30 shadow-2xl space-y-6 animate-in zoom-in-95 duration-300">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mx-auto text-destructive">
            <ShieldAlert size={36} />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-black uppercase tracking-tight text-destructive">Account Suspended</h1>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {bannedInfo.reason || 'Your account access has been suspended due to detected application tampering or violation of terms.'}
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-destructive/5 border border-destructive/10 text-xs text-muted-foreground space-y-2">
            <p>If you believe this is an error or would like to submit an appeal, please contact support:</p>
            <a
              href="mailto:try.sandeshk@gmail.com?subject=SplitMate%20Account%20Appeal"
              className="inline-flex items-center gap-1.5 font-bold text-destructive hover:underline"
            >
              <Mail size={13} />
              try.sandeshk@gmail.com
            </a>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
