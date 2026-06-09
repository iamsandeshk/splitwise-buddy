import { useEffect, useRef, useState } from 'react';
import { NativeAd, type NativeAdInfo } from '@/plugins/NativeAdPlugin';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdFree } from '@/hooks/useAdFree';
import { getAdsEnabled } from '@/lib/storage';

interface NativeAdCardProps {
  className?: string;
  variant?: 'list' | 'grid' | 'toolbox' | 'inline';
}

/**
 * NativeAdCard
 * Renders a single AdMob Native Advanced Ad inline within the UI.
 * Supports horizontal (list) and vertical (grid/toolbox) variants.
 */
export function NativeAdCard({ className = '', variant = 'list' }: NativeAdCardProps) {
  const { isAdFree } = useAdFree();
  const [adsEnabled, setAdsEnabledState] = useState(() => getAdsEnabled());
  const [adData, setAdData] = useState<NativeAdInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasFailed, setHasFailed] = useState(false);

  useEffect(() => {
    const handleAdsChange = () => setAdsEnabledState(getAdsEnabled());
    window.addEventListener('splitmate_ads_changed', handleAdsChange);
    
    // We can't skip the whole effect, but we can return early inside it
    if (isAdFree || !getAdsEnabled()) {
      setIsLoading(false);
      return () => window.removeEventListener('splitmate_ads_changed', handleAdsChange);
    }

    const loadAd = async () => {
      try {
        setIsLoading(true);
        // Destroy previous ad to ensure a fresh one is fetched from the native side
        await NativeAd.destroyAd().catch(() => { });

        const result = await NativeAd.loadAd();
        if (result && result.headline) {
          setAdData(result);
        } else {
          setHasFailed(true);
        }
      } catch (err) {
        console.warn('[NativeAdCard] Failed to load ad:', err);
        setHasFailed(true);
      } finally {
        setIsLoading(false);
      }
    };

    loadAd();

    return () => window.removeEventListener('splitmate_ads_changed', handleAdsChange);
  }, [isAdFree]);

  // Render absolutely nothing if ad-free or ads are disabled
  // This must be AFTER all hook declarations (useEffect, useState, etc)
  if (isAdFree || !adsEnabled) return null;

  const handleCtaClick = async () => {
    try {
      await NativeAd.recordAdClick();
    } catch (err) {
      console.warn('[NativeAdCard] Click registration failed:', err);
    }
  };

  // Don't render anything if failed or still loading (seamless experience)
  if (hasFailed || isLoading || !adData) return null;

  if (variant === 'toolbox') {
    return (
      <div
        role="button"
        onClick={handleCtaClick}
        className={cn(
          "group relative flex flex-col p-5 rounded-[2.25rem] transition-all duration-300 active:scale-[0.96] text-left overflow-hidden cursor-pointer bg-card min-h-[196px]",
          className
        )}
        style={{ 
          border: '1.2px solid hsl(var(--primary) / 0.15)',
          boxShadow: '0 8px 24px -18px hsl(var(--foreground) / 0.2)'
        }}
      >
        <div className="flex items-start justify-between mb-5 relative z-10">
          <div className="h-7 px-3 rounded-xl text-[9px] font-black uppercase tracking-widest inline-flex items-center gap-1.5 transition-all bg-primary/10 border border-primary/20 text-primary italic shadow-sm">
             <span className="w-1 h-1 rounded-full bg-primary animate-pulse" />
             Sponsored
          </div>
          <div 
            className="w-10 h-10 rounded-full flex items-center justify-center transition-transform group-hover:scale-110 duration-300 shadow-inner overflow-hidden" 
            style={{ background: 'hsl(var(--primary) / 0.1)' }}
          >
             {adData.icon ? (
               <img src={adData.icon} className="w-full h-full object-cover" alt="" />
             ) : (
               <ChevronRight size={18} className="text-primary" />
             )}
          </div>
        </div>

        <div className="space-y-1.5 min-h-[60px] relative z-10">
          <h3 className="font-bold text-[15px] leading-tight tracking-tight group-hover:text-primary transition-colors line-clamp-1">
            {adData.headline}
          </h3>
          <p className="text-[11px] text-muted-foreground/60 leading-relaxed line-clamp-2 font-medium">
            {adData.body || adData.advertiser}
          </p>
        </div>

        <div className="mt-4 relative z-10">
          <div className="inline-flex items-center px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider text-primary bg-primary/10 transition-all group-hover:bg-primary group-hover:text-white">
             {(!adData.callToAction || adData.callToAction.toLowerCase() === 'get started') ? 'Install' : adData.callToAction}
          </div>
        </div>

        {/* Ambient watermark background */}
        <div className="absolute -bottom-4 -right-4 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity duration-500 pointer-events-none">
           <span className="text-8xl font-black">{adData.advertiser?.charAt(0).toUpperCase() || 'A'}</span>
        </div>

        {/* Global Click Overlay - Ensures entire card is clickable */}
        <div 
          className="absolute inset-0 z-[20] cursor-pointer rounded-[2.25rem] active:bg-primary/5 transition-colors" 
          onClick={handleCtaClick}
        />
      </div>
    );
  }

  if (variant === 'grid') {
    return (
      <div
        role="button"
        onClick={handleCtaClick}
        className={cn(
          "group relative flex flex-col rounded-[2.5rem] transition-all duration-500 active:scale-[0.96] overflow-hidden cursor-pointer bg-card",
          className
        )}
        style={{ 
          border: '1px solid hsl(var(--border) / 0.5)',
          boxShadow: '0 15px 40px -20px hsl(var(--foreground) / 0.15)',
          aspectRatio: '0.85/1',
        }}
      >
        {/* Dynamic Header Area (Matching LinkCard Hero) */}
        <div className="relative h-[65%] w-full flex items-center justify-center bg-secondary/5 overflow-hidden transition-all duration-700">
           {/* Large Centered Logo */}
           <div className="absolute inset-0 z-0 flex items-center justify-center p-8 scale-90 group-hover:scale-100 transition-transform duration-700 ease-out">
              {adData.icon ? (
                <img 
                  src={adData.icon} 
                  className="w-full h-full object-contain filter drop-shadow-[0_10px_30px_rgba(0,0,0,0.1)] group-hover:drop-shadow-[0_20px_50px_rgba(0,0,0,0.15)] transition-all duration-700" 
                  alt="" 
                />
              ) : (
                <span className="text-5xl font-black text-primary/10 transition-transform duration-700 group-hover:scale-125">
                  {adData.advertiser?.charAt(0).toUpperCase() || 'A'}
                </span>
              )}
           </div>

           <div className="absolute top-4 left-4 z-20">
              <div className="h-7 px-3 rounded-full text-[9px] font-black uppercase tracking-widest inline-flex items-center bg-primary/10 backdrop-blur-md border border-primary/20 text-primary italic shadow-lg">
                 Sponsored
              </div>
           </div>

           <div className="absolute top-4 right-4 z-20">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-primary bg-background/60 backdrop-blur-md border border-primary/20 shadow-lg ring-1 ring-primary/5 transition-transform group-hover:scale-110">
                 <ChevronRight size={14} strokeWidth={3} />
              </div>
           </div>
        </div>

        {/* Typography & CTA Layer (Centered like LinkCard) */}
        <div className="flex-1 px-5 pb-5 pt-3 flex flex-col justify-center items-center text-center">
           <div className="space-y-1">
              <h3 className="font-extrabold text-[14px] leading-tight line-clamp-1 text-foreground transition-colors tracking-tight uppercase">
                 {adData.headline}
              </h3>
              <p className="text-[9px] text-muted-foreground/40 leading-tight line-clamp-1 font-medium italic">
                 {adData.advertiser}
              </p>
           </div>
           
           <div className="mt-2.5 inline-flex items-center px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest text-primary bg-primary/10 border border-primary/5 shadow-sm group-hover:bg-primary group-hover:text-white transition-all duration-300">
              {(!adData.callToAction || adData.callToAction.toLowerCase() === 'get started') ? 'Install' : adData.callToAction}
           </div>
        </div>

        {/* Bottom Accent */}
        <div className="absolute bottom-0 inset-x-0 h-1.5 transition-all duration-500 bg-primary/40 opacity-0 group-hover:opacity-100" />

        {/* Global Click Overlay - Ensured entire card is clickable */}
        <div 
          className="absolute inset-0 z-[20] cursor-pointer active:bg-primary/5 transition-colors" 
          onClick={handleCtaClick}
        />
      </div>
    );
  }

  // ── Inline variant: no card shell, sits flush inside a parent container ──
  if (variant === 'inline') {
    return (
      <div
        role="button"
        onClick={handleCtaClick}
        className={cn(
          'w-full flex items-center gap-3.5 px-4 py-3.5 transition-all active:scale-[0.985] cursor-pointer group relative',
          className
        )}
      >
        {/* Ad icon */}
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 overflow-hidden text-sm font-bold border border-border/10"
          style={{
            background: 'linear-gradient(135deg, hsl(var(--primary) / 0.15), hsl(var(--primary) / 0.05))',
            color: 'hsl(var(--primary))',
          }}
        >
          {adData.icon ? (
            <img
              src={adData.icon}
              alt={adData.advertiser}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            adData.advertiser?.charAt(0).toUpperCase() || 'A'
          )}
        </div>

        {/* Labels */}
        <div className="flex-1 min-w-0 text-left">
          <p className="font-bold text-sm text-foreground truncate group-hover:text-primary transition-colors">
            {adData.headline}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] font-bold uppercase tracking-[0.1em]">
            <span className="text-primary italic">{adData.advertiser || 'Sponsored'}</span>
            <span className="w-1 h-1 rounded-full bg-muted-foreground/20" />
            <span className="px-1.5 py-0.5 rounded-md bg-secondary border border-border/10 text-[8px] font-black text-foreground/70 tracking-widest italic">AD</span>
          </div>
        </div>

        {/* Chevron */}
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-primary bg-primary/5 border border-primary/10 shrink-0">
          <ChevronRight size={16} strokeWidth={3} />
        </div>

        {/* Click overlay */}
        <div className="absolute inset-0 z-[20] cursor-pointer active:bg-primary/5 transition-colors" onClick={handleCtaClick} />
      </div>
    );
  }

  return (
    <div
      role="button"
      onClick={handleCtaClick}
      className={cn(
        "ios-card-modern p-4 relative overflow-hidden group active:scale-[0.98] transition-all cursor-pointer",
        className
      )}
      style={{
        background: 'hsl(var(--card) / 0.6)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <div className="flex items-center justify-between relative z-10">
        <div className="flex items-center gap-3 flex-1 text-left group">
          {/* Ad Icon Placeholder / Logo */}
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 text-sm font-bold shadow-sm border border-border/10 overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, hsl(var(--primary) / 0.15), hsl(var(--primary) / 0.05))',
              color: 'hsl(var(--primary))'
            }}
          >
            {adData.icon ? (
              <img
                src={adData.icon}
                alt={adData.advertiser}
                className="w-full h-full object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  if (target.parentElement) {
                    target.parentElement.textContent = adData.advertiser?.charAt(0).toUpperCase() || 'A';
                  }
                }}
              />
            ) : (
              adData.advertiser?.charAt(0).toUpperCase() || 'A'
            )}
          </div>

          {/* Ad Labels */}
          <div className="min-w-0 pr-2">
            <p
              className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors decoration-none"
            >
              {adData.headline}
            </p>
            <div className="flex items-center gap-2 text-[10px] mt-0.5 font-bold uppercase tracking-[0.1em]">
              <span className="text-primary font-black italic">{adData.advertiser || 'Sponsored'}</span>
              <span className="w-1 h-1 rounded-full bg-muted-foreground/20" />
              <div className="px-1.5 py-0.5 rounded-md bg-secondary border border-border/10 text-[8px] font-black text-foreground/70 tracking-widest italic">
                AD
              </div>
            </div>
          </div>
        </div>

        {/* Right Action */}
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-primary transition-all active:scale-95 bg-primary/5 border border-primary/10 shadow-sm">
            <ChevronRight size={16} strokeWidth={3} />
          </div>
        </div>
      </div>

      {/* Global Click Overlay - Ensured entire card is clickable */}
      <div 
        className="absolute inset-0 z-[20] cursor-pointer rounded-[2.25rem] active:bg-primary/5 transition-colors" 
        onClick={handleCtaClick}
      />
    </div>
  );
}

