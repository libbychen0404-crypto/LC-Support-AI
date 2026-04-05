'use client';

import { SupportBadge } from './SupportBadge';
import { StatusBadge } from './StatusBadge';
import { formatTime, getEscalationTone, getHandoffTone } from '@/lib/helpers';
import { getHandoffCustomerLabel } from '@/lib/caseStatus';
import type { CaseRecord } from '@/lib/types';

type CaseHistoryPanelProps = {
  cases: CaseRecord[];
  activeCaseId: string;
  onSelectCase: (caseId: string) => void;
};

export function CaseHistoryPanel({ cases, activeCaseId, onSelectCase }: CaseHistoryPanelProps) {
  const openCases = cases.filter((caseRecord) => caseRecord.isOpen);
  const closedCases = cases.filter((caseRecord) => !caseRecord.isOpen);

  return (
    <section className="panel">
      <div className="panel-heading">
        <p className="eyebrow">Case History</p>
        <h2>Browse the current ticket and the customer&apos;s past support cases.</h2>
        <p className="muted-copy">Cases are sorted by most recent update so unfinished work stays easy to resume.</p>
      </div>

      <div className="case-history-group">
        <div className="case-history-header">
          <strong>Open cases</strong>
          <span>{openCases.length}</span>
        </div>
        <div className="case-history-list">
          {openCases.length ? (
            openCases.map((caseRecord) => (
              <button
                key={caseRecord.caseId}
                className={`case-history-card ${caseRecord.caseId === activeCaseId ? 'case-history-active' : ''}`}
                onClick={() => onSelectCase(caseRecord.caseId)}
              >
                <div className="case-history-meta">
                  <strong>{caseRecord.issueType || 'Unclassified case'}</strong>
                  <StatusBadge status={caseRecord.status} />
                </div>
                <p>{caseRecord.summary}</p>
                <div className="case-history-badges">
                  <SupportBadge
                    label={caseRecord.escalationState === 'Escalated' ? 'Escalated Case' : 'Normal Priority'}
                    toneClassName={getEscalationTone(caseRecord.escalationState === 'Escalated')}
                  />
                  <SupportBadge
                    label={getHandoffCustomerLabel(caseRecord.handoffStatus)}
                    toneClassName={getHandoffTone(caseRecord.handoffStatus)}
                  />
                </div>
                <span>Updated {formatTime(caseRecord.updatedAt)}</span>
              </button>
            ))
          ) : (
            <p className="muted-copy">No open cases for this customer yet.</p>
          )}
        </div>
      </div>

      <div className="case-history-group">
        <div className="case-history-header">
          <strong>Closed cases</strong>
          <span>{closedCases.length}</span>
        </div>
        <div className="case-history-list">
          {closedCases.length ? (
            closedCases.map((caseRecord) => (
              <button
                key={caseRecord.caseId}
                className={`case-history-card ${caseRecord.caseId === activeCaseId ? 'case-history-active' : ''}`}
                onClick={() => onSelectCase(caseRecord.caseId)}
              >
                <div className="case-history-meta">
                  <strong>{caseRecord.issueType || 'Unclassified case'}</strong>
                  <StatusBadge status={caseRecord.status} />
                </div>
                <p>{caseRecord.resolutionNote || caseRecord.summary}</p>
                <div className="case-history-badges">
                  <SupportBadge
                    label={caseRecord.escalationState === 'Escalated' ? 'Escalated Case' : 'Normal Priority'}
                    toneClassName={getEscalationTone(caseRecord.escalationState === 'Escalated')}
                  />
                  <SupportBadge
                    label={getHandoffCustomerLabel(caseRecord.handoffStatus)}
                    toneClassName={getHandoffTone(caseRecord.handoffStatus)}
                  />
                </div>
                <span>Updated {formatTime(caseRecord.updatedAt)}</span>
              </button>
            ))
          ) : (
            <p className="muted-copy">Closed cases will appear here after they are resolved.</p>
          )}
        </div>
      </div>
    </section>
  );
}
