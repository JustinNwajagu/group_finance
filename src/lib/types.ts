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
  phone: string | null;
  auth_uid: string | null;
  login_email: string | null;
  created_at: string;
};

/** Contribution payment request (separate from dues schedules). */
export type PaymentRequest = {
  id: number;
  title: string;
  amount: string;
  deadline: string;
  concluded_at: string | null;
  created_at: string;
};

/** Contribution payment row (separate from dues payments). */
export type Payment = {
  id: number;
  payment_request_id: number;
  title: string;
  member_id: number;
  amount: string;
  payment_date: string | null;
  status: PaymentStatus;
  notes: string | null;
  created_at: string;
};

export type PaymentWithMember = Payment & {
  member_name: string;
};

export type MemberContribution = Member & {
  /** Total contribution titles requested (same for every member). */
  payment_count: number;
  /** Contribution titles this member has paid (excludes dues). */
  contribution_count: number;
  /**
   * Dues progress across opened years: each year is 1.0 when fully paid;
   * partial months count as months/12 (e.g. 3 months → 0.25).
   */
  dues_count: number;
  /** Number of dues years opened (denominator, like payment_count). */
  dues_years_count: number;
};

export type MemberPaymentRow = Member & {
  payment_id: number | null;
  status: PaymentStatus | null;
  amount: string | null;
  notes: string | null;
};

export type ContributionLists = {
  request: PaymentRequest;
  /** Paid only — pledges never count as contributed. */
  contributed: MemberPaymentRow[];
  /** Recorded pledges (not yet paid). */
  pledged: MemberPaymentRow[];
  /** No payment row yet. */
  outstanding: MemberPaymentRow[];
  /** Sum of amounts with status pledge. */
  pledge_total: string;
  /** Sum of amounts with status paid only (pledges never count as realised). */
  realised_total: string;
};

/** Calendar year dues schedule (fixed monthly amount, Jan–Dec). */
export type DuesSchedule = {
  id: number;
  year: number;
  title: string;
  monthly_amount: string;
  created_at: string;
};

/** One dues payment — amount ÷ monthly_amount = months covered. */
export type DuesPayment = {
  id: number;
  dues_schedule_id: number;
  member_id: number;
  amount: string;
  /** Calendar months covered by this payment (1=Jan … 12=Dec). */
  covered_months: number[];
  payment_date: string;
  notes: string | null;
  created_at: string;
};

export type DuesPaymentWithMember = DuesPayment & {
  member_name: string;
  year: number;
};

/** Per-member Jan–Dec coverage for one dues year. */
export type DuesMemberYear = {
  member: Member;
  /** Length 12; true when that month is covered. */
  months_paid: boolean[];
  months_count: number;
  amount_paid: string;
  remaining_months: number;
};

export type DuesYearBoard = {
  schedule: DuesSchedule;
  rows: DuesMemberYear[];
  payments: DuesPaymentWithMember[];
  /** Sum of all dues amounts paid this year. */
  total_collected: string;
};

export type ExpenseKind = "member" | "miscellaneous" | "meeting";

/** Where an expense is drawn from. "both" = contribution pot + bank top-up. */
export type ExpenseFundingSource = "contribution" | "bank" | "both";

export type ExpenseAllocation = {
  member_id: number;
  amount: string;
};

export type ExpenseCertification = {
  email: string;
  name: string;
  at: string;
};

/** Outflow from the group bank account. Certified when ≥2 admins sign. */
export type Expense = {
  id: number;
  expense_date: string;
  /** Total outflow (= contribution_amount + bank_amount). */
  amount: string;
  kind: ExpenseKind;
  /**
   * Notes explaining the spend. Required whenever any bank money is used, or
   * when a contribution pot is not paid out in full. Optional only for a
   * contribution-only full remaining payout.
   */
  notes: string;
  /** Member recipients; only used when kind is member. */
  allocations: ExpenseAllocation[];
  funding_source: ExpenseFundingSource;
  /** Contribution pot when funding includes contribution. */
  payment_request_id: number | null;
  /** Amount drawn from the contribution pot. */
  contribution_amount: string;
  /** Amount drawn from the bank (including top-up when funding is both). */
  bank_amount: string;
  certifications: ExpenseCertification[];
  created_by_email: string;
  created_by_name: string;
  created_at: string;
  /** Set once two distinct admin certifications exist. */
  certified_at: string | null;
};

export type ExpenseAllocationView = ExpenseAllocation & {
  member_name: string;
};

export type ExpenseView = Omit<Expense, "allocations"> & {
  allocations: ExpenseAllocationView[];
  certified: boolean;
  contribution_title: string | null;
};

/** Contribution pots available to fund member expense payouts. */
export type ContributionFundingOption = {
  id: number;
  title: string;
  concluded: boolean;
  realised_total: string;
  /** Realised total minus prior expenses drawn from this contribution. */
  remaining: string;
};

export type BankAccountDetails = {
  bank_name: string;
  account_name: string;
  account_number: string;
  /** Optional bank code / sort code / routing. */
  bank_code: string;
  updated_at: string | null;
  updated_by: string | null;
};

export type BankLedgerSummary = {
  contributions_in: string;
  dues_in: string;
  expenses_out: string;
  pending_expenses: string;
  balance: string;
};
