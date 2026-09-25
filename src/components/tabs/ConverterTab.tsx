import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowLeft, ArrowRightLeft, RefreshCw, TrendingUp, ArrowDownRight, ArrowUpRight, Search, Check, ChevronDown, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AccountQuickButton } from '@/components/AccountQuickButton';
import { CURRENCIES } from '@/lib/storage';
import { useBannerAd } from '@/hooks/useBannerAd';
import { useCurrency } from '@/hooks/use-currency';

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

const EXTRA_CURRENCIES_KEY = 'splitmate_converter_extra_currencies';

function getAmountFontSize(value: string): string {
   const length = value.length;
   const size = Math.max(1.05, 3.1 - Math.max(0, length - 4) * 0.32);
   return `${size}rem`;
}

export function ConverterTab({ onOpenAccount, onBack, bannerAdActive = true }: ConverterTabProps) {
   useBannerAd(bannerAdActive);
   const userCurrency = useCurrency();
  const [amount, setAmount] = useState('1');
  const [fromCurrency, setFromCurrency] = useState('USD');
  const [toCurrency, setToCurrency] = useState(userCurrency.code);
  const [rates, setRates] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
   const [selectingType, setSelectingType] = useState<'from' | 'to' | 'extra' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
    const [extraCurrencies, setExtraCurrencies] = useState<string[]>(() => {
       try {
          const stored = JSON.parse(localStorage.getItem(EXTRA_CURRENCIES_KEY) || '[]');
          return Array.isArray(stored) ? stored.filter((code): code is string => typeof code === 'string') : [];
       } catch {
          return [];
       }
    });

   useEffect(() => {
      setToCurrency(userCurrency.code);
   }, [userCurrency.code]);

   useEffect(() => {
      localStorage.setItem(EXTRA_CURRENCIES_KEY, JSON.stringify(extraCurrencies));
   }, [extraCurrencies]);

  const fetchRates = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${fromCurrency}`);
      const data = await response.json();
      setRates({ ...data.rates, [fromCurrency]: 1 });
    } catch (error) {
      console.error('Rates unreachable:', error);
    } finally {
      setLoading(false);
    }
  }, [fromCurrency]);

  useEffect(() => {
    fetchRates();
    setSearchQuery('');
  }, [fetchRates]);

   const convertedAmount = rates[toCurrency]
    ? (parseFloat(amount || '0') * rates[toCurrency]).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0.00';

   const getRateToTarget = (currencyCode: string) => {
      if (currencyCode === toCurrency) return 1;
      if (currencyCode === fromCurrency) return rates[toCurrency];
      const sourceRate = rates[currencyCode];
      const targetRate = rates[toCurrency];
      return sourceRate && targetRate ? targetRate / sourceRate : undefined;
   };

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
            <div className="w-full h-full overflow-y-auto pb-40 scroll-smooth flex flex-col font-sans relative">
               <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md px-4 pt-4 pb-3 flex items-start justify-between gap-3 border-b border-border/10">
                  <div className="flex items-center gap-3 min-w-0">
                  {onBack && (
                     <button
                        onClick={onBack}
                        className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center active:scale-90 transition-all text-muted-foreground shrink-0"
                        aria-label="Go back"
                     >
                        <ArrowLeft size={18} />
                     </button>
                  )}
                  <div className="min-w-0">
                     <h1 className="font-black text-[26px] tracking-tight text-foreground leading-none truncate">Converter<span className="text-primary">.</span></h1>
                     <p className="text-[10px] font-black text-muted-foreground/70 uppercase tracking-[0.18em] mt-1.5 leading-none">Live market rates</p>
                  </div>
               </div>
               <div className="flex items-center gap-2 shrink-0">
                  {!onBack && <AccountQuickButton onClick={onOpenAccount} />}
                  <button
                     onClick={fetchRates}
                     disabled={loading}
                     className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center active:scale-90 transition-all"
                     aria-label="Refresh exchange rates"
                  >
                     <RefreshCw size={17} className={cn("text-primary", loading && "animate-spin")} />
                  </button>
               </div>
            </div>
            
            <div className="flex-1 p-4 space-y-8">

      <div className="relative">
        <div className={cn(
          "space-y-6 transition-all duration-300",
          selectingType ? "scale-95 opacity-50 blur-sm pointer-events-none" : "scale-100 opacity-100"
        )}>
          {/* Hero Amount Input */}
               <div className="py-7 px-5 bg-card/70 rounded-2xl border border-border/15 relative overflow-hidden">
             <div className="absolute top-0 right-0 p-8 opacity-[0.03] rotate-12">
                <TrendingUp size={160} strokeWidth={3} className="text-primary" />
             </div>
             
                   <div className="relative z-10 grid grid-cols-2 divide-x divide-border/40">
                        <div className="text-center pr-4 flex flex-col items-center">
                           <p className="text-[9px] font-black text-muted-foreground/70 uppercase tracking-[0.2em] mb-3">Base value</p>
                           <div className="h-[3.1rem] w-full flex items-center justify-center">
                              <input 
                                 type="number" 
                                 value={amount}
                                 onChange={(e) => setAmount(e.target.value)}
                                 className="w-full font-black bg-transparent border-none outline-none text-center text-foreground placeholder:text-muted-foreground/20 tracking-tighter"
                                 style={{ fontSize: getAmountFontSize(amount), lineHeight: 1 }}
                                 placeholder="0"
                              />
                           </div>
                           <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.18em] mt-3 opacity-70">
                               {fromCurrency}
                           </p>
                        </div>
                        <div className="text-center pl-4 flex flex-col items-center">
                           <p className="text-[9px] font-black text-primary/60 uppercase tracking-[0.2em] mb-3">Converted value</p>
                           <div className="h-[3.1rem] w-full flex items-center justify-center overflow-hidden">
                              <div
                                 className="font-black tracking-tighter text-primary tabular-nums whitespace-nowrap"
                                 style={{ fontSize: getAmountFontSize(convertedAmount), lineHeight: 1 }}
                              >
                                 {convertedAmount}
                              </div>
                           </div>
                           <p className="text-[10px] font-black text-primary uppercase tracking-[0.18em] mt-3 opacity-80">
                              {toCurrency}
                           </p>
                        </div>
             </div>
                     <div className="relative z-10 flex items-center justify-center gap-2 bg-primary/5 px-4 py-2 rounded-full border border-primary/10 w-fit mx-auto mt-6">
                        {rates[toCurrency] >= rates[fromCurrency] ? <ArrowUpRight size={13} className="text-primary" /> : <ArrowDownRight size={13} className="text-primary" />}
                        <p className="text-[10px] font-black text-primary uppercase tracking-tight">1 {fromCurrency} = {rates[toCurrency]?.toFixed(4)} {toCurrency}</p>
                     </div>
          </div>

          {/* Quick Select Grid */}
          <div className="grid grid-cols-[1fr_52px_1fr] items-center gap-3">
             <button 
                onClick={() => setSelectingType('from')}
                className="flex-1 h-[76px] rounded-xl bg-card/70 border border-border/15 flex flex-col items-center justify-center gap-1 active:scale-95 transition-all group"
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
                className="w-[52px] h-[52px] rounded-xl bg-primary text-white flex items-center justify-center flex-shrink-0 active:scale-90 transition-all hover:rotate-180 duration-500 z-10"
             >
                <ArrowRightLeft size={20} strokeWidth={2.5} />
             </button>

             <button 
                onClick={() => setSelectingType('to')}
                className="flex-1 h-[76px] rounded-xl bg-card/70 border border-border/15 flex flex-col items-center justify-center gap-1 active:scale-95 transition-all group"
             >
                <div className="flex items-center gap-2">
                   <span className="text-xl">{FLAG_MAP[toCurrency] || '🏳️'}</span>
                   <span className="text-sm font-black tracking-tight">{toCurrency}</span>
                   <ChevronDown size={14} className="text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">To</span>
             </button>
          </div>

               {extraCurrencies.length > 0 && (
                  <div className="space-y-2">
                     {extraCurrencies.map((code) => (
                        <div key={code} className="flex items-center justify-between px-4 py-3 rounded-xl bg-card/70 border border-border/15">
                           <div className="flex items-center gap-3">
                              <span className="text-lg">{FLAG_MAP[code] || '🏳️'}</span>
                              <div>
                                 <p className="text-xs font-black text-foreground">{code}</p>
                                   <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">1 {code} in {toCurrency}</p>
                              </div>
                           </div>
                           <p className="text-sm font-black text-primary tabular-nums">
                                   {getRateToTarget(code)?.toFixed(4) || '—'}
                           </p>
                        </div>
                     ))}
                  </div>
               )}

               <div className="flex justify-end pt-1">
                  <button
                     onClick={() => setSelectingType('extra')}
                     className="h-10 px-4 rounded-xl border border-primary/30 text-primary text-[10px] font-black uppercase tracking-widest flex items-center gap-2 active:scale-95 transition-all"
                  >
                     <Plus size={15} />
                     Add currency
                  </button>
               </div>
        </div>

        {/* --- OVERLAY SELECTOR --- */}
        {selectingType && createPortal(
          <div className="fixed inset-0 z-[10005] animate-in slide-in-from-bottom-10 fade-in duration-300">
             <div className="bg-background border border-border/10 h-full flex flex-col p-5">
                <div className="flex items-center justify-between mb-5 pt-5">
                   <button 
                      onClick={() => setSelectingType(null)}
                      className="w-10 h-10 rounded-xl bg-secondary/80 flex items-center justify-center active:scale-90 transition-all group"
                   >
                      <X size={20} className="text-muted-foreground group-hover:text-primary" />
                   </button>
                   <div className="text-center">
                      <h3 className="font-black text-lg tracking-tight uppercase leading-none">{selectingType === 'extra' ? 'Add currency' : `Select ${selectingType}`}</h3>
                      <p className="text-[9px] font-black text-muted-foreground/70 uppercase tracking-[0.16em] mt-1">Choose a currency</p>
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
                      className="w-full h-12 pl-12 pr-5 rounded-xl bg-secondary/30 border border-border/10 text-sm font-bold focus:outline-none focus:border-primary/50 transition-all no-scrollbar"
                      autoFocus
                   />
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pb-10 no-scrollbar px-0.5">
                   {filteredCurrencies.map((c) => {
                                 const isSelected = selectingType === 'from'
                                    ? fromCurrency === c.code
                                    : selectingType === 'to'
                                       ? toCurrency === c.code
                                       : extraCurrencies.includes(c.code);
                      return (
                         <button
                            key={c.code}
                            onClick={() => {
                               if (selectingType === 'from') setFromCurrency(c.code);
                               else if (selectingType === 'to') setToCurrency(c.code);
                               else if (!extraCurrencies.includes(c.code)) setExtraCurrencies(prev => [...prev, c.code]);
                               setSelectingType(null);
                            }}
                            className={cn(
                               "w-full flex items-center gap-3 p-3 rounded-xl transition-all active:scale-[0.98]",
                               isSelected ? "bg-primary/10 border border-primary/35" : "bg-card border border-border/10 hover:bg-secondary/30"
                            )}
                         >
                            <div className={cn(
                               "w-11 h-11 rounded-lg flex items-center justify-center text-xl transition-transform",
                               isSelected ? "bg-primary text-white scale-105" : "bg-secondary/40 text-foreground border border-border/5"
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
    </div>
  );
}
