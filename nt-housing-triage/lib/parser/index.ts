import { isOllamaAvailable, parseWithModel } from "./ollama";
import { parseWithFallback } from "./fallback";
import type { ParseResult } from "./types";

export type { ParseResult } from "./types";
export { parseWithFallback, detectFlags, detectVulnerability, detectCategory } from "./fallback";
export { isOllamaAvailable } from "./ollama";

export interface ParseOptions {
  /** Force a method; by default the model is tried first when reachable. */
  prefer?: "model" | "fallback";
  signal?: AbortSignal;
}

/**
 * Parse a fault report. Model-first when Ollama is reachable, deterministic
 * fallback otherwise. Never throws for bad input — a failed model call degrades
 * to the fallback parser and records why.
 */
export async function parseReport(
  rawText: string,
  options: ParseOptions = {},
): Promise<ParseResult> {
  const prefer = options.prefer ?? "model";

  if (prefer === "model") {
    const available = await isOllamaAvailable(options.signal);
    if (available) {
      try {
        return await parseWithModel(rawText, { signal: options.signal });
      } catch (error) {
        const fallback = parseWithFallback(rawText);
        return {
          ...fallback,
          notes: [
            ...fallback.notes,
            `Model unavailable, used fallback (${(error as Error).message}).`,
          ],
        };
      }
    }
  }

  const fallback = parseWithFallback(rawText);
  if (prefer === "model") {
    fallback.notes.push("Ollama not reachable; used deterministic fallback parser.");
  }
  return fallback;
}
