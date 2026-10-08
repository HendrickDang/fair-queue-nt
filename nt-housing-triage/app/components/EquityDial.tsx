"use client";

import { useEffect, useRef, useState } from "react";
import { formatAud } from "@/lib/data/distances";
import type { EquitySummary } from "@/lib/engine/types";
import { dialNarrative } from "@/lib/explainer";

interface Props {
  lambda: number;
  onChange: (value: number) => void;
  summary: EquitySummary;
}

const PRESETS = [
  { label: "Pure need", value: 0 },
  { label: "Balanced", value: 0.4 },
  { label: "Pure efficiency", value: 1 },
];

export default function EquityDial({ lambda, onChange, summary }: Props) {
  const pct = Math.round(lambda * 100);

  // "Play" sweeps the dial from need only to cost only and back to where it was,
  // so the whole trade-off can be watched without touching the slider.
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  function stop() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setPlaying(false);
  }
  function play() {
    const home = lambda;
    // 0 ... 1 in steps of 0.05, a short hold at each end, then back home
    const frames = [...Array.from({ length: 21 }, (_, i) => i / 20), 1, 1, 1, 1, home];
    let i = 0;
    setPlaying(true);
    onChange(0);
    timer.current = setInterval(() => {
      i += 1;
      onChange(Math.round(frames[i] * 100) / 100);
      if (i >= frames.length - 1) stop();
    }, 320);
  }
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);
  /** Any manual change takes over from the sweep. */
  function setByHand(value: number) {
    stop();
    onChange(value);
  }

  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Equity dial</h2>
        <span className="chip">λ = {lambda.toFixed(2)}</span>
      </div>

      <p className="mt-2 text-[11px] text-[var(--muted)]">
        0 = pure fair (need only) · 1 = pure efficient (logistics only)
      </p>

      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={lambda}
        onChange={(e) => setByHand(Number(e.target.value))}
        className="mt-3 w-full"
        aria-label="Equity dial"
      />

      <div className="mt-2 flex gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => setByHand(p.value)}
            className={`rounded-lg border px-2.5 py-1 text-[11px] transition ${
              Math.abs(lambda - p.value) < 0.001
                ? "border-[var(--accent)] bg-[var(--accent)]/15 text-amber-700 dark:text-amber-200"
                : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg-strong)]"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <button
        onClick={playing ? stop : play}
        aria-pressed={playing}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[11px] text-[var(--fg-2)] transition hover:border-[var(--accent)] hover:text-[var(--fg-strong)]"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" fill="currentColor">
          {playing ? <path d="M1 1h3v8H1zM6 1h3v8H6z" /> : <path d="M1.5 0.5 9 5 1.5 9.5z" />}
        </svg>
        {playing ? "Stop" : "Play the dial from need to cost"}
      </button>

      <p className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-3 text-xs leading-relaxed text-[var(--fg-2)]">
        {dialNarrative(summary)}
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <Stat label="Jobs penalised by logistics" value={String(summary.penalisedCount)} />
        <Stat label="Worst equity gap" value={`${summary.worstGap} places`} />
        <Stat label="Median remote wait" value={`${summary.medianDaysRemote.toFixed(0)} days`} />
        <Stat
          label="Remote delay vs need"
          value={`${summary.addedMedianDaysRemote >= 0 ? "+" : ""}${summary.addedMedianDaysRemote.toFixed(0)} days`}
          tone={summary.addedMedianDaysRemote > 1 ? "warn" : "ok"}
        />
        <Stat label="Travel saved by batching" value={formatAud(summary.travelSavedByBatching)} />
        <Stat label="Dial position" value={`${pct}% efficient`} />
      </dl>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "ok",
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-2">
      <dt className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{label}</dt>
      <dd className={`mt-0.5 text-sm font-semibold ${tone === "warn" ? "text-amber-700 dark:text-amber-300" : "text-[var(--fg-strong)]"}`}>
        {value}
      </dd>
    </div>
  );
}
