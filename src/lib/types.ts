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

export type PaymentRequest = {
  id: number;
  title: string;
  amount: string;
  deadline: string;
  concluded_at: string | null;
  created_at: string;
};

export type Payment = {
  id: number;
  payment_request_id: number;
  title: string;
  member_id: number;
  amount: string;
  payment_date: string | null;
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

export type MemberPaymentRow = Member & {
  payment_id: number | null;
  status: PaymentStatus | null;
  amount: string | null;
};

export type ContributionLists = {
  request: PaymentRequest;
  contributed: MemberPaymentRow[];
  outstanding: MemberPaymentRow[];
  /** Sum of pledge + paid amounts recorded for this title. */
  realised_total: string;
};
