"use client";

import { useEffect, useMemo, useState } from "react";
import { rankJobs } from "@/lib/engine/rank";
import type { Job } from "@/lib/engine/types";
import { tenantAnswer, formatVisitDate } from "@/lib/explainer";
import { SAFETY_LABEL } from "@/lib/taxonomy";
import { SAFETY_CLASS } from "@/lib/ui/colors";

interface Props {
  jobs: Job[];
  initialJobId: string | null;
}

/**
 * Tenant-facing answer. Plain language, honest about *why* a job sits where it
 * does — including when the coordinator's dial moved it down.
 */
export default function TenantView({ jobs, initialJobId }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(initialJobId);
  const [lambda, setLambda] = useState(0.4);

  const result = useMemo(() => rankJobs(jobs, { lambda }), [jobs, lambda]);
  const ranked = (selectedId && result.byId[selectedId]) || result.ranked[0];

  const answer = tenantAnswer(ranked, {
    lambda,
    total: result.ranked.length,
  });

  const [escalating, setEscalating] = useState(false);
  const [escalated, setEscalated] = useState(false);
  const [escalationError, setEscalationError] = useState<string | null>(null);

  useEffect(() => {
    setEscalated(false);
    setEscalationError(null);
  }, [ranked.job.id]);

  async function escalate() {
    if (escalating) return;
    setEscalating(true);
    setEscalationError(null);
    try {
      const res = await fetch("/api/escalate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reportId: ranked.job.id,
          actor: "tenant",
          reason: `Tenant escalated ${ranked.job.id} (${ranked.job.community.name}).`,
        }),
      });
      if (!res.ok) throw new Error(`Escalation failed (${res.status})`);
      setEscalated(true);
    } catch (e) {
      setEscalationError((e as Error).message);
    } finally {
      setEscalating(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-6">
      <div className="panel p-4">
        <label className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
          Which repair is this about?
        </label>
        <select
          value={ranked.job.id}
          onChange={(e) => setSelectedId(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-2.5 text-sm text-slate-100 outline-none focus:border-[var(--accent)]"
        >
          {result.ranked.map((r) => (
            <option key={r.job.id} value={r.job.id}>
              {r.job.report.summary} — {r.job.community.name} ({r.job.id})
            </option>
          ))}
        </select>

        <div className="mt-3 flex items-center gap-3">
          <span className="text-[11px] text-[var(--muted)]">This week's policy</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={lambda}
            onChange={(e) => setLambda(Number(e.target.value))}
            className="flex-1"
            aria-label="Policy dial"
          />
          <span className="chip">λ {lambda.toFixed(2)}</span>
        </div>
      </div>

      <div className="panel mt-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
              {ranked.job.id} · {ranked.job.community.name}
            </p>
            <h1 className="mt-1 text-xl font-semibold text-white">{answer.headline}</h1>
          </div>
          <span className={`chip ${SAFETY_CLASS[ranked.job.report.safety_level]}`}>
            {SAFETY_LABEL[ranked.job.report.safety_level]}
          </span>
        </div>

        <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-100">
          {answer.body.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>

        <div className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-100">
          <p>{answer.escalation}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              onClick={escalate}
              disabled={escalating || escalated}
              className="rounded-lg border border-amber-400/40 px-3 py-1.5 font-medium text-amber-100 transition hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {escalated ? "Escalation recorded" : escalating ? "Recording…" : "Record escalation"}
            </button>
            {escalationError && <span className="text-rose-300">{escalationError}</span>}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-[11px] sm:grid-cols-4">
          <Fact label="Need rank" value={`#${ranked.needRank}`} />
          <Fact label="Efficiency rank" value={`#${ranked.efficiencyRank}`} />
          <Fact label="Moved by policy" value={`${ranked.movedByDial >= 0 ? "+" : ""}${ranked.movedByDial}`} />
          <Fact label="Est. visit" value={formatVisitDate(ranked.estimatedStartDays)} />
        </div>

        <p className="mt-4 text-[11px] text-[var(--muted)]">
          You can always ask why your repair was prioritised the way it was — the answer above is
          generated from the same scores the coordinator sees, not a separate story.
        </p>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-2">
      <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}
