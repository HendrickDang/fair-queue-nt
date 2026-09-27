import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * SQLite connection for the triage app.
 *
 * Uses Node's built-in `node:sqlite` (Node >= 22.5), so there is no native
 * dependency to build — consistent with the "offline, on-country, minimal deps"
 * promise. The file is created on first run at `data/nt-triage.sqlite`.
 */

let cachedSchema: string | null = null;

function loadSchema(): string {
  if (cachedSchema) return cachedSchema;
  // Static subfolder + turbopackIgnore: the schema is shipped via
  // outputFileTracingIncludes (see next.config.ts), so we don't want Turbopack
  // to trace the entire project just to find this one file.
  const path = join(process.cwd(), "lib", "db", "schema.sql");
  cachedSchema = readFileSync(/* turbopackIgnore: true */ path, "utf8");
  return cachedSchema;
}

export function defaultDbPath(): string {
  return process.env.NT_DB_PATH ?? join(process.cwd(), "data", "nt-triage.sqlite");
}

/** Open (or create) a database and bring the schema up to date. */
export function createDb(path: string = defaultDbPath()): DatabaseSync {
  const inMemory = path === ":memory:";
  if (!inMemory) mkdirSync(dirname(path), { recursive: true });

  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON;");
  if (!inMemory) db.exec("PRAGMA journal_mode = WAL;");
  db.exec(loadSchema());
  return db;
}

// Next.js dev reloads modules; keep one connection per process.
const globalForDb = globalThis as unknown as { __ntTriageDb?: DatabaseSync };

export function getDb(): DatabaseSync {
  if (!globalForDb.__ntTriageDb) {
    globalForDb.__ntTriageDb = createDb(defaultDbPath());
  }
  return globalForDb.__ntTriageDb;
}
