import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

// jsdom lacks these browser APIs that react-bootstrap and the app rely on.
beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
  window.scrollTo = vi.fn();
  Element.prototype.scrollBy = Element.prototype.scrollBy || vi.fn();
});

afterEach(() => cleanup());
