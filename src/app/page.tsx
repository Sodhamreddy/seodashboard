import { redirect } from 'next/navigation';

export default function RootPage() {
  // The middleware has already established a session by the time this renders.
  redirect('/dashboard');
}
