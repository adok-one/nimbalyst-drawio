# Nimbalyst Draw.io Extension

Create, edit, and embed [draw.io](https://www.diagrams.net/) diagrams inside Nimbalyst — in markdown documents and as standalone files.

Diagrams are stored as ordinary `.drawio` / `.drawio.svg` / `.drawio.png` files with embedded draw.io metadata, so they stay compatible with GitHub, VS Code's draw.io integration, and the Confluence draw.io pipeline.

## Features

- **Custom editor** for `*.drawio`, `*.dio`, `*.drawio.svg`, `*.drawio.png` — opens the full draw.io canvas in a Nimbalyst tab.
- **Slash command** `/Draw.io Diagram` — creates `assets/<name>.drawio.svg` next to the open markdown file and embeds it.
- **Inline edit overlay** — every embedded diagram has **Edit** (opens the draw.io canvas in a modal) and **Redraw** (refreshes the preview) buttons.
- **Drag-drop & paste** `.drawio`, `.drawio.svg`, `.drawio.png` (and draw.io-flavored `.svg`/`.png`/`.xml`) directly into a markdown document.
- **Markdown round-trip** — embedded diagrams serialize as standard image references and re-hydrate on reload.
- **New-file menu** entries for blank SVG and XML diagrams.

## Supported formats

| Format | Stored as | Preview |
|--------|-----------|---------|
| `*.drawio.svg` | SVG wrapper with `content="<mxfile…>"` | rendered SVG |
| `*.drawio.png` | PNG with embedded XML | rendered PNG |
| `*.drawio` / `*.dio` | plain `mxfile` XML | SVG export rendered off-screen; placeholder if export is unavailable |

## Install (dev)

1. Enable **Extension Dev Tools** in Nimbalyst → Settings → Advanced.
2. Build this package:

   ```bash
   cd nimbalyst-drawio
   npm install
   npm run build
   npm run validate
   ```

3. Symlink (or copy) the folder into the Nimbalyst extensions directory, then **Settings → Extensions → Reload**:

   ```bash
   ln -s "$(pwd)" "$HOME/Library/Application Support/@nimbalyst/electron/extensions/nimbalyst-drawio"
   ```

   Alternatively, install from a local folder via Settings → Extensions.

## Usage

### New diagram file

File → New → **Draw.io Diagram (SVG)** or **Draw.io Diagram (XML)**.

### Insert into markdown

1. Type `/` → **Draw.io Diagram**, or
2. drag-drop / paste a draw.io file into the document, or
3. write the reference manually:

   ```markdown
   ![Architecture](./assets/my-diagram.drawio.svg)
   ```

### Edit an existing diagram

- Click **Edit** on an embedded diagram to open the draw.io canvas in an overlay; **Save** writes back to the asset file and refreshes the preview.
- Or open the `*.drawio*` file directly to use the full custom editor tab.

Editing requires network access to load the `embed.diagrams.net` canvas.

## Permissions

- `filesystem` — read/write diagram files in the document's `assets/` folder.
- `network` — load the draw.io embed iframe (`embed.diagrams.net`).

## Architecture

```
src/
  index.tsx                     extension entry surface (activate, components, exports)
  drawio/
    DrawioClient.ts             embed.diagrams.net postMessage JSON protocol
    fileKind.ts                 format detection (svg/png/xml) by name + bytes
    preview.ts                  singleton off-screen client + queue for XML previews
    templates.ts                empty/normalized mxfile payloads
  lexical/
    DrawioNode.tsx              DecoratorNode for embedded diagrams
    DrawioComponent.tsx         widget UI (preview, Edit, Redraw)
    DrawioLexicalExtension.ts   slash command + drop/paste handlers
    DrawioTransformer.ts        markdown <-> node transform
  markdown/
    storeDrawioAsset.ts         create a new diagram beside the document
    writeDrawioAsset.ts         single asset-write path (create-document + fallback)
    drawioUpload.ts             store dropped/pasted files
  components/
    DrawioEditor.tsx            custom editor tab (useEditorLifecycle)
    DrawioEditOverlay.tsx       inline edit modal
    useDrawioClient.ts          shared draw.io iframe lifecycle hook
  utils/
    resolveDrawioAssetUrl.ts    document-path + asset URL resolution
    drawioFileIO.ts             read/write/apply content via Electron or fs service
```

Key conventions:

- The document path is resolved per-editor via `getDocumentPathFromElement()` (walks up `data-file-path`), with `window.__currentDocumentPath` only as a fallback — so drop/paste target the correct document in a multi-editor layout.
- A single `useDrawioClient` hook owns the draw.io iframe lifecycle for both the custom editor and the inline overlay.
- A single off-screen preview client (with a job queue) renders XML previews instead of one iframe per widget.

## Development

```bash
npm run build      # production bundle -> dist/
npm run dev        # rebuild on change (vite --watch)
npm run validate   # check manifest + built entry
```

`react`, `react-dom`, `lexical`, `@lexical/*`, and `@nimbalyst/runtime` are externalized — they resolve to the host's copies at runtime and must never be bundled.

## Notes

- Diagrams are plain SVG/PNG/XML files with embedded draw.io metadata — portable across tools.
- If a `.drawio` XML preview can't be exported (e.g. offline), the widget shows a placeholder; use **Edit** to open the canvas.
