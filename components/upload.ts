/** Envoie un formulaire en suivant la progression. Renvoie la réponse JSON. */
export function uploadForm<T = Record<string, unknown>>(
  url: string,
  form: FormData,
  onProgress?: (pct: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(xhr.responseText || "{}");
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
      else reject(new Error(String(data.error ?? "L'envoi a échoué.")));
    };
    xhr.onerror = () => reject(new Error("L'envoi a échoué."));
    xhr.send(form);
  });
}

/** Réduit une photo (2000 px max, JPEG) pour l'envoyer plus vite et rester sous les limites de l'IA. */
export async function shrinkImage(source: File): Promise<File> {
  const bitmap = await createImageBitmap(source);
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && source.size < 3_000_000 && source.type === "image/jpeg") return source;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/jpeg", 0.88));
  return new File([blob], source.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}

/** Convertit une image en PNG (logo, signature scannée), en gardant la transparence. */
export async function toPng(source: File, max = 1200): Promise<File> {
  const bitmap = await createImageBitmap(source);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/png"));
  return new File([blob], source.name.replace(/\.\w+$/, "") + ".png", { type: "image/png" });
}

/** Prépare les fichiers déposés : les photos sont réduites, le reste part tel quel. */
export async function prepareFiles(files: File[]): Promise<File[]> {
  return Promise.all(files.map((f) => (/^image\/(jpeg|png|webp)$/.test(f.type) ? shrinkImage(f).catch(() => f) : f)));
}
