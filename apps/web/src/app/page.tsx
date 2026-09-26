import { redirect } from 'next/navigation';

// Anonymous visitors are sent on to /login by the console guard (RequireAuth).
// TODO(phase-8): Route citizens to their own request list instead of the console.
export default function RootPage() {
  redirect('/dashboard');
}
