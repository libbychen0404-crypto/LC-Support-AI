'use client';

type ReturnSummaryCardProps = {
  title: string;
  detail: string;
};

export function ReturnSummaryCard({ title, detail }: ReturnSummaryCardProps) {
  return (
    <section className="panel return-summary-card">
      <div className="panel-heading">
        <p className="eyebrow">Saved Case Summary</p>
        <h2>{title}</h2>
      </div>

      <p className="return-summary-copy">{detail}</p>
    </section>
  );
}
