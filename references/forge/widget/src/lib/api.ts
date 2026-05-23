import type { Issue, CreateIssuePayload } from './types';

export class ForgeAPI {
  private baseUrl: string;
  private apiKey: string;

  constructor(apiUrl: string, apiKey: string) {
    this.baseUrl = apiUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  private headers(): Record<string, string> {
    return {
      'X-Forge-API-Key': this.apiKey,
      'Content-Type': 'application/json',
    };
  }

  async createIssue(payload: CreateIssuePayload): Promise<Issue> {
    const { images, ...fields } = payload;

    if (images && images.length > 0) {
      const formData = new FormData();
      formData.append('data', JSON.stringify(fields));
      images.forEach((file) => {
        formData.append('files.attachments', file, file.name);
      });

      const res = await fetch(`${this.baseUrl}/api/issues`, {
        method: 'POST',
        headers: { 'X-Forge-API-Key': this.apiKey },
        body: formData,
      });

      if (!res.ok) throw new Error(`Failed to create issue: ${res.status}`);
      const json = await res.json();
      if (!json.data) throw new Error('Unexpected response: missing data');
      return json.data;
    }

    const res = await fetch(`${this.baseUrl}/api/issues`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ data: fields }),
    });

    if (!res.ok) throw new Error(`Failed to create issue: ${res.status}`);
    const json = await res.json();
    if (!json.data) throw new Error('Unexpected response: missing data');
    return json.data;
  }

  async getIssue(documentId: string): Promise<Issue> {
    const res = await fetch(
      `${this.baseUrl}/api/issues/${documentId}?populate=comments`,
      { headers: this.headers() },
    );
    if (!res.ok) throw new Error(`Failed to fetch issue: ${res.status}`);
    const json = await res.json();
    if (!json.data) throw new Error('Unexpected response: missing data');
    return json.data;
  }

  async confirmIssue(documentId: string, confirmed: boolean): Promise<Issue> {
    const res = await fetch(`${this.baseUrl}/api/issues/${documentId}`, {
      method: 'PUT',
      headers: this.headers(),
      body: JSON.stringify({
        data: { status: confirmed ? 'confirmed' : 'open' },
      }),
    });
    if (!res.ok) throw new Error(`Failed to update issue: ${res.status}`);
    const json = await res.json();
    if (!json.data) throw new Error('Unexpected response: missing data');
    return json.data;
  }
}
