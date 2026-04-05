import { describe, expect, it } from 'vitest';
import { getSelectableStatusesForAdmin, isAllowedStatusTransition } from '../lib/caseStatus';

describe('caseStatus admin transition helpers', () => {
  it('only exposes valid next statuses to the admin selector', () => {
    const options = getSelectableStatusesForAdmin('Provisioning Check');

    expect(options).toEqual(['Provisioning Check', 'Waiting on Customer', 'Investigating', 'Resolved', 'Closed']);
    expect(options.includes('Replacement Review')).toBe(false);
  });

  it('keeps backend transition validation defensive', () => {
    expect(isAllowedStatusTransition('Provisioning Check', 'Investigating')).toBe(true);
    expect(isAllowedStatusTransition('Provisioning Check', 'Replacement Review')).toBe(false);
  });
});
