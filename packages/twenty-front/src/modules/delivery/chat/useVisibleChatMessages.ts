import { useEffect, type RefObject } from 'react';

export const useVisibleChatMessages = (
  container: RefObject<HTMLDivElement | null>,
  messageKey: string,
  enabled: boolean,
  onViewed: (ids: string[]) => Promise<boolean>,
) => {
  useEffect(() => {
    const element = container.current;
    if (!enabled || !element) return;
    const visible = new Set<string>();
    const completed = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending = false;
    let disposed = false;
    let failed = false;
    const focused = () =>
      document.visibilityState === 'visible' && document.hasFocus();
    const schedule = () => {
      clearTimeout(timer);
      if (disposed || pending || failed || !focused()) return;
      timer = setTimeout(async () => {
        if (disposed || !focused()) return;
        const ids = [...visible]
          .filter((id) => !completed.has(id))
          .slice(0, 50);
        if (!ids.length) return;
        pending = true;
        const success = await onViewed(ids);
        pending = false;
        if (success) ids.forEach((id) => completed.add(id));
        else failed = true;
        if (!disposed) schedule();
      }, 350);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.unreadMessage;
          if (!id) continue;
          if (
            entry.isIntersecting &&
            entry.intersectionRect.height >=
              Math.min(80, entry.boundingClientRect.height)
          )
            visible.add(id);
          else visible.delete(id);
        }
        schedule();
      },
      { root: null, threshold: [0, 0.1, 0.5, 1] },
    );
    element
      .querySelectorAll('[data-unread-message]')
      .forEach((message) => observer.observe(message));
    window.addEventListener('focus', schedule);
    window.addEventListener('blur', schedule);
    document.addEventListener('visibilitychange', schedule);
    return () => {
      disposed = true;
      clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener('focus', schedule);
      window.removeEventListener('blur', schedule);
      document.removeEventListener('visibilitychange', schedule);
    };
  }, [container, messageKey, enabled, onViewed]);
};
