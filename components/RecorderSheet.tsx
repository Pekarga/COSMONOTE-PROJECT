"use client";
import { useEffect, useRef, useState } from "react";
import { CloseIcon, PauseIcon, MicIcon, StopIcon } from "./Icons";

function pickMime(): string {
  const options = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  return options.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";
}

/** 12:47.3 ou 1:02:47.3 */
function chrono(ms: number) {
  const tenths = Math.floor(ms / 100) % 10;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}.${tenths}` : `${String(m).padStart(2, "0")}:${sec}.${tenths}`;
}

type Props = { onDone: (file: File) => void; onClose: () => void };

/** Feuille d'enregistrement : grand chrono, onde qui réagit à la voix, pause et fin. */
export function RecorderSheet({ onDone, onClose }: Props) {
  const [state, setState] = useState<"starting" | "recording" | "paused" | "error">("starting");
  const [elapsed, setElapsed] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const clock = useRef({ start: 0, acc: 0, running: false });
  const level = useRef(0);
  const raf = useRef(0);
  const finished = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let ctx: AudioContext | null = null;
    (async () => {
      try {
        const media = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) return media.getTracks().forEach((t) => t.stop());
        stream.current = media;
        const mime = pickMime();
        const r = new MediaRecorder(media, mime ? { mimeType: mime } : undefined);
        r.ondataavailable = (e) => {
          if (e.data.size) chunks.current.push(e.data);
        };
        r.onstop = () => {
          if (!finished.current) return;
          const type = r.mimeType || "audio/webm";
          const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
          onDone(new File([new Blob(chunks.current, { type })], `enregistrement-${Date.now()}.${ext}`, { type }));
        };
        r.start(1000);
        rec.current = r;
        ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(media).connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);
        clock.current = { start: performance.now(), acc: 0, running: true };
        setState("recording");

        const draw = (t: number) => {
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) sum += (v - 128) ** 2;
          const rms = Math.sqrt(sum / buf.length) / 128;
          const target = clock.current.running ? Math.min(1, rms * 5) : 0;
          level.current += (target - level.current) * 0.15;
          const c = clock.current;
          setElapsed(c.acc + (c.running ? performance.now() - c.start : 0));
          paint(t);
          raf.current = requestAnimationFrame(draw);
        };
        raf.current = requestAnimationFrame(draw);
      } catch {
        setState("error");
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf.current);
      stream.current?.getTracks().forEach((t) => t.stop());
      ctx?.close().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Trois traits d'encre superposés, qui s'amplifient avec la voix.
  function paint(t: number) {
    const el = canvas.current;
    if (!el) return;
    const dpr = window.devicePixelRatio || 1;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (el.width !== w * dpr) {
      el.width = w * dpr;
      el.height = h * dpr;
    }
    const g = el.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const css = getComputedStyle(el);
    const colors = [css.getPropertyValue("--red"), css.getPropertyValue("--ochre"), css.getPropertyValue("--ink-3")];
    const amp = 6 + level.current * (h * 0.38);
    colors.forEach((color, i) => {
      g.beginPath();
      g.lineWidth = i === 0 ? 3 : 2;
      g.strokeStyle = color.trim();
      g.globalAlpha = i === 0 ? 1 : 0.55;
      for (let x = 0; x <= w; x += 3) {
        const env = Math.sin((Math.PI * x) / w); // s'atténue aux bords
        const y =
          h / 2 +
          env * amp * Math.sin(x / (38 + i * 11) + t / (420 - i * 90) + i * 1.7) * (1 - i * 0.18);
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    });
    g.globalAlpha = 1;
  }

  function togglePause() {
    const r = rec.current;
    if (!r) return;
    const c = clock.current;
    if (state === "recording") {
      r.pause();
      c.acc += performance.now() - c.start;
      c.running = false;
      setState("paused");
    } else {
      r.resume();
      c.start = performance.now();
      c.running = true;
      setState("recording");
    }
  }

  function finish() {
    finished.current = true;
    rec.current?.stop();
  }

  function cancel() {
    if (elapsed > 3000 && !window.confirm("Abandonner cet enregistrement ?")) return;
    rec.current?.stop();
    onClose();
  }

  return (
    <div className="sheet-backdrop" role="dialog" aria-label="Enregistrement">
      <div className="sheet">
        <button className="icon-btn sheet-close" onClick={cancel} aria-label="Fermer">
          <CloseIcon />
        </button>
        <p className="sheet-label">
          {state === "paused" ? "En pause" : state === "error" ? "Micro indisponible" : "Enregistrement"}
        </p>
        {state === "error" ? (
          <p className="muted" style={{ textAlign: "center", padding: "24px 0" }}>
            Autorise l&apos;accès au micro dans ton navigateur, puis réessaie.
          </p>
        ) : (
          <>
            <div className="chrono">{chrono(elapsed)}</div>
            <canvas ref={canvas} className="wave" aria-hidden="true" />
            <div className="sheet-actions">
              <button className="btn" onClick={togglePause} disabled={state === "starting"}>
                {state === "paused" ? <MicIcon size={16} /> : <PauseIcon size={16} />}
                {state === "paused" ? "Reprendre" : "Pause"}
              </button>
              <button className="btn btn-primary" onClick={finish} disabled={state === "starting"}>
                <StopIcon size={14} /> Terminer
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
