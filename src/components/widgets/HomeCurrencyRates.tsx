import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Globe, RefreshCw, TrendingUp, TrendingDown, Minus, Plus, Check, X, Search } from 'lucide-react';
import { useCurrency } from '@/hooks/use-currency';
import { cn } from '@/lib/utils';
import { getHomeSettings, saveHomeSettings, CURRENCIES } from '@/lib/storage';
import { motion, AnimatePresence } from 'framer-motion';

interface ExchangeRates {
  [key: string]: number;
}

interface HomeCurrencyRatesProps {
  codes: string[];
}

export function HomeCurrencyRates({ codes: initialCodes }: HomeCurrencyRatesProps) {
  const baseCurrency = useCurrency();
  const [codes, setCodes] = useState(initialCodes);
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState('');
  const [convertAmount, setConvertAmount] = useState<string>('1');

  // Sync state with props when they change (e.g. from settings)
  useEffect(() => {
    setCodes(initialCodes);
  }, [initialCodes]);

  useEffect(() => {
    if (showPicker) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [showPicker]);

  const joinedCodes = useMemo(() => codes.join(','), [codes]);

  const fetchRates = useCallback(async () => {
    if (!codes.length) return;
    setIsLoading(true);
    setError(null);
    try {
      // Free public API: ExchangeRate-API (Requires no key for standard use)
      const response = await fetch(`https://open.er-api.com/v6/latest/${baseCurrency.code}`);
      const data = await response.json();
      if (data.result === 'success') {
        setRates(data.rates);
        setLastUpdated(new Date());
      } else {
        throw new Error('Failed to fetch rates');
      }
    } catch (err) {
      console.error('Currency fetch error:', err);
      setError('Connection issues. Using local rates.');
      // Mock rates fallback
      setRates({
        'USD': 1,
        'EUR': 0.92,
        'GBP': 0.79,
        'INR': 83.5,
        'JPY': 151.2,
      });
      setLastUpdated(new Date());
    } finally {
      setIsLoading(false);
    }
  }, [baseCurrency.code, codes.length]);

  useEffect(() => {
    void fetchRates();
  }, [fetchRates, joinedCodes]);

  const toggleCurrency = (code: string) => {
    if (code === baseCurrency.code) return;

    let nextCodes: string[];
    const isSelected = codes.includes(code);

    if (isSelected) {
      nextCodes = codes.filter(c => c !== code);
    } else {
      if (codes.length >= 2) {
        // Swap out the second currency when 2 are already chosen
        nextCodes = [codes[0], code];
      } else {
        nextCodes = [...codes, code];
      }
    }

    setCodes(nextCodes);
    const settings = getHomeSettings();
    saveHomeSettings({ ...settings, currencyRateCodes: nextCodes });
  };

  const filteredCurrencies = CURRENCIES.filter(c =>
    c.code !== baseCurrency.code &&
    (c.code.toLowerCase().includes(search.toLowerCase()) ||
      c.name.toLowerCase().includes(search.toLowerCase()))
  );

  // removed if (!codes.length) return null; to allow adding currency back when list is empty

  return (
    <div>
      <div className="flex items-center justify-between px-2 mb-2">
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground uppercase flex items-center gap-2 font-medium">
            <Globe size={14} className="text-primary shrink-0" />
            <span>Market Rates</span>
          </p>
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-success/10 border border-success/20">
            <span className="w-1 h-1 rounded-full bg-success animate-pulse" />
            <span className="text-[7px] font-black text-success uppercase tracking-wider">Live</span>
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowPicker(true)}
            className="w-6 h-6 rounded-md bg-secondary/60 text-foreground/70 hover:text-primary active:scale-90 transition-all border border-border/5 flex items-center justify-center shadow-sm"
            title="Add Currency"
          >
            <Plus size={13} />
          </button>
          <button
            onClick={fetchRates}
            disabled={isLoading}
            className="w-6 h-6 rounded-md bg-secondary/60 text-muted-foreground hover:bg-secondary active:scale-95 transition-all flex items-center justify-center border border-border/10 shadow-sm overflow-hidden"
            title="Refresh Rates"
          >
            <motion.div
              animate={isLoading ? { rotate: 360 } : { rotate: 0 }}
              transition={isLoading ? { repeat: Infinity, duration: 1, ease: "linear" } : { duration: 0.3 }}
            >
              <RefreshCw size={11} className={cn(isLoading && "text-primary")} />
            </motion.div>
          </button>
        </div>
      </div>

      <div className="ios-card-modern p-3.5 relative overflow-hidden group">
        {/* Background Glow */}
        <div className="absolute -top-12 -right-12 w-24 h-24 bg-primary/5 blur-[40px] rounded-full pointer-events-none" />

        {codes.filter(c => c !== baseCurrency.code).slice(0, 2).length > 0 ? (
          <div className="flex items-center justify-around py-1">
            {codes.filter(c => c !== baseCurrency.code).slice(0, 2).map((code, index) => {
              const rate = rates?.[code];
              const invertedRate = rate ? (1 / rate) : null;
              const displayAmount = parseFloat(convertAmount) || 1;
              const convertedValue = invertedRate ? (displayAmount * invertedRate) : null;

              return (
                <div key={code} className="flex-1 flex items-center justify-center">
                  {index > 0 && (
                    <div className="w-px h-10 border-r border-dotted border-border/40 mr-auto ml-0" />
                  )}
                  <div className="flex-1 flex flex-col items-center justify-center text-center space-y-1">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      {code} - {baseCurrency.code}
                    </p>

                    <div className="flex items-baseline justify-center gap-1 my-0.5">
                      <span className="text-xs font-semibold text-primary/70 leading-none">{baseCurrency.symbol}</span>
                      <h4 className="text-2xl font-bold tracking-tight text-foreground leading-none tabular-nums">
                        {convertedValue !== null
                          ? (convertedValue >= 1 ? convertedValue.toFixed(2) : convertedValue.toFixed(4))
                          : '---'}
                      </h4>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <button
            onClick={() => setShowPicker(true)}
            className="w-full py-6 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary transition-all group/empty"
          >
            <Plus size={24} className="opacity-40 group-hover/empty:opacity-80" />
            <p className="text-[11px] font-bold uppercase tracking-wider">Add Marketplace Pair</p>
          </button>
        )}
      </div>

      {createPortal(
        <AnimatePresence>
          {showPicker && (
            <div className="fixed inset-0 z-[99999] flex flex-col justify-end items-center p-4 pb-12 sm:pb-6 pointer-events-none">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowPicker(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-md pointer-events-auto"
              />
              <motion.div
                initial={{ y: "100%", opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: "100%", opacity: 0 }}
                transition={{ type: "spring", damping: 30, stiffness: 250 }}
                className="relative w-full max-w-md bg-card border border-border/10 rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[75vh] z-[210] pointer-events-auto"
              >
                {/* Drag Indicator */}
                <div className="flex justify-center pt-3 pb-0">
                  <div className="w-10 h-1 rounded-full bg-muted/20" />
                </div>

                <div className="p-6 pb-4 border-b border-border/5 flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold tracking-tight text-foreground">Select Pair</h3>
                    <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest mt-0.5">Tap to select or remove (up to 2)</p>
                  </div>
                  <button
                    onClick={() => setShowPicker(false)}
                    className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center active:scale-90 transition-all shadow-sm border border-border/5"
                  >
                    <X size={18} className="text-muted-foreground" />
                  </button>
                </div>

                <div className="px-6 py-4 space-y-4">
                  {/* Amount Entry - MOVED HERE */}
                  <div className="relative group">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-[10px] font-black text-muted-foreground/30 uppercase tracking-[0.2em]">Amount</div>
                    <input
                      type="number"
                      value={convertAmount}
                      onChange={(e) => setConvertAmount(e.target.value)}
                      placeholder="1.00"
                      className="w-full bg-secondary/15 border border-border/10 rounded-[1.5rem] h-14 pl-20 pr-6 text-sm font-black focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:opacity-20"
                    />
                  </div>

                  <div className="relative">
                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
                    <input
                      type="text"
                      placeholder="Search global markets..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full bg-secondary/20 border border-border/5 rounded-[1.5rem] py-4 pl-12 pr-6 text-[13px] font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-[10px] placeholder:font-black placeholder:tracking-widest placeholder:opacity-30 uppercase"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-6 space-y-2 pb-10">
                  {filteredCurrencies.map((currency) => {
                    const isSelected = codes.includes(currency.code);
                    return (
                      <button
                        key={currency.code}
                        onClick={() => toggleCurrency(currency.code)}
                        className={cn(
                          "w-full p-3.5 rounded-2xl flex items-center justify-between transition-all group active:scale-[0.98]",
                          isSelected ? "bg-primary/10 border border-primary/25" : "bg-card border border-border/10 hover:bg-secondary/20"
                        )}
                      >
                        <div className="flex items-center gap-3.5">
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center font-bold text-base shadow-sm transition-transform group-hover:scale-105",
                            isSelected ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground/70"
                          )}>
                            {currency.symbol}
                          </div>
                          <div className="text-left">
                            <p className="text-sm font-bold tracking-tight text-foreground">{currency.code}</p>
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{currency.name}</p>
                          </div>
                        </div>
                        <div className={cn(
                          "w-7 h-7 rounded-lg flex items-center justify-center transition-all",
                          isSelected ? "bg-primary text-primary-foreground shadow-md shadow-primary/30" : "bg-secondary/60 border border-border/10 text-muted-foreground/40"
                        )}>
                          {isSelected ? <Check size={14} strokeWidth={3} /> : <Plus size={12} />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

    </div>
  );
}
