import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowRightLeft, RefreshCw, TrendingUp, Globe, ArrowDownRight, ArrowUpRight, Search, Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AccountQuickButton } from '@/components/AccountQuickButton';
import { CURRENCIES, getCurrency } from '@/lib/storage';
import { useBannerAd } from '@/hooks/useBannerAd';

interface ConverterTabProps {
  onOpenAccount: () => void;
  onBack?: () => void;
   bannerAdActive?: boolean;
}

const FLAG_MAP: Record<string, string> = {
  USD: '🇺🇸', INR: '🇮🇳', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵',
  AUD: '🇦🇺', CAD: '🇨🇦', AED: '🇦🇪', SGD: '🇸🇬', CNY: '🇨🇳',
  BRL: '🇧🇷', PHP: '🇵🇭', HKD: '🇭🇰', KRW: '🇰🇷', THB: '🇹🇭',
  IDR: '🇮🇩', MYR: '🇲🇾', VND: '🇻🇳', TWD: '🇹🇼', PKR: '🇵🇰',
  LKR: '🇱🇰', NPR: '🇳🇵', BDT: '🇧🇩', ZAR: '🇿🇦', NGN: '🇳🇬',
  KES: '🇰🇪', GHS: '🇬🇭', EGP: '🇪🇬', SAR: '🇸🇦', QAR: '🇶🇦',
  KWD: '🇰🇼', OMR: '🇴🇲', BHD: '🇧🇭', TRY: '🇹🇷', RUB: '🇷🇺',
  UAH: '🇺🇦', PLN: '🇵🇱', CZK: '🇨🇿', HUF: '🇭🇺', RON: '🇷🇴',
  SEK: '🇸🇪', NOK: '🇳🇴', DKK: '🇩🇰', CHF: '🇨🇭', MXN: '🇲🇽',
  ARS: '🇦🇷', CLP: '🇨🇱', COP: '🇨🇴', PEN: '🇵🇪', NZD: '🇳🇿',
};

export function ConverterTab({ onOpenAccount, onBack, bannerAdActive = true }: ConverterTabProps) {
   useBannerAd(bannerAdActive);
  const userCurrency = getCurrency();
  const [amount, setAmount] = useState('1');
  const [fromCurrency, setFromCurrency] = useState('USD');
  const [toCurrency, setToCurrency] = useState(userCurrency.code);
  const [rates, setRates] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [selectingType, setSelectingType] = useState<'from' | 'to' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchRates = async () => {
    setLoading(true);
    try {
      const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${fromCurrency}`);
      const data = await response.json();
      setRates(data.rates);
      setLastUpdated(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
    } catch (error) {
      console.error('Rates unreachable:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRates();
    setSearchQuery('');
  }, [fromCurrency]);

  const convertedAmount = rates[toCurrency] 
    ? (parseFloat(amount || '0') * rates[toCurrency]).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0.00';

  const swapCurrencies = () => {
    const prevFrom = fromCurrency;
    setFromCurrency(toCurrency);
    setToCurrency(prevFrom);
  };

  const filteredCurrencies = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return CURRENCIES;
    return CURRENCIES.filter(c => 
      c.code.toLowerCase().includes(q) || 
      c.name.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  return (
    <div className="min-h-screen bg-background p-4 pb-40 font-sans transition-all duration-300 relative overflow-hidden">
      <div className="pt-6 pb-2 mb-6">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary group transition-all rotate-2">
              <Globe size={24} strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="font-bold text-2xl tracking-tight text-foreground leading-none">Converter</h1>
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mt-1.5 leading-none">Live Market Indices</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {onBack && (
              <button 
                onClick={onBack}
                className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center active:scale-90 transition-all text-muted-foreground mr-1"
              >
                <X size={20} />
              </button>
            )}
            {!onBack && <AccountQuickButton onClick={onOpenAccount} />}
          </div>
        </div>
      </div>

      <div className="relative">
        <div className={cn(
          "space-y-6 transition-all duration-300",
          selectingType ? "scale-95 opacity-50 blur-sm pointer-events-none" : "scale-100 opacity-100"
        )}>
          {/* Hero Amount Input */}
          <div className="text-center space-y-2 py-6 bg-card rounded-[3rem] border border-border/10 shadow-sm relative overflow-hidden">
             <div className="absolute top-0 right-0 p-8 opacity-[0.03] rotate-12">
                <TrendingUp size={160} strokeWidth={3} className="text-primary" />
             </div>
             
             <div className="relative z-10">
                <input 
                  type="number" 
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full text-7xl font-black bg-transparent border-none outline-none text-center text-foreground placeholder:text-muted-foreground/20 tracking-tighter"
                  placeholder="0"
                />
                <div className="h-1.5 w-24 bg-primary/10 rounded-full mx-auto mt-2" />
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em] mt-3 opacity-60">
                   Base Value in {fromCurrency}
                </p>
             </div>
          </div>

          {/* Quick Select Grid */}
          <div className="grid grid-cols-[1fr_56px_1fr] items-center gap-4">
             <button 
                onClick={() => setSelectingType('from')}
                className="flex-1 h-20 rounded-[2.25rem] bg-card border border-border/10 flex flex-col items-center justify-center gap-1 active:scale-95 transition-all group"
             >
                <div className="flex items-center gap-2">
                   <span className="text-xl">{FLAG_MAP[fromCurrency] || '🏳️'}</span>
                   <span className="text-sm font-black tracking-tight">{fromCurrency}</span>
                   <ChevronDown size={14} className="text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">From</span>
             </button>

             <button 
                onClick={swapCurrencies}
                className="w-14 h-14 rounded-2xl bg-primary text-white flex items-center justify-center shadow-xl shadow-primary/20 flex-shrink-0 active:scale-90 transition-all hover:rotate-180 duration-500 z-10"
             >
                <ArrowRightLeft size={20} strokeWidth={2.5} />
             </button>

             <button 
                onClick={() => setSelectingType('to')}
                className="flex-1 h-20 rounded-[2.25rem] bg-card border border-border/10 flex flex-col items-center justify-center gap-1 active:scale-95 transition-all group"
             >
                <div className="flex items-center gap-2">
                   <span className="text-xl">{FLAG_MAP[toCurrency] || '🏳️'}</span>
                   <span className="text-sm font-black tracking-tight">{toCurrency}</span>
                   <ChevronDown size={14} className="text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">To</span>
             </button>
          </div>

          {/* Result Visualization */}
          <div className="p-10 rounded-[3rem] bg-primary/[0.02] border border-primary/10 text-center space-y-4 relative overflow-hidden group shadow-inner">
             <div className="flex flex-col items-center gap-3 relative z-10">
                <p className="text-[10px] font-black text-primary/40 uppercase tracking-[0.3em] leading-none">Equivalent Market Total</p>
                <div className="flex items-baseline gap-3">
                   <span className="text-3xl font-bold text-primary/30 tracking-tight">{toCurrency}</span>
                   <span className="text-6xl font-black tracking-tighter text-primary tabular-nums">
                      {convertedAmount}
                   </span>
                </div>
                <div className="flex items-center gap-2 bg-primary/5 px-5 py-2.5 rounded-full border border-primary/5 shadow-sm">
                   {rates[toCurrency] >= rates[fromCurrency] ? <ArrowUpRight size={14} className="text-primary" /> : <ArrowDownRight size={14} className="text-primary" />}
                   <p className="text-[12px] font-black text-primary uppercase tracking-tight">1 {fromCurrency} = {rates[toCurrency]?.toFixed(4)} {toCurrency}</p>
                </div>
             </div>
             
             {/* Dynamic Background Watermark */}
             <div className="absolute -bottom-8 -right-8 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity duration-700 pointer-events-none">
                <Globe size={180} strokeWidth={3} className="text-primary" />
             </div>
          </div>

          {/* Market Status Footnote */}
          <div className="flex items-center justify-between bg-card p-5 rounded-[2.5rem] border border-border/10 shadow-sm relative overflow-hidden">
             <div className="flex items-center gap-4 relative z-10">
                <div className={cn(
                   "w-3 h-3 rounded-full", 
                   loading ? "bg-amber-400 animate-pulse" : "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.3)]"
                )} />
                <div className="flex flex-col text-left">
                   <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest leading-none">{loading ? "Updating Indices..." : "Global Markets Live"}</p>
                   <p className="text-[13px] font-bold text-foreground leading-none mt-1.5">{lastUpdated || 'Syncing...'}</p>
                </div>
             </div>
             <button 
                onClick={fetchRates}
                disabled={loading}
                className="h-12 px-6 rounded-2xl bg-secondary hover:bg-secondary/80 text-[11px] font-bold text-foreground uppercase tracking-widest flex items-center gap-2 active:scale-95 transition-all relative z-10"
             >
                <RefreshCw size={15} className={cn("text-primary", loading ? "animate-spin" : "")} strokeWidth={2.5} />
                Sync
             </button>
          </div>
        </div>

        {/* --- OVERLAY SELECTOR --- */}
        {selectingType && createPortal(
          <div className="fixed inset-0 z-[10005] animate-in slide-in-from-bottom-10 fade-in duration-300">
             <div className="bg-background rounded-[3rem] shadow-2xl border border-border/10 h-full flex flex-col p-6">
                <div className="flex items-center justify-between mb-6 pt-8">
                   <button 
                      onClick={() => setSelectingType(null)}
                      className="w-11 h-11 rounded-full bg-secondary/80 flex items-center justify-center active:scale-90 transition-all group"
                   >
                      <X size={20} className="text-muted-foreground group-hover:text-primary" />
                   </button>
                   <div className="text-center">
                      <h3 className="font-bold text-lg tracking-tight uppercase leading-none">Select {selectingType}</h3>
                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mt-1">Global Database</p>
                   </div>
                   <div className="w-11" />
                </div>

                <div className="relative group mb-4">
                   <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={18} />
                   <input 
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Find currency..."
                      className="w-full h-14 pl-14 pr-6 rounded-[1.75rem] bg-secondary/30 border border-border/5 text-sm font-bold focus:ring-4 focus:ring-primary/10 transition-all no-scrollbar"
                      autoFocus
                   />
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pb-12 no-scrollbar px-1">
                   {filteredCurrencies.map((c) => {
                      const isSelected = selectingType === 'from' ? fromCurrency === c.code : toCurrency === c.code;
                      return (
                         <button
                            key={c.code}
                            onClick={() => {
                               if (selectingType === 'from') setFromCurrency(c.code);
                               else setToCurrency(c.code);
                               setSelectingType(null);
                            }}
                            className={cn(
                               "w-full flex items-center gap-4 p-4 rounded-[2.25rem] transition-all active:scale-[0.98]",
                               isSelected ? "bg-primary/5 border border-primary/20 shadow-sm" : "bg-card border border-border/5 hover:bg-secondary/30"
                            )}
                         >
                            <div className={cn(
                               "w-12 h-12 rounded-[1.25rem] flex items-center justify-center text-xl shadow-sm transition-transform",
                               isSelected ? "bg-primary text-white scale-110 shadow-lg shadow-primary/20" : "bg-secondary/40 text-foreground border border-border/5"
                            )}>
                               {FLAG_MAP[c.code] || '🏳️'}
                            </div>
                            <div className="flex-1 text-left min-w-0">
                               <p className={cn("font-bold text-sm tracking-tight truncate", isSelected ? "text-primary" : "text-foreground")}>
                                  {c.name}
                               </p>
                               <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest truncate">{c.code} • {c.symbol}</p>
                            </div>
                            {isSelected && <Check size={18} className="text-primary" strokeWidth={3} />}
                         </button>
                      );
                   })}
                </div>
             </div>
          </div>,
          document.body
        )}
      </div>
    </div>
  );
}
