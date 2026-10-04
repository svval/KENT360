import type { Metadata } from 'next';
import { PulseView } from './pulse-view';

export const metadata: Metadata = { title: 'MahallePulse' };

export default function NeighborhoodsPage() {
  return <PulseView />;
}
