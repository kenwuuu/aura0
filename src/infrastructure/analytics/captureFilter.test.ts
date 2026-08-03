import { describe, expect, it } from 'vitest';
import type { CaptureResult } from 'posthog-js';

import { dropUnusedEvents } from './captureFilter';

const captureResult = (event: string): CaptureResult =>
  ({ event, properties: {} }) as unknown as CaptureResult;

describe('dropUnusedEvents', () => {
  it('drops $autocapture', () => {
    expect(dropUnusedEvents(captureResult('$autocapture'))).toBeNull();
  });

  /**
   * The reason this filter exists instead of `autocapture: false`. posthog-js
   * emits `$rageclick` from inside the autocapture handler, so turning
   * autocapture off at the config level takes rageclick with it — and rageclick
   * is read by two insights and the User Research dashboard. If this test ever
   * fails, the User Research dashboard has silently gone to zero.
   */
  it('keeps $rageclick', () => {
    const result = captureResult('$rageclick');
    expect(dropUnusedEvents(result)).toBe(result);
  });

  it.each(['$pageview', 'card_played_to_battlefield', 'deck_import_succeeded', 'connection_outcome'])(
    'keeps %s',
    (event) => {
      const result = captureResult(event);
      expect(dropUnusedEvents(result)).toBe(result);
    },
  );

  it('passes a null result straight through', () => {
    expect(dropUnusedEvents(null)).toBeNull();
  });
});
