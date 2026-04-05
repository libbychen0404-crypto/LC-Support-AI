import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SignOutForm } from '@/components/shared/SignOutForm';
import { ChatWorkspace } from '@/components/chat/ChatWorkspace';
import { resolveServerAuthContext } from '@/lib/auth';

export default async function ChatPage() {
  const authContext = await resolveServerAuthContext();

  if (!authContext.isAuthenticated) {
    redirect('/');
  }

  if (authContext.role !== 'customer') {
    redirect('/admin');
  }

  return (
    <>
      <div className="top-nav">
        <Link href="/" className="secondary-button">
          Home
        </Link>
        <Link href="/setup" className="secondary-button">
          Setup Check
        </Link>
        <SignOutForm />
      </div>
      <ChatWorkspace />
    </>
  );
}
