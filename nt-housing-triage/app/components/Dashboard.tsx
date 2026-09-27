"use client";

import { useMemo, useState } from "react";
import { rankJobs } from "@/lib/engine/rank";
import type { Job } from "@/lib/engine/types";
import EquityDial from "./EquityDial";
import QueueTable from "./QueueTable";
import WhyPanel from "./WhyPanel";
import NtMap from "./NtMap";
import CommitPanel from "./CommitPanel";
import ReportForm from "./ReportForm";

export default function Dashboard({ initialJobs }: { initialJobs: Job[] }) {
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [lambda, setLambda] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(initialJobs[0]?.id ?? null);

  const result = useMemo(() => rankJobs(jobs, { lambda }), [jobs, lambda]);
  // Rank as if nothing were batched, to show how many places batching recovers.
  const noBatch = useMemo(() => rankJobs(jobs, { lambda, batching: false }), [jobs, lambda]);

  const selected = (selectedId && result.byId[selectedId]) || result.ranked[0] || null;

  function addJob(job: Job) {
    setJobs((prev) => [...prev, job]);
    setSelectedId(job.id);
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-5">
      <section className="panel mb-4 p-4">
        <h1 className="text-base font-semibold text-white">
          Prioritise urgent repairs across remote NT communities — without quietly pushing remote
          tenants to the back of the queue.
        </h1>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Two independent ranks: a location-blind <span className="text-slate-200">need</span> rank and
          a logistics <span className="text-slate-200">efficiency</span> rank. The gap between them is
          the equity trade-off. Batching closes most of it; the dial exposes the rest — and a human
          owns the call.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <EquityDial lambda={lambda} onChange={setLambda} summary={result.summary} />
          <ReportForm onAdd={addJob} />
          <CommitPanel lambda={lambda} ranked={result.ranked} summary={result.summary} />
        </div>

        <div className="space-y-4">
          <QueueTable ranked={result.ranked} selectedId={selected?.job.id ?? null} onSelect={setSelectedId} />
          <div className="panel p-4">
            <h2 className="text-sm font-semibold">Batches this week</h2>
            {result.batches.length === 0 ? (
              <p className="mt-1 text-[11px] text-[var(--muted)]">No batchable clusters in the queue.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {result.batches.map((b) => (
                  <li key={b.id} className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-2.5 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-100">{b.label}</span>
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

        <div className="space-y-4">
          <WhyPanel ranked={selected} noBatchById={noBatch.byId} />
          <NtMap jobs={jobs} selectedId={selected?.job.id ?? null} onSelect={setSelectedId} />
        </div>
      </div>
    </div>
  );
}
