// Run: node --test src/lib/pixelgram-ai/brain.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { answer, detectLang } from "./brain.js";
import { OWNER } from "./knowledge.js";

test("owner question gets the exact official sentence", () => {
  for (const q of ["Who owns Pixelgram?", "Pixelgram ka malik kaun hai", "पिक्सेलग्राम का मालिक कौन है"]) {
    const r = answer(q);
    assert.equal(r.text, "The owner and creator of Pixelgram is Aakash.");
    assert.equal(r.showOwner, true);
  }
});

test("only approved contacts, never a WhatsApp number", () => {
  assert.deepEqual(Object.keys(OWNER.links).sort(), ["email", "facebook", "instagram", "youtube"]);
  const r = answer("whatsapp number do contact ke liye");
  assert.equal(r.showOwner, true);
  assert.match(r.text, /arpixelgram@gmail\.com/);
  assert.doesNotMatch(r.text, /\+?\d{10}/);
});

test("Hinglish, Hindi and English how-to questions find the right help", () => {
  assert.deepEqual(answer("reel kaise banaye").topics.slice(0, 1), ["create-reel"]);
  assert.deepEqual(answer("How do I upload a reel?").topics.slice(0, 1), ["create-reel"]);
  assert.deepEqual(answer("password bhool gaya").topics.slice(0, 1), ["reset-password"]);
  assert.deepEqual(answer("रील कैसे बनाएं").topics.slice(0, 1), ["create-reel"]);
  assert.deepEqual(answer("account private kaise kare").topics.slice(0, 1), ["private-account"]);
  assert.deepEqual(answer("kisi ko block kaise kare").topics.slice(0, 1), ["block"]);
  assert.deepEqual(answer("story kaise lagaye").topics.slice(0, 1), ["create-story"]);
});

test("replies in the user's language style", () => {
  assert.equal(detectLang("reel kaise banaye"), "hinglish");
  assert.equal(detectLang("रील कैसे"), "hi");
  assert.equal(detectLang("How do I post?"), "en");
  assert.match(answer("reel kaise banaye").text, /Ye raha tarika/);
});

test("warns instead of accepting an OTP", () => {
  assert.match(answer("mera otp 482913 hai").text, /OTP/);
});

test("no limit: 500 questions in a row all get answers", () => {
  for (let i = 0; i < 500; i++) assert.ok(answer(`reel kaise banaye ${i}`).text.length > 0);
});

test("unknown questions do not invent anything", () => {
  const r = answer("crypto trading kaise kare");
  assert.deepEqual(r.topics, []);
  assert.match(r.text, /Report a Problem/);
});
