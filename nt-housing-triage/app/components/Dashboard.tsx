"use client";

import { useMemo, useState } from "react";
import { rankJobs } from "@/lib/engine/rank";
import type { Job } from "@/lib/engine/types";
import { AGEING_POINTS_PER_DAY } from "@/lib/taxonomy";
import EquityDial from "./EquityDial";
import QueueTable from "./QueueTable";
import WhyPanel from "./WhyPanel";
import NtMap from "./NtMap";
import CommitPanel from "./CommitPanel";
import ReportForm from "./ReportForm";
import TradeoffChart from "./TradeoffChart";
import RankShiftChart from "./RankShiftChart";
import QueueStreet from "./QueueStreet";
import { isRemote } from "@/lib/viz";

export default function Dashboard({ initialJobs, now }: { initialJobs: Job[]; now: string }) {
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [lambda, setLambda] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(initialJobs[0]?.id ?? null);

  // One options object for every ranking on the page, so the charts and the queue agree.
  // Ageing is a fixed policy, not a dial: waiting time raises priority so new
  // reports cannot keep pushing an older report down the queue.
  const rankOptions = useMemo(() => ({ ageing: AGEING_POINTS_PER_DAY, now }), [now]);
  const result = useMemo(() => rankJobs(jobs, { ...rankOptions, lambda }), [jobs, lambda, rankOptions]);
  // Rank as if nothing were batched, to show how many places batching recovers.
  const noBatch = useMemo(
    () => rankJobs(jobs, { ...rankOptions, lambda, batching: false }),
    [jobs, lambda, rankOptions],
  );

  const selected = (selectedId && result.byId[selectedId]) || result.ranked[0] || null;
  // Highest need score in the queue: the common scale for the score make-up bars.
  const queueMaxNeed = Math.max(0, ...result.ranked.map((r) => r.need.score));
  const criticalCount = result.ranked.filter((r) => r.job.report.safety_level === "critical").length;
  const remoteCount = result.ranked.filter((r) => isRemote(r.job)).length;
  const wetCount = result.ranked.filter((r) => r.job.community.wetSeasonIsolation).length;

  /**
   * A person has read a held report. The server lifts the hold and writes the
   * audit entry; the queue here is updated the same way.
   */
  async function markRead(id: string, level: "high" | "critical" | null) {
    const res = await fetch("/api/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reportId: id, level, actor: "coordinator" }),
    });
    if (!res.ok) throw new Error(`Could not save (${res.status})`);
    const order = ["low", "medium", "high", "critical"];
    setJobs((prev) =>
      prev.map((j) => {
        if (j.id !== id) return j;
        const current = j.report.safety_level;
        const raised = level && order.indexOf(level) > order.indexOf(current) ? level : current;
        return { ...j, needsReading: false, report: { ...j.report, safety_level: raised } };
      }),
    );
  }

  function addJob(job: Job) {
    setJobs((prev) => [...prev, job]);
    setSelectedId(job.id);
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-5">
      <section className="panel mb-4 overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 p-4 pb-3">
          <div className="min-w-0 max-w-3xl flex-1 basis-96">
            <h1 className="text-base font-semibold text-[var(--fg-strong)]">
              Prioritise urgent repairs across remote NT communities - without quietly pushing remote
              tenants to the back of the queue.
            </h1>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Two independent ranks: a location-blind <span className="text-[var(--fg-2)]">need</span> rank and
              a logistics <span className="text-[var(--fg-2)]">efficiency</span> rank. The gap between them is
              the equity trade-off. Batching closes most of it; the dial exposes the rest - and a human
              owns the call. A fixed waiting-time rule adds priority for older reports, so a rush of new
              reports cannot push an old one down the queue.
            </p>
          </div>
          <dl className="flex flex-wrap gap-2 text-[11px]">
            {[
              { label: "Repairs waiting", value: result.ranked.length },
              { label: "Critical", value: criticalCount },
              { label: "In remote communities", value: remoteCount },
              { label: "Cut off in the wet", value: wetCount },
            ].map((s) => (
              <div key={s.label} className="min-w-[84px] rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2">
                <dd className="text-2xl font-semibold leading-none text-[var(--fg-strong)]">{s.value}</dd>
                <dt className="mt-1 text-[var(--muted)]">{s.label}</dt>
              </div>
            ))}
          </dl>
        </div>

        {/* The queue as a street of houses: the whole trade-off in one picture. */}
        <div className="border-t border-[var(--border)] bg-[var(--panel-2)] px-4 pb-2 pt-3">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] text-[var(--muted)]">
            <span>
              The queue as a street. First in line is on the left. Move the dial and watch who moves back.
            </span>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[var(--fg-2)]">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-1 w-4 rounded" style={{ background: "var(--viz-town)" }} />
                Town roof
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-1 w-4 rounded" style={{ background: "var(--viz-remote)" }} />
                Remote roof
              </span>
              <span className="text-[var(--muted)]">Badge: what is broken, coloured by urgency</span>
            </span>
          </div>
          <QueueStreet ranked={result.ranked} selectedId={selected?.job.id ?? null} onSelect={setSelectedId} />
        </div>
      </section>

      {/* min-w-0 lets each column shrink to the screen, so a wide table scrolls inside its panel */}
      <div className="grid gap-4 lg:grid-cols-[290px_minmax(0,1fr)_330px]">
        <div className="min-w-0 space-y-4">
          <EquityDial lambda={lambda} onChange={setLambda} summary={result.summary} />
          <TradeoffChart jobs={jobs} lambda={lambda} onChange={setLambda} options={rankOptions} />
          <ReportForm onAdd={addJob} />
          <CommitPanel lambda={lambda} ranked={result.ranked} summary={result.summary} />
        </div>

        <div className="min-w-0 space-y-4">
          <QueueTable ranked={result.ranked} selectedId={selected?.job.id ?? null} onSelect={setSelectedId} />
          <RankShiftChart
            jobs={jobs}
            current={result}
            selectedId={selected?.job.id ?? null}
            onSelect={setSelectedId}
            options={rankOptions}
          />
          <div className="panel p-4">
            <h2 className="text-sm font-semibold">Batches this week</h2>
            {result.batches.length === 0 ? (
              <p className="mt-1 text-[11px] text-[var(--muted)]">No batchable clusters in the queue.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {result.batches.map((b) => (
                  <li key={b.id} className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-2.5 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-[var(--fg)]">{b.label}</span>
                      <span className="chip">{b.mode}</span>
                    </div>
                    <p className="mt-1 text-[var(--muted)]">
                      {b.jobIds.length} jobs · saves ${Math.round(b.savedCost).toLocaleString("en-AU")} and{" "}
                      {Math.round(b.savedKm).toLocaleString("en-AU")} km vs solo trips
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <WhyPanel ranked={selected} noBatchById={noBatch.byId} queueMaxNeed={queueMaxNeed} onMarkRead={markRead} />
          <NtMap jobs={jobs} batches={result.batches} selectedId={selected?.job.id ?? null} onSelect={setSelectedId} />
        </div>
      </div>
    </div>
  );
}
