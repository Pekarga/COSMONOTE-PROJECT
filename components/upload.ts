/** Envoie un formulaire à /api/notes en suivant la progression. Renvoie l'identifiant de la note. */
export function uploadNote(form: FormData, onProgress: (pct: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/notes");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let data: { id?: string; error?: string } = {};
      try {
        data = JSON.parse(xhr.responseText || "{}");
      } catch {}
      if (xhr.status === 201 && data.id) resolve(data.id);
      else reject(new Error(data.error ?? "L'envoi a échoué."));
    };
    xhr.onerror = () => reject(new Error("L'envoi a échoué. Vérifie ta connexion."));
    xhr.send(form);
  });
}

/** Réduit une photo (2000 px max, JPEG) pour l'envoyer plus vite et rester sous les limites de l'IA. */
export async function shrinkImage(source: Blob, name: string): Promise<File> {
  const bitmap = await createImageBitmap(source);
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/jpeg", 0.85));
  return new File([blob], name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}
