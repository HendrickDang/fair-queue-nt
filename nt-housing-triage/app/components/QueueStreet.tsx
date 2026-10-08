"use client";

import type { RankedJob } from "@/lib/engine/types";
import { TIER_LABEL } from "@/lib/data/communities";
import { SAFETY_DOT } from "@/lib/ui/colors";
import { FAULT_LABEL, faultKind } from "@/lib/ui/fault";
import { isRemote } from "@/lib/viz";
import FaultIcon from "./FaultIcon";

interface Props {
  ranked: RankedJob[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const H = 112;
const SLOT = 62; // width one house takes up
const GROUND = 86;

/**
 * The queue drawn as a street: one house per repair, first in line on the left.
 * The roof colour says town or remote, the badge says what is broken and how
 * urgent. Houses slide to their new place when the dial moves.
 */
export default function QueueStreet({ ranked, selectedId, onSelect }: Props) {
  const width = Math.max(ranked.length * SLOT + 16, 320);

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${H}`}
        // fills the panel; a short queue stops growing at 1.5x so the houses do not get huge
        style={{ width: "100%", minWidth: Math.min(width, ranked.length * 40), maxWidth: width * 1.5, height: "auto" }}
        role="group"
        aria-label="The queue as a street of houses, first in line on the left"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1={0} x2={width} y1={GROUND} y2={GROUND} stroke="var(--house-line)" strokeWidth={1.2} />

        {/* Keyed by job, so each house keeps its identity and slides when the order changes. */}
        {[...ranked]
          .sort((a, b) => a.job.id.localeCompare(b.job.id))
          .map((r) => {
            const selected = r.job.id === selectedId;
            const remote = isRemote(r.job);
            const roof = remote ? "var(--viz-remote)" : "var(--viz-town)";
            const kind = faultKind(r.job.report);
            const held = r.need.heldForReading;
            const label = `Position ${r.finalRank}: ${r.job.report.summary}. ${r.job.community.name}, ${TIER_LABEL[r.job.community.tier]}. ${
              held ? "Held at high priority until a person reads it" : `${FAULT_LABEL[kind]}, ${r.job.report.safety_level}`
            }.`;
            return (
              <g
                key={r.job.id}
                className="street-house"
                style={{ transform: `translateX(${8 + (r.finalRank - 1) * SLOT}px)` }}
                role="button"
                tabIndex={0}
                aria-label={label}
                aria-pressed={selected}
                onClick={() => onSelect(r.job.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(r.job.id);
                  }
                }}
              >
                <title>{label}</title>
                {selected && <rect x={3} y={2} width={SLOT - 6} height={H - 4} rx={8} fill="var(--accent)" opacity={0.14} />}
                {/* what is broken, coloured by how urgent it is */}
                <circle cx={SLOT / 2} cy={19} r={12} fill={held ? "var(--accent)" : SAFETY_DOT[r.job.report.safety_level]} />
                {held ? (
                  // not read by a person yet: a question, not a fault type
                  <text x={SLOT / 2} y={24.5} textAnchor="middle" fontSize={16} fontWeight={700} fill="#0b1220">
                    ?
                  </text>
                ) : (
                  <FaultIcon kind={kind} x={SLOT / 2 - 8} y={11} size={16} color="#0b1220" strokeWidth={2} labelled={false} />
                )}
                <line x1={SLOT / 2} x2={SLOT / 2} y1={31} y2={38} stroke={held ? "var(--accent)" : SAFETY_DOT[r.job.report.safety_level]} strokeWidth={1.5} />
                {/* the house: remote houses stand on stumps with a tank, town houses sit on a slab */}
                <rect x={15} y={58} width={32} height={remote ? 23 : 28} fill="var(--house-fill)" stroke="var(--house-line)" strokeWidth={1.2} />
                <rect x={27} y={remote ? 66 : 70} width={8} height={remote ? 15 : 16} fill="none" stroke="var(--house-line)" strokeWidth={1.1} />
                {remote && <path d="M18 81v5M31 81v5M44 81v5" stroke="var(--house-line)" strokeWidth={1.2} />}
                {remote && <rect x={49} y={68} width={7} height={18} rx={1.5} fill="var(--house-fill)" stroke="var(--house-line)" strokeWidth={1.1} />}
                <path d={`M10 59 31 41l21 18`} fill="none" stroke={roof} strokeWidth={3.5} />
                <text x={SLOT / 2} y={104} textAnchor="middle" fontSize={11} fontWeight={selected ? 700 : 500} fill={selected ? "var(--fg-strong)" : "var(--muted)"}>
                  {r.finalRank}
                </text>
              </g>
            );
          })}
      </svg>
    </div>
  );
}
