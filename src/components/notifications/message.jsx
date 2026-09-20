export default function Message({ text = "" }) {
  const pattern = /\[([^\]\n]+)\]\((https?:\/\/[^\s<>"']+)\)|(https?:\/\/[^\s<>"']+)/gi;
  const parts = [];
  let offset = 0;
  for (const match of String(text).matchAll(pattern)) {
    parts.push(text.slice(offset, match.index));
    let href = match[2] || match[3];
    let suffix = "";
    if (!match[2]) {
      while (
        /[.,;:!?]$/.test(href) ||
        (href.endsWith(")") && (href.match(/\)/g) || []).length > (href.match(/\(/g) || []).length)
      ) {
        suffix = href.slice(-1) + suffix;
        href = href.slice(0, -1);
      }
    }
    let safeUrl = null;
    try {
      const url = new URL(href);
      if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) safeUrl = url.href;
    } catch {
      /* Keep malformed links as plain text. */
    }
    if (safeUrl)
      parts.push(
        <a key={match.index} href={safeUrl} target="_blank" rel="noopener noreferrer">
          {match[1] || href}
        </a>,
        suffix,
      );
    else parts.push(match[0]);
    offset = match.index + match[0].length;
  }
  parts.push(text.slice(offset));
  return <p>{parts}</p>;
}
