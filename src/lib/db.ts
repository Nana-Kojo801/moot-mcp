import { createClient, type Client, type InArgs, type Row } from "@libsql/client";

let client: Client | null = null;

export function db(): Client {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) {
      throw new Error(
        "TURSO_DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.",
      );
    }
    client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
  }
  return client;
}

/** Test hook: swap in a client (for example an in-memory database). */
export function setDb(c: Client | null) {
  client = c;
}

export async function all<T>(sql: string, args: InArgs = []): Promise<T[]> {
  const rs = await db().execute({ sql, args });
  return rs.rows.map((r) => toPlain<T>(r));
}

export async function one<T>(sql: string, args: InArgs = []): Promise<T | null> {
  const rows = await all<T>(sql, args);
  return rows[0] ?? null;
}

export async function run(sql: string, args: InArgs = []): Promise<number> {
  const rs = await db().execute({ sql, args });
  return rs.rowsAffected;
}

export async function batch(stmts: { sql: string; args?: InArgs }[]) {
  if (stmts.length === 0) return;
  await db().batch(
    stmts.map((s) => ({ sql: s.sql, args: s.args ?? [] })),
    "write",
  );
}

function toPlain<T>(row: Row): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = typeof v === "bigint" ? Number(v) : v;
  }
  return out as T;
}

export function newId(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const s = Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 10);
  return `${prefix}_${s}`;
}

let schemaReady: Promise<void> | null = null;

async function applySchema() {
  const { SCHEMA, MIGRATIONS } = await import("./schema");
  await db().batch(SCHEMA, "write");
  const row = await one<{ value: number }>(`SELECT value FROM schema_meta WHERE key = 'migrations'`);
  const applied = row?.value ?? 0;
  for (let i = applied; i < MIGRATIONS.length; i++) {
    try {
      await db().execute(MIGRATIONS[i]);
    } catch (err) {
      // A fresh database may already have the column if two servers raced; anything else is real.
      if (!/duplicate column/i.test(String(err))) throw err;
    }
    await run(
      `INSERT INTO schema_meta (key, value) VALUES ('migrations', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [i + 1],
    );
  }
}

/** Applies the schema and pending migrations once per server process. */
export function ensureSchema(): Promise<void> {
  schemaReady ??= applySchema().catch((err) => {
    schemaReady = null;
    throw err;
  });
  return schemaReady;
}
