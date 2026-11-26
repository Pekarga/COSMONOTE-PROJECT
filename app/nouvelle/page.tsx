"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MicIcon, PauseIcon, StopIcon, UploadIcon } from "@/components/Icons";

type RecState = "idle" | "recording" | "paused";

function pickMime(): string {
  const options = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  return options.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";
}

function clock(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function NewNotePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [state, setState] = useState<RecState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const tick = useRef<{ start: number; acc: number; id?: ReturnType<typeof setInterval> }>({ start: 0, acc: 0 });
  const raf = useRef<number>(0);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => cleanup(), []);

  function cleanup() {
    clearInterval(tick.current.id);
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
  }

  function upload(file: File) {
    setError(null);
    setProgress(0);
    const form = new FormData();
    form.append("file", file);
    form.append("title", title);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/notes");
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      const data = JSON.parse(xhr.responseText || "{}") as { id?: string; error?: string };
      if (xhr.status === 201 && data.id) router.push(`/notes/${data.id}`);
      else {
        setProgress(null);
        setError(data.error ?? "L'envoi a échoué.");
      }
    };
    xhr.onerror = () => {
      setProgress(null);
      setError("L'envoi a échoué. Vérifie ta connexion.");
    };
    xhr.send(form);
  }

  async function start() {
    setError(null);
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media;
      const mime = pickMime();
      const rec = new MediaRecorder(media, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        const type = rec.mimeType || "audio/webm";
        const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        const blob = new Blob(chunks.current, { type });
        cleanup();
        upload(new File([blob], `enregistrement-${Date.now()}.${ext}`, { type }));
      };
      rec.start(1000);
      recorder.current = rec;

      // Indicateur de niveau sonore.
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      ctx.createMediaStreamSource(media).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      const loop = () => {
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        setLevel(Math.min(100, (peak / 128) * 160));
        raf.current = requestAnimationFrame(loop);
      };
      loop();

      tick.current = { start: Date.now(), acc: 0 };
      tick.current.id = setInterval(() => setElapsed(tick.current.acc + Date.now() - tick.current.start), 250);
      setState("recording");
    } catch {
      setError("Impossible d'accéder au micro. Autorise-le dans ton navigateur.");
    }
  }

  function togglePause() {
    const rec = recorder.current;
    if (!rec) return;
    if (state === "recording") {
      rec.pause();
      tick.current.acc += Date.now() - tick.current.start;
      clearInterval(tick.current.id);
      setState("paused");
    } else {
      rec.resume();
      tick.current.start = Date.now();
      tick.current.id = setInterval(() => setElapsed(tick.current.acc + Date.now() - tick.current.start), 250);
      setState("recording");
    }
  }

  function stop() {
    recorder.current?.stop();
    setState("idle");
    setLevel(0);
  }

  const busy = progress !== null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Nouvelle note</h1>
          <p>Enregistre directement ou importe un fichier. La transcription démarre dès la fin de l&apos;envoi.</p>
        </div>
      </div>

      <div className="card panel" style={{ marginBottom: 16 }}>
        <label htmlFor="title" className="small muted">
          Titre (facultatif, sinon Le rédacteur en propose un)
        </label>
        <input
          id="title"
          className="input"
          placeholder="Ex. Cours de droit des contrats, réunion d'équipe…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={busy}
        />
      </div>

      <div className="new-grid">
        <section className="card panel">
          <h2>
            <MicIcon /> Enregistrer
          </h2>
          <div className="recorder">
            {state === "idle" ? (
              <button className="rec-button" onClick={start} disabled={busy} aria-label="Démarrer l'enregistrement">
                <MicIcon size={34} />
              </button>
            ) : (
              <button
                className={`rec-button ${state === "recording" ? "recording" : ""}`}
                onClick={stop}
                aria-label="Arrêter et transcrire"
              >
                <StopIcon size={30} />
              </button>
            )}
            <div className="rec-time">{clock(elapsed)}</div>
            <div className="level" aria-hidden="true">
              <div style={{ width: `${state === "recording" ? level : 0}%` }} />
            </div>
            {state === "idle" ? (
              <p className="small muted">Appuie sur le micro pour commencer.</p>
            ) : (
              <div className="toolbar">
                <button className="btn btn-sm" onClick={togglePause}>
                  <PauseIcon size={14} /> {state === "paused" ? "Reprendre" : "Pause"}
                </button>
                <button className="btn btn-sm btn-primary" onClick={stop}>
                  Terminer
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="card panel">
          <h2>
            <UploadIcon /> Importer un fichier
          </h2>
          <div
            className={`dropzone ${over ? "over" : ""}`}
            onClick={() => !busy && fileInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              const f = e.dataTransfer.files[0];
              if (f && !busy) upload(f);
            }}
            role="button"
            tabIndex={0}
          >
            <UploadIcon size={28} />
            <p style={{ marginTop: 8 }}>
              <strong>Dépose un fichier ici</strong> ou clique pour choisir
            </p>
            <p className="small muted">Audio ou vidéo : mp3, m4a, wav, webm, mp4, mov…</p>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="audio/*,video/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              e.target.value = "";
            }}
          />
        </section>
      </div>

      {busy && (
        <div className="card panel" style={{ marginTop: 16 }}>
          <p>Envoi du fichier… {progress}%</p>
          <div className="progress">
            <div style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
      {error && (
        <div className="error-box" style={{ marginTop: 16 }}>
          {error}
        </div>
      )}
    </>
  );
}
