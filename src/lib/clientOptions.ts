export const CLIENT_BUSINESS_TYPES = [
  'Hotel',
  'Resort',
  'Homestay/Airbnb',
  'Restaurant/Cafe',
  'Pub/Club',
  'Clinic/Doctor',
  'Other',
] as const;

export const CLIENT_PACKAGE_OPTIONS = [
  { value: 'Starter', label: 'Starter', defaultFee: '25,000' },
  { value: 'Growth', label: 'Growth', defaultFee: '45,000' },
  { value: 'Dominator', label: 'Dominator', defaultFee: '75,000' },
] as const;

export const BILLING_CYCLE_OPTIONS = ['Monthly', 'Quarterly', 'Yearly'] as const;

export const PAYMENT_STATUS_OPTIONS = ['Paid', 'Pending', 'Overdue'] as const;

export const PLATFORM_OPTIONS = [
  'Facebook',
  'Instagram',
  'YouTube',
  'Google Business Profile',
  'WhatsApp',
  'Website',
] as const;

export const CLIENT_STATUS_OPTIONS = ['Active', 'Paused', 'Churned'] as const;

export function getPackageDefaultFee(pkg: string): string {
  const match = CLIENT_PACKAGE_OPTIONS.find((p) => p.value === pkg);
  return match ? match.defaultFee : '45,000';
}

export function getTodayInputDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Adds 1 calendar month to a YYYY-MM-DD date string, clamping to month end
 * (e.g. 2026-01-31 -> 2026-02-28) without timezone shifts.
 */
export function addOneMonthDate(dateStr: string): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '';
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  let year = Number(yearStr);
  let month = Number(monthStr); // 1-12
  const day = Number(dayStr);

  month += 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }

  // Last day of target month: day 0 of next month
  const maxDayInMonth = new Date(year, month, 0).getDate();
  const clampedDay = Math.min(day, maxDayInMonth);

  return `${year}-${String(month).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}
