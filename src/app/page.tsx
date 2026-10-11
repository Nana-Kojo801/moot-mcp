"use client";
import { Chamber } from "@/components/Chamber";
import { Masthead } from "@/components/Masthead";
import { Welcome } from "@/components/Welcome";
import { useMoot } from "@/lib/client/useMoot";

export default function Home() {
  const { state, status, error, refresh, startDemo } = useMoot();
  return (
    <main className="shell">
      {status === "none" || (status === "error" && !state) ? (
        <Welcome onStartDemo={startDemo} error={status === "error" ? error : null} />
      ) : (
        <div className="chamber-page">
          <Masthead />
          {status === "loading" && <p className="interim">The House is assembling…</p>}
          {state && <Chamber state={state} refresh={refresh} />}
        </div>
      )}
    </main>
  );
}
