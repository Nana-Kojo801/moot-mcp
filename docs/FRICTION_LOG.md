# Friction log

Problems and confusion hit while building Moot, recorded as they happened. Severity: low (minor annoyance), medium (cost real time or needed a workaround), high (blocked progress).

---

### 1. Which MCP protocol version does the SDK speak?

- **Product:** MCP TypeScript SDK (`@modelcontextprotocol/sdk` 1.32.1)
- **Task:** Confirm the server supports MCP spec `2025-11-25` over Streamable HTTP, as the hackathon rules require.
- **Steps:** Read the package README and changelog on npm, then searched the installed package.
- **Expected:** A clear statement of the supported protocol versions in the README or release notes.
- **Actual:** Found only by reading `dist/esm/types.js`: `LATEST_PROTOCOL_VERSION = '2025-11-25'`, while `DEFAULT_NEGOTIATED_PROTOCOL_VERSION = '2025-03-26'` is assumed when a request lacks the `mcp-protocol-version` header.
- **Severity:** medium
- **Workaround:** Verified with `curl` that `initialize` with `2025-11-25` negotiates `2025-11-25`, and the bundled smoke script prints the negotiated version.
- **Suggestion:** List the supported protocol versions at the top of the README and in each release note.

### 2. Streamable HTTP in a Next.js route handler

- **Product:** MCP TypeScript SDK
- **Task:** Serve MCP from a Next.js App Router route on Vercel in stateless mode.
- **Steps:** Most examples use Express and the Node `StreamableHTTPServerTransport`.
- **Expected:** An example for Web-standard `Request`/`Response` runtimes.
- **Actual:** `WebStandardStreamableHTTPServerTransport` exists and works well, but needed reading the type definitions to learn that `sessionIdGenerator: undefined` means stateless and that `enableJsonResponse: true` makes `handleRequest` resolve only once all responses are ready, which suits serverless.
- **Severity:** medium
- **Workaround:** One fresh `McpServer` and transport per request; return 405 for `GET` and `DELETE`.
- **Suggestion:** A short "serverless / Next.js / Vercel" recipe in the docs.

### 3. Structured output from tools needs an output schema

- **Product:** MCP TypeScript SDK with zod 4
- **Task:** Return `structuredContent` (with a `spoken` field) from every tool.
- **Actual:** Clients validate `structuredContent` against `outputSchema`, so a shared loose schema (`z.looseObject({ ok, spoken })`) was needed. Wrapping `registerTool` in a generic helper needed a type cast because the handler type is inferred from the exact shape.
- **Severity:** low
- **Workaround:** A small `register()` helper with one cast.
- **Suggestion:** Export a helper type for "handler for this input shape".

### 4. OpenAI strict JSON schema rejects common JSON Schema keywords

- **Product:** OpenAI API (structured outputs) with zod 4 `z.toJSONSchema`
- **Task:** Get validated JSON for bill drafts, rulings and reminders.
- **Expected:** Pass the zod-generated JSON Schema straight through.
- **Actual:** Strict mode requires every property in `required` and `additionalProperties: false`, which `z.toJSONSchema` does not emit for ordinary objects, and it does not accept keywords such as `minLength`/`maxLength`.
- **Severity:** medium
- **Workaround:** A post-processor that marks every property required, sets `additionalProperties: false`, and strips unsupported keywords; lengths are enforced in code after parsing.
- **Suggestion:** A documented, maintained zod-4-to-strict-schema helper.

### 5. Reasoning parameters differ between models

- **Product:** OpenAI API
- **Task:** Keep latency low for voice by setting `reasoning_effort`.
- **Actual:** Supported values differ between model families, and the right one could not be verified without a key in the build environment.
- **Severity:** low
- **Workaround:** `OPENAI_REASONING_EFFORT` env var; if the API rejects the parameter, the call is retried once without it and the choice is remembered.
- **Suggestion:** A capabilities endpoint listing supported parameters per model.

### 6. create-next-app 16 defaults

- **Product:** Next.js 16.4 (`create-next-app`)
- **Task:** Scaffold a plain App Router app.
- **Actual:** The generated `next.config.ts` enables `cacheComponents` and `partialPrefetching`, which change how dynamic data must be read. An app built around cookies and per-request database reads would have needed `Suspense` boundaries everywhere.
- **Severity:** low
- **Workaround:** Removed both options.
- **Suggestion:** Mention these flags in the scaffold output so they are a conscious choice.

### 7. npm peer dependency conflict between the scaffold and Vitest 5

- **Product:** Next.js scaffold + Vitest 5
- **Task:** `npm i -D vitest`.
- **Actual:** `ERESOLVE`: Vitest 5 wants `@types/node` 22 or later; the scaffold pins `@types/node@^20`.
- **Severity:** low
- **Workaround:** Upgraded `@types/node` to 22.
- **Suggestion:** Scaffold with the `@types/node` matching the current Node LTS.

### 8. Stale export during development

- **Product:** Next.js 16 dev server (Turbopack)
- **Task:** Export an existing function from one module and import it in a new one.
- **Actual:** At runtime the import was "not a function" until the dev server was restarted.
- **Severity:** low
- **Workaround:** Restart `next dev`.
- **Suggestion:** Invalidate dependents when a module's export list changes.

### 9. New React lint rules flag common patterns

- **Product:** `eslint-config-next` 16 (React Hooks rules)
- **Task:** Fetch on mount; pick a random stamp angle.
- **Actual:** `react-hooks/set-state-in-effect` and `react-hooks/purity` flag a fetch-on-mount hook and `Math.random()` inside `useMemo`, both intended here.
- **Severity:** low
- **Workaround:** Targeted disable comments with a reason.
- **Suggestion:** Link each rule's message to the recommended alternative.

### 10. Speech synthesis on mobile needs a user gesture first

- **Product:** Web Speech API (`speechSynthesis`) in mobile browsers
- **Task:** Speak the Clerk's reply when it arrives a few seconds after the tap.
- **Actual:** Mobile browsers may block speech that is not started from a user gesture.
- **Severity:** medium (to verify on the builder's phone)
- **Workaround:** Speak an empty, silent utterance inside the tap handler to unlock speech, then speak the real reply later.
- **Suggestion:** A documented permission model for `speechSynthesis` like the one for audio playback.

### 11. Testing without cloud credentials

- **Product:** Turso / `@libsql/client`
- **Task:** Develop and test before the Turso database existed.
- **Actual:** Worked well: the same client accepts a `file:` URL, so the whole app ran against a local SQLite file with no code changes. `@libsql/client` was added to `serverExternalPackages` up front so its native bindings are not bundled.
- **Severity:** low (a positive note)
