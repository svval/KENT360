import type { Metadata } from 'next';
import { MunicipalityProfileView } from './municipality-profile';

export const metadata: Metadata = { title: 'Belediye Profili' };

export default function MunicipalityPage() {
  return <MunicipalityProfileView />;
}
