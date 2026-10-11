"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { browserTimeZone, postJson, type MootState } from "@/lib/client/useMoot";

interface Row {
  key: string;
  id?: string;
  name: string;
  kind: "adult" | "child";
  color?: string;
}

let counter = 0;
const key = () => `row${++counter}`;

export function HouseSetup({ state, onSaved }: { state: MootState | null; onSaved: () => Promise<unknown> }) {
  const router = useRouter();
  const [name, setName] = useState(state?.household.name ?? "Our household");
  const [assent, setAssent] = useState(state?.household.assent_required ?? true);
  const [rows, setRows] = useState<Row[]>(
    state?.members.map((m) => ({ key: m.id, id: m.id, name: m.name, kind: m.kind as Row["kind"], color: m.color })) ?? [
      { key: key(), name: "", kind: "adult" },
      { key: key(), name: "", kind: "child" },
    ],
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const update = (i: number, patch: Partial<Row>) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const move = (i: number, d: -1 | 1) =>
    setRows((r) => {
      const next = [...r];
      const j = i + d;
      if (j < 0 || j >= next.length) return r;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await postJson(
        "/api/household",
        {
          name,
          assent_required: assent,
          timezone: browserTimeZone(),
          members: rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind })),
        },
        "PUT",
      );
      await onSaved();
      if (!state) router.push("/");
      else setSaved("Household saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The household could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="setup">
      <h1>{state ? "Household" : "Set up your household"}</h1>
      <p className="book__intro">
        Nicknames are fine. Seat order sets the order in which the Speaker&rsquo;s chair rotates each week.
      </p>
      <div className="field">
        <label htmlFor="hname">Household name</label>
        <input id="hname" type="text" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="field">
        <span className="label">Members, in seat order</span>
        {rows.map((r, i) => (
          <div className="member-row" key={r.key}>
            <input
              type="text"
              aria-label={`Member ${i + 1} name`}
              value={r.name}
              maxLength={30}
              placeholder="Name or nickname"
              style={r.color ? { ["--member" as string]: r.color } : undefined}
              onChange={(e) => update(i, { name: e.target.value })}
            />
            <div className="member-row__tools">
              <div className="segmented" role="radiogroup" aria-label={`${r.name || `Member ${i + 1}`} is an adult or a child`}>
                {(["adult", "child"] as const).map((k) => (
                  <label key={k}>
                    <input
                      type="radio"
                      name={`kind-${r.key}`}
                      checked={r.kind === k}
                      onChange={() => update(i, { kind: k })}
                    />
                    {k === "adult" ? "Adult" : "Child"}
                  </label>
                ))}
              </div>
              <button type="button" className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${r.name || "member"} up`}>
                ↑
              </button>
              <button type="button" className="icon-btn" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label={`Move ${r.name || "member"} down`}>
                ↓
              </button>
              <button
                type="button"
                className="linkish"
                onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                disabled={rows.length <= 2}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
        {rows.length < 8 && (
          <button
            type="button"
            className="btn btn--ink btn--small"
            onClick={() => setRows((rs) => [...rs, { key: key(), name: "", kind: "child" }])}
          >
            Add member
          </button>
        )}
      </div>

      <label className="switch">
        <input type="checkbox" checked={assent} onChange={(e) => setAssent(e.target.checked)} />
        <span>
          <strong>Parental Assent.</strong> A bill proposed by a child that passes also needs an adult&rsquo;s assent.
        </span>
      </label>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {saved && <p role="status">{saved}</p>}
      <button type="button" className="btn btn--primary" onClick={save} disabled={busy}>
        {busy ? "Saving…" : "Save household"}
      </button>

      {state && (
        <div className="connect">
          <h2>Connect an MCP client</h2>
          <p>
            The Clerk is a simulated voice assistant calling a real MCP server. Any MCP client can call the same
            tools over Streamable HTTP.
          </p>
          <dl>
            <dt>Endpoint</dt>
            <dd>
              <code>{typeof window === "undefined" ? "/api/mcp" : `${window.location.origin}/api/mcp`}</code>
            </dd>
            <dt>Header</dt>
            <dd>
              <code>x-moot-household: {state.household.id}</code>
            </dd>
          </dl>
        </div>
      )}
    </section>
  );
}
