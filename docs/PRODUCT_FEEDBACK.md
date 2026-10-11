# Product feedback

Draft feedback on the tools and SDKs used to build Moot.

## Tools used and what for

| Tool | Used for |
|---|---|
| MCP TypeScript SDK (`@modelcontextprotocol/sdk` 1.32) | The MCP server (`McpServer`, `WebStandardStreamableHTTPServerTransport`) and the MCP client in the agent loop (`Client`, `StreamableHTTPClientTransport`) |
| Next.js 16 (App Router) + TypeScript | Web app and API routes, including the MCP endpoint |
| Vercel (Hobby) | Hosting |
| Turso + `@libsql/client` | Hosted SQLite database |
| OpenAI API | Bill drafting, rulings, reminders, and the tool-calling agent loop |
| zod 4 | Validating every tool input and every AI output |
| Web Speech API | Microphone input and spoken replies in the browser |
| Web Audio API | Synthesized gavel and stamp sounds |
| Vitest | Unit tests for the rules of the House and the clock |
| Playwright (Chromium) | Phone-width screenshots while designing |
| Claude Code (web session) | Pair-programming assistant for the build |

## What worked well

- **MCP SDK:** the Web-standard transport drops straight into a Next.js route handler. Stateless mode plus JSON responses fit serverless exactly. `registerTool` with zod shapes produces clean JSON Schemas in `tools/list`, and the same SDK's client made the agent loop an honest MCP client in a few lines.
- **Turso:** the `file:` URL fallback meant the entire app was built and tested locally before any cloud database existed. `RETURNING` and upserts made the budget counter a single atomic statement.
- **OpenAI:** tool calling with parallel calls lets "propose and vote aye" happen in one turn; JSON-schema output made drafts reliable to parse.
- **Next.js:** route handlers with plain `Request`/`Response` kept the server code portable.

## What needs work

- **MCP SDK docs:** state the supported protocol versions prominently, and add a serverless recipe (see the friction log, entries 1 and 2).
- **OpenAI structured outputs:** the gap between standard JSON Schema and strict mode needs a maintained converter for zod 4 (entry 4).
- **Next.js scaffold:** experimental-feeling defaults (`cacheComponents`) and an outdated `@types/node` pin (entries 6 and 7).
- **Web Speech API:** behaviour differs across mobile browsers, and permission rules for speech synthesis are underdocumented (entry 10).

## Onboarding: zero to hello world

- **MCP server answering `tools/list` over HTTP:** about 20 minutes, most of it finding the right transport class.
- **Turso:** a minute to point the client at a local file; the hosted database needs only a URL and a token.
- **OpenAI tool calling:** quick; mapping MCP `inputSchema` to OpenAI function `parameters` is a direct copy.

## Would I build with them again?

Yes. The MCP SDK made the "real server, simulated assistant" architecture straightforward, and the same tools a voice assistant would call are the ones the web app calls. Turso's local fallback and Vercel's zero-config Next.js deploys kept the loop short. The main cost was in the seams between products (strict schema conversion, protocol-version discovery), which better docs would remove.
