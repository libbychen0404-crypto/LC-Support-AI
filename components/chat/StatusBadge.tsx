'use client';

import { getStatusTone } from '@/lib/helpers';
import type { CaseStatus } from '@/lib/types';

type StatusBadgeProps = {
  status: CaseStatus;
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return <span className={`status-badge ${getStatusTone(status)}`}>{status}</span>;
}
