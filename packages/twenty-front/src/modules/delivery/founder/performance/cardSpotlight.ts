import { type PointerEvent } from 'react';

export type DirectoryAccent =
  | 'iris'
  | 'cyan'
  | 'violet'
  | 'jade'
  | 'amber'
  | 'blue';

const DIRECTORY_ACCENTS: readonly DirectoryAccent[] = [
  'iris',
  'cyan',
  'violet',
  'jade',
  'amber',
  'blue',
];

// Mutates CSS variables directly so 60fps pointer tracking never triggers React re-renders.
export const handleCardSpotlightMove = (event: PointerEvent<HTMLElement>) => {
  if (event.pointerType === 'touch') {
    return;
  }

  const target = event.currentTarget;
  const rect = target.getBoundingClientRect();
  const offsetX = event.clientX - rect.left;
  const offsetY = event.clientY - rect.top;

  target.style.setProperty('--spotlight-x', `${offsetX.toFixed(1)}px`);
  target.style.setProperty('--spotlight-y', `${offsetY.toFixed(1)}px`);
  target.style.setProperty('--spotlight-opacity', '1');
};

export const handleCardSpotlightLeave = (event: PointerEvent<HTMLElement>) => {
  event.currentTarget.style.setProperty('--spotlight-opacity', '0');
};

export const getDirectoryMonogram = (label: string): string => {
  const parts = label
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    return '•';
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
};

export const getDirectoryAccent = (seed: string): DirectoryAccent => {
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  return DIRECTORY_ACCENTS[hash % DIRECTORY_ACCENTS.length];
};
