"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { buildJob } from "@/lib/engine/scoring";
import type { Job } from "@/lib/engine/types";
import type { ParseResult } from "@/lib/parser/types";
import { COMMUNITIES } from "@/lib/data/communities";
import { parseWithFallback } from "@/lib/parser/fallback";
import { FLAG_LABEL, SAFETY_LABEL, VULNERABILITY_LABEL } from "@/lib/taxonomy";
import { SAFETY_CLASS } from "@/lib/ui/colors";
import { FAULT_LABEL, faultKind } from "@/lib/ui/fault";
import FaultIcon from "./FaultIcon";
import HouseDiagram from "./HouseDiagram";

interface Props {
  onAdd: (job: Job) => void;
}

export default function ReportForm({ onAdd }: Props) {
  const [text, setText] = useState("");
  const [community, setCommunity] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Live preview: the offline parser reads the text as it is typed, so the coordinator
  // sees what the system understood (or failed to) before anything joins the queue.
  const typed = useDeferredValue(text);
  const preview = useMemo(() => (typed.trim().length >= 6 ? parseWithFallback(typed) : null), [typed]);
  const unread = preview !== null && preview.urgency_flags.length === 0;

  async function submit() {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    // Generated up front so the client job id matches the row the server persists.
    const id = `JOB-${Math.floor(Math.random() * 9000) + 1000}`;
    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, id, community: community || undefined }),
      });
      if (!res.ok) throw new Error(`Parse failed (${res.status})`);
      const parsed = (await res.json()) as ParseResult;
      setResult(parsed);

      const { job, error: buildError } = buildJob({
        id,
        rawText: text.trim(),
        reportedAt: new Date().toISOString(),
        household: parsed.community ? `${parsed.community} (new)` : "new report",
        report: parsed,
        // Same rule as the server: no hazard recognised means held until a person reads it.
        needsReading: parsed.urgency_flags.length === 0,
      });
      if (job) {
        onAdd(job);
        setText("");
      } else if (!parsed.community) {
        setError("No community detected - pick one below, then try again.");
      } else {
        setError(buildError ?? "Could not place this report on the map.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel p-4">
      <h2 className="text-sm font-semibold">New fault report</h2>
      <p className="mt-1 text-[11px] text-[var(--muted)]">
        Free text → structured job. Uses the local fine-tuned model when available, otherwise the
        offline fallback parser.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="e.g. roof is leaking over the kids bed and the ceiling is sagging, in Wadeye"
        className="mt-3 w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-2.5 text-sm text-[var(--fg)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
      />
      {preview && (
        <div className="mt-3" aria-live="polite">
          <p className="mb-1.5 text-[11px] text-[var(--muted)]">What the offline parser reads as you type:</p>
          <HouseDiagram report={preview} unread={unread} />
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="chip text-[var(--fg-2)]">
              <FaultIcon kind={faultKind(preview)} size={12} labelled={false} />
              {FAULT_LABEL[faultKind(preview)]}
            </span>
            <span className={`chip ${SAFETY_CLASS[preview.safety_level]}`}>{SAFETY_LABEL[preview.safety_level]}</span>
            {preview.urgency_flags.map((f) => (
              <span key={f} className="chip">{FLAG_LABEL[f]}</span>
            ))}
            {preview.occupant_vulnerability.map((v) => (
              <span key={v} className="chip border-amber-500/40 text-amber-700 dark:text-amber-200">{VULNERABILITY_LABEL[v]}</span>
            ))}
            <span className="chip">{preview.community || "No community found yet"}</span>
          </div>
          {unread && (
            <p className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-800 dark:text-amber-100">
              No hazard words recognised. If added, this report is held at high priority until a person reads it.
            </p>
          )}
        </div>
      )}

      <label className="mt-3 block text-[11px] uppercase tracking-wide text-[var(--muted)]">
        Community (if not in the text)
      </label>
      <select
        value={community}
        onChange={(e) => setCommunity(e.target.value)}
        className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-2.5 text-sm text-[var(--fg)] outline-none focus:border-[var(--accent)]"
      >
        <option value="">Auto-detect from text</option>
        {COMMUNITIES.map((c) => (
          <option key={c.id} value={c.name}>
            {c.name}
          </option>
        ))}
      </select>
      <button
        onClick={submit}
        disabled={busy || !text.trim()}
        className="mt-2 w-full rounded-lg border border-[var(--accent)] px-3 py-2 text-sm font-medium text-amber-700 transition hover:bg-[var(--accent)]/10 disabled:cursor-not-allowed disabled:opacity-40 dark:text-amber-200"
      >
        {busy ? "Parsing…" : "Parse & add to queue"}
      </button>

      {error && <p className="mt-2 text-[11px] text-rose-600 dark:text-rose-300">{error}</p>}

      {result && (
        <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-3 text-[11px]">
          <div className="flex items-center gap-2">
            <span className="chip">{result.method}</span>
            <span className="text-[var(--muted)]">confidence {result.confidence.toFixed(2)}</span>
          </div>
          <p className="mt-1.5 text-[var(--fg-2)]">
            {result.category} · {result.safety_level} · {result.trade_required}
            {result.community ? ` · ${result.community}` : ""}
          </p>
          {result.urgency_flags.length > 0 && (
            <p className="text-[var(--muted)]">flags: {result.urgency_flags.join(", ")}</p>
          )}
          {result.urgency_flags.length === 0 && (
            <p className="mt-1 text-amber-700 dark:text-amber-200">
              Added and held at high priority until a person reads it.
            </p>
          )}
          {result.notes.map((n) => (
            <p key={n} className="mt-1 text-[var(--muted)]">• {n}</p>
          ))}
        </div>
      )}
    </div>
  );
}
