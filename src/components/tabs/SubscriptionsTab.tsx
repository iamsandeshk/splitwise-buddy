
import { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Repeat, 
  Calendar, 
  Trash2, 
  ExternalLink, 
  Search, 
  Plus, 
  LayoutGrid, 
  ChevronRight, 
  ChevronLeft,
  ArrowLeft, 
  AlertCircle,
  Clock,
  Settings2,
  Filter,
  ArrowUpRight,
  Pause,
  Play,
  X as CloseIcon,
  Lock
} from 'lucide-react';
import { MoneyDisplay } from '@/components/MoneyDisplay';
import { generateId, getSubscriptions, saveSubscriptions, getAccountSummaries, getDefaultAccountId, savePersonalExpense, processSubscriptionBilling, consumePendingOpenItem, type SubscriptionCycle, type SubscriptionItem, type PersonalExpense, getCurrency, FREE_LIMITS } from '@/lib/storage';
import { AddFirstAccountModal } from '@/components/modals/AddFirstAccountModal';
import { cn } from '@/lib/utils';
import { AccountQuickButton } from '@/components/AccountQuickButton';
import { useBackHandler } from '@/hooks/useBackHandler';
import { NativeAdCard } from '@/components/NativeAdCard';
import { useBannerAd } from '@/hooks/useBannerAd';
import { useProGate } from '@/hooks/useProGate';
import { requestProUpgrade } from '@/lib/proAccess';

interface SubscriptionsTabProps {
  onOpenAccount: () => void;
  onBack?: () => void;
  bannerAdActive?: boolean;
}

interface CatalogService {
  name: string;
  category: string;
  logoUrl: string;
  fallbackLogo: string;
}

const SERVICE_CATEGORIES = [
  'All',
  'AI',
  'India & Lifestyle',
  'Streaming',
  'Cloud & Storage',
  'Design & Dev',
  'Social & Gaming',
  'Learning & Fitness',
  'Security & VPN'
] as const;

const COMMON_SUBSCRIPTIONS: CatalogService[] = [
  // --- AI ---
  { name: 'Claude', category: 'AI', logoUrl: 'https://cdn.simpleicons.org/claude/D97706', fallbackLogo: 'https://www.google.com/s2/favicons?domain=claude.ai&sz=128' },
  { name: 'Gemini', category: 'AI', logoUrl: 'https://cdn.simpleicons.org/googlegemini/8E75FF', fallbackLogo: 'https://www.google.com/s2/favicons?domain=gemini.google.com&sz=128' },
  { name: 'Perplexity', category: 'AI', logoUrl: 'https://cdn.simpleicons.org/perplexity/20B2AA', fallbackLogo: 'https://www.google.com/s2/favicons?domain=perplexity.ai&sz=128' },
  { name: 'GitHub Copilot', category: 'AI', logoUrl: 'https://cdn.simpleicons.org/githubcopilot/FFFFFF', fallbackLogo: 'https://www.google.com/s2/favicons?domain=github.com&sz=128' },
  { name: 'Cursor', category: 'AI', logoUrl: 'https://www.google.com/s2/favicons?domain=cursor.com&sz=128', fallbackLogo: 'https://www.google.com/s2/favicons?domain=cursor.sh&sz=128' },
  { name: 'Midjourney', category: 'AI', logoUrl: 'https://cdn.simpleicons.org/midjourney/FFFFFF', fallbackLogo: 'https://www.google.com/s2/favicons?domain=midjourney.com&sz=128' },
  { name: 'ElevenLabs', category: 'AI', logoUrl: 'https://cdn.simpleicons.org/elevenlabs/FFFFFF', fallbackLogo: 'https://www.google.com/s2/favicons?domain=elevenlabs.io&sz=128' },
  { name: 'Microsoft Copilot', category: 'AI', logoUrl: 'https://www.google.com/s2/favicons?domain=microsoft.com&sz=128', fallbackLogo: 'https://www.google.com/s2/favicons?domain=microsoft.com&sz=128' },
  { name: 'ChatGPT', category: 'AI', logoUrl: 'https://cdn.simpleicons.org/openai/10A37F', fallbackLogo: 'https://www.google.com/s2/favicons?domain=openai.com&sz=128' },

  // --- India & Lifestyle ---
  { name: 'JioHotstar', category: 'India & Lifestyle', logoUrl: 'https://www.google.com/s2/favicons?domain=hotstar.com&sz=128', fallbackLogo: 'https://www.google.com/s2/favicons?domain=jiohotstar.com&sz=128' },
  { name: 'SonyLIV', category: 'India & Lifestyle', logoUrl: 'https://www.google.com/s2/favicons?domain=sonyliv.com&sz=128', fallbackLogo: 'https://www.google.com/s2/favicons?domain=sony.com&sz=128' },
  { name: 'ZEE5', category: 'India & Lifestyle', logoUrl: 'https://www.google.com/s2/favicons?domain=zee5.com&sz=128', fallbackLogo: 'https://www.google.com/s2/favicons?domain=zee.com&sz=128' },
  { name: 'JioSaavn', category: 'India & Lifestyle', logoUrl: 'https://www.google.com/s2/favicons?domain=jiosaavn.com&sz=128', fallbackLogo: 'https://www.google.com/s2/favicons?domain=saavn.com&sz=128' },
  { name: 'Gaana', category: 'India & Lifestyle', logoUrl: 'https://www.google.com/s2/favicons?domain=gaana.com&sz=128', fallbackLogo: 'https://www.google.com/s2/favicons?domain=gaana.com&sz=128' },
  { name: 'MX Player', category: 'India & Lifestyle', logoUrl: 'https://www.google.com/s2/favicons?domain=mxplayer.in&sz=128', fallbackLogo: 'https://www.google.com/s2/favicons?domain=mxplayer.in&sz=128' },
  { name: 'Sun NXT', category: 'India & Lifestyle', logoUrl: 'https://www.google.com/s2/favicons?domain=sunnxt.com&sz=128', fallbackLogo: 'https://www.google.com/s2/favicons?domain=sunnxt.com&sz=128' },
  { name: 'Hoichoi', category: 'India & Lifestyle', logoUrl: 'https://www.google.com/s2/favicons?domain=hoichoi.tv&sz=128', fallbackLogo: 'https://www.google.com/s2/favicons?domain=hoichoi.tv&sz=128' },
  { name: 'Aha', category: 'India & Lifestyle', logoUrl: 'https://www.google.com/s2/favicons?domain=aha.video&sz=128', fallbackLogo: 'https://www.google.com/s2/favicons?domain=aha.video&sz=128' },
  { name: 'Airtel Xstream Play', category: 'India & Lifestyle', logoUrl: 'https://www.google.com/s2/favicons?domain=airtelxstream.in&sz=128', fallbackLogo: 'https://www.google.com/s2/favicons?domain=airtel.in&sz=128' },
  { name: 'Tata Play Binge', category: 'India & Lifestyle', logoUrl: 'https://www.google.com/s2/favicons?domain=tataplaybinge.com&sz=128', fallbackLogo: 'https://www.google.com/s2/favicons?domain=tataplay.com&sz=128' },
  { name: 'Times Prime', category: 'India & Lifestyle', logoUrl: 'https://www.google.com/s2/favicons?domain=timesprime.com&sz=128', fallbackLogo: 'https://www.google.com/s2/favicons?domain=timesprime.com&sz=128' },
  { name: 'Cult.fit', category: 'India & Lifestyle', logoUrl: 'https://www.google.com/s2/favicons?domain=cult.fit&sz=128', fallbackLogo: 'https://www.google.com/s2/favicons?domain=cure.fit&sz=128' },
  { name: 'Swiggy One', category: 'India & Lifestyle', logoUrl: 'https://cdn.simpleicons.org/swiggy/FC8019', fallbackLogo: 'https://www.google.com/s2/favicons?domain=swiggy.com&sz=128' },
  { name: 'Zomato Gold', category: 'India & Lifestyle', logoUrl: 'https://cdn.simpleicons.org/zomato/CB202D', fallbackLogo: 'https://www.google.com/s2/favicons?domain=zomato.com&sz=128' },

  // --- Streaming ---
  { name: 'Netflix', category: 'Streaming', logoUrl: 'https://cdn.simpleicons.org/netflix/E50914', fallbackLogo: 'https://www.google.com/s2/favicons?domain=netflix.com&sz=128' },
  { name: 'Spotify', category: 'Streaming', logoUrl: 'https://cdn.simpleicons.org/spotify/1DB954', fallbackLogo: 'https://www.google.com/s2/favicons?domain=spotify.com&sz=128' },
  { name: 'YouTube Premium', category: 'Streaming', logoUrl: 'https://cdn.simpleicons.org/youtube/FF0000', fallbackLogo: 'https://www.google.com/s2/favicons?domain=youtube.com&sz=128' },
  { name: 'Prime Video', category: 'Streaming', logoUrl: 'https://cdn.simpleicons.org/prime/00A8E1', fallbackLogo: 'https://www.google.com/s2/favicons?domain=primevideo.com&sz=128' },
  { name: 'Apple Music', category: 'Streaming', logoUrl: 'https://cdn.simpleicons.org/applemusic/FA243C', fallbackLogo: 'https://www.google.com/s2/favicons?domain=music.apple.com&sz=128' },
  { name: 'Disney+', category: 'Streaming', logoUrl: 'https://cdn.simpleicons.org/disneyplus/113CCF', fallbackLogo: 'https://www.google.com/s2/favicons?domain=disneyplus.com&sz=128' },
  { name: 'Crunchyroll', category: 'Streaming', logoUrl: 'https://cdn.simpleicons.org/crunchyroll/F47521', fallbackLogo: 'https://www.google.com/s2/favicons?domain=crunchyroll.com&sz=128' },
  { name: 'HBO Max', category: 'Streaming', logoUrl: 'https://cdn.simpleicons.org/max/002BE7', fallbackLogo: 'https://www.google.com/s2/favicons?domain=max.com&sz=128' },
  { name: 'Apple TV+', category: 'Streaming', logoUrl: 'https://cdn.simpleicons.org/appletv/FFFFFF', fallbackLogo: 'https://www.google.com/s2/favicons?domain=tv.apple.com&sz=128' },
  { name: 'Paramount+', category: 'Streaming', logoUrl: 'https://cdn.simpleicons.org/paramountplus/0064FF', fallbackLogo: 'https://www.google.com/s2/favicons?domain=paramountplus.com&sz=128' },
  { name: 'MUBI', category: 'Streaming', logoUrl: 'https://cdn.simpleicons.org/mubi/FFFFFF', fallbackLogo: 'https://www.google.com/s2/favicons?domain=mubi.com&sz=128' },
  { name: 'Amazon Music', category: 'Streaming', logoUrl: 'https://cdn.simpleicons.org/amazonmusic/00A8E1', fallbackLogo: 'https://www.google.com/s2/favicons?domain=music.amazon.com&sz=128' },
  { name: 'Audible', category: 'Streaming', logoUrl: 'https://cdn.simpleicons.org/audible/F8991D', fallbackLogo: 'https://www.google.com/s2/favicons?domain=audible.com&sz=128' },
  { name: 'Kindle Unlimited', category: 'Streaming', logoUrl: 'https://cdn.simpleicons.org/amazon/FF9900', fallbackLogo: 'https://www.google.com/s2/favicons?domain=amazon.com&sz=128' },

  // --- Cloud & Storage ---
  { name: 'Google One', category: 'Cloud & Storage', logoUrl: 'https://cdn.simpleicons.org/google/4285F4', fallbackLogo: 'https://www.google.com/s2/favicons?domain=one.google.com&sz=128' },
  { name: 'Dropbox', category: 'Cloud & Storage', logoUrl: 'https://cdn.simpleicons.org/dropbox/0061FF', fallbackLogo: 'https://www.google.com/s2/favicons?domain=dropbox.com&sz=128' },
  { name: 'Microsoft 365', category: 'Cloud & Storage', logoUrl: 'https://www.google.com/s2/favicons?domain=office.com&sz=128', fallbackLogo: 'https://www.google.com/s2/favicons?domain=microsoft.com&sz=128' },
  { name: 'Proton', category: 'Cloud & Storage', logoUrl: 'https://cdn.simpleicons.org/proton/6D4AFF', fallbackLogo: 'https://www.google.com/s2/favicons?domain=proton.me&sz=128' },
  { name: 'Google Photos', category: 'Cloud & Storage', logoUrl: 'https://cdn.simpleicons.org/googlephotos/4285F4', fallbackLogo: 'https://www.google.com/s2/favicons?domain=photos.google.com&sz=128' },
  { name: 'iCloud', category: 'Cloud & Storage', logoUrl: 'https://cdn.simpleicons.org/icloud/3693F3', fallbackLogo: 'https://www.google.com/s2/favicons?domain=icloud.com&sz=128' },

  // --- Design & Dev ---
  { name: 'Notion', category: 'Design & Dev', logoUrl: 'https://cdn.simpleicons.org/notion/FFFFFF', fallbackLogo: 'https://www.google.com/s2/favicons?domain=notion.so&sz=128' },
  { name: 'Figma', category: 'Design & Dev', logoUrl: 'https://cdn.simpleicons.org/figma/F24E1E', fallbackLogo: 'https://www.google.com/s2/favicons?domain=figma.com&sz=128' },
  { name: 'Canva', category: 'Design & Dev', logoUrl: 'https://cdn.simpleicons.org/canva/00C4CC', fallbackLogo: 'https://www.google.com/s2/favicons?domain=canva.com&sz=128' },
  { name: 'Adobe Creative Cloud', category: 'Design & Dev', logoUrl: 'https://cdn.simpleicons.org/adobecreativecloud/DA1F26', fallbackLogo: 'https://www.google.com/s2/favicons?domain=adobe.com&sz=128' },
  { name: 'Adobe Photoshop', category: 'Design & Dev', logoUrl: 'https://cdn.simpleicons.org/adobephotoshop/31A8FF', fallbackLogo: 'https://www.google.com/s2/favicons?domain=adobe.com&sz=128' },
  { name: 'Adobe Premiere Pro', category: 'Design & Dev', logoUrl: 'https://cdn.simpleicons.org/adobepremierepro/9999FF', fallbackLogo: 'https://www.google.com/s2/favicons?domain=adobe.com&sz=128' },
  { name: 'Envato Elements', category: 'Design & Dev', logoUrl: 'https://cdn.simpleicons.org/envato/81B441', fallbackLogo: 'https://www.google.com/s2/favicons?domain=elements.envato.com&sz=128' },
  { name: 'Framer', category: 'Design & Dev', logoUrl: 'https://cdn.simpleicons.org/framer/0055FF', fallbackLogo: 'https://www.google.com/s2/favicons?domain=framer.com&sz=128' },
  { name: 'Freepik', category: 'Design & Dev', logoUrl: 'https://cdn.simpleicons.org/freepik/004080', fallbackLogo: 'https://www.google.com/s2/favicons?domain=freepik.com&sz=128' },
  { name: 'Grammarly', category: 'Design & Dev', logoUrl: 'https://cdn.simpleicons.org/grammarly/15C39A', fallbackLogo: 'https://www.google.com/s2/favicons?domain=grammarly.com&sz=128' },
  { name: 'JetBrains', category: 'Design & Dev', logoUrl: 'https://cdn.simpleicons.org/jetbrains/FFFFFF', fallbackLogo: 'https://www.google.com/s2/favicons?domain=jetbrains.com&sz=128' },
  { name: 'GitHub', category: 'Design & Dev', logoUrl: 'https://cdn.simpleicons.org/github/FFFFFF', fallbackLogo: 'https://www.google.com/s2/favicons?domain=github.com&sz=128' },

  // --- Social & Gaming ---
  { name: 'LinkedIn Premium', category: 'Social & Gaming', logoUrl: 'https://cdn.simpleicons.org/linkedin/0A66C2', fallbackLogo: 'https://www.google.com/s2/favicons?domain=linkedin.com&sz=128' },
  { name: 'X Premium', category: 'Social & Gaming', logoUrl: 'https://cdn.simpleicons.org/x/FFFFFF', fallbackLogo: 'https://www.google.com/s2/favicons?domain=x.com&sz=128' },
  { name: 'Instagram Meta Verified', category: 'Social & Gaming', logoUrl: 'https://cdn.simpleicons.org/instagram/E4405F', fallbackLogo: 'https://www.google.com/s2/favicons?domain=instagram.com&sz=128' },
  { name: 'PlayStation Plus', category: 'Social & Gaming', logoUrl: 'https://cdn.simpleicons.org/playstation/003791', fallbackLogo: 'https://www.google.com/s2/favicons?domain=playstation.com&sz=128' },
  { name: 'Xbox Game Pass', category: 'Social & Gaming', logoUrl: 'https://cdn.simpleicons.org/xbox/107C41', fallbackLogo: 'https://www.google.com/s2/favicons?domain=xbox.com&sz=128' },

  // --- Learning & Fitness ---
  { name: 'Duolingo Super', category: 'Learning & Fitness', logoUrl: 'https://cdn.simpleicons.org/duolingo/58CC02', fallbackLogo: 'https://www.google.com/s2/favicons?domain=duolingo.com&sz=128' },
  { name: 'Coursera Plus', category: 'Learning & Fitness', logoUrl: 'https://cdn.simpleicons.org/coursera/0056D2', fallbackLogo: 'https://www.google.com/s2/favicons?domain=coursera.org&sz=128' },
  { name: 'Udemy', category: 'Learning & Fitness', logoUrl: 'https://cdn.simpleicons.org/udemy/A435F0', fallbackLogo: 'https://www.google.com/s2/favicons?domain=udemy.com&sz=128' },
  { name: 'Skillshare', category: 'Learning & Fitness', logoUrl: 'https://cdn.simpleicons.org/skillshare/00FF84', fallbackLogo: 'https://www.google.com/s2/favicons?domain=skillshare.com&sz=128' },
  { name: 'Brilliant', category: 'Learning & Fitness', logoUrl: 'https://cdn.simpleicons.org/brilliant/FFFFFF', fallbackLogo: 'https://www.google.com/s2/favicons?domain=brilliant.org&sz=128' },
  { name: 'MasterClass', category: 'Learning & Fitness', logoUrl: 'https://www.google.com/s2/favicons?domain=masterclass.com&sz=128', fallbackLogo: 'https://www.google.com/s2/favicons?domain=masterclass.com&sz=128' },
  { name: 'Headspace', category: 'Learning & Fitness', logoUrl: 'https://cdn.simpleicons.org/headspace/F47D31', fallbackLogo: 'https://www.google.com/s2/favicons?domain=headspace.com&sz=128' },
  { name: 'Calm', category: 'Learning & Fitness', logoUrl: 'https://www.google.com/s2/favicons?domain=calm.com&sz=128', fallbackLogo: 'https://www.google.com/s2/favicons?domain=calm.com&sz=128' },
  { name: 'Strava', category: 'Learning & Fitness', logoUrl: 'https://cdn.simpleicons.org/strava/FC4C02', fallbackLogo: 'https://www.google.com/s2/favicons?domain=strava.com&sz=128' },

  // --- Security & VPN ---
  { name: '1Password', category: 'Security & VPN', logoUrl: 'https://cdn.simpleicons.org/1password/0094F5', fallbackLogo: 'https://www.google.com/s2/favicons?domain=1password.com&sz=128' },
  { name: 'Bitwarden', category: 'Security & VPN', logoUrl: 'https://cdn.simpleicons.org/bitwarden/175DDC', fallbackLogo: 'https://www.google.com/s2/favicons?domain=bitwarden.com&sz=128' },
  { name: 'NordVPN', category: 'Security & VPN', logoUrl: 'https://cdn.simpleicons.org/nordvpn/4687FF', fallbackLogo: 'https://www.google.com/s2/favicons?domain=nordvpn.com&sz=128' },
  { name: 'ExpressVPN', category: 'Security & VPN', logoUrl: 'https://cdn.simpleicons.org/expressvpn/FF1C1C', fallbackLogo: 'https://www.google.com/s2/favicons?domain=expressvpn.com&sz=128' },
  { name: 'Proton VPN', category: 'Security & VPN', logoUrl: 'https://cdn.simpleicons.org/protonvpn/6D4AFF', fallbackLogo: 'https://www.google.com/s2/favicons?domain=protonvpn.com&sz=128' }
];

const CYCLES: SubscriptionCycle[] = ['monthly', 'quarterly', 'yearly', 'weekly', 'daily', 'lifetime'];

function getLogoUrl(appName: string) {
  const clean = appName.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!clean) return undefined;
  return `https://www.google.com/s2/favicons?domain=${clean}.com&sz=128`;
}

function calculateNextDueDate(startDate?: string, cycle: SubscriptionCycle = 'monthly'): string {
  if (!startDate) return 'Not set';
  
  const start = new Date(startDate);
  if (isNaN(start.getTime())) return 'Invalid date';

  if (cycle === 'lifetime') return 'Lifetime Access';

  const now = new Date();
  const nextDue = new Date(start);

  while (nextDue <= now) {
    if (cycle === 'daily') nextDue.setDate(nextDue.getDate() + 1);
    else if (cycle === 'weekly') nextDue.setDate(nextDue.getDate() + 7);
    else if (cycle === 'monthly') nextDue.setMonth(nextDue.getMonth() + 1);
    else if (cycle === 'quarterly') nextDue.setMonth(nextDue.getMonth() + 3);
    else if (cycle === 'yearly') nextDue.setFullYear(nextDue.getFullYear() + 1);
    else break;
  }

  return nextDue.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function getDaysUntilDue(startDate?: string, cycle: SubscriptionCycle = 'monthly', createdAt?: string): number | null {
  if (!startDate || cycle === 'lifetime') return null;
  const start = new Date(startDate);
  if (isNaN(start.getTime())) return null;

  const now = new Date();
  const nextDue = new Date(start);

  while (nextDue <= now) {
    if (cycle === 'daily') nextDue.setDate(nextDue.getDate() + 1);
    else if (cycle === 'weekly') nextDue.setDate(nextDue.getDate() + 7);
    else if (cycle === 'monthly') nextDue.setMonth(nextDue.getMonth() + 1);
    else if (cycle === 'quarterly') nextDue.setMonth(nextDue.getMonth() + 3);
    else if (cycle === 'yearly') nextDue.setFullYear(nextDue.getFullYear() + 1);
    else break;
  }
  
  const diff = nextDue.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function getItemsDueOnDate(date: Date, items: SubscriptionItem[]): SubscriptionItem[] {
  const target = new Date(date);
  target.setHours(0,0,0,0);
  
  return items.filter(item => {
    if (item.paused || item.cycle === 'lifetime' || !item.startDate) return false;
    const start = new Date(item.startDate);
    if (isNaN(start.getTime())) return false;
    
    const nextDue = new Date(start);
    nextDue.setHours(0,0,0,0);
    
    while (nextDue < target) {
      if (item.cycle === 'daily') nextDue.setDate(nextDue.getDate() + 1);
      else if (item.cycle === 'weekly') nextDue.setDate(nextDue.getDate() + 7);
      else if (item.cycle === 'monthly') nextDue.setMonth(nextDue.getMonth() + 1);
      else if (item.cycle === 'quarterly') nextDue.setMonth(nextDue.getMonth() + 3);
      else if (item.cycle === 'yearly') nextDue.setFullYear(nextDue.getFullYear() + 1);
      else break;
    }
    
    return nextDue.getTime() === target.getTime();
  });
}

function formatSubscriptionDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('T')[0].split('-');
  let d: Date;
  if (parts.length === 3 && parts[0].length === 4) {
    d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  } else {
    d = new Date(dateStr);
  }
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  const year = String(d.getFullYear()).slice(-2);
  return `${day} ${month} ${year}`;
}

import { motion, AnimatePresence } from 'framer-motion';

export function SubscriptionsTab({ onOpenAccount, onBack, bannerAdActive = true }: SubscriptionsTabProps) {
  useBannerAd(bannerAdActive);
  const { isPro } = useProGate();
  const [items, setItems] = useState<SubscriptionItem[]>(getSubscriptions());
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState<'All' | 'Monthly' | 'Quarterly' | 'Yearly' | 'Weekly' | 'Paused'>('All');
  const [logoLoadErrorMap, setLogoLoadErrorMap] = useState<Record<string, boolean>>({});
  const [suggestionLogoErrorMap, setSuggestionLogoErrorMap] = useState<Record<string, boolean>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<SubscriptionItem | null>(null);
  const currency = getCurrency();
  const accounts = useMemo(() => getAccountSummaries(), []);
  const defaultAccountId = useMemo(() => getDefaultAccountId(), []);

  const [addStep, setAddStep] = useState<'select' | 'details'>('select');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [suggestionLogoStatus, setSuggestionLogoStatus] = useState<Record<string, 'none' | 'fallback' | 'failed'>>({});
  
  const [showCalendar, setShowCalendar] = useState(false);

  const timelineDates = useMemo(() => {
    const dates = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = -3; i <= 14; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      dates.push({
        date: d,
        isToday: i === 0,
        dueItems: getItemsDueOnDate(d, items)
      });
    }
    return dates;
  }, [items]);

  const monthStats = useMemo(() => {
    const now = new Date();
    now.setHours(0,0,0,0);
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    let total = 0;
    let remaining = 0;
    
    items.filter(i => !i.paused && i.cycle !== 'lifetime').forEach(item => {
      if (!item.startDate) return;
      const d = new Date(item.startDate);
      if (isNaN(d.getTime())) return;
      
      const due = new Date(d);
      due.setHours(0,0,0,0);
      const startOfMonth = new Date(currentYear, currentMonth, 1);
      
      while (due < startOfMonth) {
        if (item.cycle === 'daily') due.setDate(due.getDate() + 1);
        else if (item.cycle === 'weekly') due.setDate(due.getDate() + 7);
        else if (item.cycle === 'monthly') due.setMonth(due.getMonth() + 1);
        else if (item.cycle === 'quarterly') due.setMonth(due.getMonth() + 3);
        else if (item.cycle === 'yearly') due.setFullYear(due.getFullYear() + 1);
        else break;
      }
      
      const tempDue = new Date(due);
      while (tempDue.getMonth() === currentMonth && tempDue.getFullYear() === currentYear) {
        const mAmount = item.amount;
        // Adjust amount for the visual to reflect standard monthly payment if they want exact?
        // Let's use the actual payment amount for the month if it triggers!
        total += mAmount;
        if (tempDue >= now) {
          remaining += mAmount;
        }
        
        if (item.cycle === 'daily') tempDue.setDate(tempDue.getDate() + 1);
        else if (item.cycle === 'weekly') tempDue.setDate(tempDue.getDate() + 7);
        else if (item.cycle === 'monthly') tempDue.setMonth(tempDue.getMonth() + 1);
        else if (item.cycle === 'quarterly') tempDue.setMonth(tempDue.getMonth() + 3);
        else if (item.cycle === 'yearly') tempDue.setFullYear(tempDue.getFullYear() + 1);
        else break;
      }
    });
    
    return { total, remaining };
  }, [items]);

  const filteredServices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return COMMON_SUBSCRIPTIONS.filter(s => {
      const matchesSearch = !q || s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q);
      const matchesCategory = selectedCategory === 'All' || s.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, selectedCategory]);

  useBackHandler(showAdd, () => {
    if (addStep === 'details') {
      setAddStep('select');
    } else {
      setShowAdd(false);
    }
  });
  useBackHandler(showCalendar, () => setShowCalendar(false));
  useBackHandler(!!selectedItem, () => setSelectedItem(null));
  useBackHandler(!!deletingId, () => setDeletingId(null));

  useEffect(() => {
    processSubscriptionBilling();
  }, []);
  
  useEffect(() => {
    const handleTriggerAdd = (e: Event) => {
      const customEvent = e as CustomEvent<{ tabId?: string }>;
      if (customEvent.detail?.tabId === 'subscriptions') {
        setAddStep('select');
        setShowAdd(true);
      }
    };
    window.addEventListener('splitmate_trigger_add', handleTriggerAdd);
    return () => window.removeEventListener('splitmate_trigger_add', handleTriggerAdd);
  }, []);

  useEffect(() => {
    const checkPending = () => {
      const pendingId = consumePendingOpenItem('subscriptions');
      if (pendingId) {
        const found = items.find(i => i.id === pendingId);
        if (found) setSelectedItem(found);
      }
    };
    checkPending();

    const handleOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ tab?: string; id?: string }>).detail;
      if (detail?.tab === 'subscriptions' && detail.id) {
        const found = items.find(i => i.id === detail.id);
        if (found) setSelectedItem(found);
      }
    };
    window.addEventListener('splitmate_open_item', handleOpen);
    return () => window.removeEventListener('splitmate_open_item', handleOpen);
  }, [items]);

  const [form, setForm] = useState({
    appName: '',
    amount: '',
    cycle: 'monthly' as SubscriptionCycle,
    logoUrl: '',
    startDate: new Date().toISOString().split('T')[0],
    accountId: '',
  });

  const stats = useMemo(() => {
    let monthly = 0;
    let yearly = 0;
    const activeItems = items.filter(i => !i.paused);
    activeItems.forEach(item => {
      let mAmount = 0;
      if (item.cycle === 'monthly') mAmount = item.amount;
      else if (item.cycle === 'quarterly') mAmount = item.amount / 3;
      else if (item.cycle === 'yearly') mAmount = item.amount / 12;
      else if (item.cycle === 'weekly') mAmount = (item.amount * 52) / 12;
      else if (item.cycle === 'daily') mAmount = item.amount * 30.4;
      
      monthly += mAmount;
      yearly += mAmount * 12;
    });
    return { monthly, yearly, active: activeItems.length };
  }, [items]);

  const upcomingItem = useMemo(() => {
    if (items.length === 0) return null;
    const itemsWithDays = items
      .filter(item => item.cycle !== 'lifetime' && !item.paused)
      .map(item => ({ 
        ...item, 
        days: getDaysUntilDue(item.startDate || item.createdAt, item.cycle, item.createdAt)
      }))
      .filter(item => item.days !== null)
      .sort((a, b) => (a.days as number) - (b.days as number));
    
    return itemsWithDays[0] || null;
  }, [items]);

  const filteredItems = useMemo(() => {
    const matchingItems = filter === 'All'
      ? items
      : items.filter(item => item.cycle.toLowerCase() === filter.toLowerCase());

    return matchingItems
      .map((item, index) => ({
        item,
        index,
        daysUntilDue: getDaysUntilDue(item.startDate || item.createdAt, item.cycle, item.createdAt),
      }))
      .sort((a, b) => {
        if (a.item.paused !== b.item.paused) return a.item.paused ? 1 : -1;
        if (a.daysUntilDue === null && b.daysUntilDue !== null) return 1;
        if (a.daysUntilDue !== null && b.daysUntilDue === null) return -1;
        if (a.daysUntilDue !== null && b.daysUntilDue !== null && a.daysUntilDue !== b.daysUntilDue) {
          return a.daysUntilDue - b.daysUntilDue;
        }
        return a.index - b.index;
      })
      .map(({ item }) => item);
  }, [items, filter]);

  const handleCreate = () => {
    const amount = Number(form.amount);
    if (!form.appName.trim() || !Number.isFinite(amount) || amount <= 0) return;

    const selectedAccountId = form.accountId || defaultAccountId || accounts[0]?.id;

    const item: SubscriptionItem = {
      id: generateId(),
      appName: form.appName.trim(),
      amount,
      cycle: form.cycle,
      logoUrl: form.logoUrl || getLogoUrl(form.appName),
      startDate: form.startDate,
      accountId: selectedAccountId,
      createdAt: new Date().toISOString(),
    };

    const next = [item, ...items];
    const saved = saveSubscriptions(next);
    if (!saved) return;

    processSubscriptionBilling();

    setItems(next);
    setForm({ appName: '', amount: '', cycle: 'monthly', logoUrl: '', startDate: new Date().toISOString().split('T')[0], accountId: '' });
    setAddStep('select');
    setShowAdd(false);
  };

  const handleDeleteTrigger = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setDeletingId(id);
  };

  const togglePause = (id: string) => {
    const next = items.map(item => 
      item.id === id ? { ...item, paused: !item.paused } : item
    );
    const saved = saveSubscriptions(next);
    if (!saved) return;
    setItems(next);
    setSelectedItem(null);
    processSubscriptionBilling();
  };

  const confirmDelete = () => {
    if (!deletingId) return;

    const next = items.filter((item) => item.id !== deletingId);
    const saved = saveSubscriptions(next);
    if (!saved) return;
    setItems(next);
    setDeletingId(null);
  };

  return (
    <div className="w-full h-full overflow-y-auto pb-40 scroll-smooth flex flex-col font-sans relative bg-background text-foreground">
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md px-5 pt-5 pb-4 flex items-center justify-between border-b border-border/10">
        <div className="flex items-center gap-4">
          {onBack && (
            <button
              onClick={onBack}
              className="w-10 h-10 rounded-full bg-secondary/50 flex items-center justify-center hover:bg-secondary/70 transition-colors"
            >
              <ChevronLeft size={22} className="text-foreground" />
            </button>
          )}
          <h1 className="text-[34px] font-bold leading-none tracking-tight">Subscriptions</h1>
        </div>
        <div className="flex items-center gap-3">
          {!onBack && <div className="[&>button]:w-11 [&>button]:h-11 [&>button]:rounded-full [&>button]:bg-secondary/50 [&>button]:hover:bg-secondary/70"><AccountQuickButton onClick={onOpenAccount} /></div>}
        </div>
      </div>

      <div className="flex-1 p-5 pt-2 space-y-8 relative z-10">
        
        {/* Top Cards */}
        <div className="grid grid-cols-2 gap-4">
           {/* Left Card */}
           <div className="bg-card backdrop-blur-md rounded-[1.75rem] p-4 flex flex-col justify-start border border-border/10">
             <div className="space-y-0.5 mb-3">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                  <Calendar size={14} className="text-[#e86c44]" />
                  <span className="text-[12px] font-medium">Monthly average</span>
                </div>
                <MoneyDisplay amount={stats.monthly} hideSymbol={false} className="text-[28px] font-bold text-foreground tracking-tight" />
             </div>
             
             <div className="h-[1px] w-full bg-border/10 mb-3" />

             <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                  <Calendar size={14} className="text-[#e86c44]" />
                  <span className="text-[12px] font-medium">Yearly average</span>
                </div>
                <MoneyDisplay amount={stats.yearly} hideSymbol={false} className="text-[18px] font-bold text-foreground tracking-tight" />
             </div>
           </div>

           {/* Right Card */}
           <div className="bg-card backdrop-blur-md rounded-[1.75rem] p-4 flex flex-col justify-between border border-border/10">
              <div className="relative h-[80px] pt-1 pl-1">
                 {/* render top 4 active logos */}
                 {items.filter(i => !i.paused).slice(0, 4).map((item, idx) => (
                    <div 
                      key={item.id} 
                      className="absolute w-[46px] h-[46px] rounded-full border-[3px] border-card overflow-hidden bg-black flex items-center justify-center shadow-lg transition-transform hover:scale-110"
                      style={{
                        zIndex: 10 - idx,
                        top: idx < 2 ? 0 : 30,
                        left: idx % 2 === 0 ? 0 : 30,
                      }}
                    >
                      {item.logoUrl ? (
                         <img src={item.logoUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                         <span className="text-lg font-bold">{item.appName.charAt(0)}</span>
                      )}
                    </div>
                 ))}
              </div>
              
              <div className="mt-3 flex items-baseline gap-1.5">
                 <span className="text-[34px] font-bold text-foreground leading-none tracking-tight">{stats.active}</span>
                 <span className="text-[15px] font-medium text-muted-foreground">Active</span>
              </div>
           </div>
        </div>

        {/* Timeline Dates */}
        <div className="mt-2 flex items-start gap-1 overflow-x-auto pb-2 px-1 hide-scrollbar -mx-5 pl-5">
           {timelineDates.map((td, i) => (
             <div key={i} className="flex flex-col items-center flex-shrink-0 w-[42px]">
               <span className="text-[10px] text-muted-foreground font-bold tracking-widest mb-2 uppercase">
                 {td.date.toLocaleDateString('en-US', { weekday: 'narrow' })}
               </span>
               <div className={cn(
                 "w-[34px] h-[34px] rounded-full flex items-center justify-center text-[15px]",
                 td.isToday ? "bg-[#e86c44] text-white font-bold" : "text-foreground font-medium"
               )}>
                 {td.date.getDate()}
               </div>
               {/* Subscriptions due */}
               {td.dueItems.length > 0 && (
                 <div className="flex -space-x-2 mt-2">
                   {td.dueItems.slice(0, 2).map((di, idx) => (
                     <div key={di.id} className="w-[18px] h-[18px] rounded-full border-[1.5px] border-background overflow-hidden bg-black z-[1]">
                       {di.logoUrl ? (
                         <img src={di.logoUrl} className="w-full h-full object-cover" />
                       ) : (
                         <span className="text-[8px] font-bold text-white flex items-center justify-center h-full w-full">{di.appName.charAt(0)}</span>
                       )}
                     </div>
                   ))}
                 </div>
               )}
             </div>
           ))}
        </div>

        {/* Remaining Card */}
        <div 
          className="bg-card backdrop-blur-md rounded-[1.75rem] p-4 border border-border/10 cursor-pointer shadow-sm relative overflow-hidden group mt-1"
          onClick={() => setShowCalendar(true)}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Calendar size={14} className="text-[#e86c44]" />
                <span className="text-[13px] font-medium text-muted-foreground">
                  Remaining in {new Date().toLocaleDateString('en-US', { month: 'long' })}
                </span>
              </div>
              <MoneyDisplay amount={monthStats.remaining} hideSymbol={false} className="text-[28px] font-bold text-foreground tracking-tight leading-none" />
              <div className="text-[13px] text-muted-foreground font-medium mt-1.5">
                of {currency.symbol}{monthStats.total.toFixed(2)} total
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="grid grid-cols-7 gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                {Array.from({ length: 28 }).map((_, i) => (
                  <div key={i} className={cn("w-1.5 h-1.5 rounded-full", i === 10 ? "bg-[#e86c44]" : "bg-white/10")} />
                ))}
              </div>
              <ChevronRight className="text-white/20" size={16} />
            </div>
          </div>
        </div>

        {/* List Section */}
        <div className="space-y-4">
           <div className="flex items-center justify-between px-1">
              <h3 className="text-[22px] font-bold flex items-center gap-1">All subscriptions <ChevronRight size={22} className="text-white/40" /></h3>
           </div>

           <div className="bg-[#161616]/90 backdrop-blur-md rounded-[1.75rem] overflow-hidden border border-white/5">
             {filteredItems.map((item, index) => {
               const isLockedSubscription = !isPro && index >= FREE_LIMITS.MAX_SUBSCRIPTIONS;
               const daysUntil = getDaysUntilDue(item.startDate || item.createdAt, item.cycle, item.createdAt);
               
               let subtitle = '';
               if (daysUntil !== null) {
                  subtitle = `Renews on ${formatSubscriptionDate(item.startDate || item.createdAt)}`;
               } else if (item.cycle === 'lifetime') {
                  subtitle = 'Lifetime access';
               } else {
                  subtitle = 'Starts today';
               }

               return (
                  <div 
                    key={item.id} 
                    className={cn(
                       "p-4 flex items-center gap-4 hover:bg-white/5 transition-colors cursor-pointer relative", 
                       index !== filteredItems.length - 1 && "border-b border-white/5",
                       isLockedSubscription && "opacity-40 grayscale"
                    )} 
                    onClick={() => {
                        if (isLockedSubscription) {
                           requestProUpgrade('subscriptions', 'Free users can track up to 2 subscriptions. Upgrade to Pro for unlimited subscriptions.');
                           return;
                        }
                        setSelectedItem(item);
                    }}
                  >
                     {isLockedSubscription && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center">
                           <div className="bg-black/50 p-2 rounded-full backdrop-blur-sm">
                              <Lock size={16} className="text-white" />
                           </div>
                        </div>
                     )}
                     <div className="w-[52px] h-[52px] rounded-full overflow-hidden bg-black border border-white/10 flex-shrink-0 flex items-center justify-center">
                        {item.logoUrl ? (
                           <img src={item.logoUrl} className="w-full h-full object-cover" />
                        ) : (
                           <span className="font-bold text-xl">{item.appName.charAt(0)}</span>
                        )}
                     </div>
                     <div className="flex-1 min-w-0 flex items-center justify-between">
                        <div className="space-y-1">
                           <h4 className="font-bold text-[17px] text-white tracking-tight truncate">{item.appName}</h4>
                           <p className="text-[13px] font-medium text-white/50 truncate">
                              {subtitle}
                           </p>
                        </div>
                        <div className="text-right space-y-1">
                           <MoneyDisplay amount={item.amount} hideSymbol={false} className="font-medium text-[16px] text-white" />
                           <div className="flex items-center justify-end gap-1 text-[13px] text-white/50 font-medium capitalize">
                              {item.cycle} <Repeat size={12} className="text-white/50" />
                           </div>
                        </div>
                     </div>
                  </div>
               )
             })}
           </div>
        </div>
      </div>
      {showAdd && accounts.length === 0 ? (
        <AddFirstAccountModal
          isOpen={showAdd}
          onClose={() => {
            setShowAdd(false);
            setAddStep('select');
            setSelectedCategory('All');
            setSearchQuery('');
          }}
          onAccountCreated={() => {}}
        />
      ) : showAdd && createPortal(
        <div 
          className="fixed inset-0 z-[10001] flex items-end justify-center bg-black/85 backdrop-blur-xl animate-in fade-in duration-300 pointer-events-auto" 
          onClick={() => {
            setShowAdd(false);
            setAddStep('select');
            setSelectedCategory('All');
            setSearchQuery('');
          }}
        >
           <div 
             className="w-full h-[100dvh] max-w-xl bg-card sm:rounded-t-[2.5rem] p-5 sm:p-7 pt-12 sm:pt-8 pb-8 flex flex-col justify-between overflow-hidden animate-in slide-in-from-bottom-full duration-300 border-t border-border/10 shadow-2xl"
             onClick={e => e.stopPropagation()}
           >
              {addStep === 'select' ? (
                <div className="flex flex-col h-full space-y-4 min-h-0">
                  {/* Header */}
                  <div className="flex items-center justify-between flex-shrink-0">
                    <div>
                      <h2 className="text-xl font-black tracking-tight">Select Service</h2>
                      <p className="text-xs text-muted-foreground font-medium mt-0.5">Browse categories or search below</p>
                    </div>
                    <button 
                      onClick={() => {
                        setShowAdd(false);
                        setAddStep('select');
                        setSelectedCategory('All');
                        setSearchQuery('');
                      }} 
                      className="w-11 h-11 rounded-full bg-secondary/50 flex items-center justify-center hover:bg-secondary transition-colors"
                    >
                      <CloseIcon size={20} />
                    </button>
                  </div>

                  {/* Search Bar */}
                  <div className="relative flex-shrink-0">
                    <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search services (e.g. Claude, JioHotstar, Notion...)"
                      className="w-full h-12 rounded-2xl bg-secondary/30 border border-border/10 pl-11 pr-10 text-sm font-semibold outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/50"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                      >
                        <CloseIcon size={16} />
                      </button>
                    )}
                  </div>

                  {/* Category Chips Bar */}
                  <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-1 -mx-1 px-1 flex-shrink-0">
                    {SERVICE_CATEGORIES.map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        className={cn(
                          "px-3.5 py-1.5 rounded-full text-[12px] font-bold transition-all whitespace-nowrap",
                          selectedCategory === cat
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary/40 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  {/* Service Grid Section - Scrollable */}
                  <div className="flex-1 overflow-y-auto scrollbar-hide pr-0.5 space-y-6 pt-2 pb-6 min-h-0">
                    {searchQuery.trim() || selectedCategory !== 'All' ? (
                      <div className="space-y-3">
                        <p className="text-[11px] font-extrabold uppercase tracking-widest text-muted-foreground/70 pl-1">
                          {searchQuery.trim() ? `Search Results (${filteredServices.length})` : selectedCategory}
                        </p>
                        <div className="grid grid-cols-4 gap-y-6 gap-x-3">
                          {filteredServices.map((service) => {
                            const status = suggestionLogoStatus[service.name] || 'none';
                            const currentSrc = status === 'failed' ? null : (status === 'fallback' ? service.fallbackLogo : service.logoUrl);

                            return (
                              <button
                                key={service.name}
                                type="button"
                                onClick={() => {
                                  setForm(prev => ({
                                    ...prev,
                                    appName: service.name,
                                    logoUrl: service.fallbackLogo || service.logoUrl
                                  }));
                                  setAddStep('details');
                                }}
                                className="flex flex-col items-center gap-2 group outline-none"
                              >
                                <div 
                                  className="w-14 h-14 rounded-[22.5%] overflow-hidden flex items-center justify-center bg-secondary/40 border border-border/10 p-2.5 group-hover:scale-105 group-active:scale-95 transition-all shadow-sm group-hover:border-primary/40 group-hover:shadow-primary/10"
                                  style={{ clipPath: 'inset(0% round 22.5%)' }}
                                >
                                  {currentSrc ? (
                                    <img
                                      src={currentSrc}
                                      alt={service.name}
                                      className="w-full h-full object-contain"
                                      onError={() => {
                                        setSuggestionLogoStatus(prev => ({
                                          ...prev,
                                          [service.name]: status === 'none' ? 'fallback' : 'failed'
                                        }));
                                      }}
                                    />
                                  ) : (
                                    <span className="text-lg font-black text-primary">{service.name.charAt(0)}</span>
                                  )}
                                </div>
                                <span className="text-[11px] font-bold text-foreground/90 leading-[1.25] text-center line-clamp-2 max-w-[5rem] min-h-[2.2rem] flex items-center justify-center break-words group-hover:text-primary transition-colors">
                                  {service.name}
                                </span>
                              </button>
                            );
                          })}

                          {searchQuery.trim() && !filteredServices.some(s => s.name.toLowerCase() === searchQuery.trim().toLowerCase()) && (
                            <button
                              type="button"
                              onClick={() => {
                                setForm(prev => ({
                                  ...prev,
                                  appName: searchQuery.trim(),
                                  logoUrl: getLogoUrl(searchQuery.trim()) || ''
                                }));
                                setAddStep('details');
                              }}
                              className="flex flex-col items-center gap-2 group outline-none"
                            >
                              <div 
                                className="w-14 h-14 rounded-[22.5%] flex items-center justify-center bg-primary/20 border border-primary/40 text-primary group-hover:scale-105 group-active:scale-95 transition-all shadow-sm"
                                style={{ clipPath: 'inset(0% round 22.5%)' }}
                              >
                                <Plus size={24} strokeWidth={2.5} />
                              </div>
                              <span className="text-[11px] font-black text-primary leading-[1.25] text-center line-clamp-2 max-w-[5rem] min-h-[2.2rem] flex items-center justify-center break-words">
                                Add "{searchQuery.trim()}"
                              </span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              setForm(prev => ({
                                ...prev,
                                appName: searchQuery.trim() || '',
                                logoUrl: searchQuery.trim() ? (getLogoUrl(searchQuery.trim()) || '') : ''
                              }));
                              setAddStep('details');
                            }}
                            className="flex flex-col items-center gap-2 group outline-none"
                          >
                            <div 
                              className="w-14 h-14 rounded-[22.5%] flex items-center justify-center bg-primary/15 border border-primary/30 text-primary group-hover:scale-105 group-active:scale-95 transition-all shadow-sm group-hover:bg-primary/25"
                              style={{ clipPath: 'inset(0% round 22.5%)' }}
                            >
                              <Plus size={24} strokeWidth={2.5} />
                            </div>
                            <span className="text-[11px] font-black text-primary leading-[1.25] text-center line-clamp-2 max-w-[5rem] min-h-[2.2rem] flex items-center justify-center break-words">
                              Other
                            </span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {SERVICE_CATEGORIES.filter(c => c !== 'All').map(catName => {
                          const catServices = COMMON_SUBSCRIPTIONS.filter(s => s.category === catName);
                          if (catServices.length === 0) return null;
                          return (
                            <div key={catName} className="space-y-3">
                              <div className="flex items-center justify-between pl-1 border-b border-border/10 pb-1.5">
                                <h3 className="text-[12px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                                  {catName}
                                </h3>
                                <span className="text-[10px] font-bold text-muted-foreground/50">{catServices.length} services</span>
                              </div>
                              <div className="grid grid-cols-4 gap-y-6 gap-x-3">
                                {catServices.map((service) => {
                                  const status = suggestionLogoStatus[service.name] || 'none';
                                  const currentSrc = status === 'failed' ? null : (status === 'fallback' ? service.fallbackLogo : service.logoUrl);

                                  return (
                                    <button
                                      key={service.name}
                                      type="button"
                                      onClick={() => {
                                        setForm(prev => ({
                                          ...prev,
                                          appName: service.name,
                                          logoUrl: service.fallbackLogo || service.logoUrl
                                        }));
                                        setAddStep('details');
                                      }}
                                      className="flex flex-col items-center gap-2 group outline-none"
                                    >
                                      <div 
                                        className="w-14 h-14 rounded-[22.5%] overflow-hidden flex items-center justify-center bg-secondary/40 border border-border/10 p-2.5 group-hover:scale-105 group-active:scale-95 transition-all shadow-sm group-hover:border-primary/40 group-hover:shadow-primary/10"
                                        style={{ clipPath: 'inset(0% round 22.5%)' }}
                                      >
                                        {currentSrc ? (
                                          <img
                                            src={currentSrc}
                                            alt={service.name}
                                            className="w-full h-full object-contain"
                                            onError={() => {
                                              setSuggestionLogoStatus(prev => ({
                                                ...prev,
                                                [service.name]: status === 'none' ? 'fallback' : 'failed'
                                              }));
                                            }}
                                          />
                                        ) : (
                                          <span className="text-lg font-black text-primary">{service.name.charAt(0)}</span>
                                        )}
                                      </div>
                                      <span className="text-[11px] font-bold text-foreground/90 leading-[1.25] text-center line-clamp-2 max-w-[5rem] min-h-[2.2rem] flex items-center justify-center break-words group-hover:text-primary transition-colors">
                                        {service.name}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}

                        <div className="pt-2 border-t border-border/10">
                          <div className="grid grid-cols-4 gap-y-6 gap-x-3">
                            <button
                              type="button"
                              onClick={() => {
                                setForm(prev => ({
                                  ...prev,
                                  appName: '',
                                  logoUrl: ''
                                }));
                                setAddStep('details');
                              }}
                              className="flex flex-col items-center gap-2 group outline-none"
                            >
                              <div 
                                className="w-14 h-14 rounded-[22.5%] flex items-center justify-center bg-primary/15 border border-primary/30 text-primary group-hover:scale-105 group-active:scale-95 transition-all shadow-sm group-hover:bg-primary/25"
                                style={{ clipPath: 'inset(0% round 22.5%)' }}
                              >
                                <Plus size={24} strokeWidth={2.5} />
                              </div>
                              <span className="text-[11px] font-black text-primary leading-[1.25] text-center line-clamp-2 max-w-[5rem] min-h-[2.2rem] flex items-center justify-center break-words">
                                Other
                              </span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col h-full justify-between space-y-6 overflow-y-auto scrollbar-hide">
                  <div className="flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setAddStep('select')}
                        className="w-10 h-10 rounded-full bg-secondary/50 flex items-center justify-center hover:bg-secondary transition-colors"
                        aria-label="Back to service selection"
                      >
                        <ChevronLeft size={20} strokeWidth={2.5} />
                      </button>
                      <div>
                        <h2 className="text-xl font-black tracking-tight">New Subscription</h2>
                        <p className="text-xs text-muted-foreground font-medium mt-0.5">Stay on top of your renewals</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => {
                        setShowAdd(false);
                        setAddStep('select');
                        setSelectedCategory('All');
                        setSearchQuery('');
                      }} 
                      className="w-11 h-11 rounded-full bg-secondary/50 flex items-center justify-center hover:bg-secondary transition-colors"
                    >
                      <CloseIcon size={20} />
                    </button>
                  </div>

                  <div className="space-y-5 flex-1">
                     <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Service Name</label>
                        <input 
                          autoFocus={!form.appName}
                          value={form.appName}
                          onChange={e => setForm(prev => ({ ...prev, appName: e.target.value, logoUrl: getLogoUrl(e.target.value) || prev.logoUrl }))}
                          placeholder="e.g. Apple Music, Figma"
                          className="w-full h-14 rounded-2xl bg-secondary/30 border border-border/10 px-5 text-sm font-semibold outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                        />
                     </div>

                     <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Start Date</label>
                        <input 
                          type="date"
                          value={form.startDate}
                          onChange={e => setForm(prev => ({ ...prev, startDate: e.target.value }))}
                          className="w-full h-14 rounded-2xl bg-secondary/30 border border-border/10 px-5 text-sm font-semibold outline-none"
                        />
                     </div>

                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                           <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Price</label>
                           <input 
                             type="number"
                             value={form.amount}
                             onChange={e => setForm(prev => ({ ...prev, amount: e.target.value }))}
                             placeholder="0.00"
                             className="w-full h-14 rounded-2xl bg-secondary/30 border border-border/10 px-5 text-sm font-bold outline-none"
                           />
                        </div>
                        <div className="space-y-2">
                           <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Cycle</label>
                           <select 
                             value={form.cycle}
                             onChange={e => setForm(prev => ({ ...prev, cycle: e.target.value as SubscriptionCycle }))}
                             className="w-full h-14 rounded-2xl bg-secondary/30 border border-border/10 px-5 text-sm font-bold outline-none appearance-none capitalize"
                           >
                             {CYCLES.map(c => <option key={c} value={c}>{c}</option>)}
                           </select>
                        </div>
                     </div>

                     <div className="space-y-2">
                         <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Pay From Account</label>
                         <select 
                           value={form.accountId || defaultAccountId || accounts[0]?.id || ''}
                           onChange={e => setForm(prev => ({ ...prev, accountId: e.target.value }))}
                           className="w-full h-14 rounded-2xl bg-secondary/30 border border-border/10 px-5 text-sm font-bold outline-none capitalize"
                         >
                           {accounts.map(acc => (
                             <option key={acc.id} value={acc.id}>
                               {acc.name} ({currency.symbol}{acc.available.toLocaleString()})
                             </option>
                           ))}
                         </select>
                      </div>

                     <button 
                      onClick={handleCreate}
                      className="w-full h-14 mt-4 rounded-[1.5rem] bg-primary text-primary-foreground font-black active:scale-[0.97] transition-all hover:brightness-110"
                     >
                       Save Subscription
                     </button>
                  </div>
                </div>
              )}
           </div>
        </div>,
        document.body
      )}

      {showCalendar && createPortal(
        <div 
          className="fixed inset-0 z-[10001] flex items-end justify-center bg-black/85 backdrop-blur-xl animate-in fade-in duration-300 pointer-events-auto"
          onClick={() => setShowCalendar(false)}
        >
           <div 
             className="w-full h-[95dvh] max-w-xl bg-card sm:rounded-t-[2.5rem] flex flex-col overflow-hidden animate-in slide-in-from-bottom-full duration-300 border-t border-border/10 shadow-2xl"
             onClick={e => e.stopPropagation()}
           >
              {/* Header */}
              <div className="relative flex items-center justify-center p-4 border-b border-border/5 shrink-0">
                <h2 className="text-lg font-bold">
                  {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </h2>
                <button 
                  onClick={() => setShowCalendar(false)}
                  className="absolute right-4 w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
                >
                  <CloseIcon size={18} />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto hide-scrollbar pb-20">
                <div className="p-5">
                  <div className="text-[13px] text-muted-foreground font-medium mb-1">Remaining this month</div>
                  <MoneyDisplay amount={monthStats.remaining} className="text-[32px] font-bold tracking-tight leading-none mb-1" />
                  <div className="text-[13px] text-muted-foreground">of {currency.symbol}{monthStats.total.toFixed(2)} total</div>
                  
                  <div className="h-[1px] bg-border/10 w-full my-6" />

                  {/* Calendar Grid */}
                  <div className="grid grid-cols-7 gap-y-5 text-center">
                    {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(d => (
                      <div key={d} className="text-[10px] text-muted-foreground font-bold tracking-widest">{d}</div>
                    ))}
                    
                    {Array.from({ length: new Date(new Date().getFullYear(), new Date().getMonth(), 1).getDay() }).map((_, i) => (
                      <div key={`empty-${i}`} className="h-10" />
                    ))}
                    
                    {Array.from({ length: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() }).map((_, i) => {
                      const day = i + 1;
                      const dateObj = new Date(new Date().getFullYear(), new Date().getMonth(), day);
                      const isToday = day === new Date().getDate();
                      const dueItems = getItemsDueOnDate(dateObj, items);

                      return (
                        <div key={day} className="flex flex-col items-center gap-1.5">
                          <div className={cn(
                            "w-7 h-7 rounded-full flex items-center justify-center text-[14px]",
                            isToday ? "bg-[#e86c44] text-white font-bold" : "text-foreground font-medium"
                          )}>
                            {day}
                          </div>
                          {dueItems.length > 0 && (
                            <div className="flex -space-x-1.5">
                              {dueItems.slice(0, 2).map(di => (
                                <div key={di.id} className="w-4 h-4 rounded-full border-[1.5px] border-card overflow-hidden bg-black z-[1]">
                                  {di.logoUrl ? (
                                    <img src={di.logoUrl} className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="text-[8px] font-bold text-white flex items-center justify-center w-full h-full">{di.appName.charAt(0)}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="px-5 pt-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold">Upcoming</h3>
                    <span className="text-[13px] text-muted-foreground font-medium">
                      {items.filter(i => !i.paused && i.cycle !== 'lifetime').length} payments · {currency.symbol}{monthStats.remaining.toFixed(2)}
                    </span>
                  </div>
                  
                  <div className="bg-card/50 rounded-[1.5rem] border border-border/5 overflow-hidden">
                    {items
                      .filter(i => !i.paused && i.cycle !== 'lifetime')
                      .map(item => ({ item, days: getDaysUntilDue(item.startDate || item.createdAt, item.cycle, item.createdAt) }))
                      .filter(obj => obj.days !== null && obj.days >= 0 && obj.days <= 31)
                      .sort((a,b) => (a.days as number) - (b.days as number))
                      .map(({item, days}, idx, arr) => (
                         <div key={item.id} className={cn("p-4 flex items-center gap-4", idx !== arr.length -1 && "border-b border-white/5")}>
                            <div className="w-12 h-12 rounded-full overflow-hidden bg-black flex-shrink-0 flex items-center justify-center border border-white/10">
                              {item.logoUrl ? (
                                 <img src={item.logoUrl} className="w-full h-full object-cover" />
                              ) : (
                                 <span className="font-bold">{item.appName.charAt(0)}</span>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-bold text-[16px] truncate text-foreground">{item.appName}</h4>
                              <p className="text-[13px] text-muted-foreground font-medium">
                                {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`}
                              </p>
                            </div>
                            <MoneyDisplay amount={item.amount} className="font-bold text-[16px] text-foreground" />
                         </div>
                      ))
                    }
                  </div>
                </div>
              </div>
           </div>
        </div>,
        document.body
      )}

      {selectedItem && createPortal(
        <div className="fixed inset-0 z-[10002] flex items-end justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300 pointer-events-auto" onClick={() => {
          setSelectedItem(null);
          setDeletingId(null);
        }}>
           <motion.div 
             initial={{ y: "100%", opacity: 0 }}
             animate={{ y: 0, opacity: 1 }}
             exit={{ y: "100%", opacity: 0 }}
             transition={{ type: "spring", damping: 30, stiffness: 300 }}
             className="w-full max-w-md bg-card rounded-[3rem] p-7 pt-9 pb-10 shadow-2xl overflow-hidden border border-border/10"
             onClick={e => e.stopPropagation()}
           >
              <AnimatePresence mode="wait">
                {deletingId === selectedItem.id ? (
                  <motion.div 
                    key="delete-confirm"
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -20, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-6"
                  >
                    <div className="text-center space-y-3">
                       <div className="w-16 h-16 rounded-3xl bg-destructive/10 flex items-center justify-center mx-auto mb-4 border border-destructive/20 shadow-inner">
                          <Trash2 size={28} className="text-destructive" />
                       </div>
                       <h2 className="text-2xl font-black tracking-tight">Cancel Subscription?</h2>
                       <p className="text-[13px] font-medium text-muted-foreground px-4 leading-relaxed">
                         Are you sure you want to remove this subscription? Future renewals will stop, and past payments will remain in your transactions history.
                       </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-6">
                       <button 
                         onClick={() => setDeletingId(null)}
                         className="w-full h-14 rounded-2xl bg-secondary text-foreground font-bold hover:bg-secondary/80 transition-all active:scale-[0.97]"
                       >
                         Keep it
                       </button>
                       <button 
                         onClick={() => {
                           confirmDelete();
                           setSelectedItem(null);
                         }}
                         className="h-14 rounded-2xl bg-destructive text-white font-black shadow-xl shadow-destructive/20 hover:brightness-110 transition-all active:scale-[0.97] uppercase tracking-widest text-[11px]"
                       >
                         Delete
                       </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="detail-view"
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -20, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-6"
                  >
                    <div className="flex flex-col items-center text-center space-y-3">
                       <div 
                          className="w-16 h-16 rounded-[22.5%] overflow-hidden flex items-center justify-center bg-black/40 border border-border/10 shadow-xl"
                          style={{ clipPath: 'inset(0% round 22.5%)' }}
                       >
                          {selectedItem.logoUrl ? (
                            <img src={selectedItem.logoUrl} className="w-full h-full object-cover" alt="" />
                          ) : (
                            <span className="text-xl font-bold text-primary">{selectedItem.appName?.charAt(0) || 'S'}</span>
                          )}
                       </div>
                       <div>
                          <h2 className="text-xl font-bold tracking-tight">{selectedItem.appName}</h2>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">{selectedItem.cycle || 'monthly'} Subscription</p>
                       </div>
                    </div>

                    <div className="bg-secondary/15 rounded-2xl p-4 text-center border border-border/5 my-2">
                       <p className="text-3xl font-black text-destructive tracking-tighter leading-tight flex items-center justify-center">
                         <MoneyDisplay amount={-(Number(selectedItem.amount) || 0)} size="lg" />
                       </p>
                       <p className="text-[9px] font-bold text-muted-foreground mt-1 uppercase tracking-widest leading-none">
                         {selectedItem.cycle === 'lifetime' ? 'one-time payment' : `per ${(selectedItem.cycle || 'monthly').replace('ly', '').replace('i', 'y')}`}
                       </p>
                    </div>

                    <div className="space-y-3">
                       <div className="flex items-center justify-between p-3.5 bg-secondary/10 rounded-2xl border border-border/5">
                          <div className="flex items-center gap-3">
                             <Clock size={16} className="text-muted-foreground opacity-60" />
                             <span className="text-xs font-bold">Next Renewal</span>
                          </div>
                          <span className="text-xs font-black text-primary">
                             {selectedItem.cycle === 'lifetime'
                               ? 'Lifetime Access'
                               : (() => {
                                   const days = getDaysUntilDue(selectedItem.startDate || selectedItem.createdAt, selectedItem.cycle, selectedItem.createdAt);
                                   return days !== null ? `in ${days} days` : 'Not scheduled';
                                 })()}
                          </span>
                       </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                       <button 
                         onClick={() => togglePause(selectedItem.id)}
                         className="h-14 rounded-xl bg-blue-500/10 text-blue-500 font-bold hover:bg-blue-500/20 transition-all active:scale-[0.97] flex items-center justify-center gap-2 border border-blue-500/10"
                       >
                         <Repeat size={16} className={cn("transition-transform duration-500", selectedItem.paused && "rotate-180")} />
                         {selectedItem.paused ? "Resume" : "Pause"}
                       </button>
                       <button 
                         onClick={(e) => handleDeleteTrigger(selectedItem.id, e)}
                         className="h-14 rounded-xl bg-destructive/10 text-destructive font-bold hover:bg-destructive/20 transition-all active:scale-[0.97] flex items-center justify-center gap-2 border border-destructive/10"
                       >
                         <Trash2 size={16} />
                         Delete
                       </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
           </motion.div>
        </div>,
        document.body
      )}
    </div>
  );
}