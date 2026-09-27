import type { Metadata } from 'next';
import { RequestDetailView } from './request-detail';

export const metadata: Metadata = { title: 'Talep Detayı' };

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RequestDetailView id={id} />;
}
