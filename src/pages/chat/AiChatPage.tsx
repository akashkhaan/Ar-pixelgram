import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Send, Trash2 } from "lucide-react";

type AiMessage = { role: "user" | "assistant"; content: string };

const STORAGE_KEY = "ar-pixelgram-ai-chat";
const SUGGESTIONS = [
  "Tumhe kisne banaya?",
  "Mere liye ek website ka code likho",
  "Ek funny shayari sunao",
  "Aaj kya naya seekhun?",
];

function loadMessages(): AiMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function AiChatPage() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<AiMessage[]>(loadMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-60)));
    } catch {
      /* ignore */
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || loading) return;
    const next: AiMessage[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setError("");
    setLoading(true);
    try {
      const apiBase = (import.meta.env.VITE_MUSIC_API_URL || "").replace(/\/+$/, "");
      const res = await fetch(`${apiBase}/api/ai-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "AI abhi available nahi hai");
      setMessages((m) => [...m, { role: "assistant", content: String(data.reply || "") }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kuch galat ho gaya");
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="ai-page">
      <style>{`
        .ai-page{position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;background:#f7f7fb;color:#14142b;font-family:inherit}
        .ai-head{display:flex;align-items:center;gap:12px;padding:14px 16px;padding-top:max(14px,env(safe-area-inset-top));background:#fff;border-bottom:1px solid #ececf3}
        .ai-icon-btn{width:40px;height:40px;border-radius:14px;border:0;background:#f0f0f5;display:grid;place-items:center;color:#14142b}
        .ai-orb{width:40px;height:40px;border-radius:50%;background:conic-gradient(from 200deg,#ec4899,#8b5cf6,#3b82f6,#ec4899);box-shadow:0 0 18px rgba(139,92,246,.45);flex:none;position:relative}
        .ai-orb::after{content:"";position:absolute;inset:6px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff9,#ffffff10 60%)}
        .ai-title{flex:1;min-width:0}
        .ai-title b{display:block;font-size:17px}
        .ai-title small{color:#7a7a96;font-size:12px}
        .ai-body{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px}
        .ai-hero{margin:auto 0;text-align:center;padding:24px 8px}
        .ai-hero .ai-orb{width:84px;height:84px;margin:0 auto 16px}
        .ai-hero h2{font-size:22px;font-weight:800;margin:0 0 6px}
        .ai-hero p{color:#7a7a96;margin:0 0 18px;font-size:14px}
        .ai-sugs{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
        .ai-sug{border:1px solid #e3e3ee;background:#fff;border-radius:999px;padding:9px 14px;font-size:13px;color:#14142b}
        .ai-msg{max-width:85%;padding:10px 14px;border-radius:18px;font-size:15px;line-height:1.45;white-space:pre-wrap;word-break:break-word}
        .ai-msg.user{align-self:flex-end;background:linear-gradient(135deg,#ec4899,#8b5cf6);color:#fff;border-bottom-right-radius:6px}
        .ai-msg.assistant{align-self:flex-start;background:#fff;border:1px solid #ececf3;border-bottom-left-radius:6px}
        .ai-typing{align-self:flex-start;display:flex;gap:5px;padding:14px;background:#fff;border:1px solid #ececf3;border-radius:18px}
        .ai-typing span{width:7px;height:7px;border-radius:50%;background:#8b5cf6;animation:aiDot 1s infinite ease-in-out}
        .ai-typing span:nth-child(2){animation-delay:.15s}.ai-typing span:nth-child(3){animation-delay:.3s}
        @keyframes aiDot{0%,80%,100%{opacity:.3;transform:translateY(0)}40%{opacity:1;transform:translateY(-4px)}}
        .ai-err{align-self:center;color:#dc2626;font-size:13px;text-align:center}
        .ai-foot{display:flex;gap:8px;align-items:flex-end;padding:10px 12px;padding-bottom:max(10px,env(safe-area-inset-bottom));background:#fff;border-top:1px solid #ececf3}
        .ai-foot textarea{flex:1;resize:none;max-height:120px;border:1px solid #e3e3ee;border-radius:22px;padding:11px 16px;font-size:15px;outline:none;background:#f7f7fb;font-family:inherit;color:#14142b}
        .ai-send{width:44px;height:44px;border:0;border-radius:50%;background:linear-gradient(135deg,#ec4899,#8b5cf6);color:#fff;display:grid;place-items:center;flex:none}
        .ai-send:disabled{opacity:.45}
      `}</style>

      <header className="ai-head">
        <button type="button" className="ai-icon-btn" aria-label="Back" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </button>
        <div className="ai-orb" />
        <div className="ai-title">
          <b>Ar Pixelgram AI</b>
          <small>{loading ? "Typing..." : "Kuch bhi poocho"}</small>
        </div>
        {messages.length > 0 && (
          <button type="button" className="ai-icon-btn" aria-label="Clear chat" onClick={() => setMessages([])}>
            <Trash2 size={18} />
          </button>
        )}
      </header>

      <main className="ai-body">
        {messages.length === 0 && (
          <div className="ai-hero">
            <div className="ai-orb" />
            <h2>Ar Pixelgram AI</h2>
            <p>Sawal poocho, code likhwao, ya bas baat karo.</p>
            <div className="ai-sugs">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="ai-sug" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`ai-msg ${m.role}`}>
            {m.content}
          </div>
        ))}
        {loading && (
          <div className="ai-typing">
            <span />
            <span />
            <span />
          </div>
        )}
        {error && <div className="ai-err">{error}</div>}
        <div ref={bottomRef} />
      </main>

      <form
        className="ai-foot"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          placeholder="Ask Ar Pixelgram AI..."
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
        />
        <button type="submit" className="ai-send" aria-label="Send" disabled={!input.trim() || loading}>
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
