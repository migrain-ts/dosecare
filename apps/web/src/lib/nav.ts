const BASE = 'http://localhost';
// Any whitespace or control character: browsers strip tab/newline when parsing URLs ("/\t/x" -> "//x").
const UNSAFE_CHARS = /[\s\u0000-\u001f\u007f-\u009f]/;

export function safeNext(next: string | null | undefined, fallback = '/today'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\') || UNSAFE_CHARS.test(next)) {
    return fallback;
  }
  let url: URL;
  try {
    url = new URL(next, BASE);
  } catch {
    return fallback;
  }
  const rest = url.pathname + url.search + url.hash;
  if (url.origin !== BASE || !rest.startsWith('/') || rest.startsWith('//')) return fallback;
  return next;
}
