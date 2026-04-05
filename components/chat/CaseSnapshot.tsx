'use client';

import Link from 'next/link';
import { StatusBadge } from './StatusBadge';
import { SupportBadge } from './SupportBadge';
import {
  formatTime,
  getCaseHeadline,
  getEscalationTone,
  getHandoffLabel,
  getHandoffTone,
  getStageLabel
} from '@/lib/helpers';
import type { CaseRecord } from '@/lib/types';

type CaseSnapshotProps = {
  caseRecord: CaseRecord;
  humanSupportHref?: string;
};

export function CaseSnapshot({ caseRecord, humanSupportHref }: CaseSnapshotProps) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <p className="eyebrow">Current Case Snapshot</p>
        <h2>{getCaseHeadline(caseRecord)}</h2>
      </div>

      <div className="snapshot-grid">
        <div className="snapshot-card">
          <span>Stage</span>
          <strong>{getStageLabel(caseRecord.stage)}</strong>
        </div>

        <div className="snapshot-card">
          <span>Workflow status</span>
          <StatusBadge status={caseRecord.status} />
        </div>

        <div className="snapshot-card">
          <span>Escalation</span>
          <SupportBadge
            label={caseRecord.escalationState === 'Escalated' ? 'Escalated Case' : 'Normal Priority'}
            toneClassName={getEscalationTone(caseRecord.escalationState === 'Escalated')}
          />
        </div>

        <div className="snapshot-card">
          <span>Human support</span>
          <SupportBadge
            label={getHandoffLabel(caseRecord.handoffStatus)}
            toneClassName={getHandoffTone(caseRecord.handoffStatus)}
          />
        </div>

        <div className="snapshot-card snapshot-wide">
          <span>Next action</span>
          <strong>{caseRecord.nextAction}</strong>
        </div>

        <div className="snapshot-card">
          <span>Priority</span>
          <strong>{caseRecord.priority}</strong>
        </div>

        <div className="snapshot-card">
          <span>Assigned to</span>
          <strong>{caseRecord.assignedHumanAgent || 'Unassigned'}</strong>
        </div>

        <div className="snapshot-card">
          <span>Expected update</span>
          <strong>{caseRecord.etaOrExpectedUpdateTime ? formatTime(caseRecord.etaOrExpectedUpdateTime) : 'Not set'}</strong>
        </div>

        <div className="snapshot-card">
          <span>Portal update</span>
          <strong>{caseRecord.customerUpdate || 'No customer-facing update has been posted yet.'}</strong>
        </div>
      </div>

      {humanSupportHref && caseRecord.handoffStatus === 'Not Requested' && (
        <div className="button-row inline-actions">
          <Link href={humanSupportHref} className="secondary-button">
            Request Human Support
          </Link>
        </div>
      )}
    </section>
  );
}
