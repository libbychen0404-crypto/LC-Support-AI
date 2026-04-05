'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { loadSetupCheck } from '@/lib/adminClient';
import type { SetupCheckResult } from '@/lib/types';

function CheckRow({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="detail-list-row">
      <strong>{label}</strong>
      <span className={value ? 'setup-ok' : 'setup-fail'}>{value ? 'Ready' : 'Missing'}</span>
    </div>
  );
}

export function SetupCheckPanel() {
  const [result, setResult] = useState<SetupCheckResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const nextResult = await loadSetupCheck();
        if (cancelled) return;
        setResult(nextResult);
      } catch (nextError) {
        if (!cancelled) {
          console.error(nextError);
          setError(nextError instanceof Error ? nextError.message : 'Unable to run the setup check right now.');
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="chat-shell">
      <section className="hero-banner">
        <div>
          <p className="eyebrow">Setup Diagnostics</p>
          <h1>Quick checks for env configuration, schema shape, and cleanup migrations.</h1>
          <p>
            Use this page when the support workspace fails to load so you can tell whether the problem is environment
            configuration, a missing table, or a legacy schema artifact.
          </p>
        </div>
      </section>

      <div className="top-nav top-nav-inline">
        <Link href="/" className="secondary-button">
          Home
        </Link>
        <Link href="/chat" className="secondary-button">
          Customer Workspace
        </Link>
        <Link href="/admin" className="secondary-button">
          Admin Panel
        </Link>
      </div>

      {error && <section className="error-notice">{error}</section>}

      {!result ? (
        <div className="loading-card">Running setup check...</div>
      ) : (
        <section className="admin-grid">
          <section className="panel">
            <div className="panel-heading">
              <p className="eyebrow">Environment</p>
              <h2>Server-side configuration required for the support platform.</h2>
            </div>
            <div className="detail-list compact-list">
              <CheckRow label="SUPABASE_URL" value={result.env.supabaseUrl} />
              <CheckRow label="SUPABASE_SERVICE_ROLE_KEY" value={result.env.supabaseServiceRoleKey} />
              <CheckRow label="SUPABASE_ANON_KEY" value={result.env.supabaseAnonKey} />
              <CheckRow label="AUTH_SESSION_SECRET" value={result.env.authSessionSecret} />
              <CheckRow label="DEMO_CUSTOMER_EMAIL" value={result.env.demoCustomerEmail} />
              <CheckRow label="DEMO_CUSTOMER_PASSWORD" value={result.env.demoCustomerPassword} />
              <CheckRow label="DEMO_AGENT_EMAIL" value={result.env.demoAgentEmail} />
              <CheckRow label="DEMO_AGENT_PASSWORD" value={result.env.demoAgentPassword} />
              <CheckRow label="OPENAI_API_KEY" value={result.env.openAiKey} />
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <p className="eyebrow">Schema</p>
              <h2>Required tables and cleanup checks for the current support schema.</h2>
            </div>
            <div className="detail-list compact-list">
              <CheckRow label="customers table" value={result.schema.customers} />
              <CheckRow label="cases table" value={result.schema.cases} />
              <CheckRow label="collected_fields table" value={result.schema.collectedFields} />
              <CheckRow label="app_users table" value={result.schema.appUsers} />
              <CheckRow label="audit_logs table" value={result.schema.auditLogs} />
              <CheckRow label="RLS enabled on support tables" value={result.schema.rlsEnabled} />
              <CheckRow label="Legacy case_type removed" value={!result.schema.legacyCaseType} />
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <p className="eyebrow">Identity Foundation</p>
              <h2>Database identity mapping readiness for future RLS and user-scoped access.</h2>
            </div>
            <div className="detail-list compact-list">
              <CheckRow label="Identity foundation installed" value={result.identity.ready} />
              <CheckRow label="Any active app-user mappings" value={result.identity.anyActiveMappings} />
              <CheckRow label="Customer mappings present" value={result.identity.customerMappings} />
              <CheckRow label="Agent mappings present" value={result.identity.agentMappings} />
              <CheckRow label="User-scoped client prerequisites" value={result.identity.userScopedClientReady} />
              <CheckRow label="Demo sign-in env ready" value={result.identity.demoSignInEnvReady} />
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <p className="eyebrow">Result</p>
              <h2>{result.ready ? 'The workspace is ready to run.' : 'The workspace still needs setup fixes.'}</h2>
            </div>
            <div className="case-history-list">
              {(result.details.length ? result.details : ['No setup issues detected.']).map((detail) => (
                <article key={detail} className="case-history-card static-card">
                  <p>{detail}</p>
                </article>
              ))}
            </div>
          </section>
        </section>
      )}
    </main>
  );
}
