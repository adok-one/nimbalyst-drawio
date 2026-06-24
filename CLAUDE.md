# Задача: довести Nimbalyst extension `nimbalyst-drawio` до production-ready

## Контекст проекта

Репозиторий: `/Users/adok/www/altusnova/nimbalyst-drawio`  
Ветка: `main`, текущая версия: **0.5.0**  
Это Nimbalyst extension для embed draw.io диаграмм в markdown.

**Стек:**

- TypeScript + React 19
- Vite (library mode → `dist/index.js` + `dist/index.css`)
- Lexical (`defineExtension`, `DecoratorNode`, markdown transformers)
- Manifest-driven contributions (`manifest.json` + exports из `src/index.tsx`)

**Установка для разработки:**

```bash
cd nimbalyst-drawio
npm install
npm run build
npm run validate
```

Symlink в Nimbalyst: `~/Library/Application Support/@nimbalyst/electron/extensions/nimbalyst-drawio` → dev folder.  
Reload: Settings → Extensions → Reload.

---

## Что уже реализовано (не ломай без причины)

| Функция | Файлы |
|--------|-------|
| Lexical widget `DrawioNode` | `src/lexical/DrawioNode.tsx`, `DrawioComponent.tsx` |
| Markdown `![alt](./assets/foo.drawio.svg)` | `src/lexical/DrawioTransformer.ts` |
| Slash `/Draw.io Diagram` | `src/markdown/performSlashDrawioInsert.ts`, `DrawioLexicalExtension.ts` (HIGH priority `drawio.insert`) |
| Drag-drop / paste `.drawio.svg`, `.drawio.png`, `.drawio` | `src/lexical/DrawioLexicalExtension.ts`, `src/drawio/fileKind.ts` |
| Edit overlay (embed.diagrams.net) | `src/components/DrawioEditOverlay.tsx`, `src/drawio/DrawioClient.ts` |
| Custom editor tab | `src/components/DrawioEditor.tsx` |
| XML preview через SVG export | `src/drawio/preview.ts` |
| Валидные шаблоны mxfile | `src/drawio/templates.ts` |

Форматы файлов:

- `*.drawio.svg` — SVG с `content="&lt;mxfile..."` (превью как картинка)
- `*.drawio.png` — PNG с embedded XML (binary write через `extensions:write-binary`)
- `*.drawio` / `*.dio` — plain mxfile XML (превью через export SVG в iframe)

---

## Критические ограничения Nimbalyst (обязательно соблюдать)

### 1. Bundling / imports

В `vite.config.ts` эти пакеты **external** — не бандлить:

`react`, `react-dom`, `lexical`, `@lexical/utils`, `@lexical/markdown`, `@nimbalyst/runtime`

**НЕ импортировать `@nimbalyst/extension-sdk` в runtime** — ломает extension host.  
Используй локальные типы: `src/types/extension.ts`, `src/types/nimbalyst-runtime.d.ts`.

`@nimbalyst/runtime` — только то, что реально нужно (например `useEditorLifecycle` в `DrawioEditor.tsx`). Не добавляй в `package.json`.

**НЕ импортировать `@lexical/rich-text`** и другие тяжёлые lexical-плагины без необходимости.

### 2. Extension entry surface (`src/index.tsx`)

```ts
export async function activate(context: ExtensionContext)
export function deactivate()
export const components = { DrawioEditor }
export const lexicalExtensions = { DrawioLexicalExtension }
export const transformers = { DRAWIO_IMAGE_TRANSFORMER }
export const slashCommandHandlers = { insertDrawioDiagram }
```

Имена в `manifest.json` → `contributions.*` должны совпадать с exports.

### 3. Lexical slash commands + async

Slash handler вызывается **внутри** `editor.update()` от ComponentPicker.  
**Нельзя** после `await` вызывать `$getSelection()` / `$insertNodes()` напрямую.

Паттерн (уже в проекте):

1. Синхронно вставить `DrawioNode` (или сохранить selection)
2. Async создать файл в `assets/`
3. `editor.update()` обновить `src` у ноды

Дублирующий перехват: `createCommand('drawio.insert')` с `COMMAND_PRIORITY_HIGH` в `DrawioLexicalExtension` — надёжнее bridge handler.

### 4. Пути к документу

Для multi-editor не полагаться только на `window.__currentDocumentPath`.  
Используй `getDocumentPathFromElement()` — walk up по `data-file-path` (как Nimbalyst `ImageComponent`).

### 5. draw.io embed API

- URL: `https://embed.diagrams.net/?embed=1&proto=json`
- Клиент: `src/drawio/DrawioClient.ts` (postMessage JSON protocol)
- Load: `loadXmlLike(fullSvgOrMxfile)` — для сохранённых SVG передавать **полный файл**, не только mxfile (compressed diagram data)
- Новые файлы: uncompressed `mxfile` с `<mxGraphModel>` в `src/drawio/templates.ts`
- Legacy corrupt template (v0.4.0): diagram payload `dWlkZWlk=` → заменять на empty mxfile

### 6. Electron APIs (когда доступны)

```ts
window.electronAPI.readFileContent(path, { binary })
window.electronAPI.saveFile(content, path)
window.electronAPI.invoke('extensions:write-binary', path, base64)
window.electronAPI.invoke('create-document', relPath, content, true)
window.__workspacePath
```

Fallback: `getExtensionContext().services.filesystem`.

### 7. Превью XML

`src/drawio/preview.ts` — singleton off-screen `DrawioClient` + очередь (не создавать iframe на каждый виджет).  
При ошибке/таймауте → placeholder в виджете.

---

## Референсы в monorepo Nimbalyst

Читай перед изменениями:

- `nimbalyst/docs/EXTENSION_ARCHITECTURE.md` — EditorHost, useEditorLifecycle
- `nimbalyst/packages/extension-sdk-docs/contribution-points.md` — manifest contributions
- `nimbalyst/packages/extensions/math/src/index.tsx` — sync slash commands
- `nimbalyst/packages/runtime/src/editor/extensions/builtin/MermaidExtension.ts` — Mermaid pattern
- `nimbalyst/packages/electron/src/renderer/extensions/ExtensionPluginBridge.ts` — как slash commands регистрируются

Похожие extensions: Mermaid (Lexical widget), Excalidraw (custom editor + overlay).

---

## Внешние источники

- draw.io embed: https://www.diagrams.net/doc/faq/embed-mode
- draw.io embed JSON protocol: https://github.com/jgraph/drawio-integration
- Lexical extensions: https://lexical.dev/docs/extensions/intro
- Формат `.drawio.svg`: SVG wrapper + HTML-escaped mxfile в атрибуте `content`

---

## Production-ready критерии (Definition of Done)

1. **Сборка:** `npm run build` без ошибок; `npm run validate` проходит
2. **Форматы:** `.drawio`, `.drawio.svg`, `.drawio.png` — drop, paste, slash, markdown round-trip, Edit, Save, Redraw
3. **Ошибки:** user-facing через `services.ui.showError`, не silent no-op
4. **Lexical:** нет error #63 (stale selection), нет nested read/update
5. **Превью:** svg/png — blob; xml — SVG export или placeholder
6. **Производительность:** один preview iframe + очередь; revoke blob URLs
7. **Стили:** CSS variables Nimbalyst (`--nim-bg`, `--nim-border`, …)
8. **Версия:** bump `manifest.json` + `package.json` синхронно
9. **README:** актуализировать под реальное поведение
10. **Не коммитить:** `node_modules/`, `dist/` (в .gitignore)

---

## Что я хочу изменить / улучшить

<!-- Заполни своими пунктами, например:

- Рефакторинг DrawioClient / убрать дублирование с DrawioEditor
- Slash-команда для `.drawio` XML (не только `.drawio.svg`)
- Drag из file tree Nimbalyst (не только OS drop)
- Кэш preview по mtime файла
- Тесты на fileKind.ts
- Улучшить UX placeholder / loading states

-->

---

## Как работать

1. Сначала прочитай затронутые файлы, не переписывай с нуля
2. Минимальный diff, следуй существующим conventions
3. После изменений: `npm run build`
4. Опиши manual test plan
5. Коммит только если я явно попрошу

Начни с аудита текущего кода и предложи план из 3–5 шагов, затем реализуй по одному.
