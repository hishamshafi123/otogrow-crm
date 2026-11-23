// Shift and Option can produce text; neither makes typing an application command.
export const shouldIgnoreTypingShortcut = (event: KeyboardEvent) =>
  event.isComposing ||
  event.keyCode === 229 ||
  (event.key.length === 1 &&
    event.key !== ' ' &&
    !event.metaKey &&
    !event.ctrlKey);
