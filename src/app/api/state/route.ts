import { HouseError } from "@/lib/house";
import { errorJson, getVisitorId, householdIdFor } from "@/lib/session";
import { getState } from "@/lib/state";

export const dynamic = "force-dynamic";

export async function GET() {
  const visitor = await getVisitorId();
  if (!visitor) return errorJson(404, "No household yet. Start the demo first.");
  try {
    return Response.json(await getState(householdIdFor(visitor)));
  } catch (err) {
    if (err instanceof HouseError) return errorJson(404, err.message);
    console.error("[moot] state", err);
    return errorJson(503, "The House records could not be loaded. Check the database connection.");
  }
}
