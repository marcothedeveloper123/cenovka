import { useMemo, useState } from 'react';
import { fmtCZK } from '../lib/format.ts';

export interface Series {
  /** Display label (chain name, brand, etc.). */
  label: string;
  color: string;
  /** Sorted ascending by date. */
  points: { date: string; price: number }[];
}

interface Props {
  series: readonly Series[];
  /** Optional chart height in CSS pixels. Defaults to 220. */
  height?: number;
  /** Optional Y-axis label (e.g., "Kč", "Kč / 100 g"). */
  yLabel?: string;
}

/**
 * Multi-series line chart with x = date, y = price. Renders an aligned date
 * axis built from the union of all series dates so two-series charts where
 * one chain has a sparser history line up correctly.
 *
 * Hover the dots for a price tooltip. Pure SVG, no chart lib.
 */
export function PriceChart({ series, height = 220, yLabel }: Props): React.ReactElement {
  const [hover, setHover] = useState<{ seriesIdx: number; pointIdx: number } | null>(null);

  const { allDates, minP, maxP, hasData } = useMemo(() => computeBounds(series), [series]);

  if (!hasData) {
    return (
      <p style={{ color: 'var(--ink-3)', fontSize: 13, padding: '24px 0' }}>
        Zatím není dost dat — graf se naplní za pár dní.
      </p>
    );
  }

  const W = 720;
  const H = height;
  const padL = 56;
  const padR = 16;
  const padT = 12;
  const padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const xFor = (date: string) => {
    const i = allDates.indexOf(date);
    return padL + (allDates.length === 1 ? innerW / 2 : (i / (allDates.length - 1)) * innerW);
  };
  const range = maxP - minP || 1;
  const yFor = (price: number) => padT + innerH - ((price - minP) / range) * innerH;

  const yTicks = niceTicks(minP, maxP, 4);
  const xTickStride = Math.max(1, Math.ceil(allDates.length / 6));

  return (
    <div style={{ position: 'relative' }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        {/* Y gridlines + labels */}
        {yTicks.map((v) => (
          <g key={v}>
            <line
              x1={padL}
              x2={W - padR}
              y1={yFor(v)}
              y2={yFor(v)}
              stroke="var(--rule)"
              strokeWidth={1}
            />
            <text
              x={padL - 8}
              y={yFor(v) + 4}
              textAnchor="end"
              fontSize={11}
              fill="var(--ink-3)"
              className="num"
            >
              {fmtCZK(v, v < 10 ? 1 : 0)}
            </text>
          </g>
        ))}
        {/* X tick labels */}
        {allDates.map((d, i) =>
          i % xTickStride === 0 || i === allDates.length - 1 ? (
            <text
              key={d}
              x={xFor(d)}
              y={H - 8}
              textAnchor="middle"
              fontSize={10}
              fill="var(--ink-3)"
            >
              {fmtShortDate(d)}
            </text>
          ) : null,
        )}
        {/* Series lines */}
        {series.map((s, si) => {
          const path = s.points
            .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(p.date)} ${yFor(p.price)}`)
            .join(' ');
          return (
            <g key={s.label}>
              <path d={path} fill="none" stroke={s.color} strokeWidth={2} />
              {s.points.map((p, pi) => (
                <circle
                  key={p.date}
                  cx={xFor(p.date)}
                  cy={yFor(p.price)}
                  r={hover?.seriesIdx === si && hover?.pointIdx === pi ? 5 : 3}
                  fill={s.color}
                  onMouseEnter={() => setHover({ seriesIdx: si, pointIdx: pi })}
                  onMouseLeave={() => setHover(null)}
                  style={{ cursor: 'pointer' }}
                />
              ))}
            </g>
          );
        })}
        {yLabel && (
          <text
            x={padL - 44}
            y={padT + innerH / 2}
            transform={`rotate(-90, ${padL - 44}, ${padT + innerH / 2})`}
            fontSize={10}
            fill="var(--ink-3)"
            textAnchor="middle"
          >
            {yLabel}
          </text>
        )}
      </svg>

      {hover && (
        <Tooltip series={series[hover.seriesIdx]!} pointIdx={hover.pointIdx} />
      )}

      {series.length > 1 && (
        <ul
          style={{
            display: 'flex',
            gap: 16,
            flexWrap: 'wrap',
            listStyle: 'none',
            padding: 0,
            margin: '8px 0 0',
            fontSize: 12,
          }}
        >
          {series.map((s) => (
            <li key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{ width: 12, height: 2, background: s.color, display: 'inline-block' }}
              />
              <span>{s.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Tooltip({
  series,
  pointIdx,
}: {
  series: Series;
  pointIdx: number;
}): React.ReactElement {
  const p = series.points[pointIdx]!;
  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        background: 'var(--bg)',
        border: '1px solid var(--rule-2)',
        padding: '6px 10px',
        fontSize: 12,
        pointerEvents: 'none',
      }}
    >
      <div style={{ color: 'var(--ink-3)' }}>{series.label}</div>
      <div className="num" style={{ fontWeight: 500 }}>
        {fmtCZK(p.price)} <span style={{ color: 'var(--ink-3)' }}>· {fmtShortDate(p.date)}</span>
      </div>
    </div>
  );
}

function computeBounds(series: readonly Series[]): {
  allDates: string[];
  minP: number;
  maxP: number;
  hasData: boolean;
} {
  const dateSet = new Set<string>();
  let min = Infinity;
  let max = -Infinity;
  let hasData = false;
  for (const s of series) {
    for (const p of s.points) {
      hasData = true;
      dateSet.add(p.date);
      if (p.price < min) min = p.price;
      if (p.price > max) max = p.price;
    }
  }
  const allDates = [...dateSet].sort();
  // Pad y range so flat lines aren't on the gridline.
  if (hasData && min === max) {
    min = min * 0.95;
    max = max * 1.05;
  }
  return { allDates, minP: min, maxP: max, hasData };
}

function niceTicks(min: number, max: number, target: number): number[] {
  const range = max - min || 1;
  const rough = range / (target - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= max + step / 2; v += step) out.push(Number(v.toFixed(2)));
  return out;
}

function fmtShortDate(iso: string): string {
  // "2026-05-09" → "9.5."  |  "2026-05" → "5/26" (the ČSÚ reference series is
  // monthly, so it has no day part and Number(undefined) would render NaN).
  const [y, m, d] = iso.split('-');
  if (d === undefined) return `${Number(m)}/${y!.slice(2)}`;
  return `${Number(d)}.${Number(m)}.`;
}
