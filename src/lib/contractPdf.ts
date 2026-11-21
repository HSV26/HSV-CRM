import { jsPDF } from 'jspdf';
import { formatDate } from './utils';
import {
  CompanySettings,
  DEFAULT_PAYMENT_TERMS,
  calculateProposalTotals,
  formatProperCaseName,
  getAgencyContactSummary,
  getCompanySettings,
  normalizeDeliverables,
} from './proposalConfig';
import {
  ContractClause,
  DEFAULT_GOVERNING_LAW,
  DEFAULT_NOTICE_PERIOD_DAYS,
  normalizeContractClauses,
} from './contractConfig';

export interface ContractPdfInput {
  contract_number?: string | null;
  business_name?: string | null;
  contact_name?: string | null;
  client_designation?: string | null;
  client_email?: string | null;
  client_phone?: string | null;
  client_address?: string | null;
  business_type?: string | null;
  contract_date?: string | null;
  start_date?: string | null;
  term_type?: string | null;
  term_months?: number | string | null;
  renewal_date?: string | null;
  package?: string | null;
  deliverables?: unknown;
  monthly_fee?: number | string | null;
  setup_fee?: number | string | null;
  discount?: number | string | null;
  gst_enabled?: boolean | null;
  gst_percent?: number | string | null;
  payment_terms?: string | null;
  notice_period_days?: number | string | null;
  governing_law?: string | null;
  clauses?: ContractClause[] | unknown;
  signed_at?: string | null;
  company_settings?: CompanySettings;
}

const NAVY: [number, number, number] = [10, 31, 92]; // #0A1F5C
const NAVY_CARD: [number, number, number] = [18, 43, 115]; // #122B73
const NAVY_DIVIDER: [number, number, number] = [59, 91, 168];
const ROYAL_BLUE: [number, number, number] = [29, 78, 216]; // #1D4ED8
const LIGHT_BLUE_BG: [number, number, number] = [248, 250, 255]; // #F8FAFF
const TINT_BLUE_BG: [number, number, number] = [242, 247, 255]; // #F2F7FF
const BORDER_BLUE: [number, number, number] = [220, 235, 255]; // #DCEBFF
const SOFT_BORDER: [number, number, number] = [229, 236, 246]; // #E5ECF6
const SLATE_TEXT: [number, number, number] = [51, 65, 85]; // #334155
const MUTED_TEXT: [number, number, number] = [100, 116, 139]; // #64748B
const EMERALD_TEXT: [number, number, number] = [5, 150, 105];
const BLUE_200: [number, number, number] = [191, 219, 254];
const BLUE_100: [number, number, number] = [219, 234, 254];

let cachedFontPair: { regular: string; bold: string } | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function ensureUnicodeFonts(doc: jsPDF): Promise<string> {
  try {
    if (!cachedFontPair) {
      const globalFonts = (globalThis as { __PDF_FONTS__?: { regular: string; bold: string } })
        .__PDF_FONTS__;
      if (globalFonts?.regular && globalFonts?.bold) {
        cachedFontPair = globalFonts;
      } else if (typeof fetch !== 'undefined') {
        const [regRes, boldRes] = await Promise.all([
          fetch('/fonts/DejaVuSans.ttf'),
          fetch('/fonts/DejaVuSans-Bold.ttf'),
        ]);
        if (regRes.ok && boldRes.ok) {
          const [regBuf, boldBuf] = await Promise.all([
            regRes.arrayBuffer(),
            boldRes.arrayBuffer(),
          ]);
          cachedFontPair = {
            regular: arrayBufferToBase64(regBuf),
            bold: arrayBufferToBase64(boldBuf),
          };
        }
      }
    }

    if (cachedFontPair) {
      doc.addFileToVFS('DejaVuSans.ttf', cachedFontPair.regular);
      doc.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal');
      doc.addFileToVFS('DejaVuSans-Bold.ttf', cachedFontPair.bold);
      doc.addFont('DejaVuSans-Bold.ttf', 'DejaVuSans', 'bold');
      return 'DejaVuSans';
    }
  } catch (err) {
    console.warn('Falling back to default PDF font:', err);
  }
  return 'helvetica';
}

function formatContractINR(amount: number, unicodeSupported = true): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  const formatted = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(safe);
  return unicodeSupported ? `₹${formatted}` : `Rs. ${formatted}`;
}

function sanitizeFileSegment(val: string | null | undefined, fallback: string): string {
  const cleaned = (val || '')
    .trim()
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || fallback;
}

export function getContractPdfFilename(
  businessName?: string | null,
  contractNumber?: string | null
): string {
  const biz = sanitizeFileSegment(businessName, 'Client');
  const num = sanitizeFileSegment(contractNumber, 'HS-C-Draft');
  return `HotelStory-Contract-${biz}-${num}.pdf`;
}

export async function buildContractPdfDocument(contract: ContractPdfInput): Promise<{
  doc: jsPDF;
  filename: string;
}> {
  const settings = contract.company_settings || getCompanySettings();
  const { phone, email, website, gstin } = getAgencyContactSummary(settings);
  const totals = calculateProposalTotals(contract);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const fontFamily = await ensureUnicodeFonts(doc);
  const unicodeSupported = fontFamily === 'DejaVuSans';

  const PAGE_W = 210;
  const MARGIN_X = 16;
  const CONTENT_W = PAGE_W - MARGIN_X * 2; // 178mm
  const RUNNING_HEADER_BODY_Y = 20;
  const FOOTER_LINE_Y = 281;
  const FOOTER_TEXT_Y = 287;
  const BOTTOM_LIMIT = 274;
  const SECTION_GAP = 6.5;
  const HEADING_TO_BODY = 6.0;

  const contractNumber = (contract.contract_number || '').trim() || 'HS-C-2026-001';
  const businessName = formatProperCaseName(contract.business_name) || 'Client';
  const contactName = formatProperCaseName(contract.contact_name);
  const clientDesignation = (contract.client_designation || '').trim();
  const clientAddress = formatProperCaseName(contract.client_address);
  const businessType = formatProperCaseName(contract.business_type);
  const packageName = (contract.package || 'Growth').trim();
  const deliverables = normalizeDeliverables(contract.deliverables);

  const contractDateStr = contract.contract_date
    ? formatDate(contract.contract_date)
    : formatDate(new Date());
  const startDateStr = contract.start_date
    ? formatDate(contract.start_date)
    : formatDate(new Date());
  const termType = contract.term_type === 'fixed' ? 'fixed' : 'month-to-month';
  const termMonths = Math.max(1, Number(contract.term_months) || 3);
  const termDisplay =
    termType === 'fixed'
      ? `Fixed ${termMonths} ${termMonths === 1 ? 'Month' : 'Months'}`
      : 'Month-to-month';
  const renewalDateStr =
    termType === 'fixed' && contract.renewal_date ? formatDate(contract.renewal_date) : '';

  const noticeDays = Math.max(0, Number(contract.notice_period_days) || DEFAULT_NOTICE_PERIOD_DAYS);
  const governingLaw = (contract.governing_law || '').trim() || DEFAULT_GOVERNING_LAW;
  const paymentTerms = (contract.payment_terms || '').trim() || DEFAULT_PAYMENT_TERMS;
  const enabledClauses = normalizeContractClauses(contract.clauses).filter((c) => c.enabled);

  const tickChar = unicodeSupported ? '✓' : '+';
  const sep = '  |  ';

  const wrapText = (
    text: string,
    maxWidth: number,
    fontSize: number,
    fontStyle: 'normal' | 'bold' = 'normal'
  ): string[] => {
    doc.setFont(fontFamily, fontStyle);
    doc.setFontSize(fontSize);
    const safeWidth = Math.max(10, maxWidth - 0.5);
    return doc.splitTextToSize(text, safeWidth) as string[];
  };

  let y = 0;

  const drawRunningHeader = () => {
    doc.setFillColor(...ROYAL_BLUE);
    doc.rect(0, 0, PAGE_W, 2.5, 'F');

    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...NAVY);
    doc.text(settings.agencyName, MARGIN_X, 10);

    const rightHeaderParts = [contractNumber, businessName];
    if (gstin) rightHeaderParts.push(`GSTIN: ${gstin}`);
    const rightHeader = rightHeaderParts.join(sep);
    const maxRightW = CONTENT_W - 42;
    const rightLines = wrapText(rightHeader, maxRightW, 8, 'normal');
    doc.setTextColor(...MUTED_TEXT);
    doc.text(rightLines[0] || contractNumber, PAGE_W - MARGIN_X, 10, { align: 'right' });

    doc.setDrawColor(...BORDER_BLUE);
    doc.setLineWidth(0.35);
    doc.line(MARGIN_X, 13.5, PAGE_W - MARGIN_X, 13.5);
  };

  const startNewPage = () => {
    doc.addPage();
    drawRunningHeader();
    y = RUNNING_HEADER_BODY_Y;
  };

  const ensureSpace = (neededHeight: number) => {
    if (y + neededHeight > BOTTOM_LIMIT) {
      startNewPage();
    }
  };

  const drawSectionHeading = (label: string, rightLabel?: string) => {
    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(10.8);
    doc.setTextColor(...NAVY);
    doc.text(label, MARGIN_X, y);

    if (rightLabel) {
      doc.setFont(fontFamily, 'normal');
      doc.setFontSize(8.2);
      doc.setTextColor(...ROYAL_BLUE);
      doc.text(rightLabel, PAGE_W - MARGIN_X, y, { align: 'right' });
    }

    doc.setDrawColor(...BORDER_BLUE);
    doc.setLineWidth(0.45);
    doc.line(MARGIN_X, y + 2.2, PAGE_W - MARGIN_X, y + 2.2);
    y += HEADING_TO_BODY;
  };

  // ==================== PAGE 1 COVER HEADER ====================
  const coverH = gstin ? 45 : 43;
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, PAGE_W, coverH, 'F');
  doc.setFillColor(...ROYAL_BLUE);
  doc.rect(0, coverH, PAGE_W, 2, 'F');

  doc.setFillColor(255, 255, 255);
  doc.roundedRect(MARGIN_X, 9.5, 9, 9, 1.8, 1.8, 'F');
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...ROYAL_BLUE);
  doc.text('H', MARGIN_X + 4.5, 15.8, { align: 'center' });

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text(settings.agencyName, MARGIN_X + 12, 14.2);

  const coverSubtitle = website ? `${settings.tagline}  ·  ${website}` : settings.tagline;
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...BLUE_200);
  doc.text(coverSubtitle, MARGIN_X + 12, 18.8);

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...BLUE_200);
  doc.text('SERVICE AGREEMENT', MARGIN_X, 27);

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(16.5);
  doc.setTextColor(255, 255, 255);
  doc.text('Social Media Marketing Contract', MARGIN_X, 34.5);

  const metaBoxW = gstin ? 62 : 56;
  const metaBoxH = gstin ? 29.5 : 24.5;
  const metaBoxX = PAGE_W - MARGIN_X - metaBoxW;
  doc.setFillColor(...NAVY_CARD);
  doc.setDrawColor(...NAVY_DIVIDER);
  doc.setLineWidth(0.35);
  doc.roundedRect(metaBoxX, 8.5, metaBoxW, metaBoxH, 2.2, 2.2, 'FD');

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(255, 255, 255);
  doc.text(contractNumber, PAGE_W - MARGIN_X - 4, 14.8, { align: 'right' });

  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...BLUE_100);
  doc.text(`Date: ${contractDateStr}`, PAGE_W - MARGIN_X - 4, 20.6, { align: 'right' });
  doc.text(`Start: ${startDateStr}`, PAGE_W - MARGIN_X - 4, 25.8, { align: 'right' });
  if (gstin) {
    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...BLUE_200);
    doc.text(`GSTIN: ${gstin}`, PAGE_W - MARGIN_X - 4, 31.4, { align: 'right' });
  }

  y = coverH + 7;

  // ==================== PARTIES CARD ====================
  const halfGap = 8;
  const halfColW = (CONTENT_W - 10 - halfGap) / 2;
  const leftX = MARGIN_X + 5;
  const rightX = leftX + halfColW + halfGap;

  const clientSubline = [contactName, businessType, clientAddress].filter(Boolean).join(sep);
  const clientContactLine = [contract.client_phone, contract.client_email]
    .map((v) => (v || '').trim())
    .filter(Boolean)
    .join(sep);

  const cBizLines = wrapText(businessName, halfColW, 10.5, 'bold');
  const cSubLines = clientSubline ? wrapText(clientSubline, halfColW, 8.2, 'normal') : [];
  const cContactLines = clientContactLine ? wrapText(clientContactLine, halfColW, 8, 'normal') : [];

  const aNameLines = wrapText(settings.agencyName, halfColW, 10.5, 'bold');
  const aRepLines = wrapText(
    `${settings.preparedByName}, ${settings.preparedByRole}`,
    halfColW,
    8.2,
    'normal'
  );
  const agencyContactStr = [phone, email, website].filter(Boolean).join(sep);
  const aContactLines = wrapText(agencyContactStr, halfColW, 8, 'normal');

  const leftCardH =
    11 +
    cBizLines.length * 4.5 +
    (cSubLines.length > 0 ? cSubLines.length * 3.8 + 0.8 : 0) +
    (cContactLines.length > 0 ? cContactLines.length * 3.8 + 0.8 : 0) +
    3;
  const rightCardH =
    11 +
    aNameLines.length * 4.5 +
    aRepLines.length * 3.8 +
    0.8 +
    aContactLines.length * 3.8 +
    3;
  const partyCardH = Math.max(25, leftCardH, rightCardH);

  doc.setFillColor(...LIGHT_BLUE_BG);
  doc.setDrawColor(...BORDER_BLUE);
  doc.setLineWidth(0.4);
  doc.roundedRect(MARGIN_X, y, CONTENT_W, partyCardH, 2.2, 2.2, 'FD');

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...ROYAL_BLUE);
  doc.text('CLIENT', leftX, y + 6);
  doc.text('AGENCY', rightX, y + 6);

  let ly = y + 11.2;
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...NAVY);
  doc.text(cBizLines, leftX, ly);
  ly += cBizLines.length * 4.5;

  if (cSubLines.length > 0) {
    ly += 0.6;
    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(...SLATE_TEXT);
    doc.text(cSubLines, leftX, ly);
    ly += cSubLines.length * 3.8;
  }
  if (cContactLines.length > 0) {
    ly += 0.6;
    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED_TEXT);
    doc.text(cContactLines, leftX, ly);
  }

  let ry = y + 11.2;
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...NAVY);
  doc.text(aNameLines, rightX, ry);
  ry += aNameLines.length * 4.5 + 0.6;

  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(...SLATE_TEXT);
  doc.text(aRepLines, rightX, ry);
  ry += aRepLines.length * 3.8 + 0.6;

  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED_TEXT);
  doc.text(aContactLines, rightX, ry);

  y += partyCardH + SECTION_GAP;

  // ==================== COMMERCIAL SCHEDULE ====================
  const metaRows: Array<{ label: string; value: string }> = [
    { label: 'Package', value: packageName },
    { label: 'Contract Term', value: renewalDateStr ? `${termDisplay} (Renews ${renewalDateStr})` : termDisplay },
    { label: 'Notice Period', value: `${noticeDays} days written notice` },
    { label: 'Governing Law', value: governingLaw },
  ];

  const metaCellW = (CONTENT_W - 10 - 6) / 2;
  const scheduleBoxH = 26;
  const invRows: Array<{ label: string; value: string; accent?: 'discount' | 'subtotal' }> = [
    {
      label: `Monthly Retainer (${packageName})`,
      value: formatContractINR(totals.monthlyFee, unicodeSupported),
    },
  ];
  if (totals.setupFee > 0) {
    invRows.push({
      label: 'One-time Setup Fee',
      value: formatContractINR(totals.setupFee, unicodeSupported),
    });
  }
  if (totals.discount > 0) {
    invRows.push({
      label: 'Discount',
      value: `-${formatContractINR(totals.discount, unicodeSupported)}`,
      accent: 'discount',
    });
  }
  invRows.push({
    label: 'Subtotal',
    value: formatContractINR(totals.subtotal, unicodeSupported),
    accent: 'subtotal',
  });
  if (totals.gstEnabled) {
    invRows.push({
      label: `GST (${totals.gstPercent}%)`,
      value: formatContractINR(totals.gstAmount, unicodeSupported),
    });
  }

  const headerRowH = 8;
  const bodyRowH = 7.6;
  const totalRowH = 9.8;
  const invTableH = headerRowH + invRows.length * bodyRowH + totalRowH;

  ensureSpace(HEADING_TO_BODY + scheduleBoxH + 4 + invTableH);
  drawSectionHeading('Commercial Schedule', `Start Date: ${startDateStr}`);

  // Key terms grid card
  doc.setFillColor(...LIGHT_BLUE_BG);
  doc.setDrawColor(...BORDER_BLUE);
  doc.setLineWidth(0.35);
  doc.roundedRect(MARGIN_X, y - 1, CONTENT_W, scheduleBoxH, 2, 2, 'FD');

  metaRows.forEach((m, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const mx = MARGIN_X + 5 + col * (metaCellW + 6);
    const my = y + 4.2 + row * 11.2;

    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(...ROYAL_BLUE);
    doc.text(m.label.toUpperCase(), mx, my);

    const valLines = wrapText(m.value, metaCellW, 8.6, 'bold');
    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(8.6);
    doc.setTextColor(...NAVY);
    doc.text(valLines[0] || m.value, mx, my + 4.3);
  });

  y += scheduleBoxH + 3.5;

  // Investment table
  const tableTopY = y - 1;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...BORDER_BLUE);
  doc.setLineWidth(0.4);
  doc.roundedRect(MARGIN_X, tableTopY, CONTENT_W, invTableH, 2.2, 2.2, 'FD');

  doc.setFillColor(...TINT_BLUE_BG);
  doc.roundedRect(MARGIN_X, tableTopY, CONTENT_W, headerRowH, 2.2, 2.2, 'F');
  doc.rect(MARGIN_X, tableTopY + headerRowH - 2, CONTENT_W, 2, 'F');
  doc.setDrawColor(...BORDER_BLUE);
  doc.line(MARGIN_X, tableTopY + headerRowH, PAGE_W - MARGIN_X, tableTopY + headerRowH);

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...NAVY);
  doc.text('Fee Breakdown', MARGIN_X + 4.5, tableTopY + 5.4);
  doc.text('Amount', PAGE_W - MARGIN_X - 4.5, tableTopY + 5.4, { align: 'right' });

  let curRowY = tableTopY + headerRowH;
  invRows.forEach((row) => {
    if (row.accent === 'subtotal') {
      doc.setFillColor(...LIGHT_BLUE_BG);
      doc.rect(MARGIN_X + 0.3, curRowY, CONTENT_W - 0.6, bodyRowH, 'F');
    }
    doc.setDrawColor(...SOFT_BORDER);
    doc.setLineWidth(0.25);
    doc.line(MARGIN_X, curRowY, PAGE_W - MARGIN_X, curRowY);

    doc.setFont(fontFamily, row.accent === 'subtotal' ? 'bold' : 'normal');
    doc.setFontSize(8.8);
    doc.setTextColor(...(row.accent === 'discount' ? EMERALD_TEXT : SLATE_TEXT));
    doc.text(row.label, MARGIN_X + 4.5, curRowY + 5.1);

    doc.setFont(fontFamily, 'bold');
    doc.setTextColor(...(row.accent === 'discount' ? EMERALD_TEXT : NAVY));
    doc.text(row.value, PAGE_W - MARGIN_X - 4.5, curRowY + 5.1, { align: 'right' });

    curRowY += bodyRowH;
  });

  doc.setFillColor(...NAVY);
  doc.roundedRect(MARGIN_X, curRowY, CONTENT_W, totalRowH, 2.2, 2.2, 'F');
  doc.rect(MARGIN_X, curRowY, CONTENT_W, 3, 'F');

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(255, 255, 255);
  doc.text('Total Payable in First Month', MARGIN_X + 4.5, curRowY + 6.4);
  doc.setFontSize(10.2);
  doc.text(
    formatContractINR(totals.firstMonthTotal, unicodeSupported),
    PAGE_W - MARGIN_X - 4.5,
    curRowY + 6.4,
    { align: 'right' }
  );

  y = tableTopY + invTableH + SECTION_GAP;

  // ==================== DELIVERABLES SNAPSHOT ====================
  if (deliverables.length > 0) {
    const delivGap = 3.5;
    const delivColW = (CONTENT_W - delivGap) / 2;
    const delivTextW = delivColW - 11.5;
    const delivLineH = 3.9;

    const delivRows: Array<{ left: string[]; right: string[] | null; rowH: number }> = [];
    for (let i = 0; i < deliverables.length; i += 2) {
      const leftLines = wrapText(deliverables[i], delivTextW, 8.4, 'bold');
      const rightLines =
        i + 1 < deliverables.length ? wrapText(deliverables[i + 1], delivTextW, 8.4, 'bold') : null;
      const maxL = Math.max(leftLines.length, rightLines ? rightLines.length : 0);
      delivRows.push({
        left: leftLines,
        right: rightLines,
        rowH: Math.max(7.6, maxL * delivLineH + 3.8),
      });
    }

    const delivTotalH =
      HEADING_TO_BODY + delivRows.reduce((s, r, idx) => s + r.rowH + (idx > 0 ? 2.2 : 0), 0);

    if (delivTotalH <= BOTTOM_LIMIT - RUNNING_HEADER_BODY_Y) {
      ensureSpace(delivTotalH);
    } else {
      ensureSpace(HEADING_TO_BODY + (delivRows[0]?.rowH || 10));
    }

    drawSectionHeading('Agreed Monthly Deliverables', `${packageName} Package`);

    const drawDelivBox = (bx: number, by: number, bw: number, bh: number, lines: string[]) => {
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(...SOFT_BORDER);
      doc.setLineWidth(0.3);
      doc.roundedRect(bx, by, bw, bh, 1.8, 1.8, 'FD');

      doc.setFillColor(...TINT_BLUE_BG);
      doc.setDrawColor(...BORDER_BLUE);
      doc.circle(bx + 4.6, by + 4.1, 2.0, 'FD');
      doc.setFont(fontFamily, 'bold');
      doc.setFontSize(7.2);
      doc.setTextColor(...ROYAL_BLUE);
      doc.text(tickChar, bx + 4.6, by + 5.0, { align: 'center' });

      doc.setFont(fontFamily, 'bold');
      doc.setFontSize(8.4);
      doc.setTextColor(...NAVY);
      doc.text(lines, bx + 8.8, by + 4.9, { lineHeightFactor: 1.28 });
    };

    delivRows.forEach((row, idx) => {
      if (y + row.rowH > BOTTOM_LIMIT) {
        startNewPage();
      }
      drawDelivBox(MARGIN_X, y - 1, delivColW, row.rowH, row.left);
      if (row.right) {
        drawDelivBox(MARGIN_X + delivColW + delivGap, y - 1, delivColW, row.rowH, row.right);
      }
      y += row.rowH + (idx < delivRows.length - 1 ? 2.2 : 0);
    });

    y += SECTION_GAP;
  }

  // ==================== CONTRACT CLAUSES ====================
  const clausePadX = 5;
  const clausePadY = 4;
  const clauseInnerW = CONTENT_W - clausePadX * 2;
  const clauseLineH = 4.0;

  if (enabledClauses.length > 0) {
    ensureSpace(HEADING_TO_BODY + 24);
    drawSectionHeading('Terms and Conditions', `Payment Terms: ${paymentTerms.slice(0, 42)}${paymentTerms.length > 42 ? '...' : ''}`);
  }

  enabledClauses.forEach((clause, idx) => {
    const clauseNum = String(idx + 1).padStart(2, '0');
    const headerTitle = `${clauseNum}. ${clause.title}`;

    const paragraphs = clause.body
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    const wrappedParagraphs = paragraphs.map((p) => wrapText(p, clauseInnerW, 8.6, 'normal'));
    const bodyTextH = wrappedParagraphs.reduce(
      (sum, lines, pIdx) => sum + lines.length * clauseLineH + (pIdx > 0 ? 1.6 : 0),
      0
    );

    const cardH = clausePadY * 2 + 5.2 + Math.max(clauseLineH, bodyTextH);

    // Keep each clause whole on a page
    ensureSpace(cardH + 2.5);

    const cardTop = y - 1;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...BORDER_BLUE);
    doc.setLineWidth(0.32);
    doc.roundedRect(MARGIN_X, cardTop, CONTENT_W, cardH, 2, 2, 'FD');

    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(9.2);
    doc.setTextColor(...NAVY);
    doc.text(headerTitle, MARGIN_X + clausePadX, cardTop + clausePadY + 2.8);

    let cy = cardTop + clausePadY + 7.6;
    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(8.6);
    doc.setTextColor(...SLATE_TEXT);

    wrappedParagraphs.forEach((lines, pIdx) => {
      if (pIdx > 0) cy += 1.6;
      doc.text(lines, MARGIN_X + clausePadX, cy, { lineHeightFactor: 1.3 });
      cy += lines.length * clauseLineH;
    });

    y = cardTop + cardH + 3.2;
  });

  y += 3;

  // ==================== SIGNATURE BLOCK (KEPT TOGETHER ON ONE PAGE) ====================
  const sigColGap = 8;
  const sigColW = (CONTENT_W - sigColGap) / 2;
  const sigColInnerW = sigColW - 10;

  const agencySigTitle = `For ${settings.agencyName}`;
  const clientSigTitle = `For ${businessName}`;

  const agencyNameLines = wrapText(settings.preparedByName, sigColInnerW, 9, 'bold');
  const agencyRoleLines = wrapText(settings.preparedByRole, sigColInnerW, 8.2, 'normal');

  const clientRepName = contactName || 'Authorised Signatory';
  const clientRepRole = clientDesignation || 'Authorised Signatory';
  const clientNameLines = wrapText(clientRepName, sigColInnerW, 9, 'bold');
  const clientRoleLines = wrapText(clientRepRole, sigColInnerW, 8.2, 'normal');

  const sigBoxH = Math.max(
    52,
    24 +
      Math.max(
        agencyNameLines.length + agencyRoleLines.length,
        clientNameLines.length + clientRoleLines.length
      ) *
        4.2 +
      18
  );

  ensureSpace(HEADING_TO_BODY + sigBoxH + 2);
  drawSectionHeading('Execution & Signatures');

  const sigTop = y - 1;
  const signedDateDisplay = contract.signed_at ? formatDate(contract.signed_at) : '';

  const drawSignatureColumn = (
    sx: number,
    heading: string,
    signerNameLines: string[],
    signerRoleLines: string[],
    prefillDate?: string
  ) => {
    doc.setFillColor(...LIGHT_BLUE_BG);
    doc.setDrawColor(...BORDER_BLUE);
    doc.setLineWidth(0.4);
    doc.roundedRect(sx, sigTop, sigColW, sigBoxH, 2.2, 2.2, 'FD');

    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...NAVY);
    doc.text(heading, sx + 5, sigTop + 6.8);

    doc.setDrawColor(...BORDER_BLUE);
    doc.setLineWidth(0.3);
    doc.line(sx + 5, sigTop + 9.2, sx + sigColW - 5, sigTop + 9.2);

    let sy = sigTop + 14.5;
    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(...ROYAL_BLUE);
    doc.text('NAME & DESIGNATION', sx + 5, sy);
    sy += 4.2;

    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...NAVY);
    doc.text(signerNameLines, sx + 5, sy);
    sy += signerNameLines.length * 4.2;

    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(...SLATE_TEXT);
    doc.text(signerRoleLines, sx + 5, sy);

    const lineSigY = sigTop + sigBoxH - 16;
    doc.setDrawColor(...MUTED_TEXT);
    doc.setLineWidth(0.35);
    doc.line(sx + 5, lineSigY, sx + sigColW - 5, lineSigY);
    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED_TEXT);
    doc.text('Signature', sx + 5, lineSigY + 4);

    const lineDateY = sigTop + sigBoxH - 5.5;
    doc.line(sx + 20, lineDateY, sx + sigColW - 5, lineDateY);
    doc.text('Date:', sx + 5, lineDateY - 0.5);
    if (prefillDate) {
      doc.setFont(fontFamily, 'normal');
      doc.setFontSize(8.2);
      doc.setTextColor(...NAVY);
      doc.text(prefillDate, sx + 22, lineDateY - 0.8);
    }
  };

  drawSignatureColumn(MARGIN_X, agencySigTitle, agencyNameLines, agencyRoleLines, contractDateStr);
  drawSignatureColumn(
    MARGIN_X + sigColW + sigColGap,
    clientSigTitle,
    clientNameLines,
    clientRoleLines,
    signedDateDisplay
  );

  // ==================== FOOTER ON ALL PAGES ====================
  const totalPages = doc.getNumberOfPages();
  const footerLeftText = [
    settings.agencyName,
    contractNumber,
    phone,
    ...(email ? [email] : []),
    ...(website ? [website] : []),
  ].join(sep);

  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page);
    doc.setDrawColor(...BORDER_BLUE);
    doc.setLineWidth(0.35);
    doc.line(MARGIN_X, FOOTER_LINE_Y, PAGE_W - MARGIN_X, FOOTER_LINE_Y);

    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED_TEXT);
    const footerLines = wrapText(footerLeftText, CONTENT_W - 28, 8, 'normal');
    doc.text(footerLines[0] || footerLeftText, MARGIN_X, FOOTER_TEXT_Y);

    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...NAVY);
    doc.text(`Page ${page} of ${totalPages}`, PAGE_W - MARGIN_X, FOOTER_TEXT_Y, {
      align: 'right',
    });
  }

  const filename = getContractPdfFilename(businessName, contractNumber);
  return { doc, filename };
}

export async function downloadContractPdf(contract: ContractPdfInput): Promise<string> {
  const { doc, filename } = await buildContractPdfDocument(contract);
  doc.save(filename);
  return filename;
}
