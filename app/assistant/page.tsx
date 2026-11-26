"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SendIcon, SparkIcon } from "@/components/Icons";
import { Markdown } from "@/components/Markdown";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Quelles sont mes actions en attente ?",
  "Résume mes notes de la semaine",
  "Fais-moi un QCM de 5 questions sur ma dernière note",
  "Crée des fiches de révision à partir de mes cours",
];

function Chat() {
  const params = useSearchParams();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const noteId = params.get("note");
    if (!noteId) return;
    fetch(`/api/notes/${noteId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { note?: { title: string } } | null) => d?.note && setInput(`À propos de « ${d.note.title} » : `));
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
        body: JSON.stringify({ messages: next }),
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

  return (
    <div className="chat">
      <div className="page-head">
        <div>
          <h1>Assistant</h1>
          <p>Pose une question sur l&apos;ensemble de tes notes, ou demande un QCM, des fiches ou un plan.</p>
        </div>
        {messages.length > 0 && (
          <button className="btn btn-sm btn-ghost" onClick={() => setMessages([])}>
            Nouvelle conversation
          </button>
        )}
      </div>

      <div className="chat-log">
        {messages.length === 0 && (
          <div className="card empty">
            <SparkIcon size={28} />
            <h2>Que veux-tu savoir ?</h2>
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="btn btn-sm" onClick={() => send(s)}>
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
          ) : (
            <div key={i} className="bubble assistant">
              {m.content ? <Markdown text={m.content} /> : <span className="spinner" />}
            </div>
          ),
        )}
        <div ref={end} />
      </div>

      <form
        className="card chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          className="input"
          placeholder="Écris ta question…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="Ta question"
        />
        <button className="btn btn-primary" disabled={busy || !input.trim()} aria-label="Envoyer">
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
