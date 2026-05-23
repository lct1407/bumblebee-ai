'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { strapiMediaUrl } from '@/lib/api/client';
import { FileUpload } from '@/components/ui/file-upload';
import { ImagePreview } from '@/components/ui/image-preview';
import { issueApi } from '@/features/issue/api/issue-api';

interface Attachment {
  id: number;
  url: string;
  name: string;
  mime: string;
}

interface IssueAttachmentsProps {
  attachments: Attachment[];
  issueDocumentId: string;
  onUpdate: (id: string, data: Record<string, any>) => void;
}

export function IssueAttachments({ attachments, issueDocumentId, onUpdate }: IssueAttachmentsProps) {
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);

  return (
    <div className="px-4 py-3 sm:px-6">
      <h3 className="mb-2 text-sm font-semibold">Attachments</h3>
      {attachments && attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((a) => {
            const isImage = /^image\//.test(a.mime);
            const fullUrl = strapiMediaUrl(a.url);
            const handleDelete = (e: React.MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              const remainingIds = attachments
                .filter((att) => att.id !== a.id)
                .map((att) => att.id);
              onUpdate(issueDocumentId, { attachments: remainingIds } as any);
            };
            return (
              <div key={a.id} className="group relative">
                {isImage ? (
                  <button
                    type="button"
                    onClick={() => setPreviewImage({ url: fullUrl, name: a.name })}
                    className="flex items-center gap-1.5 rounded border bg-gray-50 px-2.5 py-2 pr-7 text-xs text-gray-700 hover:bg-gray-100 cursor-zoom-in"
                  >
                    <img src={fullUrl} alt={a.name} className="h-8 w-8 rounded object-cover" />
                    <span className="max-w-[80px] truncate sm:max-w-[120px]">{a.name}</span>
                  </button>
                ) : (
                  <a
                    href={fullUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded border bg-gray-50 px-2.5 py-2 pr-7 text-xs text-gray-700 hover:bg-gray-100"
                  >
                    <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                    <span className="max-w-[80px] truncate sm:max-w-[120px]">{a.name}</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={handleDelete}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-white p-0.5 text-gray-400 opacity-0 shadow hover:bg-red-500 hover:text-white group-hover:opacity-100"
                  title="Remove attachment"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      {previewImage && (
        <ImagePreview src={previewImage.url} alt={previewImage.name} onClose={() => setPreviewImage(null)} />
      )}
      <FileUpload
        value={[]}
        onChange={(newFiles) => {
          const existingIds = attachments?.map((a) => a.id) ?? [];
          const allIds = [...existingIds, ...newFiles.map((f) => f.id)];
          onUpdate(issueDocumentId, { attachments: allIds } as any);
        }}
        uploadFn={issueApi.uploadFile}
      />
    </div>
  );
}
