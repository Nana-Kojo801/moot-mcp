// The rules of the House. Pure functions, no database, fully unit tested.
import { localDayNumber } from "./clock";
import type { BillKind, Choice, MemberKind } from "./types";

export interface SeatedMember {
  id: string;
  kind: MemberKind;
  seat: number;
}

/** Week number on the household calendar; weeks run Monday to Sunday. */
export function weekNumber(nowMs: number, tz: string): number {
  return Math.floor(localDayNumber(nowMs, tz) / 7);
}

/** The Speaker rotates weekly (Monday to Sunday) through the members in seat order. */
export function rotationSpeaker<T extends SeatedMember>(members: T[], nowMs: number, tz: string): T | null {
  if (members.length === 0) return null;
  const ordered = [...members].sort((a, b) => a.seat - b.seat);
  const week = weekNumber(nowMs, tz);
  const index = ((week % ordered.length) + ordered.length) % ordered.length;
  return ordered[index];
}

export interface SpeakerOverride {
  speaker_override_id: string | null;
  speaker_override_week: number | null;
}

/**
 * This week's Speaker: the rotation, unless the House impeached the Speaker this week,
 * in which case the member chosen by the motion holds the chair until the week ends.
 */
export function speakerFor<T extends SeatedMember>(
  members: T[],
  nowMs: number,
  tz: string,
  override?: SpeakerOverride | null,
): T | null {
  if (override?.speaker_override_id && override.speaker_override_week === weekNumber(nowMs, tz)) {
    const chosen = members.find((m) => m.id === override.speaker_override_id);
    if (chosen) return chosen;
  }
  return rotationSpeaker(members, nowMs, tz);
}

/** The member who takes the chair when the Speaker is impeached: the next seat along. */
export function successorOf<T extends SeatedMember>(members: T[], speakerId: string): T | null {
  const ordered = [...members].sort((a, b) => a.seat - b.seat);
  const i = ordered.findIndex((m) => m.id === speakerId);
  if (i === -1 || ordered.length < 2) return null;
  return ordered[(i + 1) % ordered.length];
}

export interface TallyInput {
  kind: BillKind;
  members: { id: string }[];
  votes: { member_id: string; choice: Choice }[];
  speakerId: string | null;
  proposerKind: MemberKind;
  assentRequired: boolean;
}

export type Outcome = "no_quorum" | "defeated" | "enacted" | "awaiting_assent";

export interface TallyResult {
  ayes: number;
  nays: number;
  abstains: number;
  turnout: number;
  memberCount: number;
  quorum: boolean;
  /** How many more members must vote before quorum is reached. */
  shortOfQuorum: number;
  passed: boolean;
  tieBrokenBySpeaker: boolean;
  threshold: "simple" | "two_thirds";
  outcome: Outcome;
}

/** Quorum: more than half of the members have voted (abstaining counts as voting). */
export function quorumNeeded(memberCount: number): number {
  return Math.floor(memberCount / 2) + 1;
}

export function tally(input: TallyInput): TallyResult {
  const memberIds = new Set(input.members.map((m) => m.id));
  const counted = input.votes.filter((v) => memberIds.has(v.member_id));
  const ayes = counted.filter((v) => v.choice === "aye").length;
  const nays = counted.filter((v) => v.choice === "nay").length;
  const abstains = counted.filter((v) => v.choice === "abstain").length;
  const turnout = counted.length;
  const memberCount = memberIds.size;
  const needed = quorumNeeded(memberCount);
  const quorum = memberCount > 0 && turnout >= needed;
  const threshold = input.kind === "amend" ? "two_thirds" : "simple";

  let passed = false;
  let tieBrokenBySpeaker = false;
  if (quorum && ayes > 0) {
    if (threshold === "two_thirds") {
      passed = ayes * 3 >= (ayes + nays) * 2;
    } else if (ayes > nays) {
      passed = true;
    } else if (ayes === nays) {
      const speakerAye = counted.some(
        (v) => v.member_id === input.speakerId && v.choice === "aye",
      );
      passed = speakerAye;
      tieBrokenBySpeaker = speakerAye;
    }
  }

  let outcome: Outcome;
  if (!quorum) outcome = "no_quorum";
  else if (!passed) outcome = "defeated";
  // Parental Assent applies to laws; a motion to impeach the Speaker is not a law.
  else if (input.assentRequired && input.proposerKind === "child" && input.kind !== "impeach") {
    outcome = "awaiting_assent";
  }
  else outcome = "enacted";

  return {
    ayes,
    nays,
    abstains,
    turnout,
    memberCount,
    quorum,
    shortOfQuorum: Math.max(0, needed - turnout),
    passed,
    tieBrokenBySpeaker,
    threshold,
    outcome,
  };
}
