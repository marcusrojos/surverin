import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { ScanLine, Loader2, CameraOff, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface BarcodeScanButtonProps {
  onScan: (code: string) => void;
  className?: string;
  size?: 'sm' | 'default' | 'icon';
  label?: string;
  /** Keep the camera open after a successful scan (continuous mode) */
  continuous?: boolean;
}

const FORMATS = [
  'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e',
  'itf', 'codabar', 'qr_code', 'data_matrix', 'pdf417',
];

/**
 * Reusable camera barcode scanner.
 * Uses the native BarcodeDetector API when available (fast, hardware accelerated),
 * and falls back to ZXing for browsers/webviews without it.
 */
export function BarcodeScanButton({
  onScan,
  className,
  size = 'icon',
  label,
  continuous = false,
}: BarcodeScanButtonProps) {
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCode, setLastCode] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const zxingControlsRef = useRef<{ stop: () => void } | null>(null);
  const stoppedRef = useRef(false);
  const lastValueRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });

  const stopAll = useCallback(() => {
    stoppedRef.current = true;
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    try { zxingControlsRef.current?.stop(); } catch { /* ignore */ }
    zxingControlsRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const handleResult = useCallback((raw: string) => {
    const code = raw.trim();
    if (!code) return;
    const now = Date.now();
    // Debounce identical reads (avoids duplicate submissions from rapid frames)
    if (lastValueRef.current.code === code && now - lastValueRef.current.at < 1500) return;
    lastValueRef.current = { code, at: now };

    setLastCode(code);
    try { navigator.vibrate?.(60); } catch { /* ignore */ }
    onScan(code);

    if (!continuous) {
      stopAll();
      setOpen(false);
    }
  }, [continuous, onScan, stopAll]);

  const start = useCallback(async () => {
    setError(null);
    setStarting(true);
    stoppedRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      await video.play().catch(() => undefined);

      const Detector = (window as any).BarcodeDetector;
      if (Detector) {
        let supported: string[] = FORMATS;
        try {
          const avail: string[] = await Detector.getSupportedFormats();
          supported = FORMATS.filter(f => avail.includes(f));
        } catch { /* keep defaults */ }
        const detector = new Detector(supported.length ? { formats: supported } : undefined);

        const loop = async () => {
          if (stoppedRef.current) return;
          try {
            if (video.readyState >= 2) {
              const codes = await detector.detect(video);
              if (codes && codes.length > 0 && codes[0].rawValue) {
                handleResult(String(codes[0].rawValue));
              }
            }
          } catch { /* transient frame errors are ignored */ }
          if (!stoppedRef.current) rafRef.current = requestAnimationFrame(() => { void loop(); });
        };
        void loop();
      } else {
        // ZXing fallback
        const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([
          import('@zxing/browser'),
          import('@zxing/library'),
        ]);
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
          BarcodeFormat.ITF, BarcodeFormat.CODABAR, BarcodeFormat.QR_CODE,
          BarcodeFormat.DATA_MATRIX, BarcodeFormat.PDF_417,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, false);
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 80 });
        const controls = await reader.decodeFromVideoElement(video, (result) => {
          if (result) handleResult(result.getText());
        });
        zxingControlsRef.current = controls as any;
      }
    } catch (e: any) {
      const msg = e?.name === 'NotAllowedError'
        ? "Accès à la caméra refusé. Autorisez la caméra puis réessayez."
        : e?.name === 'NotFoundError'
          ? "Aucune caméra détectée sur cet appareil."
          : "Impossible de démarrer la caméra.";
      setError(msg);
    } finally {
      setStarting(false);
    }
  }, [handleResult]);

  useEffect(() => {
    if (open) {
      setLastCode(null);
      lastValueRef.current = { code: '', at: 0 };
      void start();
    } else {
      stopAll();
    }
    return () => { stopAll(); };
  }, [open, start, stopAll]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={size}
        className={cn(size === 'icon' && 'shrink-0', className)}
        onClick={() => setOpen(true)}
        title="Scanner avec la caméra"
      >
        <ScanLine className={cn('w-4 h-4', label && 'mr-1.5')} />
        {label}
      </Button>

      <Dialog open={open} onOpenChange={(o) => { if (!o) { stopAll(); } setOpen(o); }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanLine className="w-5 h-5 text-primary" />
              Scanner un code-barres
            </DialogTitle>
            <DialogDescription>
              Placez le code-barres dans le cadre. La lecture est automatique.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3]">
              <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
              {/* Aiming frame */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-[80%] h-[40%] border-2 border-primary/80 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
              </div>
              {starting && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                  <Loader2 className="w-8 h-8 animate-spin text-white" />
                </div>
              )}
              {error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 text-white p-4 text-center">
                  <CameraOff className="w-8 h-8" />
                  <p className="text-sm">{error}</p>
                  <Button size="sm" variant="secondary" onClick={() => void start()}>
                    <RefreshCw className="w-4 h-4 mr-1.5" /> Réessayer
                  </Button>
                </div>
              )}
            </div>

            {continuous && lastCode && (
              <p className="text-xs text-center text-muted-foreground">
                Dernier code : <span className="font-mono text-foreground">{lastCode}</span>
              </p>
            )}

            <Button variant="outline" className="w-full" onClick={() => { stopAll(); setOpen(false); }}>
              {continuous ? 'Terminer' : 'Annuler'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default BarcodeScanButton;
