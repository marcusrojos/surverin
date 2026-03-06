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

export async function generateReceiptPDF(data: ReceiptData) {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const footerHeight = 18;
  const maxY = pageHeight - footerHeight - 5;
  let y = 14;

  const ensureSpace = (needed: number) => {
    if (y + needed > maxY) {
      doc.addPage();
      y = 20;
    }
  };

  const drawFooter = () => {
    const fy = pageHeight - footerHeight;
    doc.setDrawColor(0, 102, 204);
    doc.setLineWidth(0.5);
    doc.line(margin, fy, pageWidth - margin, fy);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text('DPCI - Livraison Express Pharmaceutique', pageWidth / 2, fy + 5, { align: 'center' });
    doc.text(
      `Document généré le ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
      pageWidth / 2, fy + 10, { align: 'center' }
    );
  };

  const drawSectionTitle = (title: string) => {
    ensureSpace(12);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 102, 204);
    doc.text(title, margin, y);
    y += 2;
    doc.setDrawColor(0, 102, 204);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageWidth - margin, y);
    y += 5;
    doc.setTextColor(0, 0, 0);
  };

  const valueX = margin + 52;
  const addField = (label: string, value: string, bold = false) => {
    ensureSpace(8);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(label, margin, y);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    const lines = doc.splitTextToSize(value, pageWidth - valueX - margin);
    doc.text(lines, valueX, y);
    y += 6.5 * (lines.length > 1 ? lines.length * 0.9 : 1);
  };

  try {
    const logoImg = await loadImage(dpciLogo);
    const logoWidth = 25;
    const logoHeight = (logoImg.height / logoImg.width) * logoWidth;
    doc.addImage(logoImg, 'WEBP', margin, y, logoWidth, logoHeight);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('DPCI', margin + logoWidth + 6, y + 8);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Livraison Express Pharmaceutique', margin + logoWidth + 6, y + 14);
    y += Math.max(logoHeight, 18) + 5;
  } catch {
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('DPCI', margin, y + 8);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Livraison Express Pharmaceutique', margin, y + 14);
    y += 20;
  }

  doc.setDrawColor(0, 102, 204);
  doc.setLineWidth(0.8);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  ensureSpace(12);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('BON DE LIVRAISON', pageWidth / 2, y, { align: 'center' });
  y += 10;
  y += 10;

  drawSectionTitle('INFORMATIONS DE LA LIVRAISON');
  addField('Référence :', data.reference, true);
  addField('Date de création :', new Date(data.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }));
  addField('Date de livraison :', new Date(data.deliveredAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }));
  addField('Statut :', 'LIVRÉ ✓', true);
  addField('Mode :', data.isOffline ? 'Hors ligne' : 'En ligne', true);
  if (data.isOffline) {
    ensureSpace(12);
    y += 1;
    doc.setFillColor(255, 243, 205);
    doc.setDrawColor(255, 193, 7);
    doc.setLineWidth(0.5);
    doc.rect(margin, y, pageWidth - margin * 2, 8, 'FD');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(133, 100, 4);
    doc.text('Livraison validée hors connexion – position GPS non vérifiée', margin + 3, y + 5);
    doc.setTextColor(0, 0, 0);
    y += 11;
  }
  if (data.verificationCode) addField('Code de vérification :', data.verificationCode);
  y += 2;

  drawSectionTitle('PHARMACIE DESTINATAIRE');
  addField('Pharmacie :', data.pharmacyName);
  if (data.pharmacyClientCode) addField('Code client :', data.pharmacyClientCode);
  if (data.pharmacyAddress) addField('Adresse :', data.pharmacyAddress);
  if (data.pharmacyPhone) addField('Téléphone :', data.pharmacyPhone);
  if (data.pharmacyEmail) addField('Email :', data.pharmacyEmail);
  if (!data.isOffline && data.pharmacyLatitude && data.pharmacyLongitude) {
    addField('Position GPS :', `${data.pharmacyLatitude.toFixed(6)}, ${data.pharmacyLongitude.toFixed(6)}`);
  }
  y += 2;

  if (data.driverName || data.driverEmail) {
    drawSectionTitle('LIVREUR');
    if (data.driverName) addField('Nom du livreur :', data.driverName);
    if (data.driverEmail) addField('Email du livreur :', data.driverEmail);
    if (!data.isOffline && data.driverLatitude && data.driverLongitude) {
      addField('Position GPS livreur :', `${data.driverLatitude.toFixed(6)}, ${data.driverLongitude.toFixed(6)}`);
    }
    // Geofence compliance — only for online deliveries
    if (!data.isOffline && data.driverLatitude && data.driverLongitude && data.pharmacyLatitude && data.pharmacyLongitude) {
      const dist = calculateDistance(data.driverLatitude, data.driverLongitude, data.pharmacyLatitude, data.pharmacyLongitude);
      const radius = data.geofenceRadius || 20;
      const withinZone = dist <= radius;
      const distStr = dist < 1000 ? `${Math.round(dist)} m` : `${(dist / 1000).toFixed(1)} km`;
      addField('Distance pharmacie :', `${distStr} (périmètre autorisé : ${radius}m)`);
      addField('Périmètre respecté :', withinZone ? '✓ Oui' : '✗ Non', true);
    }
    y += 2;
  }

  const totalSent = (data.nb_cartons || 0) + (data.nb_sachets || 0) + (data.nb_barques || 0);
  const hasPackages = (data.packages && data.packages.length > 0) || totalSent > 0;

  if (hasPackages) {
    drawSectionTitle('DÉTAIL DES COLIS');
    ensureSpace(12);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('Type', margin + 5, y);
    doc.text('Envoyé(s)', margin + 55, y);
    doc.text('Reçu(s)', margin + 90, y);
    doc.text('Écart', margin + 125, y);
    y += 2;
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    doc.line(margin + 5, y, margin + 150, y);
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
        ensureSpace(6);
        const ecart = t.received != null ? t.received - t.sent : null;
        const ecartStr = ecart != null ? (ecart === 0 ? '—' : (ecart > 0 ? `+${ecart}` : String(ecart))) : '—';
        if (ecart != null && ecart !== 0) hasDiscrepancy = true;

        doc.setTextColor(0, 0, 0);
        doc.text(t.label, margin + 5, y);
        doc.text(String(t.sent), margin + 65, y);
        doc.text(t.received != null ? String(t.received) : '—', margin + 97, y);

        if (ecart != null && ecart < 0) doc.setTextColor(200, 60, 60);
        else if (ecart != null && ecart > 0) doc.setTextColor(30, 150, 30);
        else doc.setTextColor(100, 100, 100);
        doc.text(ecartStr, margin + 132, y);
        doc.setTextColor(0, 0, 0);
        y += 6;
      }
    }

    if (hasDiscrepancy) {
      ensureSpace(12);
      y += 1;
      doc.setFillColor(255, 243, 205);
      doc.setDrawColor(255, 193, 7);
      doc.setLineWidth(0.5);
      doc.rect(margin, y, pageWidth - margin * 2, 8, 'FD');
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(133, 100, 4);
      doc.text('⚠ Des écarts ont été constatés entre les quantités envoyées et reçues.', margin + 3, y + 5);
      doc.setTextColor(0, 0, 0);
      y += 11;
    }

    if (data.packages && data.packages.length > 0) {
      ensureSpace(12);
      y += 1;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('Références individuelles :', margin, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      for (const pkg of data.packages) {
        ensureSpace(6);
        const typeLabel = pkg.type === 'barque' ? 'Bac' : pkg.type ? pkg.type.charAt(0).toUpperCase() + pkg.type.slice(1) : 'Colis';
        doc.text(`• ${typeLabel} — ${pkg.reference || 'Sans réf.'}`, margin + 5, y);
        y += 5;
      }
    }
    y += 2;
  }

  drawSectionTitle('VALIDATION DE LIVRAISON');
  addField('Réceptionnaire :', data.recipientName);
  y += 2;

  ensureSpace(8);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Signature du réceptionnaire :', margin, y);
  y += 5;

  if (data.recipientSignature) {
    try {
      const sigImg = await loadImage(data.recipientSignature);
      const maxSigW = 60;
      const maxSigH = 28;
      const ratio = sigImg.height / sigImg.width;
      let sigWidth = maxSigW;
      let sigHeight = ratio * sigWidth;
      if (sigHeight > maxSigH) {
        sigHeight = maxSigH;
        sigWidth = sigHeight / ratio;
      }
      ensureSpace(sigHeight + 10);
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.rect(margin, y, sigWidth + 8, sigHeight + 6);
      doc.addImage(sigImg, 'PNG', margin + 4, y + 3, sigWidth, sigHeight);
      y += sigHeight + 12;
    } catch {
      ensureSpace(10);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(100, 100, 100);
      doc.text('Signature non disponible', margin, y + 5);
      y += 10;
    }
  } else {
    ensureSpace(10);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100, 100, 100);
    doc.text('Pas de signature enregistrée', margin, y + 5);
    y += 10;
  }

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

  // Header
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('DPCI — Bon de livraison (hors-ligne)', pageWidth / 2, y + 5, { align: 'center' });
  y += 15;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Référence : ${reference}`, margin, y);
  y += 7;
  doc.text(`Date de livraison : ${new Date(deliveredAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`, margin, y);
  y += 10;

  // Add photo
  try {
    const img = await loadImage(photoBase64);
    const maxW = pageWidth - margin * 2;
    const maxH = 200;
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

  // Return as base64 data URI
  return doc.output('datauristring');
}
