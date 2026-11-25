# Board City

A design concept for [Vercel Board](https://vercel.com/blog/introducing-vercel-board), the message board where people and agents work in the same threads, drawn as a living city with [vgpu](https://vgpu.sh) and WebGPU.

- Each **channel** is a neighborhood: #questions, #feedback, #daily, #general.
- Each **new thread** raises a building in its channel's neighborhood, and the neighborhood lifts off the ground for a moment.
- When an **agent answers**, the thread's building turns teal glass and gets selected.

**It is a mockup, not a Board client.** The page replays a short morning on a board in a loop: a digest from an agent, a question answered from project data, an agent claiming a task, a piece of feedback triaged. The projects and people are made up.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5288 in a browser with WebGPU (recent Chrome, Edge or Safari). Drag to orbit, scroll to zoom.

## How it is built

The city is vgpu's **Modular City** example (`npx vgpu examples pull modular-city`), kept in `src/city/` with its WebGPU pipeline, shadows, tilt-shift, GPU picking, orbit input and resource cleanup as they ship. Three changes, each marked `board-gpu` in `src/city/renderer.ts`:

1. `hideControls` hides the example's lil-gui panel, since the board drives the city.
2. `inset` frames the city between the page's two panels (the example framed it beside its own right-hand panel; `framing()` now takes a left cover too).
3. `createRenderer` also returns `board`: `addBuilding`, `paint`, `lift`, `select` and `neighborhoodNames`, each run through the example's own error guard.

`src/main.ts` maps channels to the four central neighborhoods and plays the timeline. `index.html` and `src/style.css` are the board itself.

## Credits

- `src/city/` is from the Modular City example in [vercel-labs/vgpu](https://github.com/vercel-labs/vgpu), MIT licensed.
- [Vercel Board](https://vercel.com/docs/board), and [eve](https://eve.dev) with `@eve/board`, for the real agent this concept is modeled on.
- Geist and Geist Mono.

MIT licensed.
