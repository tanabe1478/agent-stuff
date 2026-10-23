import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Real Pi extension loading and TUI components, but no network/model API calls.
process.env.PI_OFFLINE = "1";
const sdkUrl = import.meta.resolve(process.env.PI_SDK_MODULE || "@earendil-works/pi-coding-agent");
const { DefaultResourceLoader, SessionManager, SettingsManager, initTheme } = await import(sdkUrl);
initTheme("dark", false);
const { visibleWidth } = await import(createRequire(sdkUrl).resolve("@earendil-works/pi-tui"));
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temp = await mkdtemp(join(tmpdir(), "agent-stuff-imports-"));
const savedEnv = Object.fromEntries(["PI_CODING_AGENT_DIR", "EDITOR", "VISUAL", "PI_TODO_PATH"].map(key => [key, process.env[key]]));
process.env.PI_CODING_AGENT_DIR = temp;
delete process.env.PI_TODO_PATH;
let extensions = [];
let ctx;
try {
  const git = (...args) => execFileSync("git", args, { cwd: temp, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  git("init", "-b", "main");
  await writeFile(join(temp, "initial.txt"), "original\n");
  git("add", "initial.txt");
  git("-c", "user.name=Smoke Test", "-c", "user.email=smoke@example.invalid", "commit", "-m", "fixture");
  git("mv", "initial.txt", "renamed.txt");

  const loader = new DefaultResourceLoader({
    cwd: temp, agentDir: temp, settingsManager: SettingsManager.inMemory(),
    noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    additionalExtensionPaths: [root],
  });
  await loader.reload();
  const loaded = loader.getExtensions();
  assert.deepEqual(loaded.errors, []);
  extensions = loaded.extensions;
  const commands = new Map(extensions.flatMap(e => [...e.commands]));
  const tools = new Map(extensions.flatMap(e => [...e.tools].map(([name, value]) => [name, value.definition])));
  const sessionManager = SessionManager.inMemory(temp);
  sessionManager.appendMessage({ role: "user", content: "Main task context", timestamp: Date.now() });
  const messages = [];
  const notices = [];
  const navigations = [];
  const statuses = new Map();
  let editorText = "";
  let pending = false;
  let idle = true;
  let onUserMessage;
  const model = {
    provider: "openai", id: "offline-model", name: "Offline fixture", api: "openai-responses",
    baseUrl: "http://127.0.0.1:1", reasoning: false, input: ["text"], contextWindow: 128000, maxTokens: 4096,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
  const assistant = (text, stopReason = "stop", usage = {}) => ({
    role: "assistant", content: [{ type: "text", text }], api: model.api,
    provider: model.provider, model: model.id, stopReason, timestamp: Date.now(),
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }, ...usage },
  });
  const theme = { fg: (_color, text) => text, bg: (_color, text) => text, bold: text => text };
  const tui = { requestRender() {}, stop() {}, start() {}, terminal: { rows: 40, columns: 120 } };
  const keybindings = { matches: (data, action) => ({
    "tui.select.up": "\u001b[A", "tui.select.down": "\u001b[B", "tui.select.confirm": "\r", "tui.select.cancel": "\u001b",
  })[action] === data };
  Object.assign(loaded.runtime, {
    appendEntry: (type, data) => sessionManager.appendCustomEntry(type, data),
    sendMessage: (message, options) => messages.push({ message, options }),
    sendUserMessage: (message, options) => {
      messages.push({ message, options });
      onUserMessage?.(message);
    },
    getThinkingLevel: () => "off",
  });
  ctx = {
    cwd: temp, mode: "print", hasUI: false, model, sessionManager,
    isIdle: () => idle, hasPendingMessages: () => pending, waitForIdle: async () => {},
    ui: {
      theme, notify: (message, level) => notices.push({ message, level }),
      setStatus: (key, value) => statuses.set(key, value), setWidget() {},
      getEditorText: () => editorText, setEditorText: value => { editorText = value; },
      select: async () => { throw new Error("Unexpected select dialog"); },
      custom: async () => { throw new Error("Unexpected terminal UI"); },
    },
    modelRegistry: {
      find: () => undefined,
      getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "offline-only" }),
      complete: async () => { throw new Error("Unexpected extraction request"); },
    },
    navigateTree: async (id, options) => {
      navigations.push({ id, options });
      sessionManager.branch(id);
      await emit("session_tree");
      return { cancelled: false };
    },
  };
  const emit = async (type, event = {}) => {
    for (const extension of extensions) {
      for (const handler of extension.handlers.get(type) || []) await handler({ type, ...event }, ctx);
    }
  };
  const command = (name, args = "") => commands.get(name).handler(args, ctx);
  const tool = (name, args = {}) => tools.get(name).execute("fixture", args, undefined, undefined, ctx);
  const goal = async () => (await tool("get_goal")).details.goal;
  const continuationCount = () => messages.filter(m => m.message?.customType === "goal-continuation").length;
  const setDrivers = drivers => {
    const queue = [...drivers];
    ctx.ui.custom = factory => new Promise((resolve, reject) => {
      let component;
      const timer = setTimeout(() => reject(new Error("Custom UI did not finish")), 3000);
      const done = value => { clearTimeout(timer); component?.dispose?.(); resolve(value); };
      try {
        assert.ok(queue.length, "Unexpected custom UI");
        const driver = queue.shift();
        component = factory(tui, theme, keybindings, done);
        Promise.resolve(driver?.(component)).catch(error => { clearTimeout(timer); component?.dispose?.(); reject(error); });
      } catch (error) {
        clearTimeout(timer);
        component?.dispose?.();
        reject(error);
      }
    });
    return () => assert.equal(queue.length, 0, "Not all custom UI steps were exercised");
  };
  const choose = index => component => {
    for (let i = 0; i < index; i++) component.handleInput("\u001b[B");
    component.handleInput("\r");
  };
  const selectFile = component => {
    component.handleInput("renamed.txt");
    component.handleInput("\r");
  };
  const cancel = component => component.handleInput("\u001b");

  await emit("session_start");
  // RPC has hasUI=true but cannot host custom terminal components.
  for (const mode of ["print", "rpc"]) {
    ctx.mode = mode;
    ctx.hasUI = mode === "rpc";
    for (const name of ["answer", "review", "end-review", "files"]) {
      await command(name);
      assert.match(notices.at(-1).message, /interactive terminal mode/);
    }
  }

  // Goal persistence, continuation gating, token accounting, and stop conditions.
  ctx.mode = "print";
  ctx.hasUI = false;
  assert.equal(await goal(), null);
  await assert.rejects(tool("create_goal", { objective: "", token_budget: 5 }), /must not be empty/);
  await assert.rejects(tool("create_goal", { objective: "task", token_budget: -1 }), /positive integers/);
  await tool("create_goal", { objective: "Check <budget> & stop", token_budget: 5 });
  await assert.rejects(tool("create_goal", { objective: "replacement" }), /unfinished goal/);
  const goalExtension = extensions.find(e => e.commands.has("goal"));
  const injected = await goalExtension.handlers.get("before_agent_start")[0]({ systemPrompt: "Base prompt" }, ctx);
  assert.match(injected.systemPrompt, /Check &lt;budget&gt; &amp; stop/);
  await emit("agent_start");
  await emit("agent_end", { messages: [assistant("progress", "stop", { input: 4, cacheRead: 1, output: 2 })] });
  assert.equal((await goal()).tokensUsed, 5);
  assert.equal((await goal()).status, "budgetLimited");
  assert.equal(continuationCount(), 0);
  await emit("session_tree");
  assert.equal((await goal()).status, "budgetLimited");
  await command("goal", "clear");
  await command("goal", "Finish the fixture");
  assert.equal(continuationCount(), 1);
  assert.equal(messages.at(-1).options.triggerTurn, true);
  await command("goal", "pause");
  assert.equal((await goal()).status, "paused");
  const filtered = await goalExtension.handlers.get("context")[0]({ messages: messages.map(m => m.message) }, ctx);
  assert.ok(!filtered.messages.some(m => m?.customType === "goal-continuation"));
  idle = false;
  await command("goal", "resume");
  assert.equal(messages.at(-1).options.deliverAs, "followUp");
  idle = true;
  const beforePending = continuationCount();
  pending = true;
  await emit("agent_start");
  await emit("agent_end", { messages: [assistant("progress")] });
  assert.equal(continuationCount(), beforePending);
  pending = false;
  await emit("agent_start");
  await emit("agent_end", { messages: [assistant("progress")] });
  assert.equal(continuationCount(), beforePending + 1);
  await tool("update_goal", { status: "complete" });
  assert.equal((await goal()).status, "complete");
  await assert.rejects(tool("update_goal", { status: "paused" }), /only mark/);
  for (const [stopReason, errorMessage, expected] of [
    ["aborted", undefined, "paused"], ["error", "quota limit", "usageLimited"], ["error", "Connection error", "blocked"],
  ]) {
    await command("goal", "clear");
    await tool("create_goal", { objective: "Stop safely" });
    await emit("agent_start");
    await emit("agent_end", { messages: [{ ...assistant("", stopReason), errorMessage }] });
    assert.equal((await goal()).status, expected);
  }
  await command("goal", "clear");

  // Real Q&A component: extraction via the host registry, focus, widths, navigation, submit/cancel.
  ctx.mode = "tui";
  ctx.hasUI = true;
  sessionManager.appendMessage(assistant("Which database? Which language?"));
  let extractionCalls = 0;
  let extractionText = JSON.stringify({ questions: [
    { question: "Which database?", context: "日本語の補足 ".repeat(20) }, { question: "Which language?" },
  ] });
  ctx.modelRegistry.complete = async (selectedModel, context, options) => {
    extractionCalls++;
    assert.equal(selectedModel, model);
    assert.match(JSON.stringify(context.messages), /Which database/);
    assert.ok(options.signal instanceof AbortSignal);
    return assistant(extractionText);
  };
  let checkDrivers = setDrivers([
    undefined,
    component => {
      component.focused = true;
      assert.equal(component.focused, true);
      for (const width of [1, 8, 20, 40, 80, 160]) {
        assert.ok(component.render(width).every(line => visibleWidth(line) <= width), `answer overflow at ${width}`);
      }
      component.handleInput("SQLite");
      component.handleInput("\r");
      component.handleInput("TypeScript");
      component.handleInput("\r");
      component.handleInput("\r");
    },
  ]);
  await command("answer");
  checkDrivers();
  assert.equal(extractionCalls, 1);
  assert.equal(messages.at(-1).message.customType, "answers");
  assert.match(messages.at(-1).message.content, /A: SQLite/);
  assert.match(messages.at(-1).message.content, /A: TypeScript/);
  assert.equal(messages.at(-1).options.triggerTurn, true);
  checkDrivers = setDrivers([undefined, cancel]);
  const beforeCancel = messages.length;
  await command("answer");
  checkDrivers();
  assert.equal(messages.length, beforeCancel);
  extractionText = "not valid JSON";
  checkDrivers = setDrivers([undefined]);
  await command("answer");
  checkDrivers();
  assert.match(notices.at(-1).message, /invalid JSON/);

  // Review prompt assembly, branching, restore, end-review, and optional loop fixing.
  await writeFile(join(temp, "REVIEW_GUIDELINES.md"), "Fixture project review rule.");
  ctx.ui.select = async title => {
    if (title === "Start review in:") return "Empty branch";
    if (title === "Finish review:") return "Return and summarize";
    throw new Error(`Unexpected dialog: ${title}`);
  };
  await command("review", 'folder src docs --extra "Check race conditions"');
  assert.match(messages.at(-1).message, /snapshot review/);
  assert.match(messages.at(-1).message, /Check race conditions/);
  assert.match(messages.at(-1).message, /Fixture project review rule/);
  assert.equal(navigations.at(-1).options.label, "code-review");
  const reviewOrigin = sessionManager.getBranch().findLast(e => e.customType === "review-session" && e.data.active).data.originId;
  await emit("session_tree");
  await command("review", "uncommitted");
  assert.match(notices.at(-1).message, /Already in a review/);
  checkDrivers = setDrivers([undefined]);
  await command("end-review");
  checkDrivers();
  assert.equal(navigations.at(-1).id, reviewOrigin);
  assert.equal(navigations.at(-1).options.summarize, true);
  assert.match(navigations.at(-1).options.customInstructions, /Fix Queue/);
  assert.equal(editorText, "Act on the review findings");

  ctx.ui.select = async title => title === "Start review in:" ? "Current session" : undefined;
  await command("review", "uncommitted");
  assert.match(messages.at(-1).message, /staged, unstaged, and untracked/);
  await command("review", '--extra');
  assert.match(notices.at(-1).message, /Missing value/);
  checkDrivers = setDrivers([cancel]);
  await command("review", "pr 123"); // Dirty tracked rename prevents any gh/network call.
  checkDrivers();
  assert.ok(notices.some(n => /Cannot checkout PR/.test(n.message)));

  // Enable Loop Fixing in the selector, then simulate a P1 review, fix, and clean review.
  checkDrivers = setDrivers([choose(6), choose(0), undefined, undefined]);
  let loopTurns = 0;
  onUserMessage = text => {
    loopTurns++;
    sessionManager.appendMessage(assistant(text.startsWith("Use the latest review summary")
      ? "Fixed and tested."
      : loopTurns === 1 ? "## Findings\n- [P1] Fixture bug\n## Verdict\nneeds attention" : "## Findings\nNo issues.\n## Verdict\ncorrect"));
  };
  await command("review");
  checkDrivers();
  assert.equal(loopTurns, 3);
  assert.ok(notices.some(n => /Loop fixing complete/.test(n.message)));
  onUserMessage = undefined;
  sessionManager.appendCustomEntry("review-settings", { loopFixingEnabled: false });
  await emit("session_tree");

  // File picker retains the destination/status of a rename and supports prompt mentions.
  checkDrivers = setDrivers([
    component => {
      const lines = component.render(120).join("\n");
      assert.match(lines, /renamed\.txt \[R\]/);
      assert.doesNotMatch(lines, /initial\.txt/);
      selectFile(component);
    }, choose(3), cancel,
  ]);
  await command("files");
  checkDrivers();
  assert.match(editorText, /@renamed\.txt/);

  // Exercise the external-editor path without launching a GUI, preserving final newlines.
  const editorScript = join(temp, "fixture-editor.mjs");
  await writeFile(editorScript, 'import { writeFileSync } from "node:fs"; writeFileSync(process.argv[2], "edited\\n");');
  delete process.env.VISUAL;
  process.env.EDITOR = `${process.execPath} ${editorScript}`;
  checkDrivers = setDrivers([selectFile, choose(4), undefined, cancel]);
  await command("files");
  checkDrivers();
  assert.equal(await readFile(join(temp, "renamed.txt"), "utf8"), "edited\n");

  console.log("PASS: answer extraction/UI, goal lifecycle/budgets, review branching/loop fixing, files rename/edit, and RPC guards.");
} finally {
  if (ctx) {
    for (const extension of extensions) {
      for (const handler of extension.handlers.get("session_shutdown") || []) await handler({ type: "session_shutdown" }, ctx);
    }
  }
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  await rm(temp, { recursive: true, force: true });
}
