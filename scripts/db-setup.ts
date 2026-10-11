// Creates the Moot tables in the database named by TURSO_DATABASE_URL.
// Usage: npm run db:setup  (reads .env.local if present)
import { db } from "../src/lib/db";
import { SCHEMA } from "../src/lib/schema";

async function main() {
  for (const sql of SCHEMA) {
    await db().execute(sql);
  }
  console.log(`Applied ${SCHEMA.length} schema statements.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
