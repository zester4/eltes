# Coding Craft

*Principles and patterns for writing TypeScript and AI SDK code that is correct, maintainable, and production-grade. Read before writing any significant code.*

---

## Core Principles

1. **Obvious over clever** — code is read 10x more than written; optimize for the reader
2. **Errors are data** — never swallow them; surface every failure explicitly
3. **Types are documentation** — a well-typed function is self-documenting
4. **Pure > side-effectful** — functions that only transform inputs are infinitely easier to test and reason about
5. **Fail loudly in dev, gracefully in prod** — assert liberally during development; degrade gracefully for users

---

## TypeScript Patterns

### Discriminated unions over booleans

```typescript
// Bad — what does 'true' mean?
type Result = { success: boolean; data?: string; error?: string }

// Good — exhaustive, type-safe
type Result =
  | { ok: true; data: string }
  | { ok: false; error: string }

// Caller forced to handle both cases
if (result.ok) {
  use(result.data)   // typed as string here
} else {
  handle(result.error) // typed as string here
}
```

### Narrow types at boundaries

```typescript
// Parse and validate at the entry point; trust types inside
import { z } from "zod"

const schema = z.object({ userId: z.string().uuid(), task: z.string().min(1) })

export async function handler(raw: unknown) {
  const { userId, task } = schema.parse(raw) // throws if invalid
  // From here, userId and task are string — no more ?. or || ''
  return await runTask(userId, task)
}
```

### Async error handling — Results pattern

```typescript
type Ok<T> = { ok: true; value: T }
type Err<E> = { ok: false; error: E }
type Result<T, E = string> = Ok<T> | Err<E>

async function fetchUser(id: string): Promise<Result<User>> {
  try {
    const user = await db.select().from(users).where(eq(users.id, id))
    if (!user) return { ok: false, error: `User ${id} not found` }
    return { ok: true, value: user }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
```

### Never use `any` — use `unknown` and narrow

```typescript
// Bad
function process(data: any) { return data.field } // runtime error waiting to happen

// Good
function process(data: unknown) {
  if (typeof data !== 'object' || data === null) throw new Error('Expected object')
  if (!('field' in data)) throw new Error('Missing field')
  return (data as { field: unknown }).field
}
```

---

## AI SDK Patterns (Vercel AI SDK)

### streamText with proper error surface

```typescript
const result = streamText({
  model: getLanguageModel(modelId),
  system: prompt,
  messages,
  tools,
  stopWhen: stepCountIs(25),
  onError: (error) => {
    // onError fires for stream errors — log with context
    console.error('[streamText] error', { modelId, error: error.message })
  },
})

// Always use toUIMessageStream for the response
return createUIMessageStreamResponse({
  stream: createUIMessageStream({
    execute: async ({ writer }) => {
      writer.merge(result.toUIMessageStream({ sendReasoning: isReasoning }))
    },
    onError: (error) => {
      // Surface to user; never swallow
      return error instanceof Error ? error.message : 'Stream error'
    }
  })
})
```

### Tool patterns — always return typed results

```typescript
const myTool = tool({
  description: '...',
  inputSchema: z.object({ ... }),
  execute: async (input) => {
    try {
      const result = await doWork(input)
      return { success: true, data: result }
    } catch (error) {
      // Return structured error — never throw inside tool.execute
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
})
```

### generateText — use stepCountIs to prevent infinite loops

```typescript
const { text, toolCalls, steps } = await generateText({
  model: getGoogleModel('gemini-2.5-flash'),
  system: systemPrompt,
  messages,
  tools,
  stopWhen: stepCountIs(15), // always set a ceiling
})
```

---

## Upstash Workflow Patterns

### Never swallow errors inside context.run()

```typescript
// Bad — QStash thinks step succeeded even if work failed
const result = await context.run('do-work', async () => {
  try { return await riskyWork() }
  catch { return null } // ← silent failure
})

// Good — let it throw for retry, or return explicit error object
const result = await context.run('do-work', async () => {
  try {
    return { ok: true, data: await riskyWork() }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
})
if (!result.ok) { /* handle */ }
```

### Step naming — unique, descriptive, kebab-case

```typescript
// Each step name must be unique within the workflow run
await context.run('recall-user-memory', ...)
await context.run('load-composio-tools', ...)
await context.run('generate-agent-response', ...)
await context.run('save-to-database', ...)
await context.run('deliver-to-telegram', ...)
```

### waitForEvent for human-in-the-loop

```typescript
// In the workflow:
const approval = await context.waitForEvent('user-approved-action', {
  timeout: 60 * 60 * 24 // 24 hours
})

// From elsewhere (e.g. Telegram callback, web UI):
await notifyWorkflow('user-approved-action', { approved: true }, workflowRunId)
```

---

## Database Patterns (Drizzle + Postgres)

### Always handle "not found" explicitly

```typescript
const [row] = await db.select().from(table).where(eq(table.id, id)).limit(1)
if (!row) {
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}
```

### Transactions for multi-step mutations

```typescript
await db.transaction(async (tx) => {
  // All or nothing — if anything throws, entire transaction rolls back
  await tx.delete(votes).where(eq(votes.chatId, id))
  await tx.delete(messages).where(eq(messages.chatId, id))
  const [deleted] = await tx.delete(chats).where(eq(chats.id, id)).returning()
  return deleted
})
```

### Use `onConflictDoNothing` for idempotent inserts

```typescript
// Safe to call multiple times — won't throw on duplicate
await db.insert(messages).values(messageRows).onConflictDoNothing()

// Update on conflict
await db.insert(messages).values(rows).onConflictDoUpdate({
  target: messages.id,
  set: { parts: sql`excluded.parts` }
})
```

---

## Error Handling Hierarchy

```
User-facing error (toast/response)
  ↑ caught by
Route handler (try/catch, ChatbotError)
  ↑ thrown by
Service function (specific error types)
  ↑ thrown by
DB / external API calls
```

Every layer adds context. Never let a raw DB error reach the user.

```typescript
// In queries.ts
export async function getUser(email: string) {
  try {
    return await db.select().from(user).where(eq(user.email, email))
  } catch {
    throw new ChatbotError('bad_request:database', 'Failed to get user by email')
  }
}

// In route.ts
try {
  const users = await getUser(email)
  // ...
} catch (error) {
  if (error instanceof ChatbotError) return error.toResponse()
  return new ChatbotError('offline:chat').toResponse()
}
```

---

## Performance Patterns

### Parallel over sequential for independent async work

```typescript
// Bad — sequential, 3x slower
const user = await getUser(id)
const messages = await getMessages(chatId)
const votes = await getVotes(chatId)

// Good — parallel
const [user, messages, votes] = await Promise.all([
  getUser(id),
  getMessages(chatId),
  getVotes(chatId),
])
```

### `after()` for non-blocking post-response work

```typescript
// In a Next.js route — the response goes to the user immediately
// after() runs after the response is sent — don't block the user
return new Response('OK', { status: 200 })

after(async () => {
  await saveSessionTail(userId, messages) // non-critical, async
  await logAnalytics(event) // non-critical
})
```

### Never load more than you need from the DB

```typescript
// Bad — loads entire user object when you need only the id
const user = await db.select().from(users).where(eq(users.email, email))

// Good — select only what you need
const [{ id }] = await db
  .select({ id: users.id })
  .from(users)
  .where(eq(users.email, email))
```

---

## Code Review Checklist

Before submitting or shipping any significant code:
- [ ] Every async function has try/catch or uses the Result pattern
- [ ] No `any` types — use `unknown` and narrow, or create a proper type
- [ ] No `console.log` left in — use structured logging with context
- [ ] Parallel async operations use `Promise.all` not sequential awaits
- [ ] DB queries select only needed columns for hot paths
- [ ] Error messages are specific enough to debug from a log
- [ ] Every tool `execute` returns a result object, never throws
- [ ] Workflow steps have unique names and propagate errors explicitly
- [ ] Environment variables are checked at startup, not at use time

---

*Last updated by Etles: 2026-04-21*
