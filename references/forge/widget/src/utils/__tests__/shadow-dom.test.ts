import { describe, it, expect, beforeEach } from 'vitest';
import { createShadowContainer, injectStyles } from '../shadow-dom';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('Shadow DOM Utility', () => {
  it('createShadowRoot returns host with shadowRoot', () => {
    const { host, shadow } = createShadowContainer('test-host');
    expect(host).toBeDefined();
    expect(shadow).toBeDefined();
    expect(host.shadowRoot).toBe(shadow);
  });

  it('mode is open', () => {
    const { shadow } = createShadowContainer('test-host');
    expect(shadow.mode).toBe('open');
  });

  it('styles injected into shadow root', () => {
    const { shadow } = createShadowContainer('test-host');
    injectStyles(shadow, '.test { color: red; }');
    const style = shadow.querySelector('style');
    expect(style).not.toBeNull();
    expect(style!.textContent).toContain('.test');
  });

  it('container exists inside shadow root', () => {
    const { shadow, container } = createShadowContainer('test-host');
    expect(shadow.getElementById('forge-widget-root')).toBe(container);
  });

  it('styles injected into shadow root do not affect elements outside', () => {
    const { shadow } = createShadowContainer('test-host');
    injectStyles(shadow, '.test-isolation { color: red; font-size: 999px; }');

    // Create an element outside the shadow root with the same class
    const outer = document.createElement('div');
    outer.className = 'test-isolation';
    document.body.appendChild(outer);

    // The outer element should NOT be affected by shadow styles
    const computed = window.getComputedStyle(outer);
    expect(computed.fontSize).not.toBe('999px');
  });

  it('external document styles are not present inside shadow root', () => {
    // Inject a global style into the document
    const globalStyle = document.createElement('style');
    globalStyle.textContent = '.leak-test { font-size: 777px; }';
    document.head.appendChild(globalStyle);

    const { shadow } = createShadowContainer('test-host');

    // Verify the global style element is NOT inside the shadow root
    const shadowStyles = shadow.querySelectorAll('style');
    for (const s of shadowStyles) {
      expect(s.textContent).not.toContain('leak-test');
    }

    // Verify the global style IS in the document head (not shadow)
    expect(document.head.querySelector('style')!.textContent).toContain('leak-test');

    globalStyle.remove();
  });
});
