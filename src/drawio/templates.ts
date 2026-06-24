import type { DrawioFileKind } from './fileKind.js';

/** Uncompressed empty diagram — safe for embed.diagrams.net load. */
export const EMPTY_MXFILE_XML = `<mxfile host="app.diagrams.net" agent="Nimbalyst Draw.io" version="24.7.0"><diagram id="diagram-1" name="Page-1"><mxGraphModel dx="1000" dy="600" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`;

function escapeForSvgContentAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildEmptyDrawioSvg(): string {
  const encoded = escapeForSvgContentAttribute(EMPTY_MXFILE_XML);
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="1px" height="1px" content="${encoded}"><defs/><g/></svg>`;
}

export function extractMxfileFromDrawioSvg(svg: string): string | null {
  const inlineStart = svg.indexOf('<mxfile');
  if (inlineStart >= 0) {
    const inlineEnd = svg.lastIndexOf('</mxfile>');
    if (inlineEnd > inlineStart) {
      return svg.slice(inlineStart, inlineEnd + '</mxfile>'.length);
    }
  }

  const contentMatch = svg.match(/\bcontent="([^"]+)"/);
  if (!contentMatch) {
    return null;
  }

  return contentMatch[1]
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function hasEditableGraphModel(xml: string): boolean {
  return /<mxGraphModel[\s>]/i.test(xml);
}

/** v0.4.0–0.4.2 starter SVG with broken deflate payload (zlib error on load). */
function isLegacyCorruptMxfile(mxfile: string): boolean {
  if (hasEditableGraphModel(mxfile)) {
    return false;
  }
  const diagramMatch = mxfile.match(/<diagram[^>]*>([\s\S]*?)<\/diagram>/i);
  if (!diagramMatch) {
    return false;
  }
  return diagramMatch[1].trim().startsWith('dWlkZWlk=');
}

/**
 * XML payload for embed.diagrams.net `load`.
 * Pass through saved exports (compressed diagram data) and only repair the
 * known-bad legacy starter template.
 */
export function normalizeDrawioLoadXml(raw: string, kind: DrawioFileKind): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return EMPTY_MXFILE_XML;
  }

  if (kind === 'svg') {
    const mxfile = extractMxfileFromDrawioSvg(trimmed);
    if (mxfile && isLegacyCorruptMxfile(mxfile)) {
      return EMPTY_MXFILE_XML;
    }
    // Full xmlsvg export — embed parses content= and decompresses diagram data.
    return trimmed;
  }

  if (kind === 'xml') {
    if (/<mxfile[\s>]/i.test(trimmed) && isLegacyCorruptMxfile(trimmed)) {
      return EMPTY_MXFILE_XML;
    }
    if (/<mxfile[\s>]/i.test(trimmed) || hasEditableGraphModel(trimmed)) {
      return trimmed;
    }
    return EMPTY_MXFILE_XML;
  }

  return trimmed;
}
