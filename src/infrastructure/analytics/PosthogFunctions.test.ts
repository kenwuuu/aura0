import { describe, it, expect, vi, beforeEach } from 'vitest';
import posthog from 'posthog-js';
import { trackImportFailed } from './PosthogFunctions';

vi.mock('posthog-js', () => ({
  default: { capture: vi.fn() },
}));

const capture = vi.mocked(posthog.capture);

describe('trackImportFailed', () => {
  beforeEach(() => {
    capture.mockClear();
  });

  it('captures the raw pasted decklist so a real failure can be replayed as a fixture', () => {
    const rawText = '4 Lightning Bolt\n1 Drill Too Deep';

    trackImportFailed('parse_error', rawText, { message: 'Unexpected token' });

    expect(capture).toHaveBeenCalledWith(
      'deck_import_failed',
      expect.objectContaining({
        reason: 'parse_error',
        raw_text: rawText,
        raw_text_truncated: false,
        text_length: rawText.length,
        message: 'Unexpected token',
      }),
    );
  });

  it('truncates a pathologically large paste and flags that it was cut', () => {
    const rawText = 'x'.repeat(25_000);

    trackImportFailed('invalid_format', rawText);

    const props = capture.mock.calls[0][1] as Record<string, unknown>;
    expect((props.raw_text as string).length).toBe(20_000);
    expect(props.raw_text_truncated).toBe(true);
    expect(props.text_length).toBe(25_000);
  });
});
