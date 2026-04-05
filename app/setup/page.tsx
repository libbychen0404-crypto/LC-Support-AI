import { redirect } from 'next/navigation';
import { SetupCheckPanel } from '@/components/setup/SetupCheckPanel';
import { resolveServerAuthContext } from '@/lib/auth';

export default async function SetupPage() {
  if (process.env.NODE_ENV === 'production') {
    const authContext = await resolveServerAuthContext();

    if (!authContext.isAuthenticated) {
      redirect('/');
    }

    if (authContext.role !== 'agent') {
      redirect(authContext.role === 'customer' ? '/chat' : '/');
    }
  }

  return <SetupCheckPanel />;
}
