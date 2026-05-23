import type { WidgetConfig } from './lib/types';
import { Widget } from './widget';

let instance: Widget | null = null;

export const ForgeWidget = {
  init(config: WidgetConfig): Widget {
    if (instance) {
      console.warn('[ForgeWidget] Already initialized. Call destroy() first.');
      return instance;
    }
    if (!config?.apiKey) {
      throw new Error('[ForgeWidget] Missing required config field: apiKey');
    }
    if (!config?.apiUrl) {
      throw new Error('[ForgeWidget] Missing required config field: apiUrl');
    }
    instance = new Widget(config);
    instance.mount();
    return instance;
  },

  destroy(): void {
    instance?.destroy();
    instance = null;
  },
};

// Expose on window for IIFE usage
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).ForgeWidget = ForgeWidget;
}
