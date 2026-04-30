# Etles Skill & Wiki Creator
*How Etles creates, improves, and maintains its own knowledge pages and operational skills.*

---

## What This Page Is For

This page teaches Etles how to:
1. **Create a new wiki page** — capturing a new domain of expertise
2. **Create a new skill** — a reusable operational procedure with steps, patterns, and examples
3. **Update an existing page** — when a job reveals something worth adding
4. **Evaluate quality** — knowing when a page is done vs. when it needs more work

Read this page before any task where you're asked to "create a skill", "build a wiki page", "document this workflow", or "teach yourself how to do X."

---

## The Core Loop

```
Clarify intent
    ↓
Research & interview
    ↓
Draft the page / skill
    ↓
Self-test (walk through it on a real task)
    ↓
Refine based on gaps found
    ↓
wikiIngest → live
```

Don't skip steps. A page that hasn't been self-tested will have gaps that only surface on the job.

---

## Step 1 — Clarify Intent

Before writing a single line, answer these four questions:

| Question | Why It Matters |
|---|---|
| What should Etles be able to *do* after reading this page? | Defines scope. Avoid vague goals like "understand SEO". Be specific: "pick keywords for a SaaS product launch using AI-first intent signals." |
| What triggers a read of this page? | List exact phrases, task types, or contexts. This becomes the index entry. |
| What's the expected *output*? | A doc, an ad brief, a code module, a campaign plan — be concrete. |
| What does "good" look like vs. "mediocre"? | State at least one sharp quality criterion. |

If the user asked you to capture something from the current conversation, extract answers from what already happened: tools used, sequence of steps, corrections made, outputs produced. Fill gaps by asking the user directly.

---

## Step 2 — Research & Interview

Before drafting, gather:

- **Examples of great output** in this domain (ask the user, or search)
- **Known failure modes** — what does bad work look like here? Why does it happen?
- **Edge cases** — inputs or scenarios that break the naive approach
- **Dependencies** — tools, APIs, formats, external services this skill relies on
- **What Etles already knows** — run `wikiQuery(action='read', page='...')` on related pages to avoid duplication and find connection points

Only start writing after you can answer: *"If I follow this page exactly, what could still go wrong?"* That answer shapes the warnings and edge-case handling.

---

## Step 3 — Draft the Page

### For a Wiki Page (domain knowledge)

Use this structure:

```markdown
# [Page Title]
*One-line description of what this page covers and when to read it.*

---

## Core Principles
[3–7 foundational truths about this domain that Etles should internalize.
Not generic. Every point should be something that changes how you act.]

---

## Frameworks & Mental Models
[Named frameworks, decision trees, or structured approaches.
Use tables and diagrams where possible.]

---

## Step-by-Step Patterns
[Reusable workflows. Numbered. Specific. Include the exact prompts, 
queries, or moves that work — not just the abstract idea.]

---

## Proven Examples
[Real outputs or templates that hit the quality bar.
At least one concrete example per major pattern.]

---

## Failure Modes & Fixes
[What goes wrong. Why. How to recover or avoid it.]

---

## Quick Reference
[Cheat sheet: the 5–10 things to remember when doing this work fast.]

---
*Page last updated: [date] | Related pages: [page1], [page2]*
```

### For a Skill (operational procedure)

A skill is more procedural than a wiki page. It's a step-by-step operating manual for a specific task type. Use this structure:

```markdown
# [Skill Name]
*Trigger: [exact task types or user phrases that should load this skill]*
*Output: [what this skill produces]*

---

## When to Use This Skill
[Specific conditions. Be explicit about what this skill covers and what it does NOT cover.]

---

## Pre-Flight Checklist
Before starting, confirm:
- [ ] [Input requirement 1]
- [ ] [Input requirement 2]
- [ ] [Dependency / tool available]

---

## Execution Steps

### Step 1 — [Name]
[What to do. What to look for. What decisions to make here.]
**Output of this step:** [concrete artifact or decision]

### Step 2 — [Name]
...

---

## Quality Gates
[How to know each step was done well before moving on.]
| Step | Pass Condition | Fail Signal |
|---|---|---|
| Step 1 | ... | ... |

---

## Templates & Prompts
[Copy-paste ready inputs for tools, APIs, or sub-tasks.]

---

## Edge Cases
[Specific scenarios that need different handling. Be concrete.]

---
*Skill last tested: [date] | Related wiki pages: [page]*
```

---

## Step 4 — Self-Test

Before ingesting, run a mental simulation:

1. **Pick a real task** of the type this page/skill covers
2. **Read only the page** — pretend you have no other context
3. **Execute the task** following only what the page says
4. **Find the gaps**: Where did you have to improvise? Where were instructions ambiguous? Where was a key example missing?
5. **Fill every gap** before ingesting

A page passes self-test when you can complete a representative task from scratch with no improvisation.

---

## Step 5 — Writing Quality Standards

Every line in a wiki page or skill earns its place. Apply these filters:

### Keep it if:
- It changes what Etles would *do* (not just what it knows)
- It encodes a specific pattern, not a general principle
- It includes a real example or template
- It warns against a real failure mode

### Cut it if:
- Any competent AI could have written it without the wiki
- It's a definition, not a pattern
- It's generic advice ("do good research", "write clearly")
- It repeats something already in another page (link instead)

### Density target:
A good wiki page reads like a field manual, not a textbook. Every paragraph should answer: *"What exactly do I do?"*

---

## Step 6 — Ingest

Once the draft passes self-test and quality review:

```
wikiIngest(
  page: '[page-name]',          // matches the index key (lowercase, hyphenated)
  content: '[full markdown]',
  summary: '[one sentence: what this adds or changes]'
)
```

Then update the wiki index entry if:
- This is a new page (add a row to the index table)
- The scope of the page has materially changed

---

## Updating an Existing Page

When a completed job reveals something worth capturing:

1. `wikiQuery(action='read', page='...')` — load the current version
2. Identify exactly what to add: a new pattern, a corrected failure mode, a better example
3. Preserve what works. Don't rewrite sections that are already dense and correct.
4. Add a datestamp comment noting what changed and why
5. `wikiIngest` the updated version

**Rule:** Only update when you have concrete new evidence. Don't speculate about improvements. Wait until a job proves something.

---

## Index Entry Format

When adding a new page to the wiki index, the entry should follow this pattern:

```markdown
| **page-name** | [One tight sentence: what task it enables + what it covers] |
```

The description should answer: *"If I have a task of type X, will reading this page help me do it better?"* If yes, that task type should be in the description.

---

## Quality Benchmark: What a Great Page Looks Like

| Dimension | Weak | Strong |
|---|---|---|
| **Specificity** | "Write good hooks" | "Pattern: open with the reader's worst-case scenario, then name the mechanism that causes it" |
| **Actionability** | "Research your audience" | "Step 1: Pull top 20 Reddit threads on [problem]. Step 2: Extract verbatim complaint phrases. Step 3: Map to awareness level using the Schwartz ladder." |
| **Examples** | None | Full example output included |
| **Failure modes** | Not addressed | Named, explained, and fixed |
| **Length** | Padded with intros | Dense. Every line earns its place. |

---

## Related Pages
- All pages in the wiki index are potential inputs when creating a new page. Check for overlap before drafting.
- When a new skill uses patterns from an existing page, link to it explicitly in the skill's footer.

---
*Page last updated: 2026-04-23 | This page is self-referential — update it when the creation process itself improves.*