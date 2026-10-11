// Read model for the web app: everything the Chamber and Statute Book draw.
import { all, one } from "./db";
import { formatClock, formatDate } from "./clock";
import { describeSchedule, loadHouse } from "./house";
import { tally } from "./parliament";
import { parseSchedule, type Bill, type Law, type Vote } from "./types";
import { env } from "./env";

interface DebateRow {
  id: string;
  bill_id: string;
  member_id: string;
  text: string;
  created_at: number;
}

export async function getState(householdId: string) {
  const house = await loadHouse(householdId);
  const { household, members, tz, now } = house;
  const bills = await all<Bill>(
    `SELECT * FROM bills WHERE household_id = ? ORDER BY created_at DESC`,
    [householdId],
  );
  const billIds = bills.map((b) => b.id);
  const placeholders = billIds.map(() => "?").join(",");
  const votes = billIds.length
    ? await all<Vote>(`SELECT * FROM votes WHERE bill_id IN (${placeholders}) ORDER BY created_at`, billIds)
    : [];
  const debate = billIds.length
    ? await all<DebateRow>(`SELECT * FROM debate WHERE bill_id IN (${placeholders}) ORDER BY created_at`, billIds)
    : [];
  const laws = await all<Law>(`SELECT * FROM laws WHERE household_id = ? ORDER BY number DESC`, [householdId]);
  const log = await all<{ id: string; kind: string; message: string; created_at: number }>(
    `SELECT id, kind, message, created_at FROM enforcement_log WHERE household_id = ? ORDER BY created_at DESC LIMIT 12`,
    [householdId],
  );
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? "A former member";

  const billView = (b: Bill) => {
    const bv = votes.filter((v) => v.bill_id === b.id);
    const proposer = members.find((m) => m.id === b.proposer_id);
    const t = tally({
      kind: b.kind,
      members,
      votes: bv,
      speakerId: house.speaker?.id ?? null,
      proposerKind: proposer?.kind ?? "adult",
      assentRequired: household.assent_required === 1,
    });
    const law = laws.find((l) => l.bill_id === b.id);
    return {
      id: b.id,
      kind: b.kind,
      title: b.title,
      statute_text: b.statute_text,
      penalty: b.penalty,
      schedule: describeSchedule(parseSchedule(b.schedule_json)),
      expires_on: b.expires_at ? formatDate(b.expires_at, tz) : null,
      status: b.awaiting_assent ? "awaiting_assent" : b.status,
      proposer: name(b.proposer_id),
      proposer_id: b.proposer_id,
      proposed_on: formatDate(b.created_at, tz),
      safety_note: b.safety_note,
      votes: bv.map((v) => ({ member_id: v.member_id, member: name(v.member_id), choice: v.choice })),
      tally: { ayes: t.ayes, nays: t.nays, abstains: t.abstains },
      debate: debate
        .filter((d) => d.bill_id === b.id)
        .map((d) => ({ id: d.id, member: name(d.member_id), member_id: d.member_id, text: d.text })),
      law_number: law?.number ?? null,
      closed_at: b.closed_at,
    };
  };

  // The Order Paper shows the bill in progress, or one closed in the last few hours of house time.
  const recent = 6 * 60 * 60 * 1000;
  const featured =
    bills.find(
      (b) =>
        b.status === "debate" ||
        b.status === "voting" ||
        (b.status !== "withdrawn" && b.closed_at !== null && now - b.closed_at < recent),
    ) ?? null;
  return {
    demoMode: env.demoMode,
    household: {
      id: household.id,
      name: household.name,
      assent_required: household.assent_required === 1,
      timezone: tz,
      is_demo: household.is_demo === 1,
      clock: formatClock(now, tz),
      now,
      clock_offset_ms: household.clock_offset_ms,
    },
    members: members.map((m) => ({ id: m.id, name: m.name, kind: m.kind, color: m.color, seat: m.seat })),
    speakerId: house.speaker?.id ?? null,
    bill: featured ? billView(featured) : null,
    laws: laws.map((l) => {
      const bill = bills.find((b) => b.id === l.bill_id);
      return {
        id: l.id,
        number: l.number,
        title: l.title,
        statute_text: l.statute_text,
        penalty: l.penalty,
        schedule: describeSchedule(parseSchedule(l.schedule_json)),
        enacted_on: formatDate(l.enacted_at, tz),
        expires_on: l.expires_at ? formatDate(l.expires_at, tz) : null,
        status: l.status,
        supersedes: l.supersedes_law_id ? laws.find((x) => x.id === l.supersedes_law_id)?.number ?? null : null,
        history: bill ? billView(bill) : null,
      };
    }),
    log: log.map((e) => ({ ...e, when: formatClock(e.created_at, tz) })),
  };
}

export type MootState = Awaited<ReturnType<typeof getState>>;

export async function householdExists(id: string): Promise<boolean> {
  return (await one<{ id: string }>(`SELECT id FROM households WHERE id = ?`, [id])) !== null;
}
