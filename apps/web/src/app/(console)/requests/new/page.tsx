import type { Metadata } from 'next';
import { NewRequestForm } from './new-request-form';

export const metadata: Metadata = { title: 'Yeni Talep' };

export default function NewRequestPage() {
  return <NewRequestForm />;
}
