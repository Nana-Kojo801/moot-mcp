// Creates the Moot tables in the database named by TURSO_DATABASE_URL.
// Usage: npm run db:setup  (reads .env.local if present)
import { ensureSchema } from "../src/lib/db";

async function main() {
  await ensureSchema();
  console.log("Schema and migrations are up to date.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
