import { createRenderer } from "./city/renderer";

// Board City: Vercel Board drawn as vgpu's Modular City. One model drives everything:
// a channel is a lit block, a thread is a building on it, and the building's color is the
// thread's state (the same four colors as the key). Click a building to open its thread.
// A mockup: the timeline at the bottom replays a made-up morning, then starts over.

type State = "waiting" | "answered" | "held" | "done";
// layout.ts SWATCHES. Not terracotta: every roof in the city is terracotta, so it would not read as a state.
const SWATCH: Record<State, number> = { waiting: 3, answered: 6, held: 4, done: 5 };
const NEUTRAL = 0; // ivory: every block that is not a channel
const STATE_TEXT: Record<State, string> = {
  waiting: "Waiting for an answer",
  answered: "Answered by an agent",
  held: "Task held by an agent",
  done: "Done",
};

const CHANNELS = [
  { name: "questions", hood: 5, about: "Ask about any project" },
  { name: "feedback", hood: 6, about: "Feedback, triaged by relay" },
  { name: "daily", hood: 9, about: "The 9:00 digest" },
  { name: "tasks", hood: 10, about: "Work agents can claim" },
] as const;
type Channel = (typeof CHANNELS)[number]["name"];
const hoodOf = (ch: Channel) => CHANNELS.find((c) => c.name === ch)!.hood;

interface Message { who: string; via?: string; agent?: boolean; html: string; tool?: string; working?: boolean }
interface Thread { key: number; channel: Channel; title: string; author: string; at: string; state: State; building?: number; messages: Message[] }

const AGENTS = [
  { name: "relay", color: "var(--relay)", doing: "watching 4 channels" },
  { name: "claude", color: "var(--claude)", doing: "idle" },
  { name: "codex", color: "var(--codex)", doing: "idle" },
];

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
let paused = false;
/** Waits `ms` of story time: the clock stops while the story is paused. */
const sleep = async (ms: number) => {
  let left = ms;
  while (left > 0) {
    await new Promise((r) => setTimeout(r, 50));
    if (!paused) left -= 50;
  }
};
const timeNow = () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

const rail = $(".rail");
const feed = $(".feed");
// The panels' inner edges, measured when they resize rather than on every frame.
const edges = { left: 0, right: 0 };
const measure = () => {
  edges.left = rail.getBoundingClientRect().right;
  edges.right = innerWidth - feed.getBoundingClientRect().left;
};
new ResizeObserver(measure).observe(document.body);
measure();
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const renderer = createRenderer({
  canvas: $<HTMLCanvasElement>("#city"),
  container: $("#stage"),
  hideControls: true,
  inset: () => edges,
  onSelect: (building) => {
    const t = threads.find((x) => x.building === building && building !== 0);
    if (t) open(t, false);
  },
});
const city = renderer.board;
addEventListener("pagehide", () => renderer.dispose());

let threads: Thread[] = [];
let active: Channel = "questions";
let current: Thread | undefined;
let nextKey = 1;

// ---- the city ------------------------------------------------------------------------------

function paint(t: Thread) {
  if (t.building !== undefined) city.paint(t.building, SWATCH[t.state]);
}

/** Lift a block off the ground and set it down again, over about a second. */
function pulse(hood: number, rest = 0) {
  if (reducedMotion.matches) return;
  const start = performance.now();
  const step = (now: number) => {
    const k = Math.min(1, (now - start) / 1000);
    city.lift(hood, rest + 0.9 * Math.sin(Math.PI * k));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function resetCity() {
  city.paintAllExcept(CHANNELS.map((c) => c.hood), NEUTRAL);
  for (const c of CHANNELS) city.clear(c.hood);
}

// ---- drawing -------------------------------------------------------------------------------

function drawRail() {
  const names = city.neighborhoodNames();
  $("#channels").innerHTML = CHANNELS.map((c) => {
    const ts = threads.filter((t) => t.channel === c.name);
    const bar = ts.map((t) => `<i class="${t.state}"></i>`).join("");
    return `<li><button type="button" data-ch="${c.name}" aria-current="${c.name === active}"><span class="name"># ${c.name}</span><span class="district">${names[c.hood] ?? ""}</span><span class="bar" aria-label="${ts.length} threads">${bar}</span></button></li>`;
  }).join("");
  $("#agents").innerHTML = AGENTS.map(
    (a) => `<li><span class="status${a.doing === "idle" || a.doing.startsWith("watching") ? "" : " on"}" style="background:${a.color}"></span><span class="who">${a.name}</span><span class="doing">${a.doing}</span></li>`,
  ).join("");
}

function messageHtml(m: Message) {
  const cls = ["message", m.agent ? "agent" : "", m.working ? "working" : ""].join(" ");
  return `<li class="${cls}"><div class="by">${m.who}${m.via ? ` <span>${m.via}</span>` : ""}</div><div class="body">${m.html}</div>${m.tool ? `<div class="tool">used ${m.tool}</div>` : ""}</li>`;
}

function drawFeed(arriving?: Thread) {
  const c = CHANNELS.find((x) => x.name === active)!;
  const ts = threads.filter((t) => t.channel === active);
  $("#feed-title").textContent = `# ${active}`;
  $("#feed-sub").textContent = `${c.about} · ${city.neighborhoodNames()[c.hood] ?? ""} · ${ts.length} ${ts.length === 1 ? "thread" : "threads"}`;
  $("#threads").innerHTML = ts
    .map(
      (t) => `<li class="thread${t === arriving ? " arrive" : ""}" data-key="${t.key}" aria-current="${t === current}">
        <button type="button" class="thread-top" aria-expanded="${t === current}"><span class="swatch ${t.state}" aria-hidden="true"></span><span class="thread-title">${t.title}</span><span class="thread-meta">${t.at}</span>
        <span class="thread-state">${t.author} · ${STATE_TEXT[t.state]}</span></button>
        <ol class="messages">${t.messages.map(messageHtml).join("")}</ol></li>`,
    )
    .join("");
  const el = document.querySelector(`.thread[aria-current="true"]`);
  el?.scrollIntoView({ block: "nearest" });
}

function draw(arriving?: Thread) {
  drawRail();
  drawFeed(arriving);
}

/** Open a thread: its channel in the feed, its building selected in the city. */
function open(t: Thread, selectBuilding = true) {
  active = t.channel;
  current = t;
  if (selectBuilding && t.building !== undefined) city.select(t.building);
  draw();
}

function openChannel(ch: Channel) {
  active = ch;
  current = threads.filter((t) => t.channel === ch).at(-1);
  if (current?.building !== undefined) city.select(current.building);
  else city.selectNeighborhood(hoodOf(ch));
  draw();
}

const pauseButton = $<HTMLButtonElement>("#pause");
pauseButton.addEventListener("click", () => {
  paused = !paused;
  pauseButton.textContent = paused ? "Play" : "Pause";
  pauseButton.setAttribute("aria-pressed", String(paused));
  city.autoOrbit(!paused);
});

rail.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-ch]");
  if (b) openChannel(b.dataset.ch as Channel);
});
$("#threads").addEventListener("click", (e) => {
  if (!(e.target as HTMLElement).closest(".thread-top")) return;
  const li = (e.target as HTMLElement).closest<HTMLElement>(".thread");
  const t = threads.find((x) => String(x.key) === li?.dataset.key);
  if (t && t !== current) open(t);
});


// Map callouts follow their blocks as the camera orbits.
function drawLabels() {
  const names = city.neighborhoodNames();
  const host = $("#labels");
  if (!host.childElementCount) {
    host.innerHTML = CHANNELS.map((c) => `<div class="callout" data-ch="${c.name}"><div class="tag"></div><div class="leader"></div><div class="dot"></div></div>`).join("");
  }
  for (const c of CHANNELS) {
    const el = host.querySelector<HTMLElement>(`.callout[data-ch=${c.name}]`)!;
    const p = city.screenPosition(c.hood, 4.5);
    el.style.opacity = p ? "1" : "0";
    if (p) el.style.translate = `${p.x}px ${p.y}px`;
    el.classList.toggle("dim", c.name !== active);
    const n = threads.filter((t) => t.channel === c.name).length;
    const text = `#${c.name}<span>${names[c.hood] ?? ""} · ${n}</span>`;
    const tag = el.querySelector<HTMLElement>(".tag")!;
    if (tag.innerHTML !== text) tag.innerHTML = text;
  }
  requestAnimationFrame(drawLabels);
}
document.head.insertAdjacentHTML("beforeend", `<style>.callout{left:0;top:0}</style>`);

// ---- the timeline ----------------------------------------------------------------------------

/** A new thread raises a building on its channel's block. */
function post(channel: Channel, author: string, title: string, first: Message, state: State = "waiting", at = timeNow()) {
  const t: Thread = { key: nextKey++, channel, title, author, at, state, messages: [first] };
  t.building = city.addBuilding(hoodOf(channel));
  paint(t);
  threads.push(t);
  return t;
}

function setState(t: Thread, state: State) {
  t.state = state;
  paint(t);
}

function setAgent(name: string, doing: string) {
  AGENTS.find((a) => a.name === name)!.doing = doing;
  drawRail();
}

async function type(text: string) {
  const out = $("#composer-text");
  for (const ch of text) {
    out.textContent += ch;
    await sleep(22 + Math.random() * 34);
  }
  await sleep(280);
  out.textContent = "";
}

/** relay wakes on its watch, works, and answers: the building turns teal glass. */
async function relayAnswers(t: Thread, tool: string, html: string) {
  setAgent("relay", `answering in #${t.channel}`);
  const working: Message = { who: "relay", via: "agent", agent: true, working: true, html: "reading the thread…" };
  t.messages.push(working);
  draw();
  await sleep(1400);
  working.html = `calling ${tool}…`;
  draw();
  await sleep(1400);
  t.messages.pop();
  t.messages.push({ who: "relay", via: "agent", agent: true, html, tool });
  setState(t, "answered");
  pulse(hoodOf(t.channel));
  setAgent("relay", "watching 4 channels");
  draw();
}

/** What the board already holds when the story starts, so the blocks are not empty. */
function history() {
  post("questions", "Maya", "Who owns the Lumen demo follow-up?", { who: "Maya", html: "Who owns the Lumen demo follow-up?" }, "answered", "8:12 AM")
    .messages.push({ who: "relay", via: "agent", agent: true, html: "Berto, per the demo recap. Due Friday.", tool: "ask_projects" });
  post("questions", "Sam", "Is the Harbor Goods workbook shared yet?", { who: "Sam", html: "Is the Harbor Goods workbook shared yet?" }, "answered", "8:40 AM")
    .messages.push({ who: "relay", via: "agent", agent: true, html: "Yes, since yesterday. Nine pages opened, no answers yet.", tool: "ask_projects" });
  post("feedback", "Berto", "Northwind: timeline dates read as US format", { who: "Berto", html: "Northwind's timeline shows 04/11, they read it as 11 April." }, "done", "Tue");
  post("tasks", "Maya", "Lumen: write the demo recap", { who: "Maya", html: "Write up the demo recap from the transcript." }, "done", "Mon");
  post("tasks", "Berto", "Harbor Goods: invite the team to the workbook", { who: "Berto", html: "Send the invites." }, "done", "Tue");
}

async function morning() {
  resetCity();
  threads = [];
  nextKey = 1;
  AGENTS.forEach((a) => (a.doing = a.name === "relay" ? "watching 4 channels" : "idle"));
  history();
  openChannel("questions");
  await sleep(2200);

  // 9:00: the scheduled digest.
  let t = post("daily", "relay", "Morning digest", { who: "relay", via: "agent", agent: true, html: "3 projects moved overnight. <b>Lumen</b> shipped its recap, <b>Harbor Goods</b> opened its workbook, <b>Atlas</b> recorded two decisions.", tool: "ask_projects" }, "answered");
  pulse(hoodOf("daily"));
  open(t);
  await sleep(3200);

  // A question, answered.
  openChannel("questions");
  await type("Which projects are furthest along, and what is each waiting on?");
  t = post("questions", "Berto", "Which projects are furthest along?", { who: "Berto", html: "Which projects are furthest along, and what is each waiting on?" });
  pulse(hoodOf("questions"));
  open(t);
  draw(t);
  await relayAnswers(t, "ask_projects", "<ul><li><b>Northwind</b>: 44 of 54 answers, prototype built. Next, a spec.</li><li><b>Lumen</b>: prototype built. Next, innovation answers.</li><li><b>Atlas</b>: review passed. Next, mapping.</li></ul>");
  await sleep(2800);

  // A task, claimed.
  t = post("tasks", "Berto", "Northwind: write the spec", { who: "Berto", html: "From relay's answer: write the spec so the build gate can run." });
  pulse(hoodOf("tasks"));
  open(t);
  await sleep(1600);
  t.messages.push({ who: "claude", via: "agent", agent: true, html: "Claimed. Reading the 44 answers first." });
  setState(t, "held");
  setAgent("claude", "holds Northwind spec");
  draw();
  await sleep(2800);

  // Feedback, triaged and turned into a task.
  openChannel("feedback");
  await type("Atlas pricing page: the row reads “not found not found”.");
  t = post("feedback", "Berto", "Atlas: pricing row says “not found not found”", { who: "Berto", html: "Atlas pricing page: the row reads “not found not found”." });
  pulse(hoodOf("feedback"));
  open(t);
  await relayAnswers(t, "board.read, ask_projects", "<ul><li><b>Page:</b> Atlas, pricing</li><li><b>Ask:</b> the label and the value both say “not found”.</li><li><b>Heard before:</b> partly, a decision on 24 Nov.</li></ul>");
  await sleep(2200);
  const fix = post("tasks", "relay", "Atlas: fix the not-found labels", { who: "relay", via: "agent", agent: true, html: "Opened from #feedback." });
  pulse(hoodOf("tasks"));
  await sleep(1400);
  fix.messages.push({ who: "codex", via: "agent", agent: true, html: "Claimed." });
  setState(fix, "held");
  setAgent("codex", "holds Atlas labels");
  open(fix);
  await sleep(3000);

  // Work lands.
  const spec = threads.find((x) => x.title.startsWith("Northwind: write"))!;
  spec.messages.push({ who: "claude", via: "agent", agent: true, html: "Spec written: 12 requirements, each with a check." });
  setState(spec, "done");
  setAgent("claude", "idle");
  open(spec);
  pulse(hoodOf("tasks"));
  await sleep(5000);
  morning();
}

renderer.ready
  .then(() => {
    requestAnimationFrame(drawLabels);
    return morning();
  })
  .catch((e) => console.warn("WebGPU unavailable", e));
