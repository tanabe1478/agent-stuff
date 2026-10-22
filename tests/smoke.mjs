import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Use the installed Pi SDK without copying host packages into this package.
process.env.PI_OFFLINE = "1";
const sdkUrl = import.meta.resolve(process.env.PI_SDK_MODULE || "@earendil-works/pi-coding-agent");
const sdk = await import(sdkUrl);
const { DefaultResourceLoader, SessionManager, SettingsManager } = sdk;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temp = await mkdtemp(join(tmpdir(), "agent-stuff-test-"));
const previousEnv = { agentDir: process.env.PI_CODING_AGENT_DIR, apiKey: process.env.OPENAI_API_KEY, todoPath: process.env.PI_TODO_PATH };
process.env.PI_CODING_AGENT_DIR = temp;
process.env.OPENAI_API_KEY = "smoke-test-only-not-a-real-key";
delete process.env.PI_TODO_PATH;

let extensions;
let ctx;
try {
  const loader = new DefaultResourceLoader({
    cwd: temp,
    agentDir: temp,
    settingsManager: SettingsManager.inMemory(),
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    additionalExtensionPaths: [root],
  });
  await loader.reload();
  const loaded = loader.getExtensions();
  assert.deepEqual(loaded.errors, []);
  extensions = loaded.extensions;
  assert.equal(extensions.length, 2);
  assert.deepEqual(loader.getPrompts().diagnostics, []);
  assert.deepEqual(loader.getPrompts().prompts.map(p => p.name), ["discuss"]);
  assert.deepEqual(loader.getSkills().skills, []);
  assert.deepEqual(loader.getThemes().themes, []);
  const discuss = loader.getPrompts().prompts[0];
  assert.match(discuss.content, /Do not implement!/);

  const sessionManager = SessionManager.inMemory(temp);
  sessionManager.appendMessage({ role: "user", content: "Main context: keep the blue design.", timestamp: Date.now() });
  const messages = [];
  const notifications = [];
  const requests = [];
  const model = {
    provider: "openai", id: "smoke-test", name: "Offline test", api: "openai-responses",
    baseUrl: "http://127.0.0.1:1", reasoning: false, input: ["text"],
    contextWindow: 128000, maxTokens: 4096,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
  Object.assign(loaded.runtime, {
    appendEntry: (type, data) => sessionManager.appendCustomEntry(type, data),
    sendMessage: (message, options) => messages.push({ message, options }),
    sendUserMessage: (message, options) => messages.push({ message, options }),
    getThinkingLevel: () => "off",
  });
  ctx = {
    cwd: temp, mode: "print", hasUI: false, model, sessionManager,
    isIdle: () => true, waitForIdle: async () => {},
    getSystemPrompt: () => "You are a test assistant.",
    ui: { notify: (message, level) => notifications.push({ message, level }) },
    modelRegistry: {
      getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "smoke-test-only" }),
      streamSimple: (_model, context) => {
        requests.push(context);
        const response = {
          role: "assistant", content: [{ type: "text", text: "Offline side answer." }],
          api: model.api, provider: model.provider, model: model.id, stopReason: "stop", timestamp: Date.now(),
          usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        };
        const stream = (async function* () {
          yield { type: "start", partial: response };
          yield { type: "done", reason: "stop", message: response };
        })();
        stream.result = async () => response;
        return stream;
      },
    },
  };
  const emit = async type => {
    for (const extension of extensions) {
      for (const handler of extension.handlers.get(type) || []) await handler({ type }, ctx);
    }
  };
  await emit("session_start");
  const todos = extensions.find(e => e.commands.has("todos"));
  const tool = todos.tools.get("todo").definition;
  const run = async params => {
    const result = await tool.execute("test", params, undefined, undefined, ctx);
    assert.equal(result.details?.error, undefined);
    return result;
  };
  const created = await run({ action: "create", title: "Test task", body: "Initial notes", tags: ["test"] });
  const id = created.details.todo.id;
  assert.equal((await run({ action: "get", id })).details.todo.body, "Initial notes\n");
  assert.equal((await run({ action: "claim", id })).details.todo.assigned_to_session, sessionManager.getSessionId());
  await run({ action: "append", id, body: "More notes" });
  assert.match((await run({ action: "get", id })).details.todo.body, /More notes/);
  await run({ action: "release", id });
  assert.equal((await run({ action: "get", id })).details.todo.assigned_to_session, undefined);
  await run({ action: "update", id, status: "closed" });
  assert.equal((await run({ action: "list" })).details.todos.length, 0);
  assert.equal((await run({ action: "list-all" })).details.todos.length, 1);
  const invalid = await tool.execute("invalid", { action: "get", id: "../secret" }, undefined, undefined, ctx);
  assert.match(invalid.details.error, /Invalid todo id/);
  ctx.mode = "rpc";
  ctx.hasUI = true;
  await todos.commands.get("todos").handler("", ctx);
  assert.equal(messages.at(-1).message.customType, "todo-list");
  assert.equal(messages.at(-1).options.triggerTurn, false);
  ctx.mode = "print";
  ctx.hasUI = false;
  await run({ action: "delete", id });
  assert.equal((await readdir(join(temp, ".pi", "todos"))).length, 0);

  // Keep the inherited, documented GC setting configurable.
  const oldTodo = { id: "deadbeef", title: "Old closed task", status: "closed", tags: [], created_at: "2020-01-01T00:00:00.000Z" };
  const oldPath = join(temp, ".pi", "todos", "deadbeef.md");
  await writeFile(oldPath, JSON.stringify(oldTodo));
  await writeFile(join(temp, ".pi", "todos", "settings.json"), JSON.stringify({ gc: false }));
  await emit("session_start");
  assert.ok(await readFile(oldPath));
  await writeFile(join(temp, ".pi", "todos", "settings.json"), JSON.stringify({ gc: true, gcDays: 7 }));
  await emit("session_start");
  await assert.rejects(readFile(oldPath), { code: "ENOENT" });

  const btw = extensions.find(e => e.commands.has("btw"));
  ctx.mode = "rpc";
  ctx.hasUI = true;
  await btw.commands.get("btw").handler("What should we keep?", ctx);
  assert.equal(notifications.filter(n => n.level === "error").length, 0, JSON.stringify(notifications));
  assert.equal(requests.length, 1);
  assert.match(JSON.stringify(requests[0]), /keep the blue design/);
  assert.ok(sessionManager.getBranch().some(e => e.customType === "btw-thread-entry"));
  await emit("session_tree");
  await btw.commands.get("btw").handler("And why?", ctx);
  assert.equal(requests.length, 2);
  assert.match(JSON.stringify(requests[1]), /What should we keep/);
  assert.match(JSON.stringify(requests[1]), /Offline side answer/);

  // Exercise the overlay with real Pi components but no real terminal or model call.
  ctx.mode = "tui";
  ctx.hasUI = true;
  let component;
  let finished = 0;
  ctx.ui.select = async () => "Start fresh";
  ctx.ui.custom = (factory, options) => new Promise((resolve, reject) => {
    const handle = {
      focus() {}, isFocused: () => true, setHidden() {},
      hide() { throw new Error("Custom overlays must close via done(), not hide()."); },
    };
    const theme = { fg: (_color, text) => text, bg: (_color, text) => text, bold: text => text };
    const tui = { requestRender() {}, terminal: { rows: 30 } };
    const keybindings = { matches: (data, action) => data === "\u001b" && action === "tui.select.cancel" };
    Promise.resolve(factory(tui, theme, keybindings, () => { finished++; resolve(); }))
      .then(value => { component = value; options.onHandle(handle); })
      .catch(reject);
  });
  await btw.commands.get("btw").handler("", ctx);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.ok(component);
  const { visibleWidth } = await import(createRequire(sdkUrl).resolve("@earendil-works/pi-tui"));
  for (const width of [20, 40, 80, 120]) {
    assert.ok(component.render(width).every(line => visibleWidth(line) <= width), `overlay overflow at ${width} columns`);
  }
  component.handleInput("\u001b");
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(finished, 1);
  await emit("session_shutdown");
  assert.equal(finished, 1);
  console.log("PASS: package discovery, discuss, todo lifecycle/GC/RPC, BTW context/restore, and overlay close/width.");
} finally {
  if (extensions && ctx) {
    for (const extension of extensions) {
      for (const handler of extension.handlers.get("session_shutdown") || []) await handler({ type: "session_shutdown" }, ctx);
    }
  }
  for (const [key, value] of [["PI_CODING_AGENT_DIR", previousEnv.agentDir], ["OPENAI_API_KEY", previousEnv.apiKey], ["PI_TODO_PATH", previousEnv.todoPath]]) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  await rm(temp, { recursive: true, force: true });
}
