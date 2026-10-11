// Schema for the Turso database. Applied by `npm run db:setup` (scripts/db-setup.ts).
export const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS households (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    assent_required INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    clock_offset_ms INTEGER NOT NULL DEFAULT 0,
    timezone TEXT NOT NULL DEFAULT 'America/New_York',
    is_demo INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    color TEXT NOT NULL,
    seat INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS members_household ON members(household_id)`,
  `CREATE TABLE IF NOT EXISTS bills (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL,
    proposer_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    statute_text TEXT NOT NULL,
    penalty TEXT,
    schedule_json TEXT,
    expires_at INTEGER,
    target_law_id TEXT,
    status TEXT NOT NULL,
    awaiting_assent INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    voting_opened_at INTEGER,
    closed_at INTEGER,
    safety_note TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS bills_household ON bills(household_id, status)`,
  `CREATE TABLE IF NOT EXISTS debate (
    id TEXT PRIMARY KEY,
    bill_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS debate_bill ON debate(bill_id)`,
  `CREATE TABLE IF NOT EXISTS votes (
    bill_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    choice TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (bill_id, member_id)
  )`,
  `CREATE TABLE IF NOT EXISTS laws (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL,
    number INTEGER NOT NULL,
    bill_id TEXT,
    title TEXT NOT NULL,
    statute_text TEXT NOT NULL,
    penalty TEXT,
    schedule_json TEXT,
    enacted_at INTEGER NOT NULL,
    expires_at INTEGER,
    status TEXT NOT NULL,
    supersedes_law_id TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS laws_household ON laws(household_id, status)`,
  `CREATE TABLE IF NOT EXISTS enforcement_log (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL,
    law_id TEXT,
    kind TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS enforcement_household ON enforcement_log(household_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS usage (
    day TEXT NOT NULL,
    scope TEXT NOT NULL,
    calls INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, scope)
  )`,
];
