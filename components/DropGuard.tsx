"use client";
import { useEffect } from "react";

/** Empêche la fenêtre d'ouvrir un fichier lâché à côté d'une zone de dépôt. */
export function DropGuard() {
  useEffect(() => {
    const stop = (e: DragEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest("[data-dropzone]")) e.preventDefault();
    };
    window.addEventListener("dragover", stop);
    window.addEventListener("drop", stop);
    return () => {
      window.removeEventListener("dragover", stop);
      window.removeEventListener("drop", stop);
    };
  }, []);
  return null;
}
