const MARKDOWN_TYPE = "text/markdown";
const HTML_TYPE = "text/html";

// Accept is deliberately parsed here instead of using a substring check. A
// client can explicitly reject Markdown, prefer HTML with a higher q value, or
// use a case-insensitive wildcard. The site keeps HTML as the server
// preference when the two available representations tie.
function parseAccept(value) {
  if (typeof value !== "string" || !value.trim()) return [];
  return value.split(",").flatMap((item, order) => {
    const parts = item.split(";");
    const media = parts.shift()?.trim().toLowerCase();
    if (!media || !/^(?:[!#$%&'*+.^_`|~0-9a-z-]+|\*)\/(?:[!#$%&'*+.^_`|~0-9a-z-]+|\*)$/.test(media)) {
      return [];
    }
    const [type, subtype] = media.split("/");
    if (type === "*" && subtype !== "*") return [];
    let quality = 1;
    for (const parameter of parts) {
      const separator = parameter.indexOf("=");
      if (separator < 0) continue;
      const name = parameter.slice(0, separator).trim().toLowerCase();
      if (name !== "q") continue;
      let raw = parameter.slice(separator + 1).trim();
      if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) raw = raw.slice(1, -1);
      // RFC 9110 qvalues have at most three decimal places and are bounded
      // between zero and one. Invalid ranges do not opt a client in.
      if (!/^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(raw)) return [];
      quality = Number(raw);
    }
    return [{ type, subtype, quality, specificity: type === "*" ? 0 : subtype === "*" ? 1 : 2, order }];
  });
}

function qualityFor(type, ranges) {
  const [major, minor] = type.split("/");
  const matches = ranges.filter(range =>
    (range.type === "*" || range.type === major) &&
    (range.subtype === "*" || range.subtype === minor),
  );
  if (!matches.length) return undefined;
  const specificity = Math.max(...matches.map(range => range.specificity));
  // A more specific range takes precedence over a wildcard. For duplicate
  // ranges of equal specificity the first one follows the usual Accept order.
  return matches.find(range => range.specificity === specificity).quality;
}

export function prefersMarkdown(accept) {
  const ranges = parseAccept(accept);
  if (!ranges.length) return false;
  const markdown = qualityFor(MARKDOWN_TYPE, ranges);
  if (markdown === undefined || markdown <= 0) return false;
  const html = qualityFor(HTML_TYPE, ranges);
  if (html === undefined || html <= 0) return true;
  return markdown > html;
}

export function appendVaryAccept(headers) {
  const current = headers.get("Vary");
  if (!current) {
    headers.set("Vary", "Accept");
    return;
  }
  const values = current.split(",").map(value => value.trim()).filter(Boolean);
  if (!values.some(value => value.toLowerCase() === "accept")) values.push("Accept");
  headers.set("Vary", values.join(", "));
}
