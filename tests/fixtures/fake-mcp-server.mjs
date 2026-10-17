import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const notes = [];
const server = new Server(
  { name: "fake-notes", version: "1.0.0" },
  { capabilities: { tools: {} }, instructions: "Keep notes short." },
);
server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: [
    {
      name: "read_notes",
      description: "Reads every note",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
    },
    {
      name: "add_note",
      description: "Adds a note",
      inputSchema: { type: "object", properties: { text: { type: "string" } } },
    },
  ],
}));
server.setRequestHandler(CallToolRequestSchema, ({ params }) => {
  if (params.name === "add_note") notes.push(String(params.arguments?.text));
  return { content: [{ type: "text", text: `${process.env.FAKE_PREFIX}${notes.join(",")}` }] };
});
await server.connect(new StdioServerTransport());
