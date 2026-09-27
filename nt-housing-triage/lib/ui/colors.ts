import type { SafetyLevel } from "@/lib/taxonomy";

export const SAFETY_CLASS: Record<SafetyLevel, string> = {
  critical: "text-rose-300 border-rose-500/40 bg-rose-500/10",
  high: "text-orange-300 border-orange-500/40 bg-orange-500/10",
  medium: "text-amber-200 border-amber-500/40 bg-amber-500/10",
  low: "text-teal-200 border-teal-500/40 bg-teal-500/10",
};

export const SAFETY_DOT: Record<SafetyLevel, string> = {
  critical: "#f43f5e",
  high: "#fb923c",
  medium: "#fbbf24",
  low: "#2dd4bf",
};

export const SAFETY_ORDER: SafetyLevel[] = ["critical", "high", "medium", "low"];

export function worstSafety(levels: SafetyLevel[]): SafetyLevel {
  for (const level of SAFETY_ORDER) {
    if (levels.includes(level)) return level;
  }
  return "low";
}
