import type {
  CaseFieldKey,
  CaseRecord,
  CollectedFields,
  CustomerDirectoryItem,
  CustomerProfile
} from './types';

export type PersistedCustomer = {
  id: string;
  profile: CustomerProfile;
};

export type PersistedCase = Omit<CaseRecord, 'collectedFields'> & {
  customerStorageId: string;
};

export type CreateCaseInput = Omit<PersistedCase, 'customerStorageId'> & {
  customerStorageId: string;
};

export type CaseListScope = 'hot' | 'all';

export interface SupportStorageAdapter {
  getCustomerByExternalId(customerId: string): Promise<PersistedCustomer | null>;
  getCustomerById(customerStorageId: string): Promise<PersistedCustomer | null>;
  createOrUpdateCustomer(profile: CustomerProfile): Promise<PersistedCustomer>;
  listCustomers(): Promise<CustomerDirectoryItem[]>;
  getOpenCaseForCustomer(customerStorageId: string): Promise<PersistedCase | null>;
  getCaseById(caseId: string): Promise<PersistedCase | null>;
  listCasesForCustomer(customerStorageId: string, scope?: CaseListScope): Promise<PersistedCase[]>;
  listOpenCases(): Promise<PersistedCase[]>;
  createCase(input: CreateCaseInput): Promise<PersistedCase>;
  updateCase(caseId: string, caseRecord: PersistedCase): Promise<PersistedCase>;
  getCollectedFields(caseId: string): Promise<CollectedFields>;
  upsertCollectedField(caseId: string, field: CaseFieldKey, value: string): Promise<void>;
  clearCollectedFields(caseId: string): Promise<void>;
  archiveOpenCasesForCustomer(customerStorageId: string): Promise<void>;
  archiveCase(caseId: string): Promise<PersistedCase | null>;
  deleteCustomerByExternalId(customerId: string): Promise<void>;
}
