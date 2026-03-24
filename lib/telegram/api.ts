// lib/telegram/utils.ts

const TELEGRAM_API = "https://api.telegram.org";

// ─────────────────────────────────────────────────────────────────────────────
// Raw API calls
// ─────────────────────────────────────────────────────────────────────────────

export async function sendTypingAction(token: string, chatId: number) {
  await fetch(`${TELEGRAM_API}/bot${token}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  });
}

export async function sendMessage(
  token: string,
  chatId: number,
  text: string,
  parseMode: "HTML" | "Markdown" | undefined = "HTML"
) {
  const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode }),
  });

  if (!res.ok && parseMode === "HTML") {
    let description = "";
    try {
      const body = (await res.json()) as { description?: string };
      description = body.description ?? "";
    } catch {
      /* ignore */
    }
    const looksLikeParseError =
      res.status === 400 &&
      (description.toLowerCase().includes("parse") ||
        description.toLowerCase().includes("entity") ||
        description.toLowerCase().includes("unsupported"));
    if (looksLikeParseError) {
      // Strip all HTML tags and retry as plain text
      await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: stripHtml(text).slice(0, 4096),
        }),
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Leave a comfortable buffer below Telegram's hard 4096-char limit. */
const TELEGRAM_MAX_LENGTH = 4000;

// ─────────────────────────────────────────────────────────────────────────────
// High-level message sending
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends a long response as multiple Telegram messages.
 * Strips email thread history, converts markdown → Telegram HTML, then splits.
 */
export async function sendLongMessage(
  token: string,
  chatId: number,
  text: string
) {
  const cleaned = stripEmailThreadHistory(text.trim());
  const blocks = splitMarkdownIntoBlocks(cleaned);
  const htmlBlocks = blocks.map((b) => markdownToTelegramHtml(b));
  const chunks = packHtmlBlocksForTelegram(htmlBlocks, TELEGRAM_MAX_LENGTH);
  for (const chunk of chunks) {
    await sendMessage(token, chatId, chunk, "HTML");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Email thread stripping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strips deep email quote chains (lines starting with >> or more).
 * Also strips "On [date] … wrote:" attribution lines.
 * Normalises CRLF → LF before processing.
 */
export function stripEmailThreadHistory(text: string): string {
  const normalised = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalised.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trimStart();
    if (/^>{2,}/.test(trimmed)) continue;
    if (/^>\s*$/.test(trimmed)) continue;
    if (/^>?\s*On .+wrote:\s*$/.test(trimmed)) continue;
    result.push(line);
  }

  return result.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Splitting helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Split markdown on blank lines so each chunk converts to valid standalone HTML. */
export function splitMarkdownIntoBlocks(source: string): string[] {
  if (!source) return [];
  return source
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
}

/** Pack HTML blocks into Telegram messages under maxLen without splitting mid-block. */
export function packHtmlBlocksForTelegram(
  htmlBlocks: string[],
  maxLen: number
): string[] {
  const sep = "\n\n";
  const chunks: string[] = [];
  let current = "";

  for (const block of htmlBlocks) {
    const piece = current ? `${current}${sep}${block}` : block;
    if (piece.length <= maxLen) {
      current = piece;
      continue;
    }
    if (current) chunks.push(current);
    if (block.length <= maxLen) {
      current = block;
      continue;
    }
    for (const part of splitMessage(block, maxLen)) chunks.push(part);
    current = "";
  }

  if (current) chunks.push(current);
  return chunks;
}

/**
 * Splits a long message at paragraph or newline boundaries to stay under maxLen.
 */
export function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    let splitAt = remaining.lastIndexOf("\n\n", maxLen);
    if (splitAt < 100) splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt < 100) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML escaping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Escape the four characters Telegram's HTML parser requires be escaped in text
 * nodes: &, <, >, and " (for safety in href attribute values).
 *
 * IMPORTANT: This must be called on RAW TEXT before any HTML tags are injected.
 * Never call this on a string that already contains HTML — it will double-escape.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Escape only characters that are unsafe in an HTML href attribute value.
 * Handles URLs that may contain & (query strings) or " characters.
 */
function escapeHtmlAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, "");
}

// ─────────────────────────────────────────────────────────────────────────────
// Core markdown → Telegram HTML converter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a markdown string to Telegram-compatible HTML.
 *
 * Supported Telegram HTML tags used here (confirmed from core.telegram.org/bots/api):
 *   <b>             bold           (**text** or <strong>)
 *   <i>             italic         (*text* or _text_)
 *   <u>             underline      (__text__)
 *   <s>             strikethrough  (~~text~~)
 *   <tg-spoiler>    spoiler        (||text||)
 *   <a href="URL">  inline link    ([text](url))
 *   <code>          inline code    (`code`)
 *   <pre><code class="language-X">  fenced code block  (```lang\n...\n```)
 *   <blockquote>                    block quote        (> text)
 *   <blockquote expandable>         expandable quote   (>>> text)
 *
 * NOT supported by Telegram (never emit these): <h1>-<h6>, <br>, <ul>, <ol>,
 *   <li>, <hr>, <div>, <span> (except tg-spoiler class), <p>, CSS of any kind.
 *
 * ── Architecture note ──────────────────────────────────────────────────────
 * A multi-pass regex approach creates a double-escaping hazard: if pass N
 * injects an HTML tag and pass N+1 calls escapeHtml() on a captured group
 * containing that tag, the angle brackets get escaped into &lt;&gt; and the
 * HTML breaks. The fix: escape ALL raw text FIRST (once, at the start of
 * inlineMarkdownToTelegramHtml), then every subsequent replacement injects
 * HTML without calling escapeHtml again. Fenced code blocks are extracted
 * before this pass and have their content escaped at extraction time.
 */
export function markdownToTelegramHtml(text: string): string {
  let s = text;

  // ── Pass 1: extract fenced code blocks ────────────────────────────────────
  // Must run before any other transformation. Content is escaped at extraction
  // so it survives the later HTML-injection passes unharmed.
  // Also captures the optional language specifier (e.g. ```python).
  const codeBlocks: string[] = [];
  s = s.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const escapedCode = escapeHtml(code.trim());
    const langAttr = lang ? ` class="language-${lang}"` : "";
    const html = `<pre><code${langAttr}>${escapedCode}</code></pre>`;
    codeBlocks.push(html);
    return `\x02CODE_BLOCK_${codeBlocks.length - 1}\x03`;
  });

  // ── Pass 2: blockquotes ───────────────────────────────────────────────────
  // Process line-by-line. `>>>` prefix → <blockquote expandable>; `>` → <blockquote>.
  // Both are supported Telegram HTML entities.
  const lines = s.split("\n");
  const processedLines: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    const isExpandable = /^>>>\s?/.test(line.trimStart());
    const isQuote = /^>\s?/.test(line.trimStart());

    if (isExpandable || isQuote) {
      const prefix = isExpandable ? /^>>>\s?/ : /^>{1}\s?/;
      const tag = isExpandable ? "blockquote expandable" : "blockquote";
      const bqLines: string[] = [];

      while (i < lines.length) {
        const l = lines[i].trimStart();
        const matchesPrefix = isExpandable ? /^>>>\s?/.test(l) : /^>\s?/.test(l) && !/^>>/.test(l);
        if (!matchesPrefix) break;
        const stripped = lines[i].replace(prefix, "").trimEnd();
        if (stripped && !/^On .+wrote:\s*$/.test(stripped)) {
          bqLines.push(stripped);
        }
        i++;
      }

      if (bqLines.length > 0) {
        // Run inline transforms on the blockquote content
        const inner = inlineMarkdownToTelegramHtml(bqLines.join("\n"));
        processedLines.push(`<${tag}>${inner}</${isExpandable ? "blockquote" : "blockquote"}>`);
      }
      continue;
    }

    processedLines.push(line);
    i++;
  }

  s = processedLines.join("\n");

  // ── Pass 3: inline markdown → HTML ───────────────────────────────────────
  s = inlineMarkdownToTelegramHtml(s);

  // ── Pass 4: restore code blocks ──────────────────────────────────────────
  s = s.replace(/\x02CODE_BLOCK_(\d+)\x03/g, (_, idx) => codeBlocks[Number(idx)] ?? "");

  return s;
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline markdown → Telegram HTML
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert inline markdown syntax to Telegram HTML tags.
 *
 * ── Double-escaping fix ─────────────────────────────────────────────────────
 * Step 1: Escape ALL raw HTML characters in the entire string upfront.
 *         This converts any & < > " in the original markdown text to safe
 *         entities before we start injecting real HTML tags.
 * Step 2: Apply each markdown → HTML replacement WITHOUT calling escapeHtml()
 *         on captured groups, because the content is already safely escaped.
 *
 * Exception: inline code backticks. Their content is also already escaped by
 * Step 1, so we just wrap in <code> without additional escaping.
 *
 * Exception: fenced code blocks (```...```) — extracted before this function
 * runs and have their content escaped at extraction time. Their sentinels
 * (\x02CODE_BLOCK_N\x03) contain no & < > characters, so they survive Step 1.
 */
function inlineMarkdownToTelegramHtml(text: string): string {
  // ── Step 1: escape all raw text upfront (THE critical fix) ───────────────
  // After this, all & < > " in the original text are safe entities.
  // Everything we produce below is deliberate HTML, not user content.
  let s = escapeHtml(text);

  // Undo escaping of our code-block sentinels (they contain no unsafe chars,
  // but escapeHtml is paranoid and we want them intact for Pass 4).
  // Sentinels are \x02CODE_BLOCK_N\x03 — none of these chars are & < > "
  // so they pass through escapeHtml unchanged. No undo needed.

  // ── Headings → <b> ───────────────────────────────────────────────────────
  // Telegram has no heading elements; bold is the correct semantic substitute.
  // Content is already escaped from Step 1 — do NOT escape again.
  s = s.replace(/^#{1,6}\s+(.+)$/gm, (_, h) => `<b>${h.trim()}</b>`);

  // ── Links [text](url) ─────────────────────────────────────────────────────
  // After Step 1 escaping:
  //   - label is already HTML-safe (< > & " are escaped)
  //   - URL may have & → &amp; from Step 1, which is correct for href values
  //   - We additionally escapeHtmlAttr on the URL to handle any residual " risk
  //     (Step 1 already did this, but being explicit is safe and has no cost)
  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    (_, label, url) => `<a href="${escapeHtmlAttr(url)}">${label}</a>`
  );

  // ── Inline code `text` ───────────────────────────────────────────────────
  // Content is already escaped — just wrap. Process before bold/italic so
  // backtick content isn't further mangled by those passes.
  s = s.replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`);

  // ── Spoiler ||text|| ─────────────────────────────────────────────────────
  // <tg-spoiler> is a fully supported Telegram HTML entity.
  s = s.replace(/\|\|(.+?)\|\|/gs, (_, t) => `<tg-spoiler>${t}</tg-spoiler>`);

  // ── Bold **text** ────────────────────────────────────────────────────────
  // Content already escaped — no escapeHtml call here.
  s = s.replace(/\*\*(.+?)\*\*/gs, (_, t) => `<b>${t}</b>`);

  // ── Underline __text__ ───────────────────────────────────────────────────
  // <u> is a valid Telegram HTML tag. Using __ for underline since ** handles bold.
  s = s.replace(/__(.+?)__/gs, (_, t) => `<u>${t}</u>`);

  // ── Italic *text* and _text_ ─────────────────────────────────────────────
  // Single * and _ → italic. Use non-greedy, avoid crossing newlines.
  s = s.replace(/\*([^*\n]+)\*/g, (_, t) => `<i>${t}</i>`);
  s = s.replace(/_([^_\n]+)_/g, (_, t) => `<i>${t}</i>`);

  // ── Strikethrough ~~text~~ ───────────────────────────────────────────────
  s = s.replace(/~~(.+?)~~/gs, (_, t) => `<s>${t}</s>`);

  // ── Bullet list items - text / * text ────────────────────────────────────
  // Telegram has no <ul>/<li> — render as Unicode bullet.
  // Content is already escaped from Step 1; do NOT call escapeHtml(t) here.
  s = s.replace(/^[-*]\s+(.+)$/gm, (_, t) => `• ${t}`);

  // ── Horizontal rules ─────────────────────────────────────────────────────
  // Telegram has no <hr>; use a Unicode line.
  s = s.replace(/^---+$/gm, "──────────");

  return s;
}

/** @deprecated Use markdownToTelegramHtml for all new code. */
export function markdownToHtml(text: string): string {
  return markdownToTelegramHtml(text);
}