"use client";
import Link from "next/link";
import { Masthead } from "@/components/Masthead";
import { StatuteBook } from "@/components/StatuteBook";
import { useMoot } from "@/lib/client/useMoot";

export default function StatutesPage() {
  const { state, status, error } = useMoot();
  return (
    <main className="shell">
      <Masthead />
      {status === "loading" && <p className="interim">Opening the Statute Book…</p>}
      {status === "none" && (
        <p>
          There is no household yet. <Link href="/" style={{ color: "inherit" }}>Start the demo</Link> first.
        </p>
      )}
      {status === "error" && !state && <p className="notice">{error}</p>}
      {state && <StatuteBook state={state} />}
    </main>
  );
}
