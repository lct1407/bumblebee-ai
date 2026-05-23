import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockBroadcast = vi.fn();
const mockInitWebSocket = vi.fn();
const mockSeedApiPermissions = vi.fn().mockResolvedValue(undefined);

vi.mock('../../../../strapi/src/services/websocket', () => ({
  broadcast: mockBroadcast,
  initWebSocket: mockInitWebSocket,
}));

vi.mock('../../../../strapi/src/bootstrap/seeds/api-permissions', () => ({
  seedApiPermissions: mockSeedApiPermissions,
}));

vi.mock('../../../../strapi/src/services/mcp-server', () => ({
  mcpMiddleware: () => (_ctx: any, next: any) => next(),
}));

describe('Issue Lifecycles', () => {
  let issueSubscription: any;

  beforeEach(async () => {
    vi.resetModules();

    const subscriptions: any[] = [];
    const mockStrapi = {
      documents: vi.fn().mockReturnValue({
        findOne: vi.fn(),
        create: vi.fn(),
      }),
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      server: { use: vi.fn() },
      db: {
        lifecycles: {
          subscribe: (sub: any) => subscriptions.push(sub),
        },
      },
    };

    mockBroadcast.mockReset();

    const mod = await import('../../../../strapi/src/index');
    await mod.default.bootstrap({ strapi: mockStrapi as any });

    issueSubscription = subscriptions.find((s) =>
      s.models.includes('api::issue.issue'),
    );
  });

  it('afterCreate should broadcast issue:created', async () => {
    const event = {
      result: { documentId: 'issue-1', title: 'New Issue' },
    };

    await issueSubscription.afterCreate(event);

    expect(mockBroadcast).toHaveBeenCalledWith('issue:created', {
      documentId: 'issue-1',
      title: 'New Issue',
    });
  });

  it('afterCreate should NOT trigger enrichment (enrichment is API-driven)', async () => {
    const event = {
      result: { documentId: 'issue-1', title: 'New Issue' },
    };

    await issueSubscription.afterCreate(event);
    await new Promise((r) => setTimeout(r, 50));

    // Only broadcast, no enrichment call
    expect(mockBroadcast).toHaveBeenCalledTimes(1);
  });

  it('afterUpdate broadcasts issue:confirmed when status is confirmed', async () => {
    const event = {
      result: { documentId: 'issue-5', status: 'confirmed' },
    };

    await issueSubscription.afterUpdate(event);

    expect(mockBroadcast).toHaveBeenCalledWith('issue:confirmed', { documentId: 'issue-5' });
  });

  it('afterUpdate broadcasts issue:updated for any status', async () => {
    const event = {
      result: { documentId: 'issue-7', status: 'open' },
    };

    await issueSubscription.afterUpdate(event);

    expect(mockBroadcast).toHaveBeenCalledWith('issue:updated', {
      documentId: 'issue-7',
      status: 'open',
    });
  });

  it('afterUpdate broadcasts issue:updated for approved status', async () => {
    const event = {
      result: { documentId: 'issue-6', status: 'approved' },
    };

    await issueSubscription.afterUpdate(event);

    expect(mockBroadcast).toHaveBeenCalledWith('issue:updated', {
      documentId: 'issue-6',
      status: 'approved',
    });
  });
});
