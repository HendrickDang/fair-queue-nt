"use client";

import { COMMUNITIES, TRADE_BASES, haversineKm } from "@/lib/data/communities";
import { NT_OUTLINE } from "@/lib/data/nt-outline";
import { formatAud, formatKm, travelLeg } from "@/lib/data/distances";
import type { Batch, Job } from "@/lib/engine/types";
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

// The NT outline never changes, so its path is built once.
const LAND_PATH = NT_OUTLINE.map(
  (ring) =>
    ring
      .map(([lon, lat], i) => {
        const { x, y } = project(lat, lon);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join("") + "Z",
).join("");

interface Props {
  jobs: Job[];
  /** This week's batched runs, drawn as routes from the trade base. */
  batches?: Batch[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/**
 * Put each label on the first side of its dot (right, left, above, below) where it
 * does not sit on another label or dot. Labels earlier in the list get first pick.
 */
function placeLabels(items: { key: string; x: number; y: number; r: number; text: string }[], obstacles: Box[] = []) {
  const taken: Box[] = [...obstacles, ...items.map((d) => ({ x0: d.x - d.r, y0: d.y - d.r, x1: d.x + d.r, y1: d.y + d.r }))];
  const placed = new Map<string, { x: number; y: number; anchor: "start" | "end" | "middle" }>();
  for (const d of items) {
    const w = d.text.length * 5.4 + 2;
    const right = (dy: number) => ({ x: d.x + d.r + 4, y: d.y + 3.5 + dy, anchor: "start" as const, box: { x0: d.x + d.r + 3, y0: d.y - 6 + dy, x1: d.x + d.r + 4 + w, y1: d.y + 6 + dy } });
    const left = (dy: number) => ({ x: d.x - d.r - 4, y: d.y + 3.5 + dy, anchor: "end" as const, box: { x0: d.x - d.r - 4 - w, y0: d.y - 6 + dy, x1: d.x - d.r - 3, y1: d.y + 6 + dy } });
    const above = (gap: number) => ({ x: d.x, y: d.y - d.r - gap, anchor: "middle" as const, box: { x0: d.x - w / 2, y0: d.y - d.r - gap - 10, x1: d.x + w / 2, y1: d.y - d.r - gap + 2 } });
    const below = (gap: number) => ({ x: d.x, y: d.y + d.r + gap + 7, anchor: "middle" as const, box: { x0: d.x - w / 2, y0: d.y + d.r + gap - 2, x1: d.x + w / 2, y1: d.y + d.r + gap + 10 } });
    // nearest spots first, then a little further out for crowded places such as Darwin and Palmerston
    const options = [right(0), left(0), above(5), below(5), right(-11), right(11), left(-11), left(11), above(14), below(14)];
    const fits = (o: (typeof options)[number]) =>
      o.box.x0 >= 2 && o.box.x1 <= W - 2 && o.box.y0 >= 2 && o.box.y1 <= H - 2 && !taken.some((t) => overlaps(o.box, t));
    const choice = options.find(fits) ?? options[0];
    taken.push(choice.box);
    placed.set(d.key, { x: choice.x, y: choice.y, anchor: choice.anchor });
  }
  return placed;
}

/**
 * Dependency-free SVG map. Works fully offline (no tile server), which matches
 * the in-community, poor-connectivity story better than a tiled map.
 */
export default function NtMap({ jobs, batches = [], selectedId, onSelect }: Props) {
  const byCommunity = new Map<string, Job[]>();
  for (const job of jobs) {
    const list = byCommunity.get(job.community.id) ?? [];
    list.push(job);
    byCommunity.set(job.community.id, list);
  }
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const selected = jobs.find((j) => j.id === selectedId) ?? null;

  // Communities with work: a dot sized by how many jobs are waiting there.
  const dots = [...byCommunity.entries()].map(([id, list]) => {
    const community = list[0].community;
    const { x, y } = project(community.lat, community.lon);
    return {
      id,
      list,
      x,
      y,
      r: 5 + Math.min(list.length, 4) * 2.2,
      level: worstSafety(list.map((j) => j.report.safety_level)),
      text: `${community.name}${list.length > 1 ? ` (${list.length})` : ""}`,
    };
  });
  // A trade base that also has work is already labelled by its community dot.
  const bases = TRADE_BASES.map((b) => ({ ...b, ...project(b.lat, b.lon), hasWork: byCommunity.has(b.id) }));

  // The selected job's travel line carries a distance label at its midpoint; keep names off it.
  const leg = selected
    ? (() => {
        const a = project(selected.base.lat, selected.base.lon);
        const b = project(selected.community.lat, selected.community.lon);
        const trip = travelLeg(selected.base, selected.community, selected.community.access);
        const text = `${formatKm(trip.km)} ${trip.mode}`;
        return { a, b, text, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 5, visible: Math.hypot(a.x - b.x, a.y - b.y) >= 4 };
      })()
    : null;
  const legBox: Box[] = leg?.visible
    ? [{ x0: leg.x - leg.text.length * 2.8, y0: leg.y - 9, x1: leg.x + leg.text.length * 2.8, y1: leg.y + 3 }]
    : [];

  // Selected community first, then the busiest, then trade bases, so they get the clearest spot.
  const labels = placeLabels([
    ...[...dots]
      .sort((a, b) => Number(b.id === selected?.community.id) - Number(a.id === selected?.community.id) || b.list.length - a.list.length)
      .map((d) => ({ key: d.id, x: d.x, y: d.y, r: d.r, text: d.text })),
    ...bases.filter((b) => !b.hasWork).map((b) => ({ key: `base-${b.id}`, x: b.x, y: b.y, r: 5, text: b.name })),
  ], legBox);

  // Each batched run: trade base, then its communities nearest first (the order the engine costs it in).
  const routes = batches
    .map((batch) => {
      const first = batch.jobIds.map((id) => jobById.get(id)).find(Boolean);
      if (!first) return null;
      const base = first.base;
      const stops = batch.communityIds
        .map((id) => byCommunity.get(id)?.[0].community)
        .filter((c): c is NonNullable<typeof c> => Boolean(c))
        .sort((a, b) => haversineKm(base, a) - haversineKm(base, b));
      const points = [base, ...stops].map((p) => project(p.lat, p.lon));
      const length = points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0);
      if (length < 4) return null; // work at the base itself: nothing to draw
      return { batch, d: points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("") };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  return (
    <div className="panel p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">NT service map</h2>
        <span className="text-[11px] text-[var(--muted)]">offline · real coordinates</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Map of the Northern Territory showing communities with repairs waiting and this week's batched runs">
        <defs>
          <radialGradient id="glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect x={0} y={0} width={W} height={H} fill="var(--map-bg)" rx={12} />
        <path d={LAND_PATH} fill="var(--map-land)" stroke="var(--map-coast)" strokeWidth={1} strokeLinejoin="round" />

        {/* faint context: every community in the dataset */}
        {COMMUNITIES.map((c) => {
          const { x, y } = project(c.lat, c.lon);
          return <circle key={c.id} cx={x} cy={y} r={1.6} fill="var(--map-dot)" />;
        })}

        {/* this week's batched runs: one trip that covers several communities */}
        {routes.map(({ batch, d }) => (
          <path
            key={batch.id}
            d={d}
            fill="none"
            stroke="var(--map-route)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={batch.mode === "air" ? "1 5" : undefined}
            opacity={0.9}
          >
            <title>{`${batch.label}: one ${batch.mode} run, saves ${formatAud(batch.savedCost)} against separate trips`}</title>
          </path>
        ))}

        {/* travel line for the selected job */}
        {leg?.visible && (
          <g>
            <line x1={leg.a.x} y1={leg.a.y} x2={leg.b.x} y2={leg.b.y} stroke="var(--accent)" strokeWidth={1.6} strokeDasharray="5 4" opacity={0.85} />
            <text x={leg.x} y={leg.y} fill="var(--map-label)" fontSize={10} textAnchor="middle" stroke="var(--map-land)" strokeWidth={3} paintOrder="stroke">
              {leg.text}
            </text>
          </g>
        )}

        {/* communities with work */}
        {dots.map((d) => {
          const isSelected = selected?.community.id === d.id;
          const label = labels.get(d.id)!;
          return (
            <g key={d.id} onClick={() => onSelect(d.list[0].id)} className="cursor-pointer" tabIndex={0}>
              {isSelected && <circle cx={d.x} cy={d.y} r={d.r + 14} fill="url(#glow)" />}
              {d.list[0].community.wetSeasonIsolation && (
                // commonly cut off in the wet season
                <circle cx={d.x} cy={d.y} r={d.r + 3.5} fill="none" stroke="var(--map-text)" strokeWidth={1.2} strokeDasharray="2.5 2.5" />
              )}
              <circle
                cx={d.x}
                cy={d.y}
                r={d.r}
                fill={SAFETY_DOT[d.level]}
                fillOpacity={0.9}
                stroke={isSelected ? "var(--map-stroke-selected)" : "var(--map-land)"}
                strokeWidth={isSelected ? 2 : 1.5}
              />
              <text
                x={label.x}
                y={label.y}
                textAnchor={label.anchor}
                fill="var(--map-text-strong)"
                fontSize={10}
                fontWeight={isSelected ? 700 : 400}
                stroke="var(--map-land)"
                strokeWidth={3}
                paintOrder="stroke"
              >
                {d.text}
              </text>
            </g>
          );
        })}
        {/* trade bases, on top so a base that also has work still shows its square */}
        {bases.map((b) => {
          const label = labels.get(`base-${b.id}`);
          return (
            <g key={b.id}>
              <rect x={b.x - 4} y={b.y - 4} width={8} height={8} fill="var(--map-base)" stroke="var(--map-land)" strokeWidth={1} rx={1} />
              {label && (
                <text x={label.x} y={label.y} textAnchor={label.anchor} fill="var(--map-text)" fontSize={9}>
                  {b.name}
                </text>
              )}
            </g>
          );
        })}

      </svg>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--muted)]">
        {(["critical", "high", "medium", "low"] as const).map((level) => (
          <span key={level} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: SAFETY_DOT[level] }} />
            {level}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 bg-[var(--map-base)]" /> trade base
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: "var(--map-route)" }} /> batched run
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full border border-dashed border-[var(--map-text)]" /> cut off in the wet
        </span>
      </div>
      <p className="mt-1 text-[10px] text-[var(--muted)]">Outline: Natural Earth.</p>
    </div>
  );
}
