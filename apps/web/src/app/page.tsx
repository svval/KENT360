import { redirect } from 'next/navigation';

// TODO(phase-7): Route by session – staff → /dashboard, citizens → their request list, anonymous → /login.
export default function RootPage() {
  redirect('/dashboard');
}
