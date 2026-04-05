'use client';

import { FieldList } from './FieldList';
import { StatusBadge } from './StatusBadge';
import type { CaseRecord, CustomerProfile } from '@/lib/types';

type ConfirmationCardProps = {
  customer: CustomerProfile;
  caseRecord: CaseRecord;
  onConfirm: () => void;
  onStartNew: () => void;
};

export function ConfirmationCard({
  customer,
  caseRecord,
  onConfirm,
  onStartNew
}: ConfirmationCardProps) {
  return (
    <section className="panel confirmation-panel">
      <div className="panel-heading">
        <p className="eyebrow">Case Confirmation Card</p>
        <h2>Review the draft before the case becomes active.</h2>
      </div>

      <div className="confirmation-grid">
        <div>
          <span>Customer name</span>
          <strong>{customer.name || 'Not provided'}</strong>
        </div>
        <div>
          <span>Customer ID</span>
          <strong>{customer.customerId}</strong>
        </div>
        <div>
          <span>Phone</span>
          <strong>{customer.phone || 'Not provided'}</strong>
        </div>
        <div>
          <span>Email</span>
          <strong>{customer.email || 'Not provided'}</strong>
        </div>
        <div>
          <span>Issue type</span>
          <strong>{caseRecord.issueType || 'Not classified yet'}</strong>
        </div>
        <div>
          <span>Suggested status</span>
          <StatusBadge status={caseRecord.status} />
        </div>
      </div>

      <div className="confirmation-block">
        <span>Problem statement</span>
        <p>{caseRecord.problemStatement || 'Not provided yet'}</p>
      </div>

      <div className="confirmation-block">
        <span>Structured details</span>
        <FieldList fields={caseRecord.collectedFields} />
      </div>

      <div className="confirmation-block">
        <span>What happens next</span>
        <p>{caseRecord.nextAction}</p>
      </div>

      <div className="button-row">
        <button className="primary-button" onClick={onConfirm}>
          Confirm This Case
        </button>
        <button className="secondary-button" onClick={onStartNew}>
          Start a New Case
        </button>
      </div>
    </section>
  );
}
