import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AdminAuditTimeline } from '../components/admin/AdminAuditTimeline';

describe('AdminAuditTimeline', () => {
  it('renders a readable audit timeline without raw JSON', () => {
    const html = renderToStaticMarkup(
      <AdminAuditTimeline
        isLoading={false}
        error=""
        events={[
          {
            id: 'audit-1',
            caseId: 'case-1',
            actorType: 'system',
            actorLabel: 'System',
            actionType: 'system_case_classified',
            actionLabel: 'Case classified',
            description: 'Classified the case as "Router Repair".',
            createdAt: '2026-04-05T10:32:00.000Z'
          },
          {
            id: 'audit-2',
            caseId: 'case-1',
            actorType: 'agent',
            actorLabel: 'Support Agent',
            actionType: 'agent_status_changed',
            actionLabel: 'Status changed',
            description: 'Changed status: New -> Investigating',
            createdAt: '2026-04-05T10:34:00.000Z'
          }
        ]}
      />
    );

    expect(html).toContain('System');
    expect(html).toContain('Support Agent');
    expect(html).toContain('Case classified');
    expect(html).toContain('Changed status: New -&gt; Investigating');
    expect(html).not.toContain('previous_value');
    expect(html).not.toContain('new_value');
  });
});
