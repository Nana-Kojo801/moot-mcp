"use client";
import { useMemo } from "react";
import type { BillView } from "@/lib/client/useMoot";

const STATUS_LABEL: Record<string, string> = {
  debate: "In debate",
  voting: "Vote open",
  awaiting_assent: "Awaiting Parental Assent",
  enacted: "Enacted",
  defeated: "Defeated",
  withdrawn: "Withdrawn",
};

export function OrderPaper({ bill, animateStamp }: { bill: BillView | null; animateStamp: boolean }) {
  const angle = useMemo(
    // A fresh random rotation each time a stamp lands.
    // eslint-disable-next-line react-hooks/purity
    () => `${(Math.random() * 16 - 9).toFixed(1)}deg`,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bill?.id, bill?.status, animateStamp],
  );

  if (!bill) {
    return (
      <section className="paper" aria-label="Order paper">
        <p className="paper__label">Order paper</p>
        <p className="empty-paper">
          No bill is before the House. Tap Speak and propose one, for example: &ldquo;I propose movie night every
          Friday at 5 PM.&rdquo;
        </p>
      </section>
    );
  }

  const stamp = bill.status === "enacted" ? "ENACTED" : bill.status === "defeated" ? "DEFEATED" : null;
  const meta = [
    `Proposed by ${bill.proposer}`,
    bill.schedule,
    bill.expires_on ? `Expires ${bill.expires_on}` : null,
    bill.law_number ? `Act ${bill.law_number}` : null,
  ].filter(Boolean);

  return (
    <section
      className={`paper${stamp && animateStamp ? " paper--struck" : ""}`}
      aria-label="Order paper"
      aria-live="polite"
    >
      <p className="paper__label">Order paper</p>
      <h2 className="paper__title">{bill.title}</h2>
      <p className="paper__text">{bill.statute_text}</p>
      <p className="paper__meta">{meta.join(" · ")}</p>
      {bill.penalty && <p className="paper__meta">Penalty: {bill.penalty}</p>}
      {bill.safety_note && <p className="paper__note">{bill.safety_note}</p>}
      {bill.debate.length > 0 && (
        <ul className="debate" aria-label="Debate">
          {bill.debate.slice(-3).map((d) => (
            <li key={d.id}>
              <strong>{d.member}:</strong> {d.text}
            </li>
          ))}
        </ul>
      )}
      <div className="tally">
        <span>Ayes {bill.tally.ayes}</span>
        <span>Noes {bill.tally.nays}</span>
        <span>Abstain {bill.tally.abstains}</span>
        <span className="tally__status">{STATUS_LABEL[bill.status] ?? bill.status}</span>
      </div>
      {stamp && (
        <div
          key={`${bill.id}-${bill.status}-${animateStamp}`}
          className={`stamp${stamp === "DEFEATED" ? " stamp--defeated" : ""}${animateStamp ? " stamp--animate" : ""}`}
          style={{ ["--angle" as string]: angle }}
          role="img"
          aria-label={`Stamped ${stamp.toLowerCase()}`}
        >
          {stamp}
        </div>
      )}
    </section>
  );
}
