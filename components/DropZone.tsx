"use client";
import { useRef, useState, type ReactNode } from "react";

export const ACCEPT = ".pdf,.docx,.odt,.txt,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";
const EXTENSIONS = /\.(pdf|docx|odt|txt|jpe?g|png|webp)$/i;

type Entree = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (ok: (f: File) => void, ko: (e: unknown) => void) => void;
  createReader?: () => { readEntries: (ok: (e: Entree[]) => void, ko: (e: unknown) => void) => void };
};

/** Fichiers d'un dossier glissé (et de ses sous-dossiers), limités aux formats acceptés. */
async function fichiersDe(entree: Entree): Promise<File[]> {
  if (entree.isFile && entree.file) {
    const f = await new Promise<File>((ok, ko) => entree.file!(ok, ko));
    return EXTENSIONS.test(f.name) ? [f] : [];
  }
  if (!entree.isDirectory || !entree.createReader) return [];
  const lecteur = entree.createReader();
  const enfants: Entree[] = [];
  // readEntries rend les fichiers par paquets de 100 : on lit jusqu'au bout.
  for (;;) {
    const paquet = await new Promise<Entree[]>((ok, ko) => lecteur.readEntries(ok, ko));
    if (!paquet.length) break;
    enfants.push(...paquet);
  }
  return (await Promise.all(enfants.map(fichiersDe))).flat();
}

async function fichiersGlisses(dt: DataTransfer): Promise<File[]> {
  const entrees: Entree[] = [];
  for (const item of Array.from(dt.items ?? [])) {
    const e = (item.webkitGetAsEntry?.() ?? null) as unknown as Entree | null;
    if (e) entrees.push(e);
  }
  if (!entrees.some((e) => e.isDirectory)) return Array.from(dt.files);
  return (await Promise.all(entrees.map(fichiersDe))).flat();
}

/** Zone où glisser des fichiers, ou cliquer pour les choisir. */
export function DropZone(props: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  compact?: boolean;
  icon?: ReactNode;
  title: string;
  hint?: ReactNode;
  accept?: string;
  multiple?: boolean;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  return (
    <div
      className={`dropzone ${props.compact ? "dropzone-compact" : ""} ${over ? "over" : ""} ${props.disabled ? "disabled" : ""} ${props.className ?? ""}`}
      role="button"
      tabIndex={0}
      data-dropzone
      onClick={() => !props.disabled && input.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !props.disabled) {
          e.preventDefault();
          input.current?.click();
        }
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current++;
        setOver(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (!depth.current) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        if (props.disabled) return;
        // Un dossier entier peut être glissé : tous ses fichiers (et ceux des sous-dossiers) sont pris.
        void fichiersGlisses(e.dataTransfer).then((files) => {
          if (files.length) props.onFiles(props.multiple === false ? files.slice(0, 1) : files);
        });
      }}
    >
      {props.icon && <span className="dropzone-icon">{props.icon}</span>}
      <span className="dropzone-text">
        <strong>{props.title}</strong>
        {props.hint && <span className="dropzone-hint">{props.hint}</span>}
      </span>
      <input
        ref={input}
        type="file"
        hidden
        multiple={props.multiple !== false}
        accept={props.accept ?? ACCEPT}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) props.onFiles(files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
