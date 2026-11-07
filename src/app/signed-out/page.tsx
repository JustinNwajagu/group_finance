import Link from "next/link";

export const instant = false;

export default function SignedOutPage() {
  return (
    <div className="gate">
      <div className="gate-card">
        <div className="brand-mark">KLEF</div>
        <h1>Sign in required</h1>
        <p>
          This ledger uses Firebase Authentication. Sign in with the account that
          should access the group records.
        </p>
        <p>
          <Link className="btn-primary" href="/login" style={{ display: "inline-block" }}>
            Go to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
