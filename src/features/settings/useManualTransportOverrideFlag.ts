import { useEffect, useState } from 'react';
import { isManualTransportOverrideEnabled } from '@/infrastructure/analytics/FeatureFlags';

/** Whether the Network settings section (manual transport override) should be shown at all. */
export function useManualTransportOverrideFlag(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    isManualTransportOverrideEnabled().then((value) => {
      if (!cancelled) setEnabled(value);
    });
    return () => { cancelled = true; };
  }, []);

  return enabled;
}
