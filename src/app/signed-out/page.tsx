export const instant = false;

export default function SignedOutPage() {
  return (
    <div className="gate">
      <div className="gate-card">
        <div className="brand-mark">KLEF</div>
        <h1>Sign in required</h1>
        <p>
          This ledger is private. Open it from Cursor after publishing as a
          private or team app so your signed-in identity can be verified.
        </p>
      </div>
    </div>
  );
}
