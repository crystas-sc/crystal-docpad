# Building Crystal DocPad: Live Graphs, Deterministic Exports, and Real-Time CRDT Collaboration with Tiptap & Yjs
```
docker build --platform linux/amd64 -t crystal-docpad:perf .; if ($LASTEXITCODE -eq 0) { docker rm -f docpad-perf 2>$null; docker run -d --name docpad-perf --platform linux/amd64 --cpus="2.0" --memory="2g" --memory-swap="2g" --shm-size="1g" -p 3000:3000 --tmpfs /app/data:rw,size=256m crystal-docpad:perf }
```
Modern reporting tools often force a painful split: you write narrative in a doc editor, build charts in a separate BI tool, paste screenshots that go blurry in PDFs, and email files back and forth to avoid overwriting a teammate's edits.

While building **Crystal DocPad**, I wanted all three—**live data visualization**, **print-grade PDF/DOCX export**, and **real-time multi-user collaboration**—to live inside a single paginated Tiptap editor.

Here is a look under the hood at how the **graph creation & export pipeline**, **Tiptap CRDT collaboration**, and **on-device Chrome Prompt API** work together.

---

## 1. Graph Creation: From Structured Tables to Live Editor Nodes

Instead of treating charts as static images, Crystal DocPad stores every chart as a first-class Tiptap node (`tanstackChart`) backed by a typed `ChartConfig` (`chartType`, `xKey`, `yKeys`, `data`, `title`, `subtitle`, `colors`).

### One-Click Table-to-Chart Extraction
Authors frequently start with raw numbers in a table (pasted from Excel, TSV, or Markdown). With `extractChartFromCurrentTable`:
1. We inspect the ProseMirror selection (`$from`) to locate the enclosing `table` node and check whether the user highlighted specific rows.
2. We parse header cells for the X-axis and numeric Y-series, stripping currency symbols, commas, and `%` signs (`parseNumericCell`).
3. We insert a live `@tanstack/charts` node (`line`, `bar`, or `area`) directly after the table—and even let users tweak the chart's axes, type, or title conversationally via the on-device Chrome Prompt API (`LanguageModel`).

---

## 2. Graph Export: Deterministic SVGs for Print-Grade PDF & DOCX

A common pitfall when exporting browser-based charts to PDF or Word is **rendering drift**: CSS variables, hover states, or async animations break when moved to a headless export worker.

We solved this by sharing a single deterministic renderer (`renderChartToSvgString`) across the frontend and the Node.js export service:

- **Shared Scene Graph:** Using `@tanstack/charts` (`createChartScene` + `renderChartSvg`) in `packages/shared`, charts are compiled into self-contained inline SVGs with explicit typography and zero reliance on external CSS classes.
- **PDF Export with Headless Chromium:** The Fastify export service serializes the Tiptap `ReportDocument` JSON into paginated HTML with embedded fonts and inline chart SVGs, then prints it through a pooled Playwright Chromium instance (`PdfBrowserPool`).
- **Digital Signatures:** Before returning the PDF, `@signpdf/placeholder-pdf-lib`, `@signpdf/signer-p12`, and `node-forge` can cryptographically sign the document with a PKCS#12 (`.p12`) certificate.
- **DOCX Export:** The same `ReportDocument` AST is traversed by `docxBuilder.ts` using the `docx` library to generate native Word headings, tables, columns, and embedded chart graphics.

Because both the editor and the export pipeline read from the exact same `ChartConfig` and shared SVG builder, what you see on the paginated canvas is what you get in the exported PDF.

---

## 3. Real-Time Collaboration with Tiptap + Yjs CRDTs

Supporting multiple people editing the same report simultaneously—including paragraphs, tables, and embedded charts—requires more than broadcasting raw JSON snapshots over WebSockets. Two users typing at once would overwrite each other's changes and break cursor positions.

That is why we built collaboration on **CRDTs (Conflict-Free Replicated Data Types)** using **Yjs** and **Tiptap v3**:

### How the Pieces Fit Together
- **Editor Binding (`@tiptap/extension-collaboration`):** Binds ProseMirror's document state to a shared `Y.Doc` (`XmlFragment`). We disable Tiptap's local `undoRedo` in `StarterKit` so Yjs manages conflict-free, per-user undo/redo history.
- **Live Remote Carets (`@tiptap/extension-collaboration-caret`):** Uses Yjs **Awareness** to broadcast each user's name, chosen color, and live cursor/selection position—rendering floating name badges right inside the document.
- **Self-Hosted WebSocket Sync (`ws` + `y-protocols`):** Our Express server mounts a lightweight Yjs WebSocket relay at `/collab/:room` (`collabServer.ts`), handling `SyncStep1/2`, incremental binary updates, and awareness cleanup when a tab disconnects.
- **Per-Document Room Isolation:** Opening a saved report switches to `report-<id>`, while creating a blank draft spins up a unique `draft-<id>` room and updates `?room=...` in the URL. When a new user joins an active room, the editor waits for the initial `sync` event and **only seeds default content if the shared `Y.Doc` is empty**—so late joiners never overwrite live edits.

---

## 4. On-Device AI with the Chrome Prompt API (`LanguageModel`)

Instead of routing every draft or rewrite through a remote LLM endpoint, Crystal DocPad integrates Chrome's built-in **Prompt API** (`window.LanguageModel` / `window.ai.languageModel`) to run **Gemini Nano** directly in the browser—with zero API keys or server latency.

### Where It's Used
- **Markdown Report Drafting (`PromptApiAssistant`):** Generates structured GitHub-Flavored Markdown (headings, bullet lists, and pipe tables) and parses it directly into Tiptap blocks (`markdownToTiptapNodes`).
- **Conversational Chart Editing:** When a user selects a chart, the assistant serializes its current `ChartConfig` and data table into context, asks the model for updated `Chart Type`, `X-Axis`, `Y-Axis`, or table values, and patches the `tanstackChart` node live.
- **Inline AI Rephrase (`SelectionBubbleMenu`):** Selecting any text pops up a floating bubble menu (**Bold**, **Italic**, **Text Color**, and **AI Rephrase**). Using `initialPrompts: [{ role: 'system', content: ... }]` (the standardized `LanguageModel.create()` format), it rephrases the selection professionally and maps any returned Markdown formatting back into Tiptap marks.
- **Token & Latency Telemetry (`promptWithStats`):** Because on-device models have tighter context windows, a shared helper measures input tokens (`measureContextUsage` / `measureInputUsage`), tracks `contextUsage` vs. `contextWindow` (with fallback to `inputUsage` / `inputQuota`), and logs `durationMs` per call.

---

## 5. PDF Export Performance Benchmark (10 Charts + 10 Tables)

To verify how the pooled Playwright Chromium renderer (`PdfBrowserPool`) holds up under real report workloads, I ran a reproducible benchmark inside a constrained `linux/amd64` Docker container (**2 CPUs**, **2 GiB RAM**, **no swap**, **1 GiB `/dev/shm`**) exporting a full **10-chart + 10-table** report (`anthropic-sample-report.json`) **100 consecutive times** after a single warmup:

| Metric | Result |
| --- | --- |
| **Workload** | 10 TanStack Charts + 10 Tables (PDF) |
| **Timed Runs** | 100 |
| **Min Latency** | 331.3 ms |
| **Average Latency** | **378.9 ms** |
| **P95 Latency** | **429.4 ms** |
| **Max Latency** | 683.8 ms |
| **Total Time (100 PDFs)** | **37.96 s** |
| **Container Memory** | **428.1 MiB / 2 GiB (20.90%)** |

Keeping a warm Chromium instance in `PdfBrowserPool` and rendering charts as inline SVGs keeps sub-400ms average PDF generation even on a 10-chart document—without spiking memory.

---

## Key Takeaways

1. **Keep chart state declarative:** Storing charts as structured JSON nodes in the editor AST makes them collaborative, AI-editable, and exportable to both PDF and DOCX.
2. **Share your SVG renderer:** Running the same `@tanstack/charts` scene builder in both the browser and Node.js eliminates export layout surprises.
3. **CRDTs + Awareness are worth it:** Pairing Tiptap with Yjs gives you true simultaneous editing, per-user undo/redo, and live cursors with a surprisingly small server footprint.
4. **On-device AI fits inline editing:** Chrome's `LanguageModel` API is fast enough for contextual bubble-menu rewrites and chart tweaks without backend round-trips.

---

*Built with React, TypeScript, Tiptap v3, Yjs, TanStack Charts, Chrome Prompt API, Express, Fastify, and Playwright.*

#WebDevelopment #TypeScript #React #Tiptap #Yjs #CRDT #RealtimeCollaboration #ChromeAI #PromptAPI #Playwright #SoftwareEngineering
