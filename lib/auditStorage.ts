import type { AuditActionSubtype, AuditActionType, AuditActorType, AuditLogRecord, AuditLogSource, AuditStructuredValue } from './types';

export type CreateAuditLogInput = {
  caseId: string | null;
  customerId: string | null;
  actorType: AuditActorType;
  actorId: string | null;
  actionType: AuditActionType;
  actionSubtype?: AuditActionSubtype | null;
  previousValue?: AuditStructuredValue | null;
  newValue?: AuditStructuredValue | null;
  metadata?: AuditStructuredValue | null;
  source: AuditLogSource;
  messageId?: string | null;
  timelineItemId?: string | null;
  requestId?: string | null;
  createdAt?: string;
};

export interface AuditStorageAdapter {
  appendAuditLog(input: CreateAuditLogInput): Promise<AuditLogRecord>;
}
