import { useEffect, useState } from 'react';
import { isFoilCosmeticEnabled } from '@/infrastructure/analytics/FeatureFlags';

/** Whether the Cosmetics settings section (the foil store) should be shown at all. */
export function useFoilCosmeticFlag(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    isFoilCosmeticEnabled().then((value) => {
      if (!cancelled) setEnabled(value);
    });
    return () => { cancelled = true; };
  }, []);

  return enabled;
}
