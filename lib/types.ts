export type Sender = 'customer' | 'ai' | 'agent';

export type AuthRole = 'customer' | 'agent';
export type SupabaseClientPrivilege = 'service-role' | 'user-scoped';

export type AppUserRecord = {
  authUserId: string;
  role: AuthRole;
  customerStorageId: string | null;
  agentLabel: string | null;
  isActive: boolean;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ResolvedCustomerAppIdentity = {
  kind: 'customer';
  authContext: CustomerAuthContext;
  appUser: AppUserRecord & {
    role: 'customer';
    customerStorageId: string;
  };
  customerStorageId: string;
};

export type ResolvedAgentAppIdentity = {
  kind: 'agent';
  authContext: AgentAuthContext;
  appUser: AppUserRecord & {
    role: 'agent';
  };
};

export type ResolvedAppIdentity = ResolvedCustomerAppIdentity | ResolvedAgentAppIdentity;

export type AuthSessionPayload = {
  version: 1;
  sessionId: string;
  userId: string;
  role: AuthRole;
  customerId?: string;
  agentId?: string;
  agentName?: string;
  issuedAt: string;
  expiresAt: string;
};

export type AnonymousAuthContext = {
  isAuthenticated: false;
  role: 'anonymous';
  sessionId: null;
  userId: null;
  customerId: null;
  agentId: null;
  agentName: null;
};

export type CustomerAuthContext = {
  isAuthenticated: true;
  role: 'customer';
  sessionId: string;
  userId: string;
  customerId: string;
  agentId: null;
  agentName: null;
};

export type AgentAuthContext = {
  isAuthenticated: true;
  role: 'agent';
  sessionId: string;
  userId: string;
  customerId: null;
  agentId: string;
  agentName: string;
};

export type AuthContext = AnonymousAuthContext | CustomerAuthContext | AgentAuthContext;

export type ConversationStage =
  | 'greeting'
  | 'issue_discovery'
  | 'information_collection'
  | 'case_confirmation'
  | 'case_processing'
  | 'follow_up'
  | 'resolved';

export type CaseStatus =
  | 'New'
  | 'Investigating'
  | 'Waiting on Customer'
  | 'Pending Technician'
  | 'Provisioning Check'
  | 'Replacement Review'
  | 'Pending Follow-up'
  | 'Resolved'
  | 'Closed';

export type EscalationState = 'Normal' | 'Escalated';

export type HandoffStatus =
  | 'Not Requested'
  | 'Awaiting Human Review'
  | 'Human Assigned'
  | 'Under Human Review'
  | 'Completed';

export type ContactMethod = 'Phone' | 'Email';

export type CasePriority = 'Low' | 'Medium' | 'High' | 'Urgent';

export type IssueType = 'Router Activation' | 'Router Repair';

export type AuditActorType = 'customer' | 'agent' | 'system';
export type AuditLogSource = 'customer_workspace' | 'admin_panel' | 'system' | 'ai';
export type AuditActionSubtype =
  | 'status'
  | 'priority'
  | 'handoff'
  | 'message'
  | 'field_collection'
  | 'classification'
  | 'summary'
  | 'next_action'
  | 'escalation'
  | 'resolution'
  | 'assignment'
  | 'internal_note'
  | 'customer_update'
  | 'case_note'
  | 'stage';

export type AuditActionType =
  | 'case_created'
  | 'case_status_changed'
  | 'case_resolved'
  | 'case_closed'
  | 'customer_message_sent'
  | 'customer_field_collected'
  | 'customer_case_confirmed'
  | 'customer_case_correction_requested'
  | 'customer_handoff_requested'
  | 'agent_case_assigned'
  | 'agent_case_taken_over'
  | 'agent_message_sent'
  | 'agent_status_changed'
  | 'agent_priority_changed'
  | 'agent_internal_note_added'
  | 'agent_internal_note_updated'
  | 'agent_resolution_note_added'
  | 'agent_customer_update_changed'
  | 'agent_handoff_status_changed'
  | 'agent_escalation_changed'
  | 'system_case_classified'
  | 'system_stage_transitioned'
  | 'system_status_transitioned'
  | 'system_summary_updated'
  | 'system_next_action_updated'
  | 'system_ai_case_note_generated'
  | 'system_handoff_state_initialized';

export type AuditStructuredValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: AuditStructuredValue }
  | AuditStructuredValue[];

export type AuditLogRecord = {
  id: string;
  caseId: string | null;
  customerId: string | null;
  actorType: AuditActorType;
  actorId: string | null;
  actionType: AuditActionType;
  actionSubtype: AuditActionSubtype | null;
  previousValue: AuditStructuredValue | null;
  newValue: AuditStructuredValue | null;
  metadata: AuditStructuredValue | null;
  source: AuditLogSource;
  messageId: string | null;
  timelineItemId: string | null;
  requestId: string | null;
  createdAt: string;
};

export type AdminAuditTimelineEvent = {
  id: string;
  caseId: string | null;
  actorType: AuditActorType;
  actorLabel: string;
  actionType: AuditActionType;
  actionLabel: string;
  description: string;
  createdAt: string;
};

export type AdminAuditTimelineResponse = {
  caseId: string;
  events: AdminAuditTimelineEvent[];
};

export type Message = {
  id: string;
  sender: Sender;
  text: string;
  createdAt: string;
  agentLabel?: string | null;
};

export type TimelineItem = {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
};

export type CustomerProfile = {
  customerId: string;
  name: string;
  phone: string;
  email: string;
  lastSeenAt: string;
};

export type CollectedFields = {
  routerModel?: string;
  serialNumber?: string;
  orderNumber?: string;
  activationDate?: string;
  issueStartDate?: string;
  hasRedLight?: string;
  restartTried?: string;
  errorDescription?: string;
};

export type CaseFieldKey = keyof CollectedFields;

export type HandoffRequestInput = {
  preferredContactMethod: ContactMethod;
  callbackTimeWindow: string;
  additionalDetails: string;
  urgencyReason: string;
};

export type CaseRecord = {
  caseId: string;
  issueType: IssueType | null;
  status: CaseStatus;
  stage: ConversationStage;
  escalationState: EscalationState;
  handoffStatus: HandoffStatus;
  assignedHumanAgent: string | null;
  handoffRequestedAt: string | null;
  handoffContactMethod: ContactMethod | null;
  handoffCallbackWindow: string;
  handoffUrgencyReason: string;
  handoffAdditionalDetails: string;
  priority: CasePriority;
  assignedTo: string | null;
  etaOrExpectedUpdateTime: string | null;
  internalNote: string;
  resolutionNote: string;
  caseNote: string;
  customerUpdate: string;
  problemStatement: string;
  summary: string;
  nextAction: string;
  confirmed: boolean;
  requiredFields: CaseFieldKey[];
  pendingField: CaseFieldKey | null;
  collectedFields: CollectedFields;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
  messages: Message[];
  timeline: TimelineItem[];
  isOpen: boolean;
};

export type CustomerFile = {
  profile: CustomerProfile;
  activeCase: CaseRecord;
  cases: CaseRecord[];
};

export type CustomerVisibleCaseRecord = Omit<
  CaseRecord,
  'internalNote' | 'assignedTo' | 'caseNote'
> & {
  assignedHumanAgent: string | null;
};

export type CustomerVisibleFile = {
  profile: CustomerProfile;
  activeCase: CustomerVisibleCaseRecord;
  cases: CustomerVisibleCaseRecord[];
};

export type WorkspaceErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'archive_not_allowed'
  | 'handoff_context_required'
  | 'schema_mismatch'
  | 'request_timeout'
  | 'dev_server_unavailable'
  | 'workspace_unavailable'
  | 'env_missing'
  | 'identity_mapping_missing'
  | 'identity_mapping_inactive'
  | 'identity_mapping_invalid'
  | 'supabase_access_token_missing'
  | 'supabase_access_token_invalid'
  | 'supabase_user_mismatch'
  | 'unknown';

export type CaseListItem = Pick<
  CaseRecord,
  | 'caseId'
  | 'issueType'
  | 'status'
  | 'stage'
  | 'priority'
  | 'assignedTo'
  | 'summary'
  | 'updatedAt'
  | 'isOpen'
  | 'customerUpdate'
  | 'escalationState'
  | 'handoffStatus'
  | 'assignedHumanAgent'
>;

export type CustomerDirectoryItem = {
  customerId: string;
  name: string;
  email: string;
  phone: string;
  lastSeenAt: string;
  totalCases: number;
  openCaseCount: number;
};

export type AdminCaseView = CaseRecord & {
  customerId: string;
  customerName: string;
};

export type AdminDashboard = {
  customers: CustomerDirectoryItem[];
  openCases: AdminCaseView[];
};

export type AIActionType =
  | 'ask_issue'
  | 'collect_field'
  | 'retry_field'
  | 'review_confirmation'
  | 'remind_confirmation'
  | 'case_update'
  | 'progress_update'
  | 'case_summary'
  | 'compress_note';

export type AIReplyPayload = {
  actionType: AIActionType;
  customerName: string;
  customerId: string;
  issueType: string;
  stage: ConversationStage;
  status: CaseStatus;
  escalationState: EscalationState;
  handoffStatus: HandoffStatus;
  priority: CasePriority;
  assignedTo: string | null;
  assignedHumanAgent: string | null;
  etaOrExpectedUpdateTime: string | null;
  internalNote: string;
  resolutionNote: string;
  problemStatement: string;
  summary: string;
  nextAction: string;
  pendingFieldLabel: string | null;
  collectedFields: Record<string, string>;
  latestCustomerMessage: string;
  recentMessages: { sender: Sender; text: string; agentLabel?: string | null }[];
};

export type AICaseInsightsPayload = {
  customerName: string;
  customerId: string;
  issueType: string;
  stage: ConversationStage;
  status: CaseStatus;
  escalationState: EscalationState;
  handoffStatus: HandoffStatus;
  priority: CasePriority;
  assignedTo: string | null;
  assignedHumanAgent: string | null;
  etaOrExpectedUpdateTime: string | null;
  problemStatement: string;
  summary: string;
  nextAction: string;
  resolutionNote: string;
  internalNote: string;
  collectedFields: Record<string, string>;
  recentMessages: { sender: Sender; text: string; agentLabel?: string | null }[];
};

export type AICaseInsights = {
  summary: string;
  caseNote: string;
  customerUpdate: string;
};

export type SendMessageResult = {
  updatedCase: CaseRecord;
  actionType: AIActionType;
};

export type ReturnSummary = {
  title: string;
  detail: string;
};

export type SetupCheckResult = {
  env: {
    supabaseUrl: boolean;
    supabaseServiceRoleKey: boolean;
    supabaseAnonKey: boolean;
    openAiKey: boolean;
    authSessionSecret: boolean;
    demoCustomerEmail: boolean;
    demoCustomerPassword: boolean;
    demoAgentEmail: boolean;
    demoAgentPassword: boolean;
  };
  schema: {
    customers: boolean;
    cases: boolean;
    collectedFields: boolean;
    appUsers: boolean;
    auditLogs: boolean;
    rlsEnabled: boolean;
    legacyCaseType: boolean;
  };
  identity: {
    ready: boolean;
    anyActiveMappings: boolean;
    customerMappings: boolean;
    agentMappings: boolean;
    userScopedClientReady: boolean;
    demoSignInEnvReady: boolean;
  };
  ready: boolean;
  details: string[];
  advisories: string[];
};
