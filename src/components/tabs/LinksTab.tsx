
import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Plus, Search, Folder, ExternalLink, Pin, X, Bookmark, Globe, LayoutGrid, List, Lock } from 'lucide-react';
import { getLinks, getGroups, LinkItem, LinkGroup, FREE_LIMITS } from '@/lib/storage';
import { AddLinkModal } from '@/components/modals/AddLinkModal';
import { AddGroupModal } from '@/components/modals/AddGroupModal';
import { LinkCard } from '@/components/LinkCard';
import { GroupCard } from '@/components/GroupCard';
import { GroupModal } from '@/components/modals/GroupModal';
import { AccountQuickButton } from '@/components/AccountQuickButton';
import { useBannerAd } from '@/hooks/useBannerAd';
import { useProGate } from '@/hooks/useProGate';
import { requestProUpgrade } from '@/lib/proAccess';
import { cn } from '@/lib/utils';

interface LinksTabProps {
  onOpenAccount: () => void;
  onBack?: () => void;
  bannerAdActive?: boolean;
}

export const LinksTab = ({ onOpenAccount, onBack, bannerAdActive = true }: LinksTabProps) => {
  useBannerAd(bannerAdActive);
  const { isPro } = useProGate();
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [groups, setGroups] = useState<LinkGroup[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showAddLinkModal, setShowAddLinkModal] = useState(false);
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<LinkGroup | null>(null);
  const [linkViewMode, setLinkViewMode] = useState<'list' | 'grid'>(() => {
    return (localStorage.getItem('splitmate_links_view') as 'list' | 'grid') || 'list';
  });

  const loadData = () => {
    setLinks(getLinks());
    setGroups(getGroups());
  };

  useEffect(() => {
    loadData();
    const handleTriggerAdd = (e: any) => {
      if (e.detail?.tabId === 'links') setShowAddLinkModal(true);
    };
    window.addEventListener('splitmate_trigger_add', handleTriggerAdd);
    return () => window.removeEventListener('splitmate_trigger_add', handleTriggerAdd);
  }, []);

  const q = searchQuery.toLowerCase().trim();

  const allLinks = useMemo(() => {
    const filtered = links
      .filter(link => !link.groupId && (!q || link.name.toLowerCase().includes(q) || link.url.toLowerCase().includes(q)))
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

    const pinned = filtered.filter(l => l.pinned);
    const unpinned = filtered.filter(l => !l.pinned);
    return [...pinned, ...unpinned];
  }, [links, q]);

  const allGroups = useMemo(() => {
    const filtered = groups
      .filter(group =>
        !q ||
        group.name.toLowerCase().includes(q) ||
        links.some(link => link.groupId === group.id && (link.name.toLowerCase().includes(q) || link.url.toLowerCase().includes(q)))
      )
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

    const pinned = filtered.filter(g => g.pinned);
    const unpinned = filtered.filter(g => !g.pinned);
    return [...pinned, ...unpinned];
  }, [groups, links, q]);
  const hasContent = allGroups.length > 0 || allLinks.length > 0;
  const totalItems = links.filter(l => !l.groupId).length + groups.length;

  return (
    <div className="p-4 space-y-4 pb-20">
      {/* Header */}
      <div className="pt-4 pb-1">
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-2.5">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="w-9 h-9 rounded-xl flex items-center justify-center mt-0.5"
                style={{ background: 'hsl(var(--secondary))', border: '1px solid hsl(var(--border) / 0.3)' }}
                aria-label="Back"
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <div>
              <h1 className="text-2xl font-bold">Links</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {totalItems > 0 ? `${groups.length} groups · ${links.filter(l => !l.groupId).length} links` : 'Your bookmarks & groups'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {totalItems > 0 && (
              <button
                onClick={() => { setShowSearch(!showSearch); if (showSearch) setSearchQuery(''); }}
                className="w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-200"
                style={{
                  background: showSearch ? 'hsl(var(--primary) / 0.15)' : 'hsl(var(--secondary))',
                  border: `1px solid ${showSearch ? 'hsl(var(--primary) / 0.3)' : 'hsl(var(--border) / 0.4)'}`,
                }}
              >
                {showSearch ? <X size={16} className="text-primary" /> : <Search size={16} className="text-muted-foreground" />}
              </button>
            )}
            <button
              onClick={() => setShowAddGroupModal(true)}
              className="w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-200"
              style={{ background: 'hsl(var(--secondary))', border: '1px solid hsl(var(--border) / 0.4)' }}
            >
              <Folder size={17} className="text-muted-foreground" />
            </button>

            {!onBack && <AccountQuickButton onClick={onOpenAccount} />}
          </div>
        </div>
      </div>

      {/* Search (toggle) */}
      {showSearch && (
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            placeholder="Search links & groups..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 h-11 rounded-2xl text-sm bg-card/50 border border-border/30 outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/15 transition-all"
          />
        </div>
      )}

      {/* Groups Section */}
      {allGroups.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-muted-foreground text-[11px] uppercase tracking-widest px-0.5 flex items-center gap-1.5">
            <Folder size={11} /> Groups
            <span className="text-muted-foreground/50 ml-auto text-[10px] font-medium normal-case tracking-normal">{allGroups.length}</span>
          </h3>
          <div className="grid grid-cols-2 gap-4">
            {allGroups.map((group, index) => {
              const isLockedGroup = !isPro && index >= FREE_LIMITS.MAX_LINK_GROUPS;
              return (
                <div key={group.id} className="relative">
                  <div className={cn(isLockedGroup && 'opacity-40 pointer-events-none')}>
                    <GroupCard
                      group={group}
                      onClick={() => setSelectedGroup(group)}
                      onRefresh={loadData}
                    />
                  </div>
                  {isLockedGroup && (
                    <button
                      type="button"
                      onClick={() => requestProUpgrade('link-groups', 'Free users can use 1 link group. Upgrade to Pro for unlimited groups.')}
                      className="absolute inset-0 z-10"
                      aria-label="Upgrade to unlock this group"
                    >
                      <span className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/55 border border-white/20 flex items-center justify-center">
                        <Lock size={12} className="text-white" />
                      </span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Links Section */}
      {allLinks.length > 0 && (
        <div className="space-y-3">
          <div className="font-semibold text-muted-foreground text-[11px] uppercase tracking-widest px-0.5 flex items-center gap-1.5">
            <Globe size={11} /> Links
            <div className="ml-auto flex items-center gap-2.5">
              <div className="flex bg-secondary/80 p-1 rounded-xl border border-border/20 backdrop-blur-sm">
                <button
                  onClick={() => {
                    setLinkViewMode('list');
                    localStorage.setItem('splitmate_links_view', 'list');
                  }}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300"
                  style={{
                    background: linkViewMode === 'list' ? 'hsl(var(--card))' : 'transparent',
                    boxShadow: linkViewMode === 'list' ? '0 2px 8px -4px hsl(var(--foreground) / 0.15)' : 'none',
                    color: linkViewMode === 'list' ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.6)'
                  }}
                >
                  <List size={15} />
                </button>
                <button
                  onClick={() => {
                    setLinkViewMode('grid');
                    localStorage.setItem('splitmate_links_view', 'grid');
                  }}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300"
                  style={{
                    background: linkViewMode === 'grid' ? 'hsl(var(--card))' : 'transparent',
                    boxShadow: linkViewMode === 'grid' ? '0 2px 8px -4px hsl(var(--foreground) / 0.15)' : 'none',
                    color: linkViewMode === 'grid' ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.6)'
                  }}
                >
                  <LayoutGrid size={15} />
                </button>
              </div>
              <span className="text-muted-foreground/40 font-bold text-[10px] tracking-normal mb-0.5">{allLinks.length}</span>
            </div>
          </div>
          <div className={linkViewMode === 'grid' ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-2'}>
            {allLinks.map((link, idx) => {
              const isLockedLink = !isPro && idx >= FREE_LIMITS.MAX_LINKS;
              return (
                <div key={link.id} className="contents">
                  <div className="relative">
                    <div className={cn(isLockedLink && 'opacity-40 pointer-events-none')}>
                      <LinkCard
                        link={link}
                        onRefresh={loadData}
                        viewMode={linkViewMode}
                      />
                    </div>
                    {isLockedLink && (
                      <button
                        type="button"
                        onClick={() => requestProUpgrade('links', 'Free users can save up to 4 links. Upgrade to Pro for unlimited links.')}
                        className="absolute inset-0 z-10"
                        aria-label="Upgrade to unlock this link"
                      >
                        <span className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/55 border border-white/20 flex items-center justify-center">
                          <Lock size={12} className="text-white" />
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!hasContent && !searchQuery && (
        <div className="flex flex-col items-center justify-center pt-16 pb-8">
          <div className="relative mb-6">
            <div className="w-20 h-20 rounded-[1.75rem] flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, hsl(var(--primary) / 0.12), hsl(var(--accent) / 0.08))',
                border: '1px solid hsl(var(--primary) / 0.1)',
              }}>
              <Bookmark size={32} className="text-primary/60" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border) / 0.4)' }}>
              <Globe size={14} className="text-muted-foreground" />
            </div>
          </div>
          <h3 className="text-lg font-bold mb-1">Save your links</h3>
          <p className="text-sm text-muted-foreground text-center max-w-[240px] mb-7 leading-relaxed">
            Bookmark websites, organize with groups, and access them anytime
          </p>
          <div className="flex gap-2.5">
            <button
              onClick={() => setShowAddGroupModal(true)}
              className="px-5 py-3 rounded-2xl text-sm font-semibold flex items-center gap-2"
              style={{ background: 'hsl(var(--secondary))', border: '1px solid hsl(var(--border) / 0.4)' }}
            >
              <Folder size={15} /> New Group
            </button>
            <button
              onClick={() => setShowAddLinkModal(true)}
              className="px-5 py-3 rounded-2xl text-sm font-semibold flex items-center gap-2"
              style={{
                background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary-glow)))',
                color: 'white',
                boxShadow: '0 4px 14px -4px hsl(var(--primary) / 0.5)',
              }}
            >
              <Plus size={15} /> Add Link
            </button>
          </div>
        </div>
      )}

      {/* No Search Results */}
      {!hasContent && searchQuery && (
        <div className="flex flex-col items-center pt-16 pb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'hsl(var(--muted) / 0.4)' }}>
            <Search size={22} className="text-muted-foreground/60" />
          </div>
          <p className="font-semibold text-sm">No results found</p>
          <p className="text-xs text-muted-foreground mt-1">Nothing matches "{searchQuery}"</p>
        </div>
      )}

      {/* Modals */}
      <AddLinkModal isOpen={showAddLinkModal} onClose={() => setShowAddLinkModal(false)} onAdd={loadData} />
      <AddGroupModal isOpen={showAddGroupModal} onClose={() => setShowAddGroupModal(false)} onAdd={loadData} />
      {selectedGroup && (
        <GroupModal group={selectedGroup} isOpen={!!selectedGroup} onClose={() => setSelectedGroup(null)} onRefresh={loadData} />
      )}
    </div>
  );
};
