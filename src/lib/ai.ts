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
import { claimAiCall } from "./usage";
import type { Schedule } from "./types";

let openai: OpenAI | null = null;

function client(): OpenAI {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new AiUnavailableError("OPENAI_API_KEY is not set on the server.");
    }
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 1, timeout: 25_000 });
  }
  return openai;
}

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

function reasoningParams(): { reasoning_effort?: "none" | "minimal" | "low" | "medium" } {
  const effort = process.env.OPENAI_REASONING_EFFORT ?? "low";
  if (effort === "off" || effort === "") return {};
  return { reasoning_effort: effort as "low" };
}

/** OpenAI strict JSON schema mode wants every property required and no extras. */
function strictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  delete json.$schema;
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;
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
    const res = await client().chat.completions.create({
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
  throw new Error(`The AI returned an unexpected answer: ${String(lastError).slice(0, 200)}`);
}

const SAFETY = `Moot is a family game. Everything you write must be family-friendly.
Penalties must be playful and harmless: chores, dares, silly tasks, extra turns, buying the next round of hot chocolate.
Never allow a penalty involving physical punishment, withholding food or drink, isolation, humiliation, taking away sleep, money from children, or anything unsafe.`;

// ---------- draftBill ----------

const DraftSchema = z.object({
  title: z.string().min(3).max(80),
  statute_text: z.string().min(5).max(400),
  penalty: z.string().max(200).nullable(),
  schedule: z
    .object({
      type: z.enum(["standing", "weekly", "daily"]),
      day: z.enum(WEEKDAYS).nullable(),
      time: z.string().nullable(),
    })
    .nullable(),
  expires_in_days: z.number().int().min(1).max(3650).nullable(),
  clarifying_question: z.string().max(200).nullable(),
  safety_flag: z.string().max(200).nullable(),
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
  const user = `Proposer: ${ctx.proposerName} (${ctx.proposerKind}).
Idea: ${truncate(idea, 400)}${ctx.penalty ? `\nPenalty they asked for: ${truncate(ctx.penalty, 200)}` : ""}`;
  const out = await callJson(ctx.scope, "draft_bill", DraftSchema, system, user);
  return { ...out, schedule: normalizeSchedule(out.schedule) };
}

// ---------- interpretRule ----------

const RulingSchema = z.object({
  applies: z.boolean(),
  law_id: z.string().nullable(),
  ruling: z.string().min(1).max(400),
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
  return callJson(scope, "rule_check", RulingSchema, system, user);
}

// ---------- writeReminder ----------

const ReminderSchema = z.object({ spoken: z.string().min(1).max(300) });

export async function writeReminder(
  scope: string,
  law: { number: number; title: string; statute_text: string; penalty: string | null },
  dueDescription: string,
): Promise<string> {
  const system = `You are the Clerk of a household parliament game called Moot. Write one warm, ceremonial spoken sentence reminding the household that a law is due, citing the act by name. Plain text, no markdown.
${SAFETY}`;
  const user = `Act no. ${law.number}: ${law.title}. Text: ${law.statute_text}${law.penalty ? ` Penalty: ${law.penalty}` : ""}\nDue: ${dueDescription}`;
  const out = await callJson(scope, "reminder", ReminderSchema, system, user);
  return out.spoken;
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
}

const MAX_TOOL_CALLS = 4;

export async function agentTurn(input: AgentTurnInput): Promise<AgentTurnResult> {
  const tools: ChatCompletionTool[] = input.tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: (t.description ?? "").slice(0, 1000),
      parameters: t.inputSchema,
    },
  }));

  const system = `You are the Clerk of the House in Moot, a parliament game for a family household. You speak aloud, so reply in plain spoken English: at most three short sentences, no markdown, no lists, family-friendly, warm and a little ceremonial.
The member speaking now is ${input.speaker.name} (${input.speaker.kind}). Pass member="${input.speaker.name}" to tools unless they clearly speak for someone else.
${input.householdBrief}
Use the tools to do what the member asks. You may chain tools, for example propose_bill then cast_vote. When a tool result includes "spoken", base your reply on it and keep its facts (act names, numbers, dates, counts) exactly. If a tool fails, tell the member plainly what happened and what to do next.
If the member says something that is not parliamentary business, answer briefly and invite them to propose a bill or ask about a law.`;

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    { role: "user", content: truncate(input.utterance, 400) },
  ];
  const steps: ToolStep[] = [];

  for (let round = 0; round < MAX_TOOL_CALLS + 1; round++) {
    const allowTools = steps.length < MAX_TOOL_CALLS;
    await claimAiCall(input.scope);
    const res = await client().chat.completions.create({
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
