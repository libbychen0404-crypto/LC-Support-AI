import type { CaseRecord, CustomerFile, CustomerVisibleCaseRecord, CustomerVisibleFile } from './types';

export function toCustomerVisibleCaseRecord(caseRecord: CaseRecord): CustomerVisibleCaseRecord {
  const { internalNote: _internalNote, assignedTo: _assignedTo, caseNote: _caseNote, ...visibleCase } = caseRecord;
  return visibleCase;
}

export function toCustomerVisibleFile(file: CustomerFile): CustomerVisibleFile {
  return {
    profile: file.profile,
    activeCase: toCustomerVisibleCaseRecord(file.activeCase),
    cases: file.cases.map(toCustomerVisibleCaseRecord)
  };
}

export function toCustomerWorkflowCase(caseRecord: CustomerVisibleCaseRecord): CaseRecord {
  return {
    ...caseRecord,
    assignedTo: null,
    internalNote: '',
    caseNote: ''
  };
}
