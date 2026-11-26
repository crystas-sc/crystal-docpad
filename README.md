# Crystal DocPad

git remote add origin https://github.com/crystas-sc/crystal-docpad.git

## Features

- **Paginated Rich-Text Editor** — Desktop multi-page sheet layout with rulers, page guides, configurable page sizes/margins/orientations, manual page breaks, multi-column sections, and a live Table of Contents sidebar.
- **Tables & Data Import** — Resizable tables with cell alignment, Excel/TSV/Markdown/HTML paste support, and one-click table-to-chart conversion.
- **Embedded Charts** — Interactive `@tanstack/charts` visualizations (`line`, `bar`, `area`) rendered in the editor and exported cleanly to PDF/DOCX.
- **Real-Time Collaboration** — Yjs CRDT sync over WebSockets (`/collab/:room`), initial username and cursor-color prompt, live remote carets, per-document room isolation (`?room=<id>`), and shareable room links.
- **On-Device AI (Chrome Prompt API)** — Draft Markdown reports, update charts via natural language, or highlight any text to use the floating bubble menu (**Bold**, **Italic**, **Text Color**, and **AI Rephrase**).
- **Saved Reports & Signed Exports** — Versioned report persistence in SQLite (`data/reports.sqlite`), DOCX generation (`docx`), and headless Chromium PDF export (`playwright`) with optional PKCS#12 digital signatures (`@signpdf/signer-p12` + `node-forge`).

## Project Structure

```text
crystal-docpad/
├── server.ts                  # Unified Express server (Vite/static, /api/* proxy, /collab WS)
├── collabServer.ts            # Yjs WebSocket room & awareness server
├── apps/
│   ├── web/                   # React + Tiptap frontend
│   │   └── src/
│   │       ├── ai/            # Chrome Prompt API helpers & assistant drawer
│   │       ├── collab/        # Yjs WebSocket hook & presence state
│   │       ├── components/    # Username modal, TOC sidebar, Saved Reports & Export drawers
│   │       └── editor/        # ReportEditor, pagination, bubble menu, charts, tables
│   └── export-service/        # Fastify API for SQLite reports, PDF pool, DOCX & PDF signing
└── packages/
    └── shared/                # Shared document, chart, and page-setup types & SVG renderer
```

## Prerequisites

- **Node.js 22.5+** (uses built-in `node:sqlite`)
- **npm**

## Run Locally

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Install Chromium for PDF export:**

   ```bash
   npx playwright install chromium
   ```

3. **Configure environment variables (optional):**

   Copy `.env.example` to `.env` and adjust as needed:

   ```bash
   cp .env.example .env
   ```

4. **(Optional) Generate a self-signed `.p12` certificate for PDF signing:**

   ```bash
   npm run gen:cert
   ```

5. **Start the development server:**

   ```bash
   npm run dev
   ```

   Open `http://localhost:3000`. To test multi-user collaboration, open the same URL (or click **Share** to copy the `?room=...` link) in a second browser tab and enter a different username.

## Available Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start unified server (`tsx server.ts`) with Vite HMR and `/collab` WebSockets |
| `npm run build` | Build production frontend bundle into `dist/` |
| `npm start` | Start server in production mode (`NODE_ENV=production tsx server.ts`) |
| `npm run lint` | Run TypeScript typechecking (`tsc --noEmit`) |
| `npm run gen:cert` | Generate a local `.p12` signing certificate for PDF export |

## Docker

The included `Dockerfile` uses `node:22-bookworm-slim` and installs Playwright's headless Chromium browser and Linux dependencies (`npx playwright install --with-deps chromium`).

```bash
docker build -t crystal-docpad .
docker run -p 3000:3000 -v crystal_docpad_data:/app/data crystal-docpad
```

## Environment Variables

| Variable | Description | Default |
| --- | --- | --- |
| `APP_PORT` | Unified HTTP & WebSocket server port | `3000` |
| `EXPORT_PORT` | Standalone export service port | `3001` |
| `SIGNING_CERT_PATH` | Path to PKCS#12 (`.p12`/`.pfx`) signing certificate | `apps/export-service/certs/signing-cert.p12` |
| `SIGNING_CERT_PASSWORD` | Password for the `.p12` certificate | _(empty)_ |
| `PLAYWRIGHT_EXECUTABLE_PATH` | Optional custom Chromium/Chrome executable path | _(auto-detected)_ |
| `GEMINI_API_KEY` | Gemini API key (if configured for server/runtime use) | — |
| `APP_URL` | Public base URL of the app | — |
