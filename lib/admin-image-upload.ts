"use client";

export const MAX_ADMIN_IMAGE_BYTES = 8 * 1024 * 1024;

const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

export type AdminImageFolder = "articles" | "breeds" | "directory" | "events" | "help";
export type AdminImageUpload = {
  imageUrl: string;
  imageKey: string;
  filename: string;
  originalBytes: number;
  storedBytes: number;
  optimized: boolean;
};

function formatMegabytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(bytes >= 1024 * 1024 ? 1 : 2)} MB`;
}

function fileType(file: File) {
  if (ACCEPTED_IMAGE_TYPES.has(file.type)) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "avif") return "image/avif";
  return "";
}

async function canvasBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Prehliadač nedokázal obrázok optimalizovať.")),
      "image/webp",
      quality,
    );
  });
}

async function optimizeImage(file: File) {
  if (!fileType(file)) throw new Error("Použi obrázok JPG, PNG, WebP alebo AVIF.");
  if (file.size > MAX_ADMIN_IMAGE_BYTES) {
    throw new Error(`Obrázok má ${formatMegabytes(file.size)}. Maximum je 8 MB.`);
  }

  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file);
    const longestSide = Math.max(bitmap.width, bitmap.height);
    if (file.size <= 2.5 * 1024 * 1024 && longestSide <= 2400) return file;

    const scale = Math.min(1, 2400 / longestSide);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    let blob = await canvasBlob(canvas, 0.84);
    if (blob.size > 4 * 1024 * 1024) blob = await canvasBlob(canvas, 0.72);
    if (blob.size >= file.size) return file;

    const baseName = file.name.replace(/\.[^.]+$/, "") || "obrazok";
    return new File([blob], `${baseName}.webp`, { type: "image/webp", lastModified: Date.now() });
  } catch {
    // Nie každý prehliadač vie dekódovať AVIF cez Canvas. Platný originál
    // preto stále odošleme; API ho skontroluje podľa obsahu súboru.
    return file;
  } finally {
    bitmap?.close();
  }
}

export async function uploadAdminImage(file: File, folder: AdminImageFolder): Promise<AdminImageUpload> {
  const originalBytes = file.size;
  const uploadFile = await optimizeImage(file);

  const response = await fetch("/api/admin/uploads", {
    method: "POST",
    headers: {
      "content-type": fileType(uploadFile),
      "x-upload-folder": folder,
      "x-file-name": encodeURIComponent(uploadFile.name.slice(0, 160)),
      "x-original-size": String(originalBytes),
    },
    body: uploadFile,
  });

  let data: Partial<AdminImageUpload> & { error?: string } = {};
  try {
    data = await response.json() as Partial<AdminImageUpload> & { error?: string };
  } catch {
    // Cloudflare môže pri odmietnutí požiadavky vrátiť HTML namiesto JSON.
  }
  if (!response.ok || !data.imageUrl || !data.imageKey) {
    if (response.status === 413) throw new Error("Obrázok je príliš veľký. Maximum je 8 MB.");
    throw new Error(data.error || "Obrázok sa nepodarilo nahrať.");
  }

  return {
    imageUrl: data.imageUrl,
    imageKey: data.imageKey,
    filename: data.filename || uploadFile.name,
    originalBytes,
    storedBytes: data.storedBytes || uploadFile.size,
    optimized: uploadFile.size < originalBytes,
  };
}

export function adminImageUploadMessage(result: AdminImageUpload, nextStep: string) {
  const optimization = result.optimized
    ? ` Optimalizovaný z ${formatMegabytes(result.originalBytes)} na ${formatMegabytes(result.storedBytes)}.`
    : "";
  return `Obrázok je nahratý.${optimization} ${nextStep}`;
}
