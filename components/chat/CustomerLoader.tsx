'use client';

type CustomerLoaderProps = {
  customerId: string;
  name: string;
  phone: string;
  email: string;
  onNameChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onLoad: () => void;
  onStartFreshCase: () => void;
};

export function CustomerLoader({
  customerId,
  name,
  phone,
  email,
  onNameChange,
  onPhoneChange,
  onEmailChange,
  onLoad,
  onStartFreshCase
}: CustomerLoaderProps) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <p className="eyebrow">Signed-in Customer</p>
        <h2>Review or update the customer profile attached to this support session.</h2>
        <p className="muted-copy">
          Your customer ID is taken from the authenticated session and cannot be switched from this page.
        </p>
      </div>

      <div className="form-grid">
        <label className="input-group">
          <span>Customer ID</span>
          <input value={customerId} readOnly />
        </label>

        <label className="input-group">
          <span>Name</span>
          <input value={name} onChange={(event) => onNameChange(event.target.value)} />
        </label>

        <label className="input-group">
          <span>Phone</span>
          <input value={phone} onChange={(event) => onPhoneChange(event.target.value)} />
        </label>

        <label className="input-group">
          <span>Email</span>
          <input value={email} onChange={(event) => onEmailChange(event.target.value)} />
        </label>
      </div>

      <div className="button-row">
        <button className="primary-button" onClick={onLoad}>
          Refresh Workspace
        </button>
        <button className="secondary-button danger-button" onClick={onStartFreshCase}>
          Start a New Case
        </button>
      </div>

      <p className="muted-copy">
        Starting a new case opens a clean support request for this customer and keeps prior case history available in
        the case list.
      </p>
    </section>
  );
}
