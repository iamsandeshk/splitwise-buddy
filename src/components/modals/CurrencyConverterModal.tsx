import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowRightLeft, RefreshCw, Calculator, TrendingUp, Globe, ArrowDownRight, ArrowUpRight, Search, Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CURRENCIES, type CurrencyInfo } from '@/lib/storage';
import { useBannerAd } from '@/hooks/useBannerAd';

interface CurrencyConverterModalProps {
  isOpen: boolean;
  onClose: () => void;
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

export function CurrencyConverterModal({ isOpen, onClose }: CurrencyConverterModalProps) {
  useBannerAd(isOpen);
  const [amount, setAmount] = useState('1');
  const [fromCurrency, setFromCurrency] = useState('USD');
  const [toCurrency, setToCurrency] = useState('INR');
  const [rates, setRates] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [selectingType, setSelectingType] = useState<'from' | 'to' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // BODY SCROLL LOCK Logic
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    } else {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [isOpen]);

  const fetchRates = useCallback(async () => {
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
  }, [fromCurrency]);

  useEffect(() => {
    if (isOpen) {
      fetchRates();
      setSearchQuery('');
    }
  }, [isOpen, fetchRates]);

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

  if (!isOpen) return null;
  
  return createPortal(
    <div 
      className="fixed inset-0 z-[10002] flex items-end justify-center bg-black/70 backdrop-blur-md animate-in fade-in duration-300 font-sans" 
      onClick={onClose}
      onWheel={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
    >
      <div 
        className="w-full max-w-lg bg-card rounded-t-[3rem] flex flex-col h-[85vh] animate-in slide-in-from-bottom-10 duration-500 shadow-2xl relative overflow-hidden border-t border-border/40"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Handle Indicator */}
        <div className="pt-3 pb-1 flex justify-center flex-shrink-0 relative z-[20]">
           <div className="w-12 h-1.5 bg-muted rounded-full" />
        </div>

        {/* Outer Container to manage transitions without breaking scroll */}
        <div className="flex-1 relative overflow-hidden">
           
           {/* --- MAIN PAGE --- */}
           <div className={cn(
             "absolute inset-0 flex flex-col p-6 transition-transform duration-300 no-scrollbar",
             selectingType ? "-translate-x-full opacity-0 pointer-events-none" : "translate-x-0 opacity-100"
           )}>
              <div className="flex-1 overflow-y-auto no-scrollbar space-y-6 pb-12">
                 {/* Header */}
                 <div className="flex items-center justify-between px-2">
                   <div className="flex items-center gap-4">
                     <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary rotate-2">
                       <Globe size={24} strokeWidth={2.5} />
                     </div>
                     <div>
                       <h3 className="font-bold text-xl tracking-tight text-foreground leading-none">Global Rates</h3>
                       <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mt-1.5">Live Market Indices</p>
                     </div>
                   </div>
                   <button 
                     onClick={onClose}
                     className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center active:scale-90 transition-all text-muted-foreground"
                   >
                     <X size={20} />
                   </button>
                 </div>

                 {/* Hero Amount Input */}
                 <div className="text-center space-y-2 py-4">
                    <div className="relative inline-block w-full">
                       <input 
                         type="number" 
                         value={amount}
                         onChange={(e) => setAmount(e.target.value)}
                         className="w-full text-7xl font-black bg-transparent border-none outline-none text-center text-foreground placeholder:text-muted/20 tracking-tighter"
                         placeholder="0"
                         autoFocus
                       />
                       <div className="h-1.5 w-24 bg-primary/20 rounded-full mx-auto mt-2" />
                       <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em] mt-3 opacity-60">
                          Exchange value from {fromCurrency}
                       </p>
                    </div>
                 </div>

                 {/* Custom Pickers Row */}
                 <div className="grid grid-cols-[1fr_56px_1fr] items-center gap-3">
                    <button 
                       onClick={() => setSelectingType('from')}
                       className="flex-1 h-16 rounded-[2rem] bg-secondary border border-border/10 flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-all group shadow-sm"
                    >
                       <div className="flex items-center gap-1.5">
                          <span className="text-lg">{FLAG_MAP[fromCurrency] || '🏳️'}</span>
                          <span className="text-[13px] font-black tracking-tight text-foreground">{fromCurrency}</span>
                          <ChevronDown size={12} className="text-muted-foreground group-hover:text-primary transition-colors" />
                       </div>
                       <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">Base</span>
                    </button>

                    <button 
                       onClick={swapCurrencies}
                       className="w-14 h-14 rounded-2xl bg-primary text-white flex items-center justify-center shadow-md flex-shrink-0 active:scale-90 transition-all hover:rotate-180 duration-500 z-10"
                    >
                       <ArrowRightLeft size={20} strokeWidth={2.5} />
                    </button>

                    <button 
                       onClick={() => setSelectingType('to')}
                       className="flex-1 h-16 rounded-[2rem] bg-secondary border border-border/10 flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-all group shadow-sm"
                    >
                       <div className="flex items-center gap-1.5">
                          <span className="text-lg">{FLAG_MAP[toCurrency] || '🏳️'}</span>
                          <span className="text-[13px] font-black tracking-tight text-foreground">{toCurrency}</span>
                          <ChevronDown size={12} className="text-muted-foreground group-hover:text-primary transition-colors" />
                       </div>
                       <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">Target</span>
                    </button>
                 </div>

                 {/* Value Result Card */}
                 <div className="p-8 pb-10 rounded-[3rem] bg-primary/5 border border-primary/10 text-center space-y-4 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-[0.05] group-hover:rotate-12 transition-transform duration-700">
                       <TrendingUp size={120} strokeWidth={3} className="text-primary" />
                    </div>
                    
                    <div className="flex flex-col items-center gap-2 relative z-10">
                       <p className="text-[10px] font-black text-primary/40 uppercase tracking-[0.3em]">Equivalent Market Value</p>
                       <div className="flex items-baseline gap-2.5">
                          <span className="text-2xl font-bold text-primary/30 tracking-tight">{toCurrency}</span>
                          <span className="text-5xl font-black tracking-tighter text-primary tabular-nums">
                             {convertedAmount}
                          </span>
                       </div>
                       <div className="flex items-center gap-1.5 bg-primary/5 px-4 py-2 rounded-full border border-primary/5 shadow-sm">
                          {rates[toCurrency] >= rates[fromCurrency] ? <ArrowUpRight size={12} className="text-primary" /> : <ArrowDownRight size={12} className="text-primary" />}
                          <p className="text-[11px] font-black text-primary uppercase tracking-tight">1 {fromCurrency} = {rates[toCurrency]?.toFixed(4)} {toCurrency}</p>
                       </div>
                    </div>
                 </div>

                 {/* Refresh/Sync Banner */}
                 <div className="flex items-center justify-between bg-secondary/30 p-4 rounded-[2rem] border border-border/5 shadow-sm mb-4">
                    <div className="flex items-center gap-3">
                       <div className={cn(
                          "w-2.5 h-2.5 rounded-full", 
                          loading ? "bg-amber-400 animate-pulse" : "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]"
                       )} />
                       <div className="flex flex-col text-left">
                          <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">{loading ? "Updating..." : "Market Live"}</p>
                          <p className="text-[11px] font-bold text-foreground leading-none mt-1">{lastUpdated || 'Syncing...'}</p>
                       </div>
                    </div>
                    <button 
                       onClick={fetchRates}
                       disabled={loading}
                       className="h-11 px-6 rounded-2xl bg-card border border-border/10 shadow-sm text-[11px] font-bold text-foreground uppercase tracking-wider flex items-center gap-2 active:scale-95 transition-all"
                    >
                       <RefreshCw size={14} className={cn("text-primary", loading ? "animate-spin" : "")} strokeWidth={2.5} />
                       Refresh
                    </button>
                 </div>
              </div>
           </div>

           {/* --- CURRENCY SELECTOR SHEET --- */}
           <div className={cn(
             "absolute inset-0 flex flex-col p-6 transition-transform duration-300 bg-card",
             selectingType ? "translate-x-0 opacity-100" : "translate-x-full opacity-0 pointer-events-none"
           )}>
              <div className="space-y-4 flex flex-col h-full">
                 {/* Selector Header */}
                 <div className="flex items-center justify-between flex-shrink-0">
                    <button 
                       onClick={() => setSelectingType(null)}
                       className="w-10 h-10 rounded-2xl bg-secondary flex items-center justify-center active:scale-90 transition-all group"
                    >
                       <X size={18} className="text-muted-foreground group-hover:text-primary" />
                    </button>
                    <div className="text-center">
                       <h3 className="font-bold text-lg tracking-tight uppercase text-foreground">Select {selectingType === 'from' ? 'Base' : 'Target'}</h3>
                       <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Choosing currency</p>
                    </div>
                    <div className="w-10" />
                 </div>

                 {/* Search Interface */}
                 <div className="relative group flex-shrink-0">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={16} />
                    <input 
                       type="text"
                       value={searchQuery}
                       onChange={(e) => setSearchQuery(e.target.value)}
                       placeholder="Search name or code..."
                       className="w-full h-14 pl-12 pr-6 rounded-[1.75rem] bg-secondary/50 border border-border/10 text-sm font-bold text-foreground focus:ring-4 focus:ring-primary/10 transition-all font-sans"
                    />
                 </div>

                 {/* Searchable Scroll Area */}
                 <div className="flex-1 overflow-y-auto space-y-2 pb-12 overscroll-contain no-scrollbar">
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
                                isSelected ? "bg-primary/10 border border-primary/20" : "bg-secondary/20 border border-border/5 hover:bg-secondary/40"
                             )}
                          >
                             <div className={cn(
                                "w-11 h-11 rounded-[1.25rem] flex items-center justify-center text-xl shadow-sm transition-transform",
                                isSelected ? "bg-primary text-white scale-110 shadow-md shadow-primary/20" : "bg-card text-foreground border border-border/10"
                             )}>
                                {FLAG_MAP[c.code] || '🏳️'}
                             </div>
                             <div className="flex-1 text-left">
                                <p className={cn("font-bold text-[13px] tracking-tight", isSelected ? "text-primary" : "text-foreground")}>
                                   {c.name}
                                </p>
                                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{c.code} • {c.symbol}</p>
                             </div>
                             {isSelected && <Check size={16} className="text-primary" strokeWidth={3} />}
                          </button>
                       );
                    })}
                 </div>
              </div>
           </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
