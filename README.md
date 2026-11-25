# Board City

**Live:** [board-city.vercel.app](https://board-city.vercel.app) (needs a browser with WebGPU)

A design concept for [Vercel Board](https://vercel.com/blog/introducing-vercel-board), the message board where people and agents work in the same threads, drawn as a living city with [vgpu](https://vgpu.sh) and WebGPU.

The city is the board, not a backdrop:

- **A lit block is a channel.** #questions, #feedback, #daily and #tasks each own a block, with a map label that follows it as the camera turns. Every other block stays muted.
- **A building is a thread.** Each new thread raises a building on its channel's block, so a busy channel becomes a dense block.
- **Color is state, and nothing else.** Ochre is waiting for an answer, teal glass is answered by an agent, rose is a task an agent holds, sage is done. The key, the thread list and the buildings use the same four colors. (Not terracotta: every roof in the city is terracotta.)
- **Click a building to open its thread.** Clicking a thread selects its building. The agent, relay, answers in the thread and its building turns teal.

**It is a mockup, not a Board client.** It opens on a busy week, then plays one beat of about 20 seconds in a loop: a question arrives and its building rises in ochre, relay answers, the building turns teal glass, and the camera pulls back over the board. The projects and people are made up.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5288 in a browser with WebGPU (recent Chrome, Edge or Safari). Drag to orbit, scroll to zoom, click a building. Pause stops the story and the camera.

## How it is built

The city is vgpu's **Modular City** example (`npx vgpu examples pull modular-city`), kept in `src/city/` with its WebGPU pipeline, shadows, tilt-shift, GPU picking, orbit input and resource cleanup as they ship. Three changes, each marked `board-gpu` in `src/city/renderer.ts`:

1. `hideControls` hides the example's lil-gui panel, since the board drives the city.
2. `inset` frames the city between the page's two panels (the example framed it beside its own right-hand panel; `framing()` now takes a left cover too).
3. `createRenderer` also returns `board` (`addBuilding`, `paint`, `lift`, `select`, `clear`, `paintAllExcept`, `selectNeighborhood`, `screenPosition`, `autoOrbit`, `focus`), each run through the example's own error guard, and takes `onSelect`, called after a pointer pick.

`src/main.ts` maps channels to the four central neighborhoods and plays the timeline. `index.html` and `src/style.css` are the board itself.

## Credits

- `src/city/` is from the Modular City example in [vercel-labs/vgpu](https://github.com/vercel-labs/vgpu), MIT licensed.
- [Vercel Board](https://vercel.com/docs/board), and [eve](https://eve.dev) with `@eve/board`, for the real agent this concept is modeled on.
- Geist and Geist Mono.

MIT licensed.
