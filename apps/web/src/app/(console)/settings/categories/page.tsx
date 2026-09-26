import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CategoriesView } from './categories-view';

export const metadata: Metadata = { title: 'Talep Kategorileri' };

export default function CategoriesPage() {
  return (
    <Suspense>
      <CategoriesView />
    </Suspense>
  );
}
