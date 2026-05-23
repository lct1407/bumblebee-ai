export const mdComponents = {
  ul: ({ children }: any) => <ul className="ml-4 list-disc space-y-0.5">{children}</ul>,
  ol: ({ children }: any) => <ol className="ml-4 list-decimal space-y-0.5">{children}</ol>,
  li: ({ children }: any) => <li>{children}</li>,
  strong: ({ children }: any) => <strong className="font-semibold">{children}</strong>,
  p: ({ children }: any) => <p className="mb-1.5 last:mb-0 leading-relaxed">{children}</p>,
  h1: ({ children }: any) => <h1 className="font-bold text-base mb-1">{children}</h1>,
  h2: ({ children }: any) => <h2 className="font-bold text-sm mb-1">{children}</h2>,
  h3: ({ children }: any) => <h3 className="font-semibold text-sm mb-1">{children}</h3>,
  code: ({ children, className }: any) => {
    if (className?.includes('language-')) return <code className={className}>{children}</code>;
    return <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-pink-600">{children}</code>;
  },
  pre: ({ children }: any) => <pre className="my-2 overflow-x-auto rounded-lg bg-gray-900 p-3 text-xs text-gray-100">{children}</pre>,
  a: ({ children, href }: any) => <a href={href} className="text-blue-600 underline hover:text-blue-800" target="_blank" rel="noopener noreferrer">{children}</a>,
  blockquote: ({ children }: any) => <blockquote className="border-l-2 border-gray-300 pl-3 text-gray-500 italic">{children}</blockquote>,
};
