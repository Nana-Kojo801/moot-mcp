# Working on Moot

@AGENTS.md

- Commits are authored by the builder only. Do not add `Co-Authored-By`, "Generated with", session links, or any other AI attribution to commit messages, PR titles or descriptions, or code comments.
- Commit messages: short imperative summaries, e.g. "Add vote tally".
- Keep `main` deployable: run `npm test`, `npm run typecheck`, `npm run lint` and `npm run build` before pushing.
- Never use the word "Alexa" or Amazon branding in the app UI or assets. The assistant is "the Clerk".
- All AI calls go through `src/lib/ai.ts`; all "now" calculations go through `src/lib/clock.ts`.
- Record SDK/platform problems in `docs/FRICTION_LOG.md` as they happen.
