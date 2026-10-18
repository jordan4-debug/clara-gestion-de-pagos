import type { Bill, PaymentConfig } from '../types';
export async function openCheckout(_options: {
  bill: Bill;
  config: PaymentConfig;
  email: string;
  onDone: () => void;
  onMessage: (message: string) => void;
}) {
  throw new Error('Los pagos reales están desactivados en esta demostración.');
}
