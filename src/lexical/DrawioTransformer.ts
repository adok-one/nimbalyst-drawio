import type { TextMatchTransformer } from '@lexical/markdown';
import { $createDrawioNode, $isDrawioNode, DrawioNode } from './DrawioNode.js';

const DRAWIO_IMAGE_IMPORT_REGEXP =
  /(?<!\[)!\[([^\[]*)\]\(([^)]+\.(?:drawio\.(?:svg|png)|drawio|dio))(?:\?[^)]*)?\)/i;

export const DRAWIO_IMAGE_TRANSFORMER: TextMatchTransformer = {
  dependencies: [DrawioNode],
  export: (node) => {
    if (!$isDrawioNode(node)) {
      return null;
    }
    return `![${node.getAltText()}](${node.getSrc()})`;
  },
  importRegExp: DRAWIO_IMAGE_IMPORT_REGEXP,
  regExp: DRAWIO_IMAGE_IMPORT_REGEXP,
  replace: (textNode, match) => {
    const [, altText, src] = match;
    textNode.replace(
      $createDrawioNode({
        altText: altText || 'diagram',
        src,
      }),
    );
  },
  trigger: ')',
  type: 'text-match',
};
