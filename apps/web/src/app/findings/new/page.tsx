'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { FindingForm } from '@/components/FindingForm';

function NewFinding() {
  const { user, loading } = useAuth();
  const params = useSearchParams();
  const pageUrl = params.get('pageUrl') ?? '';
  let where = '';
  try {
    if (pageUrl) where = new URL(pageUrl).pathname || '/';
  } catch {
    /* not a full address; the form will say so */
  }
  if (loading) return <p className="muted">Loading…</p>;
  if (!user || user.role === 'viewer') return <p>Editors and admins only.</p>;
  return (
    <>
      <h1>New finding</h1>
      <FindingForm canEdit prefill={{ pageUrl, where }} />
    </>
  );
}

export default function NewFindingPage() {
  return <Suspense fallback={<p className="muted">Loading…</p>}><NewFinding /></Suspense>;
}
