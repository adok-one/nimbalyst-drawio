/**
 * The /Draw.io Diagram command, and the Lexical constraint that shapes it.
 *
 * The handler runs INSIDE the update the typeahead menu started. By the time an awaited file
 * write returns, that menu has removed the trigger text node and the selection it belonged
 * to -- touching it then is Lexical error #63. So the node goes in synchronously with a
 * placeholder, and the real path is patched in afterwards by key.
 */
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  createEditor,
  type LexicalEditor,
} from 'lexical';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createDiagram = vi.fn();
vi.mock('../src/markdown/storeDrawioAsset.js', () => ({
  createDrawioDiagramBesideDocument: (...args: unknown[]) => createDiagram(...args),
}));

const { clearExtensionContext, setExtensionContext } = await import('../src/context.js');
const { $isDrawioNode, DrawioNode } = await import('../src/lexical/DrawioNode.js');
const { performSlashDrawioInsert } = await import('../src/markdown/performSlashDrawioInsert.js');
type ExtensionContext = import('../src/types/extension.js').ExtensionContext;

let editor: LexicalEditor;
let showError: ReturnType<typeof vi.fn>;
let root: HTMLElement;

function nodes() {
  return editor.getEditorState().read(() => $getRoot().getChildren());
}


/** `$insertNodes` puts the node inside the paragraph the caret was in, so this walks. */
function firstDrawio(): { src: string; altText: string } | null {
  return editor.getEditorState().read(() => {
    let found: { src: string; altText: string } | null = null;
    const walk = (parent: { getChildren: () => unknown[] }) => {
      for (const child of parent.getChildren()) {
        if (found) return;
        if ($isDrawioNode(child as never)) {
          const node = child as import('../src/lexical/DrawioNode.js').DrawioNode;
          found = { src: node.getSrc(), altText: node.getAltText() };
          return;
        }
        if (child && typeof (child as { getChildren?: unknown }).getChildren === 'function') {
          walk(child as { getChildren: () => unknown[] });
        }
      }
    };
    walk($getRoot() as unknown as { getChildren: () => unknown[] });
    return found;
  });
}

/** Run the handler the way the slash menu does: inside an update, with a live selection. */
function runInsert(): void {
  editor.update(
    () => {
      const paragraph = $createParagraphNode();
      const text = $createTextNode('/drawio');
      paragraph.append(text);
      $getRoot().clear().append(paragraph);
      text.select();
      performSlashDrawioInsert(editor);
    },
    { discrete: true },
  );
}

beforeEach(() => {
  showError = vi.fn();
  setExtensionContext({ services: { ui: { showError } } } as unknown as ExtensionContext);

  editor = createEditor({ namespace: 'test', nodes: [DrawioNode], onError: (e) => { throw e; } });
  root = document.createElement('div');
  root.contentEditable = 'true';
  root.setAttribute('data-file-path', '/ws/docs/notes.md');
  document.body.appendChild(root);
  editor.setRootElement(root);

  createDiagram.mockResolvedValue({
    relativePath: './assets/diagram-20260901000000.drawio.svg',
    absolutePath: '/ws/docs/assets/diagram-20260901000000.drawio.svg',
    altText: 'diagram-20260901000000',
  });
});

afterEach(() => {
  clearExtensionContext();
  document.body.innerHTML = '';
});

describe('performSlashDrawioInsert', () => {
  it('puts a node in immediately, before the file exists', () => {
    runInsert();

    expect(firstDrawio()).toEqual({ src: './assets/diagram.drawio.svg', altText: 'diagram' });
  });

  it('resolves the document from the editor, not from the focused-document global', () => {
    runInsert();

    expect(createDiagram).toHaveBeenCalledWith('diagram', '/ws/docs/notes.md');
  });

  it('patches the node once the file has been written', async () => {
    runInsert();

    await vi.waitFor(() =>
      expect(firstDrawio()).toEqual({
        src: './assets/diagram-20260901000000.drawio.svg',
        altText: 'diagram-20260901000000',
      }),
    );
  });

  /**
   * The placeholder must not survive a failure: it points at a file that was never created,
   * so the widget would show a broken diagram the person cannot fix or delete meaningfully.
   */
  it('takes the placeholder back out when the file could not be written', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    createDiagram.mockRejectedValue(new Error('Open a markdown document first'));

    runInsert();
    expect(firstDrawio()).not.toBeNull();

    await vi.waitFor(() => expect(firstDrawio()).toBeNull());
    expect(showError).toHaveBeenCalledWith('Open a markdown document first');
    expect(error).toHaveBeenCalled();
  });

  it('shows something even when what was thrown is not an Error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    createDiagram.mockRejectedValue('nope');

    runInsert();

    await vi.waitFor(() => expect(showError).toHaveBeenCalledWith('Failed to insert draw.io diagram'));
  });

  it('does nothing at all without a range selection', () => {
    editor.update(
      () => {
        $getRoot().clear();
        performSlashDrawioInsert(editor);
      },
      { discrete: true },
    );

    expect(nodes()).toHaveLength(0);
    expect(createDiagram).not.toHaveBeenCalled();
  });
});
