// Every AI call in Moot goes through this module, so the provider can be swapped
// by editing one file. All outputs are validated with zod and retried once.
import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { z } from "zod";
import { env } from "./env";
import { WEEKDAYS } from "./clock";
import { BudgetError, claimAiCall, RISEN_MESSAGE } from "./usage";
import type { Schedule } from "./types";

let openai: OpenAI | null = null;

function client(): OpenAI {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new AiUnavailableError(
        "The Clerk cannot draft or rule right now because the server has no AI key configured.",
      );
    }
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 1, timeout: 25_000 });
  }
  return openai;
}

/** The AI could not be used; the message is safe to speak. */
export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiUnavailableError";
  }
}

export function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max) : clean;
}

let reasoningRejected = false;

function reasoningParams(): { reasoning_effort?: "none" | "minimal" | "low" | "medium" } {
  const effort = process.env.OPENAI_REASONING_EFFORT ?? "low";
  if (reasoningRejected || effort === "off" || effort === "") return {};
  return { reasoning_effort: effort as "low" };
}

type CompletionParams = Parameters<OpenAI["chat"]["completions"]["create"]>[0] & { stream?: false };

/** One chat completion. If the model rejects reasoning_effort, retry once without it and remember. */
async function complete(params: CompletionParams) {
  try {
    return await client().chat.completions.create(params);
  } catch (err) {
    if (
      !reasoningRejected &&
      "reasoning_effort" in params &&
      err instanceof OpenAI.APIError &&
      err.status === 400 &&
      /reasoning/i.test(err.message)
    ) {
      reasoningRejected = true;
      const { reasoning_effort: _ignored, ...rest } = params;
      void _ignored;
      return client().chat.completions.create(rest);
    }
    throw err;
  }
}

// Keywords OpenAI's strict mode does not accept. Lengths are enforced after parsing instead.
const UNSUPPORTED_KEYWORDS = ["$schema", "minLength", "maxLength", "format"];

/** OpenAI strict JSON schema mode wants every property required and no extras. */
function strictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;
    for (const k of UNSUPPORTED_KEYWORDS) delete n[k];
    if (n.type === "object" && n.properties && typeof n.properties === "object") {
      n.required = Object.keys(n.properties as object);
      n.additionalProperties = false;
    }
    for (const value of Object.values(n)) {
      if (Array.isArray(value)) value.forEach(visit);
      else visit(value);
    }
  };
  visit(json);
  return json;
}

async function callJson<T>(
  scope: string,
  name: string,
  schema: z.ZodType<T>,
  system: string,
  user: string,
): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    await claimAiCall(scope);
    const res = await complete({
      model: env.openaiModel,
      ...reasoningParams(),
      max_completion_tokens: 2000,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name, strict: true, schema: strictJsonSchema(schema) },
      },
    });
    const text = res.choices[0]?.message?.content ?? "";
    try {
      const parsed = schema.safeParse(JSON.parse(text));
      if (parsed.success) return parsed.data;
      lastError = parsed.error;
    } catch (err) {
      lastError = err;
    }
  }
  console.error("[moot] AI output rejected", String(lastError).slice(0, 300));
  throw new AiUnavailableError("The Clerk could not make sense of that. Please say it another way.");
}

const SAFETY = `Moot is a family game. Everything you write must be family-friendly.
Penalties must be playful and harmless: chores, dares, silly tasks, extra turns, buying the next round of hot chocolate.
Never allow a penalty involving physical punishment, withholding food or drink, isolation, humiliation, taking away sleep, money from children, or anything unsafe.`;

// ---------- draftBill ----------

const DraftSchema = z.object({
  title: z.string(),
  statute_text: z.string(),
  penalty: z.string().nullable(),
  schedule: z
    .object({
      type: z.enum(["standing", "weekly", "daily"]),
      day: z.enum(WEEKDAYS).nullable(),
      time: z.string().nullable(),
    })
    .nullable(),
  expires_in_days: z.number().int().nullable(),
  clarifying_question: z.string().nullable(),
  safety_flag: z.string().nullable(),
});

export interface Draft {
  title: string;
  statute_text: string;
  penalty: string | null;
  schedule: Schedule | null;
  expires_in_days: number | null;
  clarifying_question: string | null;
  safety_flag: string | null;
}

export interface DraftContext {
  scope: string;
  proposerName: string;
  proposerKind: string;
  penalty?: string | null;
  existingTitles: string[];
  /** When set, the idea is a change to this existing act and the draft is the full amended act. */
  amending?: { number: number; title: string; statute_text: string; penalty: string | null; schedule: string | null };
}

function normalizeSchedule(s: z.infer<typeof DraftSchema>["schedule"]): Schedule | null {
  if (!s) return null;
  const time = s.time && /^([01]?\d|2[0-3]):[0-5]\d$/.test(s.time) ? s.time : null;
  if (s.type === "weekly" && s.day && time) return { type: "weekly", day: s.day, time };
  if (s.type === "daily" && time) return { type: "daily", time };
  return { type: "standing" };
}

export async function draftBill(idea: string, ctx: DraftContext): Promise<Draft> {
  const system = `You are the Clerk of a household parliament game called Moot. You turn a family member's spoken idea into a bill.
${SAFETY}
Rules:
- title: title case, ends in "Act", e.g. "The Pizza Friday Act". Avoid duplicating these existing acts: ${ctx.existingTitles.join(", ") || "none"}.
- statute_text: one or two sentences, mock-formal and warm, e.g. "Whereas Friday is long and pizza is good, it shall be so." Plain text, no markdown.
- penalty: only if the member mentioned one, otherwise null. If their penalty breaks the safety rules, set safety_flag to a short polite explanation and set penalty to a harmless playful alternative.
- schedule: weekly (day + 24-hour HH:MM time) or daily (time) when the rule happens at a set time; standing when it always applies; null if unsure. If a weekly event has no time, choose a sensible evening time.
- expires_in_days: only if the member gave a time limit, otherwise null.
- clarifying_question: if the idea is too vague to become a rule, ask one short question and leave the other fields as best guesses. Otherwise null.
- If the idea itself is unsafe or unkind, set safety_flag and rewrite it into a kind, harmless version.`;
  const a = ctx.amending;
  const amendNote = a
    ? `\nThis is an AMENDMENT to an existing act. Write the full act as it would read after the change, keeping everything the member did not ask to change (including the penalty and schedule unless they changed them). Keep the title "${a.title}" unless the change makes it wrong. The existing act, Act no. ${a.number}: ${a.title}. Text: ${a.statute_text}${a.penalty ? ` Penalty: ${a.penalty}` : ""}${a.schedule ? ` Schedule: ${a.schedule}` : ""}`
    : "";
  const user = `Proposer: ${ctx.proposerName} (${ctx.proposerKind}).
${a ? "Requested change" : "Idea"}: ${truncate(idea, 400)}${ctx.penalty ? `\nPenalty they asked for: ${truncate(ctx.penalty, 200)}` : ""}${amendNote}`;
  const out = await callJson(ctx.scope, "draft_bill", DraftSchema, system, user);
  const days = out.expires_in_days;
  if (!out.clarifying_question && (out.title.trim().length < 3 || out.statute_text.trim().length < 5)) {
    out.clarifying_question = "What exactly should the new rule say?";
  }
  return {
    title: truncate(out.title, 80),
    statute_text: truncate(out.statute_text, 400),
    penalty: out.penalty ? truncate(out.penalty, 200) : null,
    schedule: normalizeSchedule(out.schedule),
    expires_in_days: days && days >= 1 && days <= 3650 ? days : null,
    clarifying_question: out.clarifying_question ? truncate(out.clarifying_question, 200) : null,
    safety_flag: out.safety_flag ? truncate(out.safety_flag, 200) : null,
  };
}

// ---------- interpretRule ----------

const RulingSchema = z.object({
  applies: z.boolean(),
  law_id: z.string().nullable(),
  ruling: z.string().min(1),
});
export type Ruling = z.infer<typeof RulingSchema>;

export interface LawForRuling {
  id: string;
  number: number;
  title: string;
  statute_text: string;
  penalty: string | null;
  enacted_on: string;
}

export async function interpretRule(
  scope: string,
  question: string,
  askedBy: string,
  laws: LawForRuling[],
): Promise<Ruling> {
  const system = `You are the Clerk of a household parliament game called Moot. A member asks whether something is allowed. Compare the question with the laws in force.
${SAFETY}
If a law applies: applies=true, law_id = that law's id, and ruling = two short spoken sentences that give the answer and cite the act by name and the date it was enacted, e.g. "Under The Shoes Off Act, passed on March 3, 2026, shoes come off at the door. So no, not inside." Mention the penalty if there is one.
If no law applies: applies=false, law_id=null, ruling = say plainly that no law covers it, so it is allowed for now, and offer to draft a bill.
Plain sentences only, no markdown, no lists.`;
  const lawText = laws
    .map(
      (l) =>
        `id=${l.id}; Act no. ${l.number}: ${l.title}; enacted ${l.enacted_on}; text: ${l.statute_text}${l.penalty ? `; penalty: ${l.penalty}` : ""}`,
    )
    .join("\n");
  const user = `Laws in force:\n${lawText}\n\n${askedBy} asks: ${truncate(question, 300)}`;
  const out = await callJson(scope, "rule_check", RulingSchema, system, user);
  return { ...out, ruling: cleanSpoken(truncate(out.ruling, 400)) };
}

// ---------- writeReminder ----------

const ReminderSchema = z.object({ spoken: z.string().min(1) });

export async function writeReminder(
  scope: string,
  law: { number: number; title: string; statute_text: string; penalty: string | null },
  dueDescription: string,
): Promise<string> {
  const system = `You are the Clerk of a household parliament game called Moot. Write one warm, ceremonial spoken sentence reminding the household that a law is due, citing the act by name. Plain text, no markdown.
${SAFETY}`;
  const user = `Act no. ${law.number}: ${law.title}. Text: ${law.statute_text}${law.penalty ? ` Penalty: ${law.penalty}` : ""}\nDue: ${dueDescription}`;
  const out = await callJson(scope, "reminder", ReminderSchema, system, user);
  return cleanSpoken(truncate(out.spoken, 300));
}

// ---------- agentTurn ----------

export interface McpToolDef {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolStep {
  name: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
}

export interface AgentTurnInput {
  scope: string;
  utterance: string;
  speaker: { name: string; kind: string };
  householdBrief: string;
  tools: McpToolDef[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

export interface AgentTurnResult {
  reply: string;
  steps: ToolStep[];
  budgetExhausted?: boolean;
}

const MAX_TOOL_CALLS = 4;

function withoutSchemaKey(schema: Record<string, unknown>): Record<string, unknown> {
  const { $schema: _drop, ...rest } = schema;
  void _drop;
  return rest;
}

export async function agentTurn(input: AgentTurnInput): Promise<AgentTurnResult> {
  const tools: ChatCompletionTool[] = input.tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: (t.description ?? "").slice(0, 1000),
      parameters: withoutSchemaKey(t.inputSchema),
    },
  }));

  const system = `You are the Clerk of the House in Moot, a parliament game for a family household. You speak aloud, so reply in plain spoken English: at most three short sentences, no markdown, no lists, family-friendly, warm and a little ceremonial.
The member speaking now is ${input.speaker.name} (${input.speaker.kind}). Pass member="${input.speaker.name}" to tools unless they clearly speak for someone else.
${input.householdBrief}
Use the tools to do what the member asks. You may chain tools, for example propose_bill then cast_vote.
How to read what members say:
- The household details above are current, so do not call get_household unless the member asks about the household.
- Use propose_bill only when the member clearly proposes a new rule ("I propose", "I move", "new rule", "let's make a law").
- While a bill is before the House, opinions, arguments and suggestions about it ("I think", "we should", "I'd like to say") are debate: call add_debate_statement with their words.
- A short "aye", "nay", "no", "yes", "abstain", "I vote for it" or "I'm against it" is a vote on the bill before the House: call cast_vote (yes means aye, no means nay).
- To change an existing law use propose_amendment; to scrap one use propose_repeal; both name the law by act number or title.
- "Impeach the Speaker", "no confidence in the Speaker" and the like mean impeach_speaker. "State of the House" or "how did this week go" means state_of_the_house.
When a tool result includes "spoken", base your reply on it and keep its facts (act names, numbers, dates, counts) exactly. If a tool fails, tell the member plainly what happened and what to do next.
If the member says something that is not parliamentary business, answer briefly and invite them to propose a bill or ask about a law.`;

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    { role: "user", content: truncate(input.utterance, 400) },
  ];
  const steps: ToolStep[] = [];

  for (let round = 0; round < MAX_TOOL_CALLS + 1; round++) {
    const allowTools = steps.length < MAX_TOOL_CALLS;
    try {
      await claimAiCall(input.scope);
    } catch (err) {
      // Out of budget midway: report what was already done instead of losing it.
      if (err instanceof BudgetError && steps.length > 0) {
        return { reply: `${fallbackReply(steps)} ${RISEN_MESSAGE}`, steps, budgetExhausted: true };
      }
      throw err;
    }
    const res = await complete({
      model: env.openaiModel,
      ...reasoningParams(),
      max_completion_tokens: 2000,
      messages,
      ...(allowTools ? { tools, tool_choice: "auto" as const } : {}),
    });
    const msg = res.choices[0]?.message;
    if (!msg) break;
    const calls = (msg.tool_calls ?? []).filter((c) => c.type === "function");
    if (!allowTools || calls.length === 0) {
      return { reply: cleanSpoken(msg.content ?? "") || fallbackReply(steps), steps };
    }
    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });
    for (const call of calls) {
      let args: Record<string, unknown> = {};
      let result: Record<string, unknown>;
      if (steps.length >= MAX_TOOL_CALLS) {
        result = { ok: false, spoken: "Tool limit reached for this request." };
      } else {
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          args = {};
        }
        result = await input.callTool(call.function.name, args);
        steps.push({ name: call.function.name, args, result });
      }
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result).slice(0, 4000),
      });
    }
  }
  return { reply: fallbackReply(steps), steps };
}

function fallbackReply(steps: ToolStep[]): string {
  const spoken = steps
    .map((s) => (typeof s.result.spoken === "string" ? s.result.spoken : ""))
    .filter(Boolean);
  return spoken.length ? spoken.join(" ") : "The Clerk did not catch that. Please say it again.";
}

/** Strips markdown so the speech engine does not read symbols aloud. */
export function cleanSpoken(text: string): string {
  return text
    .replace(/[*_`#>]+/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}
