/**
 * Image compression utility for uploads.
 * Compresses images client-side before sending to storage.
 */

const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB
const MAX_DIMENSION = 1920;
const QUALITY = 0.7;

export interface CompressedImage {
  blob: Blob;
  dataUrl: string;
  originalSize: number;
  compressedSize: number;
  ratio: number;
}

/**
 * Compress an image file to max 1MB, converting to WebP when supported.
 */
export async function compressImage(
  file: File | Blob,
  options?: { maxSize?: number; maxDimension?: number; quality?: number; outputType?: 'image/webp' | 'image/jpeg' }
): Promise<CompressedImage> {
  const maxSize = options?.maxSize ?? MAX_FILE_SIZE;
  const maxDim = options?.maxDimension ?? MAX_DIMENSION;
  const quality = options?.quality ?? QUALITY;
  const originalSize = file.size;

  // If already small enough, return as-is
  if (originalSize <= maxSize && file instanceof File && !file.type.startsWith('image/')) {
    const dataUrl = await blobToDataUrl(file);
    return { blob: file, dataUrl, originalSize, compressedSize: originalSize, ratio: 1 };
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      // Scale down if needed
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not supported')); return; }

      ctx.drawImage(img, 0, 0, width, height);

      // Try WebP first, fall back to JPEG
      const tryFormat = (format: string, q: number) => {
        return new Promise<Blob | null>((res) => {
          canvas.toBlob((blob) => res(blob), format, q);
        });
      };

      (async () => {
        let blob: Blob | null = null;
        if (options?.outputType === 'image/jpeg') {
          blob = await tryFormat('image/jpeg', quality);
        } else {
          blob = await tryFormat('image/webp', quality);
          if (!blob || blob.size > maxSize) {
            blob = await tryFormat('image/jpeg', quality);
          }
        }
        // If still too big, reduce quality further
        if (blob && blob.size > maxSize) {
          blob = await tryFormat('image/jpeg', 0.5);
        }
        if (blob && blob.size > maxSize) {
          blob = await tryFormat('image/jpeg', 0.3);
        }

        if (!blob) { reject(new Error('Compression failed')); return; }

        const dataUrl = await blobToDataUrl(blob);
        resolve({
          blob,
          dataUrl,
          originalSize,
          compressedSize: blob.size,
          ratio: Math.round((1 - blob.size / originalSize) * 100),
        });
      })();
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Validate and compress an image file input.
 * Returns null if the file is not an image.
 */
export async function processImageUpload(file: File): Promise<CompressedImage | null> {
  if (!file.type.startsWith('image/')) return null;
  return compressImage(file);
}
