
import { useState } from 'react';
import { Edit, Loader, Lock as LockIcon, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { saveLink, fetchLinkMetadata, getGroups, LinkItem } from '@/lib/storage';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface EditLinkModalProps {
  link: LinkItem;
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

export const EditLinkModal = ({ link, isOpen, onClose, onSave }: EditLinkModalProps) => {
  const { toast } = useToast();
  const [name, setName] = useState(link.name);
  const [url, setUrl] = useState(link.url);
  const [groupId, setGroupId] = useState(link.groupId || 'none');
  const [isLoading, setIsLoading] = useState(false);

  const groups = getGroups();

  const [isLocked, setIsLocked] = useState(link.locked || false);
  const [pin, setPin] = useState(link.pin || '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;

    setIsLoading(true);
    try {
      const validUrl = url.startsWith('http') ? url : `https://${url}`;
      let metadata = {};
      
      // Fetch new metadata if URL changed
      if (validUrl !== link.url) {
        metadata = await fetchLinkMetadata(validUrl);
      }

      const updatedLink = {
        ...link,
        name: name.trim(),
        url: validUrl,
        groupId: groupId === 'none' ? undefined : groupId,
        locked: isLocked,
        pin: isLocked ? pin.trim() : undefined,
        ...metadata
      };

      saveLink(updatedLink);
      onSave();
      onClose();

      toast({
        title: "Link Updated",
        description: `${name} has been updated successfully.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update link. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div 
        className="w-full max-w-lg bg-card rounded-t-[2.5rem] p-7 pt-9 pb-16 space-y-6 animate-in slide-in-from-bottom-20 duration-300 shadow-2xl relative"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
           <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                 <Edit size={20} className="text-primary" />
              </div>
              <div>
                 <h2 className="text-xl font-bold tracking-tight">Edit Link</h2>
                 <p className="text-xs text-muted-foreground">Update link details</p>
              </div>
           </div>
           <button onClick={onClose} className="w-10 h-10 rounded-full bg-secondary/50 flex items-center justify-center hover:bg-secondary transition-colors">
              <X size={18} />
           </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2 px-1">
            <Label htmlFor="editName" className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Name</Label>
            <Input
              id="editName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter link name"
              className="input-liquid h-14 rounded-2xl bg-secondary/30 focus:bg-background transition-all"
              required
            />
          </div>

          <div className="space-y-2 px-1">
            <Label htmlFor="editUrl" className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">URL</Label>
            <Input
              id="editUrl"
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="example.com or https://..."
              className="input-liquid h-14 rounded-2xl bg-secondary/30 focus:bg-background transition-all"
              required
            />
          </div>

          {groups.length > 0 && (
            <div className="space-y-3 px-1">
              <Label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Group (Optional)</Label>
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none -mx-1 px-1">
                <button
                  type="button"
                  onClick={() => setGroupId('none')}
                  className={cn(
                    "flex-shrink-0 px-4 py-2.5 rounded-xl text-xs font-bold transition-all border",
                    groupId === 'none' 
                      ? "bg-foreground text-background border-foreground shadow-md scale-105" 
                      : "bg-secondary/30 text-muted-foreground border-transparent hover:bg-secondary/50"
                  )}
                >
                  No Group
                </button>
                {groups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => setGroupId(group.id)}
                    className={cn(
                      "flex-shrink-0 px-4 py-2.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-2",
                      groupId === group.id 
                        ? "bg-foreground text-background border-foreground shadow-md scale-105" 
                        : "bg-secondary/30 text-muted-foreground border-transparent hover:bg-secondary/50"
                    )}
                  >
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: group.color }} />
                    {group.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="ios-card-modern p-5 space-y-4" style={{ background: 'hsl(var(--warning) / 0.04)', border: '1px solid hsl(var(--warning) / 0.15)', borderRadius: '1.5rem' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                  isLocked ? "bg-warning/20 text-warning" : "bg-secondary text-muted-foreground"
                )}>
                  <LockIcon size={20} />
                </div>
                <div>
                  <Label className="font-bold cursor-pointer text-sm mb-0.5 block" htmlFor="lock-link-edit">Lock this Link</Label>
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight">Access protection</p>
                </div>
              </div>
              <div 
                onClick={() => setIsLocked(!isLocked)}
                className={cn(
                  "w-12 h-6 rounded-full relative transition-all duration-300 cursor-pointer p-1",
                  isLocked ? "bg-warning" : "bg-secondary"
                )}
              >
                <div className={cn(
                  "w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-300 transform",
                  isLocked ? "translate-x-6" : "translate-x-0"
                )} />
              </div>
            </div>
            
            {isLocked && (
              <div className="pt-4 animate-in slide-in-from-top-4 duration-300 border-t border-warning/10 space-y-2">
                <p className="text-[10px] uppercase font-black tracking-widest text-warning/70 ml-1">SET OPTIONAL PIN</p>
                <input
                  id="link-pin-edit"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="Leave empty for one-tap"
                  className="w-full h-14 rounded-2xl px-4 text-center text-2xl font-black tracking-[0.4em] bg-background border border-warning/10 focus:ring-2 focus:ring-warning/20 transition-all placeholder:text-[11px] placeholder:tracking-normal placeholder:font-normal placeholder:opacity-50"
                  maxLength={6}
                  inputMode="numeric"
                />
              </div>
            )}
          </div>

          <div className="flex gap-4 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-14 rounded-2xl bg-secondary/50 text-secondary-foreground font-bold hover:bg-secondary transition-all active:scale-[0.97]"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-[2] h-14 rounded-2xl bg-primary text-primary-foreground font-black hover:brightness-110 transition-all active:scale-[0.97] disabled:opacity-50"
              disabled={isLoading || !name.trim() || !url.trim()}
            >
              {isLoading ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader size={18} className="animate-spin" />
                  <span>Saving...</span>
                </div>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
