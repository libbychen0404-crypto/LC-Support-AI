import type { CaseListScope, PersistedCase, PersistedCustomer, SupportStorageAdapter } from './storage';
import type { CollectedFields, CustomerDirectoryItem, CustomerProfile } from './types';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toCustomerDirectoryItem(
  customer: PersistedCustomer,
  customerCases: PersistedCase[]
): CustomerDirectoryItem {
  return {
    customerId: customer.profile.customerId,
    name: customer.profile.name,
    email: customer.profile.email,
    phone: customer.profile.phone,
    lastSeenAt: customer.profile.lastSeenAt,
    totalCases: customerCases.length,
    openCaseCount: customerCases.filter((caseRecord) => caseRecord.isOpen).length
  };
}

export function createInMemoryStorageAdapter(): SupportStorageAdapter {
  const customers = new Map<string, PersistedCustomer>();
  const customersByExternalId = new Map<string, string>();
  const cases = new Map<string, PersistedCase>();
  const collectedFields = new Map<string, CollectedFields>();

  return {
    async getCustomerByExternalId(customerId) {
      const storageId = customersByExternalId.get(customerId);
      if (!storageId) return null;
      const customer = customers.get(storageId);
      return customer ? clone(customer) : null;
    },

    async getCustomerById(customerStorageId) {
      const customer = customers.get(customerStorageId);
      return customer ? clone(customer) : null;
    },

    async createOrUpdateCustomer(profile) {
      const existingStorageId = customersByExternalId.get(profile.customerId);
      const id = existingStorageId ?? `cust-${profile.customerId}`;
      const customer: PersistedCustomer = {
        id,
        profile: clone({
          ...profile
        } satisfies CustomerProfile)
      };

      customers.set(id, customer);
      customersByExternalId.set(profile.customerId, id);
      return clone(customer);
    },

    async listCustomers() {
      return [...customers.values()]
        .map((customer) =>
          toCustomerDirectoryItem(
            customer,
            [...cases.values()].filter((caseRecord) => caseRecord.customerStorageId === customer.id)
          )
        )
        .sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt))
        .map((item) => clone(item));
    },

    async getOpenCaseForCustomer(customerStorageId) {
      const openCases = [...cases.values()]
        .filter((caseRecord) => caseRecord.customerStorageId === customerStorageId && caseRecord.isOpen)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

      return openCases[0] ? clone(openCases[0]) : null;
    },

    async listCasesForCustomer(customerStorageId, scope: CaseListScope = 'hot') {
      return [...cases.values()]
        .filter(
          (caseRecord) =>
            caseRecord.customerStorageId === customerStorageId &&
            (scope === 'all' || !caseRecord.archivedAt)
        )
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map((caseRecord) => clone(caseRecord));
    },

    async listOpenCases() {
      return [...cases.values()]
        .filter((caseRecord) => caseRecord.isOpen && !caseRecord.archivedAt)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map((caseRecord) => clone(caseRecord));
    },

    async getCaseById(caseId) {
      const caseRecord = cases.get(caseId);
      return caseRecord ? clone(caseRecord) : null;
    },

    async createCase(input) {
      const caseRecord: PersistedCase = {
        ...clone(input),
        archivedAt: input.archivedAt ?? null,
        isOpen: input.isOpen ?? true
      };

      cases.set(caseRecord.caseId, caseRecord);
      collectedFields.set(caseRecord.caseId, {});
      return clone(caseRecord);
    },

    async updateCase(caseId, caseRecord) {
      cases.set(caseId, clone(caseRecord));
      return clone(caseRecord);
    },

    async getCollectedFields(caseId) {
      return clone(collectedFields.get(caseId) ?? {});
    },

    async upsertCollectedField(caseId, field, value) {
      const fields = collectedFields.get(caseId) ?? {};
      fields[field] = value;
      collectedFields.set(caseId, fields);
    },

    async clearCollectedFields(caseId) {
      collectedFields.set(caseId, {});
    },

    async archiveOpenCasesForCustomer(customerStorageId) {
      for (const [caseId, caseRecord] of cases.entries()) {
        if (caseRecord.customerStorageId === customerStorageId && caseRecord.isOpen && !caseRecord.archivedAt) {
          cases.set(caseId, {
            ...caseRecord,
            isOpen: false,
            status: caseRecord.status === 'Closed' ? caseRecord.status : 'Closed'
          });
        }
      }
    },

    async archiveCase(caseId) {
      const caseRecord = cases.get(caseId);
      if (!caseRecord) return null;

      const archivedCase: PersistedCase = {
        ...caseRecord,
        archivedAt: new Date().toISOString()
      };

      cases.set(caseId, archivedCase);
      return clone(archivedCase);
    },

    async deleteCustomerByExternalId(customerId) {
      const storageId = customersByExternalId.get(customerId);
      if (!storageId) return;

      customers.delete(storageId);
      customersByExternalId.delete(customerId);

      for (const [caseId, caseRecord] of cases.entries()) {
        if (caseRecord.customerStorageId === storageId) {
          cases.delete(caseId);
          collectedFields.delete(caseId);
        }
      }
    }
  };
}
