'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { StatusBadge } from '@/components/chat/StatusBadge';
import { SupportBadge } from '@/components/chat/SupportBadge';
import { submitHandoffRequest, getHandoffErrorMessage } from '@/lib/handoffClient';
import { loadCustomerCase } from '@/lib/customerFileClient';
import { toCustomerWorkflowCase } from '@/lib/serializers';
import { formatTime, getEscalationTone, getHandoffLabel, getHandoffTone } from '@/lib/helpers';
import { getSupportExpectation } from '@/lib/caseStatus';
import type { ContactMethod, CustomerVisibleFile } from '@/lib/types';

type HumanSupportWorkspaceProps = {
  caseId: string;
};

export function HumanSupportWorkspace({ caseId }: HumanSupportWorkspaceProps) {
  const [customerFile, setCustomerFile] = useState<CustomerVisibleFile | null>(null);
  const [preferredContactMethod, setPreferredContactMethod] = useState<ContactMethod>('Phone');
  const [callbackTimeWindow, setCallbackTimeWindow] = useState('Tomorrow 9am - 12pm');
  const [urgencyReason, setUrgencyReason] = useState('');
  const [additionalDetails, setAdditionalDetails] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const { file } = await loadCustomerCase(caseId);
        if (cancelled) return;
        setCustomerFile(file);
        setError('');
      } catch (nextError) {
        if (!cancelled) {
          console.error(nextError);
          setError(nextError instanceof Error ? nextError.message : 'Unable to load the human support handoff page right now.');
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [caseId]);

  async function handleSubmit() {
    if (!customerFile) return;
    if (!urgencyReason.trim()) {
      setError('Please tell us why you want human support so the specialist team can prioritise the case correctly.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await submitHandoffRequest({
        caseId,
        preferredContactMethod,
        callbackTimeWindow,
        urgencyReason: urgencyReason.trim(),
        additionalDetails: additionalDetails.trim()
      });

      setCustomerFile(result.file);
      setError('');
    } catch (nextError) {
      console.error(nextError);
      setError(getHandoffErrorMessage(nextError));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!customerFile) {
    return (
      <main className="chat-shell">
        <div className="loading-card">{error || 'Loading human support handoff...'}</div>
      </main>
    );
  }

  const activeCase = customerFile.activeCase;
  const handoffExists = activeCase.handoffStatus !== 'Not Requested';

  return (
    <main className="chat-shell">
      <section className="hero-banner">
        <div>
          <p className="eyebrow">Human Support Handoff</p>
          <h1>We&apos;ve captured your case so you won&apos;t need to repeat everything to the human support team.</h1>
          <p>
            Use this page when the issue needs closer review. The AI intake stays attached to the case, and a human
            support specialist continues from the recorded details.
          </p>
        </div>
      </section>

      <div className="top-nav top-nav-inline">
        <Link href="/chat" className="secondary-button">
          Back to Support Workspace
        </Link>
      </div>

      {error && <section className="error-notice">{error}</section>}

      <section className="admin-grid">
        <section className="panel">
          <div className="panel-heading">
            <p className="eyebrow">Current Case</p>
            <h2>What the human support team will receive.</h2>
          </div>

          <dl className="detail-list">
            <div>
              <dt>Customer</dt>
              <dd>{customerFile.profile.name || customerFile.profile.customerId}</dd>
            </div>
            <div>
              <dt>Case ID</dt>
              <dd>{activeCase.caseId}</dd>
            </div>
            <div>
              <dt>Issue type</dt>
              <dd>{activeCase.issueType || 'Not yet classified'}</dd>
            </div>
            <div>
              <dt>Workflow status</dt>
              <dd>
                <StatusBadge status={activeCase.status} />
              </dd>
            </div>
            <div>
              <dt>Escalation</dt>
              <dd>
                <SupportBadge
                  label={activeCase.escalationState === 'Escalated' ? 'Escalated Case' : 'Normal Priority'}
                  toneClassName={getEscalationTone(activeCase.escalationState === 'Escalated')}
                />
              </dd>
            </div>
            <div>
              <dt>Human support</dt>
              <dd>
                <SupportBadge label={getHandoffLabel(activeCase.handoffStatus)} toneClassName={getHandoffTone(activeCase.handoffStatus)} />
              </dd>
            </div>
            <div>
              <dt>Summary</dt>
              <dd>{activeCase.summary}</dd>
            </div>
            <div>
              <dt>Next step</dt>
              <dd>{activeCase.nextAction}</dd>
            </div>
          </dl>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <p className="eyebrow">Why Human Review</p>
            <h2>Explain what happens next in clear support language.</h2>
          </div>

          <div className="case-history-list">
            <article className="case-history-card static-card">
              <p>We&apos;ve captured your case details so you won&apos;t need to repeat everything to the human support team.</p>
            </article>
            <article className="case-history-card static-card">
              <p>{getSupportExpectation(toCustomerWorkflowCase(activeCase))}</p>
            </article>
            <article className="case-history-card static-card">
              <p>
                {activeCase.escalationState === 'Escalated'
                  ? 'This case has been flagged for priority handling because it needs extra attention.'
                  : 'A specialist can review technical or service issues that go beyond the AI-led intake flow.'}
              </p>
            </article>
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <p className="eyebrow">Request Human Support</p>
            <h2>{handoffExists ? 'Your human support request is already in progress.' : 'Submit a handoff to the human support team.'}</h2>
          </div>

          {handoffExists ? (
            <div className="detail-list compact-list">
              <div className="detail-list-row">
                <strong>Status</strong>
                <span>{getHandoffLabel(activeCase.handoffStatus)}</span>
              </div>
              <div className="detail-list-row">
                <strong>Requested at</strong>
                <span>{formatTime(activeCase.handoffRequestedAt)}</span>
              </div>
              <div className="detail-list-row">
                <strong>Contact method</strong>
                <span>{activeCase.handoffContactMethod || 'Not set'}</span>
              </div>
              <div className="detail-list-row">
                <strong>Callback window</strong>
                <span>{activeCase.handoffCallbackWindow || 'Not set'}</span>
              </div>
              <div className="detail-list-row">
                <strong>Urgency reason</strong>
                <span>{activeCase.handoffUrgencyReason || 'Not provided'}</span>
              </div>
              <div className="detail-list-row">
                <strong>Assigned specialist</strong>
                <span>{activeCase.assignedHumanAgent || 'Awaiting assignment'}</span>
              </div>
              <article className="case-history-card static-card">
                <p>{activeCase.customerUpdate || getSupportExpectation(toCustomerWorkflowCase(activeCase))}</p>
              </article>
            </div>
          ) : (
            <div className="form-grid">
              <label className="input-group">
                <span>Preferred contact method</span>
                <select value={preferredContactMethod} onChange={(event) => setPreferredContactMethod(event.target.value as ContactMethod)}>
                  <option value="Phone">Phone</option>
                  <option value="Email">Email</option>
                </select>
              </label>

              <label className="input-group">
                <span>Callback time window</span>
                <input value={callbackTimeWindow} onChange={(event) => setCallbackTimeWindow(event.target.value)} />
              </label>

              <label className="input-group">
                <span>Urgency reason</span>
                <textarea rows={4} value={urgencyReason} onChange={(event) => setUrgencyReason(event.target.value)} />
              </label>

              <label className="input-group">
                <span>Additional details</span>
                <textarea rows={4} value={additionalDetails} onChange={(event) => setAdditionalDetails(event.target.value)} />
              </label>

              <div className="button-row">
                <button className="primary-button" onClick={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting ? 'Submitting...' : 'Request Human Support'}
                </button>
              </div>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
