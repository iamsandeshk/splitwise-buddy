import { cn } from '@/lib/utils';
import { useCurrency } from '@/hooks/use-currency';

interface MoneyDisplayProps {
  amount: number;
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  prefix?: string;
  showSign?: boolean;
  hideSymbol?: boolean;
}

export function MoneyDisplay({ 
  amount, 
  className, 
  size = 'md', 
  prefix,
  showSign = false,
  hideSymbol = false,
  animate = true
}: MoneyDisplayProps & { animate?: boolean }) {
  const currency = useCurrency();
  const symbol = hideSymbol ? '' : (prefix ?? currency.symbol);
  const isPositive = amount > 0;
  const isNegative = amount < 0;
  const isZero = amount === 0;
  
  const sizeClasses = {
    xs: 'text-[10px]',
    sm: 'text-sm',
    md: 'text-money',
    lg: 'text-money-lg',
    xl: 'text-money-xl'
  };
  
  const colorClass = isZero 
    ? 'money-neutral' 
    : isPositive 
      ? 'money-positive' 
      : 'money-negative';
  
  const displayAmount = Math.abs(amount);
  const sign = showSign && !isZero ? (isPositive ? '+' : '-') : '';
  
  return (
    <span className={cn(
      sizeClasses[size],
      colorClass,
      'font-semibold tabular-nums',
      animate && 'animate-money-count',
      className
    )}>
      {sign}{symbol}{displayAmount.toLocaleString(currency.locale, { 
        minimumFractionDigits: 0,
        maximumFractionDigits: 2 
      })}
    </span>
  );
}