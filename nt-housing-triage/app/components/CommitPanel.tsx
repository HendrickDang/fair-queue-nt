"use client";

import { useCallback, useEffect, useState } from "react";
import { dialNarrative } from "@/lib/explainer";
import { getCommunityById } from "@/lib/data/communities";
import type { EquitySummary, RankedJob } from "@/lib/engine/types";
import type { ScheduleWithJobs } from "@/lib/db/types";

interface Props {
  lambda: number;
  ranked: RankedJob[];
  summary: EquitySummary;
}

/**
 * Commits the current schedule. The decision is written to SQLite (schedule,
 * ordered jobs, and an audit entry) via /api/commit, so it survives reloads and
 * is the same record the tenant view can be honest about.
 */
export default function CommitPanel({ lambda, ranked, summary }: Props) {
  const [entries, setEntries] = useState<ScheduleWithJobs[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/audit", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { schedules?: ScheduleWithJobs[] };
      setEntries(data.schedules ?? []);
    } catch {
      /* Offline is fine — keep whatever was last shown. */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function commit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lambda,
          actor: "coordinator",
          narrative: dialNarrative(summary),
          jobs: ranked.map((r, i) => ({
            id: r.job.id,
            position: i + 1,
            needRank: r.needRank,
            efficiencyRank: r.efficiencyRank,
            equityGap: r.equityGap,
          })),
        }),
      });
      if (!res.ok) throw new Error(`Commit failed (${res.status})`);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Commit schedule</h2>
        <span className="text-[11px] text-[var(--muted)]">audited · SQLite</span>
      </div>
      <p className="mt-1 text-[11px] text-[var(--muted)]">
        The dial is a recommendation. A human commits the schedule, and the choice is recorded.
      </p>
      <button
        onClick={commit}
        disabled={busy}
        className="mt-3 w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Committing…" : `Commit this schedule at λ = ${lambda.toFixed(2)}`}
      </button>

      {error && <p className="mt-2 text-[11px] text-rose-300">{error}</p>}

      <div className="mt-3 max-h-52 space-y-2 overflow-y-auto">
        {entries.length === 0 && (
          <p className="text-[11px] text-[var(--muted)]">No committed schedules yet.</p>
        )}
        {entries.map((e) => (
          <div
            key={e.id}
            className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-2.5 text-[11px]"
          >
            <div className="flex items-center justify-between text-[var(--muted)]">
              <span>{new Date(e.at).toLocaleString("en-AU")}</span>
              <span className="chip">λ {e.lambda.toFixed(2)}</span>
            </div>
            <p className="mt-1 text-slate-200">{e.narrative}</p>
            <p className="mt-1 text-[var(--muted)]">
              Top:{" "}
              {e.order
                .slice(0, 3)
                .map((o) => `${getCommunityById(o.community ?? "")?.name ?? o.community ?? "?"} (${o.id})`)
                .join(", ")}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
