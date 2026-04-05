import type {
  AdminDashboard,
  AdminAuditTimelineResponse,
  CasePriority,
  CaseStatus,
  CustomerFile,
  EscalationState,
  HandoffStatus,
  SetupCheckResult,
  WorkspaceErrorCode
} from './types';

class AdminClientError extends Error {
  code: WorkspaceErrorCode;
  detail?: string;

  constructor(message: string, code: WorkspaceErrorCode, detail?: string) {
    super(message);
    this.name = 'AdminClientError';
    this.code = code;
    this.detail = detail;
  }
}

async function parseAdminError(response: Response) {
  const clone = response.clone();

  try {
    const payload = (await response.json()) as {
      error?: string;
      errorCode?: WorkspaceErrorCode;
      detail?: string;
    };

    throw new AdminClientError(
      payload.error || 'We could not load the admin support dashboard right now.',
      payload.errorCode || 'workspace_unavailable',
      payload.detail
    );
  } catch (error) {
    if (error instanceof AdminClientError) {
      throw error;
    }

    const message = await clone.text();
    throw new AdminClientError(message || 'We could not load the admin support dashboard right now.', 'workspace_unavailable');
  }
}

export function getAdminErrorMessage(error: unknown) {
  if (error instanceof AdminClientError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'We could not load the admin support dashboard right now.';
}

export async function loadAdminDashboard() {
  const response = await fetch('/api/admin-support');
  if (!response.ok) {
    await parseAdminError(response);
  }

  return (await response.json()) as AdminDashboard;
}

export async function loadAdminCaseAudit(caseId: string) {
  const response = await fetch(`/api/admin-support/audit?caseId=${encodeURIComponent(caseId)}`);
  if (!response.ok) {
    await parseAdminError(response);
  }

  return (await response.json()) as AdminAuditTimelineResponse;
}

export async function updateAdminCase(input: {
  customerId: string;
  caseId: string;
  status?: CaseStatus;
  assignedTo?: string | null;
  assignedHumanAgent?: string | null;
  priority?: CasePriority;
  etaOrExpectedUpdateTime?: string | null;
  internalNote?: string;
  resolutionNote?: string;
  customerUpdate?: string;
  caseNote?: string;
  escalationState?: EscalationState;
  handoffStatus?: HandoffStatus;
}) {
  const response = await fetch('/api/admin-support', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    await parseAdminError(response);
  }

  return (await response.json()) as { file: CustomerFile; existed: boolean };
}

export async function takeOverAdminCase(input: {
  customerId: string;
  caseId: string;
  agentName: string;
}) {
  const response = await fetch('/api/admin-support', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerId: input.customerId,
      caseId: input.caseId,
      action: 'take-over',
      agentName: input.agentName
    })
  });

  if (!response.ok) {
    await parseAdminError(response);
  }

  return (await response.json()) as { file: CustomerFile; existed: boolean };
}

export async function archiveAdminCase(input: {
  customerId: string;
  caseId: string;
}) {
  const response = await fetch('/api/admin-support', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerId: input.customerId,
      caseId: input.caseId,
      action: 'archive'
    })
  });

  if (!response.ok) {
    await parseAdminError(response);
  }

  return (await response.json()) as { file: CustomerFile; existed: boolean };
}

export async function loadSetupCheck() {
  const response = await fetch('/api/setup-check');
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { details?: string[] };
    throw new Error(payload.details?.[0] || 'Unable to run the setup check right now.');
  }

  return (await response.json()) as SetupCheckResult;
}
