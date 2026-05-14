export default function MealPointsGauge({ used = 0, total = 20, size = 200 }) {
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  // Gauge fills based on USAGE (more used = more filled)
  const pct = total > 0 ? Math.min(1, used / total) : 0;
  const offset = c * (1 - pct);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="gauge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#3BA4FF" />
            <stop offset="100%" stopColor="#1D70B8" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="#E2E8F0"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="url(#gauge)"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-5xl font-extrabold tracking-tight text-[#071B34]">{used}</div>
        <div className="text-xs uppercase tracking-[0.18em] text-[#475569] font-semibold mt-1">
          pts utilisés
        </div>
        <div className="text-xs text-[#475569] mt-2">
          <span className="text-[#3BA4FF] font-semibold">{Math.max(0, total - used)}</span> / {total} restants
        </div>
      </div>
    </div>
  );
}
