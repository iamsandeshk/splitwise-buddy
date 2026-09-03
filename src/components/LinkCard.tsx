import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, Edit, Trash2, Pin, PinOff, Copy, Lock, Unlock, KeyRound, X } from 'lucide-react';
import { LinkItem, deleteLink, toggleLinkPin, toggleLinkLock, saveLink, getGroups } from '@/lib/storage';
import { useToast } from '@/hooks/use-toast';
import { EditLinkModal } from '@/components/modals/EditLinkModal';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';

interface LinkCardProps {
  link: LinkItem;
  onRefresh: () => void;
  viewMode?: 'list' | 'grid';
  isGroupView?: boolean;
}

export const LinkCard = ({ link, onRefresh, viewMode = 'list', isGroupView = false }: LinkCardProps) => {
  const { toast } = useToast();
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [showUnlockPrompt, setShowUnlockPrompt] = useState(false);
  const [showSetPinPrompt, setShowSetPinPrompt] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [unlockAction, setUnlockAction] = useState<'open' | 'copy' | 'disable' | null>(null);

  const isLocked = link.locked && !isUnlocked;

  const handleOpen = () => {
    if (isLocked) {
      setUnlockAction('open');
      setShowUnlockPrompt(true);
      return;
    }
    window.open(link.url, '_blank', 'noopener,noreferrer');
  };

  const handleCopyLink = async () => {
    if (isLocked) {
      setUnlockAction('copy');
      setShowUnlockPrompt(true);
      return;
    }
    try {
      await navigator.clipboard.writeText(link.url);
      toast({ title: "Link Copied", description: `${link.name} URL copied.` });
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = link.url;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      toast({ title: "Link Copied", description: `${link.name} URL copied.` });
    }
  };

  const handleUnlock = () => {
    if (link.pin && pinInput !== link.pin) {
      toast({
        title: "Wrong PIN",
        description: "Please enter the correct PIN to unlock.",
        variant: "destructive",
      });
      return;
    }
    
    setIsUnlocked(true);
    setShowUnlockPrompt(false);
    setPinInput('');

    if (unlockAction === 'open') {
      window.open(link.url, '_blank', 'noopener,noreferrer');
    } else if (unlockAction === 'copy') {
      void handleCopyLink();
    } else if (unlockAction === 'disable') {
      toggleLinkLock(link.id);
      onRefresh();
      toast({
        title: "Lock Disabled",
        description: `${link.name} is now permanently unlocked.`,
      });
    } else {
      toast({
        title: "Link Unlocked",
        description: "Permissions granted for this session.",
      });
    }
    
    setUnlockAction(null);
  };

  const handleSetPin = () => {
    const updatedLink = {
      ...link,
      locked: true,
      pin: newPinInput.trim() || undefined
    };
    saveLink(updatedLink);
    onRefresh();
    setShowSetPinPrompt(false);
    setNewPinInput('');
    toast({
      title: "Link Locked",
      description: `${link.name} is now secured with ${newPinInput ? 'a PIN' : 'a simple lock'}.`,
    });
  };

  const handleToggleLock = () => {
    if (!link.locked) {
      setShowSetPinPrompt(true);
      return;
    }
    if (link.pin && !isUnlocked) {
      setUnlockAction('disable');
      setShowUnlockPrompt(true);
      return;
    }
    toggleLinkLock(link.id);
    onRefresh();
  };

  const handleDelete = () => {
    deleteLink(link.id);
    onRefresh();
    setShowDeleteConfirm(false);
    toast({ title: "Link Deleted", description: `${link.name} has been removed.` });
  };

  const handleTogglePin = () => {
    toggleLinkPin(link.id);
    onRefresh();
  };

  const handleMoveToLibrary = () => {
    const updatedLink = { ...link, groupId: undefined };
    saveLink(updatedLink);
    onRefresh();
    toast({
      title: "Moved to Library",
      description: `${link.name} removed from its group.`,
    });
  };

  const getDomainFromUrl = (url: string) => {
    try { return new URL(url).hostname.replace('www.', ''); }
    catch { return url; }
  };

  const getFaviconUrl = (url: string) => {
    try {
      const domain = new URL(url).hostname;
      // High-resolution icon URL using unavatar with higher sizing
      return `https://unavatar.io/${domain}?fallback=https://www.google.com/s2/favicons?sz=256&domain=${domain}`;
    } catch { return null; }
  };

  const favicon = link.favicon || getFaviconUrl(link.url);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className={cn("relative h-full", viewMode === 'list' && "w-full")}>
           {isGroupView ? (
              <div 
                onClick={handleOpen}
                className="group h-full relative flex items-center justify-between p-2.5 rounded-[1.3rem] bg-secondary/15 hover:bg-secondary/30 border border-border/5 hover:border-primary/20 transition-all duration-300 active:scale-[0.96] cursor-pointer"
              >
                 <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center overflow-hidden border border-border/10 group-hover:scale-105 transition-all duration-300">
                       {isLocked ? (
                          <Lock size={16} className="text-warning" />
                       ) : favicon ? (
                          <img src={favicon} alt="" className="w-6 h-6 object-contain" onError={(e) => (e.currentTarget.src = "")} />
                       ) : (
                          <ExternalLink size={16} className="text-muted-foreground/30" />
                       )}
                    </div>
                    <div className="flex flex-col min-w-0">
                       <p className="text-xs font-bold truncate leading-tight group-hover:text-primary transition-colors">
                          {isLocked ? '••••••' : link.name}
                       </p>
                       {!isLocked && (
                          <p className="text-[9px] text-muted-foreground/60 font-bold uppercase tracking-tight mt-0.5 opacity-80 group-hover:opacity-100">
                            {getDomainFromUrl(link.url)}
                          </p>
                       )}
                    </div>
                 </div>

                 <button
                   onClick={(e) => {
                      e.stopPropagation();
                      void handleCopyLink();
                   }}
                   className="w-10 h-10 rounded-full bg-primary/5 hover:bg-primary/10 flex items-center justify-center text-primary shadow-sm transition-all active:scale-90 flex-shrink-0 border border-primary/10"
                 >
                    <Copy size={13} strokeWidth={3} />
                 </button>

                 {link.pinned && (
                    <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-lg transform rotate-12 ring-2 ring-background z-10 scale-90 sm:scale-100">
                       <Pin size={10} className="text-primary-foreground fill-current" />
                    </div>
                 )}
              </div>
           ) : viewMode === 'grid' ? (
              <div
                className="group relative h-full overflow-hidden rounded-[2.5rem] cursor-pointer transition-all duration-500 active:scale-[0.96] flex flex-col bg-card"
                onClick={handleOpen}
                style={{
                  border: '1px solid hsl(var(--border) / 0.5)',
                  aspectRatio: '0.85/1',
                }}
              >
                {/* Hero Feature Area (Full Bleed Logo) */}
                <div className="relative h-[65%] w-full flex items-center justify-center bg-secondary/5 overflow-hidden transition-all duration-700">
                   {/* Full Bleed Background Logo (Crisp version) */}
                   {favicon && !isLocked ? (
                      <div className="absolute inset-0 z-0 flex items-center justify-center p-6 scale-90 group-hover:scale-100 transition-transform duration-700 ease-out">
                         <img 
                           src={favicon} 
                           alt="" 
                           className="w-full h-full object-contain filter drop-shadow-[0_10px_30px_rgba(0,0,0,0.15)] group-hover:drop-shadow-[0_20px_50px_rgba(0,0,0,0.15)] transition-all duration-700"
                           onError={(e) => (e.currentTarget.style.display = 'none')} 
                         />
                      </div>
                   ) : isLocked ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-warning/5 animate-pulse">
                         <Lock size={48} className="text-warning/20 stroke-[3px]" />
                      </div>
                   ) : (
                      <ExternalLink size={48} className="text-muted-foreground/10" />
                   )}

                   {/* Corner Accents */}
                   {link.pinned && (
                     <div className="absolute top-5 left-5 z-20 w-8 h-8 rounded-2xl flex items-center justify-center bg-primary text-primary-foreground shadow-xl transition-transform group-hover:scale-110">
                       <Pin size={12} strokeWidth={3} />
                     </div>
                   )}

                   <button
                     type="button"
                     onClick={(e) => {
                       e.stopPropagation();
                       void handleCopyLink();
                     }}
                     className="absolute top-3 right-3 z-20 w-9 h-9 rounded-full flex items-center justify-center text-primary transition-all active:scale-90 bg-background/60 backdrop-blur-md border border-primary/20 shadow-lg ring-1 ring-primary/5"
                   >
                     <Copy size={15} strokeWidth={3} />
                   </button>
                </div>

                {/* Typography Layer (Bottom) */}
                <div className="flex-1 px-6 pb-6 pt-3 flex flex-col justify-center items-center text-center">
                  <h3 className="font-extrabold text-[15px] leading-tight line-clamp-2 text-foreground transition-colors tracking-tight">
                    {isLocked ? 'PROTECTED LINK' : link.name}
                  </h3>
                  <div className="mt-2.5 flex items-center justify-center gap-2">
                     <span className="text-[10px] text-muted-foreground font-black uppercase tracking-[0.2em] leading-none opacity-50">
                        {isLocked ? 'locked' : getDomainFromUrl(link.url)}
                     </span>
                  </div>
                </div>

                {/* Bottom Border Accent */}
                <div className="absolute bottom-0 inset-x-0 h-1.5 transition-all duration-500 bg-primary/40 opacity-0 group-hover:opacity-100" />
              </div>
           ) : (
              <div
                className="ios-card-modern group flex items-center p-4 relative overflow-hidden active:scale-[0.98] transition-all cursor-pointer"
                onClick={handleOpen}
                style={{
                  background: 'hsl(var(--card) / 0.6)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid hsl(var(--border) / 0.5)',
                }}
              >
                <div className="flex items-center gap-4 w-full">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 overflow-hidden shadow-sm border border-border/10"
                    style={{ 
                      background: isLocked ? 'hsl(var(--warning) / 0.1)' : 'white', 
                      boxShadow: '0 4px 10px -4px rgba(0,0,0,0.08)'
                    }}>
                    {isLocked ? (
                      <Lock size={18} className="text-warning" />
                    ) : favicon ? (
                      <img src={favicon} alt="" className="w-7 h-7 object-contain" onError={(e) => (e.currentTarget.src = "")} />
                    ) : (
                      <ExternalLink size={18} className="text-primary/50" />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-[15.5px] truncate text-foreground/90 group-hover:text-primary transition-colors uppercase tracking-tight">
                        {isLocked ? '••••••••' : link.name}
                      </h3>
                      {link.pinned && <Pin size={11} className="text-orange-500 flex-shrink-0" strokeWidth={3} />}
                    </div>
                    <p className="text-[11px] text-muted-foreground/50 truncate mt-1 font-bold uppercase tracking-wider">
                      {isLocked ? 'security active' : getDomainFromUrl(link.url)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleCopyLink();
                      }}
                      className="w-10 h-10 rounded-full flex items-center justify-center text-primary transition-all active:scale-95 bg-primary/5 border border-primary/10 shadow-sm"
                    >
                      <Copy size={16} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
              </div>
           )}

           {/* Hidden UI Layers */}
           <EditLinkModal link={link} isOpen={showEditModal} onClose={() => setShowEditModal(false)} onSave={onRefresh} />
           {showDeleteConfirm && createPortal(
             <div className="fixed inset-0 z-[250] flex items-end justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setShowDeleteConfirm(false)}>
                <div className="w-full max-w-md bg-card rounded-[2.5rem] p-7 pt-9 pb-10 space-y-6 animate-in slide-in-from-bottom-10 border border-border/10 duration-300 shadow-2xl" onClick={e => e.stopPropagation()}>
                   <div className="text-center space-y-2">
                      <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4"><Trash2 size={28} className="text-destructive" /></div>
                      <h2 className="text-xl font-bold tracking-tight">Delete Link?</h2>
                      <p className="text-sm text-muted-foreground px-4 leading-relaxed">Remove "<span className="font-semibold text-foreground">{link.name}</span>"?</p>
                   </div>
                   <div className="grid grid-cols-2 gap-4 pt-4">
                      <button onClick={() => setShowDeleteConfirm(false)} className="h-14 rounded-2xl bg-secondary/50 font-bold active:scale-95 transition-all">Cancel</button>
                      <button onClick={handleDelete} className="h-14 rounded-2xl bg-destructive text-white font-black active:scale-95 transition-all">Delete</button>
                   </div>
                </div>
             </div>,
             document.body
           )}
           {showUnlockPrompt && createPortal(
              <div className="fixed inset-0 z-[250] flex items-end justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => { setShowUnlockPrompt(false); setPinInput(''); }}>
                <div className="w-full max-w-md bg-card rounded-[2.5rem] p-7 pt-9 pb-10 space-y-6 animate-in slide-in-from-bottom-10 border border-border/10 duration-300 shadow-2xl" onClick={e => e.stopPropagation()}>
                   <div className="text-center space-y-2">
                      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4"><KeyRound size={28} className="text-primary" /></div>
                      <h2 className="text-xl font-bold tracking-tight">Unlock Link</h2>
                      <p className="text-sm text-muted-foreground px-6">Enter PIN for <span className="font-semibold text-foreground">{link.name}</span></p>
                   </div>
                   <div className="space-y-6">
                      <input type="password" inputMode="numeric" pattern="[0-9]*" autoFocus value={pinInput} onChange={(e) => setPinInput(e.target.value)} placeholder="0000" className="w-full h-16 rounded-2xl text-center text-3xl font-black tracking-[0.5em] bg-secondary/30 focus:bg-background border-0 focus:ring-2 focus:ring-primary/40 transition-all font-mono" maxLength={6} />
                      <div className="grid grid-cols-2 gap-4">
                         <button onClick={() => { setShowUnlockPrompt(false); setPinInput(''); }} className="h-14 rounded-2xl bg-secondary/50 font-bold active:scale-95 transition-all">Cancel</button>
                         <button onClick={handleUnlock} className="h-14 rounded-2xl bg-primary text-white font-black shadow-lg shadow-primary/20 active:scale-95 transition-all">Unlock</button>
                      </div>
                   </div>
                </div>
              </div>,
              document.body
           )}
           {showSetPinPrompt && createPortal(
              <div className="fixed inset-0 z-[250] flex items-end justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => { setShowSetPinPrompt(false); setNewPinInput(''); }}>
                <div className="w-full max-w-md bg-card rounded-[2.5rem] p-7 pt-9 pb-10 space-y-6 animate-in slide-in-from-bottom-10 border border-border/10 duration-300 shadow-2xl" onClick={e => e.stopPropagation()}>
                   <div className="text-center space-y-2">
                      <div className="w-16 h-16 rounded-full bg-warning/10 flex items-center justify-center mx-auto mb-4"><Lock size={28} className="text-warning" /></div>
                      <h2 className="text-xl font-bold tracking-tight">Enable Security</h2>
                      <p className="text-sm text-muted-foreground px-6">Set a PIN for <span className="font-semibold text-foreground">{link.name}</span></p>
                   </div>
                   <div className="space-y-6 pt-2">
                      <input 
                        type="text" 
                        inputMode="numeric" 
                        pattern="[0-9]*" 
                        maxLength={6} 
                        autoFocus 
                        value={newPinInput} 
                        onChange={(e) => setNewPinInput(e.target.value)} 
                        placeholder="PIN (Optional)" 
                        className={cn(
                          "w-full h-16 rounded-2xl text-center text-3xl font-black bg-secondary/30 focus:bg-background border-0 focus:ring-2 focus:ring-primary/40 transition-all font-mono",
                          newPinInput.length > 0 ? "tracking-[0.5em]" : "tracking-normal text-lg opacity-50"
                        )}
                      />
                      <div className="grid grid-cols-2 gap-4">
                         <button onClick={() => { setShowSetPinPrompt(false); setNewPinInput(''); }} className="h-14 rounded-2xl bg-secondary/50 font-bold active:scale-95 transition-all">Cancel</button>
                         <button onClick={handleSetPin} className="h-14 rounded-2xl bg-primary text-white font-black shadow-lg shadow-primary/20 active:scale-95 transition-all">Apply</button>
                      </div>
                   </div>
                </div>
              </div>,
              document.body
           )}
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="glass-card border-border/50 min-w-[210px] p-2 rounded-2xl shadow-2xl z-[300]">
        <ContextMenuItem onSelect={handleOpen} className="flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all cursor-pointer">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            {isLocked ? <Unlock size={18} strokeWidth={2.5} /> : <ExternalLink size={18} strokeWidth={2.5} />}
          </div>
          <span className="font-bold text-[15px] tracking-tight">{isLocked ? 'Unlock Link' : 'Open Link'}</span>
        </ContextMenuItem>
        
        <ContextMenuItem onSelect={handleCopyLink} className="flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all cursor-pointer">
          <div className="w-9 h-9 rounded-lg bg-secondary/80 flex items-center justify-center text-muted-foreground">
            <Copy size={18} strokeWidth={2.5} />
          </div>
          <span className="font-bold text-[15px] tracking-tight">Copy Link</span>
        </ContextMenuItem>

        <ContextMenuSeparator className="my-2 bg-border/40" />

        {link.groupId && (
          <ContextMenuItem onSelect={handleMoveToLibrary} className="flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all cursor-pointer">
            <div className="w-9 h-9 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-500">
              <ExternalLink size={18} strokeWidth={2.5} className="rotate-180" />
            </div>
            <span className="font-bold text-[15px] tracking-tight">Move to Library</span>
          </ContextMenuItem>
        )}

        <ContextMenuItem onSelect={handleTogglePin} className="flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all cursor-pointer">
           <div className="w-9 h-9 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-500">
             {link.pinned ? <PinOff size={18} strokeWidth={2.5} /> : <Pin size={18} strokeWidth={2.5} />}
           </div>
           <span className="font-bold text-[15px] tracking-tight">{link.pinned ? 'Unpin' : 'Pin to Top'}</span>
        </ContextMenuItem>

        <ContextMenuItem onSelect={handleToggleLock} className="flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all cursor-pointer">
           <div className="w-9 h-9 rounded-lg bg-warning/10 flex items-center justify-center text-warning">
             {link.locked ? <Unlock size={18} strokeWidth={2.5} /> : <Lock size={18} strokeWidth={2.5} />}
           </div>
           <span className="font-bold text-[15px] tracking-tight">{link.locked ? 'Disable Lock' : 'Enable Security'}</span>
        </ContextMenuItem>

        <ContextMenuItem onSelect={() => setShowEditModal(true)} className="flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all cursor-pointer">
           <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
             <Edit size={18} strokeWidth={2.5} />
           </div>
           <span className="font-bold text-[15px] tracking-tight">Edit details</span>
        </ContextMenuItem>

        <ContextMenuSeparator className="my-2 bg-border/40" />

        <ContextMenuItem onSelect={() => setShowDeleteConfirm(true)} className="flex items-center gap-3 px-3.5 py-3 rounded-xl text-destructive focus:bg-destructive/10 focus:text-destructive transition-all cursor-pointer">
           <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center text-destructive">
             <Trash2 size={18} strokeWidth={2.5} />
           </div>
           <span className="font-bold text-[15px] tracking-tight">Remove Link</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};
