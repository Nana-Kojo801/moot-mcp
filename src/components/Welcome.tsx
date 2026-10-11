"use client";
import Link from "next/link";
import { useState } from "react";

export function Welcome({ onStartDemo, error }: { onStartDemo: () => Promise<unknown>; error?: string | null }) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  return (
    <section className="welcome">
      <h1>Moot</h1>
      <p className="tagline">Every household deserves a parliament.</p>
      <p>
        Propose house rules out loud, debate them, and vote. Passed bills become laws, and the Clerk keeps the
        statute book, reminds you when a law is due, and rules on what is allowed.
      </p>
      <div className="actions">
        <button
          className="btn btn--primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setFailure(null);
            try {
              await onStartDemo();
            } catch (err) {
              setFailure(err instanceof Error ? err.message : "The demo could not start. Try again.");
              setBusy(false);
            }
          }}
        >
          {busy ? "Opening the House…" : "Use the demo household"}
        </button>
        <Link href="/house" className="btn" style={{ textAlign: "center", textDecoration: "none", lineHeight: "26px" }}>
          Set up my household
        </Link>
      </div>
      {(failure || error) && (
        <p className="error" role="alert">
          {failure || error}
        </p>
      )}
      <p className="fineprint">
        Moot is a household game for entertainment. It is not a parenting authority, legal system, or source of
        legal advice. Nicknames are fine; Moot stores only member names.
      </p>
    </section>
  );
}
