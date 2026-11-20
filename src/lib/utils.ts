/**
 * Format number as Indian Rupees (INR) with thousands separators.
 * Handles null, undefined, and non-numeric values gracefully.
 */
export function formatINR(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return '₹0';
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format date string or Date object into "14 Nov 2026".
 * Handles null/empty values by returning "-".
 */
export function formatDate(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '-';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Format date for input fields (YYYY-MM-DD).
 */
export function formatInputDate(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
}

/**
 * Get color classes for lead / client source badges.
 */
export function getSourceBadgeStyle(source: string | null | undefined): string {
  if (!source) return 'bg-slate-100 text-slate-700 border-slate-200';
  const s = source.toLowerCase();
  if (s === 'website lead' || s.includes('website')) {
    return 'bg-teal-50 text-teal-800 border-teal-300 ring-1 ring-teal-500/20';
  }
  if (s === 'manual') return 'bg-slate-100 text-slate-700 border-slate-300';
  if (s.includes('instagram')) return 'bg-pink-50 text-pink-700 border-pink-200';
  if (s.includes('facebook')) return 'bg-blue-50 text-blue-700 border-blue-200';
  if (s.includes('linkedin')) return 'bg-indigo-50 text-indigo-800 border-indigo-200';
  if (s.includes('youtube')) return 'bg-red-50 text-red-700 border-red-200';
  if (s.includes('google')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (s.includes('whatsapp')) return 'bg-green-50 text-green-700 border-green-200';
  if (s.includes('direct')) return 'bg-slate-100 text-slate-700 border-slate-200';
  if (s.includes('referral')) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
}

/**
 * Get color classes for status badges.
 */
export function getStatusBadgeStyle(status: string | null | undefined): string {
  if (!status) return 'bg-slate-100 text-slate-600 border-slate-200';
  const st = status.toLowerCase();
  if (st === 'won' || st === 'active' || st === 'approved' || st === 'published' || st === 'paid') {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  if (st === 'lost' || st === 'churned' || st === 'overdue') {
    return 'bg-rose-50 text-rose-700 border-rose-200';
  }
  if (st === 'proposal' || st === 'onboarding' || st === 'in progress' || st === 'due') {
    return 'bg-blue-50 text-blue-700 border-blue-200';
  }
  if (st === 'qualified' || st === 'waiting approval') {
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }
  return 'bg-slate-100 text-slate-600 border-slate-200';
}
