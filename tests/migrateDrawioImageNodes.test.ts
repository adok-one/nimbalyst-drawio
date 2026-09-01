/**
 * On markdown import the host's own IMAGE transformer runs first, so a diagram link can
 * already be an ordinary image node by the time ours would have seen it. This pass walks
 * what was built and upgrades the ones that point at draw.io assets.
 */
import {
  $getRoot,
  DecoratorNode,
  createEditor,
  type LexicalEditor,
  type NodeKey,
} from 'lexical';
import { beforeEach, describe, expect, it } from 'vitest';
import { $isDrawioNode, DrawioNode } from '../src/lexical/DrawioNode.js';
import { $migrateDrawioImageNodes } from '../src/lexical/migrateDrawioImageNodes.js';

/** Stands in for the host's image node: the migration only asks for these three members. */
class FakeImageNode extends DecoratorNode<null> {
  __src: string;
  __altText: string;

  constructor(src: string, altText: string, key?: NodeKey) {
    super(key);
    this.__src = src;
    this.__altText = altText;
  }

  static getType(): string {
    return 'image';
  }

  static clone(node: FakeImageNode): FakeImageNode {
    return new FakeImageNode(node.__src, node.__altText, node.__key);
  }

  static importJSON(): FakeImageNode {
    return new FakeImageNode('', '');
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

/** A decorator that is NOT an image -- the walk must not touch it. */
class OtherNode extends FakeImageNode {
  static getType(): string {
    return 'other';
  }
  static clone(node: OtherNode): OtherNode {
    return new OtherNode(node.__src, node.__altText, node.__key);
  }
}

let editor: LexicalEditor;

beforeEach(() => {
  editor = createEditor({
    namespace: 'test',
    nodes: [DrawioNode, FakeImageNode, OtherNode],
    onError: (error) => {
      throw error;
    },
  });
});

function withNodes(build: () => void): boolean {
  let migrated = false;
  editor.update(
    () => {
      build();
      migrated = $migrateDrawioImageNodes();
    },
    { discrete: true },
  );
  return migrated;
}

function children() {
  return editor.getEditorState().read(() => $getRoot().getChildren());
}

describe('$migrateDrawioImageNodes', () => {
  it.each(['./assets/a.drawio.svg', './assets/a.drawio.png', './assets/a.drawio', './assets/a.dio'])(
    'upgrades an image pointing at %s',
    (src) => {
      expect(withNodes(() => $getRoot().append(new FakeImageNode(src, 'flow')))).toBe(true);

      const [node] = children();
      expect($isDrawioNode(node)).toBe(true);
      expect((node as DrawioNode).getSrc()).toBe(src);
      expect((node as DrawioNode).getAltText()).toBe('flow');
    },
  );

  it('names an image that had no alt text', () => {
    withNodes(() => $getRoot().append(new FakeImageNode('./assets/a.drawio.svg', '')));
    expect((children()[0] as DrawioNode).getAltText()).toBe('diagram');
  });

  it('leaves ordinary images where they are', () => {
    expect(withNodes(() => $getRoot().append(new FakeImageNode('./assets/photo.png', 'p')))).toBe(false);
    expect($isDrawioNode(children()[0])).toBe(false);
  });

  it('goes by node type, not by shape -- another decorator with getSrc is not an image', () => {
    expect(withNodes(() => $getRoot().append(new OtherNode('./assets/a.drawio.svg', 'x')))).toBe(false);
    expect($isDrawioNode(children()[0])).toBe(false);
  });

  it('migrates every image in the document, not just the first', () => {
    withNodes(() => {
      $getRoot().append(
        new FakeImageNode('./assets/a.drawio.svg', 'a'),
        new FakeImageNode('./assets/photo.png', 'b'),
        new FakeImageNode('./assets/c.drawio', 'c'),
      );
    });

    const [first, second, third] = children();
    expect($isDrawioNode(first)).toBe(true);
    expect($isDrawioNode(second)).toBe(false);
    expect($isDrawioNode(third)).toBe(true);
  });

  it('reports nothing to do on a document without images', () => {
    expect(withNodes(() => undefined)).toBe(false);
  });

  it('is idempotent -- a second pass finds nothing left', () => {
    withNodes(() => $getRoot().append(new FakeImageNode('./assets/a.drawio.svg', 'a')));

    let again = true;
    editor.update(() => { again = $migrateDrawioImageNodes(); }, { discrete: true });
    expect(again).toBe(false);
  });
});
