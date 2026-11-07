import { sql } from "./db";
import type { AppUser, Member, MemberContribution, PaymentWithMember } from "./types";

export async function listAppUsers(): Promise<AppUser[]> {
  return sql<AppUser>(
    `select id, cursor_sub, email, name, role, created_at::text
     from app_users
     order by
       case role when 'admin' then 0 when 'member' then 1 else 2 end,
       lower(email)`,
  );
}

export async function listMembers(query?: string): Promise<MemberContribution[]> {
  const q = query?.trim() ?? "";
  if (q) {
    return sql<MemberContribution>(
      `select
         m.id,
         m.name,
         m.email,
         m.created_at::text,
         count(p.id)::int as payment_count,
         coalesce(sum(p.amount), 0)::text as contribution_total
       from members m
       left join payments p on p.member_id = m.id
       where m.name ilike $1 or coalesce(m.email, '') ilike $1
       group by m.id
       order by lower(m.name)`,
      [`%${q}%`],
    );
  }
  return sql<MemberContribution>(
    `select
       m.id,
       m.name,
       m.email,
       m.created_at::text,
       count(p.id)::int as payment_count,
       coalesce(sum(p.amount), 0)::text as contribution_total
     from members m
     left join payments p on p.member_id = m.id
     group by m.id
     order by lower(m.name)`,
  );
}

export async function getMember(id: number): Promise<Member | null> {
  const rows = await sql<Member>(
    `select id, name, email, created_at::text from members where id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function memberContribution(id: number): Promise<string> {
  const rows = await sql<{ total: string }>(
    `select coalesce(sum(amount), 0)::text as total from payments where member_id = $1`,
    [id],
  );
  return rows[0]?.total ?? "0";
}

export async function listPaymentsForMember(id: number): Promise<PaymentWithMember[]> {
  return sql<PaymentWithMember>(
    `select
       p.id,
       p.title,
       p.member_id,
       p.amount::text,
       p.payment_date::text,
       p.created_at::text,
       m.name as member_name
     from payments p
     join members m on m.id = p.member_id
     where p.member_id = $1
     order by p.payment_date desc, p.created_at desc`,
    [id],
  );
}

export async function listPayments(query?: string): Promise<PaymentWithMember[]> {
  const q = query?.trim() ?? "";
  if (q) {
    return sql<PaymentWithMember>(
      `select
         p.id,
         p.title,
         p.member_id,
         p.amount::text,
         p.payment_date::text,
         p.created_at::text,
         m.name as member_name
       from payments p
       join members m on m.id = p.member_id
       where p.title ilike $1 or m.name ilike $1
       order by p.payment_date desc, p.created_at desc
       limit 200`,
      [`%${q}%`],
    );
  }
  return sql<PaymentWithMember>(
    `select
       p.id,
       p.title,
       p.member_id,
       p.amount::text,
       p.payment_date::text,
       p.created_at::text,
       m.name as member_name
     from payments p
     join members m on m.id = p.member_id
     order by p.payment_date desc, p.created_at desc
     limit 200`,
  );
}

export async function listMemberOptions(): Promise<Member[]> {
  return sql<Member>(
    `select id, name, email, created_at::text from members order by lower(name)`,
  );
}
