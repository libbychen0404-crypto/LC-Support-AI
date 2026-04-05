'use client';

import { useEffect, useMemo, useState } from 'react';
import { AdminAuditTimeline } from '@/components/admin/AdminAuditTimeline';
import { StatusBadge } from '@/components/chat/StatusBadge';
import { SupportBadge } from '@/components/chat/SupportBadge';
import {
  archiveAdminCase,
  getAdminErrorMessage,
  loadAdminCaseAudit,
  loadAdminDashboard,
  takeOverAdminCase,
  updateAdminCase
} from '@/lib/adminClient';
import {
  CASE_PRIORITY_OPTIONS,
  CASE_STATUS_LABELS,
  HANDOFF_STATUS_LABELS,
  getSelectableStatusesForAdmin
} from '@/lib/caseStatus';
import { formatTime, getEscalationTone, getHandoffTone } from '@/lib/helpers';
import type { AdminAuditTimelineEvent, AdminCaseView, AdminDashboard, CaseStatus, EscalationState, HandoffStatus } from '@/lib/types';

const ESCALATION_OPTIONS: EscalationState[] = ['Normal', 'Escalated'];
const HANDOFF_OPTIONS: HandoffStatus[] = [
  'Not Requested',
  'Awaiting Human Review',
  'Human Assigned',
  'Under Human Review',
  'Completed'
];

export function AdminWorkspace() {
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [assignedHumanAgent, setAssignedHumanAgent] = useState('');
  const [priority, setPriority] = useState(CASE_PRIORITY_OPTIONS[1]);
  const [status, setStatus] = useState<CaseStatus>('Investigating');
  const [escalationState, setEscalationState] = useState<EscalationState>('Normal');
  const [handoffStatus, setHandoffStatus] = useState<HandoffStatus>('Not Requested');
  const [etaOrExpectedUpdateTime, setEtaOrExpectedUpdateTime] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [resolutionNote, setResolutionNote] = useState('');
  const [customerUpdate, setCustomerUpdate] = useState('');
  const [caseNote, setCaseNote] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [auditError, setAuditError] = useState('');
  const [auditEvents, setAuditEvents] = useState<AdminAuditTimelineEvent[]>([]);
  const [isAuditLoading, setIsAuditLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTakingOver, setIsTakingOver] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const nextDashboard = await loadAdminDashboard();
        if (cancelled) return;
        setDashboard(nextDashboard);
        if (nextDashboard.openCases[0]) {
          hydrateCaseForm(nextDashboard.openCases[0]);
        }
      } catch (nextError) {
        if (!cancelled) {
          console.error(nextError);
          setError(getAdminErrorMessage(nextError));
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedCase = useMemo<AdminCaseView | null>(
    () => dashboard?.openCases.find((caseRecord) => caseRecord.caseId === selectedCaseId) ?? null,
    [dashboard, selectedCaseId]
  );

  const selectableStatuses = useMemo(
    () => (selectedCase ? getSelectableStatusesForAdmin(selectedCase.status) : []),
    [selectedCase]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadTimeline() {
      if (!selectedCaseId) {
        setAuditEvents([]);
        setAuditError('');
        return;
      }

      setIsAuditLoading(true);
      try {
        const response = await loadAdminCaseAudit(selectedCaseId);
        if (cancelled) return;
        setAuditEvents(response.events);
        setAuditError('');
      } catch (nextError) {
        if (cancelled) return;
        console.error(nextError);
        setAuditEvents([]);
        setAuditError(getAdminErrorMessage(nextError));
      } finally {
        if (!cancelled) {
          setIsAuditLoading(false);
        }
      }
    }

    void loadTimeline();

    return () => {
      cancelled = true;
    };
  }, [selectedCaseId]);

  function hydrateCaseForm(caseRecord: AdminCaseView) {
    setSelectedCaseId(caseRecord.caseId);
    setAssignedTo(caseRecord.assignedTo || '');
    setAssignedHumanAgent(caseRecord.assignedHumanAgent || '');
    setPriority(caseRecord.priority);
    setStatus(caseRecord.status);
    setEscalationState(caseRecord.escalationState);
    setHandoffStatus(caseRecord.handoffStatus);
    setEtaOrExpectedUpdateTime(caseRecord.etaOrExpectedUpdateTime ? caseRecord.etaOrExpectedUpdateTime.slice(0, 16) : '');
    setInternalNote(caseRecord.internalNote);
    setResolutionNote(caseRecord.resolutionNote);
    setCustomerUpdate(caseRecord.customerUpdate);
    setCaseNote(caseRecord.caseNote);
  }

  async function refreshDashboard(preferredCaseId?: string) {
    const nextDashboard = await loadAdminDashboard();
    setDashboard(nextDashboard);

    const nextSelectedCase =
      nextDashboard.openCases.find((caseRecord) => caseRecord.caseId === (preferredCaseId || selectedCaseId)) ??
      nextDashboard.openCases[0] ??
      null;

    if (nextSelectedCase) {
      hydrateCaseForm(nextSelectedCase);
    } else {
      setSelectedCaseId('');
    }
  }

  async function handleSave() {
    if (!selectedCase) return;

    setIsSaving(true);
    try {
      await updateAdminCase({
        customerId: selectedCase.customerId,
        caseId: selectedCase.caseId,
        status,
        assignedTo: assignedTo.trim() || null,
        assignedHumanAgent: assignedHumanAgent.trim() || null,
        priority,
        etaOrExpectedUpdateTime: etaOrExpectedUpdateTime ? new Date(etaOrExpectedUpdateTime).toISOString() : null,
        internalNote,
        resolutionNote,
        customerUpdate,
        caseNote,
        escalationState,
        handoffStatus
      });

      await refreshDashboard(selectedCase.caseId);
      setError('');
      setNotice('');
    } catch (nextError) {
      console.error(nextError);
      setError(getAdminErrorMessage(nextError));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleTakeOver() {
    if (!selectedCase) return;

    setIsTakingOver(true);
    try {
      await takeOverAdminCase({
        customerId: selectedCase.customerId,
        caseId: selectedCase.caseId,
        agentName: assignedHumanAgent.trim() || assignedTo.trim() || 'Human Support Agent'
      });

      await refreshDashboard(selectedCase.caseId);
      setError('');
      setNotice('');
    } catch (nextError) {
      console.error(nextError);
      setError(getAdminErrorMessage(nextError));
    } finally {
      setIsTakingOver(false);
    }
  }

  async function handleArchive() {
    if (!selectedCase) return;

    setIsArchiving(true);
    try {
      await archiveAdminCase({
        customerId: selectedCase.customerId,
        caseId: selectedCase.caseId
      });

      await refreshDashboard();
      setError('');
      setNotice('Case archived. It has been removed from the active support queue, and its history has been preserved.');
    } catch (nextError) {
      console.error(nextError);
      setError(getAdminErrorMessage(nextError));
      setNotice('');
    } finally {
      setIsArchiving(false);
    }
  }

  const canArchiveSelectedCase =
    selectedCase?.status === 'Closed' && !selectedCase.isOpen && !selectedCase.archivedAt;

  return (
    <main className="chat-shell">
      <section className="hero-banner">
        <div>
          <p className="eyebrow">Admin Support Panel</p>
          <h1>Lightweight agent operations for case progression, escalation handling, and human takeover.</h1>
          <p>
            This admin view stays separate from the customer portal so support-only notes, escalation controls, and
            human handoff actions never leak into customer-facing screens.
          </p>
        </div>
      </section>

      {error && <section className="error-notice">{error}</section>}
      {notice && <section className="welcome-notice">{notice}</section>}

      {!dashboard ? (
        <div className="loading-card">Loading admin dashboard...</div>
      ) : (
        <section className="admin-grid">
          <section className="panel">
            <div className="panel-heading">
              <p className="eyebrow">Customers</p>
              <h2>Saved customers and their case counts.</h2>
            </div>

            <div className="case-history-list">
              {dashboard.customers.map((customer) => (
                <article key={customer.customerId} className="case-history-card static-card">
                  <div className="case-history-meta">
                    <strong>{customer.name || customer.customerId}</strong>
                    <span>{customer.openCaseCount} open</span>
                  </div>
                  <p>{customer.email || customer.phone || 'No contact details saved yet.'}</p>
                  <span>
                    {customer.totalCases} total cases · last seen {formatTime(customer.lastSeenAt)}
                  </span>
                </article>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <p className="eyebrow">Open Cases</p>
              <h2>Operational queue ordered by the latest update.</h2>
            </div>

            <div className="case-history-list">
              {dashboard.openCases.map((caseRecord) => (
                <button
                  key={caseRecord.caseId}
                  className={`case-history-card ${caseRecord.caseId === selectedCaseId ? 'case-history-active' : ''}`}
                  onClick={() => hydrateCaseForm(caseRecord)}
                >
                  <div className="case-history-meta">
                    <strong>{caseRecord.customerName || caseRecord.customerId}</strong>
                    <StatusBadge status={caseRecord.status} />
                  </div>
                  <p>
                    {caseRecord.issueType || 'Unclassified case'} · {caseRecord.summary}
                  </p>
                  <div className="case-history-badges">
                    <SupportBadge
                      label={caseRecord.escalationState === 'Escalated' ? 'Escalated Case' : 'Normal Priority'}
                      toneClassName={getEscalationTone(caseRecord.escalationState === 'Escalated')}
                    />
                    <SupportBadge
                      label={HANDOFF_STATUS_LABELS[caseRecord.handoffStatus]}
                      toneClassName={getHandoffTone(caseRecord.handoffStatus)}
                    />
                  </div>
                  <span>
                    {caseRecord.priority} priority · updated {formatTime(caseRecord.updatedAt)}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <p className="eyebrow">Case Operations</p>
              <h2>Modify support fields while keeping workflow transitions deterministic.</h2>
              <p className="muted-copy">Only valid next statuses are shown for the selected case.</p>
            </div>

            {selectedCase ? (
              <div className="form-grid">
                <div className="case-history-badges">
                  <StatusBadge status={selectedCase.status} />
                  <SupportBadge
                    label={selectedCase.escalationState === 'Escalated' ? 'Escalated Case' : 'Normal Priority'}
                    toneClassName={getEscalationTone(selectedCase.escalationState === 'Escalated')}
                  />
                  <SupportBadge
                    label={HANDOFF_STATUS_LABELS[selectedCase.handoffStatus]}
                    toneClassName={getHandoffTone(selectedCase.handoffStatus)}
                  />
                </div>

                <label className="input-group">
                  <span>Status</span>
                  <select
                    value={status}
                    disabled={selectableStatuses.length <= 1}
                    onChange={(event) => setStatus(event.target.value as CaseStatus)}
                  >
                    {selectableStatuses.map((option) => (
                      <option key={option} value={option}>
                        {CASE_STATUS_LABELS[option]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="input-group">
                  <span>Priority</span>
                  <select value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)}>
                    {CASE_PRIORITY_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="input-group">
                  <span>Escalation handling</span>
                  <select
                    value={escalationState}
                    onChange={(event) => setEscalationState(event.target.value as EscalationState)}
                  >
                    {ESCALATION_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="input-group">
                  <span>Human support status</span>
                  <select value={handoffStatus} onChange={(event) => setHandoffStatus(event.target.value as HandoffStatus)}>
                    {HANDOFF_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {HANDOFF_STATUS_LABELS[option]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="input-group">
                  <span>Assigned queue</span>
                  <input value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)} placeholder="Unassigned" />
                </label>

                <label className="input-group">
                  <span>Assigned human agent</span>
                  <input
                    value={assignedHumanAgent}
                    onChange={(event) => setAssignedHumanAgent(event.target.value)}
                    placeholder="Awaiting human assignment"
                  />
                </label>

                <label className="input-group">
                  <span>Expected update time</span>
                  <input
                    type="datetime-local"
                    value={etaOrExpectedUpdateTime}
                    onChange={(event) => setEtaOrExpectedUpdateTime(event.target.value)}
                  />
                </label>

                <label className="input-group">
                  <span>Internal note</span>
                  <textarea rows={4} value={internalNote} onChange={(event) => setInternalNote(event.target.value)} />
                </label>

                <label className="input-group">
                  <span>Case note</span>
                  <textarea rows={4} value={caseNote} onChange={(event) => setCaseNote(event.target.value)} />
                </label>

                <label className="input-group">
                  <span>Customer-facing update</span>
                  <textarea rows={4} value={customerUpdate} onChange={(event) => setCustomerUpdate(event.target.value)} />
                </label>

                <label className="input-group">
                  <span>Resolution note</span>
                  <textarea rows={4} value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} />
                </label>

                <div className="button-row">
                  <button className="primary-button" onClick={handleSave} disabled={isSaving}>
                    {isSaving ? 'Saving...' : 'Save Case Update'}
                  </button>
                  <button className="secondary-button" onClick={handleTakeOver} disabled={isTakingOver}>
                    {isTakingOver ? 'Assigning...' : 'Take Over Case'}
                  </button>
                  <button className="secondary-button" onClick={handleArchive} disabled={!canArchiveSelectedCase || isArchiving}>
                    {isArchiving ? 'Archiving...' : 'Archive Closed Case'}
                  </button>
                </div>
                <p className="muted-copy">
                  Closed cases can be archived to remove them from the active queue while keeping the full case history in storage.
                </p>
              </div>
            ) : (
              <p className="muted-copy">Select an open case to manage it.</p>
            )}
          </section>

          <section className="panel">
            <div className="panel-heading">
              <p className="eyebrow">Audit Timeline</p>
              <h2>Chronological case history for the selected support case.</h2>
              <p className="muted-copy">This view is admin-only and shows readable workflow events without raw audit JSON.</p>
            </div>

            {selectedCase ? (
              <AdminAuditTimeline events={auditEvents} isLoading={isAuditLoading} error={auditError} />
            ) : (
              <p className="muted-copy">Select an open case to inspect its audit history.</p>
            )}
          </section>
        </section>
      )}
    </main>
  );
}
