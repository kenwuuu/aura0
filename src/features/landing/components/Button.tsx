/**
 * Button — design-system button as an anchor or button element.
 * Variants map to the .mb-btn recipes in landing.css (glow-as-elevation).
 */
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/shared/utils/utils';

type Variant = 'primary' | 'secondary' | 'ghost';

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'mb-btn mb-btn--primary',
  secondary: 'mb-btn mb-btn--secondary',
  ghost: 'mb-btn mb-btn--ghost',
};

type Props = {
  variant?: Variant;
  children: ReactNode;
} & ComponentProps<'a'>;

export function Button({ variant = 'primary', className, children, ...rest }: Props) {
  return (
    <a className={cn(VARIANT_CLASS[variant], className)} {...rest}>
      {children}
    </a>
  );
}
