<div align="center">

# DrawIt

**A collaborative whiteboard for sketching, diagramming, and real‑time teamwork.**

Built from scratch with React, TypeScript, and the HTML Canvas 2D API — paired with a Node.js + WebSocket backend for live multi‑user sessions.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![WebSocket](https://img.shields.io/badge/WebSocket-ws-010101)](https://github.com/websockets/ws)

</div>

---

## Overview

DrawIt is an Excalidraw‑inspired whiteboard that lets anyone sketch shapes, draw freehand, add handwritten text, and collaborate in real time by sharing a link. The canvas is rendered with the native 2D Canvas API — no drawing libraries — so the app stays light and responsive even with hundreds of shapes.

The project is split into two independently deployable services:

- **Frontend** — a Vite + React + TypeScript single‑page app with a fully custom canvas engine.
- **Backend** — a TypeScript Express server with a WebSocket layer for live rooms, JWT auth, and a flat‑file store for users.

> Live demo: `https://draw-it-sepia-one.vercel.app` · API: `https://drawit-2.onrender.com`

---

## Highlights

### Canvas engine
- Shapes: rectangle, diamond, ellipse, triangle, line, arrow, freehand pen, and handwritten text
- Per‑shape stroke color, fill color, stroke width, dash style, and opacity
- Marquee selection, multi‑select with `Shift`, corner + edge resize handles, line endpoint + curve‑bend handles
- Pan & zoom viewport (space‑drag / middle mouse, `Ctrl + scroll`) with anchored zoom
- Subtle dotted grid that scales with zoom and respects the current theme
- High‑DPI rendering via `devicePixelRatio` for crisp strokes on retina displays
- Full undo / redo history (snapshot based), duplicate, nudge with arrow keys, select‑all
- PNG export (solid or transparent) and JSON save/open for round‑tripping documents
- Keyboard‑first workflow: single‑letter tool shortcuts and modifiers (`Shift` for perfect shapes)

### UI / UX
- Excalidraw‑style floating toolbar with tooltips, shortcut badges, and an active‑tool indicator
- Contextual properties panel on the left — palettes, color picker, width presets, opacity slider
- Menu drawer for import/export, clear, theme toggle, grid toggle, and help
- Bottom zoom control that doubles as a one‑click "reset view"
- Live collaboration bar with colored participant avatars, connection status, and an invite dialog with copy‑to‑clipboard
- Toast notifications with info / success / error tones
- Fully themed light and dark modes (persisted in `localStorage`)
- Tasteful typography: Inter for UI, Caveat for hand‑drawn text, JetBrains Mono for shortcut keys

### Collaboration
- Share any session with a link — new users auto‑join via guest tokens if they aren't signed in
- WebSocket backend broadcasts incremental canvas snapshots and room membership changes
- New joiners receive the current canvas from any active peer via a `request_snapshot` handshake
- Keep‑alive ping/pong, token refresh on expiry, and automatic retry on unauthorized close

---

## Tech stack

| Area           | Technology                                                                 |
| -------------- | -------------------------------------------------------------------------- |
| **Language**   | TypeScript (strict)                                                        |
| **Frontend**   | React 19, Vite 7, Tailwind CSS 4, Lucide icons, Axios                      |
| **Rendering**  | HTML Canvas 2D API (custom engine, no drawing libs)                        |
| **Backend**    | Node.js 20+, Express 5, `ws`, JSON Web Tokens, bcrypt, CORS                |
| **Storage**    | Flat‑file JSON store (pluggable — swap for a DB without touching the API)  |
| **Tooling**    | ESLint 9, TypeScript project references, Vite HMR                          |
| **Deploy**     | Vercel (frontend), Render (backend)                                        |

---

## Architecture

```
┌────────────────────────┐   HTTPS / WSS   ┌─────────────────────────┐
│       Frontend (SPA)   │ ──────────────> │       Backend (API)     │
│   Vite · React · TS    │                 │  Express · ws · JWT     │
│   Canvas 2D engine     │ <────────────── │  Rooms · Broadcast      │
└─────────┬──────────────┘                 └────────────┬────────────┘
          │                                             │
          │  draw.tsx (engine)                          │  localStore.ts
          │   • shapes, view transform, history         │   • users.json
          │   • pub/sub for change + selection          │   • concurrency-safe writes
          ▼                                             ▼
      canvas.tsx (UI chrome)                        data/app.json
      Sidebar.tsx (properties)
      authModal.tsx (sign in)
```

The canvas engine is deliberately **state‑owned, event‑published**: the UI layer subscribes via `onChange`, `onSelectionChange`, and `onViewChange`, while inputs mutate state through a tight public API (`setTool`, `setStroke`, `undo`, `replaceSnapshot`, …). This keeps React out of the render hot path and gives us 60 fps pan/zoom even on large scenes.

---

## Design decisions & challenges

### Canvas from scratch (no Fabric / Konva / Rough)
Using the raw 2D API forced me to design my own shape model, hit‑testing, and render loop — but it kept the bundle tiny and made every interaction tunable. Shapes are a discriminated union in TypeScript, and every render reads from a single array so broadcast / replay becomes "ship the shapes".

### `requestAnimationFrame` batched rendering
Dragging and resizing fire dozens of events per frame. Rather than re‑rendering on every mousemove, I batch through a single `scheduleRender()` that coalesces to the next animation frame, which keeps drag interactions smooth regardless of input rate.

### High‑DPI rendering
The canvas is sized to `window.innerWidth * devicePixelRatio` with a matching CSS size, so strokes stay crisp on retina. The viewport transform is applied via `ctx.setTransform` so world coordinates remain consistent between mouse input, rendering, and text overlay positioning.

### Collaboration without a CRDT
For a whiteboard of this scope, operational transforms or CRDTs would be overkill. Instead, clients broadcast full snapshots on change and the server forwards them to room members. New joiners ask an existing peer for the current snapshot. Trade‑off: no per‑element conflict resolution, but simpler to reason about and perfectly adequate for small rooms.

### Auth that doesn't get in the way
JWT bearer tokens for REST + a token query param for WebSocket upgrades. A dedicated `/guest` endpoint mints short‑lived tokens so anyone with a share link can collaborate instantly. If the socket closes with code `4001` the client automatically retries once with a fresh guest token before surfacing an error.

### Text that feels hand‑drawn
Excalidraw's signature is its handwritten aesthetic. A real `<textarea>` is overlaid at the correct screen position during editing, rendered with the Caveat font, and then committed into the canvas as a text shape using the same font for parity.

### Accessibility & polish
Keyboard shortcuts for every tool, focus‑visible rings on all controls, `aria`‑friendly buttons, theme‑aware scrollbars, toasts with role‑appropriate tones, and a shortcuts modal (`?`) for discoverability.

---

## Project structure

```
DrawIt/
├── Backend/
│   ├── src/
│   │   ├── index.ts          # Express + WebSocket server, auth, broadcast
│   │   └── localStore.ts     # Flat-file user store (concurrency-safe)
│   ├── data/                 # Runtime JSON data (gitignored)
│   ├── package.json
│   └── tsconfig.json
└── Frontend/
    ├── src/
    │   ├── components/
    │   │   ├── canvas.tsx    # Top-level surface + UI chrome
    │   │   ├── draw.tsx      # Canvas engine (shapes, input, rendering)
    │   │   ├── Sidebar.tsx   # Contextual properties panel
    │   │   └── authModal.tsx # Auth + guest login
    │   ├── lib/
    │   │   ├── api.ts        # Axios client with auth interceptor
    │   │   ├── ws.ts         # WebSocket helpers + token refresh
    │   │   └── authStorage.ts# localStorage session helpers
    │   ├── App.tsx
    │   ├── main.tsx
    │   └── index.css
    ├── package.json
    ├── vite.config.ts
    └── tsconfig.json
```

---

## Getting started

### Prerequisites

- **Node.js** 20 or newer
- **npm** 10+ (or pnpm / yarn — commands below use npm)

### 1. Clone and install

```bash
git clone https://github.com/<your-username>/DrawIt.git
cd DrawIt

# backend
cd Backend
npm install

# frontend
cd ../Frontend
npm install
```

### 2. Configure the backend

Create `Backend/.env`:

```env
JWT_SECRET=replace-me-with-a-long-random-string
PORT=3000
```

> The server currently listens on port `3000`. If you change it, update the `BASE_URL` values in `Frontend/src/lib/api.ts` and `Frontend/src/lib/ws.ts`.

### 3. Run the backend

```bash
cd Backend
npm run dev        # compiles with tsc and runs node dist/index.js
```

The API will be available at `http://localhost:3000` and the WebSocket server at `ws://localhost:3000`.

### 4. Run the frontend

```bash
cd Frontend
npm run dev
```

Open `http://localhost:5173` in your browser.

### 5. Build for production

```bash
# frontend
cd Frontend
npm run build      # outputs dist/

# backend
cd ../Backend
npm run build      # outputs dist/
npm start          # runs the compiled server
```

---

## Keyboard shortcuts

| Action              | Shortcut                  |
| ------------------- | ------------------------- |
| Selection           | `V`                       |
| Hand / Pan          | `H` or hold `Space`       |
| Rectangle           | `R`                       |
| Diamond             | `D`                       |
| Ellipse             | `O`                       |
| Arrow / Line        | `A` / `L`                 |
| Pen (freehand)      | `P`                       |
| Text                | `T`                       |
| Eraser              | `E`                       |
| Undo / Redo         | `Ctrl+Z` / `Ctrl+Shift+Z` |
| Select all          | `Ctrl+A`                  |
| Duplicate selection | `Ctrl+D`                  |
| Delete selection    | `Delete` / `Backspace`    |
| Nudge selection     | Arrow keys (`Shift` = 10px) |
| Zoom                | `Ctrl + scroll`           |
| Perfect shapes      | Hold `Shift` while drawing |
| Show shortcuts      | `?`                       |

---

## REST API

| Method | Endpoint           | Description                                     |
| ------ | ------------------ | ----------------------------------------------- |
| `POST` | `/signup`          | Register a new user (`name`, `username`, `password`) |
| `POST` | `/signin`          | Log in with username + password, returns a JWT  |
| `POST` | `/guest`           | Mint a short‑lived guest JWT from a username    |
| `GET`  | `/room/:slug`      | Lookup a room by slug                           |
| `GET`  | `/chats/:roomId`   | (Reserved) Fetch chat history for a room        |

Authenticated routes expect `Authorization: Bearer <jwt>`. Tokens are signed with `JWT_SECRET` and expire in 7 days (6 hours for guest tokens).

## WebSocket protocol

Connect to `ws(s)://<host>/?token=<jwt>`. The server closes with code `4001` if the token is missing or invalid.

Client → Server messages:

```ts
{ type: "join_room",        roomId: string }
{ type: "leave_room",       roomId: string }
{ type: "get_room_users",   roomId: string }
{ type: "canvas_update",    roomId: string, snapshot: { shapes, bg } }
{ type: "canvas_snapshot",  roomId: string, snapshot: { shapes, bg } }
```

Server → Client messages:

```ts
{ type: "room_users",       roomId, users: string[] }
{ type: "user_joined",      roomId, userId }
{ type: "user_left",        roomId, userId }
{ type: "request_snapshot", roomId }
{ type: "canvas_update",    roomId, snapshot }
{ type: "canvas_snapshot",  roomId, snapshot }
```

The server also runs a 30s `ping` keep‑alive to keep idle connections healthy behind proxies.

---

## Deployment

- **Frontend:** push to Vercel; the only build command is `npm run build` and output is `dist/`.
- **Backend:** deploy to Render / Railway / Fly.io. Set the `JWT_SECRET` env var, expose port `3000`, and make sure WebSocket upgrades are allowed.
- **CORS:** add your frontend origin to `allowedOrigins` in `Backend/src/index.ts`.

---

## Roadmap

- [ ] Per‑user cursor presence
- [ ] Shape grouping + alignment guides
- [ ] Image / sticky note shapes
- [ ] Chat panel on top of the existing message channel
- [ ] Persistent rooms backed by Postgres
- [ ] Mobile / touch gesture support

---

## Skills demonstrated

- **Language design** — discriminated unions, strict TypeScript across the stack, clean public APIs
- **Rendering & graphics** — custom 2D canvas engine, viewport transforms, DPI‑aware drawing, `requestAnimationFrame` batching
- **UI / UX design** — Excalidraw‑quality toolbar, contextual panels, theming, accessibility, tasteful motion
- **Real‑time systems** — WebSocket rooms, snapshot sync, reconnection, keep‑alive
- **Auth & security** — JWT issuance & verification, bcrypt password hashing, guest tokens, CORS
- **Product thinking** — keyboard‑first workflows, one‑click sharing, graceful guest fallback, dark mode

---

## License

MIT — feel free to use, modify, and learn from this project.
