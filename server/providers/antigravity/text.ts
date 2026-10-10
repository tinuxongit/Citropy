import type { ProviderLaunch } from "../types.ts";
import { idleClient, isSignInRequired, SIGN_IN_METHOD, SIGN_IN_REQUIRED, startAgent, type Agent } from "./acp.ts";
import { agentModel, modelSelector } from "./models.ts";
import { modeTarget } from "./modes.ts";
import { antigravityProfile, hasSignIn } from "./profile.ts";

export async function generateAntigravityText(cwd: string, model: string, effort: string | undefined, prompt: string, signal: AbortSignal, launch: ProviderLaunch): Promise<string> {
  if (!await hasSignIn(antigravityProfile(launch.instanceId))) throw new Error(SIGN_IN_REQUIRED);
  let output = "";
  let sessionId = "";
  let failure: Error | undefined;
  let agent: Agent | undefined;
  agent = await startAgent({
    instanceId: launch.instanceId,
    environment: launch.environment,
    cwd,
    client: {
      ...idleClient,
      sessionUpdate: async ({ sessionId: id, update }) => {
        if (id === sessionId && update.sessionUpdate === "agent_message_chunk" && update.content.type === "text") output += update.content.text;
      },
    },
    onAuthorization: () => { failure = new Error(SIGN_IN_REQUIRED); agent?.stop(); },
    onFailure: error => { failure = error; },
  });
  const abort = () => agent?.stop();
  signal.addEventListener("abort", abort, { once: true });
  try {
    const connection = agent.connection;
    await connection.authenticate({ methodId: SIGN_IN_METHOD });
    const session = await connection.newSession({ cwd, mcpServers: [] });
    sessionId = session.sessionId;
    const mode = modeTarget("plan", session.modes, session.configOptions);
    if (mode.kind === "option") await connection.setSessionConfigOption({ sessionId, configId: mode.configId, value: mode.value });
    else if (session.modes?.currentModeId !== mode.modeId) await connection.setSessionMode({ sessionId, modeId: mode.modeId });
    const value = agentModel(session.configOptions, model, effort);
    const selector = modelSelector(session.configOptions)!;
    if (selector.currentValue !== value) await connection.setSessionConfigOption({ sessionId, configId: selector.id, value });
    const response = await connection.prompt({ sessionId, prompt: [{ type: "text", text: prompt }] });
    if (response.stopReason !== "end_turn") throw new Error(`Antigravity stopped before finishing (${response.stopReason}).`);
    return output;
  } catch (error) {
    signal.throwIfAborted();
    throw failure ?? (isSignInRequired(error) ? new Error(SIGN_IN_REQUIRED) : error);
  } finally {
    signal.removeEventListener("abort", abort);
    agent.stop();
  }
}
