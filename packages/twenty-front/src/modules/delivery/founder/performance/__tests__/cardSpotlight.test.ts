import { type PointerEvent } from 'react';
import {
  getDirectoryAccent,
  getDirectoryMonogram,
  handleCardSpotlightLeave,
  handleCardSpotlightMove,
} from '@/delivery/founder/performance/cardSpotlight';

describe('cardSpotlight', () => {
  it('tracks pointer coordinates via CSS variables and clears opacity on leave', () => {
    const element = document.createElement('section');

    jest.spyOn(element, 'getBoundingClientRect').mockReturnValue({
      bottom: 220,
      height: 200,
      left: 50,
      right: 350,
      top: 20,
      width: 300,
      x: 50,
      y: 20,
      toJSON: () => ({}),
    });

    handleCardSpotlightMove({
      clientX: 175.5,
      clientY: 88.25,
      currentTarget: element,
      pointerType: 'mouse',
    } as unknown as PointerEvent<HTMLElement>);

    expect(element.style.getPropertyValue('--spotlight-x')).toBe('125.5px');
    expect(element.style.getPropertyValue('--spotlight-y')).toBe('68.3px');
    expect(element.style.getPropertyValue('--spotlight-opacity')).toBe('1');

    handleCardSpotlightLeave({
      currentTarget: element,
    } as unknown as PointerEvent<HTMLElement>);

    expect(element.style.getPropertyValue('--spotlight-opacity')).toBe('0');
  });

  it('ignores touch pointer moves so mobile cards do not keep stuck hover spots', () => {
    const element = document.createElement('section');

    handleCardSpotlightMove({
      clientX: 100,
      clientY: 100,
      currentTarget: element,
      pointerType: 'touch',
    } as unknown as PointerEvent<HTMLElement>);

    expect(element.style.getPropertyValue('--spotlight-opacity')).toBe('');
  });

  it('derives clean directory monograms and deterministic accents', () => {
    expect(getDirectoryMonogram('Acme Growth Retainer')).toBe('AG');
    expect(getDirectoryMonogram('Otogrow')).toBe('OT');
    expect(getDirectoryMonogram('   ')).toBe('•');

    const first = getDirectoryAccent('project-123');
    const second = getDirectoryAccent('project-123');

    expect(first).toBe(second);
    expect(['iris', 'cyan', 'violet', 'jade', 'amber', 'blue']).toContain(
      first,
    );
  });
});
