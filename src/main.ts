import { createRenderer } from "./city/renderer";

// Board City: Vercel Board drawn as vgpu's Modular City. One model drives everything:
// a channel is a lit block, a thread is a building on it, and the building's color is the
// thread's state (the same four colors as the key). Click a building to open its thread.
// A mockup: story() at the bottom replays one made-up beat of about 20 seconds, then starts over.

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

/** What the board already holds when the story starts: a busy week, mostly settled. */
const HISTORY: Record<Channel, readonly [string, string, State][]> = {
  questions: [
    ["Who owns the Lumen demo follow-up?", "Maya", "answered"],
    ["Is the Harbor Goods workbook shared yet?", "Sam", "answered"],
    ["When is Northwind's next review?", "Berto", "answered"],
    ["Which connectors does Atlas use?", "Priya", "answered"],
    ["Did Lumen sign off on the brief?", "Sam", "answered"],
    ["What did Harbor Goods say about pricing?", "Maya", "answered"],
    ["How many interviews does Atlas have?", "Berto", "answered"],
    ["Is the Northwind prototype on staging?", "Priya", "answered"],
    ["Where are the Lumen meeting notes?", "Sam", "answered"],
  ],
  feedback: [
    ["Northwind: timeline dates read as US format", "Berto", "done"],
    ["Lumen: chart legend covers the last bar", "Maya", "done"],
    ["Atlas: search ignores accents", "Priya", "done"],
    ["Harbor Goods: logo is blurry on retina", "Sam", "done"],
    ["Northwind: export button hidden on mobile", "Berto", "answered"],
    ["Lumen: wants weekly instead of daily emails", "Maya", "done"],
    ["Atlas: empty state reads as an error", "Priya", "done"],
    ["Harbor Goods: filters reset on back", "Sam", "answered"],
  ],
  daily: [
    ["Digest, Monday", "relay", "answered"],
    ["Digest, Tuesday", "relay", "answered"],
    ["Digest, Wednesday", "relay", "answered"],
    ["Digest, Thursday", "relay", "answered"],
    ["Digest, Friday", "relay", "answered"],
    ["Digest, last Monday", "relay", "answered"],
    ["Digest, last Tuesday", "relay", "answered"],
    ["Digest, last Wednesday", "relay", "answered"],
  ],
  tasks: [
    ["Lumen: write the demo recap", "claude", "done"],
    ["Harbor Goods: invite the team", "codex", "done"],
    ["Northwind: write the spec", "claude", "held"],
    ["Atlas: fix the not-found labels", "codex", "held"],
    ["Lumen: tidy the transcript", "claude", "done"],
    ["Atlas: map the pricing jobs", "codex", "done"],
    ["Northwind: draft the review deck", "claude", "done"],
    ["Harbor Goods: clean the logo set", "codex", "done"],
    ["Lumen: build the alerts page", "claude", "done"],
  ],
};
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

function history() {
  for (const c of CHANNELS) {
    HISTORY[c.name].forEach(([title, author, state], i) => {
      const agent = author === "relay" || author === "claude" || author === "codex";
      const t = post(c.name, author, title, { who: author, via: agent ? "agent" : undefined, agent, html: title }, state, DAYS[i % DAYS.length]);
      if (state === "answered" && !agent) t.messages.push({ who: "relay", via: "agent", agent: true, html: "Answered from the project's records.", tool: "ask_projects" });
    });
  }
}

const BOARD = CHANNELS.map((c) => c.hood);
const WIDE = 92; // the four channel blocks fill the gap between the panels
const CLOSE = 48; // one block

/**
 * One beat, about 20 seconds: a question arrives and its building rises in ochre on #questions,
 * relay answers, the building turns teal glass, and the camera pulls back over the whole board.
 */
async function story() {
  resetCity();
  threads = [];
  nextKey = 1;
  AGENTS.forEach((a) => (a.doing = a.name === "relay" ? "watching 4 channels" : a.name === "claude" ? "holds Northwind spec" : "holds Atlas labels"));
  history();
  city.focus(BOARD, WIDE);
  openChannel("questions");
  await sleep(3000);

  city.focus([hoodOf("questions")], CLOSE);
  await type("Which projects are furthest along, and what is each waiting on?");
  const t = post("questions", "Berto", "Which projects are furthest along?", { who: "Berto", html: "Which projects are furthest along, and what is each waiting on?" });
  pulse(hoodOf("questions"));
  open(t);
  draw(t);
  await sleep(1200);
  await relayAnswers(t, "ask_projects", "<ul><li><b>Northwind</b>: 44 of 54 answers, prototype built. Next, a spec.</li><li><b>Lumen</b>: prototype built. Next, innovation answers.</li><li><b>Atlas</b>: review passed. Next, mapping.</li></ul>");
  await sleep(2200);

  city.focus(BOARD, WIDE);
  await sleep(5500);
  story();
}

renderer.ready
  .then(() => {
    requestAnimationFrame(drawLabels);
    return story();
  })
  .catch((e) => console.warn("WebGPU unavailable", e));
