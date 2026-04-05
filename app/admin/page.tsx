import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SignOutForm } from '@/components/shared/SignOutForm';
import { AdminWorkspace } from '@/components/admin/AdminWorkspace';
import { resolveServerAuthContext } from '@/lib/auth';

export default async function AdminPage() {
  const authContext = await resolveServerAuthContext();

  if (!authContext.isAuthenticated) {
    redirect('/');
  }

  if (authContext.role !== 'agent') {
    redirect('/chat');
  }

  return (
    <>
      <div className="top-nav">
        <Link href="/" className="secondary-button">
          Home
        </Link>
        <Link href="/chat" className="secondary-button">
          Customer Workspace
        </Link>
        <Link href="/setup" className="secondary-button">
          Setup Check
        </Link>
        <SignOutForm />
      </div>
      <AdminWorkspace />
    </>
  );
}
