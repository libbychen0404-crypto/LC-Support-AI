import type { ContactMethod, CustomerVisibleFile, WorkspaceErrorCode } from './types';

class HandoffClientError extends Error {
  code: WorkspaceErrorCode;
  detail?: string;

  constructor(message: string, code: WorkspaceErrorCode, detail?: string) {
    super(message);
    this.name = 'HandoffClientError';
    this.code = code;
    this.detail = detail;
  }
}

async function parseHandoffError(response: Response) {
  const clone = response.clone();

  try {
    const payload = (await response.json()) as {
      error?: string;
      errorCode?: WorkspaceErrorCode;
      detail?: string;
    };

    throw new HandoffClientError(
      payload.error || 'We could not send the human support request right now.',
      payload.errorCode || 'workspace_unavailable',
      payload.detail
    );
  } catch (error) {
    if (error instanceof HandoffClientError) {
      throw error;
    }

    const message = await clone.text();
    throw new HandoffClientError(message || 'We could not send the human support request right now.', 'workspace_unavailable');
  }
}

export function getHandoffErrorMessage(error: unknown) {
  if (error instanceof HandoffClientError) return error.message;
  if (error instanceof Error) return error.message;
  return 'We could not send the human support request right now.';
}

export async function submitHandoffRequest(input: {
  caseId: string;
  preferredContactMethod: ContactMethod;
  callbackTimeWindow: string;
  urgencyReason: string;
  additionalDetails: string;
}) {
  const response = await fetch('/api/handoff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    await parseHandoffError(response);
  }

  return (await response.json()) as { file: CustomerVisibleFile; existed: boolean };
}
