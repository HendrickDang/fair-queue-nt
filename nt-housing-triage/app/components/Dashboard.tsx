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

  function addJob(job: Job) {
    setJobs((prev) => [...prev, job]);
    setSelectedId(job.id);
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-5">
      <section className="panel mb-4 p-4">
        <h1 className="text-base font-semibold text-[var(--fg-strong)]">
          Prioritise urgent repairs across remote NT communities — without quietly pushing remote
          tenants to the back of the queue.
        </h1>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Two independent ranks: a location-blind <span className="text-[var(--fg-2)]">need</span> rank and
          a logistics <span className="text-[var(--fg-2)]">efficiency</span> rank. The gap between them is
          the equity trade-off. Batching closes most of it; the dial exposes the rest — and a human
          owns the call. A fixed waiting-time rule adds priority for older reports, so a rush of new
          reports cannot push an old one down the queue.
        </p>
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
          <WhyPanel ranked={selected} noBatchById={noBatch.byId} queueMaxNeed={queueMaxNeed} />
          <NtMap jobs={jobs} selectedId={selected?.job.id ?? null} onSelect={setSelectedId} />
        </div>
      </div>
    </div>
  );
}
