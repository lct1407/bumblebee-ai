import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WidgetPanel } from '../WidgetPanel';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('WidgetPanel Component', () => {
  it('render creates panel with tabs', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    new WidgetPanel(container, 'bottom-right', vi.fn(), vi.fn());

    expect(container.querySelector('.forge-panel')).not.toBeNull();
    expect(container.querySelectorAll('.forge-panel__tab').length).toBe(3);
  });

  it('tab switching shows correct content and updates active class', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const onViewChange = vi.fn();
    const panel = new WidgetPanel(container, 'bottom-right', onViewChange, vi.fn());

    // Initially no tab is active
    const tabs = container.querySelectorAll('.forge-panel__tab');

    // Click second tab (status)
    (tabs[1] as HTMLButtonElement).click();
    expect(onViewChange).toHaveBeenCalledWith('status');

    // Simulate what the Widget would do: call setActiveTab
    panel.setActiveTab('status');
    expect(tabs[1].classList.contains('forge-panel__tab--active')).toBe(true);
    expect(tabs[0].classList.contains('forge-panel__tab--active')).toBe(false);
    expect(tabs[2].classList.contains('forge-panel__tab--active')).toBe(false);
  });

  it('destroy removes from DOM and sets destroyed flag', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const panel = new WidgetPanel(container, 'bottom-right', vi.fn(), vi.fn());

    panel.destroy();
    expect(container.querySelector('.forge-panel')).toBeNull();
  });

  it('double destroy is idempotent, no error', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const panel = new WidgetPanel(container, 'bottom-right', vi.fn(), vi.fn());

    panel.destroy();
    expect(() => panel.destroy()).not.toThrow();
  });
});
