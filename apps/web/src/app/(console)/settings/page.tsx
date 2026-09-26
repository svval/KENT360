import { redirect } from 'next/navigation';

/** The settings area has no overview page of its own; its first section is the profile. */
export default function SettingsPage() {
  redirect('/settings/municipality');
}
