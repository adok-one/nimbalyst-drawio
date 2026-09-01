/**
 * Reading and writing the three formats. The split that matters: a `.drawio.png` carries its
 * diagram in binary chunks and has to travel as base64 over a dedicated IPC channel, while
 * `.drawio.svg` and `.drawio` are text and go through the ordinary save path. Send a PNG
 * down the text path and the file is written as mojibake -- still a file, no error anywhere,
 * and the diagram inside it is gone.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearExtensionContext, setExtensionContext } from '../src/context.js';
import type { DrawioClient } from '../src/drawio/DrawioClient.js';
import { EMPTY_MXFILE_XML } from '../src/drawio/templates.js';
import {
  applyDrawioContentToClient,
  readDrawioFile,
  saveDrawioFile,
  writeDrawioBytes,
} from '../src/utils/drawioFileIO.js';
import type { ExtensionContext } from '../src/types/extension.js';

type ElectronStub = {
  readFileContent?: ReturnType<typeof vi.fn>;
  saveFile?: ReturnType<typeof vi.fn>;
  invoke?: ReturnType<typeof vi.fn>;
};

function useElectron(stub: ElectronStub): ElectronStub {
  (window as unknown as { electronAPI?: ElectronStub }).electronAPI = stub;
  return stub;
}

function useFilesystem() {
  const filesystem = {
    readFile: vi.fn(async () => 'from-filesystem'),
    writeFile: vi.fn(async () => undefined),
    fileExists: vi.fn(async () => false),
  };
  setExtensionContext({ services: { filesystem } } as unknown as ExtensionContext);
  return filesystem;
}

/** Reads a method of the fake back as the spy it is. */
function spyOn(client: FakeClient, method: string): ReturnType<typeof vi.fn> {
  return client[method];
}

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function base64(text: string): string {
  return btoa(String.fromCharCode(...bytes(text)));
}

type FakeClient = DrawioClient & Record<string, ReturnType<typeof vi.fn>>;

/** A stand-in for the canvas: only the four methods the IO layer calls, all of them spies. */
function fakeClient(overrides: Partial<Record<keyof DrawioClient, unknown>> = {}): FakeClient {
  return {
    getXml: vi.fn(async () => '<mxfile host="app"><diagram/></mxfile>'),
    exportAsSvgWithEmbeddedXml: vi.fn(async () => bytes('<svg content="&lt;mxfile"/>')),
    exportAsPngWithEmbeddedXml: vi.fn(async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xff])),
    loadXmlLike: vi.fn(async () => undefined),
    loadPngWithEmbeddedXml: vi.fn(async () => undefined),
    ...overrides,
  } as unknown as FakeClient;
}

afterEach(() => {
  delete (window as unknown as { electronAPI?: ElectronStub }).electronAPI;
  clearExtensionContext();
});

describe('readDrawioFile', () => {
  it('asks for binary only when the path says PNG', async () => {
    const api = useElectron({ readFileContent: vi.fn(async () => ({ content: 'x' })) });

    await readDrawioFile('/ws/a.drawio.svg');
    expect(api.readFileContent).toHaveBeenCalledWith('/ws/a.drawio.svg', { binary: false });

    await readDrawioFile('/ws/a.drawio.png');
    expect(api.readFileContent).toHaveBeenLastCalledWith('/ws/a.drawio.png', { binary: true });
  });

  it('decodes a binary PNG read into bytes', async () => {
    useElectron({
      readFileContent: vi.fn(async () => ({ content: base64('PNGDATA'), isBinary: true })),
    });

    const result = await readDrawioFile('/ws/a.drawio.png');

    expect(result.kind).toBe('png');
    expect(result.content).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(result.content as Uint8Array)).toBe('PNGDATA');
  });

  it('leaves a PNG that came back as text alone rather than decoding it twice', async () => {
    useElectron({ readFileContent: vi.fn(async () => ({ content: 'already-text' })) });

    const result = await readDrawioFile('/ws/a.drawio.png');
    expect(result.content).toBe('already-text');
  });

  it('returns SVG and XML as text', async () => {
    useElectron({ readFileContent: vi.fn(async () => ({ content: '<svg/>' })) });

    await expect(readDrawioFile('/ws/a.drawio.svg')).resolves.toEqual({ kind: 'svg', content: '<svg/>' });
    await expect(readDrawioFile('/ws/a.drawio')).resolves.toEqual({ kind: 'xml', content: '<svg/>' });
  });

  it('falls back to the extension filesystem when there is no electron API', async () => {
    const filesystem = useFilesystem();

    await expect(readDrawioFile('/ws/a.drawio')).resolves.toEqual({
      kind: 'xml',
      content: 'from-filesystem',
    });
    expect(filesystem.readFile).toHaveBeenCalledWith('/ws/a.drawio');
  });
});

describe('writeDrawioBytes', () => {
  it('sends a PNG down the binary channel, base64-encoded', async () => {
    const api = useElectron({ invoke: vi.fn(async () => undefined), saveFile: vi.fn() });

    await writeDrawioBytes('/ws/a.drawio.png', bytes('PNGDATA'));

    expect(api.invoke).toHaveBeenCalledWith('extensions:write-binary', '/ws/a.drawio.png', base64('PNGDATA'));
    expect(api.saveFile).not.toHaveBeenCalled();
  });

  it('survives bytes no text encoder would round-trip', async () => {
    const api = useElectron({ invoke: vi.fn(async () => undefined) });
    const raw = new Uint8Array([0x89, 0x50, 0x00, 0xff, 0xfe, 0x80]);

    await writeDrawioBytes('/ws/a.drawio.png', raw);

    const encoded = api.invoke!.mock.calls[0][2] as string;
    expect(Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))).toEqual(raw);
  });

  it('sends SVG and XML down the text channel', async () => {
    const api = useElectron({ saveFile: vi.fn(async () => undefined), invoke: vi.fn() });

    await writeDrawioBytes('/ws/a.drawio.svg', bytes('<svg/>'));
    expect(api.saveFile).toHaveBeenCalledWith('<svg/>', '/ws/a.drawio.svg');

    await writeDrawioBytes('/ws/a.drawio', bytes('<mxfile/>'));
    expect(api.saveFile).toHaveBeenLastCalledWith('<mxfile/>', '/ws/a.drawio');
    expect(api.invoke).not.toHaveBeenCalled();
  });

  it('takes an explicit kind over the one the extension implies', async () => {
    const api = useElectron({ invoke: vi.fn(async () => undefined), saveFile: vi.fn() });

    await writeDrawioBytes('/ws/mislabelled.svg', bytes('PNG'), 'png');

    expect(api.invoke).toHaveBeenCalled();
    expect(api.saveFile).not.toHaveBeenCalled();
  });

  it('falls back to the extension filesystem for text', async () => {
    const filesystem = useFilesystem();

    await writeDrawioBytes('/ws/a.drawio.svg', bytes('<svg/>'));

    expect(filesystem.writeFile).toHaveBeenCalledWith('/ws/a.drawio.svg', '<svg/>');
  });

  /**
   * There is no fallback for binary: the extension filesystem service writes text. Failing
   * loudly is the point -- the alternative is a PNG written as UTF-8 and a diagram lost.
   */
  it('refuses to write a PNG when the binary channel is missing', async () => {
    useFilesystem();

    await expect(writeDrawioBytes('/ws/a.drawio.png', bytes('PNG'))).rejects.toThrow(
      /binary write is not available/i,
    );
  });
});

describe('saveDrawioFile', () => {
  it('exports xmlpng and writes it as binary', async () => {
    const api = useElectron({ invoke: vi.fn(async () => undefined) });
    const client = fakeClient();

    await saveDrawioFile('/ws/a.drawio.png', 'png', client);

    expect(client.exportAsPngWithEmbeddedXml).toHaveBeenCalled();
    expect(api.invoke).toHaveBeenCalledWith('extensions:write-binary', '/ws/a.drawio.png', expect.any(String));
  });

  it('exports xmlsvg and writes it as text', async () => {
    const api = useElectron({ saveFile: vi.fn(async () => undefined) });
    const client = fakeClient();

    await saveDrawioFile('/ws/a.drawio.svg', 'svg', client);

    expect(client.exportAsSvgWithEmbeddedXml).toHaveBeenCalled();
    expect(api.saveFile).toHaveBeenCalledWith('<svg content="&lt;mxfile"/>', '/ws/a.drawio.svg');
  });

  it('writes plain XML straight from the canvas', async () => {
    const api = useElectron({ saveFile: vi.fn(async () => undefined) });
    const client = fakeClient();

    await saveDrawioFile('/ws/a.drawio', 'xml', client);

    expect(client.getXml).toHaveBeenCalled();
    expect(client.exportAsSvgWithEmbeddedXml).not.toHaveBeenCalled();
    expect(api.saveFile).toHaveBeenCalledWith('<mxfile host="app"><diagram/></mxfile>', '/ws/a.drawio');
  });

  it('lets an export failure surface instead of writing an empty file', async () => {
    const api = useElectron({ saveFile: vi.fn(async () => undefined) });
    const client = fakeClient({
      exportAsSvgWithEmbeddedXml: vi.fn(async () => {
        throw new Error('Failed to export draw.io SVG');
      }),
    });

    await expect(saveDrawioFile('/ws/a.drawio.svg', 'svg', client)).rejects.toThrow(/export/i);
    expect(api.saveFile).not.toHaveBeenCalled();
  });
});

describe('applyDrawioContentToClient', () => {
  it('decodes a base64 PNG before handing it over', async () => {
    const client = fakeClient();

    await applyDrawioContentToClient(client, base64('PNGDATA'), 'png');

    const passed = spyOn(client, 'loadPngWithEmbeddedXml').mock.calls[0][0] as Uint8Array;
    expect(new TextDecoder().decode(passed)).toBe('PNGDATA');
  });

  it('passes PNG bytes straight through', async () => {
    const client = fakeClient();
    const raw = new Uint8Array([0x89, 0x50]);

    await applyDrawioContentToClient(client, raw, 'png');

    expect(client.loadPngWithEmbeddedXml).toHaveBeenCalledWith(raw);
  });

  it('normalises XML on the way in, so a blank file opens as a blank canvas', async () => {
    const client = fakeClient();

    await applyDrawioContentToClient(client, '   ', 'xml');

    expect(client.loadXmlLike).toHaveBeenCalledWith(EMPTY_MXFILE_XML);
  });

  it('hands a saved SVG over whole -- the embed decompresses content= itself', async () => {
    const client = fakeClient();
    const saved = '<svg content="&lt;mxfile&gt;payload&lt;/mxfile&gt;"/>';

    await applyDrawioContentToClient(client, bytes(saved), 'svg');

    expect(client.loadXmlLike).toHaveBeenCalledWith(saved);
  });
});
