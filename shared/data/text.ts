// Text helpers for the book texts. Kept apart from index.ts so that the client can use them without pulling in the dataset loaders
// First sentence of a book text, without markdown markup
export function summarize(markdown: string | undefined, maxLength = 180): string {
  const text = (markdown ?? "")
    .split("\n")
    .filter((line) => line.trim() && !line.trim().startsWith("#") && !line.trim().startsWith("|"))
    .join(" ")
    .replace(/[*_`>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const sentence = (text.match(/^.*?[.!?](\s|$)/) ?? [text])[0].trim();
  return sentence.length > maxLength ? sentence.slice(0, maxLength - 1).trimEnd() + "…" : sentence;
}
