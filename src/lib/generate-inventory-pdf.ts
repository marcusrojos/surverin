import jsPDF from 'jspdf';
import { PDF_LOGO_DATA_URL as dpciLogo, loadPdfImage } from '@/lib/pdf-assets';
import { savePdfDoc } from '@/lib/pdf-kit';

interface InventoryScan {
  barcode: string;
  status: string;
  type: string | null;
  pharmacy_name: string | null;
}

interface InventoryPDFData {
  parcoursName: string;
  axisName: string;
  driverName: string;
  createdAt: string;
  completedAt: string | null;
  status: string;
  pharmacies: { name: string; position: number }[];
  expectedColis: { barcode: string; type: string; pharmacyName: string }[];
  scans: InventoryScan[];
  totalExpected: number;
  totalScanned: number;
  totalMissing: number;
  totalExtra: number;
  forceConfirmed: boolean;
  forceConfirmedBy: string | null;
  forceConfirmedAt: string | null;
  forceConfirmedReason: string | null;
  inventoryNotes: string | null;
}

const BRAND_GREEN = { r: 21, g: 131, b: 82 };
const BRAND_DARK = { r: 18, g: 46, b: 34 };
const BRAND_LIGHT_BG = { r: 234, g: 247, b: 241 };
const TEXT_DARK = { r: 30, g: 30, b: 30 };
const TEXT_MUTED = { r: 120, g: 120, b: 120 };
const BORDER_LIGHT = { r: 200, g: 220, b: 210 };

const loadImage = loadPdfImage;

function formatDateFR(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

export async function generateInventoryPDF(data: InventoryPDFData) {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  const footerHeight = 20;
  const maxY = pageHeight - footerHeight - 5;
  let y = 14;

  const ensureSpace = (needed: number) => {
    if (y + needed > maxY) {
      doc.addPage();
      y = 20;
    }
  };

  const setColor = (c: typeof BRAND_GREEN) => doc.setTextColor(c.r, c.g, c.b);
  const setDrawCol = (c: typeof BRAND_GREEN) => doc.setDrawColor(c.r, c.g, c.b);
  const setFillCol = (c: typeof BRAND_GREEN) => doc.setFillColor(c.r, c.g, c.b);

  const drawFooter = () => {
    const fy = pageHeight - footerHeight;
    setDrawCol(BRAND_GREEN);
    doc.setLineWidth(0.6);
    doc.line(margin, fy, pageWidth - margin, fy);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    setColor(TEXT_MUTED);
    doc.text('DPCI — Rapport d\'Inventaire', margin, fy + 5);
    doc.text(`Parcours: ${data.parcoursName}`, pageWidth - margin, fy + 5, { align: 'right' });
    doc.text(`Document généré le ${formatDateFR(new Date().toISOString())}`, margin, fy + 10);
    const totalPages = (doc as any).internal.getNumberOfPages();
    const currentPage = (doc as any).internal.getCurrentPageInfo().pageNumber;
    doc.text(`Page ${currentPage}/${totalPages}`, pageWidth - margin, fy + 10, { align: 'right' });
  };

  const drawSectionTitle = (title: string) => {
    ensureSpace(14);
    y += 2;
    setFillCol(BRAND_GREEN);
    doc.rect(margin, y - 3, 3, 10, 'F');
    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'bold');
    setColor(BRAND_DARK);
    doc.text(title, margin + 6, y + 4);
    y += 12;
  };

  const valueX = margin + 55;
  const addField = (label: string, value: string, bold = false) => {
    ensureSpace(8);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    setColor(TEXT_MUTED);
    doc.text(label, margin + 6, y);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    setColor(TEXT_DARK);
    const lines = doc.splitTextToSize(value, pageWidth - valueX - margin);
    doc.text(lines, valueX, y);
    y += 5.5 * Math.max(1, lines.length * 0.9);
  };

  const addInfoBox = (text: string, type: 'warning' | 'success' | 'info') => {
    ensureSpace(14);
    y += 1;
    if (type === 'warning') {
      doc.setFillColor(255, 243, 205);
      doc.setDrawColor(255, 193, 7);
    } else if (type === 'success') {
      doc.setFillColor(220, 252, 231);
      doc.setDrawColor(BRAND_GREEN.r, BRAND_GREEN.g, BRAND_GREEN.b);
    } else {
      doc.setFillColor(BRAND_LIGHT_BG.r, BRAND_LIGHT_BG.g, BRAND_LIGHT_BG.b);
      doc.setDrawColor(BRAND_GREEN.r, BRAND_GREEN.g, BRAND_GREEN.b);
    }
    doc.setLineWidth(0.5);
    doc.roundedRect(margin, y, contentWidth, 9, 1.5, 1.5, 'FD');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    if (type === 'warning') doc.setTextColor(133, 100, 4);
    else if (type === 'success') setColor(BRAND_GREEN);
    else setColor(BRAND_DARK);
    doc.text(text, margin + 4, y + 6);
    setColor(TEXT_DARK);
    y += 13;
  };

  // ── HEADER ──
  setFillCol(BRAND_GREEN);
  doc.rect(0, 0, pageWidth, 3, 'F');
  y = 10;

  try {
    const logoImg = await loadImage(dpciLogo);
    const logoWidth = 22;
    const logoHeight = (logoImg.height / logoImg.width) * logoWidth;
    doc.addImage(logoImg, 'PNG', margin, y, logoWidth, logoHeight);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    setColor(BRAND_DARK);
    doc.text('DPCI', margin + logoWidth + 5, y + 7);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    setColor(TEXT_MUTED);
    doc.text('Livraison Express Pharmaceutique', margin + logoWidth + 5, y + 12);
    y += Math.max(logoHeight, 16) + 4;
  } catch {
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    setColor(BRAND_DARK);
    doc.text('DPCI', margin, y + 7);
    y += 18;
  }

  // Title bar
  ensureSpace(16);
  setFillCol(BRAND_GREEN);
  doc.roundedRect(margin, y, contentWidth, 12, 2, 2, 'F');
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('RAPPORT D\'INVENTAIRE', pageWidth / 2, y + 8.5, { align: 'center' });
  y += 18;

  // ── GENERAL INFO ──
  drawSectionTitle('INFORMATIONS GÉNÉRALES');
  addField('Parcours :', data.parcoursName, true);
  addField('Axe :', data.axisName);
  addField('Chauffeur :', data.driverName);
  addField('Date de création :', formatDateFR(data.createdAt));
  if (data.completedAt) addField('Date de complétion :', formatDateFR(data.completedAt));
  addField('Statut :', data.status === 'termine' ? 'Terminé' : data.status === 'en_cours' ? 'En cours' : 'En attente inventaire');

  // ── PHARMACIES ──
  drawSectionTitle('PHARMACIES DU PARCOURS');
  const sortedPharmacies = [...data.pharmacies].sort((a, b) => a.position - b.position);
  for (const ph of sortedPharmacies) {
    ensureSpace(6);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    setColor(TEXT_DARK);
    doc.text(`${ph.position + 1}. ${ph.name}`, margin + 6, y);
    y += 5.5;
  }
  y += 2;

  // ── EXPECTED COLIS ──
  drawSectionTitle('COLIS ATTENDUS');
  addField('Total attendu :', `${data.totalExpected} colis`);
  y += 2;

  if (data.expectedColis.length > 0) {
    ensureSpace(12);
    const colX = [margin + 6, margin + 55, margin + 95];
    setFillCol(BRAND_LIGHT_BG);
    doc.roundedRect(margin, y - 3, contentWidth, 8, 1, 1, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    setColor(BRAND_DARK);
    doc.text('Code-barres', colX[0], y + 2);
    doc.text('Type', colX[1], y + 2);
    doc.text('Pharmacie', colX[2], y + 2);
    y += 8;
    setDrawCol(BORDER_LIGHT);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageWidth - margin, y);
    y += 4;

    doc.setFont('helvetica', 'normal');
    setColor(TEXT_DARK);
    for (const colis of data.expectedColis) {
      ensureSpace(6);
      doc.setFontSize(7.5);
      doc.text(colis.barcode, colX[0], y);
      doc.text(colis.type, colX[1], y);
      const phLines = doc.splitTextToSize(colis.pharmacyName, pageWidth - margin - colX[2]);
      doc.text(phLines, colX[2], y);
      y += 5 * Math.max(1, phLines.length);
    }
    y += 3;
  }

  // ── INVENTORY RESULT ──
  drawSectionTitle('RÉSULTAT DE L\'INVENTAIRE');

  const isOk = data.totalMissing === 0 && data.totalExtra === 0;
  addField('Total scanné :', `${data.totalScanned} colis`);
  addField('Colis trouvés :', `${data.totalScanned - data.totalExtra}`);
  addField('Colis manquants :', `${data.totalMissing}`);
  addField('Colis en trop :', `${data.totalExtra}`);
  addField('Résultat :', isOk ? 'CONFORME ✓' : 'ÉCARTS DÉTECTÉS ✗', true);

  if (isOk) {
    addInfoBox('✓ Inventaire conforme — tous les colis attendus ont été retrouvés.', 'success');
  } else {
    addInfoBox('⚠ Des écarts ont été détectés lors de l\'inventaire.', 'warning');
  }

  // ── SCANS DETAIL ──
  // Trust the stored scan statuses when an inventory was actually performed.
  // Only fall back to recomputing from expected colis when no scan rows exist
  // (e.g. legacy inventories). All comparisons are case-insensitive.
  const hasScans = data.scans.length > 0;
  const norm = (s: string) => s.trim().toLowerCase();

  const missingFromScans = data.scans.filter(s => s.status === 'missing');
  let allMissing: InventoryScan[];
  if (hasScans) {
    allMissing = missingFromScans;
  } else {
    const scannedBarcodes = new Set(
      data.scans.filter(s => s.status === 'matched').map(s => norm(s.barcode)),
    );
    allMissing = data.expectedColis
      .filter(c => !scannedBarcodes.has(norm(c.barcode)))
      .map(c => ({ barcode: c.barcode, type: c.type, pharmacy_name: c.pharmacyName, status: 'missing' as const }));
  }

  const extra = data.scans.filter(s => s.status === 'extra');

  if (allMissing.length > 0) {
    drawSectionTitle(`COLIS MANQUANTS (${allMissing.length})`);
    // Table header
    ensureSpace(12);
    const mColX = [margin + 6, margin + 55, margin + 95];
    setFillCol({ r: 255, g: 235, b: 235 });
    doc.roundedRect(margin, y - 3, contentWidth, 8, 1, 1, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(180, 40, 40);
    doc.text('Code-barres', mColX[0], y + 2);
    doc.text('Type', mColX[1], y + 2);
    doc.text('Pharmacie', mColX[2], y + 2);
    y += 8;
    setDrawCol(BORDER_LIGHT);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageWidth - margin, y);
    y += 4;

    for (const s of allMissing) {
      ensureSpace(6);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(200, 60, 60);
      doc.text(`✗ ${s.barcode}`, mColX[0], y);
      doc.text(s.type || '—', mColX[1], y);
      doc.text(s.pharmacy_name || '—', mColX[2], y);
      y += 5.5;
    }
    setColor(TEXT_DARK);
    y += 3;
  }

  if (extra.length > 0) {
    drawSectionTitle(`COLIS EN TROP — NON ATTENDUS (${extra.length})`);
    // Table header
    ensureSpace(12);
    const eColX = [margin + 6, margin + 55, margin + 95];
    setFillCol({ r: 255, g: 245, b: 225 });
    doc.roundedRect(margin, y - 3, contentWidth, 8, 1, 1, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(180, 100, 0);
    doc.text('Code-barres', eColX[0], y + 2);
    doc.text('Type', eColX[1], y + 2);
    doc.text('Pharmacie', eColX[2], y + 2);
    y += 8;
    setDrawCol(BORDER_LIGHT);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageWidth - margin, y);
    y += 4;

    for (const s of extra) {
      ensureSpace(6);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(200, 130, 0);
      doc.text(`+ ${s.barcode}`, eColX[0], y);
      doc.text(s.type || '—', eColX[1], y);
      doc.text(s.pharmacy_name || '—', eColX[2], y);
      y += 5.5;
    }
    setColor(TEXT_DARK);
    y += 3;
  }

  // Matched
  const matched = data.scans.filter(s => s.status === 'matched');
  if (matched.length > 0) {
    drawSectionTitle(`COLIS CONFORMES (${matched.length})`);
    for (const s of matched) {
      ensureSpace(6);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      setColor(BRAND_GREEN);
      const label = `✓ ${s.barcode}`;
      const detail = [s.type, s.pharmacy_name].filter(Boolean).join(' — ');
      doc.text(`${label}${detail ? ` (${detail})` : ''}`, margin + 6, y);
      setColor(TEXT_DARK);
      y += 5.5;
    }
    y += 2;
  }

  // ── FORCE CONFIRMATION ──
  if (data.forceConfirmed) {
    drawSectionTitle('CONFIRMATION FORCÉE');
    addInfoBox('⚠ Ce parcours a été confirmé manuellement par un administrateur.', 'warning');
    if (data.forceConfirmedBy) addField('Confirmé par :', data.forceConfirmedBy);
    if (data.forceConfirmedAt) addField('Date/heure :', formatDateFR(data.forceConfirmedAt));
    if (data.forceConfirmedReason) addField('Motif :', data.forceConfirmedReason);
  }

  // ── NOTES ──
  if (data.inventoryNotes) {
    drawSectionTitle('NOTES');
    ensureSpace(10);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    setColor(TEXT_DARK);
    const noteLines = doc.splitTextToSize(data.inventoryNotes, contentWidth - 12);
    doc.text(noteLines, margin + 6, y);
    y += noteLines.length * 4.5 + 4;
  }

  // ── TRACEABILITY ──
  ensureSpace(20);
  y += 3;
  setDrawCol(BORDER_LIGHT);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  setColor(TEXT_MUTED);
  doc.text(`Parcours : ${data.parcoursName} — Axe : ${data.axisName}`, margin, y);
  y += 4;
  doc.text(`Rapport généré le : ${formatDateFR(new Date().toISOString())}`, margin, y);

  // Footers
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter();
  }

  await savePdfDoc(doc, `inventaire-${data.parcoursName.replace(/\s+/g, "-")}.pdf`);
}
