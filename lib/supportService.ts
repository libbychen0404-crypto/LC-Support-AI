import {
  applyAgentStatusUpdate,
  getDefaultEta,
  getSelectableStatusesForAdmin,
  isAllowedStatusTransition
} from './caseStatus';
import type { AuditLogger } from './auditLogger';
import { AuthError, requireAgentAuthContext, resolveAuthorizedCustomerId } from './auth';
import {
  assignHumanAgent,
  createFreshCase,
  requestHumanHandoff,
  synchronizeDerivedCaseState
} from './caseLogic';
import { nowIso } from './helpers';
import type { CreateCaseInput, PersistedCase, PersistedCustomer, SupportStorageAdapter } from './storage';
import type {
  AdminDashboard,
  AdminCaseView,
  AuthContext,
  CaseRecord,
  CollectedFields,
  CustomerFile,
  CustomerProfile,
  CaseStatus,
  EscalationState,
  HandoffRequestInput,
  HandoffStatus
} from './types';

export class HandoffReadinessError extends Error {
  constructor(
    message = 'We need a little more information about the issue before we can hand this case to a support agent.',
    readonly code: 'handoff_context_required' = 'handoff_context_required'
  ) {
    super(message);
    this.name = 'HandoffReadinessError';
  }
}

export class ArchiveEligibilityError extends Error {
  constructor(
    message = 'Only closed cases can be archived. Close the case before moving it out of the active queue.',
    readonly code: 'archive_not_allowed' = 'archive_not_allowed'
  ) {
    super(message);
    this.name = 'ArchiveEligibilityError';
  }
}

const MIN_HANDOFF_PROBLEM_STATEMENT_LENGTH = 12;

function sanitizeProfile(customerId: string, profileUpdates?: Partial<CustomerProfile>): CustomerProfile {
  return {
    customerId,
    name: profileUpdates?.name ?? '',
    phone: profileUpdates?.phone ?? '',
    email: profileUpdates?.email ?? '',
    lastSeenAt: nowIso()
  };
}

function toCreateCaseInput(customerStorageId: string, caseRecord: CaseRecord): CreateCaseInput {
  return {
    customerStorageId,
    ...caseRecord
  };
}

async function hydrateCase(
  storage: SupportStorageAdapter,
  persistedCase: PersistedCase,
  profile?: CustomerProfile
): Promise<CaseRecord> {
  const collectedFields = await storage.getCollectedFields(persistedCase.caseId);

  const caseRecord: CaseRecord = {
    caseId: persistedCase.caseId,
    issueType: persistedCase.issueType,
    status: persistedCase.status,
    stage: persistedCase.stage,
    escalationState: persistedCase.escalationState,
    handoffStatus: persistedCase.handoffStatus,
    assignedHumanAgent: persistedCase.assignedHumanAgent,
    handoffRequestedAt: persistedCase.handoffRequestedAt,
    handoffContactMethod: persistedCase.handoffContactMethod,
    handoffCallbackWindow: persistedCase.handoffCallbackWindow,
    handoffUrgencyReason: persistedCase.handoffUrgencyReason,
    handoffAdditionalDetails: persistedCase.handoffAdditionalDetails,
    priority: persistedCase.priority,
    assignedTo: persistedCase.assignedTo,
    etaOrExpectedUpdateTime: persistedCase.etaOrExpectedUpdateTime,
    internalNote: persistedCase.internalNote,
    resolutionNote: persistedCase.resolutionNote,
    caseNote: persistedCase.caseNote,
    customerUpdate: persistedCase.customerUpdate,
    problemStatement: persistedCase.problemStatement,
    summary: persistedCase.summary,
    nextAction: persistedCase.nextAction,
    confirmed: persistedCase.confirmed,
    requiredFields: persistedCase.requiredFields,
    pendingField: persistedCase.pendingField,
    collectedFields,
    createdAt: persistedCase.createdAt,
    updatedAt: persistedCase.updatedAt,
    archivedAt: persistedCase.archivedAt ?? null,
    messages: persistedCase.messages,
    timeline: persistedCase.timeline,
    isOpen: persistedCase.isOpen
  };

  return profile ? synchronizeDerivedCaseState(profile, caseRecord) : caseRecord;
}

async function hydrateCustomerFile(
  storage: SupportStorageAdapter,
  customer: PersistedCustomer,
  activeCase: PersistedCase
): Promise<CustomerFile> {
  const cases = await Promise.all(
    (await storage.listCasesForCustomer(customer.id)).map((caseRecord) => hydrateCase(storage, caseRecord, customer.profile))
  );

  const activeCaseRecord =
    cases.find((caseRecord) => caseRecord.caseId === activeCase.caseId) ??
    (await hydrateCase(storage, activeCase, customer.profile));

  return {
    profile: customer.profile,
    activeCase: activeCaseRecord,
    cases
  };
}

type SupportServiceOptions = {
  auditLogger?: AuditLogger;
};

async function runAuditSideEffect(operationName: string, callback: () => Promise<void>) {
  try {
    await callback();
  } catch (error) {
    console.error(`audit side effect failed during ${operationName}:`, error);
  }
}

function getChangedCollectedFields(
  previousCollectedFields: CollectedFields,
  nextCollectedFields: CollectedFields
) {
  return (Object.keys(nextCollectedFields) as (keyof CollectedFields)[])
    .filter((field) => {
      const nextValue = nextCollectedFields[field]?.trim();
      if (!nextValue) return false;
      return (previousCollectedFields[field] ?? null) !== nextCollectedFields[field];
    })
    .map((field) => ({
      field,
      previousValue: previousCollectedFields[field] ?? null,
      newValue: nextCollectedFields[field] ?? null
    }));
}

async function emitCaseCreatedAuditEvent(
  auditLogger: AuditLogger | undefined,
  customer: PersistedCustomer,
  caseRecord: CaseRecord
) {
  if (!auditLogger) return;

  await auditLogger.logCaseCreated({
    caseId: caseRecord.caseId,
    customerId: customer.id,
    source: 'customer_workspace',
    newValue: {
      status: caseRecord.status,
      stage: caseRecord.stage,
      priority: caseRecord.priority,
      issueType: caseRecord.issueType,
      confirmed: caseRecord.confirmed
    },
    metadata: {
      externalCustomerId: customer.profile.customerId
    }
  });
}

async function emitCustomerWorkspaceAuditEvents(input: {
  auditLogger?: AuditLogger;
  authContext: AuthContext;
  customer: PersistedCustomer;
  previousCase: CaseRecord | null;
  nextCase: CaseRecord;
}) {
  const { auditLogger, authContext, customer, previousCase, nextCase } = input;
  if (!auditLogger || authContext.role !== 'customer') return;

  const previousMessages = previousCase?.messages ?? [];
  const nextMessages = nextCase.messages.slice(previousMessages.length);
  const newCustomerMessages = nextMessages.filter((message) => message.sender === 'customer');

  for (const message of newCustomerMessages) {
    await auditLogger.logCustomerMessage({
      caseId: nextCase.caseId,
      customerId: customer.id,
      actorId: authContext.userId,
      messageId: message.id,
      source: 'customer_workspace',
      metadata: {
        stage: nextCase.stage
      }
    });
  }

  const changedFields = getChangedCollectedFields(previousCase?.collectedFields ?? {}, nextCase.collectedFields);

  for (const changedField of changedFields) {
    await auditLogger.logFieldCollection({
      caseId: nextCase.caseId,
      customerId: customer.id,
      actorId: authContext.userId,
      fieldKey: changedField.field,
      previousValue: changedField.previousValue,
      newValue: changedField.newValue,
      source: 'customer_workspace'
    });
  }

  if (previousCase && !previousCase.confirmed && nextCase.confirmed) {
    await auditLogger.logCustomerCaseConfirmed({
      caseId: nextCase.caseId,
      customerId: customer.id,
      actorId: authContext.userId,
      source: 'customer_workspace',
      previousValue: {
        confirmed: previousCase.confirmed,
        status: previousCase.status,
        stage: previousCase.stage
      },
      newValue: {
        confirmed: nextCase.confirmed,
        status: nextCase.status,
        stage: nextCase.stage
      }
    });
  }

  if (
    previousCase &&
    previousCase.stage === 'case_confirmation' &&
    !previousCase.confirmed &&
    nextCase.stage === 'information_collection' &&
    !nextCase.confirmed
  ) {
    await auditLogger.logCustomerCaseCorrectionRequested({
      caseId: nextCase.caseId,
      customerId: customer.id,
      actorId: authContext.userId,
      source: 'customer_workspace',
      previousValue: {
        stage: previousCase.stage,
        pendingField: previousCase.pendingField
      },
      newValue: {
        stage: nextCase.stage,
        pendingField: nextCase.pendingField
      }
    });
  }
}

function normalizeOptionalText(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : '';
}

function hasMeaningfulProblemStatement(problemStatement: string | null | undefined) {
  return normalizeOptionalText(problemStatement).length >= MIN_HANDOFF_PROBLEM_STATEMENT_LENGTH;
}

function isCaseReadyForHumanHandoff(caseRecord: CaseRecord) {
  return hasMeaningfulProblemStatement(caseRecord.problemStatement) && caseRecord.issueType !== null;
}

async function emitAdminWorkspaceAuditEvents(input: {
  auditLogger?: AuditLogger;
  authContext: AuthContext;
  customer: PersistedCustomer;
  previousCase: CaseRecord;
  nextCase: CaseRecord;
  action: 'update' | 'take-over';
  agentName: string | null;
}) {
  const { auditLogger, authContext, customer, previousCase, nextCase, action, agentName } = input;
  if (!auditLogger || authContext.role !== 'agent') return;

  const actorId = authContext.userId;
  const commonInput = {
    caseId: nextCase.caseId,
    customerId: customer.id,
    actorId,
    source: 'admin_panel' as const
  };

  if (action === 'take-over') {
    await auditLogger.logAgentTakeover({
      ...commonInput,
      previousValue: {
        assignedHumanAgent: previousCase.assignedHumanAgent,
        handoffStatus: previousCase.handoffStatus
      },
      newValue: {
        assignedHumanAgent: nextCase.assignedHumanAgent,
        handoffStatus: nextCase.handoffStatus
      },
      metadata: {
        agentName
      }
    });
  }

  if (
    previousCase.assignedTo !== nextCase.assignedTo ||
    previousCase.assignedHumanAgent !== nextCase.assignedHumanAgent
  ) {
    await auditLogger.logAgentAssignment({
      ...commonInput,
      previousValue: {
        assignedTo: previousCase.assignedTo,
        assignedHumanAgent: previousCase.assignedHumanAgent
      },
      newValue: {
        assignedTo: nextCase.assignedTo,
        assignedHumanAgent: nextCase.assignedHumanAgent
      },
      metadata: {
        agentName
      }
    });
  }

  if (previousCase.status !== nextCase.status) {
    await auditLogger.logStatusChange({
      ...commonInput,
      actorType: 'agent',
      actionType: 'agent_status_changed',
      previousValue: {
        status: previousCase.status,
        stage: previousCase.stage
      },
      newValue: {
        status: nextCase.status,
        stage: nextCase.stage
      },
      metadata: {
        agentName
      }
    });
  }

  if (previousCase.priority !== nextCase.priority) {
    await auditLogger.logPriorityChange({
      ...commonInput,
      previousValue: {
        priority: previousCase.priority
      },
      newValue: {
        priority: nextCase.priority
      },
      metadata: {
        agentName
      }
    });
  }

  const previousInternalNote = normalizeOptionalText(previousCase.internalNote);
  const nextInternalNote = normalizeOptionalText(nextCase.internalNote);
  if (previousInternalNote !== nextInternalNote) {
    const notePayload = {
      ...commonInput,
      previousValue: previousInternalNote ? { internalNote: previousInternalNote } : null,
      newValue: nextInternalNote ? { internalNote: nextInternalNote } : null,
      metadata: {
        agentName
      }
    };

    if (!previousInternalNote && nextInternalNote) {
      await auditLogger.logInternalNoteAdded(notePayload);
    } else if (previousInternalNote && nextInternalNote) {
      await auditLogger.logInternalNoteUpdated(notePayload);
    }
  }

  const previousResolutionNote = normalizeOptionalText(previousCase.resolutionNote);
  const nextResolutionNote = normalizeOptionalText(nextCase.resolutionNote);
  if (!previousResolutionNote && nextResolutionNote) {
    await auditLogger.logResolutionNoteAdded({
      ...commonInput,
      previousValue: null,
      newValue: {
        resolutionNote: nextResolutionNote
      },
      metadata: {
        agentName
      }
    });
  }

  const previousCustomerUpdate = normalizeOptionalText(previousCase.customerUpdate);
  const nextCustomerUpdate = normalizeOptionalText(nextCase.customerUpdate);
  if (previousCustomerUpdate !== nextCustomerUpdate) {
    await auditLogger.logCustomerUpdateChanged({
      ...commonInput,
      previousValue: previousCustomerUpdate ? { customerUpdate: previousCustomerUpdate } : null,
      newValue: nextCustomerUpdate ? { customerUpdate: nextCustomerUpdate } : null,
      metadata: {
        agentName
      }
    });
  }

  if (previousCase.handoffStatus !== nextCase.handoffStatus) {
    await auditLogger.logHandoffStatusChanged({
      ...commonInput,
      previousValue: {
        handoffStatus: previousCase.handoffStatus
      },
      newValue: {
        handoffStatus: nextCase.handoffStatus
      },
      metadata: {
        agentName
      }
    });
  }

  if (previousCase.escalationState !== nextCase.escalationState) {
    await auditLogger.logEscalationChanged({
      ...commonInput,
      previousValue: {
        escalationState: previousCase.escalationState
      },
      newValue: {
        escalationState: nextCase.escalationState
      },
      metadata: {
        agentName
      }
    });
  }
}

async function emitSystemTransitionAuditEvents(input: {
  auditLogger?: AuditLogger;
  customer: PersistedCustomer;
  previousCase: CaseRecord | null;
  nextCase: CaseRecord;
}) {
  const { auditLogger, customer, previousCase, nextCase } = input;
  if (!auditLogger || !previousCase) return;

  const commonInput = {
    caseId: nextCase.caseId,
    customerId: customer.id
  };

  if (previousCase.issueType !== nextCase.issueType && nextCase.issueType) {
    await auditLogger.logSystemClassification({
      ...commonInput,
      source: 'system',
      previousValue: {
        issueType: previousCase.issueType
      },
      newValue: {
        issueType: nextCase.issueType
      }
    });
  }

  if (previousCase.stage !== nextCase.stage) {
    await auditLogger.logSystemStageTransition({
      ...commonInput,
      source: 'system',
      previousValue: {
        stage: previousCase.stage
      },
      newValue: {
        stage: nextCase.stage
      }
    });
  }

  if (previousCase.status !== nextCase.status) {
    await auditLogger.logStatusChange({
      ...commonInput,
      actorType: 'system',
      actionType: 'system_status_transitioned',
      source: 'system',
      previousValue: {
        status: previousCase.status
      },
      newValue: {
        status: nextCase.status
      }
    });
  }

  if (normalizeOptionalText(previousCase.summary) !== normalizeOptionalText(nextCase.summary)) {
    await auditLogger.logSystemSummaryUpdate({
      ...commonInput,
      source: 'system',
      previousValue: previousCase.summary ? { summary: previousCase.summary } : null,
      newValue: nextCase.summary ? { summary: nextCase.summary } : null
    });
  }

  if (normalizeOptionalText(previousCase.nextAction) !== normalizeOptionalText(nextCase.nextAction)) {
    await auditLogger.logSystemNextActionUpdate({
      ...commonInput,
      source: 'system',
      previousValue: previousCase.nextAction ? { nextAction: previousCase.nextAction } : null,
      newValue: nextCase.nextAction ? { nextAction: nextCase.nextAction } : null
    });
  }

  if (normalizeOptionalText(previousCase.caseNote) !== normalizeOptionalText(nextCase.caseNote) && normalizeOptionalText(nextCase.caseNote)) {
    await auditLogger.logSystemCaseNoteGenerated({
      ...commonInput,
      source: 'ai',
      previousValue: previousCase.caseNote ? { caseNote: previousCase.caseNote } : null,
      newValue: { caseNote: nextCase.caseNote }
    });
  }
}

export function createSupportService(storage: SupportStorageAdapter, options: SupportServiceOptions = {}) {
  const auditLogger = options.auditLogger;

  async function getCustomerByAuthorizedContext(authContext: AuthContext, requestedCustomerId?: string | null) {
    const authorizedCustomerId = resolveAuthorizedCustomerId(authContext, requestedCustomerId);
    const customer = await storage.getCustomerByExternalId(authorizedCustomerId);

    if (!customer) {
      return {
        customer: null,
        customerId: authorizedCustomerId
      };
    }

    return {
      customer,
      customerId: authorizedCustomerId
    };
  }

  async function saveCustomerWorkspaceInternal(file: CustomerFile) {
    const customer = await storage.createOrUpdateCustomer({
      ...file.profile,
      lastSeenAt: nowIso()
    });

    const existingCase = await storage.getCaseById(file.activeCase.caseId);
    const synchronizedCase = synchronizeDerivedCaseState(file.profile, file.activeCase);
    const persistedCase: PersistedCase = {
      ...synchronizedCase,
      customerStorageId: customer.id
    };

    let storedCase: PersistedCase;

    if (existingCase) {
      storedCase = await storage.updateCase(file.activeCase.caseId, persistedCase);
    } else {
      await storage.archiveOpenCasesForCustomer(customer.id);
      storedCase = await storage.createCase(toCreateCaseInput(customer.id, synchronizedCase));
    }

    const collectedEntries = Object.entries(synchronizedCase.collectedFields) as [keyof CollectedFields, string | undefined][];

    for (const [field, value] of collectedEntries) {
      if (value && value.trim() !== '') {
        // Customer field collection is additive in the current workflow, so
        // we upsert the latest non-empty values instead of clearing the whole
        // case field set first. This keeps user-scoped RLS writes simple while
        // still allowing the customer conversation to progress normally.
        await storage.upsertCollectedField(storedCase.caseId, field, value);
      }
    }

    return hydrateCustomerFile(storage, customer, storedCase);
  }

  async function saveCaseForExistingCustomer(customer: PersistedCustomer, file: CustomerFile) {
    const existingCase = await storage.getCaseById(file.activeCase.caseId);
    const synchronizedCase = synchronizeDerivedCaseState(file.profile, file.activeCase);
    const persistedCase: PersistedCase = {
      ...synchronizedCase,
      customerStorageId: customer.id
    };

    let storedCase: PersistedCase;

    if (existingCase) {
      storedCase = await storage.updateCase(file.activeCase.caseId, persistedCase);
    } else {
      await storage.archiveOpenCasesForCustomer(customer.id);
      storedCase = await storage.createCase(toCreateCaseInput(customer.id, synchronizedCase));
    }

    const collectedEntries = Object.entries(synchronizedCase.collectedFields) as [keyof CollectedFields, string | undefined][];

    for (const [field, value] of collectedEntries) {
      if (value && value.trim() !== '') {
        await storage.upsertCollectedField(storedCase.caseId, field, value);
      }
    }

    return hydrateCustomerFile(storage, customer, storedCase);
  }

  async function loadCustomerCaseInternal(customerId: string, caseId: string) {
    const customer = await storage.getCustomerByExternalId(customerId);
    if (!customer) {
      throw new Error('Customer not found.');
    }

    const caseRecord = await storage.getCaseById(caseId);
    if (!caseRecord || caseRecord.customerStorageId !== customer.id) {
      throw new Error('Case not found for this customer.');
    }

    return {
      file: await hydrateCustomerFile(storage, customer, caseRecord),
      existed: true
    };
  }

  async function loadOwnedCustomerCase(authContext: AuthContext, caseId: string, requestedCustomerId?: string) {
    const authorizedCustomerId = resolveAuthorizedCustomerId(authContext, requestedCustomerId);

    try {
      return await loadCustomerCaseInternal(authorizedCustomerId, caseId);
    } catch (error) {
      if (error instanceof Error && error.message === 'Case not found for this customer.') {
        throw new AuthError('You are not allowed to access this case.', 403, 'forbidden');
      }

      throw error;
    }
  }

  async function loadCustomerWorkspace(
    authContext: AuthContext,
    profileUpdates?: Partial<CustomerProfile>,
    requestedCustomerId?: string
  ) {
    const { customer: existingCustomer, customerId } = await getCustomerByAuthorizedContext(authContext, requestedCustomerId);
    const profile = {
      ...(existingCustomer?.profile ?? sanitizeProfile(customerId)),
      ...profileUpdates,
      customerId,
      lastSeenAt: nowIso()
    };

    const customer = await storage.createOrUpdateCustomer(profile);
    let openCase = await storage.getOpenCaseForCustomer(customer.id);

    if (!openCase) {
      const freshCase = synchronizeDerivedCaseState(customer.profile, createFreshCase());
      openCase = await storage.createCase(toCreateCaseInput(customer.id, freshCase));
      await runAuditSideEffect('loadCustomerWorkspace.case_created', async () => {
        await emitCaseCreatedAuditEvent(auditLogger, customer, freshCase);
      });
    }

    return {
      file: await hydrateCustomerFile(storage, customer, openCase),
      existed: Boolean(existingCustomer)
    };
  }

  async function saveCustomerWorkspace(file: CustomerFile, authContext: AuthContext) {
    const authorizedCustomerId = resolveAuthorizedCustomerId(authContext, file.profile.customerId);

    const nextFile: CustomerFile = {
      ...file,
      profile: {
        ...file.profile,
        customerId: authorizedCustomerId
      }
    };

    const customer = await storage.getCustomerByExternalId(authorizedCustomerId);
    let previousCase: CaseRecord | null = null;
    if (customer) {
      const existingCase = await storage.getCaseById(file.activeCase.caseId);
      if (existingCase && existingCase.customerStorageId !== customer.id) {
        throw new AuthError('You are not allowed to modify this case.', 403, 'forbidden');
      }

      if (existingCase) {
        previousCase = await hydrateCase(storage, existingCase, customer.profile);
      }
    }

    const savedFile = await saveCustomerWorkspaceInternal(nextFile);

    if (customer) {
      await runAuditSideEffect('saveCustomerWorkspace.customer_flow', async () => {
        await emitCustomerWorkspaceAuditEvents({
          auditLogger,
          authContext,
          customer,
          previousCase,
          nextCase: savedFile.activeCase
        });
      });

      await runAuditSideEffect('saveCustomerWorkspace.system_flow', async () => {
        await emitSystemTransitionAuditEvents({
          auditLogger,
          customer,
          previousCase,
          nextCase: savedFile.activeCase
        });
      });
    }

    return savedFile;
  }

  async function startNewCase(
    authContext: AuthContext,
    profileUpdates?: Partial<CustomerProfile>,
    requestedCustomerId?: string
  ) {
    const { customer: existingCustomer, customerId } = await getCustomerByAuthorizedContext(authContext, requestedCustomerId);
    const customer = await storage.createOrUpdateCustomer({
      ...(existingCustomer?.profile ?? sanitizeProfile(customerId)),
      ...profileUpdates,
      customerId,
      lastSeenAt: nowIso()
    });

    await storage.archiveOpenCasesForCustomer(customer.id);

    const freshCase = synchronizeDerivedCaseState(customer.profile, createFreshCase());

    const storedCase = await storage.createCase(toCreateCaseInput(customer.id, freshCase));
    await runAuditSideEffect('startNewCase.case_created', async () => {
      await emitCaseCreatedAuditEvent(auditLogger, customer, freshCase);
    });

    return hydrateCustomerFile(storage, customer, storedCase);
  }

  async function resetCustomerWorkspace(
    authContext: AuthContext,
    profileUpdates?: Partial<CustomerProfile>,
    requestedCustomerId?: string
  ) {
    return {
      file: await startNewCase(authContext, profileUpdates, requestedCustomerId),
      existed: true
    };
  }

  async function loadCustomerCase(caseId: string, authContext: AuthContext, requestedCustomerId?: string) {
    return loadOwnedCustomerCase(authContext, caseId, requestedCustomerId);
  }

  async function loadAdminDashboard(authContext: AuthContext): Promise<AdminDashboard> {
    requireAgentAuthContext(authContext);

    const [customers, openCases] = await Promise.all([storage.listCustomers(), storage.listOpenCases()]);

    const hydratedOpenCases = await Promise.all(
      openCases.map(async (caseRecord) => {
        const matchedCustomer = await storage.getCustomerById(caseRecord.customerStorageId);
        const hydrated = await hydrateCase(storage, caseRecord, matchedCustomer?.profile);

        const adminView: AdminCaseView = {
          ...hydrated,
          customerId: matchedCustomer?.profile.customerId ?? caseRecord.customerStorageId,
          customerName: matchedCustomer?.profile.name ?? ''
        };

        return adminView;
      })
    );

    return {
      customers,
      openCases: hydratedOpenCases
    };
  }

  async function updateCaseOperations(input: {
    customerId: string;
    caseId: string;
    status?: CaseStatus;
    assignedTo?: string | null;
    priority?: CaseRecord['priority'];
    etaOrExpectedUpdateTime?: string | null;
    internalNote?: string;
    resolutionNote?: string;
    customerUpdate?: string;
    caseNote?: string;
    escalationState?: EscalationState;
    handoffStatus?: HandoffStatus;
    assignedHumanAgent?: string | null;
    authContext: AuthContext;
  }) {
    requireAgentAuthContext(input.authContext);

    const customer = await storage.getCustomerByExternalId(input.customerId);
    if (!customer) throw new Error('Customer not found.');

    const existingCase = await storage.getCaseById(input.caseId);
    if (!existingCase || existingCase.customerStorageId !== customer.id) {
      throw new Error('Case not found for this customer.');
    }

    let hydratedCase = await hydrateCase(storage, existingCase, customer.profile);
    const previousCase = hydratedCase;

    if (input.status && input.status !== hydratedCase.status) {
      if (!isAllowedStatusTransition(hydratedCase.status, input.status)) {
        throw new Error(`Status cannot move from ${hydratedCase.status} to ${input.status}.`);
      }

      hydratedCase = applyAgentStatusUpdate(hydratedCase, input.status);
    }

    const updatedCase: CaseRecord = {
      ...hydratedCase,
      assignedTo: input.assignedTo !== undefined ? input.assignedTo : hydratedCase.assignedTo,
      priority: input.priority ?? hydratedCase.priority,
      etaOrExpectedUpdateTime:
        input.etaOrExpectedUpdateTime ?? hydratedCase.etaOrExpectedUpdateTime ?? getDefaultEta(hydratedCase.issueType),
      internalNote: input.internalNote ?? hydratedCase.internalNote,
      resolutionNote: input.resolutionNote ?? hydratedCase.resolutionNote,
      customerUpdate: input.customerUpdate ?? hydratedCase.customerUpdate,
      caseNote: input.caseNote ?? hydratedCase.caseNote,
      escalationState: input.escalationState ?? hydratedCase.escalationState,
      handoffStatus: input.handoffStatus ?? hydratedCase.handoffStatus,
      assignedHumanAgent:
        input.assignedHumanAgent !== undefined ? input.assignedHumanAgent : hydratedCase.assignedHumanAgent,
      updatedAt: nowIso()
    };

    if (updatedCase.status === 'Resolved' && !updatedCase.resolutionNote) {
      updatedCase.resolutionNote = 'Resolved by support agent.';
    }

    const synchronizedUpdatedCase = synchronizeDerivedCaseState(customer.profile, updatedCase);

    const savedFile = await saveCaseForExistingCustomer(customer, {
      profile: customer.profile,
      activeCase: synchronizedUpdatedCase,
      cases: []
    });

    await runAuditSideEffect('updateCaseOperations.admin_flow', async () => {
      await emitAdminWorkspaceAuditEvents({
        auditLogger,
        authContext: input.authContext,
        customer,
        previousCase,
        nextCase: savedFile.activeCase,
        action: 'update',
        agentName: input.authContext.agentName
      });
    });

    await runAuditSideEffect('updateCaseOperations.system_flow', async () => {
      await emitSystemTransitionAuditEvents({
        auditLogger,
        customer,
        previousCase,
        nextCase: savedFile.activeCase
      });
    });

    return { file: savedFile, existed: true };
  }

  async function submitHandoffRequest(input: {
    caseId: string;
    handoff: HandoffRequestInput;
    authContext: AuthContext;
    requestedCustomerId?: string;
  }) {
    const authorizedCustomerId = resolveAuthorizedCustomerId(input.authContext, input.requestedCustomerId);
    const { file } = await loadOwnedCustomerCase(input.authContext, input.caseId, authorizedCustomerId);
    const customer = await storage.getCustomerByExternalId(authorizedCustomerId);

    if (file.activeCase.handoffStatus !== 'Not Requested') {
      return { file, existed: true };
    }

    if (!isCaseReadyForHumanHandoff(file.activeCase)) {
      throw new HandoffReadinessError(
        'We need a little more information about the issue before we can hand this case to a support agent. Please describe what is going wrong so we can capture the case details first.'
      );
    }

    const updatedCase = synchronizeDerivedCaseState(file.profile, requestHumanHandoff(file.activeCase, input.handoff));

    const savedFile = await saveCustomerWorkspaceInternal({
      profile: file.profile,
      activeCase: updatedCase,
      cases: file.cases
    });

    const customerActorId = input.authContext.role === 'customer' ? input.authContext.userId : null;

    if (auditLogger && customerActorId) {
      await runAuditSideEffect('submitHandoffRequest.customer_handoff_requested', async () => {
        await auditLogger.logHandoffRequest({
          caseId: savedFile.activeCase.caseId,
          customerId: customer?.id ?? null,
          actorId: customerActorId,
          source: 'customer_workspace',
          previousValue: {
            handoffStatus: file.activeCase.handoffStatus,
            escalationState: file.activeCase.escalationState
          },
          newValue: {
            handoffStatus: savedFile.activeCase.handoffStatus,
            escalationState: savedFile.activeCase.escalationState
          },
          metadata: {
            preferredContactMethod: input.handoff.preferredContactMethod,
            callbackTimeWindow: input.handoff.callbackTimeWindow
          }
        });
      });

      await runAuditSideEffect('submitHandoffRequest.system_handoff_state_initialized', async () => {
        await auditLogger.logSystemHandoffStateInitialized({
          caseId: savedFile.activeCase.caseId,
          customerId: customer?.id ?? null,
          source: 'system',
          previousValue: {
            handoffStatus: file.activeCase.handoffStatus,
            escalationState: file.activeCase.escalationState
          },
          newValue: {
            handoffStatus: savedFile.activeCase.handoffStatus,
            escalationState: savedFile.activeCase.escalationState
          },
          metadata: {
            preferredContactMethod: input.handoff.preferredContactMethod,
            callbackTimeWindow: input.handoff.callbackTimeWindow
          }
        });
      });
    }

    if (customer) {
      await runAuditSideEffect('submitHandoffRequest.system_flow', async () => {
        await emitSystemTransitionAuditEvents({
          auditLogger,
          customer,
          previousCase: file.activeCase,
          nextCase: savedFile.activeCase
        });
      });
    }

    return { file: savedFile, existed: true };
  }

  async function takeOverCase(input: {
    customerId: string;
    caseId: string;
    agentName: string;
    authContext: AuthContext;
  }) {
    requireAgentAuthContext(input.authContext);
    const customer = await storage.getCustomerByExternalId(input.customerId);
    if (!customer) throw new Error('Customer not found.');

    const caseRecord = await storage.getCaseById(input.caseId);
    if (!caseRecord || caseRecord.customerStorageId !== customer.id) {
      throw new Error('Case not found for this customer.');
    }

    const hydratedCase = await hydrateCase(storage, caseRecord, customer.profile);
    const updatedCase = synchronizeDerivedCaseState(customer.profile, assignHumanAgent(hydratedCase, input.agentName));

    const savedFile = await saveCaseForExistingCustomer(customer, {
      profile: customer.profile,
      activeCase: updatedCase,
      cases: []
    });

    await runAuditSideEffect('takeOverCase.admin_flow', async () => {
      await emitAdminWorkspaceAuditEvents({
        auditLogger,
        authContext: input.authContext,
        customer,
        previousCase: hydratedCase,
        nextCase: savedFile.activeCase,
        action: 'take-over',
        agentName: input.agentName
      });
    });

    await runAuditSideEffect('takeOverCase.system_flow', async () => {
      await emitSystemTransitionAuditEvents({
        auditLogger,
        customer,
        previousCase: hydratedCase,
        nextCase: savedFile.activeCase
      });
    });

    return { file: savedFile, existed: true };
  }

  async function archiveCase(input: {
    customerId: string;
    caseId: string;
    authContext: AuthContext;
  }) {
    requireAgentAuthContext(input.authContext);

    const customer = await storage.getCustomerByExternalId(input.customerId);
    if (!customer) throw new Error('Customer not found.');

    const caseRecord = await storage.getCaseById(input.caseId);
    if (!caseRecord || caseRecord.customerStorageId !== customer.id) {
      throw new Error('Case not found for this customer.');
    }

    const hydratedCase = await hydrateCase(storage, caseRecord, customer.profile);

    if (hydratedCase.archivedAt) {
      throw new ArchiveEligibilityError(
        'This case has already been archived and is no longer part of the active support queue.'
      );
    }

    if (hydratedCase.status !== 'Closed' || hydratedCase.isOpen) {
      throw new ArchiveEligibilityError(
        'Only closed cases can be archived. Close the case before moving it out of the active queue.'
      );
    }

    const archivedCase = await storage.archiveCase(input.caseId);
    if (!archivedCase) {
      throw new Error('Case could not be archived.');
    }

    return {
      file: await hydrateCustomerFile(storage, customer, archivedCase),
      existed: true
    };
  }

  return {
    loadCustomerWorkspace,
    saveCustomerWorkspace,
    startNewCase,
    resetCustomerWorkspace,
    loadCustomerCase,
    loadAdminDashboard,
    updateCaseOperations,
    submitHandoffRequest,
    takeOverCase,
    archiveCase,
    getSelectableStatusesForAdmin
  };
}
