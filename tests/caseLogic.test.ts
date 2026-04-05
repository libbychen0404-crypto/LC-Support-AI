import { describe, expect, it } from 'vitest';
import {
  classifyIssueType,
  confirmCase,
  createFreshCase,
  processCustomerMessage
} from '../lib/caseLogic';

describe('caseLogic workflow', () => {
  it('keeps an ambiguous first message in issue_discovery', () => {
    const initialCase = createFreshCase();
    const { updatedCase, actionType } = processCustomerMessage(initialCase, 'I need some help please');

    expect(updatedCase.stage).toBe('issue_discovery');
    expect(updatedCase.issueType).toBeNull();
    expect(actionType).toBe('ask_issue');
  });

  it('classifies an explicit router repair message correctly', () => {
    expect(classifyIssueType('My router has a red light and is not working')).toBe('Router Repair');
  });

  it('classifies an explicit router activation message correctly', () => {
    expect(classifyIssueType('I need to activate my router and setup is not complete')).toBe('Router Activation');
  });

  it('advances collected fields in the expected order for router repair', () => {
    let activeCase = processCustomerMessage(createFreshCase(), 'My router has a red light and is not working').updatedCase;

    expect(activeCase.pendingField).toBe('routerModel');

    activeCase = processCustomerMessage(activeCase, 'LC Router 9000').updatedCase;
    expect(activeCase.pendingField).toBe('serialNumber');

    activeCase = processCustomerMessage(activeCase, 'SN-001').updatedCase;
    expect(activeCase.pendingField).toBe('issueStartDate');

    activeCase = processCustomerMessage(activeCase, '2026-03-30').updatedCase;
    expect(activeCase.pendingField).toBe('hasRedLight');
  });

  it('does not accept an unknown router model answer as a valid structured field', () => {
    let activeCase = processCustomerMessage(createFreshCase(), 'My router has a red light and is not working').updatedCase;

    expect(activeCase.pendingField).toBe('routerModel');

    activeCase = processCustomerMessage(activeCase, 'I do not know the model right now.').updatedCase;

    expect(activeCase.pendingField).toBe('routerModel');
    expect(activeCase.collectedFields.routerModel).toBeUndefined();

    activeCase = processCustomerMessage(activeCase, 'LC Router 9000').updatedCase;

    expect(activeCase.collectedFields.routerModel).toBe('LC Router 9000');
    expect(activeCase.pendingField).toBe('serialNumber');
  });

  it('accepts natural yes/no phrasing for troubleshooting fields', () => {
    let activeCase = processCustomerMessage(createFreshCase(), 'My router has a red light and is not working').updatedCase;
    activeCase = processCustomerMessage(activeCase, 'LC Router 9000').updatedCase;
    activeCase = processCustomerMessage(activeCase, 'SN-001-RED').updatedCase;
    activeCase = processCustomerMessage(activeCase, '2026-03-30').updatedCase;

    activeCase = processCustomerMessage(activeCase, 'There is a red light on the router.').updatedCase;
    expect(activeCase.collectedFields.hasRedLight).toBe('Yes');
    expect(activeCase.pendingField).toBe('restartTried');

    activeCase = processCustomerMessage(activeCase, 'I already restarted it three times, yes.').updatedCase;
    expect(activeCase.collectedFields.restartTried).toBe('Yes');
    expect(activeCase.pendingField).toBe('errorDescription');
  });

  it('allows a yes confirmation to submit the draft case', () => {
    let activeCase = processCustomerMessage(createFreshCase(), 'My router has a red light and is not working').updatedCase;
    activeCase = processCustomerMessage(activeCase, 'LC Router 9000').updatedCase;
    activeCase = processCustomerMessage(activeCase, 'SN-001').updatedCase;
    activeCase = processCustomerMessage(activeCase, '2026-03-30').updatedCase;
    activeCase = processCustomerMessage(activeCase, 'yes').updatedCase;
    activeCase = processCustomerMessage(activeCase, 'yes').updatedCase;
    activeCase = processCustomerMessage(activeCase, 'The internet drops every few minutes').updatedCase;

    expect(activeCase.stage).toBe('case_confirmation');

    const confirmed = processCustomerMessage(activeCase, 'yes').updatedCase;

    expect(confirmed.confirmed).toBe(true);
    expect(confirmed.stage).toBe('case_processing');
    expect(confirmed.status).toBe('Pending Technician');
  });

  it('allows a no confirmation to return the draft to correction flow', () => {
    let activeCase = processCustomerMessage(createFreshCase(), 'I need to activate my router').updatedCase;
    activeCase = processCustomerMessage(activeCase, 'LC Router 100').updatedCase;
    activeCase = processCustomerMessage(activeCase, 'SN-002').updatedCase;
    activeCase = processCustomerMessage(activeCase, 'ORDER-123').updatedCase;
    activeCase = processCustomerMessage(activeCase, '2026-03-31').updatedCase;
    activeCase = processCustomerMessage(activeCase, 'Activation fails with an invalid serial message').updatedCase;

    expect(activeCase.stage).toBe('case_confirmation');

    const revised = processCustomerMessage(activeCase, 'no').updatedCase;

    expect(revised.confirmed).toBe(false);
    expect(revised.stage).toBe('information_collection');
    expect(revised.pendingField).toBe('routerModel');
  });

  it('keeps the explicit confirmCase helper stable for button-driven confirmation', () => {
    const confirmed = confirmCase({
      ...createFreshCase(),
      stage: 'case_confirmation',
      issueType: 'Router Activation',
      requiredFields: ['routerModel'],
      pendingField: null
    });

    expect(confirmed.confirmed).toBe(true);
    expect(confirmed.stage).toBe('case_processing');
  });

  it('keeps escalation sticky after later technical troubleshooting updates', () => {
    let activeCase = processCustomerMessage(createFreshCase(), 'My router has a red light and is not working').updatedCase;
    activeCase = processCustomerMessage(activeCase, 'LC Router 9000').updatedCase;
    activeCase = processCustomerMessage(activeCase, 'SN-001').updatedCase;
    activeCase = processCustomerMessage(activeCase, '2026-03-30').updatedCase;
    activeCase = processCustomerMessage(activeCase, 'yes').updatedCase;
    activeCase = processCustomerMessage(activeCase, 'yes').updatedCase;
    activeCase = processCustomerMessage(activeCase, 'The internet drops every few minutes').updatedCase;
    activeCase = processCustomerMessage(activeCase, 'yes').updatedCase;

    const escalated = processCustomerMessage(activeCase, 'This is ridiculous and I am extremely angry.').updatedCase;
    const laterTechnicalUpdate = processCustomerMessage(escalated, 'It is still broken and cannot be fixed.').updatedCase;

    expect(escalated.escalationState).toBe('Escalated');
    expect(laterTechnicalUpdate.escalationState).toBe('Escalated');
    expect(laterTechnicalUpdate.status).toBe('Replacement Review');
  });
});
