export const BUSINESS_TYPES = [
  'Restaurant',
  'Café',
  'Bar / Pub',
  'Lounge',
  'Nightclub',
  'Rooftop',
  'Hotel',
  'Resort',
  'Boutique Hotel',
  'Banquet Hall',
  'Wedding Venue',
  'Event Space',
  'Other',
] as const;

export const OUTLET_OPTIONS = [
  'Single outlet',
  '2 to 3 outlets',
  '4 or more',
] as const;

export const DESIGNATION_OPTIONS = [
  'Owner',
  'Founder',
  'Co-owner',
  'General Manager',
  'Manager',
  'Marketing Head',
  'F&B Manager',
  'Other',
] as const;

export const SOURCE_OPTIONS = [
  'Instagram',
  'WhatsApp',
  'Facebook',
  'LinkedIn',
  'YouTube',
  'Google',
  'Phone call',
  'Referral',
  'Walk-in',
  'Other',
] as const;

export const INTEREST_OPTIONS = [
  'Social media management',
  'Reels and video',
  'Photo and video shoots',
  'Influencer tie-ups',
  'Local SEO',
  'Paid ads',
] as const;

export const LEAD_STATUS_OPTIONS = [
  'New',
  'Contacted',
  'Qualified',
  'Audit Sent',
  'Proposal',
  'Won',
  'Lost',
] as const;

export const FOLLOW_UP_TYPE_OPTIONS = [
  'Call',
  'WhatsApp',
  'Meeting',
  'Email',
] as const;

export function cleanInstagramHandle(handle: string | null | undefined): string {
  if (!handle) return '';
  let val = handle.trim();
  if (!val) return '';

  // Strip Instagram URL prefixes if pasted (e.g. https://www.instagram.com/tajhotels/?hl=en)
  const urlMatch = val.match(/(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|instagr\.am)\/([^/?#\s]+)/i);
  if (urlMatch && urlMatch[1]) {
    val = urlMatch[1];
  }

  return val.replace(/^@+/, '').split(/[/?#\s]/)[0] || '';
}

export function extractIndianPhoneDigits(phone: string | null | undefined): string {
  if (!phone) return '';
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  return digits.slice(0, 10);
}

export function formatPhoneInputDisplay(digits: string): string {
  const clean = digits.replace(/\D/g, '').slice(0, 10);
  if (clean.length > 5) {
    return `${clean.slice(0, 5)} ${clean.slice(5)}`;
  }
  return clean;
}

export function formatIndianPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const trimmed = phone.trim();
  if (!trimmed) return '';
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return `+91 ${digits.slice(1, 6)} ${digits.slice(6)}`;
  }
  return trimmed;
}

export function normalizePhoneKey(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return digits;
}

export function formatIndianCurrencyInput(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('en-IN');
}

export function parseInterests(interestedIn: string | null | undefined): string[] {
  if (!interestedIn) return [];
  return interestedIn
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getOffsetDateInput(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const PIPELINE_COLUMNS = [
  { stage: 'New Lead', status: 'New', dotColor: 'bg-blue-500' },
  { stage: 'Contacted', status: 'Contacted', dotColor: 'bg-indigo-500' },
  { stage: 'Audit Sent', status: 'Audit Sent', dotColor: 'bg-purple-500' },
  { stage: 'Proposal', status: 'Proposal', dotColor: 'bg-amber-500' },
  { stage: 'Won', status: 'Won', dotColor: 'bg-emerald-500' },
  { stage: 'Lost', status: 'Lost', dotColor: 'bg-rose-500' },
] as const;

export const LEAD_SOURCE_FILTER_PRESETS = [
  'Website Lead',
  'Manual',
  ...SOURCE_OPTIONS,
] as const;

export function getLeadHotelName(lead: any): string {
  return lead?.hotel_name || lead?.business_name || 'Unnamed';
}

export function getLeadContactName(lead: any): string {
  return lead?.contact_name || lead?.full_name || '';
}

export function getLeadSourceValue(lead: any): string {
  return lead?.lead_source || lead?.source || 'Manual';
}

export function getLeadLocation(lead: any): string {
  return lead?.website_or_city || lead?.city || lead?.landing_page || '';
}

export function getLeadInterest(lead: any): string {
  return lead?.service_interest || lead?.interested_in || '';
}

export function getLeadPipelineStage(lead: any): string {
  const raw = String(lead?.pipeline_stage || lead?.status || 'New Lead').trim();
  const lower = raw.toLowerCase();
  if (!raw || lower === 'new' || lower === 'new lead') return 'New Lead';
  if (lower.includes('audit')) return 'Audit Sent';
  if (lower === 'contacted') return 'Contacted';
  if (lower === 'proposal') return 'Proposal';
  if (lower === 'won') return 'Won';
  if (lower === 'lost') return 'Lost';
  return 'New Lead';
}

export function stageToLegacyStatus(stage: string): string {
  if (stage === 'New Lead') return 'New';
  return stage;
}

export function isLeadUnreadFlag(lead: any): boolean {
  if (typeof lead?.is_unread === 'boolean') return lead.is_unread;
  if (typeof lead?.is_read === 'boolean') return !lead.is_read;
  return false;
}

