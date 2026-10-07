"use client";

import { useMemo, useState } from "react";
import type { Job, RankOptions } from "@/lib/engine/types";
import { dialSweep } from "@/lib/viz";

interface Props {
  jobs: Job[];
  lambda: number;
  onChange: (value: number) => void;
  options?: Omit<RankOptions, "lambda">;
}

// Drawing area in SVG units. The chart scales with its panel.
const W = 258;
const H = 150;
const M = { top: 10, right: 10, bottom: 24, left: 24 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;

/** Round the top of the y-axis up to a clean number of days. */
function niceMax(value: number): number {
  const steps = [2, 4, 6, 8, 10, 12, 16, 20, 30, 40, 60, 80, 100];
  return steps.find((s) => s >= value) ?? Math.ceil(value / 50) * 50;
}

const days = (v: number) => (v < 10 ? v.toFixed(1) : v.toFixed(0));

/**
 * The consequence of the dial, before anyone commits to it: the same queue
 * re-ranked at every setting, with the median wait for town and for remote
 * households. Hover to read a setting, click to move the dial there.
 */
export default function TradeoffChart({ jobs, lambda, onChange, options }: Props) {
  const sweep = useMemo(() => dialSweep(jobs, options), [jobs, options]);
  const [hover, setHover] = useState<number | null>(null);

  const { points } = sweep;
  const yMax = niceMax(Math.max(1, ...points.map((p) => Math.max(p.town, p.remote))));
  const x = (l: number) => M.left + l * PLOT_W;
  const y = (v: number) => M.top + PLOT_H - (v / yMax) * PLOT_H;
  const path = (key: "town" | "remote") =>
    points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.lambda).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");

  const nearest = (l: number) =>
    points.reduce((best, p, i) => (Math.abs(p.lambda - l) < Math.abs(points[best].lambda - l) ? i : best), 0);
  const currentIndex = nearest(lambda);
  const shown = points[hover ?? currentIndex];
  const series = [
    { key: "town" as const, label: "Town and regional", color: "var(--viz-town)", count: sweep.townCount },
    { key: "remote" as const, label: "Remote", color: "var(--viz-remote)", count: sweep.remoteCount },
  ].filter((s) => s.count > 0);

  function indexFromPointer(e: React.MouseEvent<SVGRectElement>): number {
    const box = e.currentTarget.getBoundingClientRect();
    return nearest(Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)));
  }

  return (
    <div className="panel p-4">
      <h2 className="text-sm font-semibold">What the dial does to waits</h2>
      <p className="mt-1 text-[11px] text-[var(--muted)]">
        Median estimated start for this queue, in working days, at every dial setting.
      </p>

      {/* Legend and live readout in one: the values are for the hovered setting, or the dial. */}
      <dl className="mt-3 space-y-1 text-[11px]">
        {series.map((s) => (
          <div key={s.key} className="flex items-center justify-between gap-2">
            <dt className="flex items-center gap-2 text-[var(--fg-2)]">
              <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} />
              {s.label}
            </dt>
            <dd className="font-semibold tabular-nums text-[var(--fg-strong)]">{days(shown[s.key])} days</dd>
          </div>
        ))}
      </dl>
      <p className="mt-1 text-[10px] text-[var(--muted)]">
        {hover === null
          ? `At your dial (${Math.round(lambda * 100)}% travel weight)`
          : `At ${Math.round(shown.lambda * 100)}% travel weight. Click to set the dial here.`}
      </p>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 h-auto w-full"
        role="img"
        aria-label="Line chart of median estimated start day for town and remote households at each dial setting"
      >
        {[0, yMax / 2, yMax].map((tick) => (
          <g key={tick}>
            <line
              x1={M.left}
              x2={W - M.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke={tick === 0 ? "var(--viz-axis)" : "var(--viz-grid)"}
              strokeWidth={1}
            />
            <text x={M.left - 6} y={y(tick) + 3} textAnchor="end" fontSize={9} fill="var(--muted)">
              {tick}
            </text>
          </g>
        ))}
        <text x={M.left} y={H - 6} fontSize={9} fill="var(--muted)">
          need only
        </text>
        <text x={W - M.right} y={H - 6} textAnchor="end" fontSize={9} fill="var(--muted)">
          cost only
        </text>

        {/* where the dial is now */}
        <line
          x1={x(points[currentIndex].lambda)}
          x2={x(points[currentIndex].lambda)}
          y1={M.top}
          y2={M.top + PLOT_H}
          stroke="var(--fg-3)"
          strokeWidth={1}
        />
        {/* crosshair for the hovered setting */}
        {hover !== null && hover !== currentIndex && (
          <line
            x1={x(points[hover].lambda)}
            x2={x(points[hover].lambda)}
            y1={M.top}
            y2={M.top + PLOT_H}
            stroke="var(--viz-axis)"
            strokeWidth={1}
          />
        )}

        {series.map((s) => (
          <path
            key={s.key}
            d={path(s.key)}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {/* markers at the dial, and at the hovered setting; the ring keeps them clear of the line */}
        {[currentIndex, ...(hover !== null && hover !== currentIndex ? [hover] : [])].map((i) =>
          series.map((s) => (
            <circle
              key={`${i}-${s.key}`}
              cx={x(points[i].lambda)}
              cy={y(points[i][s.key])}
              r={i === currentIndex ? 4.5 : 3.5}
              fill={s.color}
              stroke="var(--panel)"
              strokeWidth={2}
            />
          )),
        )}

        <rect
          x={M.left}
          y={M.top}
          width={PLOT_W}
          height={PLOT_H}
          fill="transparent"
          style={{ cursor: "pointer" }}
          onPointerMove={(e) => setHover(indexFromPointer(e))}
          onPointerLeave={() => setHover(null)}
          onClick={(e) => onChange(points[indexFromPointer(e)].lambda)}
        />
      </svg>

      {/* Same numbers as a table, for screen readers. */}
      <div className="sr-only">
      <table>
        <caption>Median estimated start in working days by dial setting</caption>
        <thead>
          <tr>
            <th>Travel weight</th>
            <th>Town and regional</th>
            <th>Remote</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.lambda}>
              <td>{Math.round(p.lambda * 100)}%</td>
              <td>{days(p.town)}</td>
              <td>{days(p.remote)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
