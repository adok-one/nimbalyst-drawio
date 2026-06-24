import { $getRoot, type LexicalNode } from 'lexical';
import { $dfs } from '@lexical/utils';
import { isDrawioAssetPath } from '../drawio/fileKind.js';
import { $createDrawioNode } from './DrawioNode.js';

type ImageLikeNode = LexicalNode & {
  getSrc: () => string;
  getAltText: () => string;
};

function $isImageLikeNode(node: LexicalNode): node is ImageLikeNode {
  return (
    node.getType() === 'image' &&
    typeof (node as ImageLikeNode).getSrc === 'function' &&
    typeof (node as ImageLikeNode).getAltText === 'function'
  );
}

/** IMAGE transformer runs before ours on markdown import — upgrade image nodes for draw.io paths. */
export function $migrateDrawioImageNodes(): boolean {
  let migrated = false;

  for (const { node } of $dfs($getRoot())) {
    if (!$isImageLikeNode(node)) {
      continue;
    }
    const src = node.getSrc();
    if (!isDrawioAssetPath(src)) {
      continue;
    }
    node.replace(
      $createDrawioNode({
        altText: node.getAltText() || 'diagram',
        src,
      }),
    );
    migrated = true;
  }

  return migrated;
}
