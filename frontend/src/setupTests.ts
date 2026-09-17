import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement these, but Radix UI's popper/menu components call them
// internally (pointer capture during open/close, scroll-into-view on keyboard
// navigation). Without these no-op polyfills, Radix's menu interactions can
// silently misfire in tests (e.g. a menu item's onSelect never firing after a
// userEvent click), causing flaky timeouts unrelated to the app code under test.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// jsdom has no PointerEvent implementation at all (window.PointerEvent is
// undefined) — a long-standing jsdom gap. Radix UI's trigger/dismissable-layer
// components branch on pointer event properties (e.g. pointerType), and
// without a real PointerEvent constructor those code paths misbehave in ways
// that can tear down the whole rendered tree during a click. This minimal
// polyfill (MouseEvent already carries clientX/clientY/button, which is all
// Radix's handlers read) is the standard fix used across the Radix ecosystem
// for jsdom-based test environments.
if (typeof window.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    public pointerId: number;
    public pointerType: string;
    public isPrimary: boolean;

    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.pointerType = params.pointerType ?? "mouse";
      this.isPrimary = params.isPrimary ?? true;
    }
  }
  // @ts-expect-error -- polyfilling a constructor jsdom doesn't provide
  window.PointerEvent = PointerEventPolyfill;
}

// jsdom implements neither ResizeObserver nor IntersectionObserver. Radix's
// Popper-based positioning (used by DropdownMenu/Popover/Select content) reads
// element measurements via these APIs in a layout effect; a bare
// `ReferenceError` there, with no error boundary in the app, makes React 18
// unmount the whole render tree — which is what actually caused the
// mysterious "body goes empty after one click" failures this polyfill fixes,
// not a query-timing issue.
if (typeof window.ResizeObserver === "undefined") {
  window.ResizeObserver = class ResizeObserverPolyfill {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
if (typeof window.IntersectionObserver === "undefined") {
  // @ts-expect-error -- minimal polyfill, only the methods Radix calls
  window.IntersectionObserver = class IntersectionObserverPolyfill {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  };
}
