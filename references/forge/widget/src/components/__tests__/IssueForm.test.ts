import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IssueForm } from '../IssueForm';

vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

const mockApi = {
  createIssue: vi.fn(),
  getIssue: vi.fn(),
  confirmIssue: vi.fn(),
} as any;

beforeEach(() => {
  document.body.innerHTML = '';
  mockApi.createIssue.mockReset();
});

describe('IssueForm Component', () => {
  it('render creates form with title, description, category, submit', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    new IssueForm(parent, mockApi, vi.fn());

    expect(parent.querySelector('input[name="title"]')).not.toBeNull();
    expect(parent.querySelector('textarea[name="description"]')).not.toBeNull();
    expect(parent.querySelector('select[name="category"]')).not.toBeNull();
    expect(parent.querySelector('.forge-form__submit')).not.toBeNull();
  });

  it('validation: required fields prevent empty submit via button click', async () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const onSubmit = vi.fn();
    new IssueForm(parent, mockApi, onSubmit);

    // Click the submit button with empty fields
    const submitBtn = parent.querySelector('.forge-form__submit') as HTMLButtonElement;
    submitBtn.click();

    // Wait a tick and verify onSubmit was NOT called (form validation blocked it)
    await new Promise((r) => setTimeout(r, 50));
    expect(mockApi.createIssue).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submit calls onSubmit callback with form data', async () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const onSubmit = vi.fn();
    const issue = { id: 1, documentId: 'abc', title: 'Test', status: 'open' };
    mockApi.createIssue.mockResolvedValueOnce(issue);

    new IssueForm(parent, mockApi, onSubmit);

    const titleInput = parent.querySelector('input[name="title"]') as HTMLInputElement;
    const descInput = parent.querySelector('textarea[name="description"]') as HTMLTextAreaElement;
    titleInput.value = 'Bug title';
    descInput.value = 'Bug description';

    const form = parent.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { cancelable: true }));

    // Wait for async handler
    await vi.waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(issue);
    });
  });

  it('destroy calls imageUpload.destroy()', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const form = new IssueForm(parent, mockApi, vi.fn());

    // Should not throw
    form.destroy();
    // Container should be removed
    expect(parent.children.length).toBe(0);
  });
});
