// The Moot MCP server: the household parliament exposed as tools.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { WEEKDAYS } from "../clock";
import OpenAI from "openai";
import { AiUnavailableError } from "../ai";
import { BudgetError, RISEN_MESSAGE } from "../usage";
import { env } from "../env";
import { ScheduleSchema } from "../types";
import * as house from "../house";

export const SERVER_INFO = { name: "moot", title: "Moot: a parliament for your household", version: "0.1.0" };

export interface McpContext {
  householdId: string | null;
  scope: string | null;
}

const ResultShape = z.looseObject({
  ok: z.boolean().describe("False when the request could not be carried out."),
  spoken: z.string().describe("Short plain sentences for text-to-speech, at most three."),
});

const member = z
  .string()
  .min(1)
  .max(60)
  .describe("Name (or id) of the household member speaking. Voice recognition tells you who this is.");
const billId = z
  .string()
  .max(40)
  .optional()
  .describe("Bill id. Leave empty to use the bill currently before the House.");

async function respond(fn: () => Promise<house.Result>): Promise<CallToolResult> {
  let result: house.Result;
  let isError = false;
  try {
    result = await fn();
  } catch (err) {
    isError = true;
    if (err instanceof house.HouseError) {
      result = { ok: false, spoken: err.message };
    } else if (err instanceof BudgetError) {
      result = { ok: false, budget_exhausted: true, spoken: RISEN_MESSAGE };
    } else if (err instanceof AiUnavailableError) {
      result = { ok: false, spoken: err.message };
    } else if (err instanceof OpenAI.APIError) {
      console.error("[moot] AI provider error", err.status, err.message);
      result = { ok: false, spoken: "The Clerk's drafting service did not answer. Try again in a moment." };
    } else {
      console.error("[moot] tool failed", err);
      result = { ok: false, spoken: "The House records could not be reached. Please try again in a moment." };
    }
  }
  return {
    content: [{ type: "text", text: JSON.stringify(result) }],
    structuredContent: result,
    ...(isError ? { isError: true } : {}),
  };
}

export function createMootServer(mcp: McpContext): McpServer {
  const server = new McpServer(SERVER_INFO, {
    instructions:
      "Moot runs a parliament for one household. Members propose bills by voice, debate, and vote; passed bills become numbered laws. " +
      "Pass the speaking member's name as `member`. Most tools default to the bill currently before the House when bill_id is omitted. " +
      "Every result has a `spoken` field written for text-to-speech. The household is chosen with the x-moot-household header.",
  });

  const ctx = (): house.Ctx => {
    if (!mcp.householdId) {
      throw new house.HouseError("No household was given. Send the household id in the x-moot-household header.");
    }
    return { householdId: mcp.householdId, scope: mcp.scope ?? `household:${mcp.householdId}` };
  };

  const register = <S extends z.ZodRawShape>(
    name: string,
    title: string,
    description: string,
    inputSchema: S,
    handler: (args: z.infer<z.ZodObject<S>>) => Promise<house.Result>,
    readOnly = false,
  ) => {
    server.registerTool(
      name,
      {
        title,
        description,
        inputSchema,
        outputSchema: ResultShape,
        annotations: { readOnlyHint: readOnly, destructiveHint: false, openWorldHint: false },
      },
      // The SDK infers argument types from the shape; the cast keeps this helper generic.
      ((args: z.infer<z.ZodObject<S>>) => respond(() => handler(args))) as never,
    );
  };

  register(
    "get_household",
    "Get household",
    "Members, this week's Speaker, the Parental Assent setting, counts of laws in force and bills pending, and the bill currently before the House.",
    {},
    () => house.getHousehold(ctx()),
    true,
  );

  register(
    "propose_bill",
    "Propose a bill",
    "Introduce a new bill from what a member said. The Clerk drafts a title and statute text, checks the family safety rules (penalties must be harmless), and opens the debate. If the idea is too vague, returns needs_clarification with one question in `spoken` and creates no bill. Only one bill can be before the House at a time.",
    {
      member,
      idea: z.string().min(1).max(600).describe("What the member proposed, in their own words."),
      penalty: z.string().max(200).optional().describe("A penalty the member asked for, if any."),
      schedule: ScheduleSchema.optional().describe(
        "When the law applies: standing (always), weekly (day + 24-hour HH:MM), or daily (HH:MM). Omit to let the Clerk infer it.",
      ),
      expires_in_days: z.number().int().min(1).max(3650).optional().describe("Make the law expire after this many days."),
    },
    (a) => house.proposeBill(ctx(), a),
  );

  register(
    "add_debate_statement",
    "Add to the debate",
    "Record a short speech by a member on a bill in debate or voting.",
    { bill_id: billId, member, statement: z.string().min(1).max(600).describe("What the member said.") },
    (a) => house.addDebateStatement(ctx(), a),
  );

  register(
    "call_vote",
    "Call the vote",
    "Close debate and open voting on a bill. Only this week's Speaker can call the vote (anyone may if there is no Speaker).",
    { bill_id: billId, member: member.describe("The member calling the vote; must be the Speaker.") },
    (a) => house.callVote(ctx(), a),
  );

  register(
    "cast_vote",
    "Cast a vote",
    "Record a member's vote: aye, nay, or abstain. One vote per member; casting again changes the vote until the vote closes. Votes cast during debate count once the vote is called.",
    { bill_id: billId, member, choice: z.enum(["aye", "nay", "abstain"]) },
    (a) => house.castVote(ctx(), a),
  );

  register(
    "close_vote",
    "Close the vote",
    "Count the votes and announce the result. Needs quorum (more than half the members voted). Ordinary bills pass on a simple majority; a tie passes only if the Speaker voted aye. A passed bill proposed by a child awaits Parental Assent if that setting is on; otherwise it is enacted as a numbered law.",
    { bill_id: billId },
    (a) => house.closeVote(ctx(), a),
  );

  register(
    "give_assent",
    "Give Parental Assent",
    "An adult member gives Parental Assent to a passed bill proposed by a child, enacting it.",
    { bill_id: billId, member: member.describe("An adult member.") },
    (a) => house.giveAssent(ctx(), a),
  );

  register(
    "withdraw_bill",
    "Withdraw a bill",
    "Withdraw the open bill. Only its proposer or the Speaker can do this.",
    { bill_id: billId, member },
    (a) => house.withdrawBill(ctx(), a),
  );

  register(
    "list_laws",
    "List laws",
    "The statute book: act number, title, schedule, penalty, enacted date and expiry for each law.",
    {
      status: z
        .enum(["in_force", "expired", "repealed", "all"])
        .optional()
        .describe("Which laws to list. Defaults to in_force."),
    },
    (a) => house.listLaws(ctx(), a),
    true,
  );

  register(
    "check_rule",
    "Check a rule",
    "Answer an 'is this allowed?' question against the laws in force. If a law applies, the ruling cites the act and the date it was enacted. If none applies, says so and offers to draft a bill.",
    { question: z.string().min(1).max(400).describe("The member's question."), member },
    (a) => house.checkRule(ctx(), a),
  );

  register(
    "get_due_reminders",
    "Get due reminders",
    "Laws whose schedule falls due today on the household clock and that have not been reminded yet today, each with a spoken reminder. Each is logged so it is only given once per day.",
    {},
    () => house.getDueReminders(ctx()),
  );

  if (env.demoMode) {
    register(
      "advance_clock",
      "Advance the clock (demo)",
      "Demo mode only. Move the household clock forward by hours and/or days, or to the next given weekday and 24-hour time.",
      {
        hours: z.number().min(0).max(1440).optional(),
        days: z.number().min(0).max(60).optional(),
        day: z.enum(WEEKDAYS).optional().describe("Jump to the next occurrence of this weekday."),
        time: z.string().max(5).optional().describe("24-hour HH:MM, used with day or alone for the next occurrence."),
      },
      (a) => house.advanceClock(ctx(), a),
    );

    register(
      "reset_demo",
      "Reset the demo",
      "Demo mode only. Restore the seeded demo household, erasing everything else in this household.",
      {},
      () => house.resetDemo(ctx()),
    );
  }

  return server;
}
