"use client";
import { useRouter } from "next/navigation";
import { HouseSetup } from "@/components/HouseSetup";
import { Masthead } from "@/components/Masthead";
import { useMoot } from "@/lib/client/useMoot";

export default function HousePage() {
  const { state, status, error, refresh, startDemo } = useMoot();
  const router = useRouter();
  return (
    <main className="shell">
      <Masthead />
      {status === "loading" && <p className="interim">Opening the household register…</p>}
      {status === "error" && !state && <p className="notice">{error}</p>}
      {(status === "ready" || status === "none") && (
        <HouseSetup key={state?.household.id ?? "new"} state={state} onSaved={refresh} />
      )}
      {status === "none" && (
        <p className="fineprint" style={{ marginTop: 16 }}>
          Or skip this and{" "}
          <button type="button" className="linkish" onClick={() => void startDemo().then(() => router.push("/"))}>
            use the demo household
          </button>
          .
        </p>
      )}
    </main>
  );
}
