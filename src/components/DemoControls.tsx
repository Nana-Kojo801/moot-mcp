"use client";
import { useState } from "react";
import { postJson } from "@/lib/client/useMoot";

interface ActionResult {
  name: string;
  ok: boolean;
  spoken: string;
}

const JUMPS = [
  { label: "Fri 5 PM", args: { day: "friday", time: "17:00" } },
  { label: "Next day", args: { days: 1 } },
  { label: "Next week", args: { days: 7 } },
];

export function DemoControls({
  clock,
  onResult,
  onError,
}: {
  clock: string;
  onResult: (spoken: string | null) => void;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);

  const run = async (calls: { name: string; args?: Record<string, unknown> }[], speakFrom: string) => {
    setBusy(true);
    try {
      const { results } = await postJson<{ results: ActionResult[] }>("/api/action", { calls });
      const failed = results.find((r) => !r.ok);
      const wanted = results.find((r) => r.name === speakFrom);
      onResult(failed ? failed.spoken : wanted?.spoken ?? null);
    } catch (err) {
      onError(err instanceof Error ? err.message : "The demo control failed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="demo" aria-label="Demo controls">
      <div className="demo__row">
        <span className="clock" aria-label={`House clock: ${clock}`}>
          {clock}
        </span>
        <button type="button" className="linkish" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? "Hide demo" : "Demo controls"}
        </button>
      </div>
      {open && (
        <div className="demo__controls">
          {JUMPS.map((j) => (
            <button
              key={j.label}
              type="button"
              className="btn btn--small"
              disabled={busy}
              aria-label={`Jump the clock to ${j.label === "Fri 5 PM" ? "Friday 5 PM" : j.label.toLowerCase()}`}
              onClick={() => run([{ name: "advance_clock", args: j.args }, { name: "get_due_reminders" }], "get_due_reminders")}
            >
              {j.label}
            </button>
          ))}
          <button
            type="button"
            className="btn btn--small"
            disabled={busy}
            aria-label="Reset demo"
            onClick={() => run([{ name: "reset_demo" }], "reset_demo")}
          >
            Reset
          </button>
        </div>
      )}
    </section>
  );
}
