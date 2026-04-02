/**
 * lib/ai/tools/daytona-browser.ts
 *
 * Comprehensive browser automation tools for Daytona sandboxes.
 * Uses Playwright (DOM-level) + ComputerUse (visual/VNC) in combination.
 *
 * Requires browserSetup to be called once per sandbox before other browser tools.
 */

import { tool } from "ai";
import { Daytona } from "@daytonaio/sdk";
import { z } from "zod";

function getDaytona(): Daytona {
  return new Daytona({
    apiKey: process.env.DAYTONA_API_KEY,
    organizationId: process.env.DAYTONA_ORGANIZATION_ID,
    apiUrl: process.env.DAYTONA_API_URL || "https://app.daytona.io/api",
    target: process.env.DAYTONA_TARGET || "us",
  });
}

async function findUserSandbox(userId: string, sandboxId: string) {
  const daytona = getDaytona();
  const sandbox = await daytona.get(sandboxId);
  if (!sandbox) return null;
  const labels = (sandbox as any).labels as Record<string, string> | undefined;
  if (labels?.etles_user_id && labels.etles_user_id !== userId) return null;
  return sandbox;
}

/** Run a Playwright script inside the sandbox and return its stdout */
async function runPlaywright(sandbox: any, script: string, timeoutSeconds = 30): Promise<{ ok: boolean; output: string }> {
  const res = await sandbox.process.executeCommand(
    `node -e ${JSON.stringify(script)}`,
    undefined,
    { PLAYWRIGHT_BROWSERS_PATH: "/home/daytona/.cache/ms-playwright" },
    timeoutSeconds
  );
  return { ok: res.exitCode === 0, output: res.result ?? "" };
}

// ─────────────────────────────────────────────────────────────────────────────
// SETUP
// ─────────────────────────────────────────────────────────────────────────────

/**
 * browserSetup — Install Playwright + Chromium in the sandbox (run once).
 * Also starts the VNC desktop for visual/screenshot operations.
 */
export const browserSetup = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Install Playwright and Chromium browser inside a sandbox, and start the VNC desktop environment. " +
      "Must be called ONCE before any other browser tool in this sandbox. Takes ~60 seconds.",
    inputSchema: z.object({
      sandboxId: z.string(),
    }),
    execute: async ({ sandboxId }) => {
      try {
        const sandbox = await findUserSandbox(userId, sandboxId);
        if (!sandbox) return { success: false, error: `Sandbox ${sandboxId} not found.` };

        // Install Playwright + Chromium
        const install = await sandbox.process.executeCommand(
          "npm install -g playwright && npx playwright install chromium --with-deps",
          undefined, undefined, 180
        );
        if (install.exitCode !== 0) {
          return { success: false, error: `Playwright install failed: ${install.result}` };
        }

        // Start VNC desktop for visual/screenshot operations
        try {
          await sandbox.computerUse.start();
        } catch (_) {
          // Non-fatal — visual ops won't work but DOM ops will
        }

        return { success: true, message: "Browser ready. Playwright + Chromium installed, VNC desktop started." };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

// ─────────────────────────────────────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * browserNavigate — Open a URL and return the page title + content snapshot.
 */
export const browserNavigate = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Navigate to a URL in the sandbox browser. Returns the page title, URL, and a text snapshot of visible content. " +
      "Use as the first step before any extraction or interaction on a page.",
    inputSchema: z.object({
      sandboxId: z.string(),
      url: z.string().describe("Full URL to navigate to. E.g. 'https://example.com'"),
      waitForSelector: z.string().optional().describe("CSS selector to wait for before returning. E.g. '#main-content'"),
      sessionId: z.string().optional().default("browser-session").describe("Browser session name for persistent state (cookies, login)."),
    }),
    execute: async ({ sandboxId, url, waitForSelector, sessionId }) => {
      try {
        const sandbox = await findUserSandbox(userId, sandboxId);
        if (!sandbox) return { success: false, error: `Sandbox ${sandboxId} not found.` };

        const script = `
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState: '/tmp/${sessionId}-state.json' }).catch(() => browser.newContext());
  const page = await ctx.newPage();
  await page.goto(${JSON.stringify(url)}, { waitUntil: 'domcontentloaded', timeout: 30000 });
  ${waitForSelector ? `await page.waitForSelector(${JSON.stringify(waitForSelector)}, { timeout: 10000 }).catch(() => {});` : ""}
  const title = await page.title();
  const finalUrl = page.url();
  const text = await page.evaluate(() => document.body?.innerText?.slice(0, 8000) ?? '');
  await ctx.storageState({ path: '/tmp/${sessionId}-state.json' }).catch(() => {});
  await browser.close();
  console.log(JSON.stringify({ title, url: finalUrl, text }));
})();`;

        const { ok, output } = await runPlaywright(sandbox, script, 35);
        if (!ok) return { success: false, error: output };

        const result = JSON.parse(output.trim().split("\n").pop()!);
        return { success: true, ...result };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

// ─────────────────────────────────────────────────────────────────────────────
// INTERACTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * browserInteract — Click, type, hover, select, check, or submit elements by selector.
 */
export const browserInteract = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Interact with page elements: click buttons/links, type into inputs, fill forms, select dropdowns, " +
      "check checkboxes, hover, submit forms, or press keyboard keys. " +
      "Requires a CSS selector or element text to target the element.",
    inputSchema: z.object({
      sandboxId: z.string(),
      url: z.string().optional().describe("Navigate to this URL first (if not already on the right page)."),
      sessionId: z.string().optional().default("browser-session"),
      actions: z.array(z.object({
        type: z.enum([
          "click",          // click an element
          "dblclick",       // double click
          "rightclick",     // right-click (context menu)
          "type",           // type text into focused/selected input
          "fill",           // clear + fill an input
          "hover",          // hover over element
          "select",         // select dropdown option by value or label
          "check",          // check a checkbox
          "uncheck",        // uncheck a checkbox
          "press",          // press keyboard key e.g. 'Enter', 'Tab', 'Escape'
          "submit",         // submit a form
          "focus",          // focus an element
          "clear",          // clear an input
          "scroll",         // scroll to element or by pixels
          "wait",           // wait for selector to appear
        ]),
        selector: z.string().optional().describe("CSS selector. E.g. '#submit-btn', 'button:has-text(\"Login\")', 'input[name=email]'"),
        text: z.string().optional().describe("Text to type/fill, or option label/value for select, or key name for press."),
        scrollX: z.number().optional().describe("Horizontal scroll amount in pixels (for scroll action)."),
        scrollY: z.number().optional().describe("Vertical scroll amount in pixels (for scroll action). Use negative to scroll up."),
      })).describe("Ordered list of actions to perform on the page."),
    }),
    execute: async ({ sandboxId, url, sessionId, actions }) => {
      try {
        const sandbox = await findUserSandbox(userId, sandboxId);
        if (!sandbox) return { success: false, error: `Sandbox ${sandboxId} not found.` };

        // Build action steps
        const steps = actions.map((a, i) => {
          const sel = a.selector ? `page.locator(${JSON.stringify(a.selector)})` : null;
          switch (a.type) {
            case "click":      return sel ? `await ${sel}.click();` : "";
            case "dblclick":   return sel ? `await ${sel}.dblclick();` : "";
            case "rightclick": return sel ? `await ${sel}.click({ button: 'right' });` : "";
            case "hover":      return sel ? `await ${sel}.hover();` : "";
            case "focus":      return sel ? `await ${sel}.focus();` : "";
            case "clear":      return sel ? `await ${sel}.clear();` : "";
            case "check":      return sel ? `await ${sel}.check();` : "";
            case "uncheck":    return sel ? `await ${sel}.uncheck();` : "";
            case "submit":     return sel ? `await ${sel}.evaluate(el => el.closest('form')?.submit());` : "";
            case "type":       return `await page.keyboard.type(${JSON.stringify(a.text ?? "")});`;
            case "fill":       return sel ? `await ${sel}.fill(${JSON.stringify(a.text ?? "")});` : "";
            case "press":      return `await page.keyboard.press(${JSON.stringify(a.text ?? "Enter")});`;
            case "select":     return sel ? `await ${sel}.selectOption(${JSON.stringify(a.text ?? "")});` : "";
            case "scroll":
              return a.selector
                ? `await ${sel}.scrollIntoViewIfNeeded();`
                : `await page.evaluate(([x, y]) => window.scrollBy(x, y), [${a.scrollX ?? 0}, ${a.scrollY ?? 300}]);`;
            case "wait":       return sel ? `await ${sel}.waitFor({ timeout: 8000 });` : "";
            default:           return "";
          }
        }).filter(Boolean).join("\n  ");

        const script = `
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState: '/tmp/${sessionId}-state.json' }).catch(() => browser.newContext());
  const page = await ctx.newPage();
  ${url ? `await page.goto(${JSON.stringify(url)}, { waitUntil: 'domcontentloaded', timeout: 30000 });` : ""}
  ${steps}
  const title = await page.title();
  const finalUrl = page.url();
  const text = await page.evaluate(() => document.body?.innerText?.slice(0, 4000) ?? '');
  await ctx.storageState({ path: '/tmp/${sessionId}-state.json' }).catch(() => {});
  await browser.close();
  console.log(JSON.stringify({ title, url: finalUrl, text, actionsCompleted: ${actions.length} }));
})();`;

        const { ok, output } = await runPlaywright(sandbox, script, 45);
        if (!ok) return { success: false, error: output };

        const result = JSON.parse(output.trim().split("\n").pop()!);
        return { success: true, ...result };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

// ─────────────────────────────────────────────────────────────────────────────
// EXTRACTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * browserExtract — Extract structured data from the current page.
 */
export const browserExtract = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Extract structured data from a webpage: text, links, tables, form fields, metadata, " +
      "product info, search results, contact details, prices, or any list of items. " +
      "Supports paginated crawling by returning a nextPageSelector.",
    inputSchema: z.object({
      sandboxId: z.string(),
      url: z.string().describe("URL to extract from."),
      sessionId: z.string().optional().default("browser-session"),
      extract: z.object({
        text: z.boolean().optional().describe("Extract all visible text."),
        links: z.boolean().optional().describe("Extract all hyperlinks with text and href."),
        tables: z.boolean().optional().describe("Extract all tables as arrays of row objects."),
        metadata: z.boolean().optional().describe("Extract page metadata (title, description, og tags)."),
        forms: z.boolean().optional().describe("Extract all form fields and their attributes."),
        images: z.boolean().optional().describe("Extract all image src + alt text."),
        customSelector: z.string().optional().describe(
          "CSS selector: extract innerText of every matching element. E.g. '.product-card', 'article h2'"
        ),
        customAttribute: z.string().optional().describe(
          "Attribute to extract from customSelector matches. E.g. 'href', 'data-price'"
        ),
      }),
      waitForSelector: z.string().optional(),
      nextPageSelector: z.string().optional().describe(
        "CSS selector of the 'next page' button to click and return next page URL. For crawling paginated results."
      ),
    }),
    execute: async ({ sandboxId, url, sessionId, extract, waitForSelector, nextPageSelector }) => {
      try {
        const sandbox = await findUserSandbox(userId, sandboxId);
        if (!sandbox) return { success: false, error: `Sandbox ${sandboxId} not found.` };

        const script = `
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState: '/tmp/${sessionId}-state.json' }).catch(() => browser.newContext());
  const page = await ctx.newPage();
  await page.goto(${JSON.stringify(url)}, { waitUntil: 'domcontentloaded', timeout: 30000 });
  ${waitForSelector ? `await page.waitForSelector(${JSON.stringify(waitForSelector)}, { timeout: 10000 }).catch(() => {});` : ""}

  const result = {};

  ${extract.text ? `result.text = await page.evaluate(() => document.body?.innerText?.slice(0, 15000) ?? '');` : ""}

  ${extract.links ? `result.links = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]')).slice(0, 200).map(a => ({
      text: a.innerText.trim().slice(0, 200),
      href: a.href,
    })).filter(l => l.text && l.href)
  );` : ""}

  ${extract.tables ? `result.tables = await page.evaluate(() =>
    Array.from(document.querySelectorAll('table')).slice(0, 10).map(table => {
      const headers = Array.from(table.querySelectorAll('th')).map(th => th.innerText.trim());
      const rows = Array.from(table.querySelectorAll('tr')).slice(1).map(tr =>
        Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim())
      ).filter(r => r.length);
      return { headers, rows };
    })
  );` : ""}

  ${extract.metadata ? `result.metadata = await page.evaluate(() => {
    const get = sel => document.querySelector(sel)?.getAttribute('content') ?? document.querySelector(sel)?.innerText ?? null;
    return {
      title: document.title,
      description: get('meta[name=description]') ?? get('meta[property="og:description"]'),
      ogTitle: get('meta[property="og:title"]'),
      ogImage: get('meta[property="og:image"]'),
      canonical: document.querySelector('link[rel=canonical]')?.href ?? null,
    };
  });` : ""}

  ${extract.forms ? `result.forms = await page.evaluate(() =>
    Array.from(document.querySelectorAll('form')).slice(0, 5).map(form => ({
      action: form.action,
      method: form.method,
      fields: Array.from(form.querySelectorAll('input,select,textarea')).map(el => ({
        tag: el.tagName.toLowerCase(),
        name: el.name,
        type: el.type,
        placeholder: el.placeholder ?? null,
        value: el.value ?? null,
        required: el.required,
      })),
    }))
  );` : ""}

  ${extract.images ? `result.images = await page.evaluate(() =>
    Array.from(document.querySelectorAll('img')).slice(0, 50).map(img => ({
      src: img.src,
      alt: img.alt,
    })).filter(i => i.src)
  );` : ""}

  ${extract.customSelector ? `result.custom = await page.evaluate((sel, attr) =>
    Array.from(document.querySelectorAll(sel)).slice(0, 200).map(el =>
      attr ? (el.getAttribute(attr) ?? null) : el.innerText?.trim()?.slice(0, 500)
    ).filter(Boolean),
    ${JSON.stringify(extract.customSelector)}, ${JSON.stringify(extract.customAttribute ?? null)}
  );` : ""}

  ${nextPageSelector ? `
  try {
    const nextBtn = page.locator(${JSON.stringify(nextPageSelector)});
    await nextBtn.click();
    await page.waitForLoadState('domcontentloaded');
    result.nextPageUrl = page.url();
  } catch (_) { result.nextPageUrl = null; }
  ` : ""}

  result.pageTitle = await page.title();
  result.pageUrl = page.url();
  await ctx.storageState({ path: '/tmp/${sessionId}-state.json' }).catch(() => {});
  await browser.close();
  console.log(JSON.stringify(result));
})();`;

        const { ok, output } = await runPlaywright(sandbox, script, 40);
        if (!ok) return { success: false, error: output };

        const result = JSON.parse(output.trim().split("\n").pop()!);
        return { success: true, ...result };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-TAB RESEARCH
// ─────────────────────────────────────────────────────────────────────────────

/**
 * browserMultiTab — Open multiple URLs simultaneously and extract text from all.
 * Ideal for cross-site research, price comparison, or news aggregation.
 */
export const browserMultiTab = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Open multiple URLs in parallel and extract text content from all of them simultaneously. " +
      "Use for research tasks: compare prices across sites, read multiple news sources, " +
      "gather info from several pages at once. Returns a summary per URL.",
    inputSchema: z.object({
      sandboxId: z.string(),
      urls: z.array(z.string()).min(1).max(10).describe("URLs to open in parallel. Max 10."),
      extractSelector: z.string().optional().describe(
        "CSS selector to extract from each page instead of full text. E.g. 'article', 'main', '.price'"
      ),
    }),
    execute: async ({ sandboxId, urls, extractSelector }) => {
      try {
        const sandbox = await findUserSandbox(userId, sandboxId);
        if (!sandbox) return { success: false, error: `Sandbox ${sandboxId} not found.` };

        const script = `
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const urls = ${JSON.stringify(urls)};
  const sel = ${JSON.stringify(extractSelector ?? null)};

  const results = await Promise.all(urls.map(async (url) => {
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      const title = await page.title();
      const text = sel
        ? await page.evaluate(s => Array.from(document.querySelectorAll(s)).map(el => el.innerText.trim()).join('\\n').slice(0, 4000), sel)
        : await page.evaluate(() => document.body?.innerText?.slice(0, 4000) ?? '');
      await page.close();
      return { url, title, text, error: null };
    } catch (e) {
      return { url, title: null, text: null, error: e.message };
    }
  }));

  await browser.close();
  console.log(JSON.stringify(results));
})();`;

        const { ok, output } = await runPlaywright(sandbox, script, 60);
        if (!ok) return { success: false, error: output };

        const results = JSON.parse(output.trim().split("\n").pop()!);
        return { success: true, pages: results, count: results.length };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

// ─────────────────────────────────────────────────────────────────────────────
// FILE UPLOAD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * browserUploadFile — Upload a file to an input[type=file] element.
 */
export const browserUploadFile = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Upload a file to a file input field on a webpage. " +
      "First write the file to the sandbox using writeFile, then call this with the sandbox file path.",
    inputSchema: z.object({
      sandboxId: z.string(),
      url: z.string().describe("URL of the page with the file upload field."),
      sessionId: z.string().optional().default("browser-session"),
      fileInputSelector: z.string().describe("CSS selector of the file input. E.g. 'input[type=file]'"),
      filePath: z.string().describe("Absolute path of the file inside the sandbox. E.g. '/home/daytona/resume.pdf'"),
    }),
    execute: async ({ sandboxId, url, sessionId, fileInputSelector, filePath }) => {
      try {
        const sandbox = await findUserSandbox(userId, sandboxId);
        if (!sandbox) return { success: false, error: `Sandbox ${sandboxId} not found.` };

        const script = `
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState: '/tmp/${sessionId}-state.json' }).catch(() => browser.newContext());
  const page = await ctx.newPage();
  await page.goto(${JSON.stringify(url)}, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const [fileChooser] = await Promise.all([
    page.waitForFileChooser(),
    page.locator(${JSON.stringify(fileInputSelector)}).click(),
  ]);
  await fileChooser.setFiles(${JSON.stringify(filePath)});
  await ctx.storageState({ path: '/tmp/${sessionId}-state.json' }).catch(() => {});
  await browser.close();
  console.log(JSON.stringify({ success: true, message: 'File uploaded: ${filePath}' }));
})();`;

        const { ok, output } = await runPlaywright(sandbox, script, 30);
        if (!ok) return { success: false, error: output };

        const result = JSON.parse(output.trim().split("\n").pop()!);
        return result;
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

// ─────────────────────────────────────────────────────────────────────────────
// VISUAL / COMPUTER USE (coordinate-based, for sites that resist automation)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * browserScreenshot — Take a screenshot of the sandbox desktop/browser.
 * Returns base64 image. Use to visually verify state or to feed to a vision model.
 */
export const browserScreenshot = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Take a screenshot of the sandbox browser or desktop. Returns a base64-encoded PNG. " +
      "Use to verify visual state, debug, or pass to a vision model for coordinate-based interaction.",
    inputSchema: z.object({
      sandboxId: z.string(),
      region: z.object({
        x: z.number(), y: z.number(),
        width: z.number(), height: z.number(),
      }).optional().describe("Capture only a region instead of the full screen."),
      compressed: z.boolean().optional().default(true),
    }),
    execute: async ({ sandboxId, region, compressed }) => {
      try {
        const sandbox = await findUserSandbox(userId, sandboxId);
        if (!sandbox) return { success: false, error: `Sandbox ${sandboxId} not found.` };

        let screenshotData: any;
        if (region) {
          screenshotData = compressed
            ? await sandbox.computerUse.screenshot.takeCompressedRegion(region)
            : await sandbox.computerUse.screenshot.takeRegion(region);
        } else {
          screenshotData = compressed
            ? await sandbox.computerUse.screenshot.takeCompressed()
            : await sandbox.computerUse.screenshot.takeFullScreen();
        }

        const base64 = Buffer.isBuffer(screenshotData)
          ? screenshotData.toString("base64")
          : screenshotData;

        return {
          success: true,
          image: base64,
          format: "png",
          message: "Screenshot taken. Pass the `image` field to a vision model to interpret coordinates.",
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * browserVisualInteract — Click, type, drag, scroll, or press keys at screen coordinates.
 * Use AFTER taking a screenshot and identifying coordinates via vision.
 */
export const browserVisualInteract = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Interact with the browser using screen coordinates (visual/VNC layer). " +
      "Use when DOM-based interaction fails or for sites that resist automation. " +
      "Requires taking a screenshot first to identify coordinates.",
    inputSchema: z.object({
      sandboxId: z.string(),
      actions: z.array(z.discriminatedUnion("type", [
        z.object({
          type: z.literal("click"),
          x: z.number(), y: z.number(),
          button: z.enum(["left", "right", "middle"]).optional().default("left"),
          double: z.boolean().optional().default(false),
        }),
        z.object({
          type: z.literal("move"),
          x: z.number(), y: z.number(),
        }),
        z.object({
          type: z.literal("drag"),
          startX: z.number(), startY: z.number(),
          endX: z.number(), endY: z.number(),
        }),
        z.object({
          type: z.literal("scroll"),
          x: z.number(), y: z.number(),
          direction: z.enum(["up", "down"]).optional().default("down"),
          amount: z.number().optional().default(3),
        }),
        z.object({
          type: z.literal("type"),
          text: z.string(),
          delay: z.number().optional().describe("Delay between keystrokes in ms."),
        }),
        z.object({
          type: z.literal("press"),
          key: z.string().describe("Key name e.g. 'Return', 'Escape', 'Tab', 'BackSpace'"),
          modifiers: z.array(z.string()).optional(),
        }),
        z.object({
          type: z.literal("hotkey"),
          keys: z.string().describe("Hotkey combo e.g. 'ctrl+c', 'ctrl+v', 'alt+tab'"),
        }),
      ])).describe("Ordered visual actions to perform."),
    }),
    execute: async ({ sandboxId, actions }) => {
      try {
        const sandbox = await findUserSandbox(userId, sandboxId);
        if (!sandbox) return { success: false, error: `Sandbox ${sandboxId} not found.` };

        const results: string[] = [];

        for (const action of actions) {
          switch (action.type) {
            case "click":
              await sandbox.computerUse.mouse.click(action.x, action.y, action.button, action.double);
              results.push(`clicked (${action.x},${action.y})`);
              break;
            case "move":
              await sandbox.computerUse.mouse.move(action.x, action.y);
              results.push(`moved to (${action.x},${action.y})`);
              break;
            case "drag":
              await sandbox.computerUse.mouse.drag(action.startX, action.startY, action.endX, action.endY);
              results.push(`dragged (${action.startX},${action.startY}) → (${action.endX},${action.endY})`);
              break;
            case "scroll":
              await sandbox.computerUse.mouse.scroll(action.x, action.y, action.direction as "up" | "down", action.amount);
              results.push(`scrolled ${action.direction} at (${action.x},${action.y})`);
              break;
            case "type":
              await sandbox.computerUse.keyboard.type(action.text, action.delay);
              results.push(`typed "${action.text.slice(0, 40)}"`);
              break;
            case "press":
              await sandbox.computerUse.keyboard.press(action.key, action.modifiers);
              results.push(`pressed ${action.key}${action.modifiers?.length ? "+" + action.modifiers.join("+") : ""}`);
              break;
            case "hotkey":
              await sandbox.computerUse.keyboard.hotkey(action.keys);
              results.push(`hotkey ${action.keys}`);
              break;
          }
        }

        return { success: true, actionsCompleted: results };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });