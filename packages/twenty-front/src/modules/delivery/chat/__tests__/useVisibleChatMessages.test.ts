import { act, renderHook } from '@testing-library/react';
import { useVisibleChatMessages } from '@/delivery/chat/useVisibleChatMessages';

let observerCallback: IntersectionObserverCallback;
const disconnect = jest.fn();
const observe = jest.fn();
const onViewed = jest.fn<Promise<boolean>, [string[]]>();
let container: { current: HTMLDivElement };
const intersection = (id: string, visible: boolean, height = 100) => {
  const target = container.current.querySelector(
    `[data-unread-message="${id}"]`,
  )!;
  const entry = {
    target,
    isIntersecting: visible,
    intersectionRect: { height },
    boundingClientRect: { height: 100 },
  } as IntersectionObserverEntry;
  act(() => observerCallback([entry], {} as IntersectionObserver));
};
const advance = async () =>
  act(async () => {
    jest.advanceTimersByTime(400);
    await Promise.resolve();
  });
beforeEach(() => {
  jest.useFakeTimers();
  onViewed.mockReset().mockResolvedValue(true);
  observe.mockReset();
  disconnect.mockReset();
  jest.spyOn(document, 'hasFocus').mockReturnValue(true);
  jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  Object.defineProperty(window, 'IntersectionObserver', {
    configurable: true,
    value: jest.fn(
      (
        callback: IntersectionObserverCallback,
        options: IntersectionObserverInit,
      ) => {
        observerCallback = callback;
        expect(options.root).toBeNull();
        return { observe, disconnect, unobserve: jest.fn() };
      },
    ),
  });
  container = { current: document.createElement('div') };
  container.current.innerHTML =
    '<article data-unread-message="visible">Visible message</article><article data-unread-message="hidden">Off-screen message</article><article>Outgoing message</article>';
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});
it('does not mark messages when merely mounting and batches only visibly read inbound messages', async () => {
  renderHook(() => useVisibleChatMessages(container, 'page', true, onViewed));
  await advance();
  expect(onViewed).not.toHaveBeenCalled();
  expect(observe).toHaveBeenCalledTimes(2);
  intersection('visible', true);
  intersection('hidden', false);
  await advance();
  expect(onViewed).toHaveBeenCalledWith(['visible']);
  intersection('visible', true);
  await advance();
  expect(onViewed).toHaveBeenCalledTimes(1);
});
it('does not count a background or unfocused window as viewed', async () => {
  const focused = jest.spyOn(document, 'hasFocus').mockReturnValue(false);
  renderHook(() => useVisibleChatMessages(container, 'page', true, onViewed));
  intersection('visible', true);
  await advance();
  expect(onViewed).not.toHaveBeenCalled();
  focused.mockReturnValue(true);
  act(() => window.dispatchEvent(new Event('focus')));
  await advance();
  expect(onViewed).toHaveBeenCalledWith(['visible']);
});
it('cancels a pending read when the message leaves view or the tab is hidden', async () => {
  const visibility = jest.spyOn(document, 'visibilityState', 'get');
  renderHook(() => useVisibleChatMessages(container, 'page', true, onViewed));
  intersection('visible', true);
  intersection('visible', false);
  await advance();
  expect(onViewed).not.toHaveBeenCalled();
  intersection('visible', true);
  visibility.mockReturnValue('hidden');
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  await advance();
  expect(onViewed).not.toHaveBeenCalled();
});
it('stops on failed receipt updates and clears observers and pending reads on unmount', async () => {
  onViewed.mockResolvedValue(false);
  const rendered = renderHook(() =>
    useVisibleChatMessages(container, 'page', true, onViewed),
  );
  intersection('visible', true);
  await advance();
  intersection('hidden', true);
  await advance();
  expect(onViewed).toHaveBeenCalledTimes(1);
  rendered.unmount();
  expect(disconnect).toHaveBeenCalled();
  await advance();
  expect(onViewed).toHaveBeenCalledTimes(1);
});
it('never observes messages while access is unavailable', () => {
  renderHook(() => useVisibleChatMessages(container, 'page', false, onViewed));
  expect(observe).not.toHaveBeenCalled();
});
