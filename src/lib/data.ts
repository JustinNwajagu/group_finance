import { sql } from "./db";
import type {
  AppUser,
  ContributionLists,
  Member,
  MemberContribution,
  PaymentRequest,
  PaymentWithMember,
} from "./types";

export async function listAppUsers(): Promise<AppUser[]> {
  return sql<AppUser>(
    `select id, cursor_sub, email, name, role, created_at::text as created_at
     from app_users
     order by
       case role when 'admin' then 0 when 'member' then 1 else 2 end,
       lower(email)`,
  );
}

export async function requestedPaymentCount(): Promise<number> {
  const rows = await sql<{ count: string }>(
    "select count(*)::text as count from payment_requests",
  );
  return Number(rows[0]?.count ?? 0);
}

export async function listMembers(query?: string): Promise<MemberContribution[]> {
  const q = query?.trim() ?? "";
  const base = `
    select
      m.id,
      m.name,
      m.email,
      m.created_at::text as created_at,
      (select count(*)::int from payment_requests) as payment_count,
      (
        select count(*)::int
        from payments p
        where p.member_id = m.id and p.status = 'paid'
      ) as contribution_count
    from members m
  `;
  if (q) {
    return sql<MemberContribution>(
      `${base}
       where m.name ilike $1 or coalesce(m.email, '') ilike $1
       order by lower(m.name)`,
      [`%${q}%`],
    );
  }
  return sql<MemberContribution>(
    `${base}
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
      `select count(*)::text as count
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

export async function listMemberOptions(): Promise<Member[]> {
  return sql<Member>(
    `select id, name, email, created_at::text as created_at from members order by lower(name)`,
  );
}

export async function listOpenPaymentRequests(): Promise<PaymentRequest[]> {
  return sql<PaymentRequest>(
    `select
       id,
       title,
       amount::text as amount,
       deadline::text as deadline,
       concluded_at::text as concluded_at,
       created_at::text as created_at
     from payment_requests
     where concluded_at is null
     order by deadline asc, id asc`,
  );
}

export async function listConcludedPaymentRequests(): Promise<PaymentRequest[]> {
  return sql<PaymentRequest>(
    `select
       id,
       title,
       amount::text as amount,
       deadline::text as deadline,
       concluded_at::text as concluded_at,
       created_at::text as created_at
     from payment_requests
     where concluded_at is not null
     order by concluded_at desc, id desc`,
  );
}

export async function listAllPaymentRequests(): Promise<PaymentRequest[]> {
  return sql<PaymentRequest>(
    `select
       id,
       title,
       amount::text as amount,
       deadline::text as deadline,
       concluded_at::text as concluded_at,
       created_at::text as created_at
     from payment_requests
     order by
       case when concluded_at is null then 0 else 1 end,
       deadline asc,
       id desc`,
  );
}

export async function getPaymentRequest(id: number): Promise<PaymentRequest | null> {
  const rows = await sql<PaymentRequest>(
    `select
       id,
       title,
       amount::text as amount,
       deadline::text as deadline,
       concluded_at::text as concluded_at,
       created_at::text as created_at
     from payment_requests
     where id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/** Ensure every member has a payment row for this request (pledge at min amount). */
export async function ensureMembersOnRequest(requestId: number): Promise<void> {
  const request = await getPaymentRequest(requestId);
  if (!request) return;
  const missing = await sql<{ id: number }>(
    `select m.id
     from members m
     where not exists (
       select 1 from payments p
       where p.payment_request_id = $1 and p.member_id = m.id
     )`,
    [requestId],
  );
  for (const member of missing) {
    await sql(
      `insert into payments (payment_request_id, member_id, amount, status)
       values ($1, $2, $3, 'pledge')`,
      [requestId, member.id, request.amount],
    );
  }
}

export async function contributionListsForRequest(
  requestId: number,
): Promise<ContributionLists | null> {
  const request = await getPaymentRequest(requestId);
  if (!request) return null;

  await ensureMembersOnRequest(requestId);

  const contributed = await sql<import("./types").MemberPaymentRow>(
    `select
       m.id,
       m.name,
       m.email,
       m.created_at::text as created_at,
       p.id as payment_id
     from members m
     join payments p
       on p.member_id = m.id and p.payment_request_id = $1
     where p.status = 'paid'
     order by lower(m.name)`,
    [requestId],
  );

  const outstanding = await sql<import("./types").MemberPaymentRow>(
    `select
       m.id,
       m.name,
       m.email,
       m.created_at::text as created_at,
       p.id as payment_id
     from members m
     join payments p
       on p.member_id = m.id and p.payment_request_id = $1
     where p.status <> 'paid'
     order by lower(m.name)`,
    [requestId],
  );

  return { request, contributed, outstanding };
}

export async function listContributionBoards(
  onlyOpen: boolean,
): Promise<ContributionLists[]> {
  const requests = onlyOpen
    ? await listOpenPaymentRequests()
    : await listAllPaymentRequests();
  const boards: ContributionLists[] = [];
  for (const request of requests) {
    const board = await contributionListsForRequest(request.id);
    if (board) boards.push(board);
  }
  return boards;
}

const paymentSelect = `
  select
    p.id,
    p.payment_request_id,
    r.title,
    p.member_id,
    p.amount::text as amount,
    p.payment_date::text as payment_date,
    p.status,
    p.created_at::text as created_at,
    m.name as member_name
  from payments p
  join payment_requests r on r.id = p.payment_request_id
  join members m on m.id = p.member_id
`;

export async function listPaymentsForMember(id: number): Promise<PaymentWithMember[]> {
  return sql<PaymentWithMember>(
    `${paymentSelect}
     where p.member_id = $1
     order by r.deadline desc, p.created_at desc`,
    [id],
  );
}

export async function listPayments(query?: string): Promise<PaymentWithMember[]> {
  const q = query?.trim() ?? "";
  if (q) {
    return sql<PaymentWithMember>(
      `${paymentSelect}
       where r.title ilike $1 or m.name ilike $1
       order by r.deadline desc, p.created_at desc
       limit 500`,
      [`%${q}%`],
    );
  }
  return sql<PaymentWithMember>(
    `${paymentSelect}
     order by r.deadline desc, p.created_at desc
     limit 500`,
  );
}

export async function listPaymentsForRequest(
  requestId: number,
): Promise<PaymentWithMember[]> {
  return sql<PaymentWithMember>(
    `${paymentSelect}
     where p.payment_request_id = $1
     order by lower(m.name)`,
    [requestId],
  );
}

/** Ensure every member has a pledge row for each open payment request. */
export async function ensureMemberOnOpenRequests(memberId: number): Promise<void> {
  const open = await listOpenPaymentRequests();
  for (const request of open) {
    const existing = await sql<{ id: number }>(
      `select id from payments
       where payment_request_id = $1 and member_id = $2
       limit 1`,
      [request.id, memberId],
    );
    if (existing[0]) continue;
    await sql(
      `insert into payments (payment_request_id, member_id, amount, status)
       values ($1, $2, $3, 'pledge')`,
      [request.id, memberId, request.amount],
    );
  }
}
