// Central place for server configuration. Never import this from client components.

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export const env = {
  get demoMode() {
    return (process.env.DEMO_MODE ?? "true").toLowerCase() === "true";
  },
  get mcpApiKey() {
    return process.env.MCP_API_KEY || "";
  },
  get mcpServerUrl() {
    return process.env.MCP_SERVER_URL || "";
  },
  get openaiModel() {
    return process.env.OPENAI_MODEL || "gpt-5.4-mini";
  },
  get dailyCap() {
    return int("AI_DAILY_CALL_CAP", 300);
  },
  get sessionCap() {
    return int("AI_SESSION_DAILY_CAP", 40);
  },
};
