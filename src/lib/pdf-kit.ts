import jsPDF from 'jspdf';
import dpciLogo from '@/assets/dpci-logo.png';
import { Capacitor } from '@capacitor/core';

/**
 * Save a jsPDF document, handling both Web and native (Capacitor) runtimes.
 * - Web: triggers a normal browser download (doc.save).
 * - Native (Android/iOS): writes the PDF as Base64 to Directory.Documents and
 *   opens it with the system viewer so the user can view/print/save it.
 */
export async function savePdfDoc(doc: jsPDF, fileName: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    doc.save(fileName);
    return;
  }

  try {
    // jsPDF datauristring -> strip the "data:application/pdf;...;base64," prefix
    const dataUri = doc.output('datauristring');
    const base64Data = dataUri.substring(dataUri.indexOf(',') + 1);

    const [{ Filesystem, Directory }, { FileOpener }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor-community/file-opener'),
    ]);

    await Filesystem.writeFile({
      path: fileName,
      data: base64Data,
      directory: Directory.Documents,
      recursive: true,
    });

    const { uri } = await Filesystem.getUri({
      directory: Directory.Documents,
      path: fileName,
    });

    await FileOpener.open({
      filePath: uri,
      contentType: 'application/pdf',
    });
  } catch (err) {
    // Fallback to a regular download if native handling fails
    console.error('Native PDF save failed, falling back to download', err);
    doc.save(fileName);
  }
}

// ── DPCI brand palette (HSL 152 72% 30%) ──
export const BRAND_GREEN = { r: 21, g: 131, b: 82 };
export const BRAND_DARK = { r: 18, g: 46, b: 34 };
export const BRAND_LIGHT_BG = { r: 234, g: 247, b: 241 };
export const TEXT_DARK = { r: 30, g: 30, b: 30 };
export const TEXT_MUTED = { r: 120, g: 120, b: 120 };
export const BORDER_LIGHT = { r: 200, g: 220, b: 210 };
export const ROW_ALT = { r: 244, g: 250, b: 247 };

type RGB = { r: number; g: number; b: number };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export function formatDateFR(dateStr: string | Date): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export const PDF_MARGIN = 15;
const FOOTER_HEIGHT = 18;

export interface PdfDoc {
  doc: jsPDF;
  pageWidth: number;
  pageHeight: number;
  margin: number;
  contentWidth: number;
  maxY: number;
  y: number;
  docTitle: string;
}

const setText = (doc: jsPDF, c: RGB) => doc.setTextColor(c.r, c.g, c.b);
const setDraw = (doc: jsPDF, c: RGB) => doc.setDrawColor(c.r, c.g, c.b);
const setFill = (doc: jsPDF, c: RGB) => doc.setFillColor(c.r, c.g, c.b);

/**
 * Create a branded DPCI document and draw the header. Returns a context object.
 */
export async function createPdf(
  title: string,
  orientation: 'p' | 'l' = 'p',
  subtitle?: string,
): Promise<PdfDoc> {
  const doc = new jsPDF(orientation, 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = PDF_MARGIN;
  const contentWidth = pageWidth - margin * 2;
  const ctx: PdfDoc = {
    doc, pageWidth, pageHeight, margin, contentWidth,
    maxY: pageHeight - FOOTER_HEIGHT - 4,
    y: 10,
    docTitle: title,
  };

  // top accent line
  setFill(doc, BRAND_GREEN);
  doc.rect(0, 0, pageWidth, 3, 'F');
  ctx.y = 10;

  // logo + wordmark
  try {
    const logoImg = await loadImage(dpciLogo);
    const logoW = 20;
    const logoH = (logoImg.height / logoImg.width) * logoW;
    doc.addImage(logoImg, 'PNG', margin, ctx.y, logoW, logoH);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    setText(doc, BRAND_DARK);
    doc.text('DPCI', margin + logoW + 5, ctx.y + 7);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    setText(doc, TEXT_MUTED);
    doc.text('Livraison Express Pharmaceutique', margin + logoW + 5, ctx.y + 12);
    ctx.y += Math.max(logoH, 16) + 4;
  } catch {
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    setText(doc, BRAND_DARK);
    doc.text('DPCI', margin, ctx.y + 7);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    setText(doc, TEXT_MUTED);
    doc.text('Livraison Express Pharmaceutique', margin, ctx.y + 12);
    ctx.y += 18;
  }

  // title bar
  setFill(doc, BRAND_GREEN);
  doc.roundedRect(margin, ctx.y, contentWidth, 12, 2, 2, 'F');
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(title.toUpperCase(), pageWidth / 2, ctx.y + 8.5, { align: 'center' });
  ctx.y += 17;

  if (subtitle) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    setText(doc, TEXT_MUTED);
    doc.text(subtitle, pageWidth / 2, ctx.y, { align: 'center' });
    ctx.y += 6;
  }
  setText(doc, TEXT_DARK);
  return ctx;
}

export function ensureSpace(ctx: PdfDoc, needed: number) {
  if (ctx.y + needed > ctx.maxY) {
    ctx.doc.addPage();
    ctx.y = 18;
  }
}

/** Section header with brand accent bar. */
export function sectionTitle(ctx: PdfDoc, title: string) {
  const { doc, margin } = ctx;
  ensureSpace(ctx, 14);
  ctx.y += 2;
  setFill(doc, BRAND_GREEN);
  doc.rect(margin, ctx.y - 3, 3, 10, 'F');
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  setText(doc, BRAND_DARK);
  doc.text(title, margin + 6, ctx.y + 4);
  ctx.y += 12;
  setText(doc, TEXT_DARK);
}

/** Key/value field row. */
export function field(ctx: PdfDoc, label: string, value: string, bold = false) {
  const { doc, margin, pageWidth } = ctx;
  const valueX = margin + 50;
  ensureSpace(ctx, 8);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  setText(doc, TEXT_MUTED);
  doc.text(label, margin + 6, ctx.y);
  doc.setFont('helvetica', bold ? 'bold' : 'normal');
  setText(doc, TEXT_DARK);
  const lines = doc.splitTextToSize(value, pageWidth - valueX - margin);
  doc.text(lines, valueX, ctx.y);
  ctx.y += 5.5 * Math.max(1, lines.length * 0.9);
}

export function infoBox(ctx: PdfDoc, text: string, type: 'warning' | 'success' | 'info' = 'info') {
  const { doc, margin, contentWidth } = ctx;
  ensureSpace(ctx, 14);
  ctx.y += 1;
  if (type === 'warning') {
    doc.setFillColor(255, 243, 205);
    doc.setDrawColor(255, 193, 7);
  } else if (type === 'success') {
    doc.setFillColor(220, 252, 231);
    setDraw(doc, BRAND_GREEN);
  } else {
    setFill(doc, BRAND_LIGHT_BG);
    setDraw(doc, BRAND_GREEN);
  }
  doc.setLineWidth(0.5);
  doc.roundedRect(margin, ctx.y, contentWidth, 9, 1.5, 1.5, 'FD');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  if (type === 'warning') doc.setTextColor(133, 100, 4);
  else if (type === 'success') setText(doc, BRAND_GREEN);
  else setText(doc, BRAND_DARK);
  doc.text(text, margin + 4, ctx.y + 6);
  setText(doc, TEXT_DARK);
  ctx.y += 13;
}

export interface TableColumn {
  header: string;
  /** width in mm */
  width: number;
  align?: 'left' | 'right' | 'center';
}

/**
 * Striped table with branded header that repeats on page breaks.
 * Each row is an array of cell strings matching columns.
 */
export function table(ctx: PdfDoc, columns: TableColumn[], rows: string[][]) {
  const { doc, margin, contentWidth } = ctx;
  const rowH = 7;
  const headerH = 8;

  // scale columns to content width
  const totalW = columns.reduce((s, c) => s + c.width, 0);
  const scale = contentWidth / totalW;
  const widths = columns.map((c) => c.width * scale);
  const xs: number[] = [];
  let acc = margin;
  for (const w of widths) { xs.push(acc); acc += w; }

  const cellX = (i: number, align: TableColumn['align']) => {
    if (align === 'right') return xs[i] + widths[i] - 2;
    if (align === 'center') return xs[i] + widths[i] / 2;
    return xs[i] + 2;
  };

  const drawHeader = () => {
    setFill(doc, BRAND_GREEN);
    doc.roundedRect(margin, ctx.y, contentWidth, headerH, 1, 1, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    columns.forEach((c, i) => {
      doc.text(c.header, cellX(i, c.align), ctx.y + 5.4, { align: c.align === 'left' ? undefined : c.align });
    });
    ctx.y += headerH;
  };

  ensureSpace(ctx, headerH + rowH);
  drawHeader();

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  rows.forEach((row, idx) => {
    if (ctx.y + rowH > ctx.maxY) {
      ctx.doc.addPage();
      ctx.y = 18;
      drawHeader();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
    }
    if (idx % 2 === 1) {
      setFill(doc, ROW_ALT);
      doc.rect(margin, ctx.y, contentWidth, rowH, 'F');
    }
    setText(doc, TEXT_DARK);
    columns.forEach((c, i) => {
      const maxChars = Math.floor(widths[i] / 1.6);
      let txt = row[i] ?? '';
      if (txt.length > maxChars) txt = txt.slice(0, maxChars - 1) + '…';
      doc.text(txt, cellX(i, c.align), ctx.y + 4.8, { align: c.align === 'left' ? undefined : c.align });
    });
    ctx.y += rowH;
  });

  // bottom border
  setDraw(doc, BORDER_LIGHT);
  doc.setLineWidth(0.3);
  doc.line(margin, ctx.y, ctx.pageWidth - margin, ctx.y);
  ctx.y += 4;
}

/** Apply branded footer to every page and save the file. */
export function finalizePdf(ctx: PdfDoc, fileName: string) {
  const { doc, pageWidth, pageHeight, margin } = ctx;
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    const fy = pageHeight - FOOTER_HEIGHT;
    setDraw(doc, BRAND_GREEN);
    doc.setLineWidth(0.6);
    doc.line(margin, fy, pageWidth - margin, fy);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    setText(doc, TEXT_MUTED);
    doc.text('DPCI — Livraison Express Pharmaceutique', margin, fy + 5);
    doc.text(ctx.docTitle, pageWidth - margin, fy + 5, { align: 'right' });
    doc.text(`Document généré le ${formatDateFR(new Date())}`, margin, fy + 9.5);
    doc.text(`Page ${p}/${totalPages}`, pageWidth - margin, fy + 9.5, { align: 'right' });
  }
  doc.save(fileName);
}
