import { type CSSProperties, type ReactNode } from 'react';
import type * as React from 'react';
import { render, screen } from '@testing-library/react';
import { NavigationDrawerAnimatedCollapseWrapper } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerAnimatedCollapseWrapper';

let mockReducedMotion = false;
let mockExpanded = true;
let mockSettingsPage = false;
const mockAnimation = jest.fn();
type MotionProps = {
  children: ReactNode;
  animate: CSSProperties;
  transition: { duration: number };
};

jest.mock('framer-motion', () => ({
  useReducedMotion: () => mockReducedMotion,
  motion: {
    create: () => (props: MotionProps) => {
      mockAnimation(props);
      return (
        <span
          style={props.animate}
          data-transition-duration={props.transition.duration}
        >
          {props.children}
        </span>
      );
    },
  },
}));
jest.mock('twenty-ui/theme-constants', () => {
  const { createContext } = jest.requireActual<typeof React>('react');
  return {
    ThemeContext: createContext({
      theme: { animation: { duration: { normal: 0.3 } } },
    }),
  };
});
jest.mock('@/navigation/hooks/useIsSettingsPage', () => ({
  useIsSettingsPage: () => mockSettingsPage,
}));
jest.mock('@/navigation/hooks/useIsNavigationDrawerContentExpanded', () => ({
  useIsNavigationDrawerContentExpanded: () => mockExpanded,
}));

beforeEach(() => {
  mockReducedMotion = false;
  mockExpanded = true;
  mockSettingsPage = false;
  jest.clearAllMocks();
});

const navigationLabel = (
  <NavigationDrawerAnimatedCollapseWrapper>
    Client work
  </NavigationDrawerAnimatedCollapseWrapper>
);

it('removes animation duration for reduced motion while preserving expanded and collapsed states and the same label', () => {
  mockReducedMotion = true;
  const { rerender } = render(navigationLabel);
  const label = screen.getByText('Client work');
  expect(label).toBeVisible();
  expect(label).toHaveAttribute('data-transition-duration', '0');
  expect(label).toHaveStyle({
    pointerEvents: 'auto',
    width: 'auto',
    height: 'auto',
  });
  mockExpanded = false;
  rerender(
    <NavigationDrawerAnimatedCollapseWrapper>
      Client work
    </NavigationDrawerAnimatedCollapseWrapper>,
  );
  expect(screen.getByText('Client work')).toBe(label);
  expect(label).toHaveAttribute('data-transition-duration', '0');
  expect(label).toHaveStyle({
    opacity: 0,
    width: '0px',
    height: '0px',
    pointerEvents: 'none',
  });
  expect(label).not.toBeVisible();
});

it('keeps the themed duration when motion is allowed and reacts to a changed preference', () => {
  const { rerender } = render(navigationLabel);
  const label = screen.getByText('Client work');
  expect(label).toHaveAttribute('data-transition-duration', '0.3');
  mockReducedMotion = true;
  rerender(
    <NavigationDrawerAnimatedCollapseWrapper>
      Client work
    </NavigationDrawerAnimatedCollapseWrapper>,
  );
  expect(label).toHaveAttribute('data-transition-duration', '0');
  expect(label).toBeVisible();
});

it('keeps settings page labels visible without a motion wrapper', () => {
  mockSettingsPage = true;
  mockExpanded = false;
  mockReducedMotion = true;
  render(navigationLabel);
  expect(screen.getByText('Client work')).toBeVisible();
  expect(mockAnimation).not.toHaveBeenCalled();
});
