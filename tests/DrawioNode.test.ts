/**
 * The Lexical node. Two of its jobs outlive the session: `exportJSON`/`importJSON` is what a
 * saved document holds, and `exportDOM`/`importDOM` is what a copy-paste carries. Both have
 * to keep meaning the same thing across versions.
 */
import { $getRoot, $isDecoratorNode, createEditor, type LexicalEditor } from 'lexical';
import { beforeEach, describe, expect, it } from 'vitest';
import { $createDrawioNode, $isDrawioNode, DrawioNode } from '../src/lexical/DrawioNode.js';

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

/** Lexical refuses to build nodes outside an update; this runs one and returns the result. */
function inEditor<T>(fn: () => T): T {
  let result: T;
  editor.update(
    () => {
      result = fn();
    },
    { discrete: true },
  );
  return result!;
}

describe('identity', () => {
  it('registers under the type the manifest and saved documents use', () => {
    expect(DrawioNode.getType()).toBe('drawio');
  });

  it('is a decorator node -- it renders React, not text', () => {
    inEditor(() => {
      expect($isDecoratorNode($createDrawioNode())).toBe(true);
    });
  });

  it('recognises its own and nothing else', () => {
    inEditor(() => {
      expect($isDrawioNode($createDrawioNode())).toBe(true);
      expect($isDrawioNode(null)).toBe(false);
      expect($isDrawioNode(undefined)).toBe(false);
      expect($isDrawioNode($getRoot())).toBe(false);
    });
  });

  it('is not keyboard-selectable, so arrow keys walk past it', () => {
    inEditor(() => {
      expect($createDrawioNode().isKeyboardSelectable()).toBe(false);
    });
  });
});

describe('$createDrawioNode', () => {
  it('defaults to a placeholder the slash command then overwrites', () => {
    inEditor(() => {
      const node = $createDrawioNode();
      expect(node.getSrc()).toBe('./assets/diagram.drawio.svg');
      expect(node.getAltText()).toBe('diagram');
    });
  });

  it('takes src and altText when given them', () => {
    inEditor(() => {
      const node = $createDrawioNode({ src: './assets/a.drawio.png', altText: 'flow' });
      expect(node.getSrc()).toBe('./assets/a.drawio.png');
      expect(node.getAltText()).toBe('flow');
      expect(node.getTextContent()).toBe('flow');
    });
  });
});

describe('serialisation', () => {
  it('round-trips through JSON', () => {
    inEditor(() => {
      const json = $createDrawioNode({ src: './assets/a.drawio.svg', altText: 'flow' }).exportJSON();
      expect(json).toMatchObject({ type: 'drawio', version: 1, src: './assets/a.drawio.svg', altText: 'flow' });

      const restored = DrawioNode.importJSON(json);
      expect(restored.getSrc()).toBe('./assets/a.drawio.svg');
      expect(restored.getAltText()).toBe('flow');
    });
  });

  it('survives a full editor state round trip', () => {
    editor.update(
      () => {
        $getRoot().append($createDrawioNode({ src: './assets/a.drawio.svg', altText: 'flow' }));
      },
      { discrete: true },
    );

    const serialized = JSON.stringify(editor.getEditorState().toJSON());
    const restored = createEditor({ nodes: [DrawioNode], onError: (e) => { throw e; } });
    restored.setEditorState(restored.parseEditorState(serialized));

    restored.getEditorState().read(() => {
      const node = $getRoot().getFirstChild();
      expect($isDrawioNode(node)).toBe(true);
      expect((node as DrawioNode).getSrc()).toBe('./assets/a.drawio.svg');
    });
  });

  it('clone keeps the key, so an edit does not become a new node', () => {
    inEditor(() => {
      const node = $createDrawioNode({ src: './a.drawio', altText: 'x' });
      const clone = DrawioNode.clone(node);
      expect(clone.getKey()).toBe(node.getKey());
      expect(clone.getSrc()).toBe('./a.drawio');
    });
  });
});

describe('mutation', () => {
  it('setSrc / setAltText go through getWritable and stick', () => {
    let key = '';
    editor.update(
      () => {
        const node = $createDrawioNode();
        $getRoot().append(node);
        key = node.getKey();
      },
      { discrete: true },
    );

    editor.update(
      () => {
        const node = $getRoot().getFirstChild() as DrawioNode;
        node.setSrc('./assets/renamed.drawio.svg');
        node.setAltText('renamed');
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      const node = $getRoot().getFirstChild() as DrawioNode;
      expect(node.getKey()).toBe(key);
      expect(node.getSrc()).toBe('./assets/renamed.drawio.svg');
      expect(node.getAltText()).toBe('renamed');
    });
  });

  it('updateDOM only asks for a re-render when something the DOM shows changed', () => {
    inEditor(() => {
      const before = $createDrawioNode({ src: './a.drawio.svg', altText: 'x' });
      const same = $createDrawioNode({ src: './a.drawio.svg', altText: 'x' });
      const newSrc = $createDrawioNode({ src: './b.drawio.svg', altText: 'x' });
      const newAlt = $createDrawioNode({ src: './a.drawio.svg', altText: 'y' });

      expect(same.updateDOM(before)).toBe(false);
      expect(newSrc.updateDOM(before)).toBe(true);
      expect(newAlt.updateDOM(before)).toBe(true);
    });
  });
});

describe('DOM export and import', () => {
  it('exports a container the importer can recognise again', () => {
    inEditor(() => {
      const { element } = $createDrawioNode({ src: './assets/a.drawio.svg', altText: 'flow' }).exportDOM();
      const div = element as HTMLElement;

      expect(div.classList.contains('drawio-container')).toBe(true);
      const img = div.querySelector('img')!;
      expect(img.getAttribute('src')).toBe('./assets/a.drawio.svg');
      expect(img.getAttribute('alt')).toBe('flow');
    });
  });

  it('round-trips through exportDOM and importDOM', () => {
    inEditor(() => {
      const { element } = $createDrawioNode({ src: './assets/a.drawio.svg', altText: 'flow' }).exportDOM();
      const conversion = DrawioNode.importDOM()!.div!(element as HTMLElement);
      const node = conversion!.conversion(element as HTMLElement)!.node as DrawioNode;

      expect($isDrawioNode(node)).toBe(true);
      expect(node.getSrc()).toBe('./assets/a.drawio.svg');
      expect(node.getAltText()).toBe('flow');
    });
  });

  it('ignores a div that is not one of ours', () => {
    const foreign = document.createElement('div');
    expect(DrawioNode.importDOM()!.div!(foreign)).toBeNull();
  });

  it('declines a container with no image in it rather than making an empty node', () => {
    inEditor(() => {
      const empty = document.createElement('div');
      empty.classList.add('drawio-container');
      const conversion = DrawioNode.importDOM()!.div!(empty);
      expect(conversion!.conversion(empty)).toBeNull();
    });
  });

  it('createDOM produces the container the stylesheet targets', () => {
    inEditor(() => {
      const dom = $createDrawioNode().createDOM({ namespace: 'test', theme: {} });
      expect(dom.tagName).toBe('DIV');
      expect(dom.classList.contains('drawio-container')).toBe(true);
    });
  });
});
