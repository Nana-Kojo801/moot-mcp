// MCP client used by the Clerk's agent loop and by the web app's direct actions.
// It talks to the Moot MCP server over Streamable HTTP, exactly as an outside client would.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { env } from "../env";
import type { McpToolDef } from "../ai";

export interface McpTarget {
  /** Origin of this deployment, e.g. https://moot.example.com. Ignored when MCP_SERVER_URL is set. */
  origin: string;
  householdId: string;
  visitorId: string | null;
}

export interface MootMcpClient {
  listTools(): Promise<McpToolDef[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export function mcpUrl(origin: string): URL {
  return new URL(env.mcpServerUrl || `${origin}/api/mcp`);
}

export async function withMcpClient<T>(
  target: McpTarget,
  fn: (client: MootMcpClient) => Promise<T>,
): Promise<T> {
  const headers: Record<string, string> = { "x-moot-household": target.householdId };
  if (target.visitorId) headers["x-moot-visitor"] = target.visitorId;
  if (env.mcpApiKey) headers.authorization = `Bearer ${env.mcpApiKey}`;

  const transport = new StreamableHTTPClientTransport(mcpUrl(target.origin), { requestInit: { headers } });
  const client = new Client({ name: "moot-clerk", version: "0.1.0" });
  await client.connect(transport);
  try {
    return await fn({
      async listTools() {
        const { tools } = await client.listTools();
        return tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema as Record<string, unknown>,
        }));
      },
      async callTool(name, args) {
        try {
          const res = await client.callTool({ name, arguments: args });
          if (res.structuredContent && typeof res.structuredContent === "object") {
            return res.structuredContent as Record<string, unknown>;
          }
          const text = Array.isArray(res.content)
            ? res.content.map((c) => (c.type === "text" ? c.text : "")).join("")
            : "";
          try {
            return JSON.parse(text);
          } catch {
            return { ok: !res.isError, spoken: text };
          }
        } catch (err) {
          // Schema validation errors and unknown tools come back as protocol errors.
          const message = err instanceof Error ? err.message : String(err);
          return { ok: false, spoken: `The ${name} request was not valid: ${message.slice(0, 200)}` };
        }
      },
    });
  } finally {
    await client.close().catch(() => {});
  }
}
