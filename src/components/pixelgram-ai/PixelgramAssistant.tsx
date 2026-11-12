// Pixelgram AI — floating help assistant. Runs fully inside the app (website + APK):
// no server, no AI company, no API key, no question limit.
import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bot, Mic, MicOff, Send, Volume2, VolumeX, X, ExternalLink, Mail, Facebook, Instagram, Youtube } from "lucide-react";
import { answer, defaultSuggestions, speakableText, type BrainReply } from "@/lib/pixelgram-ai/brain.js";
import { getTopic, OWNER } from "@/lib/pixelgram-ai/knowledge.js";
import { cn } from "@/lib/utils";

interface Msg {
  id: number;
  role: "user" | "ai";
  text: string;
  reply?: BrainReply;
}

// Pages where the floating button is shown (hidden on reels, open chats, video player, admin…).
const SHOW_ON = [/^\/home$/, /^\/videos$/, /^\/profile/, /^\/settings/, /^\/people$/, /^\/notifications$/, /^\/create$/, /^\/create-reel$/, /^\/upload-video$/, /^\/stories$/, /^\/edit-profile$/, /^\/chat$/, /^\/messages$/, /^\/login$/, /^\/register$/, /^\/forgot-password$/, /^\/appeal$/];
export function assistantVisibleOn(pathname: string) {
  return SHOW_ON.some((r) => r.test(pathname));
}

type SpeechRec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
function recognitionClass(): (new () => SpeechRec) | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}
function getRecognition(): SpeechRec | null {
  const C = recognitionClass();
  return C ? new C() : null;
}

function speak(text: string, lang: BrainReply["lang"]) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const want = lang === "en" ? "en" : "hi";
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(want));
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? (want === "hi" ? "hi-IN" : "en-IN");
  window.speechSynthesis.speak(u);
}

const PixelgramAssistant: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [listening, setListening] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const recRef = useRef<SpeechRec | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(1);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, open]);

  useEffect(() => () => {
    recRef.current?.stop();
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  }, []);

  if (!assistantVisibleOn(location.pathname)) return null;

  const ask = (question: string) => {
    const q = question.trim();
    if (!q) return;
    const reply = answer(q);
    setMsgs((m) => [
      ...m,
      { id: idRef.current++, role: "user", text: q },
      { id: idRef.current++, role: "ai", text: reply.text, reply },
    ]);
    setInput("");
    if (voiceOn) speak(speakableText(reply), reply.lang);
  };

  const toggleMic = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = getRecognition();
    if (!rec) return;
    window.speechSynthesis?.cancel();
    rec.lang = "hi-IN"; // understands Hindi, Hinglish and Indian English
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => {
      const text = Array.from(e.results).map((r) => r[0]?.transcript ?? "").join(" ");
      ask(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  };

  const close = () => {
    recRef.current?.stop();
    window.speechSynthesis?.cancel();
    setOpen(false);
  };

  const hasMic = !!recognitionClass();

  return (
    <>
      {!open && (
        <button
          type="button"
          aria-label="Open Pixelgram AI"
          onClick={() => setOpen(true)}
          className="fixed bottom-24 right-4 z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-primary/20 transition-transform active:scale-95"
        >
          <Bot className="h-7 w-7" />
        </button>
      )}

      {open && (
        <div role="dialog" aria-label="Pixelgram AI" className="fixed inset-0 z-[70] flex items-end justify-center bg-background/60 backdrop-blur-sm sm:items-center">
          <div className="flex h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-border bg-card text-card-foreground shadow-2xl sm:rounded-3xl">
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <div className={cn("flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground", listening && "animate-pulse")}>
                <Bot className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="font-semibold leading-tight">Pixelgram AI</p>
                <p className="text-xs text-muted-foreground">{listening ? "Sun raha hoon…" : "Kuch bhi poochiye — koi limit nahi"}</p>
              </div>
              <button type="button" aria-label={voiceOn ? "Mute voice" : "Turn voice on"} onClick={() => { setVoiceOn((v) => !v); window.speechSynthesis?.cancel(); }} className="rounded-full p-2 text-muted-foreground hover:bg-muted">
                {voiceOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
              </button>
              <button type="button" aria-label="Close" onClick={close} className="rounded-full p-2 text-muted-foreground hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {msgs.length === 0 && (
                <div className="space-y-3 text-center">
                  <p className="text-sm text-muted-foreground">Namaste! Pixelgram ke baare me kuch bhi poochiye. Bolne ke liye mic dabaiye.</p>
                  <Suggestions items={defaultSuggestions("hinglish")} onPick={ask} />
                </div>
              )}
              {msgs.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">{m.text}</div>
                ) : (
                  <div key={m.id} className="max-w-[92%] space-y-2">
                    <div className="rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm">{m.text}</div>
                    {m.reply?.topics.map((id) => (
                      <TopicCard key={id} id={id} onOpen={(route) => { close(); navigate(route); }} />
                    ))}
                    {m.reply?.showOwner && <OwnerCard />}
                    {m.reply && m.reply.suggestions.length > 0 && <Suggestions items={m.reply.suggestions} onPick={ask} />}
                  </div>
                ),
              )}
              <div ref={endRef} />
            </div>

            <form
              className="flex items-center gap-2 border-t border-border p-3"
              onSubmit={(e) => {
                e.preventDefault();
                ask(input);
              }}
            >
              {hasMic && (
                <button
                  type="button"
                  aria-label={listening ? "Stop listening" : "Speak"}
                  onClick={toggleMic}
                  className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border", listening ? "bg-destructive text-destructive-foreground" : "bg-background text-foreground")}
                >
                  {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </button>
              )}
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Yahan likhiye…"
                aria-label="Your question"
                className="h-11 flex-1 rounded-full border border-border bg-background px-4 text-sm outline-none focus:ring-2 focus:ring-primary"
              />
              <button type="submit" aria-label="Send" disabled={!input.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50">
                <Send className="h-5 w-5" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

const Suggestions: React.FC<{ items: string[]; onPick: (q: string) => void }> = ({ items, onPick }) => (
  <div className="flex flex-wrap justify-center gap-2">
    {items.map((s) => (
      <button key={s} type="button" onClick={() => onPick(s)} className="rounded-full border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted">
        {s}
      </button>
    ))}
  </div>
);

const TopicCard: React.FC<{ id: string; onOpen: (route: string) => void }> = ({ id, onOpen }) => {
  const t = getTopic(id);
  if (!t) return null;
  return (
    <div className="rounded-2xl border border-border bg-background p-3">
      <p className="mb-2 text-sm font-semibold">{t.title}</p>
      <ol className="space-y-1.5">
        {t.steps.map((s, i) => (
          <li key={i} className="flex gap-2 text-sm">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{i + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      {t.notes?.map((n) => (
        <p key={n} className="mt-2 text-xs text-muted-foreground">{n}</p>
      ))}
      {t.route && (
        <button type="button" onClick={() => onOpen(t.route!)} className="mt-3 inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
          Pixelgram me kholo <ExternalLink className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
};

const OwnerCard: React.FC = () => (
  <div className="flex items-center gap-3 rounded-2xl border border-border bg-background p-3">
    <img src={OWNER.photo} alt={OWNER.name} className="h-14 w-14 rounded-full object-cover" />
    <div className="flex-1">
      <p className="text-sm font-semibold">{OWNER.name}</p>
      <p className="text-xs text-muted-foreground">{OWNER.role}</p>
      <div className="mt-2 flex gap-2">
        <a href={OWNER.links.facebook} target="_blank" rel="noreferrer" aria-label="Facebook" className="rounded-full bg-muted p-1.5"><Facebook className="h-4 w-4" /></a>
        <a href={OWNER.links.instagram} target="_blank" rel="noreferrer" aria-label="Instagram" className="rounded-full bg-muted p-1.5"><Instagram className="h-4 w-4" /></a>
        <a href={OWNER.links.youtube} target="_blank" rel="noreferrer" aria-label="YouTube" className="rounded-full bg-muted p-1.5"><Youtube className="h-4 w-4" /></a>
        <a href={`mailto:${OWNER.links.email}`} aria-label="Email" className="rounded-full bg-muted p-1.5"><Mail className="h-4 w-4" /></a>
      </div>
    </div>
  </div>
);

export default PixelgramAssistant;
