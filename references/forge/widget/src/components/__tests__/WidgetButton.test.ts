import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WidgetButton } from '../WidgetButton';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('WidgetButton Component', () => {
  it('render creates button with aria-label', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    new WidgetButton(container, 'bottom-right', vi.fn());

    const btn = container.querySelector('button');
    expect(btn).not.toBeNull();
    expect(btn!.getAttribute('aria-label')).toBe('Report an issue');
  });

  it('click calls onClick callback', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const onClick = vi.fn();
    new WidgetButton(container, 'bottom-right', onClick);

    container.querySelector('button')!.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('badge shows/hides count badge', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const btn = new WidgetButton(container, 'bottom-right', vi.fn());

    const badge = container.querySelector('.forge-btn__badge') as HTMLSpanElement;
    expect(badge.style.display).toBe('none');

    btn.unreadCount = 3;
    expect(badge.style.display).toBe('flex');
    expect(badge.textContent).toBe('3');

    btn.unreadCount = 0;
    expect(badge.style.display).toBe('none');
  });

  it('badge with count=0 should NOT show badge element', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const btn = new WidgetButton(container, 'bottom-right', vi.fn());

    // Set to 0 explicitly
    btn.unreadCount = 0;
    const badge = container.querySelector('.forge-btn__badge') as HTMLSpanElement;
    expect(badge.style.display).toBe('none');
  });
});
