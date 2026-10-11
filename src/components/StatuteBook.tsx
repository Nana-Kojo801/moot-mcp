"use client";
import type { LawView, MootState } from "@/lib/client/useMoot";

function Act({ law }: { law: LawView }) {
  const h = law.history;
  const gone = law.status !== "in_force";
  const details = [
    law.schedule,
    `Enacted ${law.enacted_on}`,
    law.expires_on ? `${law.status === "expired" ? "Expired" : "Expires"} ${law.expires_on}` : null,
    law.status === "repealed" ? "Repealed" : null,
  ].filter(Boolean);
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
        {h ? (
          <>
            <p>
              Proposed by {h.proposer} on {h.proposed_on}. Passed with {h.tally.ayes} aye
              {h.tally.ayes === 1 ? "" : "s"}, {h.tally.nays} no{h.tally.nays === 1 ? "" : "es"}
              {h.tally.abstains ? `, and ${h.tally.abstains} abstaining` : ""}.
            </p>
            {h.votes.length > 0 && (
              <ul className="roll" aria-label="Roll call">
                {h.votes.map((v) => (
                  <li key={v.member_id} className={v.choice === "aye" ? "ink-aye" : v.choice === "nay" ? "ink-nay" : ""}>
                    {v.member} {v.choice}
                  </li>
                ))}
              </ul>
            )}
            {h.debate.length > 0 && (
              <>
                <p>From the debate:</p>
                <ul className="debate">
                  {h.debate.map((d) => (
                    <li key={d.id}>
                      <strong>{d.member}:</strong> {d.text}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        ) : null}
      </div>
    </details>
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
      {inForce.length === 0 && <p>No laws are in force yet. Propose a bill in the Chamber.</p>}
      {inForce.map((l) => (
        <Act key={l.id} law={l} />
      ))}
      {gone.length > 0 && (
        <>
          <h2>Repealed and expired</h2>
          {gone.map((l) => (
            <Act key={l.id} law={l} />
          ))}
        </>
      )}
    </section>
  );
}
