import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForgeAPI } from '../api';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

const api = new ForgeAPI('http://localhost:1337', 'test-api-key');

describe('API Client', () => {
  it('createIssue sends POST with correct headers including X-Forge-API-Key', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { id: 1, documentId: 'abc', title: 'Test', status: 'open' } }),
    });

    await api.createIssue({ title: 'Test', description: 'Desc' });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:1337/api/issues',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Forge-API-Key': 'test-api-key' }),
      }),
    );
  });

  it('createIssue uses FormData for file upload without Content-Type override', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { id: 1, documentId: 'abc' } }),
    });

    const file = new File(['img'], 'test.png', { type: 'image/png' });
    await api.createIssue({ title: 'T', description: 'D', images: [file] });

    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.body).toBeInstanceOf(FormData);
    // Should NOT have Content-Type header (browser sets it with boundary)
    expect(opts.headers['Content-Type']).toBeUndefined();

    // Verify specific fields were appended to FormData
    const formData = opts.body as FormData;
    const dataField = formData.get('data');
    expect(dataField).not.toBeNull();
    const parsed = JSON.parse(dataField as string);
    expect(parsed.title).toBe('T');
    expect(parsed.description).toBe('D');
    expect(formData.get('files.attachments')).toBeInstanceOf(File);
  });

  it('getIssue sends GET with populate query', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { id: 1 } }),
    });

    await api.getIssue('doc-123');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:1337/api/issues/doc-123?populate=comments',
      expect.objectContaining({ headers: expect.objectContaining({ 'X-Forge-API-Key': 'test-api-key' }) }),
    );
  });

  it('error response throws with status', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    await expect(api.createIssue({ title: 'T', description: 'D' })).rejects.toThrow('500');
  });

  it('null json.data throws descriptive error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: null }),
    });

    await expect(api.createIssue({ title: 'T', description: 'D' })).rejects.toThrow('missing data');
  });

  it('confirmIssue sends PUT with correct payload', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { id: 1, status: 'confirmed' } }),
    });

    await api.confirmIssue('doc-123', true);

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:1337/api/issues/doc-123');
    expect(opts.method).toBe('PUT');
    expect(JSON.parse(opts.body)).toEqual({ data: { status: 'confirmed' } });
  });
});
