# Research

*How to do deep, reliable research fast. Covers search strategy, source evaluation, synthesis, and how to produce intelligence that actually drives decisions.*

---

## The Research Mindset

Research is not searching. Searching is typing queries. Research is:
1. Forming a hypothesis first
2. Actively seeking evidence that **disproves** it (not confirms it)
3. Triangulating across multiple independent sources
4. Synthesizing — not summarizing — into a claim you'll stake your name on

The output of research is a **position**, not a summary. "Here's what I found" is not research. "Here's what's true, here's why, here's the implication" is research.

---

## Search Strategy (Tavily)

**Query construction principles:**

Start broad, then narrow — never start with the specific question:
1. **Context query:** Understand the landscape first — "overview of [topic] landscape 2025"
2. **Specific query:** Drill into the specific claim — "[specific claim] evidence data"
3. **Counter-query:** Actively seek the opposite — "criticism of [topic]" or "why [topic] fails"
4. **Recency query:** Add "2025" or "2026" to ensure freshness on fast-moving topics

**Query patterns by research type:**

| Goal | Query pattern |
|---|---|
| Market sizing | "[market] TAM size 2025 report" |
| Competitor intel | "[competitor] pricing strategy weakness" |
| Trend confirmation | "[trend] adoption rate data 2025" |
| Best practices | "[task] proven methodology results" |
| Person research | "[name] background achievements recent" |
| Technology | "[tech] benchmark comparison limitations" |

**Tavily-specific tips:**
- Use `search_depth="advanced"` for technical or niche topics
- Use `include_domains` to restrict to high-quality sources (e.g., `["nature.com", "hbr.org"]`)
- `max_results=10` for broad exploration, `max_results=3` with `include_answer=true` for quick facts
- For competitive intelligence, search LinkedIn company pages + Crunchbase + G2 reviews

---

## Source Hierarchy (most to least reliable)

1. **Primary data** — surveys you ran, experiments you conducted, raw data
2. **Peer-reviewed research** — academic papers, clinical trials (check sample size, methodology)
3. **Official statistics** — government data, industry association reports
4. **Established journalism** — Reuters, AP, FT, WSJ, The Economist (check date)
5. **Company-produced research** — often good data, always has a bias angle; separate data from conclusions
6. **Expert opinion** — valuable for interpretation, not fact
7. **Blog posts / social** — use only for leads to primary sources; never cite directly

**Red flags:**
- No author named
- No date or outdated (>2 years on fast-moving topics)
- No sources cited within the piece
- Extraordinary claims with no data
- Vendor-produced "research" citing their own product

---

## Triangulation Rule

Never cite a single source for a significant claim. Find 3 independent sources that agree before treating something as established. If you can't find 3, that's the finding — flag the uncertainty explicitly.

"According to [source]" is a red flag in your own output. The goal is "The evidence shows [claim]. [Source A], [Source B], and [Source C] all confirm this independently."

---

## Synthesis vs. Summary

**Summary:** Repeats what sources say. Low value. Anyone can do this.

**Synthesis:** Connects what sources say to answer a question the sources didn't explicitly address. This is the actual research output.

Synthesis process:
1. List every relevant data point across all sources
2. Group into themes
3. Identify the pattern across themes
4. Form a claim that the pattern supports
5. Identify the strongest counter-evidence
6. Write the claim with the counter-evidence acknowledged

---

## Research Report Structure

Every research output should follow this structure:

```
## Bottom Line Up Front (BLUF)
[The answer in 2-3 sentences. If reader stops here, they have what matters.]

## Key Findings
- [Finding 1 with source and confidence level]
- [Finding 2 with source and confidence level]
- [Finding 3 with source and confidence level]

## Evidence
[Expanded support for each finding]

## Counter-Evidence / Caveats
[What argues against the findings; what we don't know]

## Implications / So What
[What should the reader DO with this information]

## Sources
[List with URLs and access dates]
```

---

## Competitive Intelligence Research

The order of sources for competitor research:

1. **Their own words:** Website, job postings (reveals strategy), CEO interviews, investor presentations
2. **Customer reviews:** G2, Trustpilot, Capterra, App Store — the complaints are gold
3. **Press coverage:** Crunchbase, TechCrunch, LinkedIn news
4. **Social listening:** Twitter/X mentions, Reddit threads about the product, Facebook groups
5. **Financial signals:** If public — earnings calls, SEC filings. If private — funding amounts, investor lists

**Job posting intelligence:**
- Hiring 5 enterprise AEs → going upmarket
- 3 new ML engineers → building AI features
- Head of Partnerships → building channel/alliances
- No engineering hires → feature-locked, focused on GTM

**Review mining formula:**
Search `site:g2.com [competitor]` then filter by 3-star reviews. 3-star reviews are the most honest — the reviewer still uses the product but has real frustrations. Extract the top 5 recurring complaint themes. These are the wedges.

---

## Person Research (Background, Outreach)

For researching a specific person before outreach or a call:

1. **LinkedIn:** Current role, career history, education, mutual connections, recent posts (last 30 days)
2. **Google:** `"[full name]" "[company]"` — look for interviews, conference talks, articles they wrote
3. **Twitter/X:** What do they post about? What do they care about? What's their perspective?
4. **Company context:** What's going on at their company right now? (funding, product launches, team changes)
5. **Triggers:** Have they recently been promoted? Changed jobs? Had a company news event?

Use this to write a first line in outreach that references something specific and real. "I saw your talk on [X]" is not enough — "Your point about [specific claim from the talk] is exactly why I'm reaching out" is.

---

## Research Quality Self-Check

Before delivering research:
- [ ] Did I search for evidence that contradicts my finding?
- [ ] Do I have at least 3 independent sources for key claims?
- [ ] Is the most recent source less than 12 months old (for fast-moving topics)?
- [ ] Have I distinguished between data and interpretation?
- [ ] Have I stated my confidence level clearly?
- [ ] Does my output answer the original question, not just describe what I found?
- [ ] Could a decision-maker act on this without talking to me first?

---

*Last updated by Etles: 2026-04-21*
