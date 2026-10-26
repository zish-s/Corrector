/**
 * Mechanical prose checks. These are deliberately conservative: they do not try
 * to judge whether a hint is *good*, only whether it obeys the hard Socratic
 * contract. Semantic quality is measured separately by the benchmark.
 */

/** Remove code, inline code, URLs and indented code so their punctuation does
 * not count as a question. */
export function stripNonProse(input: string): string {
  return input
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/~~~[\s\S]*?~~~/g, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/^(?: {4}|\t).*$/gm, " ");
}

export function countQuestions(input: string): number {
  const matches = stripNonProse(input).match(/\?+/g);
  return matches?.length ?? 0;
}

export function lastQuestion(input: string): string | null {
  const matches = stripNonProse(input).match(/[^.!?]*\?/g);
  const last = matches?.[matches.length - 1];
  return last ? last.trim() : null;
}

/** Tolerates closing quotes/brackets after the question mark, but not a code
 * block or an indented code line after it: the message must end with the
 * question itself. */
export function endsWithQuestion(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  if (/(?:```|~~~)\s*$/u.test(trimmed)) return false;
  const lines = trimmed.split(/\r?\n/);
  const lastLine = lines[lines.length - 1] ?? "";
  if (/^(?: {4}|\t)\S/u.test(lastLine)) return false;
  return /[?]\s*(?:["'”’)\]}])*\s*$/u.test(stripNonProse(trimmed));
}

export function normalizeQuestion(input: string): string {
  return input
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
