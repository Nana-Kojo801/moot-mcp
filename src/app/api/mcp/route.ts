// MCP endpoint: Streamable HTTP, stateless (a fresh server and transport per request).
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMootServer } from "@/lib/mcp/server";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function jsonRpcError(status: number, message: string) {
  return Response.json({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }, { status });
}

function authorized(req: Request): boolean {
  const key = env.mcpApiKey;
  if (!key) return true;
  return req.headers.get("authorization") === `Bearer ${key}`;
}

export async function POST(req: Request) {
  if (!authorized(req)) return jsonRpcError(401, "Unauthorized: send Authorization: Bearer <MCP_API_KEY>.");
  const householdId = req.headers.get("x-moot-household")?.slice(0, 80) || null;
  const visitor = req.headers.get("x-moot-visitor")?.slice(0, 80) || null;
  const server = createMootServer({
    householdId,
    scope: visitor ? `visitor:${visitor}` : householdId ? `household:${householdId}` : null,
  });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    return await transport.handleRequest(req);
  } finally {
    // Stateless: nothing outlives the request.
    void server.close();
  }
}

export async function GET() {
  return jsonRpcError(405, "Method not allowed. This MCP server is stateless; use POST.");
}

export async function DELETE() {
  return jsonRpcError(405, "Method not allowed. This MCP server is stateless; there is no session to delete.");
}
