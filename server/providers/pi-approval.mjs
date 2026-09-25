export default function (pi) {
  pi.on("tool_call", async (event, ctx) => {
    const mode = process.env.CITROPY_PI_PERMISSION_MODE || "manual";
    if (mode === "bypass" || event.toolName === "read" || ["ask_user", "tool_help", "run_tool"].includes(event.toolName)) return;
    if (mode === "plan") return { block: true, reason: "Tools that change files or run commands are disabled in plan mode." };
    if (mode === "acceptEdits" && (event.toolName === "edit" || event.toolName === "write")) return;
    const allowed = await ctx.ui.confirm(event.toolName, JSON.stringify(event.input));
    if (!allowed) return { block: true, reason: "Permission denied." };
  });
}
