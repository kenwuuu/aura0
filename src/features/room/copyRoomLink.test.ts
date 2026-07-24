import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { copyText, copyRoomLink } from './copyRoomLink';

/** Install a fake `execCommand` on the real document (happy-dom doesn't
 *  implement it) so the insecure-origin fallback can run against real
 *  createElement/appendChild. Returns the spy + a restore fn. */
function stubExecCommand(returns: boolean) {
  const exec = vi.fn().mockReturnValue(returns);
  Object.defineProperty(document, 'execCommand', {
    value: exec,
    configurable: true,
    writable: true,
  });
  return { exec, restore: () => delete (document as unknown as Record<string, unknown>).execCommand };
}

describe('copyText', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the async clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await expect(copyText('hello')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('falls back to execCommand on insecure origins (no clipboard API)', async () => {
    // navigator.clipboard is *undefined* over plain http (secure-context gated).
    vi.stubGlobal('navigator', {});
    const { exec, restore } = stubExecCommand(true);

    await expect(copyText('via-fallback')).resolves.toBe(true);
    expect(exec).toHaveBeenCalledWith('copy');
    restore();
  });
});

describe('copyRoomLink', () => {
  beforeEach(() => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('copies the current URL and reports success', async () => {
    await expect(copyRoomLink()).resolves.toBe(true);
    expect(
      (navigator.clipboard.writeText as ReturnType<typeof vi.fn>),
    ).toHaveBeenCalledWith(window.location.href);
  });

  it('reports failure when the clipboard write is denied', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    // Fallback also fails → overall failure, surfaced to the caller.
    const { restore } = stubExecCommand(false);
    await expect(copyRoomLink()).resolves.toBe(false);
    restore();
  });
});
