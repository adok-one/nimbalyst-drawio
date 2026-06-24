import {
  $applyNodeReplacement,
  DecoratorNode,
  type DOMConversionMap,
  type DOMConversionOutput,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical';
import { addClassNamesToElement } from '@lexical/utils';
import type { JSX } from 'react';
import { DrawioComponent } from './DrawioComponent.js';

export type DrawioPayload = {
  src: string;
  altText?: string;
  key?: NodeKey;
};

export type SerializedDrawioNode = Spread<
  {
    src: string;
    altText: string;
  },
  SerializedLexicalNode
>;

export class DrawioNode extends DecoratorNode<JSX.Element> {
  __src: string;
  __altText: string;

  constructor(src: string, altText: string, key?: NodeKey) {
    super(key);
    this.__src = src;
    this.__altText = altText;
  }

  static getType(): string {
    return 'drawio';
  }

  static clone(node: DrawioNode): DrawioNode {
    return new DrawioNode(node.__src, node.__altText, node.__key);
  }

  static importJSON(serializedNode: SerializedDrawioNode): DrawioNode {
    const { src, altText } = serializedNode;
    return $createDrawioNode({ src, altText });
  }

  exportJSON(): SerializedDrawioNode {
    return {
      altText: this.__altText,
      src: this.__src,
      type: 'drawio',
      version: 1,
    };
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement('div');
    addClassNamesToElement(div, 'drawio-container');
    return div;
  }

  updateDOM(prevNode: DrawioNode): boolean {
    return prevNode.__src !== this.__src || prevNode.__altText !== this.__altText;
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('div');
    element.classList.add('drawio-container');
    const img = document.createElement('img');
    img.src = this.__src;
    img.alt = this.__altText;
    element.appendChild(img);
    return { element };
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (domNode: HTMLElement) => {
        if (!domNode.classList.contains('drawio-container')) {
          return null;
        }
        return {
          conversion: convertDrawioElement,
          priority: 2,
        };
      },
    };
  }

  getSrc(): string {
    return this.__src;
  }

  getAltText(): string {
    return this.__altText;
  }

  getTextContent(): string {
    return this.__altText;
  }

  setSrc(src: string): void {
    const writable = this.getWritable();
    writable.__src = src;
  }

  setAltText(altText: string): void {
    const writable = this.getWritable();
    writable.__altText = altText;
  }

  decorate(_editor: LexicalEditor, config: EditorConfig): JSX.Element {
    const embedBlockTheme = config.theme.embedBlock || {};
    const className = embedBlockTheme.base || '';
    return (
      <DrawioComponent
        altText={this.__altText}
        className={className}
        src={this.__src}
      />
    );
  }

  isKeyboardSelectable(): boolean {
    return false;
  }
}

function convertDrawioElement(domNode: HTMLElement): DOMConversionOutput | null {
  const img = domNode.querySelector('img');
  if (!img) {
    return null;
  }
  const src = img.getAttribute('src') ?? '';
  const altText = img.getAttribute('alt') ?? '';
  return { node: $createDrawioNode({ altText, src }) };
}

export function $createDrawioNode(payload?: DrawioPayload): DrawioNode {
  const src = payload?.src ?? './assets/diagram.drawio.svg';
  const altText = payload?.altText ?? 'diagram';
  return $applyNodeReplacement(new DrawioNode(src, altText, payload?.key));
}

export function $isDrawioNode(node: LexicalNode | null | undefined): node is DrawioNode {
  return node instanceof DrawioNode;
}
