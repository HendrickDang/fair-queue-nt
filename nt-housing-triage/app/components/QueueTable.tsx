"use client";

import { SAFETY_CLASS } from "@/lib/ui/colors";
import { TIER_LABEL } from "@/lib/data/communities";
import type { RankedJob } from "@/lib/engine/types";

interface Props {
  ranked: RankedJob[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function QueueTable({ ranked, selectedId, onSelect }: Props) {
  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-sm font-semibold">Ranked queue</h2>
        <span className="text-[11px] text-[var(--muted)]">
          need rank vs efficiency rank · gap = places logistics moves it
        </span>
      </div>
      <div className="max-h-[520px] overflow-y-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-[var(--panel-2)] text-[10px] uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Job</th>
              <th className="px-3 py-2">Community</th>
              <th className="px-3 py-2">Safety</th>
              <th className="px-3 py-2 text-right">Need</th>
              <th className="px-3 py-2 text-right">Eff.</th>
              <th className="px-3 py-2 text-right">Gap</th>
              <th className="px-3 py-2">Batch</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((r) => {
              const active = r.job.id === selectedId;
              return (
                <tr
                  key={r.job.id}
                  onClick={() => onSelect(r.job.id)}
                  className={`cursor-pointer border-b border-[var(--border)]/60 transition ${
                    active ? "bg-[var(--accent)]/10" : "hover:bg-[var(--panel-2)]"
                  }`}
                >
                  <td className="px-3 py-2 font-semibold text-white">{r.finalRank}</td>
                  <td className="max-w-[280px] px-3 py-2">
                    <div className="truncate text-slate-100">{r.job.report.summary}</div>
                    <div className="text-[10px] text-[var(--muted)]">
                      {r.job.id} · {r.job.report.trade_required}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-slate-200">{r.job.community.name}</div>
                    <div className="text-[10px] text-[var(--muted)]">
                      {TIER_LABEL[r.job.community.tier]}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`chip ${SAFETY_CLASS[r.job.report.safety_level]}`}>
                      {r.job.report.safety_level}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-300">{r.needRank}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                    {r.efficiencyRank}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-semibold tabular-nums ${
                      r.equityGap > 0 ? "text-amber-300" : r.equityGap < 0 ? "text-teal-300" : "text-slate-400"
                    }`}
                  >
                    {r.equityGap > 0 ? `+${r.equityGap}` : r.equityGap}
                  </td>
                  <td className="px-3 py-2 text-[10px] text-[var(--muted)]">
                    {r.batch ? r.batch.label : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
