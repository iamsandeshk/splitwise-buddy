import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, LineChart, Line, Area, CartesianGrid } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { MoneyDisplay } from '@/components/MoneyDisplay';
interface ExpenseChartProps {
  data: Array<{ name: string; value: number; color?: string }>;
  type?: 'pie' | 'bar' | 'line';
  height?: number;
  pieCenterLabel?: string;
  pieCenterSubLabel?: string;
  animate?: boolean;
}
const COLORS = ['hsl(255, 85%, 65%)', 'hsl(210, 90%, 55%)', 'hsl(145, 65%, 55%)', 'hsl(28, 90%, 60%)', 'hsl(340, 85%, 65%)'];
export function ExpenseChart({ data, type = 'pie', height = 200, pieCenterLabel = 'Total', pieCenterSubLabel, animate = true }: ExpenseChartProps) {
  const chartConfig = data.reduce((config: Record<string, { label: string; color: string }>, item, index) => {
    config[item.name] = {
      label: item.name,
      color: item.color || COLORS[index % COLORS.length],
    };
    return config;
  }, {});

  if (type === 'pie') {
    const total = data.reduce((sum, item) => sum + item.value, 0);
    const sortedData = [...data].sort((a, b) => b.value - a.value);

    return (
      <div className="w-full flex items-center justify-between gap-3" style={{ height: `${height}px` }}>
        <div className="relative w-[50%] h-full shrink-0 -ml-2">
          <ChartContainer config={chartConfig} className="w-full h-full">
            <PieChart>
              <Pie
                data={sortedData}
                cx="50%"
                cy="50%"
                innerRadius="70%"
                outerRadius="100%"
                paddingAngle={3}
                dataKey="value"
                stroke="none"
                cornerRadius={6}
                isAnimationActive={animate}
              >
                {sortedData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={chartConfig[entry.name]?.color || COLORS[index % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
            <span className="text-[8px] text-muted-foreground uppercase tracking-widest font-bold">{pieCenterLabel}</span>
            <MoneyDisplay amount={-Math.abs(total)} size="sm" className="font-bold leading-tight" />
            <span className="text-[8px] text-muted-foreground font-medium">{pieCenterSubLabel || `${data.length} items`}</span>
          </div>
        </div>
        
        <div className="flex-1 h-full flex flex-col justify-center gap-3 overflow-y-auto pr-1 py-1">
          {sortedData.slice(0, 5).map((item, i) => (
            <div key={i} className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2.5 truncate pr-2">
                <div className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: chartConfig[item.name]?.color || COLORS[i % COLORS.length] }} />
                <span className="text-[13px] font-semibold truncate text-foreground/90">{item.name}</span>
              </div>
              <MoneyDisplay amount={-Math.abs(item.value)} size="sm" className="font-bold tabular-nums shrink-0" />
            </div>
          ))}
          {sortedData.length > 5 && (
            <div className="flex items-center justify-between w-full pt-0.5">
              <div className="flex items-center gap-2.5">
                <div className="w-2.5 h-2.5 rounded-full shrink-0 bg-muted/60" />
                <span className="text-[13px] text-muted-foreground font-medium">{sortedData.length - 5} more</span>
              </div>
              <MoneyDisplay amount={-Math.abs(sortedData.slice(5).reduce((s, i) => s + i.value, 0))} size="sm" className="font-bold tabular-nums shrink-0" />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (type === 'bar') {
    return (
      <div className="w-full" style={{ height: `${height}px` }}>
        <ChartContainer config={chartConfig} className="w-full h-full">
          <BarChart data={data} margin={{ left: -20, right: 10, top: 10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.1)" />
            <XAxis 
              dataKey="name" 
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10, fontWeight: 500 }}
              interval={0}
              tickFormatter={(value) => value.length > 10 ? `${value.substring(0, 8)}...` : value}
            />
            <YAxis 
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10, fontWeight: 500 }}
            />
            <Bar 
              dataKey="value" 
              fill="hsl(var(--primary))" 
              radius={[6, 6, 0, 0]} 
              barSize={32}
              isAnimationActive={animate}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
          </BarChart>
        </ChartContainer>
      </div>
    );
  }

  return (
    <div className="w-full" style={{ height: `${height}px` }}>
      <ChartContainer config={chartConfig} className="w-full h-full">
        <LineChart data={data} margin={{ left: 10, right: 10, top: 10, bottom: 10 }}>
          <defs>
            <linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(211, 100%, 50%)" stopOpacity={0.28} />
              <stop offset="95%" stopColor="hsl(211, 100%, 50%)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="hsl(var(--border) / 0.2)" strokeDasharray="4 4" vertical={false} />
          <XAxis dataKey="name" hide />
          <YAxis hide />
          <Line 
            type="monotone" 
            dataKey="value" 
            stroke="hsl(211, 100%, 50%)" 
            strokeWidth={4}
            dot={{ fill: 'hsl(211, 100%, 50%)', stroke: 'hsl(var(--card))', strokeWidth: 3, r: 5 }}
            activeDot={{ r: 8, strokeWidth: 3, stroke: 'hsl(var(--card))' }}
            isAnimationActive={animate}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
        </LineChart>
      </ChartContainer>
    </div>
  );
}
