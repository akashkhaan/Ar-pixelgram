export type ReplyLang = "en" | "hinglish" | "hi";
export interface BrainReply {
  lang: ReplyLang;
  text: string;
  topics: string[];
  showOwner: boolean;
  suggestions: string[];
}
export declare function detectLang(text: string): ReplyLang;
export declare function answer(question: string): BrainReply;
export declare function defaultSuggestions(lang: ReplyLang): string[];
export declare function speakableText(result: BrainReply): string;
