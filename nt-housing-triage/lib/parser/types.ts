import type { ParsedReport } from "@/lib/taxonomy";

/** Metadata attached to every parse, model or fallback. */
export interface ParseResult extends ParsedReport {
  method: "model" | "fallback";
  confidence: number;
  notes: string[];
}
