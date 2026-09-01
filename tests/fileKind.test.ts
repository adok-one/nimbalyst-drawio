/**
 * Deciding what a file IS -- by name, and when the name does not say, by its bytes. This is
 * the gate every entry point runs through (drop, paste, markdown import, the custom editor),
 * so a wrong answer here is not a wrong preview: it is a diagram written with the wrong
 * extension, or a plain image adopted as a diagram and later saved as one.
 */
import { describe, expect, it } from 'vitest';
import {
  getDrawioFileKind,
  isDrawioAssetPath,
  isDrawioPngBytes,
  isDrawioSvgBytes,
  isDrawioSvgText,
  isDrawioUploadFile,
  isDrawioXmlBytes,
  isDrawioXmlText,
  resolvePreservedDrawioFileName,
  sanitizeAssetFileName,
  shouldPreserveDrawioFilename,
  stripDrawioExtension,
} from '../src/drawio/fileKind.js';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function pngBytes(trailer: string): Uint8Array {
  const tail = bytes(trailer);
  const out = new Uint8Array(PNG_SIGNATURE.length + tail.length);
  out.set(PNG_SIGNATURE, 0);
  out.set(tail, PNG_SIGNATURE.length);
  return out;
}

function fileOf(name: string, content: string | Uint8Array, type = ''): File {
  return new File([content as BlobPart], name, { type });
}

describe('getDrawioFileKind', () => {
  it.each([
    ['diagram.drawio.png', 'png'],
    ['diagram.dio.png', 'png'],
    ['diagram.drawio.svg', 'svg'],
    ['diagram.dio.svg', 'svg'],
    ['diagram.drawio', 'xml'],
    ['diagram.dio', 'xml'],
    ['/a/b/DIAGRAM.DRAWIO.SVG', 'svg'],
    ['notes.md', 'xml'],
  ] as const)('%s -> %s', (name, kind) => {
    expect(getDrawioFileKind(name)).toBe(kind);
  });
});

describe('isDrawioAssetPath', () => {
  it.each([
    './assets/a.drawio.svg',
    './assets/a.drawio.png',
    './assets/a.drawio',
    './assets/a.dio',
    './assets/a.drawio.svg?v=17',
    './assets/a.drawio.svg#frag',
  ])('accepts %s', (src) => {
    expect(isDrawioAssetPath(src)).toBe(true);
  });

  it.each(['./assets/a.svg', './assets/a.png', './a.drawio.xml', ''])('rejects %s', (src) => {
    expect(isDrawioAssetPath(src)).toBe(false);
  });

  /**
   * Characterisation, not endorsement: `.dio.svg` is a kind ('svg') but not an asset path,
   * so a `![x](./a.dio.svg)` in markdown stays an ordinary image and never becomes a
   * diagram widget. The markdown transformer's own regexp agrees with this function, so the
   * two are at least consistent with each other; `getDrawioFileKind` is the odd one out.
   */
  it('does not treat .dio.svg / .dio.png as asset paths, though they are kinds', () => {
    expect(getDrawioFileKind('a.dio.svg')).toBe('svg');
    expect(isDrawioAssetPath('a.dio.svg')).toBe(false);
    expect(isDrawioAssetPath('a.dio.png')).toBe(false);
  });
});

describe('sanitizeAssetFileName', () => {
  it('keeps a name that is already safe', () => {
    expect(sanitizeAssetFileName('my diagram (v2)+1.drawio.svg')).toBe('my diagram (v2)+1.drawio.svg');
  });

  it('drops every directory component, so a traversal cannot name the target', () => {
    expect(sanitizeAssetFileName('../../../etc/passwd')).toBe('passwd');
    expect(sanitizeAssetFileName('..\\..\\windows\\system32\\hosts')).toBe('hosts');
  });

  it('collapses illegal characters and strips leading dashes', () => {
    expect(sanitizeAssetFileName('we:*?ird<>|.drawio')).toBe('we-ird-.drawio');
    expect(sanitizeAssetFileName('***.drawio')).toBe('.drawio');
  });

  it('falls back to a name rather than returning nothing', () => {
    expect(sanitizeAssetFileName('***')).toBe('diagram.drawio.svg');
  });
});

describe('stripDrawioExtension', () => {
  it.each([
    ['a.drawio.svg', 'a'],
    ['a.drawio.png', 'a'],
    ['a.drawio', 'a'],
    ['a.dio', 'a'],
    ['a.DRAWIO.SVG', 'a'],
    ['a.svg', 'a.svg'],
  ] as const)('%s -> %s', (name, stem) => {
    expect(stripDrawioExtension(name)).toBe(stem);
  });
});

describe('shouldPreserveDrawioFilename', () => {
  it('keeps the compound extension for draw.io names', () => {
    expect(shouldPreserveDrawioFilename(fileOf('a.drawio.svg', 'x'))).toBe(true);
    expect(shouldPreserveDrawioFilename(fileOf('a.DIO', 'x'))).toBe(true);
  });

  it('does not claim an ordinary image', () => {
    expect(shouldPreserveDrawioFilename(fileOf('photo.png', 'x'))).toBe(false);
  });
});

describe('text sniffing', () => {
  it('recognises the escaped content attribute in both quote styles', () => {
    expect(isDrawioSvgText('<svg content="&lt;mxfile host=..."></svg>')).toBe(true);
    expect(isDrawioSvgText("<svg content='&lt;mxfile host=...'></svg>")).toBe(true);
  });

  it('recognises an SVG carrying an inline mxfile or graph model', () => {
    expect(isDrawioSvgText('<svg><mxfile host="app"></mxfile></svg>')).toBe(true);
    expect(isDrawioSvgText('<svg><mxGraphModel dx="1"></mxGraphModel></svg>')).toBe(true);
  });

  /**
   * The markers are matched as `<mxfile` followed by whitespace or `>`, so that a tag
   * merely starting with those letters is not one. The cost is that a SELF-CLOSING
   * `<mxfile/>` reads as not-a-diagram. draw.io does not write that shape -- an mxfile
   * always has a diagram in it -- but the asymmetry is real, so it is written down here
   * rather than rediscovered.
   */
  it('does not recognise a self-closing marker', () => {
    expect(isDrawioSvgText('<svg><mxfile/></svg>')).toBe(false);
    expect(isDrawioXmlText('<mxGraphModel/>')).toBe(false);
  });

  it('rejects an SVG with no diagram in it', () => {
    expect(isDrawioSvgText('<svg><path d="M0 0"/></svg>')).toBe(false);
  });

  it('treats plain XML as XML and an SVG wrapper as not-XML', () => {
    expect(isDrawioXmlText('<mxfile><diagram/></mxfile>')).toBe(true);
    expect(isDrawioXmlText('<mxGraphModel dx="1"><root/></mxGraphModel>')).toBe(true);
    expect(isDrawioXmlText('<svg><mxfile host="app"></mxfile></svg>')).toBe(false);
  });
});

describe('byte sniffing', () => {
  it('reads UTF-8 bytes the same way as text', () => {
    expect(isDrawioSvgBytes(bytes('<svg content="&lt;mxfile"/>'))).toBe(true);
    expect(isDrawioXmlBytes(bytes('<mxfile host="app"></mxfile>'))).toBe(true);
    expect(isDrawioXmlBytes(bytes('<svg><mxfile host="app"></mxfile></svg>'))).toBe(false);
  });

  /**
   * Only the first 32 kB are sniffed. That is deliberate -- a diagram export can be
   * megabytes -- but it means a file whose only marker sits past the cap reads as "not a
   * diagram". Pinned so the number cannot drift without somebody deciding to move it.
   */
  it('only looks at the first 32 kB', () => {
    const marker = '<mxfile host="app"></mxfile>';
    expect(isDrawioSvgBytes(bytes(`<svg>${' '.repeat(32768)}${marker}</svg>`))).toBe(false);
    expect(isDrawioSvgBytes(bytes(`<svg>${' '.repeat(32000)}${marker}</svg>`))).toBe(true);
  });

  it('needs both the PNG signature and a draw.io marker', () => {
    expect(isDrawioPngBytes(pngBytes('tEXtmxfile<mxGraphModel/>'))).toBe(true);
    expect(isDrawioPngBytes(pngBytes('just an ordinary picture'))).toBe(false);
    expect(isDrawioPngBytes(bytes('mxfile but no PNG signature'))).toBe(false);
  });

  it('does not read past the end of a short buffer', () => {
    expect(isDrawioPngBytes(new Uint8Array([0x89, 0x50]))).toBe(false);
    expect(isDrawioPngBytes(new Uint8Array())).toBe(false);
  });
});

describe('resolvePreservedDrawioFileName', () => {
  it('keeps a name that already carries a draw.io extension', () => {
    expect(resolvePreservedDrawioFileName('a.drawio.svg', bytes('anything'))).toBe('a.drawio.svg');
    expect(resolvePreservedDrawioFileName('a.dio', bytes('anything'))).toBe('a.dio');
  });

  it('renames by content when the name does not say', () => {
    expect(resolvePreservedDrawioFileName('a.svg', bytes('<svg content="&lt;mxfile"/>'))).toBe('a.drawio.svg');
    expect(resolvePreservedDrawioFileName('a.png', pngBytes('mxfile'))).toBe('a.drawio.png');
    expect(resolvePreservedDrawioFileName('a.xml', bytes('<mxfile host="app"></mxfile>'))).toBe('a.drawio');
  });

  it('sanitises before deciding, so a path cannot survive as a name', () => {
    expect(resolvePreservedDrawioFileName('../../x.svg', bytes('<svg content="&lt;mxfile"/>'))).toBe('x.drawio.svg');
  });

  it('leaves a file it does not recognise alone', () => {
    expect(resolvePreservedDrawioFileName('photo.png', bytes('not a png at all'))).toBe('photo.png');
  });
});

describe('isDrawioUploadFile', () => {
  it('accepts anything whose name already says draw.io, without reading it', async () => {
    await expect(isDrawioUploadFile(fileOf('a.drawio.svg', ''))).resolves.toBe(true);
  });

  it('accepts an .svg only when its bytes carry a diagram', async () => {
    await expect(isDrawioUploadFile(fileOf('a.svg', '<svg content="&lt;mxfile"/>'))).resolves.toBe(true);
    await expect(isDrawioUploadFile(fileOf('a.svg', '<svg><path/></svg>'))).resolves.toBe(false);
  });

  it('goes by MIME type when the name has no extension', async () => {
    await expect(
      isDrawioUploadFile(fileOf('clipboard', '<svg content="&lt;mxfile"/>', 'image/svg+xml')),
    ).resolves.toBe(true);
  });

  it('accepts a .png only with the signature and a marker', async () => {
    await expect(isDrawioUploadFile(fileOf('a.png', pngBytes('mxfile')))).resolves.toBe(true);
    await expect(isDrawioUploadFile(fileOf('a.png', pngBytes('holiday photo')))).resolves.toBe(false);
  });

  it('accepts .xml carrying either shape of diagram', async () => {
    await expect(isDrawioUploadFile(fileOf('a.xml', '<mxfile host="app"></mxfile>'))).resolves.toBe(true);
    await expect(isDrawioUploadFile(fileOf('a.xml', '<svg content="&lt;mxfile"/>'))).resolves.toBe(true);
    await expect(isDrawioUploadFile(fileOf('a.xml', '<project/>'))).resolves.toBe(false);
  });

  it('refuses a file it has no reason to open', async () => {
    await expect(isDrawioUploadFile(fileOf('notes.md', '# hello'))).resolves.toBe(false);
  });
});
