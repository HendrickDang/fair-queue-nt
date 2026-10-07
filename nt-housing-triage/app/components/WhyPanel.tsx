"use client";

import Link from "next/link";
import { formatAud, formatKm } from "@/lib/data/distances";
import { whyCard } from "@/lib/explainer";
import { FLAG_LABEL, VULNERABILITY_LABEL } from "@/lib/taxonomy";
import { SAFETY_CLASS } from "@/lib/ui/colors";
import type { RankedJob } from "@/lib/engine/types";
import NeedBreakdown from "./NeedBreakdown";

interface Props {
  ranked: RankedJob | null;
  noBatchById?: Record<string, RankedJob>;
  /** Highest need score in the queue; when given, the score make-up is drawn. */
  queueMaxNeed?: number;
}

export default function WhyPanel({ ranked, noBatchById, queueMaxNeed }: Props) {
  if (!ranked) {
    return (
      <div className="panel p-4 text-sm text-[var(--muted)]">
        Select a job to see why it sits where it does.
      </div>
    );
  }

  const card = whyCard(ranked, noBatchById);
  const r = ranked;

  return (
    <div className="panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--fg-strong)]">{card.headline}</h2>
          <p className="mt-0.5 text-[11px] text-[var(--muted)]">
            {r.job.id} · {r.job.household ?? r.job.community.name} · reported{" "}
            {new Date(r.job.reportedAt).toLocaleDateString("en-AU")}
          </p>
        </div>
        <span className={`chip ${SAFETY_CLASS[r.job.report.safety_level]}`}>
          {r.job.report.safety_level}
        </span>
      </div>

      <p className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-3 text-sm leading-relaxed text-[var(--fg)]">
        {r.job.rawText}
      </p>

      <div className="mt-3 space-y-2 text-xs">
        <Line label="Why it ranks here" value={card.needSentence} />
        {queueMaxNeed !== undefined && <NeedBreakdown need={r.need} queueMax={queueMaxNeed} />}
        {card.ageSentence && <Line label="Waiting time" value={card.ageSentence} tone="ok" />}
        {card.gapSentence && <Line label="Equity gap" value={card.gapSentence} tone="warn" />}
        {card.batchSentence && <Line label="Batching" value={card.batchSentence} tone="ok" />}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {r.job.report.urgency_flags.map((f) => (
          <span key={f} className="chip">{FLAG_LABEL[f]}</span>
        ))}
        {r.job.report.occupant_vulnerability.map((v) => (
          <span key={v} className="chip border-amber-500/40 text-amber-700 dark:text-amber-200">
            {VULNERABILITY_LABEL[v]}
          </span>
        ))}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <Fact label="Round trip" value={formatKm(r.efficiency.travelKm)} />
        <Fact label="Travel mode" value={r.efficiency.mode} />
        <Fact label="Travel cost" value={formatAud(r.efficiency.travelCost)} />
        <Fact label="Batching credit" value={formatAud(r.efficiency.batchingBonus)} />
        <Fact label="On-site + travel" value={`${r.efficiency.labourHours.toFixed(1)} h`} />
        <Fact label="Est. start" value={`${r.estimatedStartDays.toFixed(0)} working days`} />
      </dl>

      <ul className="mt-3 space-y-1 text-[11px] text-[var(--muted)]">
        {card.facts.map((fact) => (
          <li key={fact}>• {fact}</li>
        ))}
      </ul>

      <Link
        href={`/tenant?job=${r.job.id}`}
        className="mt-4 inline-flex rounded-lg border border-[var(--accent)] px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-[var(--accent)]/10 dark:text-amber-200"
      >
        View tenant answer →
      </Link>
    </div>
  );
}

function Line({
  label,
  value,
  tone = "ok",
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className={tone === "warn" ? "text-amber-700 dark:text-amber-200" : "text-[var(--fg)]"}>{value}</div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-2">
      <dt className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{label}</dt>
      <dd className="mt-0.5 font-semibold text-[var(--fg-strong)]">{value}</dd>
    </div>
  );
}
