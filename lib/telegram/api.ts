const TELEGRAM_API = "https://api.telegram.org";

// ── Raw API calls ────────────────────────────────────────────────────────────

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
      const plain = stripHtml(text);
      await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: plain.slice(0, 4096),
        }),
      });
    }
  }
}

// ── Text helpers ─────────────────────────────────────────────────────────────

const TELEGRAM_MAX_LENGTH = 4000; // Leave buffer below 4096

const LINK_MARKDOWN = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;

/**
 * Strips deep email quote chains (lines starting with >> or more).
 * These are old thread history — not useful content for Telegram.
 * Also strips "On [date] ... wrote:" attribution lines inside quote blocks.
 * Normalises CRLF → LF before processing.
 */
export function stripEmailThreadHistory(text: string): string {
  // Normalise line endings first — email bodies often have CRLF
  const normalised = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const lines = normalised.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trimStart();
    // Drop lines starting with >> or deeper (old quoted history)
    if (/^>{2,}/.test(trimmed)) continue;
    // Drop lines that are purely a `>` with no real content (blank quote lines)
    if (/^>\s*$/.test(trimmed)) continue;
    // Drop "On [date] ... wrote:" attribution lines — they appear at the top of
    // single-level quotes and add no value in Telegram
    if (/^>?\s*On .+wrote:\s*$/.test(trimmed)) continue;
    result.push(line);
  }

  // Collapse runs of 3+ blank lines to 2
  return result.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Sends a long response as multiple Telegram messages.
 * Strips email thread history, converts markdown → HTML, then splits safely.
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

/** Split markdown on blank lines so each chunk converts to valid standalone HTML. */
export function splitMarkdownIntoBlocks(source: string): string[] {
  if (!source) {
    return [];
  }
  const raw = source.split(/\n{2,}/);
  return raw.map((b) => b.trim()).filter(Boolean);
}

/** Pack HTML blocks into messages under maxLen without splitting mid-block. */
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
    if (current) {
      chunks.push(current);
    }
    if (block.length <= maxLen) {
      current = block;
      continue;
    }
    for (const part of splitMessage(block, maxLen)) {
      chunks.push(part);
    }
    current = "";
  }
  if (current) {
    chunks.push(current);
  }
  return chunks;
}

/**
 * Markdown → Telegram HTML (subset).
 *
 * FIX: Replaced the private-use-unicode placeholder approach with a
 * direct line-by-line blockquote pass. The old approach leaked placeholder
 * tokens (rendered as ✅PETLESBQ1 etc.) because inlineMarkdownToTelegramHtml
 * could corrupt the \uE000…\uE001 sentinel characters before they were
 * swapped back. The new approach processes blockquotes in a dedicated pass
 * before any inline transformation runs, so there are no placeholders at all.
 *
 * Telegram HTML allows: b, i, u, s, code, pre, a[href], blockquote, tg-spoiler.
 * Headings (h1–h6) become <b> since Telegram has no heading elements.
 */
export function markdownToTelegramHtml(text: string): string {
  let s = text;

  // ── Pass 1: fenced code blocks (must run before any other rule) ──────────
  // Extract and preserve them so inline rules cannot corrupt their content.
  const codeBlocks: string[] = [];
  s = s.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) => {
    const html = `<pre><code>${escapeHtml(code.trim())}</code></pre>`;
    codeBlocks.push(html);
    // Safe sentinel: a string that no regex in this file will match
    return `\x02CODE_BLOCK_${codeBlocks.length - 1}\x03`;
  });

  // ── Pass 2: blockquotes — line-by-line, no placeholders ──────────────────
  // Collect consecutive single-level `> …` lines into one <blockquote>.
  // Deep quotes (>> etc.) have already been stripped by stripEmailThreadHistory
  // upstream, but we guard here too just in case the function is called directly.
  const lines = s.split("\n");
  const processedLines: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^>\s?/.test(line)) {
      // Collect all consecutive blockquote lines
      const bqLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        // Strip one level of quoting; skip deep-quote guards
        const stripped = lines[i].replace(/^>{1,}\s?/, "").trimEnd();
        // Skip blank and attribution lines even at single level
        if (stripped && !/^On .+wrote:\s*$/.test(stripped)) {
          bqLines.push(stripped);
        }
        i++;
      }
      if (bqLines.length > 0) {
        const inner = inlineMarkdownToTelegramHtml(bqLines.join("\n"));
        processedLines.push(`<blockquote>${inner}</blockquote>`);
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
  s = s.replace(/\x02CODE_BLOCK_(\d+)\x03/g, (_, idx) => {
    return codeBlocks[Number(idx)] ?? "";
  });

  return s;
}

function inlineMarkdownToTelegramHtml(text: string): string {
  let s = text.trim();
  // Headings (# … ####) — Telegram has no h1–h4; use bold
  s = s.replace(/^#{1,6}\s+(.+)$/gm, (_, h) => `<b>${escapeHtml(h.trim())}</b>`);
  // Links [text](url)
  s = s.replace(LINK_MARKDOWN, (_, label, url) => {
    const safe = escapeHtml(String(label));
    const href = String(url).replace(/"/g, "");
    return `<a href="${href}">${safe}</a>`;
  });
  // Inline code (before bold/italic so backticks aren't double-processed)
  s = s.replace(/`([^`]+)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`);
  // Bold
  s = s.replace(/\*\*(.+?)\*\*/g, (_, t) => `<b>${escapeHtml(t)}</b>`);
  s = s.replace(/__(.+?)__/g, (_, t) => `<b>${escapeHtml(t)}</b>`);
  // Italic
  s = s.replace(/\*([^*\n]+)\*/g, (_, t) => `<i>${escapeHtml(t)}</i>`);
  s = s.replace(/_([^_\n]+)_/g, (_, t) => `<i>${escapeHtml(t)}</i>`);
  // Strikethrough
  s = s.replace(/~~(.+?)~~/g, (_, t) => `<s>${escapeHtml(t)}</s>`);
  // Bullet lines
  s = s.replace(/^[-*]\s+(.+)$/gm, (_, t) => `• ${escapeHtml(t)}`);
  // Horizontal rules
  s = s.replace(/^---+$/gm, "──────────");
  return s;
}

/** @deprecated Use markdownToTelegramHtml + splitMarkdownIntoBlocks for new code */
export function markdownToHtml(text: string): string {
  return markdownToTelegramHtml(text);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, "");
}

/**
 * Splits a long message at paragraph or newline boundaries to stay under maxLen.
 */
export function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    let splitAt = remaining.lastIndexOf("\n\n", maxLen);
    if (splitAt < 100) {
      splitAt = remaining.lastIndexOf("\n", maxLen);
    }
    if (splitAt < 100) {
      splitAt = maxLen;
    }
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }
  return chunks;
}