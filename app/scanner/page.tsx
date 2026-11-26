"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BackIcon, CloseIcon, UploadIcon } from "@/components/Icons";
import { shrinkImage, uploadNote } from "@/components/upload";

type Page = { file: File; url: string };

export default function ScannerPage() {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [camera, setCamera] = useState<"starting" | "on" | "off">("starting");
  const [pages, setPages] = useState<Page[]>([]);
  const [flash, setFlash] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment", width: { ideal: 2560 }, height: { ideal: 1440 } } })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        if (video.current) video.current.srcObject = s;
        setCamera("on");
      })
      .catch(() => setCamera("off"));
    if (!navigator.mediaDevices) setCamera("off");
    return () => {
      cancelled = true;
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function addPage(blob: Blob, name: string) {
    const file = await shrinkImage(blob, name);
    setPages((p) => [...p, { file, url: URL.createObjectURL(file) }]);
  }

  async function capture() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
    const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.92));
    await addPage(blob, `page-${pages.length + 1}.jpg`);
  }

  async function finish() {
    setError(null);
    setProgress(0);
    const form = new FormData();
    pages.forEach((p) => form.append("page", p.file));
    try {
      const id = await uploadNote(form, setProgress);
      stream.current?.getTracks().forEach((t) => t.stop());
      router.push(`/notes/${id}`);
    } catch (e) {
      setProgress(null);
      setError(e instanceof Error ? e.message : "L'envoi a échoué.");
    }
  }

  return (
    <div className="scanner">
      <div className="note-topbar">
        <Link href="/" className="icon-btn" aria-label="Retour">
          <BackIcon />
        </Link>
        <h1 className="topbar-title">Scanner un document</h1>
        <span style={{ width: 40 }} />
      </div>

      <div className="viewfinder">
        {camera === "off" ? (
          <div className="viewfinder-off">
            <p>Pas de caméra disponible.</p>
            <button className="btn" onClick={() => fileInput.current?.click()}>
              <UploadIcon size={16} /> Choisir des photos
            </button>
          </div>
        ) : (
          <>
            <video ref={video} autoPlay playsInline muted />
            <div className="frame" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </div>
            {flash && <div className="flash" />}
          </>
        )}
      </div>

      <p className="small muted" style={{ textAlign: "center", margin: "10px 0" }}>
        Cadre la page bien à plat, avec une bonne lumière. Ajoute autant de pages que tu veux.
      </p>

      <div className="scan-controls">
        <button className="btn btn-ghost" onClick={() => fileInput.current?.click()}>
          <UploadIcon size={16} /> Photos
        </button>
        <button className="shutter" onClick={capture} disabled={camera !== "on"} aria-label="Prendre la page en photo" />
        <button className="btn btn-primary" onClick={finish} disabled={!pages.length || progress !== null}>
          Terminer{pages.length ? ` (${pages.length})` : ""}
        </button>
      </div>

      {pages.length > 0 && (
        <div className="thumbs">
          {pages.map((p, i) => (
            <div key={p.url} className="thumb">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={`Page ${i + 1}`} />
              <span>{i + 1}</span>
              <button
                className="thumb-remove"
                onClick={() => setPages((all) => all.filter((x) => x !== p))}
                aria-label={`Retirer la page ${i + 1}`}
              >
                <CloseIcon size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {progress !== null && (
        <div className="upload-strip">
          <span>Envoi… {progress}%</span>
          <div className="progress">
            <div style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
      {error && <div className="error-box">{error}</div>}

      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={async (e) => {
          for (const f of Array.from(e.target.files ?? [])) await addPage(f, f.name);
          e.target.value = "";
        }}
      />
    </div>
  );
}
