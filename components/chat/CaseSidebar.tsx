'use client';

import { FieldList } from './FieldList';
import { StatusBadge } from './StatusBadge';
import { SupportBadge } from './SupportBadge';
import {
  formatTime,
  getEscalationTone,
  getHandoffLabel,
  getHandoffTone,
  getStageLabel
} from '@/lib/helpers';
import { getSupportExpectation } from '@/lib/caseStatus';
import type { CaseRecord, CustomerProfile } from '@/lib/types';

type CaseSidebarProps = {
  customer: CustomerProfile;
  caseRecord: CaseRecord;
};

export function CaseSidebar({ customer, caseRecord }: CaseSidebarProps) {
  return (
    <div className="sidebar-stack">
      <section className="panel">
        <div className="panel-heading">
          <p className="eyebrow">Customer Profile</p>
          <h2>Saved customer memory for future visits.</h2>
        </div>

        <dl className="detail-list">
          <div>
            <dt>Customer ID</dt>
            <dd>{customer.customerId}</dd>
          </div>
          <div>
            <dt>Name</dt>
            <dd>{customer.name || 'Not provided'}</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>{customer.phone || 'Not provided'}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{customer.email || 'Not provided'}</dd>
          </div>
          <div>
            <dt>Last seen</dt>
            <dd>{formatTime(customer.lastSeenAt)}</dd>
          </div>
        </dl>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <p className="eyebrow">Case Overview</p>
          <h2>Current status, next step, and captured case details.</h2>
        </div>

        <dl className="detail-list">
          <div>
            <dt>Case ID</dt>
            <dd>{caseRecord.caseId}</dd>
          </div>
          <div>
            <dt>Issue type</dt>
            <dd>{caseRecord.issueType || 'Not yet classified'}</dd>
          </div>
          <div>
            <dt>Stage</dt>
            <dd>{getStageLabel(caseRecord.stage)}</dd>
          </div>
          <div>
            <dt>Workflow status</dt>
            <dd>
              <StatusBadge status={caseRecord.status} />
            </dd>
          </div>
          <div>
            <dt>Escalation</dt>
            <dd>
              <SupportBadge
                label={caseRecord.escalationState === 'Escalated' ? 'Escalated Case' : 'Normal Priority'}
                toneClassName={getEscalationTone(caseRecord.escalationState === 'Escalated')}
              />
            </dd>
          </div>
          <div>
            <dt>Human support</dt>
            <dd>
              <SupportBadge label={getHandoffLabel(caseRecord.handoffStatus)} toneClassName={getHandoffTone(caseRecord.handoffStatus)} />
            </dd>
          </div>
          <div>
            <dt>Priority</dt>
            <dd>{caseRecord.priority}</dd>
          </div>
          <div>
            <dt>Assigned to</dt>
            <dd>{caseRecord.assignedHumanAgent || 'Unassigned'}</dd>
          </div>
          <div>
            <dt>Expected update</dt>
            <dd>{caseRecord.etaOrExpectedUpdateTime ? formatTime(caseRecord.etaOrExpectedUpdateTime) : 'Not set'}</dd>
          </div>
          <div>
            <dt>Summary</dt>
            <dd>{caseRecord.summary}</dd>
          </div>
          <div>
            <dt>Next action</dt>
            <dd>{caseRecord.nextAction}</dd>
          </div>
          <div>
            <dt>What to expect</dt>
            <dd>{getSupportExpectation(caseRecord)}</dd>
          </div>
          <div>
            <dt>Customer update</dt>
            <dd>{caseRecord.customerUpdate || 'No progress update has been posted yet.'}</dd>
          </div>
          {caseRecord.handoffRequestedAt && (
            <div>
              <dt>Human request sent</dt>
              <dd>{formatTime(caseRecord.handoffRequestedAt)}</dd>
            </div>
          )}
          {caseRecord.handoffCallbackWindow && (
            <div>
              <dt>Callback window</dt>
              <dd>{caseRecord.handoffCallbackWindow}</dd>
            </div>
          )}
          {caseRecord.resolutionNote && (
            <div>
              <dt>Resolution note</dt>
              <dd>{caseRecord.resolutionNote}</dd>
            </div>
          )}
        </dl>

        <div className="sidebar-subsection">
          <h3>Collected Details</h3>
          <FieldList fields={caseRecord.collectedFields} />
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <p className="eyebrow">Case Timeline</p>
          <h2>A visible record of how the support case progressed.</h2>
        </div>

        <div className="timeline-list">
          {caseRecord.timeline
            .slice()
            .reverse()
            .map((item) => (
              <article key={item.id} className="timeline-item">
                <div className="timeline-dot" />
                <div>
                  <div className="timeline-meta">
                    <strong>{item.title}</strong>
                    <span>{formatTime(item.createdAt)}</span>
                  </div>
                  <p>{item.detail}</p>
                </div>
              </article>
            ))}
        </div>
      </section>
    </div>
  );
}
