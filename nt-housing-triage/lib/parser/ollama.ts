import {
  CATEGORIES,
  SAFETY_LEVELS,
  TRADES,
  URGENCY_FLAGS,
  VULNERABILITIES,
  type Category,
  type ParsedReport,
  type SafetyLevel,
  type Trade,
  type UrgencyFlag,
  type Vulnerability,
} from "@/lib/taxonomy";
import { matchCommunity } from "@/lib/data/communities";
import type { ParseResult } from "./types";

/**
 * Local Ollama client for the fine-tuned Gemma 4 E4B parser.
 *
 * Everything here is best-effort: if Ollama is not running, or returns
 * something off-schema, the caller falls back to the deterministic parser.
 * That is deliberate — the app must work fully offline with no model at all.
 */

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "nt-housing-triage";
const TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 20000);

export const SYSTEM_PROMPT = `You are a maintenance triage parser for remote Northern Territory (NT) social housing.
Read a tenant's free-text fault report and return ONLY a JSON object, no prose.

Schema:
{
  "summary": string,                       // one short normalised description
  "category": one of ${CATEGORIES.join(" | ")},
  "safety_level": one of ${SAFETY_LEVELS.join(" | ")},
  "urgency_flags": array of ${URGENCY_FLAGS.join(" | ")},
  "occupant_vulnerability": array of ${VULNERABILITIES.join(" | ")},
  "trade_required": one of ${TRADES.join(" | ")},
  "community": string                       // the NT community named, else ""
}

Rules:
- Escalate to critical for exposed wiring, sewage, structural collapse, medical equipment power, or no water for vulnerable occupants.
- Only include vulnerability values actually implied by the text.
- Never invent a community that is not named in the report.`;

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function pickArray<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<T>();
  for (const item of value) {
    if (typeof item === "string" && (allowed as readonly string[]).includes(item)) {
      seen.add(item as T);
    }
  }
  return [...seen];
}

/** Coerce whatever the model returned into the exact schema, or throw. */
export function coerceModelOutput(raw: unknown, rawText: string): ParsedReport {
  if (!raw || typeof raw !== "object") throw new Error("model returned non-object");
  const v = raw as Record<string, unknown>;
  const summary =
    typeof v.summary === "string" && v.summary.trim()
      ? v.summary.trim()
      : rawText.replace(/\s+/g, " ").trim().slice(0, 100);

  return {
    summary,
    category: pick<Category>(v.category, CATEGORIES, "other"),
    safety_level: pick<SafetyLevel>(v.safety_level, SAFETY_LEVELS, "medium"),
    urgency_flags: pickArray<UrgencyFlag>(v.urgency_flags, URGENCY_FLAGS),
    occupant_vulnerability: pickArray<Vulnerability>(
      v.occupant_vulnerability,
      VULNERABILITIES,
    ),
    trade_required: pick<Trade>(v.trade_required, TRADES, "handyperson"),
    // Trust the model only if the community actually appears in the text.
    community: matchCommunity(rawText)?.name ?? "",
  };
}

export interface ModelParseOptions {
  model?: string;
  signal?: AbortSignal;
}

export async function parseWithModel(
  rawText: string,
  options: ModelParseOptions = {},
): Promise<ParseResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  if (options.signal) {
    options.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: options.model ?? OLLAMA_MODEL,
        stream: false,
        format: "json",
        options: { temperature: 0 },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: rawText },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}`);
    const data = (await res.json()) as { message?: { content?: string } };
    const content = data.message?.content ?? "";
    const parsed = JSON.parse(content) as unknown;
    const report = coerceModelOutput(parsed, rawText);
    return { ...report, method: "model", confidence: 0.9, notes: [] };
  } finally {
    clearTimeout(timer);
  }
}

export async function isOllamaAvailable(signal?: AbortSignal): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  signal?.addEventListener("abort", () => controller.abort(), { once: true });
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
