import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SignOutForm } from '@/components/shared/SignOutForm';
import { ChatWorkspace } from '@/components/chat/ChatWorkspace';
import { resolveServerAuthContext } from '@/lib/auth';
import { resolveServerAuthEntryMode } from '@/lib/authEntry';

export default async function ChatPage() {
  const authContext = await resolveServerAuthContext();
  const authEntryMode = await resolveServerAuthEntryMode();

  if (!authContext.isAuthenticated) {
    redirect(authEntryMode === 'real' ? '/real' : '/');
  }

  if (authContext.role !== 'customer') {
    redirect('/admin');
  }

  const homeHref = authEntryMode === 'real' ? '/real' : '/';

  return (
    <>
      <div className="top-nav">
        <Link href={homeHref} className="secondary-button">
          Home
        </Link>
        <SignOutForm />
      </div>
      <ChatWorkspace />
    </>
  );
}
