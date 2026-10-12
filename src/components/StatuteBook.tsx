"use client";
import { useState } from "react";
import { postJson, type BillView, type LawView, type MootState } from "@/lib/client/useMoot";
import { speak, unlockSpeech } from "@/lib/client/voice";

function Roll({ bill, verb }: { bill: BillView; verb: string }) {
  const t = bill.tally;
  return (
    <>
      <p>
        {verb} by {bill.proposer} on {bill.proposed_on}. Passed with {t.ayes} aye{t.ayes === 1 ? "" : "s"}, {t.nays} no
        {t.nays === 1 ? "" : "es"}
        {t.abstains ? `, and ${t.abstains} abstaining` : ""}.
      </p>
      {bill.votes.length > 0 && (
        <ul className="roll" aria-label="Roll call">
          {bill.votes.map((v) => (
            <li key={v.member_id} className={v.choice === "aye" ? "ink-aye" : v.choice === "nay" ? "ink-nay" : ""}>
              {v.member} {v.choice}
            </li>
          ))}
        </ul>
      )}
      {bill.debate.length > 0 && (
        <>
          <p>From the debate:</p>
          <ul className="debate">
            {bill.debate.map((d) => (
              <li key={d.id}>
                <strong>{d.member}:</strong> {d.text}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function Act({ law }: { law: LawView }) {
  const h = law.history;
  const gone = law.status !== "in_force";
  const ended =
    law.status === "expired"
      ? `Lapsed ${law.ended_on ?? law.expires_on ?? ""}`
      : law.status === "repealed"
        ? law.replaced_by
          ? `Replaced by Act ${law.replaced_by}${law.ended_on ? ` on ${law.ended_on}` : ""}`
          : `Repealed${law.ended_on ? ` ${law.ended_on}` : ""}`
        : law.expires_on
          ? `Lapses ${law.expires_on}`
          : null;
  const details = [law.schedule, `Enacted ${law.enacted_on}`, ended].filter(Boolean);
  return (
    <details className={`act${gone ? " act--gone" : ""}`}>
      <summary>
        <div className="act__head">
          <span className="act__no">Act {law.number}</span>
          <span className="act__title">{law.title}</span>
          <p className="act__details">{details.join(" · ")}</p>
          {law.penalty && <p className="act__details">Penalty: {law.penalty}</p>}
        </div>
      </summary>
      <div className="act__body">
        <p>{law.statute_text}</p>
        {law.supersedes && <p>Amends Act {law.supersedes}.</p>}
        {h && <Roll bill={h} verb={law.supersedes ? "Amendment moved" : "Proposed"} />}
        {law.repeal && (
          <>
            <p>
              <strong>Repealed.</strong>
            </p>
            <Roll bill={law.repeal} verb="Repeal moved" />
          </>
        )}
      </div>
    </details>
  );
}

function Recap() {
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="recap">
      <button
        type="button"
        className="btn btn--ink btn--small"
        disabled={busy}
        onClick={async () => {
          unlockSpeech();
          setBusy(true);
          try {
            const { results } = await postJson<{ results: { spoken: string }[] }>("/api/action", {
              calls: [{ name: "state_of_the_house" }],
            });
            const spoken = results[0]?.spoken ?? "The Clerk has nothing to report.";
            setText(spoken);
            speak(spoken, { business: true });
          } catch (err) {
            setText(err instanceof Error ? err.message : "The recap could not be fetched. Try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "The Clerk is reading…" : "Hear the State of the House"}
      </button>
      {text && (
        <p className="recap__text" aria-live="polite">
          {text}
        </p>
      )}
    </div>
  );
}

export function StatuteBook({ state }: { state: MootState }) {
  const inForce = state.laws.filter((l) => l.status === "in_force");
  const gone = state.laws.filter((l) => l.status !== "in_force");
  return (
    <section className="book">
      <h1>The Statute Book</h1>
      <p className="book__intro">
        {state.household.name}. {inForce.length} {inForce.length === 1 ? "law" : "laws"} in force, newest first.
        Tap an act to read its history.
      </p>
      <Recap />
      {inForce.length === 0 && <p>No laws are in force yet. Propose a bill in the Chamber.</p>}
      {inForce.map((l) => (
        <Act key={l.id} law={l} />
      ))}
      {gone.length > 0 && (
        <>
          <h2>Repealed and lapsed</h2>
          {gone.map((l) => (
            <Act key={l.id} law={l} />
          ))}
        </>
      )}
    </section>
  );
}
