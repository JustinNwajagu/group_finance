import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";

export const instant = false;

export default function SignedOutPage() {
  return (
    <div className="gate">
      <div className="gate-card">
        <BrandLogo size={64} />
        <h1>Signed out</h1>
        <p>
          <Link
            className="btn-primary"
            href="/login"
            style={{ display: "inline-block" }}
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
