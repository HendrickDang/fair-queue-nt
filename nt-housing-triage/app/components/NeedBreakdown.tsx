"use client";

import type { NeedScore } from "@/lib/engine/types";
import { needBreakdown } from "@/lib/viz";

interface Props {
  need: NeedScore;
  /** Highest need score in the queue, so every job is drawn on the same scale. */
  queueMax: number;
}

const DETAIL: Record<string, (need: NeedScore) => string> = {
  safety: () => "base points for the safety level",
  hazards: () => "added for each hazard in the report",
  household: (n) => `multiplier ×${n.vulnerabilityMultiplier.toFixed(2)} on the two rows above`,
  waiting: (n) => `${Math.round(n.ageDays)} days since the report`,
};

const pts = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/**
 * How one job's need score is built, drawn as a running total: each bar starts
 * where the one above ended. Location is not an input, so there is no row for it.
 */
export default function NeedBreakdown({ need, queueMax }: Props) {
  const { parts, total } = needBreakdown(need);
  const scale = Math.max(queueMax, total, 1);
  let running = 0;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-2.5">
      <div className="flex items-baseline justify-between">
        <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">How the need score is built</div>
        <div className="text-[10px] text-[var(--muted)]">queue top: {pts(Math.round(queueMax))}</div>
      </div>

      <dl className="mt-2 space-y-1.5 text-[11px]">
        {parts.map((p) => {
          const start = running;
          running += p.points;
          return (
            <div key={p.key} className="grid grid-cols-[92px_1fr_38px] items-center gap-2" title={`${p.label}: ${DETAIL[p.key](need)}`}>
              <dt className={p.points > 0 ? "text-[var(--fg-2)]" : "text-[var(--muted)]"}>{p.label}</dt>
              <dd className="relative h-2.5 rounded-sm bg-[var(--viz-grid)]">
                {p.points > 0 && (
                  <span
                    className="absolute inset-y-0 rounded-sm"
                    style={{
                      left: `${(start / scale) * 100}%`,
                      width: `max(2px, ${(p.points / scale) * 100}%)`,
                      background: "var(--viz-neutral)",
                    }}
                  />
                )}
              </dd>
              <dd className={`text-right tabular-nums ${p.points > 0 ? "text-[var(--fg)]" : "text-[var(--muted)]"}`}>
                {p.points > 0 ? `+${pts(Math.round(p.points * 10) / 10)}` : "0"}
              </dd>
            </div>
          );
        })}
        <div className="grid grid-cols-[92px_1fr_38px] items-center gap-2 border-t border-[var(--border)] pt-1.5">
          <dt className="font-semibold text-[var(--fg-strong)]">Need score</dt>
          <dd className="relative h-2.5 rounded-sm bg-[var(--viz-grid)]">
            <span
              className="absolute inset-y-0 left-0 rounded-sm"
              style={{ width: `${(total / scale) * 100}%`, background: "var(--fg-strong)" }}
            />
          </dd>
          <dd className="text-right font-semibold tabular-nums text-[var(--fg-strong)]">{pts(Math.round(total * 10) / 10)}</dd>
        </div>
      </dl>
      <p className="mt-2 text-[10px] text-[var(--muted)]">Location is not an input. The same report scores the same in any community.</p>
    </div>
  );
}
