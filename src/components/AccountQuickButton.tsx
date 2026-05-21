import { useEffect, useState } from 'react';
import { UserCircle2, Sparkles } from 'lucide-react';
import { getAccountProfile } from '@/lib/storage';
import { isProUserCached } from '@/lib/proAccess';
import { useNavigate } from 'react-router-dom';

interface AccountQuickButtonProps {
  onClick: () => void;
  size?: number;
}

export function AccountQuickButton({ onClick, size = 44 }: AccountQuickButtonProps) {
  const [accountAvatar, setAccountAvatar] = useState(() => getAccountProfile().avatar || '');
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [isPro, setIsPro] = useState(() => isProUserCached());
  const navigate = useNavigate();

  const sanitizeAvatarUrl = (value?: string) => {
    const raw = (value || '').trim();
    if (!raw) return '';
    const allowed = raw.startsWith('https://') || raw.startsWith('http://') || raw.startsWith('data:image/');
    if (!allowed) return '';

    if (raw.includes('googleusercontent.com') && !/[?&]sz=\d+/i.test(raw)) {
      return `${raw}${raw.includes('?') ? '&' : '?'}sz=256`;
    }

    return raw;
  };

  useEffect(() => {
    const syncAccount = () => {
      const nextAvatar = sanitizeAvatarUrl(getAccountProfile().avatar);
      setAccountAvatar(nextAvatar);
      setAvatarLoadFailed(false);
    };
    const syncPro = () => setIsPro(isProUserCached());
    syncAccount();
    syncPro();
    window.addEventListener('splitmate_account_changed', syncAccount);
    window.addEventListener('splitmate_pro_changed', syncPro);
    window.addEventListener('focus', syncAccount);
    window.addEventListener('focus', syncPro);
    return () => {
      window.removeEventListener('splitmate_account_changed', syncAccount);
      window.removeEventListener('splitmate_pro_changed', syncPro);
      window.removeEventListener('focus', syncAccount);
      window.removeEventListener('focus', syncPro);
    };
  }, []);

  return (
    <div className="flex items-center gap-3 shrink-0">
      {!isPro && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigate('/pro');
          }}
          className="h-[34px] px-3.5 rounded-full flex items-center justify-center font-bold text-[11px] uppercase tracking-wider transition-all active:scale-95"
          style={{
            background: 'linear-gradient(135deg, hsl(45 100% 50%), hsl(35 100% 50%))',
            color: '#000',
            boxShadow: '0 4px 14px -4px hsl(40 100% 50% / 0.5)',
          }}
        >
          <Sparkles size={13} className="mr-1.5" />
          Pro
        </button>
      )}
      <button
        type="button"
        onClick={onClick}
        className="rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          background: 'hsl(var(--card) / 0.9)',
          border: '1px solid hsl(var(--border) / 0.45)',
          backdropFilter: 'blur(18px)',
          boxShadow: '0 10px 28px -12px hsl(var(--primary) / 0.38)',
        }}
        aria-label="Open account"
      >
        {accountAvatar && !avatarLoadFailed ? (
          <img
            src={accountAvatar}
            alt="Account"
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
            onError={() => setAvatarLoadFailed(true)}
          />
        ) : (
          <UserCircle2 size={Math.round(size * 0.46)} className="text-primary" />
        )}
      </button>
    </div>
  );
}
