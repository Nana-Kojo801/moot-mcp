// The simulated voice assistant: one utterance in, one spoken reply out.
// The AI chooses tools from the MCP server's tools/list and every tool runs through the MCP client.
import OpenAI from "openai";
import { agentTurn, AiUnavailableError, cleanSpoken, truncate } from "@/lib/ai";
import { all } from "@/lib/db";
import { HouseError, loadHouse } from "@/lib/house";
import { withMcpClient } from "@/lib/mcp/client";
import { errorJson, getVisitorId, householdIdFor, originOf } from "@/lib/session";
import { BudgetError, RISEN_MESSAGE } from "@/lib/usage";
import type { Bill, Law, Vote } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Demo controls are buttons in the app, so the Clerk does not get them.
const HIDDEN_FROM_CLERK = new Set(["advance_clock", "reset_demo"]);

async function brief(householdId: string): Promise<{ text: string; members: Map<string, { name: string; kind: string }> }> {
  const house = await loadHouse(householdId);
  const bill = (
    await all<Bill>(
      `SELECT * FROM bills WHERE household_id = ? AND status IN ('debate','voting') ORDER BY created_at DESC LIMIT 3`,
      [householdId],
    )
  )[0];
  const laws = await all<Law>(
    `SELECT number, title FROM laws WHERE household_id = ? AND status = 'in_force' ORDER BY number`,
    [householdId],
  );
  const name = (id: string) => house.members.find((m) => m.id === id)?.name ?? "someone";
  let billLine = "No bill is before the House.";
  if (bill) {
    const votes = await all<Vote>(`SELECT * FROM votes WHERE bill_id = ?`, [bill.id]);
    const cast = votes.map((v) => `${name(v.member_id)} ${v.choice}`).join(", ") || "none yet";
    billLine = bill.awaiting_assent
      ? `${bill.title} (id ${bill.id}) has passed and awaits Parental Assent from an adult.`
      : `Bill before the House: ${bill.title} (id ${bill.id}), status ${bill.status}, proposed by ${name(bill.proposer_id)}. Votes: ${cast}.`;
  }
  const text = [
    `Household: ${house.household.name}. Members in seat order: ${house.members.map((m) => `${m.name} (${m.kind})`).join(", ")}.`,
    `Speaker this week: ${house.speaker?.name ?? "none"}. Parental Assent is ${house.household.assent_required ? "on" : "off"}.`,
    billLine,
    `Laws in force: ${laws.map((l) => `Act ${l.number} ${l.title}`).join("; ") || "none"}.`,
  ].join("\n");
  return { text, members: new Map(house.members.map((m) => [m.id, { name: m.name, kind: m.kind }])) };
}

export async function POST(req: Request) {
  const visitor = await getVisitorId();
  if (!visitor) return errorJson(404, "No household yet. Start the demo first.");
  const householdId = householdIdFor(visitor);
  const body = (await req.json().catch(() => ({}))) as { utterance?: string; member_id?: string };
  const utterance = truncate(String(body.utterance ?? ""), 400);
  if (!utterance) return errorJson(400, "Nothing was heard. Tap the button and speak, or type a message.");

  try {
    const { text, members } = await brief(householdId);
    const speaker = (body.member_id && members.get(body.member_id)) || members.values().next().value;
    if (!speaker) return errorJson(400, "This household has no members. Add members in the household setup.");

    const result = await withMcpClient(
      { origin: originOf(req), householdId, visitorId: visitor },
      async (mcp) => {
        const tools = (await mcp.listTools()).filter((t) => !HIDDEN_FROM_CLERK.has(t.name));
        return agentTurn({
          scope: `visitor:${visitor}`,
          utterance,
          speaker,
          householdBrief: text,
          tools,
          callTool: (name, args) => {
            if (HIDDEN_FROM_CLERK.has(name)) {
              return Promise.resolve({ ok: false, spoken: "That control is a button in the app." });
            }
            // Who is speaking comes from the selected nameplate (standing in for voice recognition),
            // never from the model: every member acts as themselves.
            const takesMember = tools.find((t) => t.name === name)?.inputSchema?.properties as
              | Record<string, unknown>
              | undefined;
            return mcp.callTool(name, takesMember && "member" in takesMember ? { ...args, member: speaker.name } : args);
          },
        });
      },
    );
    return Response.json({
      reply: cleanSpoken(result.reply),
      budget_exhausted: result.budgetExhausted === true,
      steps: result.steps.map((s) => ({
        name: s.name,
        args: s.args,
        ok: s.result.ok !== false,
        outcome: typeof s.result.outcome === "string" ? s.result.outcome : null,
        spoken: typeof s.result.spoken === "string" ? s.result.spoken : null,
        budget_exhausted: s.result.budget_exhausted === true,
      })),
    });
  } catch (err) {
    if (err instanceof BudgetError) return Response.json({ reply: RISEN_MESSAGE, steps: [], budget_exhausted: true });
    if (err instanceof HouseError) return errorJson(404, err.message);
    if (err instanceof AiUnavailableError) return errorJson(503, err.message);
    if (err instanceof OpenAI.APIError) {
      console.error("[moot] AI provider error", err.status, err.message);
      return errorJson(502, "The Clerk's AI service did not answer. Try again in a moment.");
    }
    console.error("[moot] clerk", err);
    return errorJson(502, "The Clerk could not reach the House. Check your connection and try again.");
  }
}
