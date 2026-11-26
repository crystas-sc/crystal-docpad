# Building Crystal DocPad: Live Graphs, Deterministic Exports, and Real-Time CRDT Collaboration with Tiptap & Yjs

Modern reporting tools often force a painful split: you write narrative in a doc editor, build charts in a separate BI tool, paste screenshots that go blurry in PDFs, and email files back and forth to avoid overwriting a teammate's edits.

While building **Crystal DocPad**, I wanted all three — **live data visualization**, **print-grade PDF/DOCX export**, and **real-time multi-user collaboration**—to live inside a single paginated Tiptap editor.

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

Because both the editor and the export pipeline read from the exact same `ChartConfig` and shared SVG builder, what you see on the paginated canvas is what you get in the exported PDF:

```ts
// packages/shared/src/charts/renderSvg.ts
export function renderChartToSvgString(
  config: ChartConfig,
  width = config.width ?? 680,
  height = config.height ?? 320,
  idPrefix = 'report-chart',
): string {
  const definition = buildChartDefinition(config, { interactive: false });
  const scene = createChartScene(definition, { width, height }, {
    typography: { fontFamily: "'Plus Jakarta Sans', 'Liberation Sans', Arial, sans-serif" },
  });
  return renderChartSvg(scene, { ariaLabel: config.title || 'Report chart', idPrefix, tabIndex: -1 });
}
```

For **DOCX export**, each `tanstackChart` node's SVG is rasterized to a high-DPI PNG buffer and embedded as a centered `ImageRun` inside `docxBuilder.ts` before packing the Word document:

```ts
// apps/export-service/src/docxBuilder.ts
case 'tanstackChart': {
  const pngBuffer = chartImages.get(currentIndex);
  if (pngBuffer) {
    const origW = node.attrs?.width ?? 680;
    const origH = node.attrs?.height ?? 320;
    const targetWidth = maxChartWidth;
    const targetHeight = Math.round((origH / origW) * targetWidth);

    target.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            data: pngBuffer,
            transformation: { width: targetWidth, height: targetHeight },
            type: 'png',
          }),
        ],
        spacing: { after: 160 },
      }),
    );
  }
  break;
}

const buffer = await Packer.toBuffer(document);
```

---

## 3. Real-Time Collaboration with Tiptap + Yjs CRDTs

Supporting multiple people editing the same report simultaneously—including paragraphs, tables, and embedded charts—requires more than broadcasting raw JSON snapshots over WebSockets. Two users typing at once would overwrite each other's changes and break cursor positions.

That is why we built collaboration on **CRDTs (Conflict-Free Replicated Data Types)** using **Yjs** and **Tiptap v3**:

### How Yjs & the YATA Algorithm Work Under the Hood

Yjs lets multiple users—or AI agents—edit the same data simultaneously with **no central referee** and **offline-first convergence**: every device applies edits locally, shares tiny binary deltas, and independently arrives at the exact same final document regardless of message arrival order.

#### 1. Permanent Anchors Instead of Array Indexes
Traditional editors use array indexes (e.g., *"insert `'x'` at index 5"*), which break during concurrent edits because inserting at index 2 shifts every index after it. **YATA (Yet Another Transformation Approach)** — the core algorithm inside Yjs—replaces indexes with a **doubly-linked list of immutable `Item` blocks**. Every inserted character or node stores four properties:

| Property | What It Stores | Why It Matters |
| --- | --- | --- |
| **Unique ID** | `(clientID, clock)` | A globally unique pair combining the user's session ID and a local counter. |
| **Content** | The actual data (e.g. `'a'`) | The payload shown to the user. |
| **Left Origin (`originLeft`)** | ID of the item immediately to the left | Permanent anchor recording what was on the left when typed. |
| **Right Origin (`originRight`)** | ID of the item immediately to the right | Permanent anchor recording what was on the right when typed. |

#### 2. Merging Simultaneous Edits (The "No Crossing Origins" Rule)
When two offline users type in the exact same spot, YATA places items deterministically without scrambling words using two rules:
1. **No Crossing Origins (Keeps Words Together):** If you draw arrows from each character back to its `originLeft` and `originRight`, YATA forbids those arrows from ever crossing.
2. **Client ID Tie-Breaker:** If two items share the exact same left and right origins, the smaller `clientID` goes first.

**Concrete example:** Start with `A B`. Two users go offline and type between `A` and `B`:
- **User 1 (`clientID = 1`)** types `"hi"`: `h` has `originLeft = A, originRight = B`; `i` has `originLeft = h, originRight = B`.
- **User 2 (`clientID = 2`)** types `"yo"`: `y` has `originLeft = A, originRight = B`; `o` has `originLeft = y, originRight = B`.

When they sync:
- `h` and `y` share the exact same anchors (`A` and `B`). By the tie-breaker (`1 < 2`), `h` goes before `y`.
- Next, `i`'s `originLeft` is `h`. If `y` squeezed between `h` and `i` (`A h y i o B`), `i`'s arrow pointing left to `h` would cross over `y`'s arrow pointing left to `A`.
- To prevent crossing arrows, `y` must sit after `i`, and `o` slots directly after `y`.
- **Result on every device:** `A h i y o B` (never scrambled).

#### 3. Deleted Anchors & Tombstones (Plus Keeping Memory Lean)
If one user deletes a character while another offline user types right next to it, YATA never loses the landing spot because deletions do not immediately erase items from the linked list.

**Concrete example:** Start with `A B C`. Both users go offline:
- **User 1** deletes `B`. Instead of removing `B` from memory, YATA flips `deleted = true`, turning `B` into an invisible tombstone (`A ⟷ [B (deleted)] ⟷ C`, visible screen: `A C`).
- **User 2** hasn't seen the deletion yet and types `X` after `B` (`originLeft = B, originRight = C`, visible screen: `A B X C`).

When they sync:
- **User 1** receives `X`, finds the invisible tombstone `[B (deleted)]` still sitting between `A` and `C`, and slots `X` right after it → visible screen becomes `A X C`.
- **User 2** receives the deletion of `B` and marks `B` as `deleted = true` → visible screen becomes `A X C`.

To keep memory lean over time:
- **Content Stripping:** When an item becomes a tombstone, Yjs deletes its text/data payload and keeps only its lightweight ID and length.
- **Causal Buffering (Pending Queue):** If an edit arrives before its anchor has reached a device, Yjs holds it in a pending queue until the missing anchor arrives.
- **Garbage Collection (`gc: true`) & State Vectors:** Once synced, Yjs merges adjacent tombstones into tiny empty blocks, and on reconnect peers exchange a compact **State Vector** (`SyncStep1` / `SyncStep2`) to transfer only missing binary updates.

### How the Pieces Fit Together in Tiptap
- **Editor Binding (`@tiptap/extension-collaboration`):** Binds ProseMirror's document state to a shared `Y.Doc` (`XmlFragment`). We disable Tiptap's local `undoRedo` in `StarterKit` so Yjs manages conflict-free, per-user undo/redo history.
- **Live Remote Carets (`@tiptap/extension-collaboration-caret`):** Uses Yjs **Awareness** to broadcast each user's name, chosen color, and live cursor/selection position—rendering floating name badges right inside the document.
- **Self-Hosted WebSocket Sync (`ws` + `y-protocols`):** Our Express server mounts a lightweight Yjs WebSocket relay at `/collab/:room` (`collabServer.ts`), handling `SyncStep1/2`, incremental binary updates, and awareness cleanup when a tab disconnects.
- **Per-Document Room Isolation:** Opening a saved report switches to `report-<id>`, while creating a blank draft spins up a unique `draft-<id>` room and updates `?room=...` in the URL. When a new user joins an active room, the editor waits for the initial `sync` event and **only seeds default content if the shared `Y.Doc` is empty**—so late joiners never overwrite live edits.

```ts
// apps/web/src/editor/ReportEditor.tsx
const editor = useEditor({
  extensions: [
    StarterKit.configure({ heading: { levels: [1, 2, 3] }, undoRedo: false }),
    Collaboration.configure({ document: ydoc }),
    CollaborationCaret.configure({
      provider: collabProvider,
      user: collabUser ?? { name: 'Guest', color: '#2563eb' },
    }),
  ],
}, [ydoc, collabProvider]);

// Seed only if the synced room is empty
useEffect(() => {
  if (!editor || editor.isDestroyed || !collabSynced) return;
  if (ydoc.getXmlFragment('default').length === 0) {
    editor.commands.setContent(consumeInitialContent?.() ?? SAMPLE_REPORT_DOCUMENT);
  }
}, [editor, collabSynced, ydoc]);
```

```ts
// collabServer.ts — Yjs binary sync & awareness relay
if (messageType === MESSAGE_SYNC) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.readSyncMessage(decoder, encoder, room.doc, ws);
  if (encoding.length(encoder) > 1) send(ws, encoding.toUint8Array(encoder));
} else if (messageType === MESSAGE_AWARENESS) {
  awarenessProtocol.applyAwarenessUpdate(room.awareness, decoding.readVarUint8Array(decoder), ws);
}
```

### How Changes Are Transmitted Between Users

```text
User A (Tiptap) ─▶ Y.Doc binary delta ─▶ WebsocketProvider ─▶ /collab/:room (collabServer.ts)
                                                                      │
User B (Tiptap) ◀─ Y.applyUpdate() ◀──── WebsocketProvider ◀──────────┴─▶ broadcast (conn !== origin)
```

1. **Local Edit → Binary Delta:** User A's ProseMirror transaction is converted into a compact binary `Uint8Array` update on the local `Y.Doc` (only the changed `Item`s, not the full document).
2. **WebSocket Send:** `WebsocketProvider` sends the delta over `/collab/:room` tagged as `MESSAGE_SYNC (0)`, while cursor/selection & name/color updates go as `MESSAGE_AWARENESS (1)`.
3. **Server Room Relay:** `collabServer.ts` applies the update to the room's in-memory `Y.Doc` (`origin = ws`) and broadcasts it to every other socket in `room.conns` (`conn !== origin`), skipping the sender.
4. **Remote Merge:** User B's `WebsocketProvider` calls `Y.applyUpdate(ydoc, update)`, Yjs merges the CRDT `Item`s deterministically, and Tiptap updates User B's editor DOM without disturbing User B's own cursor.

#### Advantages & Trade-Offs of the Yjs Technique
**Advantages:**
- **No Central Sequencer Needed:** Unlike Operational Transformation (OT), Yjs merges binary updates deterministically on any peer in any order—our Node.js server (`collabServer.ts`) only needs to relay bytes.
- **Offline-First & Fast Reconnect:** Compact State Vectors (`SyncStep1` / `SyncStep2`) transfer only missing deltas after a disconnect, and `lib0` binary encoding + run-length coalescing keep payloads tiny.
- **Zero-Latency Local Edits & Per-User Undo:** Keystrokes apply locally at 60fps, and `Y.UndoManager` tracks each user's `clientID` so `Ctrl+Z` only undoes your own changes.

**Disadvantages / Trade-Offs:**
- **Tombstone Overhead:** Deleted text and nodes remain as metadata tombstones in the CRDT graph (unless garbage-collected), making `Y.Doc` state larger over time than a plain JSON snapshot.
- **Initial-Sync Seeding Care:** Clients must wait for the `sync` event before seeding a blank template; otherwise every joining tab would re-insert default content and duplicate the document.
- **Dual Persistence Model:** Saving to SQLite requires extracting ProseMirror JSON (for search, DOCX, and PDF export) or storing the raw `Y.encodeStateAsUpdate()` binary alongside it.

---

## 4. On-Device AI with the Chrome Prompt API (`LanguageModel`)

Instead of routing every draft or rewrite through a remote LLM endpoint, Crystal DocPad integrates Chrome's built-in **Prompt API** (`window.LanguageModel` / `window.ai.languageModel`) to run **Gemini Nano** directly in the browser—with zero API keys or server latency.

### Where It's Used
- **Markdown Report Drafting (`PromptApiAssistant`):** Generates structured GitHub-Flavored Markdown (headings, bullet lists, and pipe tables) and parses it directly into Tiptap blocks (`markdownToTiptapNodes`).
- **Conversational Chart Editing:** When a user selects a chart, the assistant serializes its current `ChartConfig` and data table into context, asks the model for updated `Chart Type`, `X-Axis`, `Y-Axis`, or table values, and patches the `tanstackChart` node live.
- **Inline AI Rephrase (`SelectionBubbleMenu`):** Selecting any text pops up a floating bubble menu (**Bold**, **Italic**, **Text Color**, and **AI Rephrase**). Using `initialPrompts: [{ role: 'system', content: ... }]` (the standardized `LanguageModel.create()` format), it rephrases the selection professionally and maps any returned Markdown formatting back into Tiptap marks.
- **Token & Latency Telemetry (`promptWithStats`):** Because on-device models have tighter context windows, a shared helper measures input tokens (`measureContextUsage` / `measureInputUsage`), tracks `contextUsage` vs. `contextWindow` (with fallback to `inputUsage` / `inputQuota`), and logs `durationMs` per call.

```ts
// apps/web/src/editor/SelectionBubbleMenu.tsx
const session = await api.create({
  initialPrompts: [{
    role: 'system',
    content: 'Rephrase the user text professionally. Output ONLY a single rephrased version.',
  }],
});

const rephrased = (await promptWithStats(session, selectedText, 'rephrase')).trim();
const blocks = markdownToTiptapNodes(rephrased);
editor.chain().focus().insertContentAt({ from, to }, blocks[0]?.content ?? rephrased).run();
```

---

## 5. PDF & DOCX Export Performance Benchmarks (10 Charts + 10 Tables)

To verify how the pooled Playwright Chromium renderer (`PdfBrowserPool`) and DOCX builder hold up under real report workloads, I ran reproducible benchmarks inside a constrained `linux/amd64` Docker container (**2 CPUs**, **2 GiB RAM**, **no swap**, **1 GiB `/dev/shm`**) exporting a full **10-chart + 10-table** report (`anthropic-sample-report.json`) **100 consecutive times** after a single warmup:

| Metric | PDF Export (100 Runs) | DOCX Export (100 Runs) |
| --- | --- | --- |
| **Workload** | 10 Charts + 10 Tables | 10 Charts + 10 Tables |
| **Min Latency** | 331.3 ms | 1,091.8 ms |
| **Average Latency** | **378.9 ms** | **1,188.6 ms** |
| **P95 Latency** | **429.4 ms** | **1,306.3 ms** |
| **Max Latency** | 683.8 ms | 1,494.2 ms |
| **Total Time (100 Exports)** | **37.96 s** | **118.92 s** |
| **Container Memory** | **428.1 MiB / 2 GiB (20.90%)** | **394.1 MiB / 2 GiB (19.24%)** |

Keeping a warm Chromium instance in `PdfBrowserPool` yields sub-400 ms average PDF generation by printing inline SVGs in a single pass, while DOCX export averages ~1.19 s because it rasterizes all 10 chart SVGs into high-DPI PNGs (`ImageRun`) before packing the `.docx` archive—both staying around ~400 MiB of RAM.

---

## Key Takeaways

1. **Keep chart state declarative:** Storing charts as structured JSON nodes in the editor AST makes them collaborative, AI-editable, and exportable to both PDF and DOCX.
2. **Share your SVG renderer:** Running the same `@tanstack/charts` scene builder in both the browser and Node.js eliminates export layout surprises.
3. **CRDTs + Awareness are worth it:** Pairing Tiptap with Yjs gives you true simultaneous editing, per-user undo/redo, and live cursors with a surprisingly small server footprint.
4. **On-device AI fits inline editing:** Chrome's `LanguageModel` API is fast enough for contextual bubble-menu rewrites and chart tweaks without backend round-trips.

---

*Built with React, TypeScript, Tiptap v3, Yjs, TanStack Charts, Chrome Prompt API, Express, Fastify, and Playwright.*

#WebDevelopment #TypeScript #React #Tiptap #Yjs #CRDT #RealtimeCollaboration #ChromeAI #PromptAPI #Playwright #SoftwareEngineering
