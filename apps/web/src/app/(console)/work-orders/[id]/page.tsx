import type { Metadata } from 'next';
import { WorkOrderDetailView } from './work-order-detail';

export const metadata: Metadata = { title: 'İş Emri Detayı' };

export default async function WorkOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WorkOrderDetailView id={id} />;
}
