'use client';

import { getFieldLabel } from '@/lib/helpers';
import type { CollectedFields } from '@/lib/types';

type FieldListProps = {
  fields: CollectedFields;
  emptyLabel?: string;
};

export function FieldList({ fields, emptyLabel = 'No structured details collected yet.' }: FieldListProps) {
  const entries = Object.entries(fields).filter(([, value]) => value && value.trim() !== '');

  if (!entries.length) {
    return <p className="muted-copy">{emptyLabel}</p>;
  }

  return (
    <div className="field-list">
      {entries.map(([key, value]) => (
        <div key={key} className="field-row">
          <span>{getFieldLabel(key as keyof CollectedFields)}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}
