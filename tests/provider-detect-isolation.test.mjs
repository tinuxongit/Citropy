import "./fixtures/isolated-data.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { providers } from "../server/providers/index.ts";
import { providerInfo, refreshProvidersNow } from "../server/providers/provider-registry.ts";

test("one provider failing to detect or check sign-in leaves the others listed", async (t) => {
  for (const provider of Object.values(providers)) {
    t.mock.method(provider, "detect", async () => ({ available: true, version: "1.0" }));
    t.mock.method(provider, "listModels", async () => [{ id: "model", label: "Model" }]);
  }
  t.mock.method(providers.antigravity, "detect", async () => {
    throw new SyntaxError("Unexpected end of JSON input");
  });
  if (providers.antigravity.signIn.kind === "app")
    t.mock.method(providers.antigravity.signIn, "status", async () => {
      throw new Error("status file unreadable");
    });
  await refreshProvidersNow();
  const listed = providerInfo();
  assert.equal(listed.length, Object.keys(providers).length);
  assert.equal(listed.find((entry) => entry.id === "antigravity")?.available, false);
  assert.equal(listed.find((entry) => entry.id === "claude")?.available, true);
});
