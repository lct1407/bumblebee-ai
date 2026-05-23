import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ImageUpload } from '../ImageUpload';

beforeEach(() => {
  document.body.innerHTML = '';
});

function createImageFile(name = 'test.png', size = 100): File {
  const content = new Uint8Array(size);
  return new File([content], name, { type: 'image/png' });
}

describe('ImageUpload Component', () => {
  it('render creates drop zone and file input', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    new ImageUpload(parent);
    expect(parent.querySelector('.forge-upload')).not.toBeNull();
    expect(parent.querySelector('input[type="file"]')).not.toBeNull();
  });

  it('file validation rejects non-image files', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const upload = new ImageUpload(parent);
    const input = parent.querySelector('input[type="file"]') as HTMLInputElement;

    const textFile = new File(['hello'], 'test.txt', { type: 'text/plain' });
    Object.defineProperty(input, 'files', { value: [textFile], configurable: true });
    input.dispatchEvent(new Event('change'));

    expect(upload.getFiles()).toHaveLength(0);
  });

  it('file size rejects files over 10MB', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const upload = new ImageUpload(parent);
    const input = parent.querySelector('input[type="file"]') as HTMLInputElement;

    const bigFile = createImageFile('big.png', 11 * 1024 * 1024);
    Object.defineProperty(input, 'files', { value: [bigFile], configurable: true });
    input.dispatchEvent(new Event('change'));

    expect(upload.getFiles()).toHaveLength(0);
  });

  it('max files rejects beyond 5 files', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const upload = new ImageUpload(parent);
    const input = parent.querySelector('input[type="file"]') as HTMLInputElement;

    const files = Array.from({ length: 7 }, (_, i) => createImageFile(`img${i}.png`));
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    input.dispatchEvent(new Event('change'));

    expect(upload.getFiles()).toHaveLength(5);
  });

  it('preview creates blob URL for valid image and img src starts with blob:', () => {
    const spy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/test');
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const upload = new ImageUpload(parent);
    const input = parent.querySelector('input[type="file"]') as HTMLInputElement;

    Object.defineProperty(input, 'files', { value: [createImageFile()], configurable: true });
    input.dispatchEvent(new Event('change'));

    expect(spy).toHaveBeenCalledTimes(1);
    const img = parent.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.src).toMatch(/^blob:/);
    spy.mockRestore();
  });

  it('remove revokes blob URL', () => {
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const upload = new ImageUpload(parent);
    const input = parent.querySelector('input[type="file"]') as HTMLInputElement;

    Object.defineProperty(input, 'files', { value: [createImageFile()], configurable: true });
    input.dispatchEvent(new Event('change'));

    const removeBtn = parent.querySelector('.forge-upload__remove') as HTMLButtonElement;
    removeBtn.click();

    // After removing 1 file, revokeObjectURL should have been called for the re-render
    // renderPreviews revokes all old URLs then creates new ones
    expect(revokeSpy).toHaveBeenCalledTimes(1);
    createSpy.mockRestore();
    revokeSpy.mockRestore();
  });

  it('destroy() revokes ALL blob URLs matching number of previews', () => {
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const upload = new ImageUpload(parent);
    const input = parent.querySelector('input[type="file"]') as HTMLInputElement;

    const files = [createImageFile('a.png'), createImageFile('b.png')];
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    input.dispatchEvent(new Event('change'));

    // createObjectURL was called twice (once per file)
    expect(createSpy).toHaveBeenCalledTimes(2);

    revokeSpy.mockClear();
    upload.destroy();
    // destroy -> clear -> revokes exactly 2 blob URLs (one per preview)
    expect(revokeSpy).toHaveBeenCalledTimes(2);
    createSpy.mockRestore();
    revokeSpy.mockRestore();
  });

  it('getFiles() returns current files array', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const upload = new ImageUpload(parent);
    const input = parent.querySelector('input[type="file"]') as HTMLInputElement;

    const file = createImageFile();
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));

    const result = upload.getFiles();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('test.png');
  });
});
