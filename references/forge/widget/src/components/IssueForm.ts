import type { ForgeAPI } from '../lib/api';
import type { Issue } from '../lib/types';
import { ImageUpload } from './ImageUpload';

export class IssueForm {
  private container: HTMLElement;
  private api: ForgeAPI;
  private onSubmitted: (issue: Issue) => void;
  private defaultFields: { category?: string; reportedBy?: string };
  private imageUpload!: ImageUpload;

  constructor(
    parent: HTMLElement,
    api: ForgeAPI,
    onSubmitted: (issue: Issue) => void,
    defaultFields: { category?: string; reportedBy?: string } = {},
  ) {
    this.container = document.createElement('div');
    this.api = api;
    this.onSubmitted = onSubmitted;
    this.defaultFields = defaultFields;
    parent.appendChild(this.container);
    this.render();
  }

  private render(): void {
    this.container.innerHTML = '';

    const form = document.createElement('form');
    form.className = 'forge-form';
    form.addEventListener('submit', (e) => this.handleSubmit(e));

    // Title
    const titleLabel = document.createElement('label');
    titleLabel.className = 'forge-form__label';
    titleLabel.textContent = 'Title';
    const titleInput = document.createElement('input');
    titleInput.className = 'forge-form__input';
    titleInput.name = 'title';
    titleInput.required = true;
    titleInput.placeholder = 'Brief description of the issue';
    titleLabel.appendChild(titleInput);
    form.appendChild(titleLabel);

    // Description
    const descLabel = document.createElement('label');
    descLabel.className = 'forge-form__label';
    descLabel.textContent = 'Description';
    const descInput = document.createElement('textarea');
    descInput.className = 'forge-form__textarea';
    descInput.name = 'description';
    descInput.required = true;
    descInput.placeholder = 'Steps to reproduce, expected vs actual behavior...';
    descLabel.appendChild(descInput);
    form.appendChild(descLabel);

    // Category
    const catLabel = document.createElement('label');
    catLabel.className = 'forge-form__label';
    catLabel.textContent = 'Category';
    const catSelect = document.createElement('select');
    catSelect.className = 'forge-form__select';
    catSelect.name = 'category';
    for (const opt of ['', 'bug', 'feature', 'improvement', 'question']) {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt || 'Select category...';
      catSelect.appendChild(o);
    }
    if (this.defaultFields.category) catSelect.value = this.defaultFields.category;
    catLabel.appendChild(catSelect);
    form.appendChild(catLabel);

    // Image upload
    const imgLabel = document.createElement('label');
    imgLabel.className = 'forge-form__label';
    imgLabel.textContent = 'Screenshots';
    form.appendChild(imgLabel);
    this.imageUpload = new ImageUpload(form);

    // Submit
    const submit = document.createElement('button');
    submit.className = 'forge-form__submit';
    submit.type = 'submit';
    submit.textContent = 'Submit Issue';
    form.appendChild(submit);

    this.container.appendChild(form);
  }

  private async handleSubmit(e: Event): Promise<void> {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const submit = form.querySelector('.forge-form__submit') as HTMLButtonElement;
    const data = new FormData(form);

    submit.disabled = true;
    submit.textContent = 'Submitting...';

    // Remove any previous error
    this.container.querySelector('.forge-error')?.remove();

    try {
      const issue = await this.api.createIssue({
        title: data.get('title') as string,
        description: data.get('description') as string,
        category: (data.get('category') as string) || undefined,
        reportedBy: this.defaultFields.reportedBy,
        images: this.imageUpload.getFiles(),
      });
      this.onSubmitted(issue);
    } catch (err) {
      const errDiv = document.createElement('div');
      errDiv.className = 'forge-error';
      errDiv.textContent =
        err instanceof Error ? err.message : 'Failed to submit issue';
      this.container.appendChild(errDiv);
      submit.disabled = false;
      submit.textContent = 'Submit Issue';
    }
  }

  destroy(): void {
    this.imageUpload?.destroy();
    this.container.remove();
  }
}
