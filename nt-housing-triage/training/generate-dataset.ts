/**
 * Generate the fine-tune dataset from the synthetic report generator.
 *
 *   npm run training:generate -- 3000
 *
 * Emits chat-format JSONL for Gemma 4 E4B fine-tuning (unsloth + QLoRA), with a
 * held-out eval split. The assistant target is exactly the taxonomy §1 schema, so
 * the model learns the same contract the deterministic fallback parser implements.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateReports } from "@/lib/data/generator";
import { SYSTEM_PROMPT } from "@/lib/parser/ollama";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "out");

const total = Number(process.argv[2] ?? 3000);
const seed = process.argv[3] ?? "nt-housing-triage";
const evalFraction = 0.1;

const records = generateReports(total, seed);

const toChat = (rawText: string, label: unknown) =>
  JSON.stringify({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: rawText },
      { role: "assistant", content: JSON.stringify(label) },
    ],
  });

// Deterministic split: every Nth record is held out for eval.
const train: string[] = [];
const evalRows: string[] = [];
records.forEach((r, i) => {
  const line = toChat(r.rawText, r.label);
  if (i % Math.round(1 / evalFraction) === 0) evalRows.push(line);
  else train.push(line);
});

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "train.jsonl"), `${train.join("\n")}\n`, "utf8");
writeFileSync(join(outDir, "eval.jsonl"), `${evalRows.join("\n")}\n`, "utf8");

console.log(`Generated ${records.length} examples from seed "${seed}"`);
console.log(`  train: ${train.length} -> ${join(outDir, "train.jsonl")}`);
console.log(`  eval:  ${evalRows.length} -> ${join(outDir, "eval.jsonl")}`);
