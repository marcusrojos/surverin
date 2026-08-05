/**
 * Assets embarqués dans les PDF.
 *
 * Le logo est importé avec le suffixe Vite `?inline`, ce qui le transforme en
 * data URI (`data:image/png;base64,...`) directement dans le bundle JavaScript.
 * Conséquence : aucune requête réseau, aucun chemin `/assets/...`, donc aucun
 * `ERR_FILE_NOT_FOUND` ni `Failed to fetch` dans Electron (file:// ou serveur
 * local) ni dans la WebView Capacitor.
 */
import logoDataUrl from '@/assets/dpci-logo.png?inline';

/** Logo DPCI sous forme de data URI, disponible hors ligne sur toutes les plateformes. */
export const PDF_LOGO_DATA_URL: string = logoDataUrl as unknown as string;

/**
 * Charge une image (data URI, base64 ou URL) pour `doc.addImage()`.
 * Aucune utilisation de `fetch` : uniquement l'API Image du navigateur.
 */
export function loadPdfImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // crossOrigin est inutile (et gênant) pour un data URI.
    if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Image PDF illisible : ${src.slice(0, 48)}…`));
    img.src = src;
  });
}
