// Direct tool calls from the app's buttons (fast-forward, reminders, reset).
// These also go through the MCP client, so the app only ever acts through the MCP server.
import { withMcpClient } from "@/lib/mcp/client";
import { errorJson, getVisitorId, householdIdFor, originOf } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALLOWED = new Set([
  "advance_clock",
  "get_due_reminders",
  "reset_demo",
  "get_household",
  "list_laws",
  "cast_vote",
  "close_vote",
  "call_vote",
  "give_assent",
  "withdraw_bill",
]);

export async function POST(req: Request) {
  const visitor = await getVisitorId();
  if (!visitor) return errorJson(404, "No household yet. Start the demo first.");
  const body = (await req.json().catch(() => ({}))) as {
    calls?: { name: string; args?: Record<string, unknown> }[];
  };
  const calls = (body.calls ?? []).slice(0, 4);
  if (calls.length === 0 || calls.some((c) => !ALLOWED.has(c.name))) {
    return errorJson(400, "That action is not available.");
  }
  try {
    const results = await withMcpClient(
      { origin: originOf(req), householdId: householdIdFor(visitor), visitorId: visitor },
      async (mcp) => {
        const out: Record<string, unknown>[] = [];
        for (const c of calls) out.push({ name: c.name, ...(await mcp.callTool(c.name, c.args ?? {})) });
        return out;
      },
    );
    return Response.json({ results });
  } catch (err) {
    console.error("[moot] action", err);
    return errorJson(502, "The House could not be reached. Check your connection and try again.");
  }
}
