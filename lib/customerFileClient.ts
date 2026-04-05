import type { CustomerProfile, CustomerVisibleFile, WorkspaceErrorCode } from './types';

type WorkspaceAction = 'load' | 'save' | 'reset' | 'start-new' | 'load-case';

const WORKSPACE_REQUEST_TIMEOUT_MS = 8000;

export class WorkspaceClientError extends Error {
  code: WorkspaceErrorCode;
  detail?: string;

  constructor(message: string, code: WorkspaceErrorCode, detail?: string) {
    super(message);
    this.name = 'WorkspaceClientError';
    this.code = code;
    this.detail = detail;
  }
}

function getDefaultWorkspaceErrorMessage(code: WorkspaceErrorCode) {
  if (code === 'unauthorized') {
    return 'Please sign in before opening your support workspace.';
  }

  if (code === 'forbidden') {
    return 'This support workspace is only available for your signed-in customer account.';
  }

  if (code === 'schema_mismatch') {
    return 'This support workspace is not fully set up on the current environment yet. Run the latest support workspace migrations and then restart the dev server.';
  }

  if (code === 'identity_mapping_missing') {
    return 'This signed-in customer account is not fully connected to the support platform yet. Finish the customer identity mapping and try again.';
  }

  if (code === 'identity_mapping_inactive') {
    return 'This customer account is currently inactive for support access. Reactivate it and try again.';
  }

  if (code === 'identity_mapping_invalid') {
    return 'This customer session does not match a valid support access mapping. Check the linked customer setup and try again.';
  }

  if (code === 'supabase_access_token_missing') {
    return 'Your secure support session is missing from this request. Sign in again and try once more.';
  }

  if (code === 'supabase_access_token_invalid') {
    return 'Your secure support session has expired or is invalid. Sign in again and retry.';
  }

  if (code === 'supabase_user_mismatch') {
    return 'Your support session is out of sync. Sign in again so both secure sessions line up correctly.';
  }

  if (code === 'request_timeout') {
    return 'The support workspace took too long to respond. Refresh the page and try again.';
  }

  if (code === 'dev_server_unavailable') {
    return 'The local support app is not reachable right now. Start the dev server and try again.';
  }

  if (code === 'workspace_unavailable') {
    return 'We could not open the support workspace right now. Please try again in a moment.';
  }

  return 'We hit an unexpected workspace issue. Refresh the page and try again.';
}

async function parseErrorResponse(response: Response) {
  const responseClone = response.clone();

  try {
    const payload = (await response.json()) as {
      error?: string;
      errorCode?: WorkspaceErrorCode;
      detail?: string;
    };

    const code = payload.errorCode ?? 'workspace_unavailable';
    throw new WorkspaceClientError(
      payload.error || getDefaultWorkspaceErrorMessage(code),
      code,
      payload.detail
    );
  } catch (error) {
    if (error instanceof WorkspaceClientError) {
      throw error;
    }

    const message = await responseClone.text();
    throw new WorkspaceClientError(
      message || getDefaultWorkspaceErrorMessage('workspace_unavailable'),
      'workspace_unavailable'
    );
  }
}

async function callWorkspaceRoute<T>(action: WorkspaceAction, payload: Record<string, unknown>) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), WORKSPACE_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch('/api/support-workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
      signal: controller.signal
    });

    if (!response.ok) {
      await parseErrorResponse(response);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new WorkspaceClientError(
        getDefaultWorkspaceErrorMessage('request_timeout'),
        'request_timeout'
      );
    }

    if (error instanceof TypeError) {
      throw new WorkspaceClientError(
        getDefaultWorkspaceErrorMessage('dev_server_unavailable'),
        'dev_server_unavailable'
      );
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function getWorkspaceErrorMessage(error: unknown, fallbackMessage?: string) {
  if (error instanceof WorkspaceClientError) {
    return error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallbackMessage || getDefaultWorkspaceErrorMessage('unknown');
}

export async function loadCustomerWorkspace(profileUpdates?: Partial<CustomerProfile>) {
  return callWorkspaceRoute<{ file: CustomerVisibleFile; existed: boolean }>('load', {
    profileUpdates
  });
}

export async function saveCustomerWorkspace(file: CustomerVisibleFile) {
  return callWorkspaceRoute<{ file: CustomerVisibleFile }>('save', { file });
}

export async function resetCustomerWorkspace(profileUpdates?: Partial<CustomerProfile>) {
  return callWorkspaceRoute<{ file: CustomerVisibleFile }>('reset', {
    profileUpdates
  });
}

export async function startNewCustomerCase(profileUpdates?: Partial<CustomerProfile>) {
  return callWorkspaceRoute<{ file: CustomerVisibleFile }>('start-new', {
    profileUpdates
  });
}

export async function loadCustomerCase(caseId: string) {
  return callWorkspaceRoute<{ file: CustomerVisibleFile; existed: boolean }>('load-case', {
    caseId
  });
}
