import type { Metadata } from 'next';
import { NeighborhoodPulseDetailView } from './neighborhood-pulse-detail';

export const metadata: Metadata = { title: 'Mahalle Detayı' };

export default async function NeighborhoodPulsePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <NeighborhoodPulseDetailView id={id} />;
}
