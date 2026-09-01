/**
 * The Lexical extension: what the editor gains when the plugin is registered. Drag-drop and
 * paste are the interesting half -- the host has its own image handlers on the same events,
 * so ours has to claim a draw.io file before they see it, and let everything else past.
 */
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  DecoratorNode,
  createCommand,
  createEditor,
  type LexicalEditor,
  type NodeKey,
} from 'lexical';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DrawioNode as DrawioNodeType } from '../src/lexical/DrawioNode.js';

const uploadDrawioImagePreserveName = vi.fn();
vi.mock('../src/markdown/drawioUpload.js', () => ({
  uploadDrawioImagePreserveName: (...args: unknown[]) => uploadDrawioImagePreserveName(...args),
}));

const { clearExtensionContext, setExtensionContext } = await import('../src/context.js');
const { DrawioLexicalExtension } = await import('../src/lexical/DrawioLexicalExtension.js');
const { INSERT_DRAWIO_COMMAND } = await import('../src/lexical/DrawioCommands.js');
const { $isDrawioNode, DrawioNode } = await import('../src/lexical/DrawioNode.js');
const { getFocusedDrawioEditor } = await import('../src/lexical/drawioEditorRegistry.js');
const { peekUploadFileName } = await import('../src/markdown/pendingUploadName.js');
type ExtensionContext = import('../src/types/extension.js').ExtensionContext;

let editor: LexicalEditor;
let root: HTMLElement;
let teardown: () => void;
let showError: ReturnType<typeof vi.fn>;

function drawioNodes(): DrawioNodeType[] {
  return editor.getEditorState().read(() => {
    const found: DrawioNodeType[] = [];
    const walk = (parent: { getChildren: () => unknown[] }) => {
      for (const child of parent.getChildren()) {
        if ($isDrawioNode(child as never)) found.push(child as DrawioNodeType);
        else if (typeof (child as { getChildren?: unknown }).getChildren === 'function') {
          walk(child as { getChildren: () => unknown[] });
        }
      }
    };
    walk($getRoot() as unknown as { getChildren: () => unknown[] });
    return found;
  });
}

function withCaret(): void {
  editor.update(
    () => {
      const paragraph = $createParagraphNode();
      const text = $createTextNode('x');
      paragraph.append(text);
      $getRoot().clear().append(paragraph);
      text.select();
    },
    { discrete: true },
  );
}

function fileOf(name: string, type = ''): File {
  return new File(['<svg content="&lt;mxfile host=&quot;a&quot;&gt;&lt;/mxfile&gt;"/>'], name, { type });
}

/** jsdom has no DataTransfer worth using; the handlers only read `.files`. */
function fileEvent(type: 'drop' | 'paste', files: File[]): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, type === 'drop' ? 'dataTransfer' : 'clipboardData', {
    value: { files },
  });
  return event;
}

/**
 * Mount an editor with a root element OF ITS OWN. Two editors sharing one element reconcile
 * against each other and never settle -- the run hangs with no output at all.
 */
function mount(nodes: unknown[] = [DrawioNode]): void {
  editor = createEditor({
    namespace: 'test',
    nodes: nodes as never,
    onError: (e) => { throw e; },
  });
  root = document.createElement('div');
  root.contentEditable = 'true';
  root.tabIndex = -1;
  root.setAttribute('data-file-path', '/ws/docs/notes.md');
  document.body.appendChild(root);
  editor.setRootElement(root);
  teardown = registerOn(editor);
}

/**
 * Lexical hands `register` three arguments (editor, config, state); this extension's own
 * implementation takes only the first and ignores the rest, so the call is narrowed here
 * rather than fabricating a config and a state that nothing reads.
 */
function registerOn(target: LexicalEditor): () => void {
  const register = DrawioLexicalExtension.register as unknown as (editor: LexicalEditor) => () => void;
  return register(target);
}

/** Throw away the editor `beforeEach` built and mount another that also knows image nodes. */
function remountWithImages(): void {
  teardown();
  mount([DrawioNode, FakeImageNode]);
}

beforeEach(() => {
  showError = vi.fn();
  setExtensionContext({ services: { ui: { showError } } } as unknown as ExtensionContext);

  uploadDrawioImagePreserveName.mockResolvedValue({
    kind: 'image',
    src: './assets/a.drawio.svg',
    altText: 'a',
  });

  mount();
});

afterEach(() => {
  teardown();
  clearExtensionContext();
  document.body.innerHTML = '';
});

describe('the extension itself', () => {
  it('is namespaced to this extension and brings its node', () => {
    expect(DrawioLexicalExtension.name).toBe('com.altusnova.drawio/lexical');
    expect(DrawioLexicalExtension.nodes).toContain(DrawioNode);
  });

  it('registers the editor so a slash command can find it', () => {
    expect(getFocusedDrawioEditor()).toBe(editor);
  });

  it('unregisters it again on teardown', () => {
    teardown();
    teardown = () => {};
    expect(getFocusedDrawioEditor()).toBeUndefined();
  });

  it('remembers the editor the person last typed in', () => {
    root.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(getFocusedDrawioEditor()).toBe(editor);
  });
});

/** Stands in for the host's image node, which markdown import builds before we see it. */
class FakeImageNode extends DecoratorNode<null> {
  // Defaults and a static importJSON, both of which Lexical requires of a registered node.
  constructor(public __src = '', public __altText = '', key?: NodeKey) {
    super(key);
  }
  static getType(): string {
    return 'image';
  }
  static importJSON(): FakeImageNode {
    return new FakeImageNode();
  }
  static clone(node: FakeImageNode): FakeImageNode {
    return new FakeImageNode(node.__src, node.__altText, node.__key);
  }
  exportJSON() {
    return { type: 'image', version: 1 };
  }
  createDOM(): HTMLElement {
    return document.createElement('span');
  }
  updateDOM(): boolean {
    return false;
  }
  decorate(): null {
    return null;
  }
  getSrc(): string {
    return this.__src;
  }
  getAltText(): string {
    return this.__altText;
  }
}

describe('upgrading images the host built first', () => {
  it('replaces an image pointing at a diagram, as soon as one appears', async () => {
    remountWithImages();

    editor.update(() => { $getRoot().append(new FakeImageNode('./assets/a.drawio.svg', 'flow')); });

    await vi.waitFor(() => expect(drawioNodes()).toHaveLength(1));
    expect(drawioNodes()[0].getAltText()).toBe('flow');
  });

  it('leaves an ordinary image where it is, and does not loop doing so', async () => {
    remountWithImages();

    editor.update(() => { $getRoot().append(new FakeImageNode('./assets/photo.png', 'p')); });
    await Promise.resolve();

    expect(drawioNodes()).toHaveLength(0);
  });
});

describe('INSERT_DRAWIO_COMMAND', () => {
  it('inserts a node with the payload it was given', async () => {
    withCaret();

    editor.dispatchCommand(INSERT_DRAWIO_COMMAND, { src: './assets/b.drawio.png', altText: 'b' });

    // A command handler runs inside an update Lexical commits on its own schedule, so the
    // assertion waits for the state rather than for the dispatch to return.
    await vi.waitFor(() => expect(drawioNodes()).toHaveLength(1));
    expect(drawioNodes()[0].getSrc()).toBe('./assets/b.drawio.png');
    expect(drawioNodes()[0].getAltText()).toBe('b');
  });

  it('falls back to the placeholder when the payload says nothing', async () => {
    withCaret();

    editor.dispatchCommand(INSERT_DRAWIO_COMMAND, {} as never);

    await vi.waitFor(() => expect(drawioNodes()).toHaveLength(1));
    expect(drawioNodes()[0].getSrc()).toBe('./assets/diagram.drawio.svg');
    expect(drawioNodes()[0].getAltText()).toBe('diagram');
  });

  it('inserts nothing when there is no caret to insert at', async () => {
    editor.update(() => $getRoot().clear(), { discrete: true });

    editor.dispatchCommand(INSERT_DRAWIO_COMMAND, { src: './a.drawio.svg' });
    await Promise.resolve();

    expect(drawioNodes()).toHaveLength(0);
  });
});

/**
 * Until 2026-09-01 the extension also registered a handler against a command it built itself
 * as `createCommand('drawio.insert')`, described as a more reliable duplicate of the bridge
 * handler. It could never fire, and it is gone.
 *
 * Lexical matches commands by OBJECT IDENTITY -- the string is only a devtools label -- so a
 * command built here and a command the host built for the same id are two different things.
 * This test is what keeps that from being re-added: dispatching `drawio.insert` into the
 * editor does nothing, and the live path is `slashCommandHandlers.insertDrawioDiagram`,
 * covered in `slashCommandHandlers.test.ts`.
 */
describe('the slash command', () => {
  it('is not reachable by dispatching a command with that id into the editor', async () => {
    withCaret();

    editor.dispatchCommand(createCommand<void>('drawio.insert'), undefined);
    await Promise.resolve();

    expect(drawioNodes()).toHaveLength(0);
  });
});

describe.each(['drop', 'paste'] as const)('%s', (kind) => {
  it('claims a draw.io file and inserts it', async () => {
    withCaret();
    const event = fileEvent(kind, [fileOf('a.drawio.svg')]);

    root.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(drawioNodes()).toHaveLength(1));
    expect(uploadDrawioImagePreserveName).toHaveBeenCalledWith(expect.any(File), '/ws/docs/notes.md');
  });

  it('lets a file that is not a diagram through to the host', () => {
    const event = fileEvent(kind, [new File(['hello'], 'notes.txt', { type: 'text/plain' })]);

    root.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(uploadDrawioImagePreserveName).not.toHaveBeenCalled();
  });

  /**
   * A .png could be either. The event is claimed on the cheap name/type check and the bytes
   * are read afterwards -- so a plain screenshot is claimed, found not to be a diagram, and
   * quietly dropped rather than handed back to the host. Pinned as the known cost of
   * claiming early: the alternative is reading megabytes before deciding to preventDefault.
   */
  it('claims an ordinary .png and then inserts nothing', async () => {
    withCaret();
    const event = fileEvent(kind, [new File(['plain'], 'shot.png', { type: 'image/png' })]);

    root.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(drawioNodes()).toHaveLength(0);
    expect(uploadDrawioImagePreserveName).not.toHaveBeenCalled();
  });

  it('ignores an event carrying no files at all', () => {
    const event = fileEvent(kind, []);

    root.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it('remembers the name for the upload pipeline', () => {
    root.dispatchEvent(fileEvent(kind, [fileOf('remembered.drawio.svg')]));

    expect(peekUploadFileName()).toBe('remembered.drawio.svg');
  });

  it('reports a failed store instead of failing silently', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    uploadDrawioImagePreserveName.mockRejectedValue(new Error('disk full'));
    withCaret();

    root.dispatchEvent(fileEvent(kind, [fileOf('a.drawio.svg')]));

    await vi.waitFor(() => expect(showError).toHaveBeenCalledWith('disk full'));
  });

  it('inserts every diagram in a multi-file drop', async () => {
    withCaret();

    root.dispatchEvent(fileEvent(kind, [fileOf('a.drawio.svg'), fileOf('b.drawio.svg')]));

    await vi.waitFor(() => expect(drawioNodes()).toHaveLength(2));
  });
});
