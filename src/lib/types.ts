import { z } from "zod";
import { WEEKDAYS } from "./clock";

export const ScheduleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("standing") }),
  z.object({
    type: z.literal("weekly"),
    day: z.enum(WEEKDAYS),
    time: z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM"),
  }),
  z.object({
    type: z.literal("daily"),
    time: z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM"),
  }),
]);
export type Schedule = z.infer<typeof ScheduleSchema>;

export type MemberKind = "adult" | "child";
export type BillKind = "new" | "amend" | "repeal" | "impeach";
export type BillStatus = "debate" | "voting" | "enacted" | "defeated" | "withdrawn";
export type LawStatus = "in_force" | "expired" | "repealed";
export type Choice = "aye" | "nay" | "abstain";

export interface Household {
  id: string;
  name: string;
  assent_required: number;
  created_at: number;
  clock_offset_ms: number;
  timezone: string;
  is_demo: number;
  speaker_override_id: string | null;
  speaker_override_week: number | null;
}

export interface Member {
  id: string;
  household_id: string;
  name: string;
  kind: MemberKind;
  color: string;
  seat: number;
  created_at: number;
}

export interface Bill {
  id: string;
  household_id: string;
  proposer_id: string;
  kind: BillKind;
  title: string;
  statute_text: string;
  penalty: string | null;
  schedule_json: string | null;
  expires_at: number | null;
  target_law_id: string | null;
  status: BillStatus;
  awaiting_assent: number;
  created_at: number;
  voting_opened_at: number | null;
  closed_at: number | null;
  safety_note: string | null;
}

export interface Vote {
  bill_id: string;
  member_id: string;
  choice: Choice;
  created_at: number;
}

export interface Law {
  id: string;
  household_id: string;
  number: number;
  bill_id: string | null;
  title: string;
  statute_text: string;
  penalty: string | null;
  schedule_json: string | null;
  enacted_at: number;
  expires_at: number | null;
  status: LawStatus;
  supersedes_law_id: string | null;
  ended_at: number | null;
}

export function parseSchedule(json: string | null): Schedule | null {
  if (!json) return null;
  try {
    const parsed = ScheduleSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
