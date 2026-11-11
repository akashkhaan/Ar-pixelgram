export interface KnowledgeTopic {
  id: string;
  title: string;
  category: "Account" | "Content" | "Social" | "Messaging" | "Privacy & Safety" | "Troubleshooting";
  keywords: string[];
  route?: string;
  steps: string[];
  notes?: string[];
  verified: boolean;
}

export declare const OWNER: {
  readonly name: string;
  readonly role: string;
  readonly photo: string;
  readonly answer: string;
  readonly links: {
    readonly facebook: string;
    readonly instagram: string;
    readonly youtube: string;
    readonly email: string;
  };
};

export declare const KNOWLEDGE: KnowledgeTopic[];
export declare function isOwnerQuestion(text: string): boolean;
export declare function getTopic(id: string): KnowledgeTopic | undefined;
export declare function knowledgeAsText(): string;
export declare function buildSystemPrompt(preferredLang: string | null): string;
