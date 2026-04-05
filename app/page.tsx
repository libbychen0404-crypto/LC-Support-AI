import Link from 'next/link';
import { getDemoSignInFailureViewModel } from '@/lib/demoAuth';

const overviewCards = [
  {
    title: 'AI-guided intake',
    description: 'Guide the customer through structured case capture without letting the model control official workflow state.'
  },
  {
    title: 'Persistent case memory',
    description: 'Keep customer history, collected fields, and case context attached to the same support record across visits.'
  },
  {
    title: 'Human escalation built in',
    description: 'Escalate complex issues to a specialist without asking the customer to repeat the same story again.'
  }
];

const workflowStages = [
  {
    title: 'AI intake and triage',
    description: 'The customer starts in a guided workspace that gathers the right information and keeps the case organized from the first message.'
  },
  {
    title: 'Case memory and confirmation',
    description: 'Structured fields, case summaries, and conversation history stay tied to the customer so the support journey can resume cleanly.'
  },
  {
    title: 'Human handoff when needed',
    description: 'Escalation and handoff states preserve continuity so agents inherit full context instead of starting from scratch.'
  },
  {
    title: 'Operational admin control',
    description: 'Support staff manage status, priority, handoff progress, and notes from a deterministic admin workflow.'
  }
];

const trustPoints = [
  {
    title: 'Controlled workflow logic',
    description: 'Official case progression stays in application code, which keeps the product explainable and predictable.'
  },
  {
    title: 'Secure case access model',
    description: 'The platform uses app-layer permissions plus RLS-backed database access for customer and agent separation.'
  },
  {
    title: 'Ready for real support operations',
    description: 'The system is designed around cases, statuses, handoff, and admin workflows rather than a generic chatbot shell.'
  }
];

type HomePageProps = {
  searchParams?: Promise<{
    demoError?: string;
    demoRole?: string;
  }>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = (await searchParams) ?? {};
  const demoSignInError = getDemoSignInFailureViewModel(params.demoError, params.demoRole);

  return (
    <main className="home-shell">
      <header className="site-header">
        <div className="brand-lockup">
          <div className="brand-mark">LC</div>
          <div className="brand-copy">
            <strong>LC AI Support</strong>
            <span>AI-assisted customer support workspace</span>
          </div>
        </div>

        <nav className="site-nav">
          <a href="#overview" className="nav-link">
            Overview
          </a>
          <a href="#workflow" className="nav-link">
            Workflow
          </a>
          <a href="#trust" className="nav-link">
            Platform strengths
          </a>
        </nav>

        <div className="site-header-actions">
          <Link href="/setup" className="secondary-button">
            Setup Check
          </Link>
        </div>
      </header>

      {demoSignInError && (
        <section className="error-notice">
          <strong>{demoSignInError.title}</strong>
          <p>{demoSignInError.message}</p>
          {demoSignInError.operatorHint && (
            <p className="error-hint">
              <span>Setup hint:</span> {demoSignInError.operatorHint} <code>{demoSignInError.code}</code>
            </p>
          )}
        </section>
      )}

      <section className="home-hero">
        <div className="home-hero-copy">
          <p className="eyebrow">LC AI Support</p>
          <h1>AI-assisted customer support that feels structured, calm, and ready for real operations.</h1>
          <p>
            LC AI Support turns support conversations into a real case workflow. It captures customer information,
            preserves case memory, supports human escalation, and gives agents an operational console instead of a
            loose chat transcript.
          </p>

          <div className="home-actions">
            <form action="/api/demo-sign-in" method="post">
              <input type="hidden" name="role" value="customer" />
              <button type="submit" className="primary-button">
                Continue as Customer
              </button>
            </form>
            <form action="/api/demo-sign-in" method="post">
              <input type="hidden" name="role" value="agent" />
              <button type="submit" className="secondary-button">
                Continue as Agent
              </button>
            </form>
          </div>

          <div className="inline-note">Demo entry signs you into a seeded customer or agent account so the protected workspaces open normally.</div>
        </div>

        <div className="home-hero-sidebar">
          <section className="hero-side-card">
            <p className="eyebrow">What the product does</p>
            <h3>Built around case continuity, not generic chat.</h3>
            <ul className="home-list">
              <li>Guided intake with structured field collection</li>
              <li>Persistent case history and resumable customer sessions</li>
              <li>Human handoff with case context preserved</li>
              <li>Admin operations for status, priority, escalation, and review</li>
            </ul>
          </section>

          <div className="metric-grid">
            <article className="metric-card">
              <strong>Case workflow</strong>
              <span className="metric-value">Deterministic</span>
              <span>Workflow rules stay reliable and code-controlled.</span>
            </article>
            <article className="metric-card">
              <strong>Customer continuity</strong>
              <span className="metric-value">Persistent</span>
              <span>Returning customers resume the same support context.</span>
            </article>
            <article className="metric-card">
              <strong>Human support</strong>
              <span className="metric-value">Integrated</span>
              <span>Escalation and takeover happen in the same case thread.</span>
            </article>
            <article className="metric-card">
              <strong>Platform posture</strong>
              <span className="metric-value">Operational</span>
              <span>Auth, RLS, and audit foundations support enterprise demos.</span>
            </article>
          </div>
        </div>
      </section>

      <section id="overview" className="home-section">
        <div className="section-header">
          <p className="eyebrow">Product Overview</p>
          <h2>A clean support platform story you can explain in under a minute.</h2>
          <p>
            This product is designed to show where AI belongs in support: intake, wording, summarization, and case
            continuity, with human agents stepping in for higher-touch decisions.
          </p>
        </div>

        <div className="feature-grid">
          {overviewCards.map((card) => (
            <article key={card.title} className="feature-card">
              <h3>{card.title}</h3>
              <p>{card.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="workflow" className="home-section">
        <div className="section-header">
          <p className="eyebrow">Workflow</p>
          <h2>Simple enough to demo, structured enough to look like a real support product.</h2>
          <p>
            The workflow stays easy to understand: AI gathers the right context, the case becomes the system of record,
            and the human team picks up exactly where the customer left off.
          </p>
        </div>

        <div className="workflow-grid">
          {workflowStages.map((stage, index) => (
            <article key={stage.title} className="workflow-card">
              <div className="card-index">0{index + 1}</div>
              <h3>{stage.title}</h3>
              <p>{stage.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="trust" className="home-section">
        <div className="section-header">
          <p className="eyebrow">Why It Feels Credible</p>
          <h2>Designed like a support tool, not a consumer chatbot landing page.</h2>
          <p>
            The visual design stays restrained, and the product model emphasizes reliability, access control, and
            operator visibility rather than marketing spectacle.
          </p>
        </div>

        <div className="trust-grid">
          {trustPoints.map((item) => (
            <article key={item.title} className="trust-card">
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="cta-strip">
        <p className="eyebrow">Next Step</p>
        <h2>Open the customer workspace, then hand the same case to the admin console.</h2>
        <p>
          That demo path shows the strongest story: AI intake, persistent case memory, human handoff, and operational
          control inside one support product.
        </p>
        <div className="button-cluster">
          <form action="/api/demo-sign-in" method="post">
            <input type="hidden" name="role" value="customer" />
            <button type="submit" className="primary-button">
              Start Customer Demo
            </button>
          </form>
          <form action="/api/demo-sign-in" method="post">
            <input type="hidden" name="role" value="agent" />
            <button type="submit" className="secondary-button">
              Review Agent Workflow
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
