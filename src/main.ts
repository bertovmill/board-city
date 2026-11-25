import { createRenderer } from "./city/renderer";

// Board City: a design concept for Vercel Board. The city is vgpu's Modular City example. Each
// board channel is a neighborhood, each new thread raises a building there, and when an agent
// answers, its building turns teal glass. A mockup: the timeline below replays a made-up morning.

const SWATCH_NEW = 0; // ivory: a thread nobody has answered yet
const SWATCH_ANSWERED = 6; // teal glass: an agent answered it

const CHANNELS = [
  { name: "questions", hood: 5 },
  { name: "feedback", hood: 6 },
  { name: "daily", hood: 9 },
  { name: "general", hood: 10 },
] as const;
type Channel = (typeof CHANNELS)[number]["name"];

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const rail = $<HTMLElement>("#rail");
const feed = $<HTMLElement>("#feed");
const canvas = $<HTMLCanvasElement>("#city");

const renderer = createRenderer({
  canvas,
  container: $<HTMLElement>("#stage"),
  hideControls: true,
  // Frame the city in the gap between the two panels.
  inset: () => {
    const r = rail.getBoundingClientRect();
    const f = feed.getBoundingClientRect();
    return { left: r.right, right: innerWidth - f.left };
  },
});
const city = renderer.board;
addEventListener("pagehide", () => renderer.dispose());

// The rail lists each channel with the neighborhood it lives in.
async function drawChannels() {
  await renderer.ready.catch((e) => console.warn("WebGPU unavailable, the city stays dark", e));
  const names = city.neighborhoodNames();
  $("#channels").innerHTML = CHANNELS.map(
    (c) => `<div class="row${c.name === "questions" ? " active" : ""}" data-ch="${c.name}"><span># ${c.name}</span><span class="district">${names[c.hood] ?? ""}</span></div>`,
  ).join("");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clockText = () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const stats = { threads: 0, replies: 0 };
const bump = (key: keyof typeof stats) => {
  stats[key] += 1;
  $(`#stat-${key}`).textContent = String(stats[key]);
};

/** A neighborhood rises off the ground and settles, over about a second. */
function liftPulse(hood: number) {
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / 1100);
    city.lift(hood, 1.1 * Math.sin(Math.PI * t));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function focusChannel(ch: Channel) {
  $("#feed-title").innerHTML = `<span class="hash">#</span>${ch}`;
  document.querySelectorAll(".row").forEach((r) => r.classList.toggle("active", (r as HTMLElement).dataset.ch === ch));
  const row = document.querySelector(`.row[data-ch=${ch}]`);
  row?.classList.add("flash");
  setTimeout(() => row?.classList.remove("flash"), 900);
}

const threads = $<HTMLDivElement>("#threads");
const composer = $<HTMLSpanElement>("#composer-text");

/** A new thread: a message in the feed and a new building in the channel's neighborhood. */
function thread(ch: Channel, avatar: string, who: string, via: string, text: string) {
  const hood = CHANNELS.find((c) => c.name === ch)!.hood;
  focusChannel(ch);
  const id = city.addBuilding(hood);
  if (id !== undefined) {
    city.paint(id, SWATCH_NEW);
    city.select(id);
  }
  liftPulse(hood);
  bump("threads");
  const el = document.createElement("div");
  el.className = "msg";
  const district = city.neighborhoodNames()[hood] ?? "";
  el.innerHTML = `<span class="avatar ${avatar}">${who[0]!.toUpperCase()}</span><div class="body"><div class="who">${who}${via ? ` <span class="via">via ${via}</span>` : ""}<time>${clockText()}</time></div><div class="text">${text}</div><div class="where">+ a building in ${district}</div></div>`;
  threads.append(el);
  while (threads.children.length > 3) threads.firstElementChild!.remove();
  return { body: el.querySelector(".body")!, id };
}

async function type(text: string) {
  composer.textContent = "";
  for (const ch of text) {
    composer.textContent += ch;
    await sleep(24 + Math.random() * 36);
  }
  await sleep(300);
  composer.textContent = "";
}

function agentState(sel: string, cls: string, text: string) {
  $(sel).innerHTML = `<i class="${cls}"></i> ${text}`;
}

/** seed wakes on its watch, calls a tool, answers, and the thread's building turns teal glass. */
async function answer(t: { body: Element; id: number | undefined }, tool: string, html: string) {
  agentState("#seed-state", "woke", "woken by a watch");
  const typing = document.createElement("div");
  typing.className = "typing";
  typing.textContent = "seed is working...";
  t.body.append(typing);
  await sleep(1500);
  typing.textContent = `seed called ${tool}...`;
  await sleep(1300);
  typing.remove();
  const reply = document.createElement("div");
  reply.className = "reply";
  reply.innerHTML = `<div class="who">seed <span class="via">agent</span><time>${clockText()}</time></div>${html}<div class="tool"><span class="ok">✓</span> ${tool}</div>`;
  t.body.append(reply);
  if (t.id !== undefined) {
    city.paint(t.id, SWATCH_ANSWERED);
    city.select(t.id);
  }
  bump("replies");
  agentState("#seed-state", "idle", "watching 4 channels");
}

function task(state: "ready" | "held" | "done", text: string) {
  const el = document.createElement("div");
  el.className = "task";
  el.innerHTML = `<span class="state ${state}">${state}</span>${text}`;
  $("#tasks").prepend(el);
  while ($("#tasks").children.length > 3) $("#tasks").lastElementChild!.remove();
}

async function morning() {
  await sleep(1500);
  let t = thread("daily", "s", "seed", "agent", "<b>Morning digest:</b> 3 projects moved overnight. Lumen shipped its demo recap, Harbor Goods opened its workbook, Atlas recorded two decisions.");
  if (t.id !== undefined) city.paint(t.id, SWATCH_ANSWERED);
  bump("replies");
  await sleep(3000);

  await type("Which projects are furthest along, and what is each waiting on?");
  t = thread("questions", "b", "Berto", "", "Which projects are furthest along, and what is each waiting on?");
  await answer(t, "ask_projects", `<ul><li><b>Northwind:</b> 44 of 54 answers in, prototype built. Next, a spec.</li><li><b>Lumen:</b> 7 meetings, prototype built. Next, innovation answers.</li><li><b>Atlas:</b> review gate passed. Next, mapping.</li></ul>`);
  await sleep(2600);

  task("held", "Northwind · write the spec");
  agentState("#claude-state", "busy", "holds Northwind spec");
  t = thread("general", "c", "claude", "a teammate", "Claimed <b>Northwind · write the spec</b>. Reading the 44 answers first.");
  await sleep(3200);

  await type("Atlas pricing page: the row reads \"not found not found\".");
  t = thread("feedback", "b", "Berto", "", `Atlas pricing page: the row reads "not found not found".`);
  await answer(t, "board.read · ask_projects", `<ul><li><b>Project:</b> Atlas, pricing page</li><li><b>Ask:</b> the label and the value both say "not found".</li><li><b>Heard before:</b> partly, in a decision on 24 Nov.</li></ul>`);
  task("ready", "Atlas · fix the not-found labels");
  await sleep(1800);
  task("held", "Atlas · fix the not-found labels");
  agentState("#codex-state", "busy", "holds Atlas labels");
  await sleep(3000);

  task("done", "Northwind · write the spec");
  agentState("#claude-state", "idle", "idle");
  await sleep(4000);
  threads.innerHTML = "";
  morning();
}

drawChannels().then(morning);
