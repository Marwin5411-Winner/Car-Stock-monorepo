import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { COLORS, STATUS_COLORS } from './chartConstants';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ChartData = any[];

interface BaseChartProps {
  data: ChartData;
  height?: number;
  className?: string;
}

// ============================================
// Bar Chart
// ============================================

interface BarChartProps extends BaseChartProps {
  xKey: string;
  yKey: string | string[];
  yKeyLabels?: string[];
  xLabel?: string;
  yLabel?: string;
  colors?: string[];
  stacked?: boolean;
}

export function ReportBarChart({
  data,
  xKey,
  yKey,
  yKeyLabels,
  xLabel,
  yLabel,
  colors = COLORS,
  stacked = false,
  height = 300,
  className = '',
}: BarChartProps) {
  const yKeys = Array.isArray(yKey) ? yKey : [yKey];
  const labels = yKeyLabels || yKeys;

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-4 ${className}`}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis 
            dataKey={xKey} 
            tick={{ fontSize: 12 }}
            label={xLabel ? { value: xLabel, position: 'bottom', offset: -5 } : undefined}
          />
          <YAxis 
            tick={{ fontSize: 12 }}
            tickFormatter={(value) => formatNumber(value)}
            label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft' } : undefined}
          />
          <Tooltip 
            formatter={(value: number) => formatCurrency(value)}
            contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB' }}
          />
          <Legend />
          {yKeys.map((key, index) => (
            <Bar
              key={key}
              dataKey={key}
              name={labels[index]}
              fill={colors[index % colors.length]}
              stackId={stacked ? 'stack' : undefined}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================
// Line Chart
// ============================================

interface LineChartProps extends BaseChartProps {
  xKey: string;
  yKey: string | string[];
  yKeyLabels?: string[];
  colors?: string[];
}

export function ReportLineChart({
  data,
  xKey,
  yKey,
  yKeyLabels,
  colors = COLORS,
  height = 300,
  className = '',
}: LineChartProps) {
  const yKeys = Array.isArray(yKey) ? yKey : [yKey];
  const labels = yKeyLabels || yKeys;

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-4 ${className}`}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
          <YAxis 
            tick={{ fontSize: 12 }}
            tickFormatter={(value) => formatNumber(value)}
          />
          <Tooltip 
            formatter={(value: number) => formatCurrency(value)}
            contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB' }}
          />
          <Legend />
          {yKeys.map((key, index) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              name={labels[index]}
              stroke={colors[index % colors.length]}
              strokeWidth={2}
              dot={{ fill: colors[index % colors.length], strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================
// Pie Chart
// ============================================

interface PieChartProps extends BaseChartProps {
  nameKey: string;
  valueKey: string;
  showLabel?: boolean;
  useStatusColors?: boolean;
}

export function ReportPieChart({
  data,
  nameKey,
  valueKey,
  showLabel = true,
  useStatusColors = false,
  height = 300,
  className = '',
}: PieChartProps) {
  const getColor = (entry: Record<string, unknown>, index: number) => {
    if (useStatusColors && entry.status) {
      return STATUS_COLORS[entry.status as string] || COLORS[index % COLORS.length];
    }
    return COLORS[index % COLORS.length];
  };

  const RADIAN = Math.PI / 180;
  const renderCustomizedLabel = ({
    cx,
    cy,
    midAngle,
    innerRadius,
    outerRadius,
    percent,
  }: {
    cx?: number;
    cy?: number;
    midAngle?: number;
    innerRadius?: number;
    outerRadius?: number;
    percent?: number;
  }) => {
    if (cx === undefined || cy === undefined || midAngle === undefined || 
        innerRadius === undefined || outerRadius === undefined || percent === undefined) {
      return null;
    }
    
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return percent > 0.05 ? (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        fontSize={12}
        fontWeight={600}
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    ) : null;
  };

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-4 ${className}`}>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={showLabel ? renderCustomizedLabel : undefined}
            outerRadius={100}
            fill="#8884d8"
            dataKey={valueKey}
            nameKey={nameKey}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getColor(entry, index)} />
            ))}
          </Pie>
          <Tooltip 
            formatter={(value: number) => formatCurrency(value)}
            contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB' }}
          />
          <Legend 
            verticalAlign="bottom"
            height={36}
            formatter={(value) => <span className="text-sm text-gray-700">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================
// Chart Container with Title
// ============================================

interface ChartContainerProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export function ChartContainer({ title, subtitle, children }: ChartContainerProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

// ============================================
// Helper Functions
// ============================================

function formatNumber(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(0)}K`;
  }
  return value.toString();
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// Constants are exported inline above
