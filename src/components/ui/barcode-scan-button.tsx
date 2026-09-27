import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScanLine, Keyboard, X, Zap, ZapOff } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { BarcodeScanner, BarcodeFormat } from '@capacitor-mlkit/barcode-scanning';
import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

interface BarcodeScanButtonProps {
  onScan: (code: string) => void;
  className?: string;
  size?: 'sm' | 'default' | 'icon';
  label?: string;
  /** Keep the camera open after a successful scan (continuous mode) */
  continuous?: boolean;
}

/**
 * Reusable barcode scanner.
 * On mobile/Android devices (such as Sunmi), uses native Google ML Kit via @capacitor-mlkit/barcode-scanning.
 * On desktop/web fallback, provides a manual input dialog.
 */
export function BarcodeScanButton({
  onScan,
  className,
  size = 'icon',
  label,
  continuous = false,
}: BarcodeScanButtonProps) {
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const listenerRef = useRef<PluginListenerHandle | null>(null);
  const scanningRef = useRef(false);
  const backGuardRef = useRef(false);
  const onScanRef = useRef(onScan);

  // Garde la dernière référence du callback sans relancer une session de scan
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const setScannerClass = (active: boolean) => {
    document.querySelector('body')?.classList.toggle('barcode-scanner-active', active);
  };

  /** Ferme la session de scan et restaure l'interface. Sans effet si déjà arrêtée. */
  const stopScan = useCallback(async () => {
    if (!scanningRef.current) return;
    scanningRef.current = false;

    try { await BarcodeScanner.stopScan(); } catch { /* ignore */ }
    try { await listenerRef.current?.remove(); } catch { /* ignore */ }
    listenerRef.current = null;

    setScannerClass(false);
    setIsScanning(false);
    setTorchAvailable(false);
    setTorchOn(false);

    // Retire l'entrée d'historique ajoutée pour capter le bouton retour matériel
    if (backGuardRef.current) {
      backGuardRef.current = false;
      try {
        if (window.history.state?.barcodeScanner) window.history.back();
      } catch { /* ignore */ }
    }
  }, []);

  /**
   * Ouvre la session de scan native (ML Kit) avec superposition de visée.
   * La caméra native est affichée derrière la WebView par le plugin : seule
   * la superposition .scanner-overlay reste visible par-dessus.
   */
  const startScan = useCallback(async () => {
    if (scanningRef.current) return;

    try {
      // Sur PC / navigateur : saisie manuelle (clavier ou douchette USB)
      if (!Capacitor.isNativePlatform()) {
        setManualOpen(true);
        return;
      }

      const permission = await BarcodeScanner.requestPermissions();
      if (permission.camera !== 'granted') {
        toast.error('Permission caméra refusée');
        return;
      }

      // Le plugin ne gère pas le bouton retour Android : on pousse une entrée
      // d'historique pour l'intercepter et fermer proprement le scan (popstate).
      try {
        window.history.pushState({ ...(window.history.state || {}), barcodeScanner: true }, '');
        backGuardRef.current = true;
      } catch {
        backGuardRef.current = false;
      }

      scanningRef.current = true;
      setIsScanning(true);
      setScannerClass(true);

      listenerRef.current = await BarcodeScanner.addListener('barcodesScanned', async (result) => {
        if (!scanningRef.current) return;

        const barcode = result.barcodes?.[0]?.displayValue || result.barcodes?.[0]?.rawValue;
        if (!barcode) return;
        const trimmed = barcode.trim();
        if (!trimmed) return;

        try { navigator.vibrate?.(60); } catch { /* ignore */ }
        onScanRef.current(trimmed);
        toast.success(`Code scanné : ${trimmed}`);

        if (!continuous) await stopScan();
      });

      await BarcodeScanner.startScan({
        formats: [
          BarcodeFormat.Code128,
          BarcodeFormat.Code39,
          BarcodeFormat.Code93,
          BarcodeFormat.Ean13,
          BarcodeFormat.Ean8,
          BarcodeFormat.UpcA,
          BarcodeFormat.UpcE,
          BarcodeFormat.Itf,
          BarcodeFormat.Codabar,
          BarcodeFormat.QrCode,
          BarcodeFormat.DataMatrix,
          BarcodeFormat.Pdf417,
        ],
      });

      // La torche n'est pilotable que pendant une session de scan active
      try {
        const { available } = await BarcodeScanner.isTorchAvailable();
        setTorchAvailable(available);
      } catch {
        setTorchAvailable(false);
      }
    } catch (error: any) {
      toast.error(error?.message || 'Erreur lors du scan caméra');
      await stopScan();
    }
  }, [continuous, stopScan]);

  const handleToggleTorch = async () => {
    try {
      await BarcodeScanner.toggleTorch();
      const { enabled } = await BarcodeScanner.isTorchEnabled();
      setTorchOn(enabled);
    } catch {
      toast.error('Torche indisponible sur cet appareil');
    }
  };

  // Le bouton retour matériel ferme le scan au lieu de quitter l'écran
  useEffect(() => {
    const onPopState = () => {
      if (!scanningRef.current) return;
      backGuardRef.current = false; // l'entrée a déjà été consommée par le système
      void stopScan();
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [stopScan]);

  // Nettoyage si l'écran est démonté pendant un scan
  useEffect(() => () => { void stopScan(); }, [stopScan]);

  const handleManualSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const code = manualCode.trim();
    if (!code) return;
    onScan(code);
    setManualCode('');
    setManualOpen(false);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={size}
        className={cn(size === 'icon' && 'shrink-0', className)}
        onClick={() => void startScan()}
        title="Scanner le code-barres"
      >
        <ScanLine className={cn('w-4 h-4', label && 'mr-1.5')} />
        {label}
      </Button>

      {/* ── Superposition de visée ───────────────────────────────────────────
          La caméra native (ML Kit) est affichée derrière la WebView : seule
          cette superposition reste visible (voir index.css). Elle encadre la
          zone de scan, laisse un bouton d'annulation et la torche. */}
      {isScanning && (
        <div className="scanner-overlay fixed inset-0 z-[9999] flex flex-col items-center justify-between">
          {/* Consigne, en haut */}
          <div className="w-full bg-black/60 px-4 py-4 text-center">
            <p className="text-sm font-medium text-white">Alignez le code-barres dans le cadre</p>
            <p className="mt-0.5 text-xs text-white/70">
              Tenez le colis à 15-25 cm, le code bien éclairé
            </p>
          </div>

          {/* Cadre de visée : le reste de l'écran est assombri par le masque */}
          <div className="relative flex w-full flex-1 items-center justify-center">
            <div className="scanner-mask-frame relative h-36 w-[78%] max-w-md rounded-2xl border-4 border-primary">
              <span className="absolute -left-1 -top-1 h-6 w-6 rounded-tl-2xl border-l-4 border-t-4 border-primary-foreground/80" />
              <span className="absolute -right-1 -top-1 h-6 w-6 rounded-tr-2xl border-r-4 border-t-4 border-primary-foreground/80" />
              <span className="absolute -bottom-1 -left-1 h-6 w-6 rounded-bl-2xl border-b-4 border-l-4 border-primary-foreground/80" />
              <span className="absolute -bottom-1 -right-1 h-6 w-6 rounded-br-2xl border-b-4 border-r-4 border-primary-foreground/80" />
            </div>
          </div>

          {/* Actions, en bas */}
          <div className="w-full bg-black/60 px-4 py-5">
            <div className="flex items-center justify-center gap-3">
              {torchAvailable && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 bg-white/95 px-5 text-base"
                  onClick={() => void handleToggleTorch()}
                >
                  {torchOn ? <ZapOff className="mr-2 h-5 w-5" /> : <Zap className="mr-2 h-5 w-5" />}
                  {torchOn ? 'Éteindre' : 'Torche'}
                </Button>
              )}
              <Button
                type="button"
                variant="destructive"
                className="h-12 px-6 text-base"
                onClick={() => void stopScan()}
              >
                <X className="mr-2 h-5 w-5" />
                Annuler
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Fallback dialog for desktop/web */}
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="w-5 h-5 text-primary" />
              Saisie du code-barres
            </DialogTitle>
            <DialogDescription>
              Le scan par caméra native est actif sur l'application mobile (terminal Sunmi). Sur PC, saisissez le code manuellement ou utilisez une douchette.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleManualSubmit} className="space-y-4 pt-2">
            <Input
              autoFocus
              placeholder="Ex: 3400930000000"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setManualOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={!manualCode.trim()}>
                Valider
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default BarcodeScanButton;
