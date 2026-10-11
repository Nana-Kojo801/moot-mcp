// Budget guards. Every AI call first claims a unit from the global and the
// per-visitor daily budgets in the `usage` table.
import { one } from "./db";
import { env } from "./env";

export const RISEN_MESSAGE =
  "The House has risen for the day (demo limit reached). Please come back tomorrow.";

export class BudgetError extends Error {
  constructor() {
    super(RISEN_MESSAGE);
    this.name = "BudgetError";
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function claim(scope: string, cap: number): Promise<boolean> {
  if (cap <= 0) return false;
  const row = await one<{ calls: number }>(
    `INSERT INTO usage (day, scope, calls) VALUES (?, ?, 1)
     ON CONFLICT(day, scope) DO UPDATE SET calls = calls + 1 WHERE calls < ?
     RETURNING calls`,
    [today(), scope, cap],
  );
  return row !== null;
}

/** Throws BudgetError when either cap is reached. */
export async function claimAiCall(scope: string): Promise<void> {
  if (!(await claim("global", env.dailyCap))) throw new BudgetError();
  if (!(await claim(scope, env.sessionCap))) throw new BudgetError();
}

export async function usageToday(scope: string) {
  const g = await one<{ calls: number }>(`SELECT calls FROM usage WHERE day = ? AND scope = ?`, [
    today(),
    "global",
  ]);
  const s = await one<{ calls: number }>(`SELECT calls FROM usage WHERE day = ? AND scope = ?`, [
    today(),
    scope,
  ]);
  return {
    global: g?.calls ?? 0,
    scope: s?.calls ?? 0,
    globalCap: env.dailyCap,
    scopeCap: env.sessionCap,
  };
}
