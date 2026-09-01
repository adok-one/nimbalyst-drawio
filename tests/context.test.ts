/**
 * Every service the extension uses hangs off this one module-level slot, and the message it
 * throws when the slot is empty is the one a person sees if activation failed.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { clearExtensionContext, getExtensionContext, setExtensionContext } from '../src/context.js';
import type { ExtensionContext } from '../src/types/extension.js';

const stub = { services: {} } as unknown as ExtensionContext;

afterEach(clearExtensionContext);

describe('extension context', () => {
  it('hands back what activation stored', () => {
    setExtensionContext(stub);
    expect(getExtensionContext()).toBe(stub);
  });

  it('says the extension is not activated rather than returning undefined', () => {
    expect(() => getExtensionContext()).toThrow(/not activated/i);
  });

  it('deactivation really releases it', () => {
    setExtensionContext(stub);
    clearExtensionContext();
    expect(() => getExtensionContext()).toThrow(/not activated/i);
  });
});
