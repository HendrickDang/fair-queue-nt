"use client";

import type { RankedJob } from "@/lib/engine/types";
import { aheadOf, type AheadReason } from "@/lib/explainer";

interface Props {
  /** The tenant's own repair. */
  mine: RankedJob;
  ranked: RankedJob[];
}

const SLOT = 46;
const H = 96;
const GROUND = 70;

const REASON: Record<AheadReason, { label: string; color: string }> = {
  more_urgent: { label: "more urgent for safety", color: "var(--house-line)" },
  waiting_longer: { label: "waiting longer", color: "var(--viz-town)" },
  cheaper_to_reach: { label: "cheaper or quicker to reach", color: "var(--accent)" },
};

/** A small mark above each house saying why it is ahead: ! urgent, clock waiting, $ cheaper. */
function Mark({ reason, x }: { reason: AheadReason; x: number }) {
  const color = REASON[reason].color;
  return (
    <g>
      <circle cx={x} cy={14} r={9} fill="var(--panel)" stroke={color} strokeWidth={1.6} />
      {reason === "more_urgent" && <path d={`M${x} 9.5v5.5M${x} 18v.2`} stroke={color} strokeWidth={2} strokeLinecap="round" />}
      {reason === "waiting_longer" && <path d={`M${x} 9.5V14l3 2`} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />}
      {reason === "cheaper_to_reach" && (
        <text x={x} y={18} textAnchor="middle" fontSize={11} fontWeight={700} fill={color}>
          $
        </text>
      )}
    </g>
  );
}

/**
 * The tenant's place in the queue as a street. It shows only how many homes are
 * ahead and why, never whose they are or what is wrong with them.
 */
export default function TenantStreet({ mine, ranked }: Props) {
  const ahead = aheadOf(mine, ranked);
  const behind = ranked.length - mine.finalRank;
  const count = (reason: AheadReason) => ahead.filter((a) => a.reason === reason).length;
  const width = (ahead.length + 1) * SLOT + 12;
  const reasons = (Object.keys(REASON) as AheadReason[]).filter((r) => count(r) > 0);

  const house = (x: number, roof: string, strong: boolean) => (
    <g strokeLinecap="round" strokeLinejoin="round">
      <rect x={x - 13} y={48} width={26} height={22} fill={strong ? "var(--accent)" : "var(--house-fill)"} fillOpacity={strong ? 0.18 : 1} stroke={strong ? "var(--accent)" : "var(--house-line)"} strokeWidth={strong ? 2 : 1.2} />
      <rect x={x - 3.5} y={57} width={7} height={13} fill="none" stroke={strong ? "var(--accent)" : "var(--house-line)"} strokeWidth={1.1} />
      <path d={`M${x - 18} 49 ${x} 33l18 16`} fill="none" stroke={roof} strokeWidth={strong ? 3.5 : 2.5} />
    </g>
  );

  return (
    <figure className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-3">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${H}`}
          style={{ width: "100%", minWidth: Math.min(width, (ahead.length + 1) * 34), maxWidth: width * 1.25, height: "auto" }}
          role="img"
          aria-label={
            ahead.length === 0
              ? "Your repair is first in the queue."
              : `${ahead.length} repairs are ahead of yours: ${reasons.map((r) => `${count(r)} ${REASON[r].label}`).join(", ")}.`
          }
        >
          <line x1={0} x2={width} y1={GROUND} y2={GROUND} stroke="var(--house-line)" strokeWidth={1.2} />
          {ahead.map((a, i) => {
            const x = 6 + i * SLOT + SLOT / 2;
            return (
              <g key={a.job.job.id}>
                <Mark reason={a.reason} x={x} />
                {house(x, REASON[a.reason].color, false)}
                <text x={x} y={86} textAnchor="middle" fontSize={10} fill="var(--muted)">
                  {i + 1}
                </text>
              </g>
            );
          })}
          {(() => {
            const x = 6 + ahead.length * SLOT + SLOT / 2;
            return (
              <g>
                <text x={x} y={18} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--fg-strong)">
                  You
                </text>
                {house(x, "var(--accent)", true)}
                <text x={x} y={86} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--fg-strong)">
                  {mine.finalRank}
                </text>
              </g>
            );
          })()}
        </svg>
      </div>

      <figcaption className="mt-2 text-xs text-[var(--fg-2)]">
        {ahead.length === 0 ? (
          <span>Your repair is first in line.</span>
        ) : (
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {reasons.map((r) => (
              <li key={r} className="flex items-center gap-1.5">
                <svg width="20" height="20" viewBox="-1 3 22 22" aria-hidden="true">
                  <Mark reason={r} x={10} />
                </svg>
                <span>
                  <span className="font-semibold text-[var(--fg-strong)]">{count(r)}</span> {REASON[r].label}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1.5 text-[11px] text-[var(--muted)]">
          {behind > 0 ? `${behind} ${behind === 1 ? "repair is" : "repairs are"} behind yours. ` : ""}
          Other homes are shown without names or details.
        </p>
      </figcaption>
    </figure>
  );
}
