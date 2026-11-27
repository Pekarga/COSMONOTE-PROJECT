import fs from "node:fs/promises";
import path from "node:path";

export function extOf(name: string): string {
  return path.extname(name).toLowerCase().slice(0, 8);
}

export async function writeUpload(file: File, dest: string): Promise<void> {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, Buffer.from(await file.arrayBuffer()));
}

export function filesFrom(form: FormData, field: string): File[] {
  return form.getAll(field).filter((f): f is File => f instanceof File && f.size > 0);
}

/** Renvoie un fichier enregistré, affiché dans l'appli plutôt que téléchargé quand c'est possible. */
export async function sendFile(p: string, name: string, mime: string | null): Promise<Response> {
  try {
    const data = await fs.readFile(p);
    return new Response(data, {
      headers: {
        "Content-Type": mime || "application/octet-stream",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return Response.json({ error: "Fichier introuvable." }, { status: 404 });
  }
}

export function frDate(): string {
  return new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}
