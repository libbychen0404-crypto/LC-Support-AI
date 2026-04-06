import { InternalAgentLoginForm } from '@/components/internal/InternalAgentLoginForm';

export default function InternalAgentLoginPage() {
  return (
    <main className="home-shell">
      <section className="home-section">
        <div className="section-header">
          <p className="eyebrow">Internal Agent Demo Access</p>
          <h1>Private agent demo login</h1>
          <p>Enter the internal access code to open the seeded support agent workspace.</p>
        </div>
        <InternalAgentLoginForm />
      </section>
    </main>
  );
}
