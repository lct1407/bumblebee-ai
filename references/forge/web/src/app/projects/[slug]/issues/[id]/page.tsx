'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

// Redirect to issues list — detail is now shown via modal
export default function IssueDetailRedirect() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/projects/${slug}/issues`);
  }, [slug, router]);

  return <p className="p-6 text-sm text-gray-500">Redirecting...</p>;
}
