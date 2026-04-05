export function SignOutForm() {
  return (
    <form action="/api/demo-sign-out" method="post">
      <button className="secondary-button" type="submit">
        Sign Out
      </button>
    </form>
  );
}
