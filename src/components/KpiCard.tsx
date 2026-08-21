/**
 * components/KpiCard.tsx — Tarjeta de métrica rápida (spec 3.9).
 *
 * Portado de pos-mobile a React DOM/Tailwind.
 */
import GlassSurface from './GlassSurface';

interface KpiCardProps {
  label: string;
  value: string;
  trend?: string;
  alert?: boolean;
  testID?: string;
}

export default function KpiCard({label, value, trend, alert = false, testID}: KpiCardProps) {
  const trendPositive = trend?.startsWith('+');
  const trendColor = alert ? 'var(--color-danger)' : trendPositive ? 'var(--color-success)' : 'var(--color-danger)';

  return (
    <GlassSurface className="flex min-h-20 flex-1 flex-col justify-between p-4">
      <span className="text-[var(--font-small)] font-medium text-[var(--color-text-secondary)]">
        {label}
      </span>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span
          className={`text-[var(--font-xlarge)] font-extrabold ${alert ? 'text-[var(--color-danger)]' : 'text-[var(--color-text)]'}`}
          data-testid={testID}
        >
          {value}
        </span>
        {trend && (
          <span className="text-[var(--font-small)] font-bold" style={{color: trendColor}}>
            {trend}
          </span>
        )}
      </div>
    </GlassSurface>
  );
}