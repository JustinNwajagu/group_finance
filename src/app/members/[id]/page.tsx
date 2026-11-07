import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PaymentGroups } from "@/components/payment-groups";
import { requireAccess, isAdmin } from "@/lib/auth";
import {
  getMember,
  listPaymentsForMember,
  memberContribution,
  memberPaymentStats,
} from "@/lib/data";
import { formatMoney } from "@/lib/format";
import { groupPaymentsByTitle } from "@/lib/group";

export const instant = false;

export default async function MemberDetailPage({
  params,
}: PageProps<"/members/[id]">) {
  await connection();
  const viewer = await requireAccess();
  const admin = isAdmin(viewer);
  const { id: raw } = await params;
  const id = Number(raw);
  if (!Number.isFinite(id)) notFound();

  const member = await getMember(id);
  if (!member) notFound();

  const [payments, paidTotal, stats] = await Promise.all([
    listPaymentsForMember(id),
    memberContribution(id),
    memberPaymentStats(id),
  ]);
  const groups = groupPaymentsByTitle(payments);

  return (
    <AppShell viewer={viewer} active="members">
      <div className="page-head">
        <div>
          <p className="muted" style={{ margin: 0 }}>
            <Link href="/members">← Members</Link>
          </p>
          <h1>{member.name}</h1>
          <p>{member.email || "No email on file"}</p>
          <div className="stat-line">
            <div>
              <strong>{stats.payment_count}</strong>
              <span>Requested payments</span>
            </div>
            <div>
              <strong>{stats.contribution_count}</strong>
              <span>Contributions (paid)</span>
            </div>
            <div>
              <strong>{formatMoney(paidTotal)}</strong>
              <span>Paid total (₦)</span>
            </div>
          </div>
        </div>
      </div>

      <section className="panel">
        <h2>Payments by title</h2>
        {payments.length === 0 ? (
          <div className="hero-empty">No payments recorded for this member.</div>
        ) : (
          <PaymentGroups groups={groups} showMember={false} isAdmin={admin} />
        )}
      </section>
    </AppShell>
  );
}
