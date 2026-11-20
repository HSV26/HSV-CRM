import { getOffsetDateInput } from './leadOptions';

export const TASK_TYPE_OPTIONS = [
  'Post',
  'Reel',
  'Story',
  'Carousel',
  'Shoot',
  'Ad',
  'Report',
  'Meeting',
  'Other',
] as const;

export const TASK_PLATFORM_OPTIONS = [
  'Instagram',
  'Facebook',
  'LinkedIn',
  'YouTube',
  'Google Business Profile',
  'WhatsApp',
  'Other',
] as const;

export const CONTENT_FORMAT_OPTIONS = [
  'Photo',
  'Video',
  'Carousel',
  'Text',
  'Poll',
  'Other',
] as const;

export const TASK_PRIORITY_OPTIONS = [
  'Low',
  'Medium',
  'High',
  'Urgent',
] as const;

export const TASK_STATUS_OPTIONS = [
  'To do',
  'In progress',
  'Waiting approval',
  'Approved',
  'Published',
] as const;

export const APPROVAL_STATUS_OPTIONS = [
  'Not sent',
  'Sent to client',
  'Approved',
  'Changes requested',
] as const;

export function parseTaskPlatforms(platformStr: string | null | undefined): string[] {
  if (!platformStr) return [];
  return platformStr
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
}

export function serializeTaskPlatforms(platforms: string[]): string | null {
  const cleaned = platforms.map((p) => p.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned.join(', ') : null;
}

export function taskMatchesPlatform(
  platformStr: string | null | undefined,
  filterPlatform: string
): boolean {
  if (!filterPlatform || filterPlatform === 'ALL') return true;
  const list = parseTaskPlatforms(platformStr).map((p) => p.toLowerCase());
  return list.includes(filterPlatform.toLowerCase());
}

export function getInitials(name: string | null | undefined): string {
  if (!name) return '';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function isValidOptionalUrl(raw: string | null | undefined): boolean {
  if (!raw || !raw.trim()) return true;
  try {
    const parsed = new URL(raw.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function computeCompletedAt(
  newStatus: string | null | undefined,
  existingCompletedAt?: string | null
): string | null {
  if (newStatus === 'Published') {
    return existingCompletedAt || new Date().toISOString();
  }
  return null;
}

export function getPriorityBadgeStyle(priority: string | null | undefined): string {
  switch ((priority || '').toLowerCase()) {
    case 'urgent':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'high':
      return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'medium':
      return 'bg-blue-50 text-[#1D4ED8] border-blue-200';
    case 'low':
      return 'bg-slate-100 text-slate-600 border-slate-200';
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200';
  }
}

export function getApprovalBadgeStyle(approvalStatus: string | null | undefined): string {
  switch ((approvalStatus || '').toLowerCase()) {
    case 'approved':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'changes requested':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'sent to client':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'not sent':
      return 'bg-slate-100 text-slate-600 border-slate-200';
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200';
  }
}

export function getTodayLocalDate(): string {
  return getOffsetDateInput(0);
}

export function getQuickDueDates(): { label: string; value: string }[] {
  return [
    { label: 'Today', value: getOffsetDateInput(0) },
    { label: 'Tomorrow', value: getOffsetDateInput(1) },
    { label: 'In 3 days', value: getOffsetDateInput(3) },
    { label: 'Next week', value: getOffsetDateInput(7) },
  ];
}
