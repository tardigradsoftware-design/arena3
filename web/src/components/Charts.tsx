import React from 'react'

type Series = { name: string; color: string; values: (number | null)[]; area?: boolean }

export function LineChart({
  labels,
  series,
  height = 190,
  format = (v: number) => String(v),
  showGrid = true
}: {
  labels: string[]
  series: Series[]
  height?: number
  format?: (v: number) => string
  showGrid?: boolean
}) {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '')
  const w = 720
  const h = height
  const pad = { l: 46, r: 14, t: 12, b: 24 }
  const all = series.flatMap((s) => s.values.filter((v) => v != null) as number[])
  if (!all.length) return <div className="empty">Grafik için veri yok</div>
  const min = Math.min(...all)
  const max = Math.max(...all)
  const span = max - min || 1
  const lo = min - span * 0.12
  const hi = max + span * 0.12
  const x = (i: number) => pad.l + (i * (w - pad.l - pad.r)) / Math.max(1, labels.length - 1)
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (h - pad.t - pad.b)

  const ticks = 4
  const gridVals = Array.from({ length: ticks }, (_, i) => lo + ((hi - lo) * i) / (ticks - 1))

  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', maxHeight: height + 20 }}>
      <defs>
        {series.map((s, i) => (
          <linearGradient key={i} id={`g${uid}-${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={s.color} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>
      {showGrid &&
        gridVals.map((v, i) => (
          <g key={i}>
            <line x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} stroke="rgba(148,178,214,0.1)" strokeDasharray="3 4" />
            <text x={pad.l - 8} y={y(v) + 3.5} textAnchor="end" fontSize="9" fill="#64799a">
              {format(v)}
            </text>
          </g>
        ))}
      {series.map((s, si) => {
        const pts = s.values.map((v, i) => (v == null ? null : [x(i), y(v)])).filter(Boolean) as number[][]
        if (!pts.length) return null
        const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ')
        const areaPath = `${line} L${pts[pts.length - 1][0]},${h - pad.b} L${pts[0][0]},${h - pad.b} Z`
        return (
          <g key={si}>
            {s.area !== false && pts.length > 1 && (
              <path d={areaPath} fill={`url(#g${uid}-${si})`} />
            )}
            <path d={line} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" />
            {pts.map((p, i) => (
              <circle key={i} cx={p[0]} cy={p[1]} r="2.4" fill="#0b1422" stroke={s.color} strokeWidth="1.6" />
            ))}
          </g>
        )
      })}
      {labels.map((l, i) =>
        i % Math.ceil(labels.length / 7) === 0 || i === labels.length - 1 ? (
          <text key={i} x={x(i)} y={h - 6} textAnchor="middle" fontSize="9" fill="#64799a">
            {l}
          </text>
        ) : null
      )}
    </svg>
  )
}

export function Spark({ values, color = '#2dd4bf', width = 96, height = 26 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (!values?.length) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => [
    (i * width) / Math.max(1, values.length - 1),
    height - 2 - ((v - min) / span) * (height - 6)
  ])
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" opacity="0.85" />
    </svg>
  )
}

export function Histogram({ buckets }: { buckets: { label: string; count: number }[] }) {
  const max = Math.max(...buckets.map((b) => b.count), 1)
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 74 }}>
      {buckets.map((b, i) => {
        const c = i === 0 ? '#22c55e' : i === 1 ? '#2dd4bf' : i === 2 ? '#f5a524' : '#f4506b'
        return (
          <div key={b.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <div style={{ fontSize: 10.5, color: '#8ea4bf', fontFamily: 'var(--mono)' }}>{b.count}</div>
            <div
              style={{
                width: '100%',
                height: `${Math.max(6, (b.count / max) * 48)}px`,
                background: c,
                opacity: 0.8,
                borderRadius: 4
              }}
            />
            <div style={{ fontSize: 9.5, color: '#64799a' }}>{b.label}</div>
          </div>
        )
      })}
    </div>
  )
}
