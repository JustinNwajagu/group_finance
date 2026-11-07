export type AppRole = "admin" | "member" | "pending";

export type PaymentStatus = "pledge" | "paid";

export type AppUser = {
  id: number;
  cursor_sub: string | null;
  email: string;
  name: string;
  role: AppRole;
  created_at: string;
};

export type Member = {
  id: number;
  name: string;
  email: string | null;
  created_at: string;
};

export type Payment = {
  id: number;
  title: string;
  member_id: number;
  amount: string;
  payment_date: string;
  status: PaymentStatus;
  created_at: string;
};

export type PaymentWithMember = Payment & {
  member_name: string;
};

export type MemberContribution = Member & {
  payment_count: number;
  contribution_count: number;
};
