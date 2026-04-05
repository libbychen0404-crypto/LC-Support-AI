'use client';

import { formatTime } from '@/lib/helpers';
import type { AdminAuditTimelineEvent } from '@/lib/types';

type AdminAuditTimelineProps = {
  events: AdminAuditTimelineEvent[];
  isLoading: boolean;
  error: string;
};

export function AdminAuditTimeline({ events, isLoading, error }: AdminAuditTimelineProps) {
  if (isLoading) {
    return <p className="muted-copy">Loading audit history...</p>;
  }

  if (error) {
    return <p className="muted-copy">{error}</p>;
  }

  if (!events.length) {
    return <p className="muted-copy">No audit events have been recorded for this case yet.</p>;
  }

  return (
    <div className="case-history-list">
      {events.map((event) => (
        <article key={event.id} className="case-history-card static-card">
          <div className="case-history-meta">
            <strong>{formatTime(event.createdAt)}</strong>
            <span>{event.actorLabel}</span>
          </div>
          <p>{event.description}</p>
          <span>{event.actionLabel}</span>
        </article>
      ))}
    </div>
  );
}
