export type User = {
  id: number;
  name: string;
  email: string;
  role: 'owner' | 'assistant';
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
  channel: 'external' | 'culqi';
};
export type Bill = {
  id: number;
  title: string;
  supplier_id: number;
  supplier: string;
  category: string;
  channel: 'external' | 'culqi';
  amount_cents: number | null;
  paid_cents: number;
  remaining_cents: number | null;
  due_date: string;
  month: string;
  status: string;
  approval: string;
  notes: string;
  pending_attempt: string | null;
  bank?: string;
  account?: string;
  reference?: string;
  portal?: string;
  payments?: Payment[];
};
export type Payment = {
  id: number;
  amount_cents: number;
  method: string;
  operation: string;
  created_at: string;
  actor: string;
  receipt_id: number | null;
  receipt_name?: string;
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
  threshold_cents: number;
  reminder_days: number;
  recipient: string;
  payment: PaymentConfig;
};
export type Dashboard = {
  today: string;
  month: string;
  bills: Bill[];
  totals: { pending: number; week: number; paid: number; undefined: number; weekUndefined: number };
  upcoming: Bill[];
  notifications: Bill[];
  activity: Activity[];
  settings: Omit<Settings, 'payment'>;
};
export type Attempt = {
  id: string;
  bill_id: number;
  amount_cents: number;
  state: string;
  charge_id: string | null;
  created_at: string;
};
