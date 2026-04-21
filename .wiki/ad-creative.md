# Ad Creative

*How to generate, test, and iterate ad creative that converts. Covers image ads, video ads, hooks, angles, platform specs, and creative testing methodology.*

---

## The Creative Hierarchy

Most ad underperformance is a creative problem, not a targeting problem. Fix in this order:
1. **Hook** (first 3 seconds of video / first glance of image)
2. **Angle** (the lens through which you frame the product)
3. **Format** (UGC, polished, static, carousel, etc.)
4. **Copy** (headline, primary text, CTA)

If ROAS is poor, test new hooks first. Only move down the hierarchy if hooks aren't the issue.

---

## The Hook (3-Second Rule)

**For video:** You have 3 seconds before 60%+ of viewers scroll. The hook is everything.

Hook categories that work:
- **Pattern interrupt** — something visually unexpected in frame 1
- **Bold claim** — "This is why your ads don't work"
- **Direct question** — "Are you still paying for [specific pain]?"
- **Result lead** — Show the outcome first, explain after
- **Controversy** — "Everyone in [industry] is wrong about [thing]"
- **Social proof** — "5,000 [specific people] switched this week"
- **Demonstration** — Show the product working with no preamble

**For image ads:**
- The hero image IS the hook — it must stop the scroll
- High contrast, single focal point, faces outperform products in most categories
- Text overlay on image should be ≤5 words — the headline is in the ad copy field

---

## Ad Angles

An angle is a reason to care — a frame that connects the product to a specific desire, fear, or identity. Test multiple angles before scaling.

**Angle matrix:**
| Angle | Trigger | Example |
|---|---|---|
| Pain relief | Fear of loss | "Tired of losing clients because of slow reports?" |
| Aspiration | Desire for status | "Join the founders who've automated their operations" |
| Curiosity | Information gap | "The reason your cold emails get ignored (it's not what you think)" |
| Social proof | Herd behavior | "How 3,000 agencies cut their workload in half" |
| Mechanism | Novelty | "The AI system that replaces 8 hours of manual work" |
| Objection flip | Counterintuitive | "Why posting less grew our account by 40%" |
| Identity | Belonging | "For founders who build differently" |

Run each angle as a separate ad creative. Don't mix angles in one ad.

---

## Image Ad Generation (Nano Banana / Gemini)

**Prompting principles for ad images:**

Structure every prompt as:
`[Subject] + [Setting/Context] + [Lighting] + [Mood/Emotion] + [Composition] + [Style/Quality]`

**High-converting image ad prompts:**

For product showcase:
```
[Product name] on [surface material], [lighting setup], photorealistic, 
commercial photography style, [mood: aspirational/clean/bold], 
white or [brand color] background, sharp focus, 4K
```

For lifestyle/context:
```
[Target person descriptor] using [product] in [relatable setting], 
natural light, authentic, UGC-style, [emotional state: relieved/confident/excited],
shot on iPhone, candid
```

For before/after:
```
Split composition, left side: [painful state, muted colors, dim lighting], 
right side: [desired outcome, bright, vibrant], clean dividing line, 
professional, 16:9
```

**Aspect ratio by placement:**
- Facebook/Instagram Feed: 1:1 (1080×1080) or 4:5 (1080×1350)
- Stories/Reels: 9:16 (1080×1920)
- Twitter/X: 16:9 (1200×675)
- LinkedIn: 1.91:1 (1200×627)
- Google Display: 300×250, 728×90, 160×600

**Text in image:** Keep under 20% of image area. Platform algorithms penalize heavy text. Put copy in the headline/description fields, not the image.

---

## Video Ad Scripts (Structure)

### 30-second formula (best for most platforms):
- **0-3s:** Hook — visual or verbal pattern interrupt
- **3-8s:** Problem — name the pain specifically
- **8-18s:** Solution/Mechanism — show it working, not explain it
- **18-25s:** Proof — testimonial line, metric, or demo result
- **25-30s:** CTA — one action, specific

### 15-second formula (TikTok, Reels):
- **0-2s:** Hook (start mid-action or with a bold statement)
- **2-8s:** Problem + Solution compressed
- **8-13s:** Proof flash (1-2 seconds each: screenshot, metric, face)
- **13-15s:** CTA

### UGC-style formula:
- Open talking directly to camera, no intro
- Lead with a relatable situation: "So I was dealing with [problem]..."
- Show the product being used naturally
- Give honest-sounding verdict
- End with genuine recommendation

---

## Video Generation (Veo 3.1) Prompts

Structure: `[Camera movement] [Subject] [Action] [Setting] [Lighting] [Mood] [Duration/Style]`

**For product demos:**
```
Slow dolly push into [product] on [surface], soft studio key light at 45°, 
[material reaction: steam rising, liquid pouring, screen illuminating],
photorealistic, 4K, 8 seconds
```

**For social proof ads:**
```
Handheld camera, [person descriptor] looking directly at camera, 
natural window light, genuine expression of [relief/excitement/confidence],
authentic UGC aesthetic, shallow depth of field, 8 seconds
```

**For lifestyle brand:**
```
Orbital 360° around [subject] in [aspirational setting], golden hour backlight,
warm cinematic grade, anamorphic lens flare, [product visible but not hero],
8 seconds, slow motion
```

---

## Creative Testing Methodology

**Phase 1 — Angle testing (week 1-2):**
- Run 4-6 different angles with identical format
- Spend $10-20/day per angle
- Kill anything with CTR <1% on cold traffic after 3 days
- Winner = highest CTR + lowest CPC

**Phase 2 — Hook testing (week 2-3):**
- Take winning angle, test 3-4 different hooks
- Keep format identical
- Kill underperformers at $30 spend

**Phase 3 — Format testing (week 3-4):**
- Take winning angle + hook, test formats (static vs. video vs. carousel)
- Scale the winner

**Phase 4 — Scaling:**
- Duplicate the winner, scale budget 20% per day max
- Create variations on the winner to prevent fatigue
- Refresh creative every 2-3 weeks at scale

**Metrics to watch:**
- Hook Rate (3-second video views / impressions) — want >30%
- Hold Rate (watch through rate) — want >25% for 30s
- CTR (link click / impressions) — baseline varies by platform and objective
- ROAS — what matters most, but diagnose upstream if it's bad

---

## Platform-Specific Rules

**Meta (Facebook/Instagram):**
- Video performs best 15-30s for cold, 60s+ for warm/retargeting
- First frame matters more than any other single decision
- Use captions — 85% watch without sound
- UGC and "lo-fi" outperform polished production for cold traffic in most categories

**TikTok:**
- Native-looking content dramatically outperforms obviously polished ads
- Sound-on is default — audio hook matters as much as visual
- Trending audio increases reach but dates the creative quickly
- 7-15 seconds performs best for discovery

**LinkedIn:**
- Professional context — aspirational and status signals work better than pain
- Document ads (carousel) outperform video for B2B thought leadership
- Lead gen forms reduce friction significantly vs. landing page

**Google Display:**
- Multiple sizes required — create a kit not just one image
- Clear value proposition in the image itself (it may load without the headline)
- Strong contrast and minimal text

---

## Creative Fatigue Signs

Your creative is fatigued when:
- CPM starts rising while CTR falls
- Frequency > 4 on cold audiences
- CPC increasing week-over-week at same budget
- Comment sentiment shifts to "I keep seeing this ad"

Response: fresh hook on the same angle first; if that fails, new angle entirely.

---

*Last updated by Etles: 2026-04-21*
