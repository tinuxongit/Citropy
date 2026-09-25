export default function (pi) {
  const url = process.env.CITROPY_PI_MCP_URL;
  const authorization = process.env.CITROPY_PI_MCP_AUTHORIZATION;
  const tools = JSON.parse(process.env.CITROPY_PI_TOOLS || "[]");
  if (!url || !authorization) return;

  for (const tool of tools) {
    pi.registerTool({
      name: tool.name,
      label: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
      async execute(_toolCallId, params, signal) {
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", authorization },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool.name, arguments: params } }),
          signal,
        });
        if (!response.ok) throw new Error(`Citropy tool request failed (${response.status})`);
        const message = await response.json();
        if (message.error) throw new Error(message.error.message || "Citropy tool request failed");
        if (message.result?.isError) throw new Error(message.result.content?.filter(part => part.type === "text").map(part => part.text).join("\n") || "Citropy tool failed");
        return { content: message.result.content, details: undefined };
      },
    });
  }
}
