'use client';

type SupportBadgeProps = {
  label: string;
  toneClassName: string;
};

export function SupportBadge({ label, toneClassName }: SupportBadgeProps) {
  return <span className={`status-badge ${toneClassName}`}>{label}</span>;
}
