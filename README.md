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
npm run typecheck     # tsc over src, tests and the build tooling
npm test              # vitest, jsdom
npm run test:watch    # the same, on change
npm run test:coverage # coverage over src/, with thresholds
npm run build         # production bundle -> dist/
npm run dev           # rebuild on change (vite --watch)
npm run validate      # check manifest + built entry
npm run pack:nimext   # build, then release/nimbalyst-drawio-<version>.nimext
npm run validate:pack # open that archive again, with the host's own zip reader
```

### Tests

`tests/` runs under vitest in jsdom, against the real `lexical` (the version the host
ships) rather than a mock of it. The suite covers the format layer, the file paths, the
embed protocol, the Lexical node and transformer, and the three React surfaces; the
manifest is checked against the actual exports, so a contribution naming something that
does not exist fails the build rather than a person's click.

`@nimbalyst/runtime` has no copy on disk — the host provides it and `vite.config.ts`
externalises it — so `vitest.config.ts` aliases it to `tests/stubs/nimbalyst-runtime.ts`.
`lexical` and friends are devDependencies for the tests only; they stay external in the
bundle.

### Typechecking

Three programs, because they have three different sets of globals:

| config | what it checks | ambient types |
| --- | --- | --- |
| `tsconfig.src.json` | `src/` alone | none — this is the renderer boundary |
| `tsconfig.json` | `src/` + `tests/` | none declared; Node's arrive via Vitest |
| `tsconfig.node.json` | the vite configs and `scripts/` | `node` |

The first exists because the second cannot enforce anything: the tests import Vitest, whose
declarations reference `@types/node`, and that puts `process` and `Buffer` back in scope for
the whole program. This extension runs in the host's renderer, where neither exists — so
`src/` is checked again on its own, in a program the tests are not part of.

Until 2026-09-01 there was no typecheck at all, and `lexical`, `@lexical/utils` and
`@lexical/markdown` were hand-written ambient stubs declaring the handful of members the
code used. Those are gone: the real packages are devDependencies now (still external in the
bundle), and the types come from them.

Two tests are `it.fails` and one is named as dead code. They are not broken tests: they
state what the code *should* do and pass only for as long as it does not. Fixing the code
turns them red, which is the signal to delete the `.fails`. Each carries a comment saying
what the defect is.

`react`, `react-dom`, `lexical`, `@lexical/*`, and `@nimbalyst/runtime` are externalized — they resolve to the host's copies at runtime and must never be bundled.

## Release

Two channels, one archive format. A `.nimext` is a zip with `manifest.json` at its root —
the host's own package format.

- **GitHub** is the source of truth and the marketplace entry.
- **Bitbucket** (`altusnova/eai-nimbalyst-draw-io-plugin`, a push mirror) carries the same archive on
  its Downloads shelf, because the private AltusNova EAI installer puts this extension on
  a machine beside itself in one command and cannot reach GitHub Releases with the
  Bitbucket credentials that person already has. `bitbucket-pipelines.yml` builds it.

```bash
npm run bump:version -- patch   # manifest.json and package.json together
```

Commit, then push the tag `v<version>` to the Bitbucket mirror: the pipeline runs the
gates, packs the archive and publishes `nimbalyst-drawio-<version>.nimext` plus its
`.sha256` to that repository's Downloads. The tag has to match `manifest.json` — the
pipeline refuses to publish otherwise. It needs one repository variable,
`BB_DOWNLOADS_TOKEN`, an access token with `repository:write`.

## Notes

- Diagrams are plain SVG/PNG/XML files with embedded draw.io metadata — portable across tools.
- If a `.drawio` XML preview can't be exported (e.g. offline), the widget shows a placeholder; use **Edit** to open the canvas.
