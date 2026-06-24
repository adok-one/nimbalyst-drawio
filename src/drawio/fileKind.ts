export type DrawioFileKind = 'xml' | 'svg' | 'png';

const DRAWIO_SVG_SUFFIX = '.drawio.svg';
const DRAWIO_PNG_SUFFIX = '.drawio.png';

export function getDrawioFileKind(fileName: string): DrawioFileKind {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.drawio.png') || lower.endsWith('.dio.png')) {
    return 'png';
  }
  if (lower.endsWith('.drawio.svg') || lower.endsWith('.dio.svg')) {
    return 'svg';
  }
  return 'xml';
}

export function isDrawioAssetPath(src: string): boolean {
  const lower = src.toLowerCase().split('?')[0]?.split('#')[0] ?? '';
  return (
    lower.endsWith(DRAWIO_SVG_SUFFIX) ||
    lower.endsWith(DRAWIO_PNG_SUFFIX) ||
    lower.endsWith('.drawio') ||
    lower.endsWith('.dio')
  );
}

/** Keep the compound extension when the user dropped/selected a draw.io asset. */
export function shouldPreserveDrawioFilename(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(DRAWIO_SVG_SUFFIX) ||
    name.endsWith(DRAWIO_PNG_SUFFIX) ||
    name.endsWith('.drawio') ||
    name.endsWith('.dio')
  );
}

export function stripDrawioExtension(fileName: string): string {
  return fileName.replace(/\.(drawio\.(svg|png)|drawio|dio)$/i, '');
}

export function sanitizeAssetFileName(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? fileName;
  return base.replace(/[^\w.\-()+ ]+/g, '-').replace(/^-+/, '') || 'diagram.drawio.svg';
}

export function isDrawioSvgText(text: string): boolean {
  return (
    /content="&lt;mxfile/i.test(text) ||
    /content='&lt;mxfile/i.test(text) ||
    (/<svg[\s>]/i.test(text) &&
      (/<mxfile[\s>]/i.test(text) || /<mxGraphModel[\s>]/i.test(text)))
  );
}

/** Plain draw.io XML (.drawio) — mxfile without SVG wrapper. */
export function isDrawioXmlText(text: string): boolean {
  if (/<svg[\s>]/i.test(text)) {
    return false;
  }
  return /<mxfile[\s>]/i.test(text) || /<mxGraphModel[\s>]/i.test(text);
}

export function isDrawioSvgBytes(bytes: Uint8Array): boolean {
  const sample = bytes.slice(0, Math.min(bytes.length, 32768));
  const text = new TextDecoder('utf-8', { fatal: false }).decode(sample);
  return isDrawioSvgText(text);
}

export function isDrawioXmlBytes(bytes: Uint8Array): boolean {
  const sample = bytes.slice(0, Math.min(bytes.length, 32768));
  const text = new TextDecoder('utf-8', { fatal: false }).decode(sample);
  return isDrawioXmlText(text);
}

/** PNG with draw.io metadata in tEXt/iTXt chunks or as xmlpng payload. */
export function isDrawioPngBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 8) {
    return false;
  }
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const isPng = pngSignature.every((value, index) => bytes[index] === value);
  if (!isPng) {
    return false;
  }
  const sample = bytes.slice(0, Math.min(bytes.length, 65536));
  const text = new TextDecoder('utf-8', { fatal: false }).decode(sample);
  return (
    /<mxfile[\s>]/i.test(text) ||
    /<mxGraphModel[\s>]/i.test(text) ||
    /mxfile/i.test(text)
  );
}

/** Final filename to write into assets/ — keeps compound extension when possible. */
export function resolvePreservedDrawioFileName(originalName: string, bytes: Uint8Array): string {
  const sanitized = sanitizeAssetFileName(originalName);
  const lower = sanitized.toLowerCase();

  if (lower.endsWith('.drawio.svg') || lower.endsWith('.drawio.png') || lower.endsWith('.drawio') || lower.endsWith('.dio')) {
    return sanitized;
  }

  if (isDrawioSvgBytes(bytes)) {
    const stem = sanitized.replace(/\.(svg|png|xml)$/i, '') || 'diagram';
    return `${stem}.drawio.svg`;
  }

  if (isDrawioPngBytes(bytes)) {
    const stem = sanitized.replace(/\.(svg|png|xml)$/i, '') || 'diagram';
    return `${stem}.drawio.png`;
  }

  if (isDrawioXmlBytes(bytes)) {
    const stem = sanitized.replace(/\.(svg|png|xml)$/i, '') || 'diagram';
    return `${stem}.drawio`;
  }

  return sanitized;
}

export async function isDrawioUploadFile(file: File): Promise<boolean> {
  if (shouldPreserveDrawioFilename(file)) {
    return true;
  }

  const lower = file.name.toLowerCase();
  const headBytes = new Uint8Array(
    await file.slice(0, Math.min(file.size, 65536)).arrayBuffer(),
  );

  if (lower.endsWith('.svg') || file.type === 'image/svg+xml') {
    const head = new TextDecoder('utf-8', { fatal: false }).decode(headBytes);
    return isDrawioSvgText(head);
  }

  if (lower.endsWith('.png') || file.type === 'image/png') {
    return isDrawioPngBytes(headBytes);
  }

  if (
    lower.endsWith('.xml') ||
    lower.endsWith('.drawio') ||
    lower.endsWith('.dio') ||
    file.type === 'application/xml' ||
    file.type === 'text/xml' ||
    file.type === 'application/vnd.jgraph.mxfile'
  ) {
    const head = new TextDecoder('utf-8', { fatal: false }).decode(headBytes);
    return isDrawioXmlText(head) || isDrawioSvgText(head);
  }

  return false;
}
