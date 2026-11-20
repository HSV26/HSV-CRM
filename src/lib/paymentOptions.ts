import { getOffsetDateInput } from './leadOptions';

export const PAYMENT_TYPE_OPTIONS = [
  'Monthly retainer',
  'Setup fee',
  'Shoot or add-on',
  'Ad spend reimbursement',
  'Other',
] as const;

export const PAYMENT_STATUS_OPTIONS = [
  'Due',
  'Paid',
  'Overdue',
  'Partially paid',
] as const;

export const PAYMENT_METHOD_OPTIONS = [
  'UPI',
  'Bank transfer',
  'Cash',
  'Cheque',
  'Card',
  'Other',
] as const;

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function getCurrentMonthInputValue(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function formatMonthPickerToLabel(monthInput: string | null | undefined): string {
  if (!monthInput) return '';
  const trimmed = monthInput.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})$/);
  if (!match) return trimmed;
  const year = Number(match[1]);
  const monthIdx = Number(match[2]) - 1;
  if (monthIdx < 0 || monthIdx > 11) return trimmed;
  return `${MONTH_NAMES[monthIdx]} ${year}`;
}

/**
 * Normalizes either "2026-11" or "November 2026" (or "Nov 2026") to "2026-11"
 * for reliable duplicate comparisons.
 */
export function normalizeMonthKey(raw: string | null | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}$/.test(trimmed)) return trimmed;

  const parsed = new Date(`1 ${trimmed}`);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }
  return trimmed.toLowerCase();
}

export function getFirstOfNextMonthDate(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const y = next.getFullYear();
  const m = String(next.getMonth() + 1).padStart(2, '0');
  const d = String(next.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getQuickPaymentDueDates(): { label: string; value: string }[] {
  return [
    { label: 'Today', value: getOffsetDateInput(0) },
    { label: 'In 5 days', value: getOffsetDateInput(5) },
    { label: '1st of next month', value: getFirstOfNextMonthDate() },
  ];
}

/**
 * Formats numeric input (supporting optional 2 decimals) with Indian grouping: 1,25,000 or 1,25,000.50
 */
export function formatIndianAmountInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, '');
  if (!cleaned) return '';
  const parts = cleaned.split('.');
  const intDigits = parts[0].replace(/^0+(?=\d)/, '');
  const formattedInt = intDigits ? Number(intDigits).toLocaleString('en-IN') : '0';
  if (parts.length > 1) {
    const dec = parts.slice(1).join('').slice(0, 2);
    return `${formattedInt}.${dec}`;
  }
  return intDigits ? formattedInt : '';
}

export function parseFormattedAmount(display: string): number {
  const numeric = display.replace(/,/g, '').trim();
  if (!numeric) return 0;
  const val = Number(numeric);
  return isNaN(val) ? 0 : val;
}

export function getEffectivePaymentAmount(payment: any): number {
  const raw = payment?.total_amount ?? payment?.amount;
  const num = Number(raw);
  return isNaN(num) ? 0 : num;
}

export function isPaymentOverdue(payment: any, todayStr: string): boolean {
  if (!payment) return false;
  if (payment.status === 'Paid') return false;
  if (payment.status === 'Overdue') return true;
  return Boolean(payment.due_date && payment.due_date < todayStr);
}

export function getEffectivePaymentStatus(payment: any, todayStr: string): string {
  if (!payment) return 'Due';
  if (payment.status === 'Paid') return 'Paid';
  if (isPaymentOverdue(payment, todayStr)) return 'Overdue';
  return payment.status || 'Due';
}
