const MAX_FILES = 5;
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export class ImageUpload {
  private container: HTMLElement;
  private files: File[] = [];
  private blobUrls: string[] = [];
  private input: HTMLInputElement;
  private previewContainer: HTMLDivElement;
  private dropZone: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div');

    this.input = document.createElement('input');
    this.input.type = 'file';
    this.input.accept = 'image/*';
    this.input.multiple = true;
    this.input.style.display = 'none';
    this.input.addEventListener('change', () => {
      if (this.input.files) this.addFiles(Array.from(this.input.files));
      this.input.value = '';
    });

    this.dropZone = document.createElement('div');
    this.dropZone.className = 'forge-upload';
    this.dropZone.textContent = 'Drop images here or click to upload (max 5)';
    this.dropZone.addEventListener('click', () => this.input.click());
    this.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropZone.classList.add('forge-upload--active');
    });
    this.dropZone.addEventListener('dragleave', () => {
      this.dropZone.classList.remove('forge-upload--active');
    });
    this.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropZone.classList.remove('forge-upload--active');
      if (e.dataTransfer?.files) this.addFiles(Array.from(e.dataTransfer.files));
    });

    this.previewContainer = document.createElement('div');
    this.previewContainer.className = 'forge-upload__previews';

    this.container.appendChild(this.input);
    this.container.appendChild(this.dropZone);
    this.container.appendChild(this.previewContainer);
    parent.appendChild(this.container);
  }

  private addFiles(newFiles: File[]): void {
    for (const file of newFiles) {
      if (this.files.length >= MAX_FILES) break;
      if (!file.type.startsWith('image/')) continue;
      if (file.size > MAX_SIZE) continue;
      this.files.push(file);
    }
    this.renderPreviews();
  }

  private renderPreviews(): void {
    // Revoke old blob URLs before re-rendering
    for (const url of this.blobUrls) {
      URL.revokeObjectURL(url);
    }
    this.blobUrls = [];
    this.previewContainer.innerHTML = '';
    this.files.forEach((file, i) => {
      const item = document.createElement('div');
      item.className = 'forge-upload__item';

      const img = document.createElement('img');
      img.className = 'forge-upload__thumb';
      const blobUrl = URL.createObjectURL(file);
      this.blobUrls.push(blobUrl);
      img.src = blobUrl;

      const remove = document.createElement('button');
      remove.className = 'forge-upload__remove';
      remove.textContent = '\u00d7';
      remove.addEventListener('click', () => {
        this.files.splice(i, 1);
        this.renderPreviews();
      });

      item.appendChild(img);
      item.appendChild(remove);
      this.previewContainer.appendChild(item);
    });
  }

  getFiles(): File[] {
    return [...this.files];
  }

  clear(): void {
    this.files = [];
    for (const url of this.blobUrls) {
      URL.revokeObjectURL(url);
    }
    this.blobUrls = [];
    this.previewContainer.innerHTML = '';
  }

  destroy(): void {
    this.clear();
    this.container.remove();
  }
}
