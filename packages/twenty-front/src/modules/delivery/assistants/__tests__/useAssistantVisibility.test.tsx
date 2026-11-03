import { act, render, screen } from '@testing-library/react';
import { useAssistantVisibility } from '@/delivery/assistants/useAssistantVisibility';

class VisibilityObserver implements IntersectionObserver {
  static current: VisibilityObserver | null = null;
  readonly root = null;
  readonly rootMargin = '0px';
  readonly thresholds = [0];
  private readonly callback: IntersectionObserverCallback;
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
  takeRecords = () => [];
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    VisibilityObserver.current = this;
  }
  send(target: Element, visible: boolean) {
    const bounds = target.getBoundingClientRect();
    this.callback(
      [
        {
          target,
          isIntersecting: visible,
          intersectionRatio: visible ? 1 : 0,
          boundingClientRect: bounds,
          intersectionRect: bounds,
          rootBounds: null,
          time: 1,
        },
      ],
      this,
    );
  }
}
const Harness = () => {
  const { attach, visible } = useAssistantVisibility();
  return (
    <section ref={attach} aria-label="Run page">
      {visible ? 'Polling permitted' : 'Polling stopped'}
    </section>
  );
};
it('requires viewport intersection and a visible browser document, then disconnects on unmount', () => {
  const original = globalThis.IntersectionObserver;
  Object.assign(globalThis, { IntersectionObserver: VisibilityObserver });
  const visibility = jest
    .spyOn(document, 'visibilityState', 'get')
    .mockReturnValue('visible');
  const { unmount } = render(<Harness />);
  const target = screen.getByRole('region', { name: 'Run page' });
  expect(screen.getByText('Polling stopped')).toBeInTheDocument();
  act(() => VisibilityObserver.current?.send(target, true));
  expect(screen.getByText('Polling permitted')).toBeInTheDocument();
  visibility.mockReturnValue('hidden');
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(screen.getByText('Polling stopped')).toBeInTheDocument();
  visibility.mockReturnValue('visible');
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(screen.getByText('Polling permitted')).toBeInTheDocument();
  act(() => VisibilityObserver.current?.send(target, false));
  expect(screen.getByText('Polling stopped')).toBeInTheDocument();
  const observer = VisibilityObserver.current;
  unmount();
  expect(observer?.disconnect).toHaveBeenCalledTimes(1);
  visibility.mockRestore();
  Object.assign(globalThis, { IntersectionObserver: original });
});
