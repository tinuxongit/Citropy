import type { SignInFlow } from "../../../shared/provider-settings.ts";
import type { ProviderLaunch } from "../types.ts";
import { idleClient, SIGN_IN_METHOD, startAgent, type Agent, type AuthorizationRequest } from "./acp.ts";
import { forwardCallback } from "./callback.ts";
import { modelOptions, saveModels } from "./models.ts";
import { antigravityProfile, hasSignIn } from "./profile.ts";

const SETTINGS = {
  flowTimeoutMs: 10 * 60_000,
};

interface Flow {
  state: SignInFlow;
  request?: AuthorizationRequest;
  agent?: Agent;
  timer: NodeJS.Timeout;
}

const flows = new Map<string, Flow>();

function key(launch: ProviderLaunch): string {
  return launch.instanceId ?? "";
}

function end(flow: Flow): void {
  clearTimeout(flow.timer);
  flow.agent?.stop();
}

function fail(launch: ProviderLaunch, flow: Flow, error: string): void {
  if (flows.get(key(launch)) !== flow) return;
  end(flow);
  flow.state = { status: "failed", error };
}

async function run(launch: ProviderLaunch, flow: Flow, onSignedIn: () => void): Promise<void> {
  const profile = antigravityProfile(launch.instanceId);
  const agent = await startAgent({
    instanceId: launch.instanceId,
    environment: launch.environment,
    cwd: profile.home,
    client: idleClient,
    onAuthorization: request => {
      if (flow.request || flows.get(key(launch)) !== flow) return;
      flow.request = request;
      flow.state = { status: "waiting", url: request.url };
    },
    onFailure: error => fail(launch, flow, error.message),
  });
  flow.agent = agent;
  if (flows.get(key(launch)) !== flow) return agent.stop();
  await agent.connection.authenticate({ methodId: SIGN_IN_METHOD });
  flow.state = { status: "verifying" };
  const session = await agent.connection.newSession({ cwd: profile.home, mcpServers: [] });
  await saveModels(profile, modelOptions(session.configOptions));
  if (!await hasSignIn(profile)) throw new Error("Antigravity finished signing in but did not save the sign-in.");
  if (flows.get(key(launch)) !== flow) return;
  end(flow);
  flows.delete(key(launch));
  onSignedIn();
}

export function signInFlow(launch: ProviderLaunch): SignInFlow | undefined {
  return flows.get(key(launch))?.state;
}

export function startSignIn(launch: ProviderLaunch, onSignedIn: () => void): SignInFlow {
  const previous = flows.get(key(launch));
  if (previous && previous.state.status !== "failed") return previous.state;
  const flow: Flow = {
    state: { status: "starting" },
    timer: setTimeout(() => fail(launch, flow, "Sign-in timed out. Start again."), SETTINGS.flowTimeoutMs),
  };
  flows.set(key(launch), flow);
  void run(launch, flow, onSignedIn).catch((error: Error) => fail(launch, flow, error.message));
  return flow.state;
}

export async function completeSignIn(launch: ProviderLaunch, address: string): Promise<void> {
  const flow = flows.get(key(launch));
  if (!flow?.request || flow.state.status !== "waiting") throw new Error("Start signing in to Antigravity first.");
  await forwardCallback(flow.request, address);
}

export function cancelSignIn(launch: ProviderLaunch): void {
  const flow = flows.get(key(launch));
  if (!flow) return;
  end(flow);
  flows.delete(key(launch));
}
