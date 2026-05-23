import type { ForgeAPI } from '../lib/api';
import type { ForgeWebSocket } from '../lib/websocket';
import type { Issue, IssueStatus as IssueStatusType } from '../lib/types';

export class IssueStatus {
  private container: HTMLElement;
  private api: ForgeAPI;
  private ws: ForgeWebSocket;
  private issue: Issue;
  private onBack: () => void;

  constructor(
    parent: HTMLElement,
    api: ForgeAPI,
    ws: ForgeWebSocket,
    issue: Issue,
    onBack: () => void,
  ) {
    this.container = document.createElement('div');
    this.api = api;
    this.ws = ws;
    this.issue = issue;
    this.onBack = onBack;

    parent.appendChild(this.container);

    this.ws.subscribe(issue.documentId);
    this.ws.on('issue:updated', (data) => {
      if (!data || typeof data !== 'object' || !('id' in data) || !('status' in data)) return;
      const updated = data as Issue;
      if (updated.documentId === this.issue.documentId) {
        this.issue = updated;
        this.render();
      }
    });

    this.render();
  }

  private render(): void {
    this.container.innerHTML = '';

    const root = document.createElement('div');
    root.className = 'forge-status';

    // Back button
    const back = document.createElement('button');
    back.className = 'forge-back';
    back.textContent = '\u2190 Report another issue';
    back.addEventListener('click', this.onBack);
    root.appendChild(back);

    // Title
    const title = document.createElement('h3');
    title.style.margin = '0';
    title.style.fontSize = '15px';
    title.textContent = this.issue.title;
    root.appendChild(title);

    // Status badge
    const badge = document.createElement('span');
    badge.className = `forge-status__badge forge-status__badge--${this.issue.status}`;
    badge.textContent = this.formatStatus(this.issue.status);
    root.appendChild(badge);

    // AI summary
    if (this.issue.aiSummary) {
      const summary = document.createElement('div');
      summary.className = 'forge-status__summary';
      const summaryLabel = document.createElement('strong');
      summaryLabel.textContent = 'AI Analysis:';
      summary.appendChild(summaryLabel);
      summary.appendChild(document.createElement('br'));
      const summaryText = document.createTextNode(this.issue.aiSummary);
      summary.appendChild(summaryText);
      root.appendChild(summary);

    }

    // Comments
    if (this.issue.comments && this.issue.comments.length > 0) {
      const commentsDiv = document.createElement('div');
      commentsDiv.className = 'forge-comments';
      for (const c of this.issue.comments) {
        const comment = document.createElement('div');
        comment.className = 'forge-comment';
        const authorSpan = document.createElement('span');
        authorSpan.className = 'forge-comment__author';
        authorSpan.textContent = c.author + (c.isAI ? ' (AI)' : '');
        const timeSpan = document.createElement('span');
        timeSpan.className = 'forge-comment__time';
        timeSpan.textContent = this.formatTime(c.createdAt);
        const bodyP = document.createElement('p');
        bodyP.style.margin = '4px 0 0';
        bodyP.textContent = c.body;
        comment.appendChild(authorSpan);
        comment.appendChild(timeSpan);
        comment.appendChild(bodyP);
        commentsDiv.appendChild(comment);
      }
      root.appendChild(commentsDiv);
    }

    this.container.appendChild(root);
  }

  private async handleConfirm(confirmed: boolean): Promise<void> {
    try {
      this.issue = await this.api.confirmIssue(this.issue.documentId, confirmed);
      this.render();
    } catch (err) {
      const existing = this.container.querySelector('.forge-error');
      if (existing) existing.remove();
      const errDiv = document.createElement('div');
      errDiv.className = 'forge-error';
      errDiv.textContent = err instanceof Error ? err.message : 'Action failed. Please try again.';
      this.container.appendChild(errDiv);
    }
  }

  private formatStatus(status: IssueStatusType): string {
    return status.replace('_', ' ');
  }

  private formatTime(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString();
    } catch {
      return iso;
    }
  }

  destroy(): void {
    this.container.remove();
  }
}
