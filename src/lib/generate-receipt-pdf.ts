import jsPDF from 'jspdf';
import dpciLogo from '@/assets/dpci-logo.webp';

interface PackageItem {
  type: string;
  reference: string;
}

interface ReceiptData {
  reference: string;
  pharmacyName: string;
  pharmacyAddress: string | null;
  pharmacyClientCode?: string | null;
  pharmacyPhone?: string | null;
  pharmacyEmail?: string | null;
  recipientName: string;
  recipientSignature: string | null;
  deliveredAt: string;
  createdAt: string;
  driverName?: string | null;
  driverEmail?: string;
  verificationCode?: string | null;
  nb_cartons?: number;
  nb_sachets?: number;
  nb_barques?: number;
  nb_cartons_received?: number | null;
  nb_sachets_received?: number | null;
  nb_barques_received?: number | null;
  packages?: PackageItem[];
  // GPS data
  pharmacyLatitude?: number | null;
  pharmacyLongitude?: number | null;
  driverLatitude?: number | null;
  driverLongitude?: number | null;
  geofenceRadius?: number;
  // Online/offline status
  isOffline?: boolean;
}

// DPCI Brand Colors (HSL 152 72% 30% → RGB)
const BRAND_GREEN = { r: 21, g: 131, b: 82 };   // Primary green
const BRAND_DARK = { r: 18, g: 46, b: 34 };      // Dark green (secondary)
const BRAND_LIGHT_BG = { r: 234, g: 247, b: 241 }; // Light green background
const TEXT_DARK = { r: 30, g: 30, b: 30 };
const TEXT_MUTED = { r: 120, g: 120, b: 120 };
const BORDER_LIGHT = { r: 200, g: 220, b: 210 };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function calculateDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDateFR(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

export async function generateReceiptPDF(data: ReceiptData) {
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

  // ── Footer ──
  const drawFooter = () => {
    const fy = pageHeight - footerHeight;
    setDrawCol(BRAND_GREEN);
    doc.setLineWidth(0.6);
    doc.line(margin, fy, pageWidth - margin, fy);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    setColor(TEXT_MUTED);
    doc.text('DPCI — Livraison Express Pharmaceutique', margin, fy + 5);
    doc.text(`ID: ${data.reference}`, pageWidth - margin, fy + 5, { align: 'right' });
    doc.text(
      `Document généré le ${formatDateFR(new Date().toISOString())}`,
      margin, fy + 10
    );
    const totalPages = (doc as any).internal.getNumberOfPages();
    const currentPage = (doc as any).internal.getCurrentPageInfo().pageNumber;
    doc.text(`Page ${currentPage}/${totalPages}`, pageWidth - margin, fy + 10, { align: 'right' });
  };

  // ── Section title with brand accent ──
  const drawSectionTitle = (title: string) => {
    ensureSpace(14);
    y += 2;
    setFillCol(BRAND_GREEN);
    doc.rect(margin, y - 3, 3, 10, 'F'); // Accent bar
    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'bold');
    setColor(BRAND_DARK);
    doc.text(title, margin + 6, y + 4);
    y += 12;
  };

  const valueX = margin + 50;
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

  // ══════════════════════════════════════════════
  //                 HEADER / LOGO
  // ══════════════════════════════════════════════

  // Top accent line
  setFillCol(BRAND_GREEN);
  doc.rect(0, 0, pageWidth, 3, 'F');
  y = 10;

  try {
    const logoImg = await loadImage(dpciLogo);
    const logoWidth = 22;
    const logoHeight = (logoImg.height / logoImg.width) * logoWidth;
    doc.addImage(logoImg, 'WEBP', margin, y, logoWidth, logoHeight);
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
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    setColor(TEXT_MUTED);
    doc.text('Livraison Express Pharmaceutique', margin, y + 12);
    y += 18;
  }

  // Title bar
  ensureSpace(16);
  setFillCol(BRAND_GREEN);
  doc.roundedRect(margin, y, contentWidth, 12, 2, 2, 'F');
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('BON DE LIVRAISON', pageWidth / 2, y + 8.5, { align: 'center' });
  y += 18;

  // ══════════════════════════════════════════════
  //            DELIVERY INFORMATION
  // ══════════════════════════════════════════════

  drawSectionTitle('INFORMATIONS DE LA LIVRAISON');
  addField('Référence :', data.reference, true);
  addField('Identifiant :', data.reference, false);
  addField('Date de création :', formatDateFR(data.createdAt));
  addField('Date de livraison :', formatDateFR(data.deliveredAt));
  addField('Statut :', 'LIVRÉ ✓', true);
  addField('Mode :', data.isOffline ? 'Hors ligne (offline)' : 'En ligne (online)', true);

  if (data.isOffline) {
    addInfoBox('⚠ Livraison validée hors connexion – position GPS non vérifiée', 'warning');
  }

  if (data.verificationCode) addField('Code vérification :', data.verificationCode);

  // ══════════════════════════════════════════════
  //               PHARMACY
  // ══════════════════════════════════════════════

  drawSectionTitle('PHARMACIE DESTINATAIRE');
  addField('Pharmacie :', data.pharmacyName);
  if (data.pharmacyClientCode) addField('Code client :', data.pharmacyClientCode);
  if (data.pharmacyAddress) addField('Adresse :', data.pharmacyAddress);
  if (data.pharmacyPhone) addField('Téléphone :', data.pharmacyPhone);
  if (data.pharmacyEmail) addField('Email :', data.pharmacyEmail);
  if (!data.isOffline && data.pharmacyLatitude && data.pharmacyLongitude) {
    addField('Position GPS :', `${data.pharmacyLatitude.toFixed(6)}, ${data.pharmacyLongitude.toFixed(6)}`);
  }

  // ══════════════════════════════════════════════
  //                  DRIVER
  // ══════════════════════════════════════════════

  if (data.driverName || data.driverEmail) {
    drawSectionTitle('LIVREUR');
    if (data.driverName) addField('Nom :', data.driverName);
    if (data.driverEmail) addField('Email :', data.driverEmail);
    if (!data.isOffline && data.driverLatitude && data.driverLongitude) {
      addField('Position GPS :', `${data.driverLatitude.toFixed(6)}, ${data.driverLongitude.toFixed(6)}`);
    }
    // Geofence compliance — only for online deliveries
    if (!data.isOffline && data.driverLatitude && data.driverLongitude && data.pharmacyLatitude && data.pharmacyLongitude) {
      const dist = calculateDistance(data.driverLatitude, data.driverLongitude, data.pharmacyLatitude, data.pharmacyLongitude);
      const radius = data.geofenceRadius || 20;
      const withinZone = dist <= radius;
      const distStr = dist < 1000 ? `${Math.round(dist)} m` : `${(dist / 1000).toFixed(1)} km`;
      addField('Distance :', `${distStr} (périmètre autorisé : ${radius}m)`);

      if (withinZone) {
        addInfoBox(`✓ Périmètre de sécurité respecté (${distStr} ≤ ${radius}m)`, 'success');
      } else {
        addInfoBox(`✗ Périmètre de sécurité NON respecté (${distStr} > ${radius}m)`, 'warning');
      }
    }
  }

  // ══════════════════════════════════════════════
  //               PACKAGES TABLE
  // ══════════════════════════════════════════════

  const totalSent = (data.nb_cartons || 0) + (data.nb_sachets || 0) + (data.nb_barques || 0);
  const hasPackages = (data.packages && data.packages.length > 0) || totalSent > 0;

  if (hasPackages) {
    drawSectionTitle('DÉTAIL DES COLIS');
    ensureSpace(14);

    // Table header
    const colX = [margin + 6, margin + 50, margin + 85, margin + 120];
    setFillCol(BRAND_LIGHT_BG);
    doc.roundedRect(margin, y - 3, contentWidth, 8, 1, 1, 'F');
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    setColor(BRAND_DARK);
    doc.text('Type', colX[0], y + 2);
    doc.text('Envoyé(s)', colX[1], y + 2);
    doc.text('Reçu(s)', colX[2], y + 2);
    doc.text('Écart', colX[3], y + 2);
    y += 8;
    setDrawCol(BORDER_LIGHT);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageWidth - margin, y);
    y += 4;

    const types = [
      { label: 'Carton(s)', sent: data.nb_cartons || 0, received: data.nb_cartons_received },
      { label: 'Sachet(s)', sent: data.nb_sachets || 0, received: data.nb_sachets_received },
      { label: 'Bac(s)', sent: data.nb_barques || 0, received: data.nb_barques_received },
    ];

    let hasDiscrepancy = false;
    doc.setFont('helvetica', 'normal');
    for (const t of types) {
      if (t.sent > 0 || (t.received != null && t.received > 0)) {
        ensureSpace(7);
        const ecart = t.received != null ? t.received - t.sent : null;
        const ecartStr = ecart != null ? (ecart === 0 ? '—' : (ecart > 0 ? `+${ecart}` : String(ecart))) : '—';
        if (ecart != null && ecart !== 0) hasDiscrepancy = true;

        doc.setFontSize(8.5);
        setColor(TEXT_DARK);
        doc.text(t.label, colX[0], y);
        doc.text(String(t.sent), colX[1] + 8, y);
        doc.text(t.received != null ? String(t.received) : '—', colX[2] + 5, y);

        if (ecart != null && ecart < 0) doc.setTextColor(200, 60, 60);
        else if (ecart != null && ecart > 0) doc.setTextColor(30, 150, 30);
        else setColor(TEXT_MUTED);
        doc.setFont('helvetica', 'bold');
        doc.text(ecartStr, colX[3] + 3, y);
        doc.setFont('helvetica', 'normal');
        setColor(TEXT_DARK);
        y += 6;
      }
    }

    if (hasDiscrepancy) {
      addInfoBox('⚠ Des écarts ont été constatés entre les quantités envoyées et reçues.', 'warning');
    }

    if (data.packages && data.packages.length > 0) {
      ensureSpace(12);
      y += 1;
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      setColor(BRAND_DARK);
      doc.text('Références individuelles :', margin + 6, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      setColor(TEXT_DARK);
      for (const pkg of data.packages) {
        ensureSpace(6);
        const typeLabel = pkg.type === 'barque' ? 'Bac' : pkg.type ? pkg.type.charAt(0).toUpperCase() + pkg.type.slice(1) : 'Colis';
        doc.text(`• ${typeLabel} — ${pkg.reference || 'Sans réf.'}`, margin + 8, y);
        y += 5;
      }
    }
  }

  // ══════════════════════════════════════════════
  //              SIGNATURE
  // ══════════════════════════════════════════════

  drawSectionTitle('VALIDATION DE LIVRAISON');
  addField('Réceptionnaire :', data.recipientName);
  y += 2;

  ensureSpace(8);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  setColor(TEXT_MUTED);
  doc.text('Signature du réceptionnaire :', margin + 6, y);
  y += 5;

  if (data.recipientSignature) {
    try {
      const sigImg = await loadImage(data.recipientSignature);
      const maxSigW = 55;
      const maxSigH = 25;
      const ratio = sigImg.height / sigImg.width;
      let sigWidth = maxSigW;
      let sigHeight = ratio * sigWidth;
      if (sigHeight > maxSigH) {
        sigHeight = maxSigH;
        sigWidth = sigHeight / ratio;
      }
      ensureSpace(sigHeight + 10);
      setDrawCol(BORDER_LIGHT);
      doc.setLineWidth(0.3);
      doc.roundedRect(margin + 6, y, sigWidth + 8, sigHeight + 6, 1.5, 1.5);
      doc.addImage(sigImg, 'PNG', margin + 10, y + 3, sigWidth, sigHeight);
      y += sigHeight + 12;
    } catch {
      ensureSpace(10);
      doc.setFont('helvetica', 'italic');
      setColor(TEXT_MUTED);
      doc.text('Signature non disponible', margin + 6, y + 5);
      y += 10;
    }
  } else {
    ensureSpace(10);
    doc.setFont('helvetica', 'italic');
    setColor(TEXT_MUTED);
    doc.text('Pas de signature enregistrée', margin + 6, y + 5);
    y += 10;
  }

  // ══════════════════════════════════════════════
  //               TRACEABILITY
  // ══════════════════════════════════════════════

  ensureSpace(20);
  y += 3;
  setDrawCol(BORDER_LIGHT);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  setColor(TEXT_MUTED);
  doc.text(`Identifiant unique de livraison : ${data.reference}`, margin, y);
  y += 4;
  doc.text(`Bon créé le : ${formatDateFR(new Date().toISOString())}`, margin, y);
  y += 4;
  doc.text(`Mode de validation : ${data.isOffline ? 'Hors connexion' : 'En ligne — GPS vérifié'}`, margin, y);

  // ── Apply footers to all pages ──
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter();
  }

  doc.save(`bon-livraison-${data.reference}.pdf`);
}

/**
 * Generate a PDF from a base64 photo (used for offline delivery validation)
 */
export async function generatePhotoPDF(photoBase64: string, reference: string, deliveredAt: string): Promise<string> {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = 14;

  // Top accent bar
  doc.setFillColor(BRAND_GREEN.r, BRAND_GREEN.g, BRAND_GREEN.b);
  doc.rect(0, 0, pageWidth, 3, 'F');
  y = 10;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(BRAND_DARK.r, BRAND_DARK.g, BRAND_DARK.b);
  doc.text('DPCI — Bon de livraison (hors-ligne)', pageWidth / 2, y + 5, { align: 'center' });
  y += 15;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(TEXT_DARK.r, TEXT_DARK.g, TEXT_DARK.b);
  doc.text(`Référence : ${reference}`, margin, y);
  y += 7;
  doc.text(`Date de livraison : ${formatDateFR(deliveredAt)}`, margin, y);
  y += 7;

  // Offline notice
  doc.setFillColor(255, 243, 205);
  doc.setDrawColor(255, 193, 7);
  doc.setLineWidth(0.5);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 9, 1.5, 1.5, 'FD');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(133, 100, 4);
  doc.text('Livraison validée hors connexion – position GPS non vérifiée', margin + 4, y + 6);
  y += 14;

  // Add photo
  try {
    const img = await loadImage(photoBase64);
    const maxW = pageWidth - margin * 2;
    const maxH = 190;
    const ratio = img.height / img.width;
    let w = maxW;
    let h = ratio * w;
    if (h > maxH) {
      h = maxH;
      w = h / ratio;
    }
    doc.addImage(img, 'JPEG', margin, y, w, h);
  } catch {
    doc.text('Photo non disponible', margin, y + 10);
  }

  return doc.output('datauristring');
}
