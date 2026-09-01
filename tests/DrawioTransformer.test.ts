/**
 * The markdown round trip. A diagram is stored as an ordinary image link -- so the file stays
 * readable in GitHub, VS Code and every other markdown tool -- and the transformer is what
 * makes that link a widget on the way in and a link again on the way out.
 */
import { $convertFromMarkdownString, $convertToMarkdownString } from '@lexical/markdown';
import { $getRoot, createEditor, type LexicalEditor } from 'lexical';
import { beforeEach, describe, expect, it } from 'vitest';
import { DRAWIO_IMAGE_TRANSFORMER } from '../src/lexical/DrawioTransformer.js';
import { $isDrawioNode, DrawioNode } from '../src/lexical/DrawioNode.js';

const TRANSFORMERS = [DRAWIO_IMAGE_TRANSFORMER];

let editor: LexicalEditor;

beforeEach(() => {
  editor = createEditor({
    namespace: 'test',
    nodes: [DrawioNode],
    onError: (error) => {
      throw error;
    },
  });
});

function importMarkdown(markdown: string): void {
  editor.update(() => $convertFromMarkdownString(markdown, TRANSFORMERS), { discrete: true });
}

function exportMarkdown(): string {
  let out = '';
  editor.getEditorState().read(() => {
    out = $convertToMarkdownString(TRANSFORMERS);
  });
  return out;
}

function firstDrawioNode(): DrawioNode | null {
  let found: DrawioNode | null = null;
  editor.getEditorState().read(() => {
    const walk = (parent: ReturnType<typeof $getRoot>) => {
      for (const child of parent.getChildren()) {
        if ($isDrawioNode(child)) {
          found = child;
          return;
        }
        if ('getChildren' in child) {
          walk(child as ReturnType<typeof $getRoot>);
        }
      }
    };
    walk($getRoot());
  });
  return found;
}

describe('import', () => {
  it.each([
    './assets/a.drawio.svg',
    './assets/a.drawio.png',
    './assets/a.drawio',
    './assets/a.dio',
    'assets/a.drawio.svg',
  ])('turns ![flow](%s) into a diagram node', (src) => {
    importMarkdown(`![flow](${src})`);

    const node = firstDrawioNode();
    expect(node).not.toBeNull();
    expect(node!.getSrc()).toBe(src);
    expect(node!.getAltText()).toBe('flow');
  });

  it('keeps a cache-busting query out of the stored src', () => {
    importMarkdown('![flow](./assets/a.drawio.svg?v=17)');
    expect(firstDrawioNode()!.getSrc()).toBe('./assets/a.drawio.svg');
  });

  it('names an unlabelled diagram rather than leaving the alt empty', () => {
    importMarkdown('![](./assets/a.drawio.svg)');
    expect(firstDrawioNode()!.getAltText()).toBe('diagram');
  });

  it.each(['![x](./assets/a.svg)', '![x](./assets/a.png)', '![x](./a.drawio.xml)'])(
    'leaves an ordinary image alone: %s',
    (markdown) => {
      importMarkdown(markdown);
      expect(firstDrawioNode()).toBeNull();
    },
  );

  /**
   * The pattern refuses a `[` immediately before the `!`, which is a linked image --
   * `[![alt](diagram.drawio.svg)](target)`. Swallowing the inner image there would drop the
   * surrounding link from the document.
   */
  it('does not claim an image that is the body of a link', () => {
    importMarkdown('[![flow](./assets/a.drawio.svg)](https://example.com)');
    expect(firstDrawioNode()).toBeNull();
  });
});

describe('export', () => {
  it('writes the node back as the same markdown it came from', () => {
    importMarkdown('![flow](./assets/a.drawio.svg)');
    expect(exportMarkdown()).toBe('![flow](./assets/a.drawio.svg)');
  });

  it.each([
    './assets/a.drawio.svg',
    './assets/a.drawio.png',
    './assets/a.drawio',
  ])('round-trips %s unchanged', (src) => {
    const markdown = `![flow](${src})`;
    importMarkdown(markdown);
    expect(exportMarkdown()).toBe(markdown);
  });

  it('exports nothing for a node that is not ours', () => {
    editor.update(
      () => {
        expect(DRAWIO_IMAGE_TRANSFORMER.export!($getRoot(), () => '', () => '')).toBeNull();
      },
      { discrete: true },
    );
  });
});

describe('the transformer itself', () => {
  it('declares the node it creates, so an editor without it fails loudly at setup', () => {
    expect(DRAWIO_IMAGE_TRANSFORMER.dependencies).toContain(DrawioNode);
  });

  it('triggers on the closing bracket, not on every keystroke', () => {
    expect(DRAWIO_IMAGE_TRANSFORMER.trigger).toBe(')');
    expect(DRAWIO_IMAGE_TRANSFORMER.type).toBe('text-match');
  });
});
