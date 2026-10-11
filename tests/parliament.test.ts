import { describe, expect, it } from "vitest";
import { quorumNeeded, speakerFor, tally, type TallyInput } from "../src/lib/parliament";
import type { Choice } from "../src/lib/types";

const members = [
  { id: "sam", kind: "adult" as const, seat: 0 },
  { id: "jo", kind: "adult" as const, seat: 1 },
  { id: "maya", kind: "child" as const, seat: 2 },
  { id: "leo", kind: "child" as const, seat: 3 },
];

function input(votes: Record<string, Choice>, over: Partial<TallyInput> = {}): TallyInput {
  return {
    kind: "new",
    members,
    votes: Object.entries(votes).map(([member_id, choice]) => ({ member_id, choice })),
    speakerId: "jo",
    proposerKind: "adult",
    assentRequired: true,
    ...over,
  };
}

describe("quorum", () => {
  it("needs more than half of the members", () => {
    expect(quorumNeeded(4)).toBe(3);
    expect(quorumNeeded(5)).toBe(3);
    expect(quorumNeeded(2)).toBe(2);
  });

  it("does not count a result without quorum", () => {
    const r = tally(input({ sam: "aye", jo: "aye" }));
    expect(r.quorum).toBe(false);
    expect(r.outcome).toBe("no_quorum");
    expect(r.shortOfQuorum).toBe(1);
  });

  it("counts abstentions toward quorum but not the majority", () => {
    const r = tally(input({ sam: "aye", jo: "abstain", leo: "abstain" }));
    expect(r.quorum).toBe(true);
    expect(r.outcome).toBe("enacted");
  });

  it("ignores votes from people who are not members", () => {
    const r = tally(input({ sam: "aye", stranger: "aye", ghost: "aye" }));
    expect(r.turnout).toBe(1);
    expect(r.outcome).toBe("no_quorum");
  });
});

describe("ordinary bills", () => {
  it("pass with a simple majority of votes cast", () => {
    expect(tally(input({ sam: "aye", jo: "aye", maya: "nay" })).outcome).toBe("enacted");
  });

  it("fail when the noes have it", () => {
    expect(tally(input({ sam: "aye", jo: "nay", maya: "nay" })).outcome).toBe("defeated");
  });

  it("are defeated on a tie when the Speaker did not vote aye", () => {
    const r = tally(input({ sam: "aye", jo: "nay", maya: "aye", leo: "nay" }));
    expect(r.outcome).toBe("defeated");
    expect(r.tieBrokenBySpeaker).toBe(false);
  });

  it("pass on a tie when the Speaker voted aye", () => {
    const r = tally(input({ sam: "nay", jo: "aye", maya: "aye", leo: "nay" }));
    expect(r.outcome).toBe("enacted");
    expect(r.tieBrokenBySpeaker).toBe(true);
  });

  it("fail when everyone abstains", () => {
    expect(tally(input({ sam: "abstain", jo: "abstain", maya: "abstain" })).outcome).toBe(
      "defeated",
    );
  });
});

describe("amendments and repeals", () => {
  it("amendments need two thirds", () => {
    expect(tally(input({ sam: "aye", jo: "aye", maya: "nay" }, { kind: "amend" })).outcome).toBe(
      "enacted",
    );
    expect(
      tally(input({ sam: "aye", jo: "aye", maya: "nay", leo: "nay" }, { kind: "amend" })).outcome,
    ).toBe("defeated");
    expect(
      tally(input({ sam: "aye", jo: "aye", maya: "aye", leo: "nay" }, { kind: "amend" })).outcome,
    ).toBe("enacted");
  });

  it("the Speaker cannot break a tie on an amendment", () => {
    expect(
      tally(input({ sam: "nay", jo: "aye", maya: "aye", leo: "nay" }, { kind: "amend" })).outcome,
    ).toBe("defeated");
  });

  it("repeals need a simple majority", () => {
    expect(
      tally(input({ sam: "aye", jo: "aye", maya: "nay" }, { kind: "repeal" })).outcome,
    ).toBe("enacted");
  });
});

describe("parental assent", () => {
  it("a passed child bill awaits assent", () => {
    const r = tally(input({ sam: "aye", jo: "aye", maya: "aye" }, { proposerKind: "child" }));
    expect(r.outcome).toBe("awaiting_assent");
  });

  it("a passed child bill is enacted when assent is switched off", () => {
    const r = tally(
      input({ sam: "aye", jo: "aye", maya: "aye" }, { proposerKind: "child", assentRequired: false }),
    );
    expect(r.outcome).toBe("enacted");
  });

  it("a defeated child bill does not await assent", () => {
    const r = tally(input({ sam: "nay", jo: "nay", maya: "aye" }, { proposerKind: "child" }));
    expect(r.outcome).toBe("defeated");
  });

  it("adult bills never need assent", () => {
    expect(tally(input({ sam: "aye", jo: "aye", maya: "aye" })).outcome).toBe("enacted");
  });
});

describe("Speaker rotation", () => {
  const tz = "America/New_York";
  // Wednesday 8 July 2026, noon in New York.
  const wed = Date.UTC(2026, 6, 8, 16, 0);
  const week = 7 * 24 * 60 * 60 * 1000;

  it("stays the same for the whole week", () => {
    const monday = Date.UTC(2026, 6, 6, 14, 0);
    const sunday = Date.UTC(2026, 6, 12, 23, 0);
    expect(speakerFor(members, monday, tz)?.id).toBe(speakerFor(members, wed, tz)?.id);
    expect(speakerFor(members, sunday, tz)?.id).toBe(speakerFor(members, wed, tz)?.id);
  });

  it("moves to the next seat each week and wraps around", () => {
    const ids = [0, 1, 2, 3, 4].map((i) => speakerFor(members, wed + i * week, tz)!.id);
    const start = members.findIndex((m) => m.id === ids[0]);
    expect(ids).toEqual([0, 1, 2, 3, 4].map((i) => members[(start + i) % 4].id));
  });

  it("returns null for an empty house", () => {
    expect(speakerFor([], wed, tz)).toBeNull();
  });
});
