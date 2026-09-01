/**
 * The `.drawio.svg` format: an SVG whose root element carries the whole mxfile in an
 * HTML-escaped `content=` attribute. Everything here is about that attribute surviving a
 * round trip, because when it does not, nothing reports it: the file still parses as SVG,
 * the widget still renders the picture, and only the draw.io canvas -- later, on somebody
 * else's machine -- finds the diagram unreadable.
 */
import { describe, expect, it } from 'vitest';
import {
  EMPTY_MXFILE_XML,
  buildEmptyDrawioSvg,
  extractMxfileFromDrawioSvg,
  normalizeDrawioLoadXml,
} from '../src/drawio/templates.js';

/** v0.4.0-0.4.2 shipped this: a diagram whose deflate payload throws a zlib error on load. */
const LEGACY_CORRUPT_MXFILE =
  '<mxfile host="app.diagrams.net"><diagram id="diagram-1" name="Page-1">dWlkZWlk=</diagram></mxfile>';

function svgWithContent(mxfile: string): string {
  const escaped = mxfile
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return `<svg xmlns="http://www.w3.org/2000/svg" content="${escaped}"><defs/><g/></svg>`;
}

describe('EMPTY_MXFILE_XML', () => {
  it('is uncompressed -- embed.diagrams.net refuses to open a deflate payload it cannot inflate', () => {
    expect(EMPTY_MXFILE_XML).toContain('<mxGraphModel');
    expect(EMPTY_MXFILE_XML).toContain('<mxCell id="0"/>');
  });

  it('is not itself mistaken for the corrupt legacy template', () => {
    expect(normalizeDrawioLoadXml(EMPTY_MXFILE_XML, 'xml')).toBe(EMPTY_MXFILE_XML);
  });
});

describe('buildEmptyDrawioSvg / extractMxfileFromDrawioSvg', () => {
  it('round-trips the starter template through the content attribute', () => {
    expect(extractMxfileFromDrawioSvg(buildEmptyDrawioSvg())).toBe(EMPTY_MXFILE_XML);
  });

  it('produces an attribute with no raw < or " left to close it early', () => {
    const svg = buildEmptyDrawioSvg();
    const attribute = /\bcontent="([^"]*)"/.exec(svg)?.[1] ?? '';
    expect(attribute).not.toContain('<');
    expect(attribute).not.toContain('>');
    expect(attribute.length).toBeGreaterThan(100);
  });

  /**
   * The load-bearing test of this file. `extractMxfileFromDrawioSvg` unescapes `&amp;`
   * LAST, and that is the only order that works: unescape it first and the `&amp;` in an
   * already-escaped `&amp;lt;` becomes a bare `&`, the next pass turns `&lt;` into `<`,
   * and a label containing the text "&lt;" silently becomes a tag. A build catches none
   * of that -- the file is still valid SVG either way.
   */
  it('unescapes &amp; last, so a label that was already escaped inside the XML survives', () => {
    // What draw.io actually writes for a shape labelled `<b>x</b> & "y"`: the label is
    // escaped once inside the mxfile, and the mxfile is escaped again into content=.
    // Unescape &amp; first and this line's `&lt;` becomes a real `<` -- a tag, in a label.
    const mxfile =
      '<mxfile><diagram><mxGraphModel><root>' +
      '<mxCell value="&lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;"/>' +
      '</root></mxGraphModel></diagram></mxfile>';

    expect(extractMxfileFromDrawioSvg(svgWithContent(mxfile))).toBe(mxfile);
  });

  it('prefers an inline <mxfile> body over the content attribute', () => {
    const svg =
      '<svg content="&lt;mxfile&gt;&lt;/mxfile&gt;">' +
      '<mxfile id="inline"><diagram/></mxfile></svg>';

    expect(extractMxfileFromDrawioSvg(svg)).toBe('<mxfile id="inline"><diagram/></mxfile>');
  });

  it('takes the LAST closing tag when a diagram embeds another mxfile', () => {
    const svg = '<svg><mxfile a><mxfile b></mxfile></mxfile></svg>';
    expect(extractMxfileFromDrawioSvg(svg)).toBe('<mxfile a><mxfile b></mxfile></mxfile>');
  });

  it('returns null for an SVG that carries no diagram at all', () => {
    expect(extractMxfileFromDrawioSvg('<svg><defs/><g/></svg>')).toBeNull();
  });

  it('returns null for an empty content attribute rather than an empty mxfile', () => {
    expect(extractMxfileFromDrawioSvg('<svg content=""><g/></svg>')).toBeNull();
  });
});

describe('normalizeDrawioLoadXml', () => {
  it.each(['xml', 'svg', 'png'] as const)('falls back to the starter template on empty %s', (kind) => {
    expect(normalizeDrawioLoadXml('   \n  ', kind)).toBe(EMPTY_MXFILE_XML);
  });

  /**
   * A saved .drawio.svg goes to the embed WHOLE, not as the mxfile pulled out of it: the
   * diagram data inside a real export is deflate-compressed, and `content=` is what the
   * embed knows how to decompress. Handing it the extracted inner XML loads a blank canvas.
   */
  it('passes a saved SVG export through untouched', () => {
    const saved = '<svg content="&lt;mxfile&gt;compressed-payload&lt;/mxfile&gt;"><g/></svg>';
    expect(normalizeDrawioLoadXml(`  ${saved}  `, 'svg')).toBe(saved);
  });

  it('replaces the corrupt legacy starter SVG instead of loading it', () => {
    expect(normalizeDrawioLoadXml(svgWithContent(LEGACY_CORRUPT_MXFILE), 'svg')).toBe(EMPTY_MXFILE_XML);
  });

  it('replaces the corrupt legacy template in plain XML too', () => {
    expect(normalizeDrawioLoadXml(LEGACY_CORRUPT_MXFILE, 'xml')).toBe(EMPTY_MXFILE_XML);
  });

  /**
   * The legacy check only fires on a diagram with no editable model. A real drawing whose
   * compressed payload happens to start with those bytes must not be thrown away -- which
   * is what `hasEditableGraphModel` is guarding, and what nothing else would catch.
   */
  it('keeps a diagram that has a graph model, whatever its payload looks like', () => {
    const real =
      '<mxfile><diagram id="d">dWlkZWlk=</diagram>' +
      '<diagram id="e"><mxGraphModel><root/></mxGraphModel></diagram></mxfile>';
    expect(normalizeDrawioLoadXml(real, 'xml')).toBe(real);
  });

  it('passes plain mxfile XML through', () => {
    const xml = '<mxfile host="test"><diagram id="1"><mxGraphModel/></diagram></mxfile>';
    expect(normalizeDrawioLoadXml(xml, 'xml')).toBe(xml);
  });

  it('passes a bare mxGraphModel through -- draw.io writes those too', () => {
    const xml = '<mxGraphModel dx="1"><root><mxCell id="0"/></root></mxGraphModel>';
    expect(normalizeDrawioLoadXml(xml, 'xml')).toBe(xml);
  });

  it('replaces XML that is neither', () => {
    expect(normalizeDrawioLoadXml('<html><body>not a diagram</body></html>', 'xml')).toBe(EMPTY_MXFILE_XML);
  });

  it('leaves png payloads alone -- they reach the embed as a data URL', () => {
    expect(normalizeDrawioLoadXml('data:image/png;base64,AAAA', 'png')).toBe('data:image/png;base64,AAAA');
  });
});
