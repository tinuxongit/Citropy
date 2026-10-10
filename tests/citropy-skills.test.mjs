import "./fixtures/isolated-data.mjs";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const home = mkdtempSync(join(tmpdir(), "citropy-skills-home-"));
process.env.HOME = home;
process.env.CODEX_HOME = join(home, ".codex");
process.env.CLAUDE_CONFIG_DIR = join(home, ".claude");
process.env.XDG_CONFIG_HOME = join(home, ".config");
after(() => rmSync(home, { recursive: true, force: true }));

const { listSkills, changeSkill, citropySkills } = await import("../server/skills.ts");
const { readCitropySkill, saveCitropySkill } = await import("../server/citropy-skills.ts");
const { mcpInstructions } = await import("../server/mcp-instructions.ts");

const citropyEntries = async () => (await listSkills()).filter((skill) => skill.scope === "citropy");

test("Citropy skills are saved once and offered to every provider", async () => {
  const draft = { name: "release-notes", description: 'Use when asked for "release notes": one line each', instructions: "# Steps\n\nList user-facing changes." };
  await saveCitropySkill(undefined, draft);
  const entries = await citropyEntries();
  assert.deepEqual(entries.map((skill) => skill.provider).sort(), ["claude", "codex", "opencode"]);
  assert.equal(new Set(entries.map((skill) => skill.path)).size, 1);
  assert.equal(entries[0].description, draft.description);
  assert.deepEqual(await readCitropySkill(entries[0].id), draft);

  await assert.rejects(saveCitropySkill(undefined, draft), /already exists/);
  await assert.rejects(saveCitropySkill(undefined, { ...draft, name: "Release Notes" }), /lowercase letters/);
  await assert.rejects(saveCitropySkill(undefined, { ...draft, name: "other", description: "two\nlines" }), /one line/);

  await saveCitropySkill(entries[0].id, { ...draft, name: "changelog" });
  const renamed = await citropyEntries();
  assert.deepEqual([...new Set(renamed.map((skill) => skill.name))], ["changelog"]);

  const instructions = mcpInstructions(undefined, await citropySkills("codex"));
  assert.match(instructions, /Citropy skills.*\n- changelog: Use when asked for "release notes": one line each \(.+SKILL\.md\)/s);
  assert.doesNotMatch(mcpInstructions(undefined, []), /Citropy skills/);

  await changeSkill(undefined, renamed[0].id, "disable");
  assert.deepEqual((await citropySkills("claude")).map((skill) => skill.enabled), [false]);
  await saveCitropySkill(renamed[0].id, { ...draft, name: "changelog", instructions: "Edited." });
  assert.equal((await readCitropySkill(renamed[0].id)).instructions, "Edited.");
  assert.deepEqual((await citropySkills("claude")).map((skill) => skill.enabled), [false]);
});
