// Parliamentary business. Each exported function backs one MCP tool and returns
// structured data plus a short `spoken` string for text-to-speech.
import { all, batch, newId, one, run } from "./db";
import {
  DAY_MS,
  WEEKDAYS,
  formatClock,
  formatDate,
  formatTimeOfDay,
  householdNow,
  localParts,
  nextOccurrence,
  parseTime,
  zonedTimeToUtc,
  type Weekday,
} from "./clock";
import { draftBill, interpretRule, truncate, writeReminder } from "./ai";
import { speakerFor, tally } from "./parliament";
import { seedDemoHousehold } from "./seed";
import { listNames, pick, plural, rollCall, ORDER } from "./templates";
import {
  parseSchedule,
  type Bill,
  type Choice,
  type Household,
  type Law,
  type LawStatus,
  type Member,
  type Schedule,
  type Vote,
} from "./types";
import { env } from "./env";

export interface Ctx {
  householdId: string;
  /** Budget scope for AI calls: the visitor, or the household for outside MCP clients. */
  scope: string;
}

export interface Result {
  ok: boolean;
  spoken: string;
  [key: string]: unknown;
}

/** An expected failure. The message is spoken to the member, so keep it plain. */
export class HouseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HouseError";
  }
}

export interface House {
  household: Household;
  members: Member[];
  now: number;
  tz: string;
  speaker: Member | null;
}

// ---------- loading ----------

export async function loadHouse(householdId: string): Promise<House> {
  const household = await one<Household>(`SELECT * FROM households WHERE id = ?`, [householdId]);
  if (!household) {
    throw new HouseError("No household was found. Open Moot and start the demo household first.");
  }
  const members = await all<Member>(
    `SELECT * FROM members WHERE household_id = ? ORDER BY seat, created_at`,
    [householdId],
  );
  const now = householdNow(household);
  const tz = household.timezone;
  await run(
    `UPDATE laws SET status = 'expired'
     WHERE household_id = ? AND status = 'in_force' AND expires_at IS NOT NULL AND expires_at <= ?`,
    [householdId, now],
  );
  return { household, members, now, tz, speaker: speakerFor(members, now, tz) };
}

export function resolveMember(house: House, ref: string | undefined | null): Member {
  const names = house.members.map((m) => m.name);
  if (house.members.length === 0) {
    throw new HouseError("This household has no members yet. Add members in the household setup.");
  }
  if (!ref || !ref.trim()) {
    throw new HouseError(`Say which member is speaking: ${listNames(names)}.`);
  }
  const key = ref.trim().toLowerCase();
  const exact =
    house.members.find((m) => m.id === ref) ??
    house.members.find((m) => m.name.toLowerCase() === key);
  if (exact) return exact;
  const partial = house.members.filter(
    (m) => m.name.toLowerCase().startsWith(key) || key.startsWith(m.name.toLowerCase()),
  );
  if (partial.length === 1) return partial[0];
  throw new HouseError(`There is no member called ${ref}. The members are ${listNames(names)}.`);
}

async function openBill(householdId: string): Promise<Bill | null> {
  return one<Bill>(
    `SELECT * FROM bills WHERE household_id = ? AND status IN ('debate', 'voting') AND awaiting_assent = 0
     ORDER BY created_at DESC LIMIT 1`,
    [householdId],
  );
}

async function resolveBill(house: House, billId: string | undefined | null): Promise<Bill> {
  if (billId && billId.trim()) {
    const bill = await one<Bill>(`SELECT * FROM bills WHERE id = ? AND household_id = ?`, [
      billId.trim(),
      house.household.id,
    ]);
    if (bill) return bill;
  }
  const current = await openBill(house.household.id);
  if (current) return current;
  throw new HouseError("There is no bill before the House. Propose one first.");
}

function memberName(house: House, id: string): string {
  return house.members.find((m) => m.id === id)?.name ?? "a former member";
}

async function votesFor(billId: string): Promise<Vote[]> {
  return all<Vote>(`SELECT * FROM votes WHERE bill_id = ?`, [billId]);
}

function describeSchedule(s: Schedule | null): string | null {
  if (!s) return null;
  if (s.type === "standing") return "Standing law, always in force";
  const t = parseTime(s.time);
  const time = t ? formatTimeOfDay(t.hour, t.minute) : s.time;
  if (s.type === "daily") return `Every day at ${time}`;
  return `Every ${s.day[0].toUpperCase()}${s.day.slice(1)} at ${time}`;
}

// ---------- safety backstop ----------

const UNSAFE_PENALTY =
  /\b(hit|hits|hitting|spank\w*|smack\w*|slap\w*|punch\w*|kick\w*|belt|beat\w*|starv\w*|hungry|no (food|dinner|lunch|breakfast|supper|snacks?|meals?|water)|without (food|dinner|lunch|breakfast|supper|water|eating|a meal)|skips? (dinner|lunch|breakfast|supper|meals?)|lock(ed|s)? (in|out|up|away)|alone in|isolat\w*|humiliat\w*|shame\w*|ridicul\w*|cold shower|hurt\w*|pain\w*|bully\w*|grounded for (a )?(month|year))\b/i;

const HARMLESS_PENALTY = "Whoever breaks this law tells the household a joke at dinner.";

export function isUnsafePenalty(text: string | null | undefined): boolean {
  return !!text && UNSAFE_PENALTY.test(text);
}

// ---------- tools ----------

export async function getHousehold(ctx: Ctx): Promise<Result> {
  const house = await loadHouse(ctx.householdId);
  const lawCount = await one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM laws WHERE household_id = ? AND status = 'in_force'`,
    [ctx.householdId],
  );
  const pending = await one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM bills WHERE household_id = ? AND status IN ('debate', 'voting')`,
    [ctx.householdId],
  );
  const current = await openBill(ctx.householdId);
  const speaker = house.speaker?.name ?? null;
  const laws = lawCount?.n ?? 0;
  const bills = pending?.n ?? 0;
  return {
    ok: true,
    household: house.household.name,
    members: house.members.map((m) => ({ id: m.id, name: m.name, kind: m.kind, seat: m.seat })),
    speaker,
    parental_assent: house.household.assent_required === 1,
    laws_in_force: laws,
    bills_pending: bills,
    current_bill: current
      ? { id: current.id, title: current.title, status: current.status }
      : null,
    clock: formatClock(house.now, house.tz),
    spoken: `${house.household.name} has ${plural(house.members.length, "member", "members")}, and ${speaker ?? "nobody"} is Speaker this week. There ${laws === 1 ? "is" : "are"} ${plural(laws, "law", "laws")} in force and ${plural(bills, "bill", "bills")} pending.`,
  };
}

export interface ProposeArgs {
  member: string;
  idea: string;
  penalty?: string | null;
  schedule?: Schedule | null;
  expires_in_days?: number | null;
}

export async function proposeBill(ctx: Ctx, args: ProposeArgs): Promise<Result> {
  const house = await loadHouse(ctx.householdId);
  const member = resolveMember(house, args.member);
  const idea = truncate(args.idea ?? "", 400);
  if (idea.length < 3) throw new HouseError("Say what the bill should do, for example: movie night every Friday.");
  const existing = await openBill(ctx.householdId);
  if (existing) {
    throw new HouseError(
      `The House is already considering ${existing.title}. Vote on it or withdraw it before proposing another bill.`,
    );
  }
  const titles = await all<{ title: string }>(
    `SELECT title FROM laws WHERE household_id = ? AND status = 'in_force'`,
    [ctx.householdId],
  );
  const draft = await draftBill(idea, {
    scope: ctx.scope,
    proposerName: member.name,
    proposerKind: member.kind,
    penalty: args.penalty ?? null,
    existingTitles: titles.map((t) => t.title),
  });
  if (draft.clarifying_question) {
    return {
      ok: true,
      needs_clarification: true,
      spoken: draft.clarifying_question,
    };
  }

  let penalty = draft.penalty;
  let safetyNote = draft.safety_flag;
  if (isUnsafePenalty(penalty) || (isUnsafePenalty(args.penalty) && !safetyNote)) {
    penalty = isUnsafePenalty(penalty) ? HARMLESS_PENALTY : penalty;
    safetyNote = "That penalty was not safe for a family, so the Clerk has written a harmless one instead.";
  }
  const schedule = args.schedule ?? draft.schedule;
  const days = args.expires_in_days ?? draft.expires_in_days;
  const expiresAt = days ? house.now + days * DAY_MS : null;

  const id = newId("bill");
  await run(
    `INSERT INTO bills (id, household_id, proposer_id, kind, title, statute_text, penalty, schedule_json,
       expires_at, status, created_at, safety_note)
     VALUES (?, ?, ?, 'new', ?, ?, ?, ?, ?, 'debate', ?, ?)`,
    [
      id,
      ctx.householdId,
      member.id,
      draft.title,
      draft.statute_text,
      penalty,
      schedule ? JSON.stringify(schedule) : null,
      expiresAt,
      house.now,
      safetyNote,
    ],
  );
  const safety = safetyNote ? ` ${safetyNote}` : "";
  return {
    ok: true,
    bill: {
      id,
      title: draft.title,
      statute_text: draft.statute_text,
      penalty,
      schedule: describeSchedule(schedule),
      expires_on: expiresAt ? formatDate(expiresAt, house.tz) : null,
      status: "debate",
    },
    safety_note: safetyNote,
    spoken: `${pick(ORDER)} ${member.name} has introduced ${draft.title}: ${draft.statute_text}${safety} The floor is open for debate.`,
  };
}

export async function addDebateStatement(
  ctx: Ctx,
  args: { bill_id?: string | null; member: string; statement: string },
): Promise<Result> {
  const house = await loadHouse(ctx.householdId);
  const member = resolveMember(house, args.member);
  const bill = await resolveBill(house, args.bill_id);
  if (bill.status !== "debate" && bill.status !== "voting") {
    throw new HouseError(`${bill.title} is no longer open for debate.`);
  }
  const text = truncate(args.statement ?? "", 280);
  if (!text) throw new HouseError("Say what you would like to put on the record.");
  await run(`INSERT INTO debate (id, bill_id, member_id, text, created_at) VALUES (?, ?, ?, ?, ?)`, [
    newId("deb"),
    bill.id,
    member.id,
    text,
    house.now,
  ]);
  const thanks = pick(["The House thanks", "The record shows the words of", "Hear, hear for"]);
  return {
    ok: true,
    bill_id: bill.id,
    spoken: `${thanks} ${member.name}. The debate on ${bill.title} continues.`,
  };
}

export async function callVote(
  ctx: Ctx,
  args: { bill_id?: string | null; member: string },
): Promise<Result> {
  const house = await loadHouse(ctx.householdId);
  const member = resolveMember(house, args.member);
  const bill = await resolveBill(house, args.bill_id);
  if (bill.status === "voting" && !bill.awaiting_assent) {
    throw new HouseError(`The vote on ${bill.title} is already open. Members can say aye, nay, or abstain.`);
  }
  if (bill.status !== "debate") throw new HouseError(`${bill.title} is not in debate, so no vote can be called.`);
  if (house.speaker && house.speaker.id !== member.id) {
    throw new HouseError(`Only the Speaker can call the vote, and the Speaker this week is ${house.speaker.name}.`);
  }
  await run(`UPDATE bills SET status = 'voting', voting_opened_at = ? WHERE id = ?`, [house.now, bill.id]);
  const early = (await votesFor(bill.id)).length;
  const noted =
    early === 0 ? "" : early === 1 ? " One vote cast during debate already counts." : ` ${early} votes cast during debate already count.`;
  return {
    ok: true,
    bill_id: bill.id,
    status: "voting",
    spoken: `${pick(ORDER)} ${house.speaker ? "The Speaker" : member.name} calls the vote on ${bill.title}. Members, say aye, nay, or abstain.${noted}`,
  };
}

export async function castVote(
  ctx: Ctx,
  args: { bill_id?: string | null; member: string; choice: Choice },
): Promise<Result> {
  const house = await loadHouse(ctx.householdId);
  const member = resolveMember(house, args.member);
  const bill = await resolveBill(house, args.bill_id);
  if (!["aye", "nay", "abstain"].includes(args.choice)) {
    throw new HouseError("A vote must be aye, nay, or abstain.");
  }
  if ((bill.status !== "debate" && bill.status !== "voting") || bill.awaiting_assent) {
    throw new HouseError(`The vote on ${bill.title} is closed.`);
  }
  const previous = await one<Vote>(`SELECT * FROM votes WHERE bill_id = ? AND member_id = ?`, [
    bill.id,
    member.id,
  ]);
  await run(
    `INSERT INTO votes (bill_id, member_id, choice, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(bill_id, member_id) DO UPDATE SET choice = excluded.choice, created_at = excluded.created_at`,
    [bill.id, member.id, args.choice, house.now],
  );
  const votes = await votesFor(bill.id);
  const changed = previous && previous.choice !== args.choice ? " changes their vote and" : "";
  const word = args.choice === "abstain" ? "abstains" : `votes ${args.choice}`;
  const progress =
    bill.status === "debate"
      ? "It will count when the Speaker calls the vote."
      : `${votes.length} of ${house.members.length} members have voted.`;
  return {
    ok: true,
    bill_id: bill.id,
    member: member.name,
    choice: args.choice,
    votes_cast: votes.length,
    spoken: `${member.name}${changed} ${word}. ${progress}`,
  };
}

async function enact(house: House, bill: Bill): Promise<Law> {
  const max = await one<{ n: number | null }>(`SELECT MAX(number) AS n FROM laws WHERE household_id = ?`, [
    house.household.id,
  ]);
  const law: Law = {
    id: newId("law"),
    household_id: house.household.id,
    number: (max?.n ?? 0) + 1,
    bill_id: bill.id,
    title: bill.title,
    statute_text: bill.statute_text,
    penalty: bill.penalty,
    schedule_json: bill.schedule_json,
    enacted_at: house.now,
    expires_at: bill.expires_at,
    status: "in_force",
    supersedes_law_id: bill.target_law_id,
  };
  await batch([
    {
      sql: `INSERT INTO laws (id, household_id, number, bill_id, title, statute_text, penalty, schedule_json,
              enacted_at, expires_at, status, supersedes_law_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        law.id,
        law.household_id,
        law.number,
        law.bill_id,
        law.title,
        law.statute_text,
        law.penalty,
        law.schedule_json,
        law.enacted_at,
        law.expires_at,
        law.status,
        law.supersedes_law_id,
      ],
    },
    {
      sql: `UPDATE bills SET status = 'enacted', awaiting_assent = 0, closed_at = COALESCE(closed_at, ?) WHERE id = ?`,
      args: [house.now, bill.id],
    },
  ]);
  return law;
}

function lawSummary(law: Law, tz: string) {
  return {
    id: law.id,
    number: law.number,
    title: law.title,
    statute_text: law.statute_text,
    penalty: law.penalty,
    schedule: describeSchedule(parseSchedule(law.schedule_json)),
    enacted_on: formatDate(law.enacted_at, tz),
    expires_on: law.expires_at ? formatDate(law.expires_at, tz) : null,
    status: law.status,
  };
}

export async function closeVote(ctx: Ctx, args: { bill_id?: string | null }): Promise<Result> {
  const house = await loadHouse(ctx.householdId);
  const bill = await resolveBill(house, args.bill_id);
  if (bill.status === "debate") {
    throw new HouseError(
      `The vote on ${bill.title} has not been called yet. ${house.speaker ? `The Speaker, ${house.speaker.name}, must call it first.` : "Call the vote first."}`,
    );
  }
  if (bill.status !== "voting" || bill.awaiting_assent) {
    throw new HouseError(`The vote on ${bill.title} is already closed.`);
  }
  const votes = await votesFor(bill.id);
  const proposer = house.members.find((m) => m.id === bill.proposer_id);
  const t = tally({
    kind: bill.kind,
    members: house.members,
    votes,
    speakerId: house.speaker?.id ?? null,
    proposerKind: proposer?.kind ?? "adult",
    assentRequired: house.household.assent_required === 1,
  });
  const result = {
    ayes: t.ayes,
    nays: t.nays,
    abstains: t.abstains,
    turnout: t.turnout,
    members: t.memberCount,
    tie_broken_by_speaker: t.tieBrokenBySpeaker,
    threshold: t.threshold,
  };

  if (t.outcome === "no_quorum") {
    const voted = new Set(votes.map((v) => v.member_id));
    const missing = house.members.filter((m) => !voted.has(m.id)).map((m) => m.name);
    return {
      ok: false,
      outcome: "no_quorum",
      bill_id: bill.id,
      tally: result,
      spoken: `There is no quorum: ${t.turnout} of ${t.memberCount} members have voted, and ${t.turnout + t.shortOfQuorum} must. Still to vote: ${listNames(missing)}.`,
    };
  }

  const roll = rollCall(t.ayes, t.nays, t.abstains);
  if (t.outcome === "defeated") {
    await run(`UPDATE bills SET status = 'defeated', closed_at = ? WHERE id = ?`, [house.now, bill.id]);
    const why =
      t.ayes === t.nays && t.ayes > 0 && t.threshold === "simple"
        ? "The House is tied and the Speaker did not vote aye, so"
        : t.threshold === "two_thirds"
          ? "An amendment needs two thirds, so"
          : "The noes have it, and";
    return {
      ok: true,
      outcome: "defeated",
      bill_id: bill.id,
      tally: result,
      spoken: `${roll} ${why} ${bill.title} is defeated.`,
    };
  }

  const carried = t.tieBrokenBySpeaker ? "The House is tied, and the Speaker's aye carries it." : "The ayes have it!";
  if (t.outcome === "awaiting_assent") {
    await run(`UPDATE bills SET awaiting_assent = 1, closed_at = ? WHERE id = ?`, [house.now, bill.id]);
    const adults = house.members.filter((m) => m.kind === "adult").map((m) => m.name);
    return {
      ok: true,
      outcome: "awaiting_assent",
      bill_id: bill.id,
      tally: result,
      spoken: `${roll} ${carried} ${bill.title} now awaits Parental Assent from ${adults.length ? listNames(adults) : "an adult"}.`,
    };
  }

  const law = await enact(house, bill);
  return {
    ok: true,
    outcome: "enacted",
    bill_id: bill.id,
    tally: result,
    law: lawSummary(law, house.tz),
    spoken: `${roll} ${carried} ${bill.title} is enacted as Act number ${law.number}.`,
  };
}

export async function giveAssent(
  ctx: Ctx,
  args: { bill_id?: string | null; member: string },
): Promise<Result> {
  const house = await loadHouse(ctx.householdId);
  const member = resolveMember(house, args.member);
  let bill: Bill | null = null;
  if (args.bill_id) {
    bill = await one<Bill>(`SELECT * FROM bills WHERE id = ? AND household_id = ?`, [args.bill_id, ctx.householdId]);
  }
  bill ??= await one<Bill>(
    `SELECT * FROM bills WHERE household_id = ? AND awaiting_assent = 1 AND status = 'voting'
     ORDER BY closed_at DESC LIMIT 1`,
    [ctx.householdId],
  );
  if (!bill || !bill.awaiting_assent || bill.status !== "voting") {
    throw new HouseError("No bill is waiting for Parental Assent.");
  }
  if (member.kind !== "adult") {
    throw new HouseError(`Only an adult can give Parental Assent, and ${member.name} is not one.`);
  }
  const law = await enact(house, bill);
  return {
    ok: true,
    outcome: "enacted",
    bill_id: bill.id,
    law: lawSummary(law, house.tz),
    spoken: `${member.name} gives assent. ${bill.title} is enacted as Act number ${law.number}.`,
  };
}

export async function withdrawBill(
  ctx: Ctx,
  args: { bill_id?: string | null; member: string },
): Promise<Result> {
  const house = await loadHouse(ctx.householdId);
  const member = resolveMember(house, args.member);
  let bill: Bill | null = null;
  if (args.bill_id) {
    bill = await one<Bill>(`SELECT * FROM bills WHERE id = ? AND household_id = ?`, [args.bill_id, ctx.householdId]);
  }
  bill ??= await openBill(ctx.householdId);
  if (!bill || (bill.status !== "debate" && bill.status !== "voting")) {
    throw new HouseError("There is no open bill to withdraw.");
  }
  if (bill.proposer_id !== member.id && house.speaker?.id !== member.id) {
    throw new HouseError(
      `Only the bill's proposer, ${memberName(house, bill.proposer_id)}, or the Speaker can withdraw it.`,
    );
  }
  await run(`UPDATE bills SET status = 'withdrawn', closed_at = ? WHERE id = ?`, [house.now, bill.id]);
  return { ok: true, bill_id: bill.id, spoken: `${bill.title} is withdrawn. The floor is clear.` };
}

export async function listLaws(
  ctx: Ctx,
  args: { status?: LawStatus | "all" | null },
): Promise<Result> {
  const house = await loadHouse(ctx.householdId);
  const status = args.status ?? "in_force";
  const laws =
    status === "all"
      ? await all<Law>(`SELECT * FROM laws WHERE household_id = ? ORDER BY number DESC`, [ctx.householdId])
      : await all<Law>(`SELECT * FROM laws WHERE household_id = ? AND status = ? ORDER BY number DESC`, [
          ctx.householdId,
          status,
        ]);
  const label = status === "in_force" ? "in force" : status === "all" ? "on the books" : status;
  const spoken =
    laws.length === 0
      ? `There are no laws ${label}.`
      : `There ${laws.length === 1 ? "is" : "are"} ${plural(laws.length, "law", "laws")} ${label}: ${[...laws]
          .reverse()
          .slice(0, 6)
          .map((l) => `Act ${l.number}, ${l.title}`)
          .join("; ")}.`;
  return { ok: true, laws: laws.map((l) => lawSummary(l, house.tz)), spoken };
}

export async function checkRule(ctx: Ctx, args: { question: string; member: string }): Promise<Result> {
  const house = await loadHouse(ctx.householdId);
  const member = resolveMember(house, args.member);
  const question = truncate(args.question ?? "", 300);
  if (!question) throw new HouseError("Ask a question, for example: can I wear shoes in the house?");
  const laws = await all<Law>(
    `SELECT * FROM laws WHERE household_id = ? AND status = 'in_force' ORDER BY number`,
    [ctx.householdId],
  );
  if (laws.length === 0) {
    return {
      ok: true,
      applies: false,
      spoken: "No law on the books covers that, so it is allowed for now. Would you like to propose a bill?",
    };
  }
  const ruling = await interpretRule(
    ctx.scope,
    question,
    member.name,
    laws.map((l) => ({
      id: l.id,
      number: l.number,
      title: l.title,
      statute_text: l.statute_text,
      penalty: l.penalty,
      enacted_on: formatDate(l.enacted_at, house.tz),
    })),
  );
  const law = ruling.applies ? laws.find((l) => l.id === ruling.law_id) ?? null : null;
  let spoken = ruling.ruling;
  if (law && !spoken.includes(law.title)) {
    spoken = `Under ${law.title}, enacted on ${formatDate(law.enacted_at, house.tz)}: ${spoken}`;
  }
  if (!law && !/bill/i.test(spoken)) spoken += " Would you like to propose a bill?";
  await run(
    `INSERT INTO enforcement_log (id, household_id, law_id, kind, message, created_at) VALUES (?, ?, ?, 'ruling', ?, ?)`,
    [newId("log"), ctx.householdId, law?.id ?? null, spoken, house.now],
  );
  return {
    ok: true,
    applies: !!law,
    law: law ? lawSummary(law, house.tz) : null,
    spoken,
  };
}

function dueToday(schedule: Schedule, now: number, tz: string): string | null {
  if (schedule.type === "standing") return null;
  const local = localParts(now, tz);
  if (schedule.type === "weekly" && WEEKDAYS[local.weekday] !== schedule.day) return null;
  const t = parseTime(schedule.time);
  if (!t) return null;
  const minutesUntil = t.hour * 60 + t.minute - (local.hour * 60 + local.minute);
  const at = formatTimeOfDay(t.hour, t.minute);
  if (minutesUntil > 60) return `later today at ${at}`;
  if (minutesUntil >= -90) return `now, at ${at}`;
  return `earlier today at ${at}`;
}

export async function getDueReminders(ctx: Ctx): Promise<Result> {
  const house = await loadHouse(ctx.householdId);
  const local = localParts(house.now, house.tz);
  const startOfDay = zonedTimeToUtc(local.year, local.month, local.day, 0, 0, house.tz);
  const laws = await all<Law>(
    `SELECT * FROM laws WHERE household_id = ? AND status = 'in_force' AND schedule_json IS NOT NULL ORDER BY number`,
    [ctx.householdId],
  );
  const reminded = await all<{ law_id: string }>(
    `SELECT law_id FROM enforcement_log WHERE household_id = ? AND kind = 'reminder' AND created_at >= ? AND created_at < ?`,
    [ctx.householdId, startOfDay, startOfDay + DAY_MS],
  );
  const done = new Set(reminded.map((r) => r.law_id));
  const reminders: { law_number: number; title: string; due: string; spoken: string }[] = [];
  for (const law of laws) {
    if (done.has(law.id)) continue;
    const schedule = parseSchedule(law.schedule_json);
    const due = schedule ? dueToday(schedule, house.now, house.tz) : null;
    if (!due) continue;
    let spoken: string;
    try {
      spoken = await writeReminder(ctx.scope, law, due);
    } catch {
      spoken = `A reminder from the Clerk: under ${law.title}, Act number ${law.number}, business is due ${due}.`;
    }
    reminders.push({ law_number: law.number, title: law.title, due, spoken });
    await run(
      `INSERT INTO enforcement_log (id, household_id, law_id, kind, message, created_at) VALUES (?, ?, ?, 'reminder', ?, ?)`,
      [newId("log"), ctx.householdId, law.id, spoken, house.now],
    );
  }
  return {
    ok: true,
    clock: formatClock(house.now, house.tz),
    reminders,
    spoken: reminders.length ? reminders.map((r) => r.spoken).join(" ") : "Nothing on the books is due right now.",
  };
}

function requireDemo() {
  if (!env.demoMode) throw new HouseError("That is only available in Demo mode.");
}

export async function advanceClock(
  ctx: Ctx,
  args: { hours?: number | null; days?: number | null; day?: Weekday | null; time?: string | null },
): Promise<Result> {
  requireDemo();
  const house = await loadHouse(ctx.householdId);
  let target: number;
  if (args.day || args.time) {
    const t = args.time ? parseTime(args.time) : { hour: 9, minute: 0 };
    if (!t) throw new HouseError("Give the time as 24-hour HH:MM, for example 17:00.");
    const weekday = args.day ? WEEKDAYS.indexOf(args.day) : null;
    target = nextOccurrence(house.now, house.tz, weekday, t.hour, t.minute);
  } else {
    const ms = (args.days ?? 0) * DAY_MS + (args.hours ?? 0) * 60 * 60 * 1000;
    if (ms <= 0) throw new HouseError("Move the clock forward by some hours or days, or to a day and time.");
    target = house.now + ms;
  }
  if (target - house.now > 60 * DAY_MS) throw new HouseError("The clock can move at most 60 days at a time.");
  const offset = target - Date.now();
  await run(`UPDATE households SET clock_offset_ms = ? WHERE id = ?`, [offset, ctx.householdId]);
  const label = formatClock(target, house.tz);
  return { ok: true, clock: label, now: new Date(target).toISOString(), spoken: `The clock now reads ${label}.` };
}

export async function resetDemo(ctx: Ctx): Promise<Result> {
  requireDemo();
  const existing = await one<Household>(`SELECT * FROM households WHERE id = ?`, [ctx.householdId]);
  await seedDemoHousehold(ctx.householdId, existing?.timezone ?? "America/New_York");
  return {
    ok: true,
    spoken: "The House is restored. The Parker household is in session with two laws on the books.",
  };
}
