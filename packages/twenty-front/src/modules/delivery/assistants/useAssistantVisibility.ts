import { useCallback, useEffect, useState } from 'react';

export const useAssistantVisibility = () => {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [intersecting, setIntersecting] = useState(false);
  const [pageVisible, setPageVisible] = useState(
    () => document.visibilityState === 'visible',
  );
  useEffect(() => {
    const changed = () =>
      setPageVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', changed);
    return () => document.removeEventListener('visibilitychange', changed);
  }, []);
  useEffect(() => {
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) =>
      setIntersecting(entry?.isIntersecting === true),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return {
    attach: useCallback((node: HTMLElement | null) => setElement(node), []),
    visible: pageVisible && intersecting,
  };
};
