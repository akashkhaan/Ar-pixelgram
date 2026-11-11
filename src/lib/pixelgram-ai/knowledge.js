// Pixelgram AI — shared help knowledge (used by the website/APK widget AND by server.mjs).
// Plain JavaScript so the Render Node server can import it without a build step.
// Types live in knowledge.d.ts. Add or edit topics here only from real Pixelgram features.

/** Official owner identity. Only these contact details are approved — never add others. */
export const OWNER = {
  name: "Aakash",
  role: "Owner & Creator of Pixelgram",
  photo: "/pixelgram-ai/owner.jpg",
  answer: "The owner and creator of Pixelgram is Aakash.",
  links: {
    facebook: "https://www.facebook.com/profile.php?id=61574937124448",
    instagram: "https://www.instagram.com/akash_raaj_89?dlrf=MXR3NTNhaTB2Mm15cg==",
    youtube: "https://youtube.com/@techtrickindia9?si=GYS7E7RO4E6bo1LR",
    email: "arpixelgram@gmail.com",
  },
};

const OWNER_PATTERNS = [
  /\b(who|whose)\b.*\b(own|owns|owner|creat|made|make|found|built|develop|ceo|behind)/i,
  /\b(owner|creator|founder|developer|maker|ceo)\b/i,
  /(मालिक|ओनर|बनाया|किसने बनाई|किसका है|निर्माता|संस्थापक)/,
  /(malik|maalik|kisne banaya|kisne banai|kiska hai|owner kaun|banane wala)/i,
  /(মালিক|কে তৈরি|প্রতিষ্ঠাতা)/,
  /(உரிமையாளர்|யார் உருவாக்கியது)/,
  /(యజమాని|ఎవరు సృష్టించారు)/,
  /(مالک|کس نے بنایا|مالك|من أنشأ|من صنع)/,
  /(propriétaire|créateur|fondateur|dueño|propietario|creador|fundador|besitzer|gründer|ersteller|dono|criador)/i,
  /(所有者|创建者|创始人|オーナー|作成者|創設者)/,
];

export function isOwnerQuestion(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  return OWNER_PATTERNS.some((p) => p.test(t));
}

export const KNOWLEDGE = [
  {
    id: "register",
    title: "Create a Pixelgram account",
    category: "Account",
    keywords: ["register", "sign up", "signup", "new account", "create account"],
    route: "/register",
    steps: [
      "Open Pixelgram and tap Register (page /register).",
      "Fill in your details. You can sign up with email or with a mobile number (phone OTP).",
      "Enter the OTP code you receive to confirm.",
      "Finish setup and you land on Home.",
    ],
    notes: ["A profile photo uploaded during sign-up must be under 8 MB."],
    verified: false,
  },
  {
    id: "login",
    title: "Log in",
    category: "Account",
    keywords: ["login", "log in", "sign in", "can't login"],
    route: "/login",
    steps: [
      "Open /login.",
      "Enter your email, username or mobile number and your password.",
      "Tap Log in.",
    ],
    verified: false,
  },
  {
    id: "reset-password",
    title: "Reset a forgotten password",
    category: "Account",
    keywords: ["forgot password", "reset password", "change password", "password"],
    route: "/forgot-password",
    steps: [
      "On the login screen tap Forgot password (page /forgot-password).",
      "Enter your Mobile number, or your Email ya username.",
      "Enter the OTP code that is sent to you.",
      "Type your new password in Naya password and again in Password dobara.",
      "Tap Log in with the new password.",
    ],
    notes: ["Signed-in users can also change the password from Settings → Account Center using an email OTP."],
    verified: true,
  },
  {
    id: "account-center",
    title: "Manage email, phone and account (Account Center)",
    category: "Account",
    keywords: ["account center", "email", "phone number", "contact", "primary contact", "delete account", "switch account"],
    route: "/settings/account-center",
    steps: [
      "Tap Profile in the bottom bar, then open Settings.",
      "Choose Account Center.",
      "Add or remove contacts, set a Primary contact, or update your credentials.",
    ],
    notes: ["Settings also has Switch account to add or switch between accounts."],
    verified: true,
  },
  {
    id: "profile-picture",
    title: "Change profile picture, name, bio or username",
    category: "Account",
    keywords: ["profile picture", "dp", "photo", "avatar", "edit profile", "bio", "username", "name"],
    route: "/edit-profile",
    steps: [
      "Tap Profile in the bottom bar.",
      "Tap Edit profile (page /edit-profile).",
      "Tap your photo to choose a new one, or change Username / name / bio.",
      "Save your changes.",
    ],
    notes: ["Profile photos on Edit Profile must be under 2 MB."],
    verified: false,
  },
  {
    id: "language",
    title: "Change the app language",
    category: "Account",
    keywords: ["language", "bhasha", "change language"],
    route: "/settings/language",
    steps: ["Open Settings.", "Tap Language.", "Pick your language."],
    verified: true,
  },
  {
    id: "verification",
    title: "Request a blue verified badge",
    category: "Account",
    keywords: ["verify", "verified", "blue tick", "badge", "verification"],
    route: "/settings",
    steps: [
      "Open Settings.",
      "Open Verification and choose Verification Request.",
      "Explain why your account should be verified and submit.",
    ],
    notes: ["The blue verified badge shown in the app has 30-day validity. Requests are reviewed by Pixelgram admins."],
    verified: false,
  },
  {
    id: "create-post",
    title: "Create a post",
    category: "Content",
    keywords: ["post", "create post", "upload photo", "share photo", "new post"],
    route: "/create",
    steps: [
      "Open Create (page /create).",
      "Choose Photo or Video and select your file.",
      "Write a Caption.",
      "Publish the post.",
    ],
    notes: ["Photos must be under 15 MB and videos under 100 MB."],
    verified: true,
  },
  {
    id: "create-reel",
    title: "Upload a reel",
    category: "Content",
    keywords: ["reel", "reels", "upload reel", "short video"],
    route: "/create-reel",
    steps: [
      "Open Reels and tap create (page /create-reel).",
      "Record with the camera (effects are available) or tap Gallery se select karein to choose a video.",
      "Tap Next.",
      "Add a Description and choose Visibility: Public or Private.",
      "Publish.",
    ],
    notes: ["Reel videos must be under 150 MB."],
    verified: true,
  },
  {
    id: "create-story",
    title: "Create a story",
    category: "Content",
    keywords: ["story", "stories", "status", "add story"],
    route: "/stories",
    steps: [
      "Tap Stories in the bottom bar.",
      "Add a new story and pick a photo or video.",
      "Optionally add Story music.",
      "Share it.",
    ],
    notes: ["Story photos must be under 10 MB and story videos under 100 MB."],
    verified: false,
  },
  {
    id: "upload-video",
    title: "Upload a long video",
    category: "Content",
    keywords: ["video", "upload video", "videos tab", "long video"],
    route: "/upload-video",
    steps: ["Tap Video in the bottom bar.", "Choose upload (page /upload-video).", "Select the video, add details and publish."],
    verified: false,
  },
  {
    id: "music",
    title: "Music and songs",
    category: "Content",
    keywords: ["music", "song", "songs", "audio"],
    steps: [
      "Songs used in reels and stories open on their own song page (/song/…).",
      "Tap the song name on a reel or story to open it.",
    ],
    verified: false,
  },
  {
    id: "like-comment-share",
    title: "Like, comment and share",
    category: "Social",
    keywords: ["like", "comment", "share", "send post"],
    steps: [
      "Under a post or reel, tap the heart to like it.",
      "Tap the comment icon to read or write comments.",
      "Tap share to send it as a message, share to WhatsApp, or use More sharing options.",
    ],
    verified: false,
  },
  {
    id: "follow",
    title: "Follow people and see followers",
    category: "Social",
    keywords: ["follow", "unfollow", "followers", "following", "find people", "search user"],
    route: "/people",
    steps: [
      "Use People (Log tab) or Search to find someone.",
      "Open their profile and tap Follow.",
      "On any profile, tap Followers or Following to see the lists.",
    ],
    verified: false,
  },
  {
    id: "send-message",
    title: "Send a direct message",
    category: "Messaging",
    keywords: ["message", "dm", "chat", "inbox", "send message"],
    route: "/chat",
    steps: [
      "Tap Chat in the bottom bar.",
      "Open an existing conversation or open someone's profile and choose message.",
      "Type and send.",
    ],
    verified: false,
  },
  {
    id: "calls",
    title: "Make a voice or video call",
    category: "Messaging",
    keywords: ["call", "video call", "voice call", "audio call", "calling"],
    route: "/chat",
    steps: [
      "Tap Chat and open the conversation with that person.",
      "At the top, tap the Audio call button or the Video call button.",
      "Allow microphone (and camera for video) when your browser or phone asks.",
    ],
    notes: ["Group calls are also available inside group chats."],
    verified: true,
  },
  {
    id: "groups",
    title: "Create or join a group",
    category: "Messaging",
    keywords: ["group", "group chat", "create group", "join group", "invite link"],
    route: "/groups/new",
    steps: [
      "Open Chat and choose create group (page /groups/new).",
      "Add members, name the group and create it.",
      "Others can join with a group invite link.",
    ],
    verified: false,
  },
  {
    id: "notifications",
    title: "Notification settings",
    category: "Account",
    keywords: ["notification", "notifications", "push", "alerts"],
    route: "/settings/notifications",
    steps: [
      "Open Settings → Notifications.",
      "Check Browser permission and This device, and allow notifications if needed.",
      "Your choices are Saved on server.",
    ],
    verified: true,
  },
  {
    id: "private-account",
    title: "Make your account private (privacy)",
    category: "Privacy & Safety",
    keywords: ["privacy", "private", "private account", "public", "hide profile"],
    route: "/edit-profile",
    steps: [
      "Open Settings and tap Privacy (it opens Edit Profile).",
      "Turn on Private Account.",
      "Save.",
    ],
    verified: true,
  },
  {
    id: "block",
    title: "Block or unblock someone",
    category: "Privacy & Safety",
    keywords: ["block", "unblock", "blocked"],
    steps: [
      "Open that person's profile.",
      "Tap the more (…) menu.",
      "Tap Block and confirm. Use the same menu and tap Unblock to undo.",
    ],
    notes: ["Blocked people can't see your posts, reels or stories, tag you, message or call you, or find your profile in search."],
    verified: true,
  },
  {
    id: "report",
    title: "Report an account or a problem",
    category: "Privacy & Safety",
    keywords: ["report", "report account", "fake account", "spam", "harassment", "scam", "report problem", "bug"],
    steps: [
      "To report a person: open their profile → more (…) menu → Report profile, pick a reason and submit.",
      "To report an app problem: Settings → Report a Problem. Choose a reason (Spam, Scam or fraud, Something isn't working, etc.). You can attach a screenshot or video (up to 50 MB).",
    ],
    verified: true,
  },
  {
    id: "appeal",
    title: "Appeal a suspended account",
    category: "Privacy & Safety",
    keywords: ["appeal", "banned", "suspended", "disabled", "account blocked"],
    route: "/appeal",
    steps: ["Open /appeal.", "Fill in the form and attach proof if asked (up to 5 MB).", "Submit and wait for the admin review."],
    verified: false,
  },
  {
    id: "video-not-uploading",
    title: "Video or photo not uploading",
    category: "Troubleshooting",
    keywords: ["not uploading", "upload failed", "upload error", "video not upload", "stuck"],
    steps: [
      "Check the file size: posts — photo 15 MB, video 100 MB; reels — 150 MB; stories — photo 10 MB, video 100 MB; profile photo — 2 MB.",
      "Use a common format (MP4/MOV/WEBM for video, JPG/PNG for photos).",
      "Check your internet connection and keep the app open until upload finishes.",
      "Refresh the page or reopen the app, then try again.",
      "Still failing? Settings → Report a Problem and attach a screenshot.",
    ],
    verified: true,
  },
];

export function getTopic(id) {
  return KNOWLEDGE.find((t) => t.id === id);
}

export function knowledgeAsText() {
  return KNOWLEDGE.map(
    (t) =>
      `### [${t.id}] ${t.title}${t.route ? ` (page ${t.route})` : ""}\n` +
      t.steps.map((s, i) => `${i + 1}. ${s}`).join("\n") +
      (t.notes && t.notes.length ? `\nNotes: ${t.notes.join(" ")}` : ""),
  ).join("\n\n");
}

/** System instructions for the AI model. `preferredLang` is a language name or null (auto). */
export function buildSystemPrompt(preferredLang) {
  return `You are "Pixelgram AI", the official voice-first help assistant of the social platform Pixelgram.

LANGUAGE RULES
- Detect the language (and script) of the user's latest message and reply in that same language. Hinglish (Hindi in Latin letters) gets a Hinglish reply.
- If the user switches language, switch with them and keep the conversation context.
- ${preferredLang ? `The user selected "${preferredLang}" as preferred language; use it unless they clearly write in another language.` : "No language is preselected; follow the user."}
- Begin EVERY reply with a hidden tag of the reply language as an ISO-639-1 code, exactly like ⟦lang:hi⟧ — then the answer. Never mention the tag.

STYLE
- Replies are often spoken aloud: keep them short, warm and clear. Use numbered steps for how-to answers (max ~6 steps).
- When a knowledge topic below matches, add on its own final line: [[topic:<id>]] (one or two at most). The app turns this into a visual step card.

TRUTHFULNESS
- Answer ONLY from the Pixelgram knowledge below. If a feature or detail is not listed, say you are not sure it exists and suggest Settings → Report a Problem or emailing ${OWNER.links.email}. Never invent features, buttons, prices or policies.
- You cannot change settings, post, message, block or do anything on the user's account. Never claim you did. Only give instructions.
- Never ask for passwords, OTP codes or tokens. If someone shares one, tell them not to share it.

OWNER
- If asked who owns, created, made or founded Pixelgram, answer exactly (translated into the user's language if they did not write English): "${OWNER.answer}" and add [[owner]] on its own final line.
- Official contacts (share only these): Facebook, Instagram, YouTube (shown on the owner card) and email ${OWNER.links.email}. There is no WhatsApp number or phone number — never invent one.

PIXELGRAM KNOWLEDGE
${knowledgeAsText()}`;
}
