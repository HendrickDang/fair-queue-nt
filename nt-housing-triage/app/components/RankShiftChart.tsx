"use client";

import { useMemo, useState } from "react";
import type { Job, RankOptions, RankResult } from "@/lib/engine/types";
import { rankShift, type ShiftRow } from "@/lib/viz";

interface Props {
  jobs: Job[];
  /** The ranking the dashboard is showing, so the middle column matches the table. */
  current: RankResult;
  selectedId: string | null;
  onSelect: (id: string) => void;
  options?: Omit<RankOptions, "lambda">;
}

// Layout in SVG units: job text, then three columns of positions, then the community.
const W = 556;
const TOP = 30;
const X = { need: 226, dial: 336, cost: 446 };

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/**
 * Where each job sits when only need counts, at the current dial, and when only
 * travel cost counts. A line that slopes down is a household that waits longer
 * because of where it lives.
 */
export default function RankShiftChart({ jobs, current, selectedId, onSelect, options }: Props) {
  const rows = useMemo(() => rankShift(jobs, current, options), [jobs, current, options]);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);

  // Rows get a little tighter as the queue grows, so long queues still fit.
  const rowH = rows.length > 24 ? 16 : rows.length > 16 ? 19 : 22;
  const H = TOP + rows.length * rowH + 8;
  const y = (rank: number) => TOP + (rank - 0.5) * rowH;
  const color = (r: ShiftRow) => (r.remote ? "var(--viz-remote)" : "var(--viz-town)");

  const remoteDown = rows.filter((r) => r.remote && r.dialRank > r.needRank).length;
  const townUp = rows.filter((r) => !r.remote && r.dialRank < r.needRank).length;
  const pct = Math.round(current.lambda * 100);
  const focusId = hoverId ?? selectedId;
  const hovered = rows.find((r) => r.id === hoverId) ?? null;
  // Draw the focused job last so its line sits on top.
  const ordered = [...rows].sort((a, b) => Number(a.id === focusId) - Number(b.id === focusId));

  return (
    <div className="panel p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-semibold">Who moves when travel cost counts</h2>
        <div className="flex items-center gap-3 text-[11px] text-[var(--fg-2)]">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: "var(--viz-town)" }} />
            Town and regional
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: "var(--viz-remote)" }} />
            Remote
          </span>
        </div>
      </div>
      <p className="mt-1 text-[11px] text-[var(--muted)]">
        {current.lambda === 0
          ? "The dial is at need only, so the middle column matches need order. The right column shows where each job would end up if only travel cost counted."
          : `At ${pct}% travel weight, ${remoteDown} remote ${remoteDown === 1 ? "job moves" : "jobs move"} down and ${townUp} town ${townUp === 1 ? "job moves" : "jobs move"} up compared with need order.`}
      </p>

      <div className="relative mt-2" onPointerLeave={() => { setHoverId(null); setTip(null); }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          role="img"
          aria-label="Slope chart of each job's queue position at need only, the current dial, and cost only"
        >
          {/* column heads and guides */}
          {[
            { x: X.need, label: "NEED ONLY" },
            { x: X.dial, label: `YOUR DIAL ${pct}%` },
            { x: X.cost, label: "COST ONLY" },
          ].map((c) => (
            <g key={c.label}>
              <text x={c.x} y={12} textAnchor="middle" fontSize={9} letterSpacing={0.6} fill="var(--muted)">
                {c.label}
              </text>
              <line x1={c.x} x2={c.x} y1={TOP - 6} y2={H - 4} stroke="var(--viz-grid)" strokeWidth={1} />
            </g>
          ))}

          {ordered.map((r) => {
            const focused = r.id === focusId;
            const dimmed = hoverId !== null && !focused;
            const d = `M${X.need},${y(r.needRank)} L${X.dial},${y(r.dialRank)} L${X.cost},${y(r.costRank)}`;
            return (
              <g
                key={r.id}
                opacity={dimmed ? 0.22 : 1}
                style={{ cursor: "pointer", transition: "opacity 120ms" }}
                onPointerMove={(e) => {
                  const box = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
                  setHoverId(r.id);
                  setTip({ x: e.clientX - box.left, y: e.clientY - box.top });
                }}
                onClick={() => onSelect(r.id)}
              >
                {/* job text on the left, community on the right */}
                <text
                  x={X.need - 30}
                  y={y(r.needRank) + 3.5}
                  textAnchor="end"
                  fontSize={11}
                  fontWeight={focused ? 600 : 400}
                  fill={focused ? "var(--fg-strong)" : "var(--fg-2)"}
                >
                  {clip(r.summary, 34)}
                </text>
                <text x={X.need - 10} y={y(r.needRank) + 3.5} textAnchor="end" fontSize={10} fill="var(--muted)">
                  {r.needRank}
                </text>
                <text x={X.cost + 10} y={y(r.costRank) + 3.5} fontSize={10} fill="var(--muted)">
                  {r.costRank}
                </text>
                <text
                  x={X.cost + 28}
                  y={y(r.costRank) + 3.5}
                  fontSize={11}
                  fontWeight={focused ? 600 : 400}
                  fill={focused ? "var(--fg-strong)" : "var(--fg-2)"}
                >
                  {clip(r.community, 14)}
                </text>

                <path d={d} fill="none" stroke={color(r)} strokeWidth={focused ? 3 : 2} strokeLinejoin="round" strokeLinecap="round" />
                {[
                  [X.need, r.needRank],
                  [X.dial, r.dialRank],
                  [X.cost, r.costRank],
                ].map(([cx, rank]) => (
                  <circle key={cx} cx={cx} cy={y(rank)} r={focused ? 5 : 4} fill={color(r)} stroke="var(--panel)" strokeWidth={2} />
                ))}
                {/* generous invisible target so a thin line is easy to hover and click */}
                <path d={d} fill="none" stroke="transparent" strokeWidth={14} />
              </g>
            );
          })}
        </svg>

        {hovered && tip && (
          <div
            className="pointer-events-none absolute z-10 w-56 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-2.5 text-[11px] shadow-lg"
            style={{ left: `min(${tip.x + 14}px, calc(100% - 14.5rem))`, top: tip.y + 14 }}
          >
            <div className="font-semibold text-[var(--fg-strong)]">
              Position {hovered.needRank} → {hovered.dialRank} → {hovered.costRank}
            </div>
            <div className="text-[var(--muted)]">need only → your dial → cost only</div>
            <div className="mt-1.5 text-[var(--fg)]">{hovered.summary}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[var(--fg-2)]">
              <span className="inline-block h-0.5 w-3 rounded" style={{ background: color(hovered) }} />
              {hovered.community} · {hovered.tierLabel} · {hovered.safety}
            </div>
          </div>
        )}
      </div>

      {/* Same numbers as a table, for screen readers. */}
      <div className="sr-only">
      <table>
        <caption>Queue position of each job at need only, the current dial, and cost only</caption>
        <thead>
          <tr>
            <th>Job</th>
            <th>Community</th>
            <th>Need only</th>
            <th>Your dial</th>
            <th>Cost only</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.summary}</td>
              <td>
                {r.community} ({r.tierLabel})
              </td>
              <td>{r.needRank}</td>
              <td>{r.dialRank}</td>
              <td>{r.costRank}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
