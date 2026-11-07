import { sql } from "./db";
import type { AppUser, Member, MemberContribution, PaymentWithMember } from "./types";

export async function listAppUsers(): Promise<AppUser[]> {
  return sql<AppUser>(
    `select id, cursor_sub, email, name, role, created_at::text as created_at
     from app_users
     order by
       case role when 'admin' then 0 when 'member' then 1 else 2 end,
       lower(email)`,
  );
}

/** Distinct payment titles (= requests that apply to every member). */
export async function requestedPaymentCount(): Promise<number> {
  const rows = await sql<{ count: string }>(
    "select count(distinct title)::text as count from payments",
  );
  return Number(rows[0]?.count ?? 0);
}

export async function listMembers(query?: string): Promise<MemberContribution[]> {
  const q = query?.trim() ?? "";
  // payment_count is global (same for every member): distinct requested titles.
  // contribution_count is per member: distinct titles they have paid toward.
  const base = `
    select
      m.id,
      m.name,
      m.email,
      m.created_at::text as created_at,
      (select count(distinct title)::int from payments) as payment_count,
      count(distinct case when p.status = 'paid' then p.title end)::int as contribution_count
    from members m
    left join payments p on p.member_id = m.id
  `;
  if (q) {
    return sql<MemberContribution>(
      `${base}
       where m.name ilike $1 or coalesce(m.email, '') ilike $1
       group by m.id
       order by lower(m.name)`,
      [`%${q}%`],
    );
  }
  return sql<MemberContribution>(
    `${base}
     group by m.id
     order by lower(m.name)`,
  );
}

export async function getMember(id: number): Promise<Member | null> {
  const rows = await sql<Member>(
    `select id, name, email, created_at::text as created_at from members where id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function memberContribution(id: number): Promise<string> {
  const rows = await sql<{ total: string }>(
    `select coalesce(sum(amount), 0)::text as total
     from payments
     where member_id = $1 and status = 'paid'`,
    [id],
  );
  return rows[0]?.total ?? "0";
}

export async function memberPaymentStats(id: number): Promise<{
  payment_count: number;
  contribution_count: number;
}> {
  const [requested, contributed] = await Promise.all([
    requestedPaymentCount(),
    sql<{ count: string }>(
      `select count(distinct title)::text as count
       from payments
       where member_id = $1 and status = 'paid'`,
      [id],
    ),
  ]);
  return {
    payment_count: requested,
    contribution_count: Number(contributed[0]?.count ?? 0),
  };
}

const paymentSelect = `
  select
    p.id,
    p.title,
    p.member_id,
    p.amount::text as amount,
    p.payment_date::text as payment_date,
    p.status,
    p.created_at::text as created_at,
    m.name as member_name
  from payments p
  join members m on m.id = p.member_id
`;

export async function listPaymentsForMember(id: number): Promise<PaymentWithMember[]> {
  return sql<PaymentWithMember>(
    `${paymentSelect}
     where p.member_id = $1
     order by p.payment_date desc, p.created_at desc`,
    [id],
  );
}

export async function listPayments(query?: string): Promise<PaymentWithMember[]> {
  const q = query?.trim() ?? "";
  if (q) {
    return sql<PaymentWithMember>(
      `${paymentSelect}
       where p.title ilike $1 or m.name ilike $1
       order by p.payment_date desc, p.created_at desc
       limit 200`,
      [`%${q}%`],
    );
  }
  return sql<PaymentWithMember>(
    `${paymentSelect}
     order by p.payment_date desc, p.created_at desc
     limit 200`,
  );
}

export async function listMemberOptions(): Promise<Member[]> {
  return sql<Member>(
    `select id, name, email, created_at::text as created_at from members order by lower(name)`,
  );
}
