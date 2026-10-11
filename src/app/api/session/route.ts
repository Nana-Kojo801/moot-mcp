import { ensureSchema } from "@/lib/db";
import { safeTimeZone } from "@/lib/clock";
import { seedDemoHousehold } from "@/lib/seed";
import { errorJson, getOrCreateVisitorId, getVisitorId, householdIdFor } from "@/lib/session";
import { householdExists } from "@/lib/state";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Does this browser already have a household? */
export async function GET() {
  try {
    await ensureSchema();
    const visitor = await getVisitorId();
    const has = visitor ? await householdExists(householdIdFor(visitor)) : false;
    return Response.json({ hasHousehold: has, demoMode: env.demoMode });
  } catch (err) {
    console.error("[moot] session", err);
    return errorJson(503, "The database is not reachable. Check TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.");
  }
}

/** Start (or restart) the demo household for this browser. */
export async function POST(req: Request) {
  try {
    await ensureSchema();
    const body = (await req.json().catch(() => ({}))) as { timezone?: string };
    const visitor = await getOrCreateVisitorId();
    await seedDemoHousehold(householdIdFor(visitor), safeTimeZone(body.timezone));
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[moot] session", err);
    return errorJson(503, "The demo household could not be created. The database is not reachable.");
  }
}
