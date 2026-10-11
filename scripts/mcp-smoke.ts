// Talks to a Moot MCP server the way any MCP client would: initialize, tools/list, then one tool call.
// Usage: npm run mcp:smoke -- <base-url> <household-id> [tool] [json-args]
// Example: npm run mcp:smoke -- https://your-app.vercel.app hh_abc123 check_rule '{"member":"Leo","question":"Can I wear shoes inside?"}'
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

async function main() {
  const [base = "http://localhost:3000", household, tool = "get_household", rawArgs = "{}"] = process.argv.slice(2);
  if (!household) {
    console.error("Pass the household id (shown on the Household screen) as the second argument.");
    process.exit(1);
  }
  const headers: Record<string, string> = { "x-moot-household": household };
  if (process.env.MCP_API_KEY) headers.authorization = `Bearer ${process.env.MCP_API_KEY}`;
  const url = new URL(base.replace(/\/$/, "") + "/api/mcp");
  const transport = new StreamableHTTPClientTransport(url, { requestInit: { headers } });
  const client = new Client({ name: "moot-smoke", version: "0.1.0" });
  await client.connect(transport);
  console.log(`Connected to ${url.href}`);
  console.log(`Server: ${client.getServerVersion()?.name} ${client.getServerVersion()?.version}`);
  console.log(`Protocol version: ${transport.protocolVersion}`);
  const { tools } = await client.listTools();
  console.log(`\ntools/list (${tools.length}):`);
  for (const t of tools) console.log(`  ${t.name.padEnd(22)} ${t.title ?? ""}`);
  console.log(`\ntools/call ${tool} ${rawArgs}`);
  const res = await client.callTool({ name: tool, arguments: JSON.parse(rawArgs) });
  console.log(JSON.stringify(res.structuredContent ?? res.content, null, 2));
  await client.close();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
