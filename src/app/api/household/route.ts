// Household setup: create your own household, or edit members, seats and Parental Assent.
import { z } from "zod";
import { batch, ensureSchema, newId, one } from "@/lib/db";
import { safeTimeZone } from "@/lib/clock";
import { MEMBER_COLORS, householdStatements } from "@/lib/seed";
import { errorJson, getOrCreateVisitorId, householdIdFor } from "@/lib/session";
import type { Household, Member } from "@/lib/types";
import { all } from "@/lib/db";

export const dynamic = "force-dynamic";

const Body = z.object({
  name: z.string().trim().min(1).max(60),
  assent_required: z.boolean(),
  timezone: z.string().max(60).optional(),
  members: z
    .array(
      z.object({
        id: z.string().max(40).optional(),
        name: z.string().trim().min(1).max(30),
        kind: z.enum(["adult", "child"]),
      }),
    )
    .min(2, "A household needs at least two members.")
    .max(8, "A household can have at most eight members."),
});

export async function PUT(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorJson(400, parsed.error.issues[0]?.message ?? "Check the household details.");
  const data = parsed.data;
  const names = data.members.map((m) => m.name.toLowerCase());
  if (new Set(names).size !== names.length) return errorJson(400, "Each member needs a different name.");
  if (!data.members.some((m) => m.kind === "adult")) return errorJson(400, "A household needs at least one adult.");

  try {
    await ensureSchema();
    const visitor = await getOrCreateVisitorId();
    const id = householdIdFor(visitor);
    const now = Date.now();
    const existing = await one<Household>(`SELECT * FROM households WHERE id = ?`, [id]);
    const stmts: { sql: string; args: (string | number | null)[] }[] = [];

    if (!existing) {
      stmts.push({
        sql: `INSERT INTO households (id, name, assent_required, created_at, clock_offset_ms, timezone, is_demo)
              VALUES (?, ?, ?, ?, 0, ?, 0)`,
        args: [id, data.name, data.assent_required ? 1 : 0, now, safeTimeZone(data.timezone)],
      });
    } else {
      stmts.push({
        sql: `UPDATE households SET name = ?, assent_required = ? WHERE id = ?`,
        args: [data.name, data.assent_required ? 1 : 0, id],
      });
    }
    const current = existing ? await all<Member>(`SELECT * FROM members WHERE household_id = ?`, [id]) : [];
    const keep = new Set<string>();
    data.members.forEach((m, seat) => {
      const match = m.id ? current.find((c) => c.id === m.id) : undefined;
      if (match) {
        keep.add(match.id);
        stmts.push({
          sql: `UPDATE members SET name = ?, kind = ?, seat = ? WHERE id = ?`,
          args: [m.name, m.kind, seat, match.id],
        });
      } else {
        const used = new Set([...current.map((c) => c.color)]);
        const color = MEMBER_COLORS.find((c) => !used.has(c)) ?? MEMBER_COLORS[seat % MEMBER_COLORS.length];
        current.push({ id: "", household_id: id, name: m.name, kind: m.kind, color, seat, created_at: now });
        stmts.push({
          sql: `INSERT INTO members (id, household_id, name, kind, color, seat, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [newId("m"), id, m.name, m.kind, color, seat, now],
        });
      }
    });
    for (const c of current) {
      if (c.id && !keep.has(c.id)) stmts.push({ sql: `DELETE FROM members WHERE id = ?`, args: [c.id] });
    }
    await batch(stmts);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[moot] household", err);
    return errorJson(503, "The household could not be saved. The database is not reachable.");
  }
}

/** Leave the current household entirely (used by "Start over"). */
export async function DELETE() {
  try {
    const visitor = await getOrCreateVisitorId();
    await batch(householdStatements(householdIdFor(visitor)));
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[moot] household", err);
    return errorJson(503, "The household could not be removed. The database is not reachable.");
  }
}
