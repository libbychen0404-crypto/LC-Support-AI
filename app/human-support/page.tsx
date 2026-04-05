import { redirect } from 'next/navigation';
import { SignOutForm } from '@/components/shared/SignOutForm';
import { HumanSupportWorkspace } from '@/components/handoff/HumanSupportWorkspace';
import { resolveServerAuthContext } from '@/lib/auth';

type HumanSupportPageProps = {
  searchParams: Promise<{
    caseId?: string;
  }>;
};

export default async function HumanSupportPage({ searchParams }: HumanSupportPageProps) {
  const authContext = await resolveServerAuthContext();
  const params = await searchParams;

  if (!authContext.isAuthenticated) {
    redirect('/');
  }

  if (authContext.role !== 'customer') {
    redirect('/admin');
  }

  if (!params.caseId) {
    redirect('/chat');
  }

  return (
    <>
      <div className="top-nav">
        <SignOutForm />
      </div>
      <HumanSupportWorkspace caseId={params.caseId} />
    </>
  );
}
