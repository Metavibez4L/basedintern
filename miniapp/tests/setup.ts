import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock requestAnimationFrame for particle animation tests
global.requestAnimationFrame = vi.fn((callback: FrameRequestCallback): number => {
  return window.setTimeout(() => callback(Date.now()), 16);
});

global.cancelAnimationFrame = vi.fn((id: number): void => {
  window.clearTimeout(id);
});

// Mock getBoundingClientRect for connection line tests
Element.prototype.getBoundingClientRect = vi.fn((): DOMRect => ({
  width: 100,
  height: 100,
  top: 0,
  left: 0,
  bottom: 100,
  right: 100,
  x: 0,
  y: 0,
  toJSON: () => {},
}));

// Store original methods
const originalAddEventListener = window.addEventListener;
const originalRemoveEventListener = window.removeEventListener;

// Mock window resize events
window.addEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
  if (type === 'resize') {
    (window as any)._resizeHandlers = (window as any)._resizeHandlers || [];
    (window as any)._resizeHandlers.push(listener);
  }
  return originalAddEventListener.call(window, type, listener, options);
});

window.removeEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) => {
  if (type === 'resize' && (window as any)._resizeHandlers) {
    (window as any)._resizeHandlers = (window as any)._resizeHandlers.filter(
      (h: EventListenerOrEventListenerObject) => h !== listener
    );
  }
  return originalRemoveEventListener.call(window, type, listener, options);
});
