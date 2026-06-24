import { buildEmptyDrawioSvg } from '../drawio/templates.js';
import { getDocumentPathFromWindow } from '../utils/resolveDrawioAssetUrl.js';
import { writeDrawioAssetToDocument } from './writeDrawioAsset.js';

const DRAWIO_SVG_TEMPLATE = buildEmptyDrawioSvg();

function uniqueDiagramName(base: string): string {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `${base}-${stamp}`;
}

export async function createDrawioDiagramBesideDocument(
  title = 'diagram',
  documentPathOverride?: string,
): Promise<{ relativePath: string; absolutePath: string; altText: string }> {
  const documentPath =
    documentPathOverride ?? (typeof window === 'undefined' ? undefined : getDocumentPathFromWindow());
  if (!documentPath) {
    throw new Error('Open a markdown document before inserting a draw.io diagram');
  }

  const baseName = uniqueDiagramName(
    title.replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '') || 'diagram',
  );
  const fileName = `${baseName}.drawio.svg`;
  const bytes = new TextEncoder().encode(DRAWIO_SVG_TEMPLATE);

  const written = await writeDrawioAssetToDocument({ documentPath, fileName, bytes });

  return {
    relativePath: written.relativePath,
    absolutePath: written.absolutePath,
    altText: baseName,
  };
}
