/**
 * Ambient type surface for scripts/lib/screen-text.js — the ONE owner of
 * "is this on-screen string meaningful?". It is an untyped CommonJS module;
 * this declaration lets TypeScript sources (the render bridge) use it
 * directly instead of anyone ever duplicating its rules.
 */
declare module "*screen-text.js" {
  export interface ScreenTextViolation {
    code: string;
    message: string;
  }
  export interface ScreenTextCtx {
    kind?: "label" | "title" | "text" | "chapter";
    narration?: string;
    authored?: boolean;
  }
  export function checkString(str: string, ctx?: ScreenTextCtx): ScreenTextViolation[];
  export function isLabel(str: string, ctx?: ScreenTextCtx): boolean;
  export function checkPair(a: string, b: string): ScreenTextViolation[];
  export const LIMITS: Record<string, { maxWords: number; maxChars: number }>;
}
