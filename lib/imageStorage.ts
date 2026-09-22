export const MAX_STORED_PHOTO_DATA_URL_LENGTH = 420_000;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image load failed"));
    image.src = dataUrl;
  });
}

function canvasToDataUrl(image: HTMLImageElement, maxSide: number, quality: number) {
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
  const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

export async function photoFileToStorageDataUrl(file: File) {
  const original = await readFileAsDataUrl(file);
  if (!file.type.startsWith("image/")) return original;

  try {
    const image = await loadImage(original);
    const firstPass = canvasToDataUrl(image, 1400, 0.76);
    if (firstPass && firstPass.length <= MAX_STORED_PHOTO_DATA_URL_LENGTH) return firstPass;
    const secondPass = canvasToDataUrl(image, 1000, 0.66);
    if (secondPass) return secondPass;
  } catch {}

  return original.length <= MAX_STORED_PHOTO_DATA_URL_LENGTH ? original : "";
}

export function stripOversizedPhotoDataUrl(dataUrl: string) {
  return dataUrl.length > MAX_STORED_PHOTO_DATA_URL_LENGTH ? "" : dataUrl;
}
