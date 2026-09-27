"use client";

import { COMMUNITIES, TRADE_BASES } from "@/lib/data/communities";
import { formatKm, travelLeg } from "@/lib/data/distances";
import type { Job } from "@/lib/engine/types";
import { SAFETY_DOT, worstSafety } from "@/lib/ui/colors";

const W = 460;
const H = 620;
const LON_MIN = 128;
const LON_MAX = 138.5;
const LAT_MIN = -26.5;
const LAT_MAX = -10.5;

function project(lat: number, lon: number) {
  const x = ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * W;
  const y = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * H;
  return { x, y };
}

interface Props {
  jobs: Job[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/**
 * Dependency-free SVG map. Works fully offline (no tile server), which matches
 * the in-community, poor-connectivity story better than a tiled map.
 */
export default function NtMap({ jobs, selectedId, onSelect }: Props) {
  const byCommunity = new Map<string, Job[]>();
  for (const job of jobs) {
    const list = byCommunity.get(job.community.id) ?? [];
    list.push(job);
    byCommunity.set(job.community.id, list);
  }

  const selected = jobs.find((j) => j.id === selectedId) ?? null;

  return (
    <div className="panel p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">NT service map</h2>
        <span className="text-[11px] text-[var(--muted)]">offline · real coordinates</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="NT communities">
        <defs>
          <radialGradient id="glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect x={0} y={0} width={W} height={H} fill="#0b1120" rx={12} />

        {/* faint context: every community in the dataset */}
        {COMMUNITIES.map((c) => {
          const { x, y } = project(c.lat, c.lon);
          return <circle key={c.id} cx={x} cy={y} r={1.6} fill="#33456b" />;
        })}

        {/* travel lines for the selected job */}
        {selected &&
          (() => {
            const base = selected.base;
            const leg = travelLeg(base, selected.community, selected.community.access);
            const a = project(base.lat, base.lon);
            const b = project(selected.community.lat, selected.community.lon);
            return (
              <g>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="#f59e0b"
                  strokeWidth={1.6}
                  strokeDasharray="5 4"
                  opacity={0.85}
                />
                <text
                  x={(a.x + b.x) / 2}
                  y={(a.y + b.y) / 2 - 5}
                  fill="#fcd34d"
                  fontSize={10}
                  textAnchor="middle"
                >
                  {formatKm(leg.km)} {leg.mode}
                </text>
              </g>
            );
          })()}

        {/* trade bases */}
        {TRADE_BASES.map((b) => {
          const { x, y } = project(b.lat, b.lon);
          return (
            <g key={b.id}>
              <rect x={x - 4} y={y - 4} width={8} height={8} fill="#94a3b8" rx={1} />
              <text x={x + 7} y={y + 3} fill="#cbd5e1" fontSize={9}>
                {b.name}
              </text>
            </g>
          );
        })}

        {/* communities with work */}
        {[...byCommunity.entries()].map(([id, list]) => {
          const community = list[0].community;
          const { x, y } = project(community.lat, community.lon);
          const level = worstSafety(list.map((j) => j.report.safety_level));
          const isSelected = selected?.community.id === id;
          const r = 5 + Math.min(list.length, 4) * 2.2;
          return (
            <g
              key={id}
              onClick={() => onSelect(list[0].id)}
              className="cursor-pointer"
              tabIndex={0}
            >
              {isSelected && <circle cx={x} cy={y} r={r + 14} fill="url(#glow)" />}
              <circle
                cx={x}
                cy={y}
                r={r}
                fill={SAFETY_DOT[level]}
                fillOpacity={0.85}
                stroke={isSelected ? "#fff" : "#0b1120"}
                strokeWidth={isSelected ? 2 : 1}
              />
              <text x={x + r + 3} y={y + 3} fill="#dbeafe" fontSize={10}>
                {community.name}
                {list.length > 1 ? ` (${list.length})` : ""}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-[var(--muted)]">
        {(["critical", "high", "medium", "low"] as const).map((level) => (
          <span key={level} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: SAFETY_DOT[level] }} />
            {level}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 bg-slate-400" /> trade base
        </span>
      </div>
    </div>
  );
}
