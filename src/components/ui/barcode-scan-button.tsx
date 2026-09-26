import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScanLine, Keyboard } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { BarcodeScanner, BarcodeFormat } from '@capacitor-mlkit/barcode-scanning';
import { Capacitor } from '@capacitor/core';

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

  const handleNativeScan = async () => {
    try {
      // Check native platform
      if (!Capacitor.isNativePlatform()) {
        setManualOpen(true);
        return;
      }

      // Request camera permissions
      const permission = await BarcodeScanner.requestPermissions();
      if (permission.camera !== 'granted') {
        toast.error('Permission caméra refusée');
        return;
      }

      // Hide webview elements so camera preview is visible behind
      document.querySelector('body')?.classList.add('barcode-scanner-active');

      const listener = await BarcodeScanner.addListener(
        'barcodesScanned',
        async (result) => {
          const barcode = result.barcodes?.[0]?.displayValue || result.barcodes?.[0]?.rawValue;
          if (barcode) {
            const trimmed = barcode.trim();
            if (trimmed) {
              try { navigator.vibrate?.(60); } catch { /* ignore */ }
              onScan(trimmed);
              toast.success(`Code scanné : ${trimmed}`);
            }

            if (!continuous) {
              await listener.remove();
              document.querySelector('body')?.classList.remove('barcode-scanner-active');
              await BarcodeScanner.stopScan();
            }
          }
        }
      );

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
    } catch (error: any) {
      document.querySelector('body')?.classList.remove('barcode-scanner-active');
      await BarcodeScanner.stopScan().catch(() => {});
      toast.error(error?.message || "Erreur lors du scan caméra");
    }
  };

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
        onClick={() => void handleNativeScan()}
        title="Scanner le code-barres"
      >
        <ScanLine className={cn('w-4 h-4', label && 'mr-1.5')} />
        {label}
      </Button>

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
