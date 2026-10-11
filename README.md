# Moot

**Every household deserves a parliament.**

Moot is a parliament for your household. Family members propose house rules by voice, debate them, and vote. Passed bills become numbered laws that stay on the books, with penalties, schedules and expiry dates. The Clerk, a voice assistant, reminds the household when a law falls due and rules on "is this allowed?" questions by citing the act and the date it passed.

Built for the **Alexa+ track** of the Build, Ship, Shape: Amazon Developer Hackathon 2026. The web app is **a simulated Alexa+ experience** calling **a real MCP server**.

> Moot is a household game for entertainment. It is not a parenting authority, a legal system, or a source of legal advice. Penalties are always playful and harmless; the Clerk rewrites anything else.

## How it works

One repo, two cooperating parts that share one Turso database:

1. **An MCP server** at `/api/mcp` (Streamable HTTP, stateless, protocol `2025-11-25`) that exposes the parliament as tools: propose a bill, debate, vote, enact, list laws, check a rule, get due reminders. A real voice assistant can connect to it.
2. **A web app that simulates the voice experience.** The Chamber screen listens through the browser microphone, and an **agent loop** sends what was said to an AI model together with the tool list fetched from the MCP server's `tools/list`. The model picks tools, the server executes them **through an MCP client over HTTP**, and the Clerk speaks the result with browser speech synthesis.

```
Member speaks (browser mic, Web Speech API)
   │
   ▼
POST /api/clerk ── agent loop (src/lib/ai.ts → agentTurn)
   │   1. MCP client: tools/list            ┐
   │   2. AI picks tools (≤ 4 per utterance) │  @modelcontextprotocol/sdk Client
   │   3. MCP client: tools/call ...         ┘  over Streamable HTTP
   ▼
POST /api/mcp ── Moot MCP server (src/lib/mcp/server.ts)
   │
   ▼
Turso (bills, debate, votes, laws, members, enforcement log, usage)
   │
   ▼
Spoken reply (speechSynthesis) + Chamber updates (hemicycle, ballot slips, ENACTED stamp)
```

The demo controls (fast-forward the clock, reset) also go through the MCP client, so the web app only changes the House by calling MCP tools.

What makes it different from one-off "AI judge" apps: Moot **keeps the laws and enforces them over time**. State persists across sessions (the statute book), the agent chains tools (propose, then vote), reminders are proactive, and each member votes as themselves.

## The rules of the House

- A household has members (adult or child) in seat order. The **Speaker** rotates weekly through the seats.
- Bills move from `debate` to `voting` to `enacted` or `defeated` (or `withdrawn`). Only one bill is before the House at a time.
- **Quorum:** more than half the members must vote (abstaining counts as voting). Without quorum the vote stays open.
- **Ordinary bills** pass on a simple majority of ayes over noes. **Ties are defeated unless the Speaker voted aye.**
- **Amendments** need two thirds; **repeals** need a simple majority. (The thresholds are implemented and tested; the amendment and repeal tools are a Phase 2 feature.)
- **Parental Assent** (on by default): a bill proposed by a child that passes waits for an adult to give assent.
- Laws have a number, title, statute text, optional penalty, optional schedule (`standing`, `weekly`, `daily`), enacted date and optional expiry.

The rules live in `src/lib/parliament.ts` with unit tests in `tests/`.

## MCP tools

| Tool | What it does |
|---|---|
| `get_household` | Members, this week's Speaker, Parental Assent setting, counts of laws and pending bills, the current bill. |
| `propose_bill` | `member`, `idea`, optional `penalty`, `schedule`, `expires_in_days`. The AI drafts a title and statute text, applies the safety rules, opens debate. Vague ideas get one clarifying question instead. |
| `add_debate_statement` | `member`, `statement`, optional `bill_id`. |
| `call_vote` | `member` (must be the Speaker), optional `bill_id`. |
| `cast_vote` | `member`, `choice` (`aye`/`nay`/`abstain`), optional `bill_id`. Changing your vote is allowed until the vote closes. |
| `close_vote` | Optional `bill_id`. Applies quorum and thresholds, returns a roll call, enacts, defeats, or waits for assent. |
| `give_assent` | `member` (an adult), optional `bill_id`. |
| `withdraw_bill` | `member` (proposer or Speaker), optional `bill_id`. |
| `list_laws` | Optional `status`: `in_force` (default), `expired`, `repealed`, `all`. |
| `check_rule` | `question`, `member`. Rules against the laws in force, citing the act and its enacted date, or offers to draft a bill. |
| `get_due_reminders` | Laws due today on the household clock that have not been reminded today, each with a spoken reminder. Logged so each fires once per day. |
| `advance_clock` | Demo mode only. Move the household clock by `hours`/`days`, or to the next `day` and `time`. |
| `reset_demo` | Demo mode only. Restore the seeded household. |

Every tool returns structured content with `ok` and a short `spoken` string (plain sentences for text-to-speech) plus tool-specific data. Bill ids are optional: tools default to the bill currently before the House, which suits a voice agent.

### Connect an MCP client

The household is chosen with the `x-moot-household` header. Each browser gets its own household; its id is shown at the bottom of the **House** screen.

```bash
# initialize: the server negotiates protocol 2025-11-25
curl -s -X POST https://YOUR-APP.vercel.app/api/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'

# list the tools
curl -s -X POST https://YOUR-APP.vercel.app/api/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H 'mcp-protocol-version: 2025-11-25' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# call a tool for your household
curl -s -X POST https://YOUR-APP.vercel.app/api/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H 'mcp-protocol-version: 2025-11-25' \
  -H 'x-moot-household: hh_YOUR_HOUSEHOLD_ID' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_laws","arguments":{}}}'
```

If `MCP_API_KEY` is set, add `-H 'authorization: Bearer YOUR_KEY'`.

Or use the bundled SDK client, which prints the negotiated protocol version, the tool list, and one tool result:

```bash
npm run mcp:smoke -- https://YOUR-APP.vercel.app hh_YOUR_HOUSEHOLD_ID check_rule '{"member":"Leo","question":"Can I wear shoes inside?"}'
```

The [MCP Inspector](https://github.com/modelcontextprotocol/inspector) also works: choose Streamable HTTP, enter the `/api/mcp` URL, and add the `x-moot-household` header.

## Setup

### Requirements

- Node.js 20.9 or later (22 recommended) and npm
- A [Turso](https://turso.tech) database (free tier is enough)
- An [OpenAI](https://platform.openai.com) API key

### Environment variables

Copy `.env.example` to `.env.local` and fill it in.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `OPENAI_API_KEY` | yes | | Server-side key for drafting bills, rulings, reminders and the agent loop. Never sent to the browser. |
| `OPENAI_MODEL` | no | `gpt-5.4-mini` | Any OpenAI model with tool calling and JSON-schema output. |
| `OPENAI_REASONING_EFFORT` | no | `low` | Sent as `reasoning_effort`. Use `off` to omit it. If the model rejects it, Moot retries without it. |
| `TURSO_DATABASE_URL` | yes | | `libsql://...` URL of your Turso database. For local development only, `file:local.db` also works. |
| `TURSO_AUTH_TOKEN` | yes for Turso | | Database token. |
| `MCP_API_KEY` | no | | When set, `/api/mcp` requires `Authorization: Bearer <key>`. The app's own MCP client sends it automatically. |
| `MCP_SERVER_URL` | no | `<site>/api/mcp` | Point the Clerk at a different MCP server URL. |
| `DEMO_MODE` | no | `true` | Enables the fast-forward clock, `advance_clock`, `reset_demo`. |
| `AI_DAILY_CALL_CAP` | no | `300` | Global AI calls per UTC day. |
| `AI_SESSION_DAILY_CAP` | no | `40` | AI calls per visitor per UTC day. |

### Create the Turso database

With the [Turso CLI](https://docs.turso.tech/cli/introduction):

```bash
turso auth login
turso db create moot
turso db show moot --url          # → TURSO_DATABASE_URL
turso db tokens create moot       # → TURSO_AUTH_TOKEN
```

(Or create the database and a token in the Turso dashboard.)

### Run locally

```bash
npm install
cp .env.example .env.local        # then fill in the values
npm run db:setup                  # creates the tables
npm run dev                       # http://localhost:3000
```

The app also creates any missing tables on first use, so `db:setup` is a convenience, not a requirement.

Voice input needs a browser with the Web Speech API (Chrome on Android or desktop works best) and a secure origin: `localhost` or HTTPS. Where speech recognition is unavailable, for example some iPhone browsers, the Chamber shows a text box and still speaks replies.

### Checks

```bash
npm test             # voting rules, quorum, tie-break, assent, Speaker rotation, clock
npm run typecheck
npm run lint
npm run build
```

## Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel, **Add New → Project** and import the repo. The framework preset is Next.js; no build settings need changing.
3. Under **Settings → Environment Variables**, add `OPENAI_API_KEY`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `DEMO_MODE=true`, and optionally the caps, `OPENAI_MODEL` and `MCP_API_KEY`.
4. Deploy. Open the production URL and tap **Use the demo household**.
5. Check the MCP endpoint with the `curl` commands above.

The production deployment must be public (no Vercel Authentication on production) so judges can use it without logging in.

## How the simulation works

- **Who is speaking.** A real voice assistant would recognise each family member's voice. In the web app you tap a nameplate in the hemicycle to speak as that member; the Clerk passes that member to every tool.
- **Agent loop.** `src/app/api/clerk/route.ts` opens an MCP client to `/api/mcp`, fetches `tools/list`, and calls `agentTurn` in `src/lib/ai.ts`. The model may chain up to four tool calls per utterance ("I propose movie night every Friday, and I'm voting aye" becomes `propose_bill` then `cast_vote`). Its final reply is at most three spoken sentences.
- **Proactive reminders.** After a clock jump the app calls `get_due_reminders` and the Clerk reads each one aloud in its business voice.
- **Time.** Every "now" goes through `src/lib/clock.ts`, which applies the household's `clock_offset_ms` and time zone. Demo mode fast-forwards by changing that offset.
- **Visitors.** Each browser gets an anonymous `moot_visitor` cookie and its own copy of the demo household, so testers never collide. No login.
- **Budget guards.** Before every AI call, `src/lib/usage.ts` claims one unit from the global and per-visitor daily caps in the `usage` table. When a cap is reached, the Clerk says "The House has risen for the day (demo limit reached)" and nothing crashes. Roll calls and other ceremonial lines are templated in code, not generated.
- **Safety.** Prompts require family-friendly text and playful penalties; a server-side check in `src/lib/house.ts` replaces any penalty involving physical punishment, withholding food, isolation or humiliation, and the Clerk says so.

## Project layout

```
src/app/                 pages (Chamber, Statutes, House) and API routes
src/app/api/mcp          the MCP endpoint (Streamable HTTP, stateless)
src/app/api/clerk        the agent loop for the simulated voice assistant
src/lib/mcp/server.ts    tool definitions
src/lib/mcp/client.ts    MCP client used by the app
src/lib/house.ts         parliamentary business behind each tool
src/lib/parliament.ts    quorum, thresholds, tie-break, assent, Speaker rotation
src/lib/ai.ts            every AI call (swap providers by editing this file)
src/lib/clock.ts         household clock and time zones
src/components/          hemicycle, Order Paper and stamp, Statute Book, setup
docs/                    design plan, demo script, friction log, product feedback
```

## License

MIT. See [LICENSE](LICENSE).
