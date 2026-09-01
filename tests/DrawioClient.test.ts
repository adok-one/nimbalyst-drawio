/**
 * The embed.diagrams.net JSON protocol, driven from both ends: actions posted into the
 * iframe, events dispatched back as if the canvas had sent them.
 *
 * The origin check is the security boundary of this extension -- the widget listens on
 * `window` for messages, and every page in the app can post there.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawioClient } from '../src/drawio/DrawioClient.js';

const ORIGIN = 'https://embed.diagrams.net';

let container: HTMLDivElement;
let client: DrawioClient;
let posted: string[];

/** Everything the client sends, in order, already parsed. */
function sent(): Array<Record<string, unknown>> {
  return posted.map((payload) => JSON.parse(payload) as Record<string, unknown>);
}

function lastSent(): Record<string, unknown> {
  return sent()[posted.length - 1];
}

function receive(event: Record<string, unknown>, origin = ORIGIN): void {
  window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(event), origin }));
}

/** The canvas announcing itself; nothing works before this. */
function becomeReady(): void {
  receive({ event: 'init' });
}

/** Answer whatever action is still waiting, the way the canvas would. */
function reply(event: Record<string, unknown>): void {
  const actionId = String(lastSent().actionId);
  receive({ ...event, message: { actionId } });
}

function dataUrl(text: string): string {
  return `data:image/svg+xml;base64,${btoa(text)}`;
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  client = new DrawioClient(container);
  posted = [];
  const frame = container.querySelector('iframe')!;
  Object.defineProperty(frame, 'contentWindow', {
    configurable: true,
    value: { postMessage: (payload: string) => posted.push(payload) },
  });
});

afterEach(() => {
  client.destroy();
  document.body.innerHTML = '';
});

describe('the iframe', () => {
  it('points at the embed with the JSON protocol turned on', () => {
    const frame = container.querySelector('iframe')!;
    expect(frame.src.startsWith(`${ORIGIN}/?embed=1`)).toBe(true);
    expect(frame.src).toContain('proto=json');
  });
});

describe('what it refuses to listen to', () => {
  it('ignores a message from any other origin', () => {
    const onReady = vi.fn();
    client.onReady(onReady);

    receive({ event: 'init' }, 'https://evil.example');

    expect(onReady).not.toHaveBeenCalled();
  });

  it('ignores data that is not a string', () => {
    const onReady = vi.fn();
    client.onReady(onReady);

    window.dispatchEvent(new MessageEvent('message', { data: { event: 'init' }, origin: ORIGIN }));

    expect(onReady).not.toHaveBeenCalled();
  });

  it('ignores a string that is not JSON', () => {
    const onReady = vi.fn();
    client.onReady(onReady);

    window.dispatchEvent(new MessageEvent('message', { data: 'not json', origin: ORIGIN }));

    expect(onReady).not.toHaveBeenCalled();
  });
});

describe('handshake', () => {
  it('answers a configure request before anything else happens', () => {
    receive({ event: 'configure' });

    expect(lastSent()).toMatchObject({ action: 'configure' });
    expect((lastSent().config as Record<string, unknown>).defaultFonts).toBeDefined();
  });

  it('tells its ready handlers when the canvas comes up', () => {
    const onReady = vi.fn();
    client.onReady(onReady);

    becomeReady();

    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('calls a handler registered after the fact straight away', () => {
    becomeReady();

    const onReady = vi.fn();
    client.onReady(onReady);

    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('stops calling a handler that unsubscribed', () => {
    const onReady = vi.fn();
    client.onReady(onReady)();

    becomeReady();

    expect(onReady).not.toHaveBeenCalled();
  });
});

describe('loading', () => {
  it('holds a load until the canvas is ready, then sends it', async () => {
    const loading = client.loadXmlLike('<mxfile host="app"></mxfile>');
    expect(posted).toHaveLength(0);

    becomeReady();

    expect(sent()[0]).toMatchObject({ action: 'load', xml: '<mxfile host="app"></mxfile>', autosave: 1 });

    // A load settles only once the canvas answers the export it issues straight after, so
    // the reply is part of the scenario rather than tidying-up.
    reply({ event: 'export', xml: '<mxfile host="app"></mxfile>' });
    await loading;
  });

  /**
   * A load asked for before the canvas is up settles for real, on the promise the caller is
   * holding. Until 2026-09-01 it resolved immediately and was replayed fire-and-forget, so a
   * queued load that failed told nobody.
   */
  it('resolves the caller once the replayed load has actually gone through', async () => {
    const loading = client.loadXmlLike('<mxfile host="app"></mxfile>');
    let settled = false;
    void loading.then(() => { settled = true; });

    becomeReady();
    await Promise.resolve();
    expect(settled).toBe(false);

    reply({ event: 'export', xml: '<mxfile host="app"></mxfile>' });
    await expect(loading).resolves.toBeUndefined();
  });

  it('rejects the caller when the replayed load fails', async () => {
    const loading = client.loadXmlLike('<mxfile host="app"></mxfile>');

    becomeReady();
    reply({ event: 'export' });

    await expect(loading).rejects.toThrow(/failed to read/i);
  });

  it('rejects a queued load if the canvas is torn down before it can happen', async () => {
    const loading = client.loadXmlLike('<mxfile host="app"></mxfile>');

    client.destroy();

    await expect(loading).rejects.toThrow(/closed before the diagram loaded/i);
  });

  /** Not a failure: the content was replaced by something newer, which is what was wanted. */
  it('resolves a queued load that a newer one replaced, and loads the newer one', async () => {
    const first = client.loadXmlLike('<mxfile>first</mxfile>');
    const second = client.loadXmlLike('<mxfile>second</mxfile>');

    await expect(first).resolves.toBeUndefined();

    becomeReady();
    expect(sent()[0]).toMatchObject({ action: 'load', xml: '<mxfile>second</mxfile>' });

    reply({ event: 'export', xml: '<mxfile>second</mxfile>' });
    await second;
  });

  it('encodes a PNG as a data URL, which is what the embed accepts', async () => {
    becomeReady();
    const loading = client.loadPngWithEmbeddedXml(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));

    expect(String(sent()[0].xml).startsWith('data:image/png;base64,')).toBe(true);

    reply({ event: 'export', xml: '<mxfile/>' });
    await loading;
  });
});

describe('reading the diagram back', () => {
  it('asks for the XML and resolves with what comes back', async () => {
    becomeReady();
    const pending = client.getXml();

    expect(lastSent()).toMatchObject({ action: 'export', format: 'xml' });
    reply({ event: 'export', xml: '<mxfile host="app"></mxfile>' });

    await expect(pending).resolves.toBe('<mxfile host="app"></mxfile>');
  });

  it('does not ask twice for XML it already has', async () => {
    becomeReady();
    const first = client.getXml();
    reply({ event: 'export', xml: '<mxfile host="app"></mxfile>' });
    await first;

    const before = posted.length;
    await expect(client.getXml()).resolves.toBe('<mxfile host="app"></mxfile>');
    expect(posted).toHaveLength(before);
  });

  it('refuses an export response with no XML in it', async () => {
    becomeReady();
    const pending = client.getXml();
    reply({ event: 'export' });

    await expect(pending).rejects.toThrow(/failed to read/i);
  });
});

describe('exporting', () => {
  it('asks for xmlsvg and decodes the data URL into bytes', async () => {
    becomeReady();
    const pending = client.exportAsSvgWithEmbeddedXml();

    expect(lastSent()).toMatchObject({ action: 'export', format: 'xmlsvg' });
    reply({ event: 'export', data: dataUrl('<svg/>') });

    expect(new TextDecoder().decode(await pending)).toBe('<svg/>');
  });

  it('asks for xmlpng', async () => {
    becomeReady();
    const pending = client.exportAsPngWithEmbeddedXml();

    expect(lastSent()).toMatchObject({ action: 'export', format: 'xmlpng' });
    reply({ event: 'export', data: dataUrl('PNG') });

    expect(new TextDecoder().decode(await pending)).toBe('PNG');
  });

  it('rejects an export that came back empty rather than writing an empty file', async () => {
    becomeReady();
    const pending = client.exportAsSvgWithEmbeddedXml();
    reply({ event: 'export' });

    await expect(pending).rejects.toThrow(/failed to export/i);
  });

  it('rejects a payload that is not a data URL', async () => {
    becomeReady();
    const pending = client.exportAsSvgWithEmbeddedXml();
    reply({ event: 'export', data: 'no-comma-here' });

    await expect(pending).rejects.toThrow(/invalid data url/i);
  });

  /**
   * Older embed builds answer an export without echoing the actionId. The client then
   * resolves the single outstanding request -- and, when more than one is outstanding,
   * rejects them all rather than handing one request another's picture.
   */
  it('accepts an unlabelled export when exactly one request is waiting', async () => {
    becomeReady();
    const pending = client.exportAsSvgWithEmbeddedXml();

    receive({ event: 'export', data: dataUrl('<svg/>') });

    expect(new TextDecoder().decode(await pending)).toBe('<svg/>');
  });

  it('rejects both when an unlabelled export arrives with two requests waiting', async () => {
    becomeReady();
    const first = client.exportAsSvgWithEmbeddedXml();
    const second = client.exportAsPngWithEmbeddedXml();

    receive({ event: 'export', data: dataUrl('<svg/>') });

    await expect(first).rejects.toBeUndefined();
    await expect(second).rejects.toBeUndefined();
  });
});

describe('change notification', () => {
  it('reports an autosave that actually changed something', () => {
    const onChange = vi.fn();
    client.onChange(onChange);
    becomeReady();

    receive({ event: 'autosave', xml: '<mxfile host="app">v2</mxfile>' });

    expect(onChange).toHaveBeenCalledWith({ oldXml: undefined, newXml: '<mxfile host="app">v2</mxfile>' });
  });

  it('stays quiet when the autosave carries the same XML again', () => {
    const onChange = vi.fn();
    client.onChange(onChange);
    becomeReady();

    receive({ event: 'autosave', xml: '<mxfile>v2</mxfile>' });
    receive({ event: 'autosave', xml: '<mxfile>v2</mxfile>' });

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  /**
   * A merge writes into the canvas, and the canvas autosaves what it was just given. Emitting
   * that as a change would send the caller's own edit back to it -- a save loop.
   */
  it('does not report the autosave a merge causes', async () => {
    const onChange = vi.fn();
    client.onChange(onChange);
    becomeReady();

    const merging = client.mergeXmlLike('<mxfile>incoming</mxfile>');
    receive({ event: 'autosave', xml: '<mxfile>incoming</mxfile>' });
    reply({ event: 'merge' });
    await merging;

    expect(onChange).not.toHaveBeenCalled();
  });

  it('surfaces a merge the canvas refused', async () => {
    becomeReady();
    const merging = client.mergeXmlLike('<mxfile>bad</mxfile>');
    reply({ event: 'merge', error: 'cannot merge' });

    await expect(merging).rejects.toThrow('cannot merge');
  });

  it('treats a save with unchanged XML as a save, and a changed one as a change', () => {
    const onChange = vi.fn();
    const onSave = vi.fn();
    client.onChange(onChange);
    client.onSave(onSave);
    becomeReady();

    receive({ event: 'save', xml: '<mxfile>v1</mxfile>' });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();

    receive({ event: 'save', xml: '<mxfile>v1</mxfile>' });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('stops calling handlers that unsubscribed', () => {
    const onChange = vi.fn();
    const onSave = vi.fn();
    client.onChange(onChange)();
    client.onSave(onSave)();
    becomeReady();

    receive({ event: 'save', xml: '<mxfile>v1</mxfile>' });
    receive({ event: 'save', xml: '<mxfile>v1</mxfile>' });

    expect(onChange).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('destroy', () => {
  it('takes the iframe out of the page', () => {
    client.destroy();
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('stops listening, so a later message cannot reach a dead client', () => {
    const onChange = vi.fn();
    client.onChange(onChange);
    becomeReady();
    client.destroy();

    receive({ event: 'autosave', xml: '<mxfile>after</mxfile>' });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('rejects whatever was still waiting instead of leaving it hanging forever', async () => {
    becomeReady();
    const pending = client.exportAsSvgWithEmbeddedXml();

    client.destroy();

    await expect(pending).rejects.toBeUndefined();
  });
});
