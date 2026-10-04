import { redirect } from 'next/navigation';

/** /field groups the field operation screens; teams are its first page (Phase 6). */
export default function FieldPage() {
  redirect('/field/teams');
}
