"use client";

import { useCallback, useEffect, useState } from "react";
import { dialNarrative } from "@/lib/explainer";
import { getCommunityById } from "@/lib/data/communities";
import type { EquitySummary, RankedJob } from "@/lib/engine/types";
import type { ScheduleWithJobs } from "@/lib/db/types";
import { isRemote } from "@/lib/viz";

const ROLES = ["Maintenance coordinator", "Regional housing manager", "Housing officer"];
const FIELD =
  "mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-2 text-xs text-[var(--fg)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]";

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
  // Who owns this decision, and why. The role and reason are shown to tenants;
  // the name stays in the audit trail.
  const [role, setRole] = useState(ROLES[0]);
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");

  // What this dial setting does to households, stated before anyone commits to it.
  const weighted = lambda > 0;
  const remoteDown = ranked.filter((r) => isRemote(r.job) && r.movedByDial > 0).length;
  const townUp = ranked.filter((r) => !isRemote(r.job) && r.movedByDial < 0).length;
  const added = summary.addedMedianDaysRemote;
  const ready = name.trim().length > 0 && (!weighted || reason.trim().length > 0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/audit", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { schedules?: ScheduleWithJobs[] };
      setEntries(data.schedules ?? []);
    } catch {
      /* Offline is fine - keep whatever was last shown. */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function commit() {
    if (busy || !ready) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lambda,
          actor: "coordinator",
          role,
          name: name.trim(),
          reason: weighted ? reason.trim() : "",
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
      if (!res.ok) {
        const problem = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(problem?.error ?? `Commit failed (${res.status})`);
      }
      setReason("");
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
      <div
        className={`mt-3 rounded-lg border p-2.5 text-xs ${
          weighted
            ? "border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-100"
            : "border-[var(--border)] bg-[var(--panel-2)] text-[var(--fg-2)]"
        }`}
      >
        <p className="font-semibold">Before you commit</p>
        <p className="mt-1">
          {weighted
            ? `At ${Math.round(lambda * 100)}% travel weight, ${remoteDown} remote ${remoteDown === 1 ? "household moves" : "households move"} down the queue and ${townUp} town ${townUp === 1 ? "household moves" : "households move"} up. The median remote wait ${
                // same rounding as the dial's own sentence, so the two never disagree
                Math.round(added) > 0 ? `grows by about ${Math.round(added)} ${Math.round(added) === 1 ? "day" : "days"}` : "barely changes"
              }. Total travel cost stays the same.`
            : "Need-only order. No household is moved because of where it lives."}
        </p>
      </div>

      <label className="mt-3 block text-[11px] text-[var(--muted)]">
        Your role
        <select value={role} onChange={(e) => setRole(e.target.value)} className={FIELD}>
          {ROLES.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </label>
      <label className="mt-2 block text-[11px] text-[var(--muted)]">
        Your name (kept in the audit log, not shown to tenants)
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={FIELD} />
      </label>
      {weighted && (
        <label className="mt-2 block text-[11px] text-[var(--muted)]">
          Why are you giving travel cost weight? Tenants who are moved down will be shown this.
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={300}
            placeholder="e.g. Only one plumber is available this week, so we are clearing the Darwin jobs first."
            className={`${FIELD} resize-none`}
          />
        </label>
      )}

      <button
        onClick={commit}
        disabled={busy || !ready}
        className="mt-3 w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Committing…" : `Commit this schedule at λ = ${lambda.toFixed(2)}`}
      </button>

      {!ready && (
        <p className="mt-1.5 text-[11px] text-[var(--muted)]">
          {name.trim() ? "Add a reason to commit a schedule that weights travel cost." : "Add your name to commit."}
        </p>
      )}
      {error && <p className="mt-2 text-[11px] text-rose-600 dark:text-rose-300">{error}</p>}

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
            {(e.name || e.role) && (
              <p className="mt-1 font-medium text-[var(--fg)]">
                {[e.name, e.role].filter(Boolean).join(", ")}
              </p>
            )}
            <p className="mt-1 text-[var(--fg-2)]">{e.narrative}</p>
            {e.reason && <p className="mt-1 text-[var(--fg-2)]">Reason: {e.reason}</p>}
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
