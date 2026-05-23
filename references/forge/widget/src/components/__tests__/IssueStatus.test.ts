import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IssueStatus } from '../IssueStatus';
import type { Issue } from '../../lib/types';

const mockApi = {
  createIssue: vi.fn(),
  getIssue: vi.fn(),
  confirmIssue: vi.fn(),
} as any;

let wsHandlers: Map<string, Set<(data: unknown) => void>>;

const mockWs = {
  subscribe: vi.fn(),
  on: vi.fn((event: string, handler: (data: unknown) => void) => {
    if (!wsHandlers.has(event)) wsHandlers.set(event, new Set());
    wsHandlers.get(event)!.add(handler);
  }),
  off: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
} as any;

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 1,
    documentId: 'doc-1',
    title: 'Test Issue',
    description: 'Desc',
    status: 'open',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
  wsHandlers = new Map();
  mockApi.confirmIssue.mockReset();
});

describe('IssueStatus Component', () => {
  it('render shows issue title and status badge', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    new IssueStatus(parent, mockApi, mockWs, makeIssue(), vi.fn());

    expect(parent.querySelector('h3')!.textContent).toBe('Test Issue');
    expect(parent.querySelector('.forge-status__badge')).not.toBeNull();
  });

  it('shows AI summary when aiSummary exists', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    new IssueStatus(parent, mockApi, mockWs, makeIssue({
      status: 'open',
      aiSummary: 'AI found a problem',
    }), vi.fn());

    const summary = parent.querySelector('.forge-status__summary');
    expect(summary).not.toBeNull();
    expect(summary!.textContent).toContain('AI found a problem');
  });

  it('WebSocket update validates data shape before rendering', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    new IssueStatus(parent, mockApi, mockWs, makeIssue(), vi.fn());

    const handlers = wsHandlers.get('issue:updated');
    expect(handlers).toBeDefined();

    // Send valid update
    handlers!.forEach((fn) => fn({
      id: 1,
      documentId: 'doc-1',
      title: 'Updated Title',
      status: 'open',
      aiSummary: 'New summary',
    }));

    expect(parent.querySelector('h3')!.textContent).toBe('Updated Title');
  });

  it('invalid WS data: component still renders correctly after receiving bad data', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    new IssueStatus(parent, mockApi, mockWs, makeIssue(), vi.fn());

    const handlers = wsHandlers.get('issue:updated');

    // Send malformed data
    handlers!.forEach((fn) => fn(null));
    handlers!.forEach((fn) => fn('string'));
    handlers!.forEach((fn) => fn({ random: true }));

    // Verify original content is still rendered correctly (not corrupted)
    expect(parent.querySelector('h3')!.textContent).toBe('Test Issue');
    expect(parent.querySelector('.forge-status__badge')).not.toBeNull();
  });
});
