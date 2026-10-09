import { redirect } from 'next/navigation';

// Anonymous visitors are sent on to /login by the console guard (RequireAuth); citizens
// land on a dashboard of shortcuts to their own requests.
export default function RootPage() {
  redirect('/dashboard');
}
