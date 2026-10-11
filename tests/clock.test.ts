import { describe, expect, it } from "vitest";
import { localParts, nextOccurrence, zonedTimeToUtc } from "../src/lib/clock";

describe("clock", () => {
  const tz = "America/Los_Angeles";

  it("converts wall time to UTC across daylight saving", () => {
    expect(zonedTimeToUtc(2026, 7, 10, 17, 0, tz)).toBe(Date.UTC(2026, 6, 11, 0, 0));
    expect(zonedTimeToUtc(2026, 12, 4, 17, 0, tz)).toBe(Date.UTC(2026, 11, 5, 1, 0));
  });

  it("finds the next Friday at 5 PM", () => {
    // Wednesday 8 July 2026, 9 AM in Los Angeles.
    const from = zonedTimeToUtc(2026, 7, 8, 9, 0, tz);
    const next = nextOccurrence(from, tz, 5, 17, 0);
    const p = localParts(next, tz);
    expect([p.weekday, p.hour, p.minute, p.day]).toEqual([5, 17, 0, 10]);
  });

  it("skips to next week when the time has passed", () => {
    const from = zonedTimeToUtc(2026, 7, 10, 18, 0, tz);
    const p = localParts(nextOccurrence(from, tz, 5, 17, 0), tz);
    expect(p.day).toBe(17);
  });
});
