'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { Attachments } from '@/components/Attachments';
import { FindingForm } from '@/components/FindingForm';
import { api } from '@/lib/api';
import { BAND_LABEL, type Finding } from '@/lib/findings';

export default function FindingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [finding, setFinding] = useState<Finding | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Finding>(`/findings/${id}`).then(setFinding).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <p className="error">{error}</p>;
  if (!finding || !user) return <p className="muted">Loading…</p>;
  const canEdit = user.role !== 'viewer';

  async function remove() {
    if (!window.confirm('Permanently delete this finding and its screenshots? Consider setting it to "ignored" instead.')) return;
    await api(`/findings/${id}`, { method: 'DELETE' });
    router.replace('/findings');
  }

  return (
    <>
      <p><Link href="/findings">← Findings</Link></p>
      <h1>F-{finding.ref}: {finding.title}</h1>
      <p className="muted">
        {BAND_LABEL[finding.priority.band]} · score {finding.priority.score} · by {finding.createdBy.name}
        {finding.githubUrl && <> · <a href={finding.githubUrl} target="_blank" rel="noreferrer">GitHub</a></>}
      </p>
      <FindingForm key={finding.id} initial={finding} canEdit={canEdit} onSaved={setFinding} />
      <Attachments findingId={finding.id} items={finding.attachments} canEdit={canEdit} onChange={setFinding} />
      {user.role === 'admin' && <p><button onClick={remove}>Delete finding</button></p>}
    </>
  );
}
