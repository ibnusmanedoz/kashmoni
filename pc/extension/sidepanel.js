// Kash Moni AI - side panel UI: chats, settings, rendering.
import { renderMarkdown, escapeHtml } from "./js/markdown.js";
import { runAgent, fixDangling } from "./js/agent.js";
import { BROWSER_TOOLS, WEB_TOOLS, WORKSPACE_TOOLS, runTool, uploadToWorkspace } from "./js/tools.js";

const PLATFORM = {
  name: "extension",
  intro: `You run as a browser extension (side panel) in the user's Brave browser on their computer (${navigator.platform || "Linux"}).`,
  browserWhat: "the user's real Brave tabs",
  workspaceWhere: "on the user's computer (served by kashmoni_helper.py)",
  toolList: (helperOk) => [...BROWSER_TOOLS, ...WEB_TOOLS, ...(helperOk ? WORKSPACE_TOOLS : [])],
  runTool,
};

const $ = (id) => document.getElementById(id);
const DEFAULTS = {
  apiKey: "",
  model: "deepseek/deepseek-v4.1-flash",
  strongModel: "",
  reasoning: "default",
  helperUrl: "http://127.0.0.1:8765",
  helperToken: "",
  confirmMode: "risky",
  maxSteps: 40,
  customInstructions: "",
  connections: [],
  memories: [],
  memoryOn: true,
  imageModel: "google/gemini-3.1-flash-image",
  fallbackModel: "deepseek/deepseek-v4-pro",
  compactAt: 60000,
  dailyBudget: 0,
  monthlyBudget: 0,
  taskWarn: 0.5,
  searchProvider: "duckduckgo",
  searchKey: "",
  speakReplies: false,
  updateRepo: "ibnusmanedoz/kashmoni-android",
  projects: [],
  activeProject: "",
  usage: { days: {} },
};

let settings = { ...DEFAULTS };
let chats = {};          // id -> chat
let current = null;      // chat id
let running = null;      // AbortController
let helperOk = false;
let draft = null;          // the answer being streamed right now
let pendingFiles = [];     // attachments waiting to be sent
const openSteps = new Set();

// ------------------------------------------------------------------ storage
async function load() {
  const s = await chrome.storage.local.get(["km_settings", "km_chats", "km_current"]);
  settings = { ...DEFAULTS, ...(s.km_settings || {}) };
  chats = s.km_chats || {};
  current = s.km_current && chats[s.km_current] ? s.km_current : null;
}
let saveTimer = null;
function saveChats() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => chrome.storage.local.set({ km_chats: chats, km_current: current }), 250);
}
function chat() {
  if (!current || !chats[current]) {
    const id = "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    chats[id] = { id, title: "New chat", created: Date.now(), updated: Date.now(), messages: [], cost: 0, tokens: 0, project: settings.activeProject || "" };
    current = id;
  }
  return chats[current];
}

// ------------------------------------------------------------------ helper status
async function checkHelper() {
  const chip = $("chip-helper");
  if (!settings.helperUrl || !settings.helperToken) {
    helperOk = false; chip.className = "chip ghost off"; chip.textContent = "○ Workspace off"; chip.title = "Set up the helper in Settings to build apps";
    return;
  }
  try {
    const r = await fetch(settings.helperUrl.replace(/\/$/, "") + "/info", {
      method: "POST", headers: { "X-KashMoni-Token": settings.helperToken, "Content-Type": "application/json" }, body: "{}",
      signal: AbortSignal.timeout(2500),
    });
    const j = await r.json();
    helperOk = !!j.ok;
    chip.title = helperOk ? `Workspace: ${j.workspace}` : (j.error || "Helper error");
  } catch {
    helperOk = false; chip.title = "Helper not running. Start kashmoni_helper.py";
  }
  chip.className = "chip ghost " + (helperOk ? "on" : "off");
  chip.textContent = helperOk ? "● Workspace" : "○ Workspace off";
}

// ------------------------------------------------------------------ rendering
const host = (u) => { try { return new URL(u).host || u; } catch { return String(u || "").slice(0, 40); } };
const cut = (t, n = 40) => { t = String(t ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };

// Friendly, human labels for each step (like "Reading the page").
function stepLabel(name, a = {}) {
  switch (name) {
    case "read_page": return "Reading the page";
    case "open_url": return `Opening ${host(a.url)}`;
    case "click": return "Clicking on the page";
    case "type_text": return `Typing "${cut(a.text, 30)}"`;
    case "select_option": return `Choosing "${cut(a.option, 30)}"`;
    case "press_key": return `Pressing ${a.key}`;
    case "scroll": return "Scrolling";
    case "screenshot": return "Taking a screenshot";
    case "run_js": return "Running code in the page";
    case "console_logs": return "Checking console errors";
    case "network_log": return "Checking network requests";
    case "get_response_body": return "Reading a server response";
    case "reload_tab": return "Reloading the page";
    case "go_back": return "Going back";
    case "close_tab": return "Closing a tab";
    case "list_tabs": return "Checking open tabs";
    case "wait": return `Waiting ${a.seconds}s`;
    case "show_browser": return a.show === false ? "Back to chat" : "Showing the browser";
    case "web_search": return `Searching "${cut(a.query, 36)}"`;
    case "fetch_url": return `Reading ${host(a.url)}`;
    case "workspace_info": return "Checking the workspace";
    case "run_command": return `Running ${cut(a.command, 42)}`;
    case "write_file": return `Writing ${cut(a.path, 40)}`;
    case "edit_file": return `Editing ${cut(a.path, 40)}`;
    case "read_file": return `Reading ${cut(a.path, 40)}`;
    case "list_files": return "Looking through the files";
    case "delete_path": return `Deleting ${cut(a.path, 40)}`;
    case "start_process": return `Starting ${a.name || "server"}`;
    case "process_logs": return "Checking the server output";
    case "stop_process": return "Stopping the server";
    case "zip_project": return `Zipping ${cut(a.path, 30)}`;
    case "call_api": return `${a.connection}: ${a.method || "GET"} ${cut(a.path, 30)}`;
    case "generate_image": return `Creating an image: ${cut(a.prompt, 34)}`;
    case "create_3d_model": return `Building 3D model: ${cut(a.title, 34)}`;
    case "remember": return "Saving to memory";
    case "forget": return "Updating memory";
    case "search_chats": return `Searching past chats for "${cut(a.query, 30)}"`;
    default: return name;
  }
}

function parseArgs(call) { try { return JSON.parse(call.function.arguments || "{}"); } catch { return {}; } }

// Each turn's tool work is shown as ONE block: a single live line while running,
// "Worked · N steps" when finished. Tap it to see every step and its result.
function renderWork(group, live) {
  const steps = group.steps;
  if (!steps.length && !group.notes.length) return "";
  const done = steps.filter((x) => x.result).length;
  const errors = steps.filter((x) => x.result && /^Error:/.test(x.result.content)).length;
  const now = steps.find((x) => !x.result);
  let label;
  if (live) label = now ? stepLabel(now.name, now.args) + "…" : "Thinking…";
  else label = `Worked · ${steps.length} step${steps.length === 1 ? "" : "s"}${errors ? ` · ${errors} hit an error` : ""}`;
  const rows = steps.map((x) => {
    const st = !x.result ? "pending" : /^Error:/.test(x.result.content) ? "err" : "ok";
    const body = x.name === "write_file" ? `path: ${x.args.path}\n\n${String(x.args.content || "").slice(0, 3000)}` : JSON.stringify(x.args, null, 1);
    return `<details class="wstep ${st}" data-id="${x.id}" ${openSteps.has(x.id) ? "open" : ""}><summary><span class="mark">${st === "ok" ? "✓" : st === "err" ? "✗" : "•"}</span>${escapeHtml(stepLabel(x.name, x.args))}</summary><pre>${escapeHtml(body)}${x.result ? "\n\n── result ──\n" + escapeHtml(x.result.content) : ""}</pre></details>`;
  }).join("");
  const notes = group.notes.map((n) => `<div class="wnote">${renderMarkdown(n)}</div>`).join("");
  const imgs = group.images.map((u) => `<img src="${u}" alt="screenshot">`).join("");
  return `<details class="work ${live ? "live" : ""}" data-id="${group.id}" ${openSteps.has(group.id) ? "open" : ""}>
    <summary>${live ? '<span class="spin"></span>' : '<span class="tick">✓</span>'}<span class="wl">${escapeHtml(label)}</span><span class="wc">${live ? `${done}/${steps.length || 1}` : "details"}</span></summary>
    <div class="wbody">${notes}${rows}${imgs ? `<div class="wimgs">${imgs}</div>` : ""}</div></details>`;
}

function artifactCard(a) {
  if (a.kind === "image") {
    return `<div class="art-card"><img class="art-img" src="${a.url}" alt="" data-full="${a.id}"><div class="art-bar"><span title="${escapeHtml(a.prompt)}">🖼 ${escapeHtml(cut(a.prompt, 60))}</span><button data-dlimg="${a.id}" title="Download">⬇ Save</button></div></div>`;
  }
  if (a.kind === "3d") {
    return `<div class="art-card"><img class="art-img" src="${a.snapshot || ""}" alt="" data-open3d="${a.id}"><div class="art-bar"><span>🧊 ${escapeHtml(a.title)}</span><button data-open3d="${a.id}">Open 3D</button><button data-glb="${a.id}">GLB</button><button data-code3d="${a.id}">Code</button></div></div>`;
  }
  return "";
}

function userBubble(m) {
  if (typeof m.content === "string") return `<div class="msg user">${escapeHtml(m.content)}</div>`;
  const text = m.display ?? m.content.filter((p) => p.type === "text").map((p) => p.text).join(" ");
  const imgs = m.content.filter((p) => p.type === "image_url").map((p) => `<img src="${p.image_url.url}" alt="">`).join("");
  const files = (m.attachments || []).filter((a) => a.kind !== "image").map((a) => `<span class="ufile">📎 ${escapeHtml(a.name)}</span>`).join("");
  return `<div class="msg user">${escapeHtml(text)}${imgs ? `<div class="uimgs">${imgs}</div>` : ""}${files ? `<div class="ufiles">${files}</div>` : ""}</div>`;
}

let renderQueued = false;
function renderSoon() {
  if (renderQueued) return;
  renderQueued = true;
  setTimeout(() => { renderQueued = false; render(); }, 60);
}

function render() {
  const c = chats[current];
  const box = $("messages");
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  if (!c || !c.messages.length) {
    box.innerHTML = `<div class="welcome"><img src="icons/icon128.png" alt=""><h1>Kash Moni AI</h1>
      <div>Your own AI agent. It can read and control your browser, debug sites and build apps.</div>
      ${settings.apiKey ? "" : '<p style="color:var(--gold)">Start by adding your OpenRouter key in ⚙ Settings.</p>'}
      <div class="suggest">
        <button data-s="Look at the page I'm on and summarise it.">📄 Summarise this page</button>
        <button data-s="Debug the page I'm on: check the console errors and failed network requests, reload to catch load errors, and tell me what's wrong and how to fix it.">🐞 Debug this page</button>
        <button data-s="Build me a simple budget tracker web app (HTML/CSS/JS, saves to localStorage). Test it, then give me the zip and run instructions.">📦 Build a small app</button>
        <button data-s="Search the web for today's top tech news and give me 5 bullet points with links.">🔎 Search the web</button>
      </div></div>`;
    updateChips();
    return;
  }
  const results = {};
  c.messages.forEach((m) => { if (m.role === "tool") results[m.tool_call_id] = m; });
  let html = "";
  let group = null;
  const newGroup = () => ({ id: "", steps: [], notes: [], images: [], artifacts: [] });
  const flush = (live) => { if (group) html += renderWork(group, live) + group.artifacts.map(artifactCard).join(""); group = null; };
  const msgs = c.messages;
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (m.role === "user" && !m.auto) {
      flush(false);
      html += userBubble(m);
    } else if (m.role === "user" && m.auto) {
      group = group || newGroup();
      for (const p of m.content || []) if (p.type === "image_url") group.images.push(p.image_url.url);
    } else if (m.role === "assistant" && m.tool_calls && m.tool_calls.length) {
      group = group || newGroup();
      if (m.content && m.content.trim()) group.notes.push(m.content);
      for (const call of m.tool_calls) {
        if (!group.id) group.id = "w-" + call.id;
        group.steps.push({ id: call.id, name: call.function.name, args: parseArgs(call), result: results[call.id] });
      }
    } else if (m.role === "assistant") {
      flush(false);
      if (m.content && m.content.trim()) html += `<div class="msg ai">${renderMarkdown(m.content)}</div>`;
    } else if (m.role === "artifact") {
      group = group || newGroup();
      group.artifacts.push(m);
    } else if (m.role === "error") {
      flush(false);
      html += `<div class="err-box">⚠ ${escapeHtml(m.content)}</div>`;
    }
  }
  if (running && !group && !(draft && draft.content)) { group = newGroup(); group.id = "w-live"; }
  const writing = !!(running && draft && draft.content);
  flush(!!running && !writing);
  if (writing) html += `<div class="msg ai streaming">${renderMarkdown(draft.content + " ▍")}</div>`;
  if (!running && c.interrupted) html += `<div class="resume"><button class="btn primary" data-resume="1">⏯ Resume the interrupted task</button></div>`;
  box.innerHTML = html;
  if (nearBottom || running) box.scrollTop = box.scrollHeight;
  updateChips();
}

function updateChips() {
  const c = chats[current];
  const m = $("strong").checked && settings.strongModel ? settings.strongModel : settings.model;
  $("chip-model").textContent = (m || "no model").split("/").pop();
  $("chip-model").title = "Model: " + m + " (click to change)";
  const cost = c ? c.cost || 0 : 0;
  $("chip-cost").textContent = cost ? `$${cost < 0.01 ? cost.toFixed(4) : cost.toFixed(3)}` : "";
  $("chip-cost").title = c ? `This chat: ${c.tokens || 0} tokens, $${cost.toFixed(5)}` : "";
}

function setStatus(t) { $("status-line").textContent = t; }

// ------------------------------------------------------------------ confirm
function confirmAction(text) {
  return new Promise((resolve) => {
    $("confirm-text").innerHTML = renderMarkdown(text);
    $("confirm-bar").classList.remove("hidden");
    setStatus("Waiting for your OK…");
    const done = (v) => { $("confirm-bar").classList.add("hidden"); $("confirm-yes").onclick = $("confirm-no").onclick = null; resolve(v); };
    $("confirm-yes").onclick = () => done(true);
    $("confirm-no").onclick = () => done(false);
    if (running) running.signal.addEventListener("abort", () => done(false), { once: true });
  });
}

// ------------------------------------------------------------------ send
async function send(text) {
  text = (text || "").trim();
  if ((!text && !pendingFiles.length) || running) return;
  if (pendingFiles.some((f) => f.loading)) { setStatus("Still reading your files…"); return; }
  if (!settings.apiKey) { openSettings(); $("s-key-result").textContent = "Add your OpenRouter API key first."; $("s-key-result").className = "hint bad"; return; }
  const c = chat();
  fixDangling(c);
  const files = pendingFiles;
  pendingFiles = []; renderAttachments();
  if (files.length) {
    await checkHelper();
    c.messages.push(await buildUserMessage(text, files));
  } else {
    c.messages.push({ role: "user", content: text });
  }
  if (c.title === "New chat") c.title = (text || files.map((f) => f.name).join(", ")).slice(0, 60);
  c.updated = Date.now();
  $("input").value = ""; autosize();
  render(); saveChats();

  await runChat(c);
}

async function runChat(c) {
  stopSpeaking();
  const model = $("strong").checked && settings.strongModel ? settings.strongModel : settings.model;
  running = new AbortController();
  c.running = true; c.interrupted = false; saveChats();
  render();
  $("btn-send").classList.add("stop"); $("btn-send").textContent = "■"; $("btn-send").title = "Stop";
  await checkHelper();
  let nextWarn = Number(settings.taskWarn) || 0;
  try {
    await runAgent(c, settings, model, helperOk, running.signal, {
      onUpdate: () => { c.updated = Date.now(); render(); saveChats(); },
      onStatus: setStatus,
      confirm: confirmAction,
      onStream: (acc) => { draft = acc; if (acc.content) setStatus("Writing…"); renderSoon(); },
      onStreamEnd: () => { draft = null; },
      localTool,
      onCost: recordCost,
      beforeStep: async (taskCost) => {
        const { today, month } = spendTotals();
        if (settings.dailyBudget > 0 && today >= settings.dailyBudget) throw new Error(`Daily budget of $${settings.dailyBudget} reached (${money(today)} spent today). Raise it in Settings → Spending.`);
        if (settings.monthlyBudget > 0 && month >= settings.monthlyBudget) throw new Error(`Monthly budget of $${settings.monthlyBudget} reached (${money(month)} this month). Raise it in Settings → Spending.`);
        if (nextWarn > 0 && taskCost >= nextWarn) {
          const ok = await confirmAction(`This task has cost **${money(taskCost)}** so far. Keep going?`);
          if (!ok) throw new Error(`Stopped at ${money(taskCost)} - you chose not to continue.`);
          nextWarn += Number(settings.taskWarn) || 0;
        }
      },
    }, PLATFORM);
    setStatus("Done");
    if (settings.speakReplies) {
      const last = [...c.messages].reverse().find((m) => m.role === "assistant" && m.content && !m.tool_calls);
      if (last) speak(last.content);
    }
  } catch (e) {
    if (e.name === "AbortError") { c.messages.push({ role: "error", content: "Stopped." }); setStatus("Stopped"); }
    else { c.messages.push({ role: "error", content: e.message || String(e) }); setStatus("Error"); }
  } finally {
    fixDangling(c);
    draft = null;
    running = null;
    c.running = false;
    $("btn-send").classList.remove("stop"); $("btn-send").textContent = "➤"; $("btn-send").title = "Send (Enter)";
    $("confirm-bar").classList.add("hidden");
    render(); saveChats();
  }
}

// ------------------------------------------------------------------ spending
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
const money = (x) => "$" + (x < 0.01 ? x.toFixed(4) : x < 1 ? x.toFixed(3) : x.toFixed(2));
function recordCost(amount, model) {
  amount = Number(amount) || 0;
  if (!amount) return;
  settings.usage = settings.usage || { days: {} };
  const d = (settings.usage.days[dayKey()] = settings.usage.days[dayKey()] || { total: 0, models: {} });
  d.total += amount;
  const m = String(model || "other").split("/").pop();
  d.models[m] = (d.models[m] || 0) + amount;
  // keep ~13 months
  const keys = Object.keys(settings.usage.days).sort();
  while (keys.length > 400) delete settings.usage.days[keys.shift()];
  saveStoreSoon();
}
function spendTotals() {
  const days = (settings.usage && settings.usage.days) || {};
  const t = dayKey(), m = t.slice(0, 7);
  let today = 0, month = 0;
  for (const [k, v] of Object.entries(days)) { if (k === t) today += v.total; if (k.startsWith(m)) month += v.total; }
  return { today, month };
}
let storeTimer = null;
function saveStoreSoon() { clearTimeout(storeTimer); storeTimer = setTimeout(() => saveStore(), 800); }
function renderUsage() {
  const days = (settings.usage && settings.usage.days) || {};
  const { today, month } = spendTotals();
  const last = Object.keys(days).sort().reverse().slice(0, 14);
  const models = {};
  for (const [k, v] of Object.entries(days)) if (k.startsWith(dayKey().slice(0, 7))) for (const [mm, c] of Object.entries(v.models || {})) models[mm] = (models[mm] || 0) + c;
  $("usage-box").innerHTML = `<div class="usage-tot"><div><b>${money(today)}</b><span>today</span></div><div><b>${money(month)}</b><span>this month</span></div></div>
    ${last.length ? `<table class="usage"><tr><th>Day</th><th>Cost</th></tr>${last.map((k) => `<tr><td>${k}</td><td>$${days[k].total.toFixed(4)}</td></tr>`).join("")}</table>` : '<div class="hint">No spending recorded yet.</div>'}
    ${Object.keys(models).length ? `<table class="usage"><tr><th>Model (this month)</th><th>Cost</th></tr>${Object.entries(models).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>$${v.toFixed(4)}</td></tr>`).join("")}</table>` : ""}`;
}

// ------------------------------------------------------------------ voice
let recog = null;
async function startVoice() {
  const btn = $("btn-mic");
  if (PLATFORM.voiceInput) {
    btn.classList.add("on");
    try { const t = await PLATFORM.voiceInput(); if (t) { $("input").value = ($("input").value + " " + t).trim(); autosize(); } }
    catch (e) { setStatus("Voice: " + e.message); }
    btn.classList.remove("on");
    return;
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { setStatus("Voice input is not supported here"); return; }
  if (recog) { recog.stop(); return; }
  recog = new SR();
  recog.lang = navigator.language || "en-US";
  recog.interimResults = true;
  recog.continuous = false;
  const base = $("input").value;
  recog.onresult = (e) => { const t = [...e.results].map((r) => r[0].transcript).join(""); $("input").value = (base + " " + t).trim(); autosize(); };
  recog.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      setStatus("Allow the microphone in the tab that just opened, then try again");
      if (typeof chrome !== "undefined" && chrome.tabs) chrome.tabs.create({ url: chrome.runtime.getURL("sidepanel.html?mic=1") });
    } else setStatus("Voice: " + e.error);
  };
  recog.onend = () => { recog = null; btn.classList.remove("on"); };
  btn.classList.add("on");
  setStatus("Listening…");
  recog.start();
}
function plainForSpeech(md) {
  return String(md || "").replace(/```[\s\S]*?```/g, " (code omitted) ").replace(/`([^`]+)`/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "link").replace(/[#*_>|~-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 4000);
}
function speak(md) {
  const t = plainForSpeech(md);
  if (!t) return;
  if (PLATFORM.speak) { PLATFORM.speak(t); return; }
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(t);
  u.lang = navigator.language || "en-US";
  speechSynthesis.speak(u);
}
function stopSpeaking() {
  if (PLATFORM.stopSpeaking) PLATFORM.stopSpeaking();
  else if (window.speechSynthesis) speechSynthesis.cancel();
}

// ------------------------------------------------------------------ projects
function activeProject() { return (settings.projects || []).find((p) => p.id === settings.activeProject) || null; }
function renderProjectChip() {
  const p = activeProject();
  $("chip-project").textContent = "📁 " + (p ? p.name : "General");
}
function openProjects() {
  const list = settings.projects || [];
  $("proj-list").innerHTML = [{ id: "", name: "General", folder: "" }, ...list].map((p) => `
    <div class="h-item ${p.id === (settings.activeProject || "") ? "active" : ""}" data-proj="${p.id}">
      <div class="t"><div>📁 ${escapeHtml(p.name)}</div><div class="d">${p.folder ? "workspace: " + escapeHtml(p.folder) : p.id ? "" : "chats without a project"}</div></div></div>`).join("");
  $("view-projects").classList.remove("hidden");
}
async function switchProject(id) {
  settings.activeProject = id;
  await saveStore();
  const latest = Object.values(chats).filter((c) => (c.project || "") === id).sort((a, b) => b.updated - a.updated)[0];
  current = latest ? latest.id : null;
  saveChats(); renderProjectChip(); render();
}
let editingProject = null;
function renderProjectSettings() {
  const list = settings.projects || [];
  $("pj-list").innerHTML = list.length ? list.map((p) => `<div class="conn"><div class="t"><div>📁 ${escapeHtml(p.name)}</div><div>${escapeHtml(p.folder || "")}</div></div><button data-pjedit="${p.id}">✏️</button><button data-pjdel="${p.id}">🗑</button></div>`).join("")
    : '<div class="hint">No projects yet. Projects keep their own chats, instructions and workspace folder.</div>';
}
function openProjectForm(p) {
  editingProject = p ? p.id : null;
  $("pj-name").value = p ? p.name : ""; $("pj-folder").value = p ? p.folder || "" : ""; $("pj-instr").value = p ? p.instructions || "" : "";
  $("pj-form").classList.remove("hidden");
}
function wireProjects() {
  $("chip-project").onclick = openProjects;
  $("proj-list").onclick = (e) => { const it = e.target.closest("[data-proj]"); if (it && !running) { switchProject(it.dataset.proj); $("view-projects").classList.add("hidden"); } };
  $("proj-manage").onclick = () => { $("view-projects").classList.add("hidden"); openSettings(); setTimeout(() => $("pj-section").scrollIntoView(), 50); };
  $("pj-add").onclick = () => openProjectForm(null);
  $("pj-cancel").onclick = () => $("pj-form").classList.add("hidden");
  $("pj-save").onclick = async () => {
    const name = $("pj-name").value.trim();
    if (!name) return;
    const data = { name, folder: $("pj-folder").value.trim().replace(/^\/+|\/+$/g, ""), instructions: $("pj-instr").value.trim() };
    settings.projects = settings.projects || [];
    if (editingProject) Object.assign(settings.projects.find((x) => x.id === editingProject), data);
    else settings.projects.push({ id: "p" + Date.now().toString(36), ...data });
    await saveStore();
    $("pj-form").classList.add("hidden");
    renderProjectSettings(); renderProjectChip();
  };
  $("pj-list").onclick = async (e) => {
    const ed = e.target.closest("[data-pjedit]"), del = e.target.closest("[data-pjdel]");
    if (ed) openProjectForm(settings.projects.find((x) => x.id === ed.dataset.pjedit));
    if (del) {
      settings.projects = settings.projects.filter((x) => x.id !== del.dataset.pjdel);
      if (settings.activeProject === del.dataset.pjdel) settings.activeProject = "";
      await saveStore(); renderProjectSettings(); renderProjectChip();
    }
  };
}

// ------------------------------------------------------------------ backup & restore
function backupData(includeKeys) {
  const st = JSON.parse(JSON.stringify(settings));
  if (!includeKeys) {
    for (const k of ["apiKey", "helperToken", "searchKey"]) st[k] = "";
    st.connections = (st.connections || []).map((c) => ({ ...c, token: "" }));
  }
  return { app: "kashmoni", format: 1, exported: new Date().toISOString(), includesKeys: !!includeKeys, settings: st, chats };
}
async function restoreData(data) {
  if (!data || data.app !== "kashmoni") throw new Error("This is not a Kash Moni backup file.");
  let added = 0;
  for (const [id, c] of Object.entries(data.chats || {})) {
    if (!chats[id] || (c.updated || 0) > (chats[id].updated || 0)) { chats[id] = c; added++; }
  }
  const inc = data.settings || {};
  const keep = { ...settings };
  settings = { ...DEFAULTS, ...settings, ...inc };
  for (const k of ["apiKey", "helperToken", "searchKey"]) if (!inc[k]) settings[k] = keep[k];
  // memories: union
  const mem = [...(keep.memories || [])];
  for (const m of inc.memories || []) if (!mem.some((x) => x.text === m.text)) mem.push({ ...m, id: "m" + (mem.length + 1) + Math.random().toString(36).slice(2, 4) });
  settings.memories = mem;
  // connections: keep existing tokens when the backup has none
  settings.connections = (inc.connections || keep.connections || []).map((c) => {
    const old = (keep.connections || []).find((x) => x.name === c.name);
    return { ...c, token: c.token || (old && old.token) || "" };
  }).filter((c) => c.token);
  await saveStore(); saveChats();
  return added;
}
function utf8ToB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function githubConn() { return (settings.connections || []).find((c) => /api\.github\.com/.test(c.baseUrl || "") && c.token); }
async function gh(method, path, body, accept) {
  const c = githubConn();
  if (!c) throw new Error("Add a GitHub connection first (Settings → Connections).");
  const r = await (PLATFORM.http || fetch)("https://api.github.com" + path, {
    method, headers: { Authorization: "Bearer " + c.token, Accept: accept || "application/vnd.github+json", "Content-Type": "application/json", "User-Agent": "KashMoniAI" },
    body: body ? JSON.stringify(body) : undefined, timeout: 120,
  });
  const text = await r.text();
  return { status: r.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
}
async function backupToGitHub() {
  const me = await gh("GET", "/user");
  if (me.status !== 200) throw new Error("GitHub login failed (" + me.status + ")");
  const login = me.json.login;
  let repo = await gh("GET", `/repos/${login}/kashmoni-backup`);
  if (repo.status === 404) {
    repo = await gh("POST", "/user/repos", { name: "kashmoni-backup", private: true, auto_init: true, description: "Kash Moni AI backups (private)" });
    if (repo.status >= 300) throw new Error("Could not create the private repo: " + repo.text.slice(0, 200));
    await new Promise((r) => setTimeout(r, 1500));
  }
  const file = `/repos/${login}/kashmoni-backup/contents/backup.json`;
  const old = await gh("GET", file);
  const sha = old.status === 200 && old.json ? old.json.sha : undefined;
  const put = await gh("PUT", file, { message: "Kash Moni backup " + new Date().toISOString(), content: utf8ToB64(JSON.stringify(backupData($("bk-keys").checked))), sha });
  if (put.status >= 300) throw new Error("Upload failed: " + put.text.slice(0, 200));
  return `${login}/kashmoni-backup (private)`;
}
async function restoreFromGitHub() {
  const me = await gh("GET", "/user");
  if (me.status !== 200) throw new Error("GitHub login failed (" + me.status + ")");
  const r = await gh("GET", `/repos/${me.json.login}/kashmoni-backup/contents/backup.json`, null, "application/vnd.github.raw");
  if (r.status !== 200) throw new Error("No backup found on GitHub (" + r.status + ")");
  return restoreData(JSON.parse(r.text));
}
function wireBackup() {
  const out = (t, ok) => { $("bk-result").className = "hint " + (ok === false ? "bad" : ok ? "ok" : ""); $("bk-result").textContent = t; };
  $("bk-export").onclick = async () => {
    await saveBlob(new Blob([JSON.stringify(backupData($("bk-keys").checked))], { type: "application/json" }), `kashmoni-backup-${dayKey()}.json`);
    out("Backup saved to Downloads/KashMoni.", true);
  };
  $("bk-import").onclick = () => $("bk-file").click();
  $("bk-file").onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    try { const n = await restoreData(JSON.parse(await f.text())); out(`Restored. ${n} chats added/updated.`, true); openSettings(); render(); }
    catch (err) { out("Restore failed: " + err.message, false); }
  };
  $("bk-gh-save").onclick = async () => { out("Backing up to GitHub…"); try { out("Saved to " + await backupToGitHub(), true); } catch (err) { out(err.message, false); } };
  $("bk-gh-restore").onclick = async () => { out("Restoring from GitHub…"); try { const n = await restoreFromGitHub(); out(`Restored from GitHub. ${n} chats added/updated.`, true); openSettings(); render(); } catch (err) { out(err.message, false); } };
}

// ------------------------------------------------------------------ updates
let updateInfo = null;
async function helperCall(action, body = {}) {
  const r = await (PLATFORM.http || fetch)(settings.helperUrl.replace(/\/$/, "") + "/" + action, {
    method: "POST", headers: { "Content-Type": "application/json", "X-KashMoni-Token": settings.helperToken }, body: JSON.stringify(body), timeout: 300,
  });
  return r.json();
}
async function checkUpdates(manual) {
  const out = (t, ok) => { if ($("upd-result")) { $("upd-result").className = "hint " + (ok === false ? "bad" : ok ? "ok" : ""); $("upd-result").textContent = t; } };
  const repo = settings.updateRepo;
  if (!repo) { out("Set the update repo first.", false); return; }
  updateInfo = { app: null, helper: null };
  const notes = [];
  if (PLATFORM.name === "android") {
    try {
      const r = await (PLATFORM.http || fetch)(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { Accept: "application/vnd.github+json", "User-Agent": "KashMoniAI" } });
      const j = await r.json();
      const n = parseInt(String(j.tag_name || "").replace(/\D+/g, ""), 10) || 0;
      const mine = PLATFORM.appBuild ? await PLATFORM.appBuild() : 0;
      const asset = (j.assets || []).find((a) => /\.apk$/i.test(a.name));
      if (asset && 100 + n > mine) { updateInfo.app = { url: asset.browser_download_url, build: n }; notes.push(`New app build ${n} (you have ${mine - 100}).`); }
      else notes.push(`App is up to date (build ${mine - 100}).`);
    } catch (e) { notes.push("Could not check app updates: " + e.message); }
  }
  if (helperOk) {
    try {
      const r = await helperCall("update_check", { repo });
      if (r.ok && r.available) { updateInfo.helper = r; notes.push(r.mode === "git" ? `${r.changes.length} new change(s):\n` + r.changes.slice(0, 8).join("\n") : r.changes.join("")); }
      else if (r.ok) notes.push(r.mode === "git" ? "Kash Moni (PC) is up to date." : "Helper is up to date.");
      else notes.push(r.error);
    } catch (e) { notes.push("Helper update check failed: " + e.message); }
  } else if (PLATFORM.name !== "android") notes.push("Start the workspace helper to check for updates.");
  const available = !!(updateInfo.app || updateInfo.helper);
  out(notes.join("\n"), available ? true : undefined);
  $("update-banner").classList.toggle("hidden", !available);
  $("upd-install").disabled = !available;
}
async function installUpdate() {
  const out = (t, ok) => { $("upd-result").className = "hint " + (ok === false ? "bad" : ok ? "ok" : ""); $("upd-result").textContent = t; };
  if (!updateInfo) await checkUpdates();
  if (!updateInfo || !(updateInfo.app || updateInfo.helper)) { out("Nothing to update."); return; }
  if (updateInfo.helper) {
    setStatus("Updating…");
    const r = await helperCall("update_apply", { repo: settings.updateRepo });
    if (!r.ok) { out("Update failed: " + r.error, false); return; }
    out(`Updated to ${r.updated_to}. ${r.note || ""}`, true);
    if (r.mode === "git" && typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.reload) {
      setStatus("Reloading Kash Moni…");
      setTimeout(() => chrome.runtime.reload(), 3000);
    }
  }
  if (updateInfo.app && PLATFORM.openExternal) {
    out("Downloading the new app… open it when the download finishes and tap Install.", true);
    PLATFORM.openExternal(updateInfo.app.url);
  }
  $("update-banner").classList.add("hidden");
}
async function rollbackUpdate() {
  const out = (t, ok) => { $("upd-result").className = "hint " + (ok === false ? "bad" : ok ? "ok" : ""); $("upd-result").textContent = t; };
  if (!helperOk) { out("The helper must be running.", false); return; }
  const r = await helperCall("update_rollback", {});
  if (!r.ok) { out("Rollback failed: " + r.error, false); return; }
  out(`Rolled back to ${r.rolled_back_to}. ${r.note || ""}`, true);
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.reload) setTimeout(() => chrome.runtime.reload(), 3000);
}

// ------------------------------------------------------------------ history
function openHistory() {
  $("view-history").classList.remove("hidden");
  $("history-search").value = "";
  renderHistory();
}
function renderHistory() {
  const q = $("history-search").value.toLowerCase();
  const all = $("history-all") && $("history-all").checked;
  const list = Object.values(chats).sort((a, b) => b.updated - a.updated)
    .filter((c) => all || (c.project || "") === (settings.activeProject || ""))
    .filter((c) => !q || c.title.toLowerCase().includes(q) || c.messages.some((m) => String(typeof m.content === "string" ? m.content : m.display || "").toLowerCase().includes(q)));
  $("history-list").innerHTML = list.length ? list.map((c) => `
    <div class="h-item ${c.id === current ? "active" : ""}" data-id="${c.id}">
      <div class="t"><div>${escapeHtml(c.title)}</div><div class="d">${new Date(c.updated).toLocaleString()} · ${c.messages.filter((m) => m.role === "user" && !m.auto).length} msgs${c.cost ? ` · $${c.cost.toFixed(4)}` : ""}</div></div>
      <button data-del="${c.id}" title="Delete">🗑</button>
    </div>`).join("") : '<div class="hint">No chats yet.</div>';
}

// ------------------------------------------------------------------ settings
const NUM_FIELDS = ["compactAt", "dailyBudget", "monthlyBudget", "taskWarn"];
const FIELDS = ["imageModel", "fallbackModel", "compactAt", "dailyBudget", "monthlyBudget", "taskWarn", "searchProvider", "searchKey", "updateRepo", "apiKey", "model", "strongModel", "reasoning", "helperUrl", "helperToken", "confirmMode", "maxSteps", "customInstructions"];
function openSettings() {
  FIELDS.forEach((f) => { $("s-" + f).value = settings[f] ?? ""; });
  renderConnections();
  renderMemories();
  renderUsage();
  renderProjectSettings();
  $("pj-form").classList.add("hidden");
  $("s-memoryOn").value = settings.memoryOn === false ? "off" : "on";
  $("conn-form").classList.add("hidden");
  $("view-settings").classList.remove("hidden");
}
async function saveStore() { await chrome.storage.local.set({ km_settings: settings }); }
async function saveSettings() {
  FIELDS.forEach((f) => { settings[f] = $("s-" + f).value.trim(); });
  settings.maxSteps = Math.max(5, Math.min(200, parseInt(settings.maxSteps, 10) || 40));
  if (!settings.model) settings.model = DEFAULTS.model;
  settings.memoryOn = $("s-memoryOn").value !== "off";
  for (const f of NUM_FIELDS) settings[f] = Math.max(0, Number(String(settings[f]).replace(/[^0-9.]/g, "")) || 0);
  if (!settings.compactAt) settings.compactAt = 60000;
  await saveStore();
  await checkHelper();
  updateChips();
}
async function loadModels() {
  const out = $("s-key-result");
  out.className = "hint"; out.textContent = "Loading models…";
  try {
    const j = await (await fetch("https://openrouter.ai/api/v1/models")).json();
    const models = (j.data || []).filter((m) => (m.supported_parameters || []).includes("tools"));
    $("model-list").innerHTML = models.map((m) => {
      const p = m.pricing || {};
      const price = `$${(p.prompt * 1e6).toFixed(2)} in / $${(p.completion * 1e6).toFixed(2)} out per 1M`;
      return `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)} — ${price}</option>`;
    }).join("");
    out.className = "hint ok"; out.textContent = `Loaded ${models.length} models that support tools. Click a model field to pick one.`;
  } catch (e) { out.className = "hint bad"; out.textContent = "Could not load models: " + e.message; }
}
async function testKey() {
  const out = $("s-key-result");
  const key = $("s-apiKey").value.trim();
  out.className = "hint"; out.textContent = "Checking…";
  try {
    const r = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: "Bearer " + key } });
    const j = await r.json();
    if (!r.ok) throw new Error((j.error && j.error.message) || r.status);
    const d = j.data || {};
    const left = d.limit_remaining != null ? `, key limit left: $${Number(d.limit_remaining).toFixed(2)}` : "";
    let credits = "";
    try {
      const c = await (await fetch("https://openrouter.ai/api/v1/credits", { headers: { Authorization: "Bearer " + key } })).json();
      if (c.data) credits = `\nBalance: $${(c.data.total_credits - c.data.total_usage).toFixed(2)}`;
    } catch { /* optional */ }
    out.className = "hint ok"; out.textContent = `Key works. Used so far: $${Number(d.usage || 0).toFixed(4)}${left}${credits}`;
  } catch (e) { out.className = "hint bad"; out.textContent = "Key check failed: " + e.message; }
}
async function testHelper() {
  const out = $("s-helper-result");
  out.className = "hint"; out.textContent = "Checking…";
  const url = $("s-helperUrl").value.trim().replace(/\/$/, ""), tok = $("s-helperToken").value.trim();
  try {
    const r = await fetch(url + "/info", { method: "POST", headers: { "X-KashMoni-Token": tok, "Content-Type": "application/json" }, body: "{}" });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "error");
    const tools = Object.entries(j.tools).map(([k, v]) => `${v ? "✓" : "✗"} ${k}`).join("  ");
    out.className = "hint ok"; out.textContent = `Connected. Workspace: ${j.workspace}\n${tools}`;
  } catch (e) {
    out.className = "hint bad";
    out.textContent = /fetch/i.test(e.message) ? "Can't reach the helper. Start it with:  python3 kashmoni_helper.py" : "Helper error: " + e.message;
  }
}


// ------------------------------------------------------------------ attachments
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|jsonl|xml|ya?ml|toml|ini|cfg|conf|env|log|html?|css|scss|less|js|mjs|cjs|jsx|ts|tsx|vue|svelte|py|rb|php|java|kt|kts|go|rs|c|h|cpp|hpp|cs|swift|dart|lua|sh|bash|zsh|sql|r|pl|gradle|properties|gitignore|dockerfile)$/i;
const MAX_TEXT = 150000;

function fileKind(f) {
  if (/^image\/(png|jpe?g|webp|gif|bmp)$/i.test(f.type)) return "image";
  if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) return "pdf";
  if (/^text\//.test(f.type) || /json|xml|javascript|x-sh|yaml|sql/.test(f.type) || TEXT_EXT.test(f.name) || /^(dockerfile|makefile|readme)$/i.test(f.name)) return "text";
  return "binary";
}
function readAs(f, how) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error || new Error("read failed"));
    how === "text" ? r.readAsText(f) : r.readAsDataURL(f);
  });
}
async function shrinkImage(f) {
  const url = await readAs(f, "data");
  if (/gif/i.test(f.type)) return url;
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const max = 1600;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  if (scale === 1 && f.size < 1.5e6) return url;
  const cv = document.createElement("canvas");
  cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
  const g = cv.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height);
  g.drawImage(img, 0, 0, cv.width, cv.height);
  return cv.toDataURL("image/jpeg", 0.85);
}
function sizeText(n) { return n > 1e6 ? (n / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1e3)) + " KB"; }

async function addFiles(list) {
  for (const f of [...list]) {
    if (f.size > 50e6) { setStatus(`${f.name} is over 50 MB - skipped`); continue; }
    const item = { name: f.name || "pasted-image.png", size: f.size, kind: fileKind(f), loading: true };
    pendingFiles.push(item);
    renderAttachments();
    try {
      if (item.kind === "image") item.dataUrl = await shrinkImage(f);
      else if (item.kind === "text") { item.text = await readAs(f, "text"); if (item.text.length > MAX_TEXT) item.text = item.text.slice(0, MAX_TEXT) + "\n...[file cut at 150,000 characters]"; }
      else item.dataUrl = await readAs(f, "data");
    } catch (e) { item.error = e.message; }
    item.loading = false;
    renderAttachments();
  }
}
function renderAttachments() {
  const row = $("attach-row");
  row.classList.toggle("hidden", !pendingFiles.length);
  row.innerHTML = pendingFiles.map((f, i) => `<div class="att ${f.loading ? "loading" : ""}">${f.kind === "image" && f.dataUrl ? `<img src="${f.dataUrl}" alt="">` : `<span>${f.kind === "pdf" ? "📕" : f.kind === "text" ? "📄" : "📦"}</span>`}<span title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span><button data-unattach="${i}" title="Remove">✕</button></div>`).join("");
}
async function buildUserMessage(text, files) {
  const parts = [{ type: "text", text: text || "(Please look at the attached file" + (files.length > 1 ? "s" : "") + ".)" }];
  for (const f of files) {
    if (f.error) { parts.push({ type: "text", text: `[Attachment "${f.name}" could not be read: ${f.error}]` }); continue; }
    if (f.kind === "image") parts.push({ type: "image_url", image_url: { url: f.dataUrl } });
    else if (f.kind === "pdf") parts.push({ type: "file", file: { filename: f.name, file_data: f.dataUrl } });
    else if (f.kind === "text") parts.push({ type: "text", text: `Attached file: ${f.name}\n\`\`\`\n${f.text}\n\`\`\`` });
    else if (helperOk) {
      try {
        const path = await uploadToWorkspace(settings, PLATFORM.http, f.name, f.dataUrl.split(",")[1] || "");
        parts.push({ type: "text", text: `[The user attached "${f.name}" (${sizeText(f.size)}). It is saved in the workspace at ${path} - use workspace tools to open it, e.g. unzip or a Python script.]` });
      } catch (e) { parts.push({ type: "text", text: `[Attachment "${f.name}" could not be saved to the workspace: ${e.message}]` }); }
    } else parts.push({ type: "text", text: `[The user attached "${f.name}" (${sizeText(f.size)}), but this file type can only be opened through the workspace helper, which is off. Tell the user to start it.]` });
  }
  return { role: "user", content: parts, display: text, attachments: files.map((f) => ({ name: f.name, kind: f.kind })) };
}

// ------------------------------------------------------------------ 3D viewer + downloads
function findArtifact(id) {
  for (const c of Object.values(chats)) for (const m of c.messages) if (m.role === "artifact" && m.id === id) return m;
  return null;
}
async function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  try { await chrome.downloads.download({ url, filename: "KashMoni/" + name, saveAs: false, conflictAction: "uniquify" }); setStatus("Saved to Downloads/KashMoni/" + name); }
  finally { setTimeout(() => URL.revokeObjectURL(url), 60000); }
}
function dataUrlToBlob(u) {
  const [head, b64] = u.split(",");
  const mime = (head.match(/data:([^;]+)/) || [])[1] || "application/octet-stream";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
async function copyToClipboard(t) { try { await navigator.clipboard.writeText(t); setStatus("Copied to clipboard"); } catch { setStatus("Could not copy"); } }
const slug = (t) => String(t || "model").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "model";

// One hidden viewer (for the AI's renders and exports) + the overlay viewer for the user.
const viewers = {};
function getViewer(kind) {
  if (viewers[kind]) return viewers[kind];
  viewers[kind] = new Promise((resolve) => {
    const f = document.createElement("iframe");
    f.src = "viewer.html";
    if (kind === "hidden") f.style.cssText = "position:fixed;left:-10000px;top:0;width:800px;height:600px;border:0;";
    else { f.className = "viewer-frame"; }
    const onMsg = (e) => { if (e.source === f.contentWindow && e.data && e.data.type === "km3d-ready") { window.removeEventListener("message", onMsg); resolve(f); } };
    window.addEventListener("message", onMsg);
    (kind === "hidden" ? document.body : $("viewer-box")).appendChild(f);
  });
  return viewers[kind];
}
function askViewer(f, msg, replyType, timeout = 20000) {
  return new Promise((resolve) => {
    const id = msg.id || ("v" + Date.now() + Math.random().toString(36).slice(2, 6));
    const t = setTimeout(() => { window.removeEventListener("message", on); resolve({ ok: false, error: "The 3D viewer did not answer in time (the code may be too heavy or stuck in a loop)." }); }, timeout);
    const on = (e) => { if (e.source === f.contentWindow && e.data && e.data.type === replyType && e.data.id === id) { clearTimeout(t); window.removeEventListener("message", on); resolve(e.data); } };
    window.addEventListener("message", on);
    f.contentWindow.postMessage({ ...msg, id }, "*");
  });
}
let hiddenLoaded = null; // artifact id currently loaded in the hidden viewer
async function run3d(kind, code, opts = {}) {
  const f = await getViewer(kind);
  return askViewer(f, { type: "km3d-run", code, snapshot: !!opts.snapshot, id: opts.id }, "km3d-result");
}
async function open3d(a) {
  $("view-3d").classList.remove("hidden");
  $("v3d-title").textContent = a.title;
  $("view-3d").dataset.id = a.id;
  const r = await run3d("overlay", a.code, {});
  if (!r.ok) setStatus("3D error: " + r.error);
}
async function exportGlb(a) {
  setStatus("Exporting GLB…");
  const f = await getViewer("hidden");
  if (hiddenLoaded !== a.id) { const r = await run3d("hidden", a.code, {}); if (!r.ok) { setStatus("3D error: " + r.error); return; } hiddenLoaded = a.id; }
  const r = await askViewer(f, { type: "km3d-export" }, "km3d-glb");
  if (r.error || !r.buffer) { setStatus("Export failed: " + (r.error || "no data")); return; }
  await saveBlob(new Blob([r.buffer], { type: "model/gltf-binary" }), slug(a.title) + ".glb");
}
function standaloneHtml(title, code) {
  const safe = code.replace(/<\/script/gi, "<\\/script");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title.replace(/</g, "&lt;")}</title>
<style>html,body{margin:0;height:100%;background:#1b2420;overflow:hidden}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"https://unpkg.com/three@0.170.0/build/three.module.js","three/addons/":"https://unpkg.com/three@0.170.0/examples/jsm/"}}</script>
</head><body>
<script type="module">
import * as CORE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";
const THREE = { ...CORE, RoundedBoxGeometry, ConvexGeometry, BufferGeometryUtils };
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color("#1b2420");
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.01, 5000); camera.position.set(3, 2.5, 4);
const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true;
const fns = []; const animate = (f) => fns.push(f);
await (async (THREE, scene, camera, renderer, controls, animate) => {
${safe}
})(THREE, scene, camera, renderer, controls, animate);
let lit = false; scene.traverse((o) => { if (o.isLight) lit = true; });
if (!lit) { const s = new THREE.DirectionalLight(0xffffff, 1.6); s.position.set(5, 8, 6); s.castShadow = true; scene.add(new THREE.HemisphereLight(0xffffff, 0x334433, 0.6), s); }
if (!scene.userData.keepCamera) {
  const box = new THREE.Box3().setFromObject(scene); const size = box.getSize(new THREE.Vector3()); const c = box.getCenter(new THREE.Vector3());
  const d = Math.max(size.length() / 2, 0.001) / Math.sin(camera.fov * Math.PI / 360) * 1.15;
  camera.position.copy(c).add(new THREE.Vector3(1, 0.75, 1.25).normalize().multiplyScalar(d)); camera.near = d / 100; camera.far = d * 100; camera.updateProjectionMatrix(); controls.target.copy(c);
}
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => { const dt = clock.getDelta(); fns.forEach((f) => f(dt, clock.elapsedTime)); controls.update(); renderer.render(scene, camera); });
addEventListener("resize", () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
</script></body></html>`;
}
async function create3dTool(args) {
  const code = String(args.code || "");
  const title = String(args.title || "3D model");
  hiddenLoaded = null;
  const r = await run3d("hidden", code, { snapshot: true });
  if (!r.ok) return `Error: the three.js code failed:\n${r.error}\nFix the code and call create_3d_model again.`;
  const st = r.stats || {};
  let saved = "";
  if (args.save_path && helperOk) {
    try {
      const w = await uploadPathWrite(String(args.save_path).replace(/\/$/, "") + "/index.html", standaloneHtml(title, code));
      saved = ` Saved a standalone viewer to the workspace: ${w}.`;
    } catch (e) { saved = ` (Could not save to workspace: ${e.message})`; }
  }
  return {
    text: `3D model "${title}" rendered: ${st.meshes || 0} meshes, ${st.triangles || 0} triangles, size ${JSON.stringify(st.size || [])}. It is shown to the user. Snapshot attached below - check proportions, colours and that nothing is missing or floating.${saved}`,
    image: r.snapshot,
    artifact: { kind: "3d", title, code, snapshot: r.snapshot },
  };
}
async function uploadPathWrite(path, content) {
  const r = await PLATFORM.runTool("write_file", { path, content }, { settings, http: PLATFORM.http, confirm: async () => true });
  const j = typeof r === "string" ? JSON.parse(r) : r;
  if (!j.ok) throw new Error(j.error || "write failed");
  return j.path;
}

// ------------------------------------------------------------------ memory
async function localTool(name, args) {
  if (name === "create_3d_model") return create3dTool(args);
  settings.memories = settings.memories || [];
  if (name === "remember") {
    const t = String(args.text || "").trim().slice(0, 500);
    if (!t) throw new Error("Nothing to remember.");
    if (settings.memories.some((m) => m.text.toLowerCase() === t.toLowerCase())) return "Already in memory.";
    const id = "m" + (Math.max(0, ...settings.memories.map((m) => parseInt(String(m.id).slice(1), 10) || 0)) + 1);
    settings.memories.push({ id, text: t, created: Date.now() });
    await saveStore();
    return `Saved to memory as ${id}.`;
  }
  if (name === "forget") {
    const n = settings.memories.length;
    settings.memories = settings.memories.filter((m) => m.id !== String(args.id));
    await saveStore();
    return n === settings.memories.length ? `No memory with id ${args.id}.` : `Forgot ${args.id}.`;
  }
  if (name === "search_chats") {
    const terms = String(args.query || "").toLowerCase().split(/\W+/).filter((w) => w.length > 2);
    if (!terms.length) return "Give a more specific search.";
    const hits = [];
    for (const c of Object.values(chats)) {
      if (c.id === current) continue;
      const texts = c.messages.filter((m) => (m.role === "user" && !m.auto) || (m.role === "assistant" && m.content))
        .map((m) => (m.role === "user" ? "User: " : "AI: ") + (typeof m.content === "string" ? m.content : (m.display || "")));
      const all = (c.title + "\n" + texts.join("\n"));
      const low = all.toLowerCase();
      const score = terms.reduce((n, t) => n + (low.split(t).length - 1), 0);
      if (!score) continue;
      const at = Math.max(0, low.indexOf(terms.find((t) => low.includes(t))) - 120);
      hits.push({ score, text: `"${c.title}" (${new Date(c.updated).toLocaleDateString()}): …${all.slice(at, at + 400).replace(/\s+/g, " ")}…` });
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.length ? hits.slice(0, 6).map((h) => "- " + h.text).join("\n") : "No past chats matched.";
  }
  throw new Error("unknown memory tool");
}
function updateSpeakChip() {
  $("chip-speak").classList.toggle("on", !!settings.speakReplies);
  $("chip-speak").textContent = settings.speakReplies ? "🔊 Voice on" : "🔇";
}

function renderMemories() {
  const list = settings.memories || [];
  $("mem-list").innerHTML = list.length ? list.map((m) => `<div class="mem"><span>${escapeHtml(m.text)} <small>${m.id}</small></span><button data-mdel="${m.id}" title="Forget">🗑</button></div>`).join("")
    : '<div class="hint">Nothing remembered yet. Tell it "remember that…" or add one here.</div>';
}
function wireMemory() {
  $("mem-add").onclick = async () => {
    const t = $("mem-new").value.trim();
    if (!t) return;
    await localTool("remember", { text: t });
    $("mem-new").value = "";
    renderMemories();
  };
  $("mem-list").onclick = async (e) => {
    const b = e.target.closest("[data-mdel]");
    if (b) { await localTool("forget", { id: b.dataset.mdel }); renderMemories(); }
  };
}

// ------------------------------------------------------------------ connections
const PRESETS = {
  github: { name: "GitHub", baseUrl: "https://api.github.com", headerName: "Authorization", headerPrefix: "Bearer ", envVar: "GITHUB_TOKEN, GH_TOKEN", test: "/user",
    notes: "GitHub REST API. Use for repos, issues, releases, Actions.", help: "Create a token at github.com/settings/tokens → Generate new token (classic) → tick 'repo' and 'workflow'." },
  vercel: { name: "Vercel", baseUrl: "https://api.vercel.com", headerName: "Authorization", headerPrefix: "Bearer ", envVar: "VERCEL_TOKEN", test: "/v2/user",
    notes: "Vercel API and CLI (vercel --token $VERCEL_TOKEN).", help: "Create a token at vercel.com/account/tokens." },
  netlify: { name: "Netlify", baseUrl: "https://api.netlify.com/api/v1", headerName: "Authorization", headerPrefix: "Bearer ", envVar: "NETLIFY_AUTH_TOKEN", test: "/user",
    notes: "Netlify API and CLI.", help: "Create a personal access token at app.netlify.com/user/applications." },
  supabase: { name: "Supabase", baseUrl: "https://api.supabase.com/v1", headerName: "Authorization", headerPrefix: "Bearer ", envVar: "SUPABASE_ACCESS_TOKEN", test: "/projects",
    notes: "Supabase management API and CLI.", help: "Create an access token at supabase.com/dashboard/account/tokens." },
  cloudflare: { name: "Cloudflare", baseUrl: "https://api.cloudflare.com/client/v4", headerName: "Authorization", headerPrefix: "Bearer ", envVar: "CLOUDFLARE_API_TOKEN", test: "/user/tokens/verify",
    notes: "Cloudflare API and wrangler CLI.", help: "Create an API token at dash.cloudflare.com/profile/api-tokens." },
  telegram: { name: "Telegram bot", baseUrl: "https://api.telegram.org/bot{token}", headerName: "URL", headerPrefix: "", envVar: "TELEGRAM_BOT_TOKEN", test: "/getMe",
    notes: "Telegram Bot API (sendMessage needs a chat_id).", help: "Talk to @BotFather on Telegram → /newbot → copy the token." },
  custom: { name: "", baseUrl: "", headerName: "Authorization", headerPrefix: "Bearer ", envVar: "", test: "", notes: "", help: "Any REST API that uses a token. Check its docs for the header name." },
};
const CFIELDS = ["name", "baseUrl", "token", "headerName", "headerPrefix", "envVar", "notes"];
let editing = -1; // index being edited, -2 = new

function renderConnections() {
  const list = settings.connections || [];
  $("conn-list").innerHTML = list.length ? list.map((c, i) => `
    <div class="conn"><div class="t"><div>${escapeHtml(c.name)}</div><div>${escapeHtml(c.baseUrl || "")}</div></div>
      <button data-cedit="${i}" title="Edit">✏️</button><button data-cdel="${i}" title="Remove">🗑</button></div>`).join("")
    : '<div class="hint">No connections yet.</div>';
}
function openConnForm(c, idx) {
  editing = idx;
  CFIELDS.forEach((f) => { $("c-" + f).value = c[f] ?? ""; });
  $("c-help").textContent = c.help || "";
  $("c-result").textContent = "";
  $("conn-form").dataset.test = c.test || "";
  $("conn-form").classList.remove("hidden");
}
function readConnForm() {
  const c = {};
  CFIELDS.forEach((f) => { c[f] = $("c-" + f).value.trim(); });
  c.headerPrefix = $("c-headerPrefix").value; // keep trailing space
  c.test = $("conn-form").dataset.test || "";
  return c;
}
async function persistSettings() { await saveStore(); }
function wireConnections() {
  $("conn-add").onclick = () => { const p = PRESETS[$("conn-preset").value]; openConnForm({ ...p }, -2); };
  $("conn-cancel").onclick = () => { $("conn-form").classList.add("hidden"); editing = -1; };
  $("conn-save").onclick = async () => {
    const c = readConnForm();
    if (!c.name || !c.token) { $("c-result").className = "hint bad"; $("c-result").textContent = "Name and token are required."; return; }
    settings.connections = settings.connections || [];
    if (editing >= 0) settings.connections[editing] = c; else settings.connections.push(c);
    await persistSettings();
    $("conn-form").classList.add("hidden"); editing = -1;
    renderConnections();
  };
  $("conn-test").onclick = async () => {
    const c = readConnForm();
    const out = $("c-result");
    out.className = "hint"; out.textContent = "Testing…";
    try {
      const r = await PLATFORM.runTool("call_api", { connection: c.name || "x", method: "GET", path: c.test || "/" },
        { settings: { connections: [{ ...c, name: c.name || "x" }], confirmMode: "never" }, http: PLATFORM.http, confirm: async () => true });
      const ok = /^HTTP 2\d\d/.test(r);
      out.className = "hint " + (ok ? "ok" : "bad");
      out.textContent = (ok ? "Works! " : "Problem: ") + r.slice(0, 300);
    } catch (e) { out.className = "hint bad"; out.textContent = "Failed: " + e.message; }
  };
  $("conn-list").onclick = async (e) => {
    const ed = e.target.closest("[data-cedit]"), del = e.target.closest("[data-cdel]");
    if (ed) { const c = settings.connections[+ed.dataset.cedit]; const p = Object.values(PRESETS).find((x) => x.name === c.name) || {}; openConnForm({ help: p.help, ...c }, +ed.dataset.cedit); }
    if (del) { settings.connections.splice(+del.dataset.cdel, 1); await persistSettings(); renderConnections(); }
  };
}

// ------------------------------------------------------------------ input
function autosize() {
  const t = $("input");
  t.style.height = "auto";
  t.style.height = Math.min(t.scrollHeight, 180) + "px";
}

function wire() {
  wireConnections();
  wireProjects();
  wireBackup();
  $("btn-mic").onclick = startVoice;
  $("chip-speak").onclick = async () => { settings.speakReplies = !settings.speakReplies; if (!settings.speakReplies) stopSpeaking(); updateSpeakChip(); await saveStore(); };
  $("upd-check").onclick = () => checkUpdates(true);
  $("upd-install").onclick = installUpdate;
  $("upd-rollback").onclick = rollbackUpdate;
  $("update-banner").onclick = (e) => { if (e.target.closest("[data-upd-go]")) installUpdate(); else if (e.target.closest("[data-upd-x]")) $("update-banner").classList.add("hidden"); };
  if ($("history-all")) $("history-all").onchange = renderHistory;
  $("v3d-reset").onclick = async () => { const f = await getViewer("overlay"); f.contentWindow.postMessage({ type: "km3d-reset" }, "*"); };
  $("v3d-glb").onclick = () => { const a = findArtifact($("view-3d").dataset.id); if (a) exportGlb(a); };
  $("v3d-png").onclick = async () => {
    const a = findArtifact($("view-3d").dataset.id);
    const f = await getViewer("overlay");
    const r = await askViewer(f, { type: "km3d-png" }, "km3d-pngdata");
    if (r.dataUrl) saveBlob(dataUrlToBlob(r.dataUrl), slug(a && a.title) + ".png");
  };
  $("img-full").onclick = () => $("view-img").classList.add("hidden");
  wireMemory();
  $("btn-attach").onclick = () => $("file-input").click();
  $("file-input").onchange = (e) => { addFiles(e.target.files); e.target.value = ""; };
  $("attach-row").onclick = (e) => {
    const b = e.target.closest("[data-unattach]");
    if (b) { pendingFiles.splice(+b.dataset.unattach, 1); renderAttachments(); }
  };
  $("input").addEventListener("paste", (e) => {
    const files = [...(e.clipboardData ? e.clipboardData.files : [])];
    if (files.length) { e.preventDefault(); addFiles(files); }
  });
  document.addEventListener("dragover", (e) => { e.preventDefault(); document.body.classList.add("dragging"); });
  document.addEventListener("dragleave", (e) => { if (!e.relatedTarget) document.body.classList.remove("dragging"); });
  document.addEventListener("drop", (e) => {
    e.preventDefault(); document.body.classList.remove("dragging");
    if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  });
  $("input").addEventListener("input", autosize);
  $("input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send($("input").value); }
  });
  $("btn-send").onclick = () => (running ? running.abort() : send($("input").value));
  $("btn-new").onclick = () => { if (running) return; current = null; render(); saveChats(); $("input").focus(); };
  $("btn-history").onclick = openHistory;
  $("btn-settings").onclick = openSettings;
  $("chip-model").onclick = openSettings;
  $("strong").onchange = () => {
    if ($("strong").checked && !settings.strongModel) { $("strong").checked = false; openSettings(); $("s-key-result").textContent = "Set a strong model first."; }
    updateChips();
  };
  document.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => b.closest(".overlay").classList.add("hidden")));
  $("s-save").onclick = async () => { await saveSettings(); $("view-settings").classList.add("hidden"); render(); };
  $("s-load-models").onclick = loadModels;
  $("s-test-key").onclick = testKey;
  $("s-test-helper").onclick = testHelper;
  $("s-clear").onclick = () => {
    if (running) return;
    if (!$("s-clear").dataset.sure) { $("s-clear").dataset.sure = "1"; $("s-clear").textContent = "Tap again to delete ALL chats"; return; }
    chats = {}; current = null; saveChats(); render();
    delete $("s-clear").dataset.sure; $("s-clear").textContent = "Delete all chats";
  };
  $("history-search").oninput = renderHistory;
  $("history-list").onclick = (e) => {
    const del = e.target.closest("[data-del]");
    if (del) {
      if (running && del.dataset.del === current) return;
      delete chats[del.dataset.del];
      if (current === del.dataset.del) current = null;
      saveChats(); renderHistory(); render(); return;
    }
    const item = e.target.closest(".h-item");
    if (item && !running) { current = item.dataset.id; saveChats(); render(); $("view-history").classList.add("hidden"); $("messages").scrollTop = 1e9; }
  };
  $("messages").addEventListener("click", (e) => {
    const o3 = e.target.closest("[data-open3d]"), gl = e.target.closest("[data-glb]"), cd = e.target.closest("[data-code3d]");
    const di = e.target.closest("[data-dlimg]"), fu = e.target.closest("[data-full]");
    if (o3) { const a = findArtifact(o3.dataset.open3d); if (a) open3d(a); return; }
    if (gl) { const a = findArtifact(gl.dataset.glb); if (a) exportGlb(a); return; }
    if (cd) { const a = findArtifact(cd.dataset.code3d); if (a) copyToClipboard(a.code); return; }
    if (di) { const a = findArtifact(di.dataset.dlimg); if (a) saveBlob(dataUrlToBlob(a.url), slug(a.prompt) + (a.url.startsWith("data:image/jpeg") ? ".jpg" : ".png")); return; }
    if (fu) { const a = findArtifact(fu.dataset.full); if (a) { $("view-img").classList.remove("hidden"); $("img-full").src = a.url; } return; }
    if (e.target.closest("[data-resume]")) {
      const c = chats[current];
      if (c && !running) { c.interrupted = false; c.messages.push({ role: "user", content: "Please continue where you left off." }); runChat(c); }
      return;
    }
    const s = e.target.closest("[data-s]");
    if (s) { send(s.dataset.s); return; }
    const copy = e.target.closest(".copy");
    if (copy) {
      const code = copy.closest(".code").querySelector("code").innerText;
      navigator.clipboard.writeText(code).then(() => { copy.textContent = "Copied"; setTimeout(() => (copy.textContent = "Copy"), 1200); });
    }
  });
  $("messages").addEventListener("toggle", (e) => {
    const d = e.target;
    if (d.dataset && d.dataset.id) d.open ? openSteps.add(d.dataset.id) : openSteps.delete(d.dataset.id);
  }, true);
}

(async function init() {
  if (/[?&]mic=1/.test(location.search)) {
    document.body.innerHTML = `<div class="welcome" style="margin:auto;padding:30px"><img src="icons/icon128.png" alt=""><h1>Allow the microphone</h1>
      <p>Kash Moni needs microphone access for voice input. Click the button and choose <b>Allow</b>.</p>
      <button id="mic-ok" class="btn primary">Allow microphone</button><p id="mic-res" class="hint"></p></div>`;
    document.getElementById("mic-ok").onclick = async () => {
      try { (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((t) => t.stop()); document.getElementById("mic-res").textContent = "Done! Close this tab and use 🎤 in the side panel."; }
      catch (e) { document.getElementById("mic-res").textContent = "Blocked: " + e.message + ". Check the site settings for this extension."; }
    };
    return;
  }
  await load();
  for (const c of Object.values(chats)) if (c.running) { c.running = false; c.interrupted = true; }
  wire();
  render();
  renderProjectChip();
  updateSpeakChip();
  checkHelper().then(() => checkUpdates(false)).catch(() => {});
  setInterval(() => { if (!running) checkHelper(); }, 20000);
  $("input").focus();
})();
