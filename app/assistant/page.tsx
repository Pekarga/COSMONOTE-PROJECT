"use client";
import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CloseIcon, CopyIcon, SendIcon, ShareIcon, SpeakerIcon, SparkIcon } from "@/components/Icons";
import { Markdown } from "@/components/Markdown";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Qu'est-ce qui revient le plus dans mes notes ?",
  "Quelles sont mes actions en attente ?",
  "Explique-moi ma dernière note comme à un enfant",
  "Fais-moi un QCM de 5 questions",
];

function plain(md: string) {
  return md.replace(/\*\*|\*|`|^#+\s*/gm, "").replace(/^\s*[-•]\s+/gm, "");
}

function Chat() {
  const params = useSearchParams();
  const router = useRouter();
  const noteId = params.get("note");
  const [noteTitle, setNoteTitle] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const autoSent = useRef(false);

  useEffect(() => {
    if (!noteId) return setNoteTitle(null);
    fetch(`/api/notes/${noteId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { note?: { title: string } } | null) => setNoteTitle(d?.note?.title ?? null));
  }, [noteId]);

  useEffect(() => {
    const q = params.get("q");
    if (q && !autoSent.current) {
      autoSent.current = true;
      send(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, noteId }),
      });
      if (!res.ok || !res.body) throw new Error();
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages([...next, { role: "assistant", content: acc }]);
      }
    } catch {
      setMessages([...next, { role: "assistant", content: "Désolé, je n'ai pas pu répondre. Réessaie dans un instant." }]);
    } finally {
      setBusy(false);
    }
  }

  function speak(text: string) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(plain(text));
    u.lang = "fr-FR";
    window.speechSynthesis.speak(u);
  }

  async function share(text: string, i: number) {
    const body = plain(text);
    if (navigator.share) {
      await navigator.share({ title: "Le rédacteur", text: body }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(body);
      setCopied(i);
      setTimeout(() => setCopied(null), 1500);
    }
  }

  return (
    <div className="chat">
      <div className="chat-head">
        <h1>Assistant</h1>
        {messages.length > 0 && (
          <button className="btn btn-sm btn-ghost" onClick={() => setMessages([])}>
            Nouvelle conversation
          </button>
        )}
      </div>
      {noteId && noteTitle && (
        <div className="scope">
          <span>
            Sur la note <Link href={`/notes/${noteId}`}>{noteTitle}</Link>
          </span>
          <button className="icon-btn icon-btn-sm" onClick={() => router.replace("/assistant")} aria-label="Discuter de toutes les notes">
            <CloseIcon size={14} />
          </button>
        </div>
      )}

      <div className="chat-log">
        {messages.length === 0 && (
          <div className="empty">
            <SparkIcon size={26} />
            <h2>{noteTitle ? "Que veux-tu savoir sur cette note ?" : "Que veux-tu savoir ?"}</h2>
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chip" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="bubble user">
              {m.content}
            </div>
          ) : m.content ? (
            <div key={i} className="answer">
              <Markdown text={m.content} />
              {!(busy && i === messages.length - 1) && (
                <div className="answer-tools">
                  <button
                    className="icon-btn icon-btn-sm"
                    aria-label="Copier"
                    onClick={async () => {
                      await navigator.clipboard.writeText(m.content);
                      setCopied(i);
                      setTimeout(() => setCopied(null), 1500);
                    }}
                  >
                    <CopyIcon size={14} />
                  </button>
                  <button className="icon-btn icon-btn-sm" aria-label="Lire à voix haute" onClick={() => speak(m.content)}>
                    <SpeakerIcon size={14} />
                  </button>
                  <button className="icon-btn icon-btn-sm" aria-label="Partager" onClick={() => share(m.content, i)}>
                    <ShareIcon size={14} />
                  </button>
                  {copied === i && <span className="small muted">Copié</span>}
                </div>
              )}
            </div>
          ) : (
            <p key={i} className="thinking">
              Je réfléchis…
            </p>
          ),
        )}
        <div ref={end} />
      </div>

      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          placeholder={noteTitle ? "Pose ta question sur cette note" : "Discute avec tes notes"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="Ta question"
        />
        <button className="send" disabled={busy || !input.trim()} aria-label="Envoyer">
          <SendIcon size={16} />
        </button>
      </form>
    </div>
  );
}

export default function AssistantPage() {
  return (
    <Suspense>
      <Chat />
    </Suspense>
  );
}
