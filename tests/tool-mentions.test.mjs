import "./fixtures/isolated-data.mjs";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";

const { store } = await import("../server/store.ts");
const { attachDesktop } = await import("../server/desktop.ts");
const { listToolMentions, mentionedTools, withToolMentions } = await import("../server/tool-mentions.ts");
const { toolTag } = await import("../shared/mention-tags.ts");
const { connectionMention } = await import("../shared/connection-sites.mjs");
const { handleFeatures } = await import("../server/features.ts");

const hinted = async (prompt, text, skills) => withToolMentions(prompt, await mentionedTools(text, skills));

function fakeDesktop(t, connections) {
  const socket = new EventEmitter();
  socket.OPEN = 1;
  socket.readyState = 1;
  socket.close = () => socket.emit("close");
  socket.send = (raw) => {
    const request = JSON.parse(raw);
    queueMicrotask(() => socket.emit("message", JSON.stringify({ id: request.id, result: connections })));
  };
  attachDesktop(socket);
  t.after(() => socket.close());
}

test("Mentioning a Citropy tool adds its hint before the message", async () => {
  const prompt = await hinted("Check the page with @browser and @visual", "Check the page with @browser and @visual", []);
  const [browser, visual, gap, request] = prompt.split("\n");
  assert.match(browser, /category":"browser"/);
  assert.match(visual, /workspace_visual/);
  assert.deepEqual([gap, request], ["", "Check the page with @browser and @visual"]);
});

test("The server answers the mention list request", async () => {
  let status, value;
  const res = { writeHead(code) { status = code; return this; }, end(body) { value = JSON.parse(body); } };
  assert.equal(await handleFeatures({ method: "GET", url: "/api/tool-mentions", headers: { host: "localhost:4000" } }, res, []), true);
  assert.equal(status, 200);
  assert.equal(value[0].name, "browser");
});

test("Plain text, email addresses and same-named skills add no tool hint", async () => {
  assert.equal(await hinted("Email me@browser.dev", "Email me@browser.dev", []), "Email me@browser.dev");
  assert.equal(await hinted("Use @browser", "Use @browser", [{ name: "browser" }]), "Use @browser");
});

test("Provider commands keep their slash first and get the hint after", async () => {
  assert.match(await hinted("/review @terminal", "/review @terminal", []), /^\/review @terminal\n\nRun the commands/);
});

test("Turned-off features are not offered or hinted", async () => {
  store.projectDefaults = { visualReplies: false, browserAccess: false };
  try {
    const names = (await listToolMentions()).map((mention) => mention.name);
    assert.equal(names.includes("visual"), false);
    assert.equal(names.includes("browser"), false);
    assert.equal(await hinted("Use @visual", "Use @visual", []), "Use @visual");
  } finally {
    store.projectDefaults = {};
  }
  assert.deepEqual((await listToolMentions()).map((mention) => mention.name), ["browser", "terminal", "subagents", "visual", "image"]);
});

test("Connection names become mentions", () => {
  assert.equal(connectionMention({ name: "My Bank", site: "bank.example" }), "my-bank");
  assert.equal(connectionMention({ name: "Почта", site: "mail.ru" }), "mail.ru");
});

test("Mentioning a connection opens it with the user's sign-in, or asks them to sign in", async (t) => {
  fakeDesktop(t, [
    { id: "g", name: "Gmail", url: "https://mail.google.com/", site: "mail.google.com", signedIn: true },
    { id: "b", name: "My Bank", url: "https://bank.example/", site: "bank.example", signedIn: false },
    { id: "x", name: "Browser", url: "https://browser.example/", site: "browser.example", signedIn: true },
  ]);
  const mentions = await listToolMentions();
  assert.deepEqual(mentions.filter((mention) => mention.section === "Connections"), [
    { name: "gmail", title: "Gmail", description: "mail.google.com", section: "Connections", url: "https://mail.google.com/" },
    { name: "my-bank", title: "My Bank", description: "bank.example, not signed in yet", section: "Connections", url: "https://bank.example/" },
  ]);
  const [gmail, bank] = (await hinted("Summarize @gmail and pay @my-bank", "Summarize @gmail and pay @my-bank", [])).split("\n");
  assert.match(gmail, /"url":"https:\/\/mail\.google\.com\/"/);
  assert.match(gmail, /open with their sign-in/);
  assert.match(bank, /not finished signing in to bank\.example.*ask_user/);
  assert.deepEqual((await mentionedTools("Summarize @gmail with @terminal", [])).map(toolTag), [
    { name: "terminal", title: "Terminal", icon: "citropy" },
    { name: "gmail", title: "Gmail", icon: "site", url: "https://mail.google.com/" },
  ]);
  store.projectDefaults = { browserAccess: false };
  try {
    assert.equal((await listToolMentions()).some((mention) => mention.section === "Connections"), false);
  } finally {
    store.projectDefaults = {};
  }
});
