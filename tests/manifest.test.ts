/**
 * The manifest is a contract with the host, and nothing in the build checks it: a
 * contribution naming an export that does not exist loads fine and fails at the moment a
 * person uses it. These tests are that check.
 *
 * The templates in `newFileMenu` get the same treatment, because they are the one piece of
 * runnable content shipped inside the manifest -- and v0.4.0 shipped one the draw.io canvas
 * could not open.
 */
import { describe, expect, it } from 'vitest';
import manifest from '../manifest.json' with { type: 'json' };
import pkg from '../package.json' with { type: 'json' };
import { getDrawioFileKind } from '../src/drawio/fileKind.js';
import { extractMxfileFromDrawioSvg } from '../src/drawio/templates.js';
import * as extension from '../src/index.js';
import { clearExtensionContext, getExtensionContext } from '../src/context.js';
import type { ExtensionContext } from '../src/types/extension.js';

const contributions = manifest.contributions;

describe('identity', () => {
  it('keeps manifest.json and package.json on one version', () => {
    expect(manifest.version).toBe(pkg.version);
  });

  it('points at what the build writes', () => {
    expect(manifest.main).toBe('dist/index.js');
    expect(manifest.styles).toBe('dist/index.css');
  });

  it('declares the permissions the extension actually uses', () => {
    // Files, for reading and writing diagrams; network, for the embed.diagrams.net iframe.
    expect(manifest.permissions.filesystem).toBe(true);
    expect(manifest.permissions.network).toBe(true);
  });
});

describe('activation', () => {
  it('stores the context the host passes, and releases it again', async () => {
    const context = { services: {} } as unknown as ExtensionContext;

    await extension.activate(context);
    expect(getExtensionContext()).toBe(context);

    extension.deactivate();
    expect(() => getExtensionContext()).toThrow(/not activated/i);
  });

  it('leaves nothing behind for the next test', () => {
    clearExtensionContext();
    expect(() => getExtensionContext()).toThrow();
  });
});

describe('every contribution names something that exists', () => {
  it('custom editors name an exported component', () => {
    for (const editor of contributions.customEditors) {
      expect(extension.components).toHaveProperty(editor.component);
      expect(typeof (extension.components as Record<string, unknown>)[editor.component]).toBe('function');
    }
  });

  it('lexical extensions name an exported extension', () => {
    for (const name of contributions.lexicalExtensions) {
      expect(extension.lexicalExtensions).toHaveProperty(name);
    }
  });

  it('transformers name an exported transformer', () => {
    for (const name of contributions.transformers) {
      expect(extension.transformers).toHaveProperty(name);
    }
  });

  it('slash commands name an exported handler', () => {
    for (const command of contributions.slashCommands) {
      expect(extension.slashCommandHandlers).toHaveProperty(command.handler);
      expect(
        typeof (extension.slashCommandHandlers as Record<string, unknown>)[command.handler],
      ).toBe('function');
    }
  });
});

describe('the file patterns', () => {
  const FORMATS = ['*.drawio', '*.dio', '*.drawio.svg', '*.drawio.png'];

  it('the custom editor opens every format the extension can read', () => {
    expect(contributions.customEditors[0].filePatterns.sort()).toEqual([...FORMATS].sort());
  });

  it('every one of them has an icon, so none looks like a plain file', () => {
    expect(Object.keys(contributions.fileIcons).sort()).toEqual([...FORMATS].sort());
  });
});

describe('the templates the New File menu hands out', () => {
  it.each(manifest.contributions.newFileMenu)('$extension opens as an editable diagram', (entry) => {
    const kind = getDrawioFileKind(`untitled${entry.extension}`);
    const mxfile = kind === 'svg' ? extractMxfileFromDrawioSvg(entry.defaultContent) : entry.defaultContent;

    expect(mxfile).not.toBeNull();
    expect(mxfile).toContain('<mxfile');
    // An editable model, not a compressed payload: a new file has to open on a canvas the
    // person can draw on, and a deflate payload is exactly what v0.4.0 got wrong.
    expect(mxfile).toContain('<mxGraphModel');
    expect(mxfile).toContain('<mxCell id="0"/>');
  });

  it('offers a template for each extension it claims to create', () => {
    const offered = contributions.newFileMenu.map((entry) => entry.extension);
    expect(offered).toContain('.drawio.svg');
    expect(offered).toContain('.drawio');
  });
});

describe('the marketplace card', () => {
  it('names sample files that the package actually ships', async () => {
    const { requiredPackageFiles } = await import('../scripts/package-contents.mjs');
    const packed = requiredPackageFiles(manifest);

    for (const shot of manifest.marketplace.screenshots) {
      expect(packed).toContain(shot.fileToOpen);
    }
  });

  it('lists the same file types the contributions handle', () => {
    expect(manifest.marketplace.fileTypes.sort()).toEqual(
      ['.drawio', '.dio', '.drawio.svg', '.drawio.png'].sort(),
    );
  });
});
