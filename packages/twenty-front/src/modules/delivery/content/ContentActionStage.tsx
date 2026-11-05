import { type ReactNode, useLayoutEffect, useRef } from 'react';
import { StyledDeliveryStack } from '@/delivery/deliveryStyles';

export const ContentActionStage = ({
  label,
  children,
  enabled,
}: {
  label: string;
  children: ReactNode;
  enabled: boolean;
}) => {
  // oxlint-disable-next-line twenty/no-state-useref -- Focus must wait until an in-flight private boundary is visible again.
  const target = useRef<HTMLElement | null>(null);
  // oxlint-disable-next-line twenty/no-state-useref -- A completed focus transfer must not repeat on background polling.
  const focused = useRef(false);
  useLayoutEffect(() => {
    const element = target.current;
    if (
      !enabled ||
      focused.current ||
      !element ||
      element.closest('[hidden], [inert], fieldset[disabled]')
    )
      return;
    element.focus();
    if (document.activeElement === element) {
      focused.current = true;
      element.scrollIntoView?.({ block: 'nearest' });
    }
  }, [enabled]);
  return (
    <section ref={target} tabIndex={-1} aria-label={label}>
      <StyledDeliveryStack>{children}</StyledDeliveryStack>
    </section>
  );
};
