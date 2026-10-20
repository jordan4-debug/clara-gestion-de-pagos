export type User = {
  id: number;
  name: string;
  email: string;
  role: "owner" | "assistant";
  demo?: boolean;
};
export type Supplier = {
  id: number;
  name: string;
  category: string;
  bank: string;
  account: string;
  reference: string;
  portal: string;
  channel: "external" | "culqi";
  payment_gateway?: "portal" | "manual" | "izipay";
  payment_url?: string;
  payment_methods?: string[];
};
export type Bill = {
  id: number;
  title: string;
  supplier_id: number;
  supplier: string;
  category: string;
  channel: "external" | "culqi";
  amount_cents: number | null;
  paid_cents: number;
  remaining_cents: number | null;
  due_date: string;
  month: string;
  status: string;
  approval: string;
  notes: string;
  pending_attempt: string | null;
  provider_payment: {
    gateway: "portal" | "manual" | "izipay";
    url: string;
    methods: string[];
    recipient: string;
    integrated_enabled: boolean;
  };
  invoice_receipt_id?: number;
  invoice_name?: string;
  invoice_number?: string;
  due_soon?: boolean;
  simulated?: boolean;
  created_by?: string;
  loan_id?: number;
  installment_number?: number;
  service_reference?: string;
  pending_reviews: number;
  observed_reviews: number;
  bank?: string;
  account?: string;
  reference?: string;
  portal?: string;
  payments?: Payment[];
};
export type Finance = {
  month: string;
  configured: boolean;
  revision: number;
  account: string;
  initial_cents: number;
  paid_cents: number;
  simulated_cents: number;
  pending_cents: number;
  available_cents: number;
  projected_cents: number;
};
export type Payment = {
  kind?: "simulated";
  id: number;
  amount_cents: number;
  method: string;
  operation: string;
  created_at: string;
  actor: string;
  receipt_id: number | null;
  receipt_name?: string;
  actor_id?: number;
  destination?: {
    supplier: string;
    bank: string;
    account: string;
    reference: string;
  };
  review_status?: "pending" | "observed" | "verified" | "simulated";
  review_revision?: number;
  review_note?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  review_events?: {
    status: string;
    note: string;
    actor: string;
    receipt_id: number | null;
    created_at: string;
  }[];
};
export type Review = Payment & {
  bill_id: number;
  title: string;
  supplier: string;
  month: string;
};
export type Member = User & { active: number; created_at: string };
export type Report = {
  month: string;
  totals: Dashboard["totals"];
  categories: {
    category: string;
    count: number;
    pending: number;
    recorded: number;
  }[];
  trend: { month: string; recorded: number }[];
  bills: Bill[];
  recorded_count: number;
  verified_count: number;
};
export type Template = {
  id: number;
  title: string;
  supplier_id: number;
  supplier: string;
  amount_cents: number | null;
  day: number;
  active: number;
};
export type Activity = {
  id: number;
  action: string;
  detail: string;
  actor: string;
  created_at: string;
};
export type PaymentConfig = {
  mode: string;
  configured: boolean;
  enabled: boolean;
  publicKey: string;
  merchant: string;
};
export type Settings = {
  reminder_days: number;
  recipient: string;
  payment: PaymentConfig;
};
export type Loan = {
  id: number;
  title: string;
  supplier: string;
  supplier_id: number;
  principal_cents: number;
  total_cents: number;
  paid_cents: number;
  remaining_cents: number;
  installment_count: number;
  installment_cents: number;
  last_installment_cents: number;
  paid_installments: number;
  overdue_installments: number;
  next_due_date: string | null;
  reference: string;
  notes: string;
  installments: Bill[];
};
export type Dashboard = {
  finance: Finance;
  today: string;
  month: string;
  bills: Bill[];
  totals: {
    total: number;
    monthPaid: number;
    pending: number;
    week: number;
    paid: number;
    undefined: number;
    weekUndefined: number;
  };
  upcoming: Bill[];
  notifications: Bill[];
  activity: Activity[];
  settings: Omit<Settings, "payment">;
};
export type Attempt = {
  id: string;
  bill_id: number;
  amount_cents: number;
  state: string;
  charge_id: string | null;
  created_at: string;
};

export type CashData = {
  people: { id: number; name: string; active: number; balance_cents: number }[];
  balance_cents: number;
  totals: { delivered: number; spent: number; returned: number };
  movements: {
    id: number;
    kind: "delivery" | "expense" | "return";
    holder_id: number;
    amount_cents: number;
    note: string;
    actor: string;
    created_at: string;
    bill_id?: number;
    payment_id?: number;
  }[];
};
