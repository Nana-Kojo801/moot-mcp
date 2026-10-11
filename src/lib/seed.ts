// The seeded demo household: the Parker household.
import type { InArgs } from "@libsql/client";
import { batch, newId } from "./db";
import { DAY_MS } from "./clock";

export const MEMBER_COLORS = [
  "#7FB7A4",
  "#D98C5F",
  "#8FA6D9",
  "#C9A0C8",
  "#B9C46A",
  "#E0B25B",
  "#6FB3C9",
  "#D97A86",
];

export function householdStatements(id: string): { sql: string; args: InArgs }[] {
  return [
    { sql: `DELETE FROM votes WHERE bill_id IN (SELECT id FROM bills WHERE household_id = ?)`, args: [id] },
    { sql: `DELETE FROM debate WHERE bill_id IN (SELECT id FROM bills WHERE household_id = ?)`, args: [id] },
    { sql: `DELETE FROM bills WHERE household_id = ?`, args: [id] },
    { sql: `DELETE FROM laws WHERE household_id = ?`, args: [id] },
    { sql: `DELETE FROM enforcement_log WHERE household_id = ?`, args: [id] },
    { sql: `DELETE FROM members WHERE household_id = ?`, args: [id] },
    { sql: `DELETE FROM households WHERE id = ?`, args: [id] },
  ];
}

interface SeedLaw {
  title: string;
  text: string;
  penalty: string | null;
  schedule: object;
  daysAgo: number;
  proposer: number;
  votes: ("aye" | "nay" | "abstain")[];
}

const DEMO_MEMBERS = [
  { name: "Sam", kind: "adult" },
  { name: "Jo", kind: "adult" },
  { name: "Maya", kind: "child" },
  { name: "Leo", kind: "child" },
] as const;

const DEMO_LAWS: SeedLaw[] = [
  {
    title: "The Shoes Off Act",
    text: "Whereas floors are for socks and not for the great outdoors, all shoes shall come off at the front door and rest upon the mat.",
    penalty: "Whoever forgets sweeps the hallway before bedtime.",
    schedule: { type: "standing" },
    daysAgo: 41,
    proposer: 1,
    votes: ["aye", "aye", "aye", "nay"],
  },
  {
    title: "The Dish Rotation Act",
    text: "Whereas the sink fills itself but empties for no one, the washing of dishes shall pass to the next member in seat order every Sunday evening.",
    penalty: "Whoever skips their turn does the dishes twice the next week.",
    schedule: { type: "weekly", day: "sunday", time: "19:00" },
    daysAgo: 17,
    proposer: 0,
    votes: ["aye", "aye", "nay", "aye"],
  },
];

/** Replaces the household (if any) with a fresh copy of the demo household. */
export async function seedDemoHousehold(id: string, timezone: string, now = Date.now()) {
  const stmts = householdStatements(id);
  stmts.push({
    sql: `INSERT INTO households (id, name, assent_required, created_at, clock_offset_ms, timezone, is_demo)
          VALUES (?, ?, 1, ?, 0, ?, 1)`,
    args: [id, "The Parker household", now - 60 * DAY_MS, timezone],
  });
  const memberIds = DEMO_MEMBERS.map(() => newId("m"));
  DEMO_MEMBERS.forEach((m, i) => {
    stmts.push({
      sql: `INSERT INTO members (id, household_id, name, kind, color, seat, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [memberIds[i], id, m.name, m.kind, MEMBER_COLORS[i], i, now - 60 * DAY_MS],
    });
  });
  DEMO_LAWS.forEach((law, i) => {
    const billId = newId("bill");
    const enacted = now - law.daysAgo * DAY_MS;
    const proposed = enacted - 2 * 60 * 60 * 1000;
    stmts.push({
      sql: `INSERT INTO bills (id, household_id, proposer_id, kind, title, statute_text, penalty, schedule_json,
              status, created_at, voting_opened_at, closed_at)
            VALUES (?, ?, ?, 'new', ?, ?, ?, ?, 'enacted', ?, ?, ?)`,
      args: [
        billId,
        id,
        memberIds[law.proposer],
        law.title,
        law.text,
        law.penalty,
        JSON.stringify(law.schedule),
        proposed,
        enacted - 10 * 60 * 1000,
        enacted,
      ],
    });
    law.votes.forEach((choice, m) => {
      stmts.push({
        sql: `INSERT INTO votes (bill_id, member_id, choice, created_at) VALUES (?, ?, ?, ?)`,
        args: [billId, memberIds[m], choice, enacted - 5 * 60 * 1000],
      });
    });
    stmts.push({
      sql: `INSERT INTO laws (id, household_id, number, bill_id, title, statute_text, penalty, schedule_json,
              enacted_at, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_force')`,
      args: [newId("law"), id, i + 1, billId, law.title, law.text, law.penalty, JSON.stringify(law.schedule), enacted],
    });
  });
  await batch(stmts);
}
