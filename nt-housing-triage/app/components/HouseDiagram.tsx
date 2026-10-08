"use client";

import type { ParsedReport } from "@/lib/taxonomy";
import { SAFETY_DOT } from "@/lib/ui/colors";
import { ZONE_LABEL, houseZones, type HouseZone } from "@/lib/ui/fault";

interface Props {
  report: Pick<ParsedReport, "category" | "urgency_flags" | "safety_level">;
  /** Set when the system could not read the report: the house is marked with a question. */
  unread?: boolean;
}

/** Where the attention ring sits for each part of the house. */
const CENTRE: Record<HouseZone, [number, number]> = {
  roof: [136, 54],
  wiring: [146, 119],
  tap: [114, 122],
  tank: [22, 134],
  toilet: [168, 137],
  sewer: [276, 171],
  door: [212, 128],
  window: [119, 101],
  aircon: [71, 93],
  kitchen: [72, 132],
  shower: [189, 108],
  ramp: [262, 149],
  pest: [98, 145],
  medical: [136, 141],
};

/**
 * A cut-away house with the parts this report touches lit in the safety colour.
 * It is drawn from the parsed report, so it shows what the system understood,
 * not the layout of the real house.
 */
export default function HouseDiagram({ report, unread = false }: Props) {
  const zones = houseZones(report);
  const lit = new Set(zones);
  const hot = SAFETY_DOT[report.safety_level];

  // Each part is drawn quiet unless the report touches it.
  const part = (zone: HouseZone) =>
    lit.has(zone)
      ? { stroke: hot, strokeWidth: 2, fill: hot, fillOpacity: 0.22 }
      : { stroke: "var(--house-line)", strokeWidth: 1.2, fill: "var(--house-fill)", fillOpacity: 1 };
  const line = (zone: HouseZone) =>
    lit.has(zone) ? { stroke: hot, strokeWidth: 2, fill: "none" } : { stroke: "var(--house-line)", strokeWidth: 1.2, fill: "none" };
  const quiet = { stroke: "var(--house-line)", strokeWidth: 1.2, fill: "none" };

  return (
    <figure className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-2.5">
      <svg
        viewBox="0 20 320 166"
        className="h-auto w-full"
        role="img"
        aria-label={
          zones.length
            ? `House diagram. Affected: ${zones.map((z) => ZONE_LABEL[z]).join(", ")}.`
            : "House diagram. No specific part of the house was identified."
        }
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* attention rings sit behind everything */}
        {zones.map((z) => (
          <circle key={z} className="house-pulse" cx={CENTRE[z][0]} cy={CENTRE[z][1]} r={15} fill={hot} />
        ))}

        {/* a report the system could not read is a question, not a quiet "nothing wrong" */}
        {unread && (
          <g>
            <circle cx={136} cy={56} r={13} fill="var(--accent)" />
            <text x={136} y={62} textAnchor="middle" fontSize={18} fontWeight={700} fill="#0b1220">
              ?
            </text>
          </g>
        )}

        {/* ground, stumps, walls */}
        <line x1={4} x2={316} y1={158} y2={158} stroke="var(--house-line)" strokeWidth={1.2} />
        {[54, 100, 150, 200, 220].map((x) => (
          <line key={x} x1={x} x2={x} y1={150} y2={158} {...quiet} />
        ))}
        <rect x={46} y={80} width={180} height={70} stroke="var(--house-line)" strokeWidth={1.4} fill="var(--house-fill)" />
        <line x1={150} x2={150} y1={80} y2={150} {...quiet} />

        {/* water supply: tank outside the left wall */}
        <g {...part("tank")}>
          <rect x={8} y={112} width={28} height={46} rx={3} />
          <path d="M8 124h28M8 136h28M8 148h28" fill="none" strokeWidth={0.8} />
          <path d="M36 140h10" fill="none" />
        </g>

        {/* roof and ceiling */}
        <g {...line("roof")}>
          <path d="M30 80 136 30l106 50" strokeWidth={lit.has("roof") ? 3.5 : 2.5} />
          <path d="M46 80h180" />
        </g>
        {lit.has("roof") && (
          <g fill={hot} stroke="none">
            <path d="M140 84c2.4 3.3 2.4 5.7 0 6.9-2.4-1.2-2.4-3.6 0-6.9z" />
            <path d="M145 97c2.4 3.3 2.4 5.7 0 6.9-2.4-1.2-2.4-3.6 0-6.9z" />
            <path d="M138 108c2.4 3.3 2.4 5.7 0 6.9-2.4-1.2-2.4-3.6 0-6.9z" />
          </g>
        )}

        {/* left room: air conditioner, window, stove, fridge, sink, medical equipment */}
        <g {...part("aircon")}>
          <rect x={54} y={88} width={34} height={11} rx={2} />
          <path d="M58 95h26" fill="none" strokeWidth={0.8} />
        </g>
        <g {...part("window")}>
          <rect x={104} y={90} width={30} height={22} />
          <path d="M119 90v22M104 101h30" fill="none" strokeWidth={0.8} />
        </g>
        <g {...part("kitchen")}>
          <rect x={52} y={126} width={20} height={24} />
          <path d="M52 131h20M57 128.5h.1M67 128.5h.1" fill="none" strokeWidth={0.9} />
          <rect x={76} y={112} width={16} height={38} />
          <path d="M76 126h16" fill="none" strokeWidth={0.9} />
        </g>
        <g {...line("pest")}>
          <ellipse cx={98} cy={145} rx={4.5} ry={3.2} fill={lit.has("pest") ? hot : "none"} stroke={lit.has("pest") ? hot : "none"} />
          {lit.has("pest") && <path d="M94 143l-3-3M93.5 146h-4M94 148l-3 2M102 143l3-3M102.5 146h4M102 148l3 2" strokeWidth={1.3} />}
        </g>
        <g {...line("tap")}>
          <path d="M104 128h22" />
          <path d="M107 128v6h16v-6" />
          <path d="M115 128v-7q0-4 5-4" />
        </g>
        {lit.has("tap") && <path d="M120 120c1.3 1.8 1.3 3.1 0 3.8-1.3-.7-1.3-2 0-3.8z" fill={hot} />}
        <g {...part("medical")}>
          <rect x={130} y={132} width={12} height={18} rx={2} />
          <path d="M136 137v6M133 140h6" fill="none" strokeWidth={1} />
        </g>

        {/* wiring: ceiling light, power point, switchboard outside */}
        <g {...line("wiring")}>
          <path d="M100 80v8" />
          <circle cx={100} cy={91} r={3} fill={lit.has("wiring") ? hot : "var(--house-fill)"} />
          <rect x={143} y={115} width={5} height={8} rx={1} fill={lit.has("wiring") ? hot : "var(--house-fill)"} />
          <rect x={228} y={100} width={10} height={16} rx={1} fill={lit.has("wiring") ? hot : "var(--house-fill)"} fillOpacity={lit.has("wiring") ? 0.3 : 1} />
        </g>
        {lit.has("wiring") && <path d="M139 110l-3-3M137 116h-4M139 122l-3 3" stroke={hot} strokeWidth={1.4} fill="none" />}

        {/* right room: toilet, shower, door */}
        <g {...part("toilet")}>
          <rect x={157} y={120} width={8} height={15} rx={1} />
          <path d="M165 136h13q0 9-8 9h-3l-.5 5h7" />
        </g>
        <g {...line("shower")}>
          <path d="M196 150V92h-9" />
          <path d="M182 93h10l-2 4h-6z" fill={lit.has("shower") ? hot : "var(--house-fill)"} />
        </g>
        {lit.has("shower") && <path d="M184 101v3M187 102v5M190 101v3" stroke={hot} strokeWidth={1.2} fill="none" />}
        <g {...part("door")}>
          <rect x={203} y={106} width={19} height={44} />
          <circle cx={207} cy={130} r={1.2} fill={lit.has("door") ? hot : "var(--house-line)"} />
        </g>

        {/* ramp to the door, and the sewer line to the tank underground */}
        <g {...part("ramp")}>
          <path d="M226 150l74 8h-74z" />
          <path d="M228 138l72 8M246 140v12M272 143v12M300 146v12" fill="none" strokeWidth={1} />
        </g>
        <g {...part("sewer")}>
          <path d="M171 150v20h85" fill="none" />
          <rect x={256} y={163} width={40} height={18} rx={3} />
        </g>
      </svg>

      <figcaption className="mt-1.5 text-[11px]">
        {zones.length ? (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[var(--fg-2)]">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: hot }} />
            {zones.map((z) => ZONE_LABEL[z]).join(", ")}
          </span>
        ) : (
          <span className="text-[var(--muted)]">The report did not point to a specific part of the house.</span>
        )}
        <span className="mt-0.5 block text-[10px] text-[var(--muted)]">
          Drawn from what the report was read as, not a plan of the real house.
        </span>
      </figcaption>
    </figure>
  );
}
