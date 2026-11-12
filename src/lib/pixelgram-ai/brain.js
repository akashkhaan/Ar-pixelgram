// Pixelgram AI — offline "brain".
// Works completely inside the app (website + APK): no AI company, no API key, no internet needed,
// and NO question limit. It understands English, Hinglish and Hindi questions about Pixelgram and
// answers only from the Pixelgram knowledge in ./knowledge.js (never invents features).
import { KNOWLEDGE, OWNER, getTopic, isOwnerQuestion } from "./knowledge.js";

/** Extra Hinglish / Hindi words that point to each help topic. */
const EXTRA_KEYWORDS = {
  register: ["naya account", "account bana", "account kaise bana", "id bana", "id kaise bana", "signup", "खाता बना", "अकाउंट बना", "रजिस्टर"],
  login: ["login nahi", "login kaise", "log in kaise", "sign in kaise", "लॉगिन"],
  "reset-password": ["password bhool", "password bhul", "password yaad nahi", "password badal", "password change", "naya password", "पासवर्ड"],
  "account-center": ["account delete", "delete account", "account hata", "account band kar", "email badal", "number badal", "mobile number badal", "अकाउंट डिलीट"],
  "profile-picture": ["profile photo", "profile pic", "dp badal", "dp change", "dp kaise", "naam badal", "bio badal", "username badal", "प्रोफाइल", "डीपी"],
  language: ["bhasha badal", "language badal", "hindi me kaise", "भाषा"],
  verification: ["blue tick", "blue tik", "verified kaise", "verify kaise", "नीला टिक", "वेरीफाई"],
  "create-post": ["post kaise", "post kar", "post dal", "photo dal", "photo upload", "photo kaise dal", "post bana", "पोस्ट", "फोटो डाल"],
  "create-reel": ["reel kaise", "reel bana", "reel dal", "reel upload", "रील"],
  "create-story": ["story kaise", "story dal", "story laga", "status laga", "status dal", "स्टोरी", "स्टेटस"],
  "upload-video": ["video kaise dal", "video dal", "video upload", "lambi video", "वीडियो"],
  music: ["gaana", "gana", "gaane", "gane", "song lag", "music lag", "गाना", "संगीत", "म्यूजिक"],
  "like-comment-share": ["like kaise", "comment kaise", "share kaise", "लाइक", "कमेंट", "शेयर"],
  follow: ["follow kaise", "follower", "dost dhoond", "dost kaise", "logo ko dhoond", "फॉलो", "दोस्त"],
  "send-message": ["message kaise", "message bhej", "msg bhej", "msg kaise", "baat kaise", "chat kaise", "मैसेज", "संदेश"],
  calls: ["call kaise", "video call", "call kar", "phone kar", "कॉल"],
  groups: ["group kaise", "group bana", "group join", "ग्रुप", "समूह"],
  notifications: ["notification band", "notification chalu", "notification nahi", "नोटिफिकेशन", "सूचना"],
  "private-account": ["private kaise", "account private", "profile chupa", "profile chhupa", "प्राइवेट", "छुपा"],
  block: ["block kaise", "unblock kaise", "block kar", "ब्लॉक"],
  report: ["report kaise", "shikayat", "complaint", "fake id", "fraud", "galat banda", "रिपोर्ट", "शिकायत"],
  appeal: ["account band ho", "account ban", "id band", "account suspend", "account block ho gaya", "बैन", "बंद हो गया"],
  "video-not-uploading": ["upload nahi", "upload nhi", "post nahi ho", "video nahi ja", "atak gaya", "atka hua", "अपलोड नहीं"],
};

const HINGLISH_WORDS = /\b(kaise|kese|kya|kyu|kyon|hai|hain|ho|karu|karun|kare|karna|karo|kar|mera|meri|mere|mujhe|muje|nahi|nhi|kaha|kahan|kaun|bana|banau|banaye|dal|dalu|batao|bata|bhai|yaar|aap|tum|kab|kitna|chahiye|hota|raha|rahi)\b/i;

/** "en" | "hinglish" | "hi" (Devanagari). */
export function detectLang(text) {
  const t = String(text || "");
  if (/[\u0900-\u097F]/.test(t)) return "hi";
  if (HINGLISH_WORDS.test(t)) return "hinglish";
  return "en";
}

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[?!.,;:'"()[\]{}|/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SAY = {
  greeting: {
    en: "Hello! I'm Pixelgram AI. Ask me anything about using Pixelgram — posts, reels, stories, messages, privacy and more.",
    hinglish: "Namaste! Main Pixelgram AI hoon. Pixelgram ke baare me kuch bhi poochiye — post, reel, story, message, privacy, sab kuch.",
    hi: "नमस्ते! मैं Pixelgram AI हूँ। Pixelgram के बारे में कुछ भी पूछिए — पोस्ट, रील, स्टोरी, मैसेज, प्राइवेसी।",
  },
  thanks: {
    en: "You're welcome! Ask anytime.",
    hinglish: "Koi baat nahi! Jab man kare tab poochiye.",
    hi: "कोई बात नहीं! जब मन करे तब पूछिए।",
  },
  bye: {
    en: "Bye! I'm here whenever you need help.",
    hinglish: "Bye! Jab bhi madad chahiye, main yahin hoon.",
    hi: "अलविदा! जब भी मदद चाहिए, मैं यहीं हूँ।",
  },
  whoAmI: {
    en: "I'm Pixelgram AI, the built-in helper of Pixelgram. I work right inside the app — no limits, no internet needed.",
    hinglish: "Main Pixelgram AI hoon, Pixelgram ka apna madadgaar. Main app ke andar hi chalta hoon — koi limit nahi, internet ke bina bhi.",
    hi: "मैं Pixelgram AI हूँ, Pixelgram का अपना मददगार। मैं ऐप के अंदर ही चलता हूँ — कोई लिमिट नहीं।",
  },
  help: {
    en: "I can guide you step by step. Try: “How do I upload a reel?”, “Forgot password”, “Make my account private”, or “Who owns Pixelgram?”",
    hinglish: "Main aapko step-by-step bata sakta hoon. Jaise poochiye: “Reel kaise banaye?”, “Password bhool gaya”, “Account private kaise kare?”, ya “Pixelgram ka malik kaun hai?”",
    hi: "मैं आपको कदम-दर-कदम बता सकता हूँ। जैसे पूछिए: “रील कैसे बनाएं?”, “पासवर्ड भूल गया”, “Pixelgram का मालिक कौन है?”",
  },
  secret: {
    en: "Please never share your password or OTP with anyone — not even with me. Pixelgram will never ask for it.",
    hinglish: "Apna password ya OTP kabhi kisi ko mat batayiye — mujhe bhi nahi. Pixelgram kabhi ye nahi maangta.",
    hi: "अपना पासवर्ड या OTP कभी किसी को मत बताइए — मुझे भी नहीं।",
  },
  contact: {
    en: `You can reach the Pixelgram team on Facebook, Instagram, YouTube or by email at ${OWNER.links.email}.`,
    hinglish: `Pixelgram team se Facebook, Instagram, YouTube ya email ${OWNER.links.email} par baat kar sakte hain.`,
    hi: `Pixelgram टीम से Facebook, Instagram, YouTube या ईमेल ${OWNER.links.email} पर संपर्क करें।`,
  },
  unknown: {
    en: `I'm not sure about that yet. If it's a Pixelgram problem, use Settings → Report a Problem or email ${OWNER.links.email}.`,
    hinglish: `Iska pakka jawab mujhe abhi nahi pata. Pixelgram ki koi dikkat ho to Settings → Report a Problem me likhiye ya ${OWNER.links.email} par email kijiye.`,
    hi: `इसका पक्का जवाब मुझे अभी नहीं पता। Settings → Report a Problem में लिखिए या ${OWNER.links.email} पर ईमेल कीजिए।`,
  },
};

const INTRO = {
  en: (title) => `Here's how — ${title}:`,
  hinglish: (title) => `Ye raha tarika — ${title}:`,
  hi: (title) => `यह रहा तरीका — ${title}:`,
};

function scoreTopics(norm) {
  const results = [];
  for (const topic of KNOWLEDGE) {
    let score = 0;
    const words = [...topic.keywords, ...(EXTRA_KEYWORDS[topic.id] || [])];
    for (const raw of words) {
      const k = raw.toLowerCase();
      const hit = /[\u0900-\u097F]/.test(k) ? norm.includes(k) : new RegExp(`(^|\\s)${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(norm);
      if (hit) score += k.split(" ").length * 2 + k.length / 10;
    }
    if (score > 0) results.push({ topic, score });
  }
  return results.sort((a, b) => b.score - a.score);
}

/**
 * Answer one question. Returns
 * { lang, text, topics: string[], showOwner: boolean, suggestions: string[] }.
 */
export function answer(question) {
  const lang = detectLang(question);
  const norm = normalize(question);
  const reply = (text, extra = {}) => ({ lang, text, topics: [], showOwner: false, suggestions: [], ...extra });

  if (!norm) return reply(SAY.help[lang]);

  if (/\b(otp|password|pass)\b.*\b\d{4,}\b|\b\d{4,}\b.*\b(otp)\b/.test(norm) || /(mera|my) password (hai|is)\b/.test(norm)) {
    return reply(SAY.secret[lang]);
  }
  if (isOwnerQuestion(question)) {
    return reply(OWNER.answer, { showOwner: true });
  }
  if (/\b(contact|sampark|email|gmail|whatsapp|phone number|helpline|customer care)\b|संपर्क/.test(norm) && !/\b(badal|change|update|primary)\b/.test(norm)) {
    return reply(SAY.contact[lang], { showOwner: true });
  }

  const matches = scoreTopics(norm);
  if (matches.length) {
    const best = matches[0];
    const topics = [best.topic.id];
    const second = matches[1];
    if (second && second.score >= best.score * 0.8) topics.push(second.topic.id);
    return reply(INTRO[lang](best.topic.title), { topics });
  }

  if (/^(hi+|hello+|hey+|helo|namaste|namaskar|salam|hii+|good (morning|evening|night))\b|नमस्ते|नमस्कार/.test(norm)) return reply(SAY.greeting[lang]);
  if (/\b(thanks?|thank you|thx|shukriya|dhanyavad|dhanyawad)\b|धन्यवाद|शुक्रिया/.test(norm)) return reply(SAY.thanks[lang]);
  if (/\b(bye|alvida|tata|ok bye)\b|अलविदा/.test(norm)) return reply(SAY.bye[lang]);
  if (/\b(who are you|tum kaun|aap kaun|tu kaun|your name|tumhara naam|aapka naam)\b|आप कौन|तुम कौन/.test(norm)) return reply(SAY.whoAmI[lang]);
  if (/\b(help|madad|kya kar sakte|what can you do|options)\b|मदद/.test(norm)) {
    return reply(SAY.help[lang], { suggestions: defaultSuggestions(lang) });
  }
  return reply(SAY.unknown[lang], { suggestions: defaultSuggestions(lang) });
}

export function defaultSuggestions(lang) {
  if (lang === "en") return ["How do I upload a reel?", "Forgot password", "Make my account private", "Who owns Pixelgram?"];
  return ["Reel kaise banaye?", "Password bhool gaya", "Account private kaise kare?", "Pixelgram ka malik kaun hai?"];
}

/** Plain text that the phone reads aloud for a reply. */
export function speakableText(result) {
  const parts = [result.text];
  for (const id of result.topics.slice(0, 1)) {
    const t = getTopic(id);
    if (t) parts.push(...t.steps.map((s, i) => `${i + 1}. ${s}`));
  }
  return parts.join(" ").replace(/[→*_`#]/g, " ").replace(/\s+/g, " ").trim();
}
