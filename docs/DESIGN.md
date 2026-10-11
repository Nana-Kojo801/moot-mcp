# Moot design plan

Concept: **a tiny, tactile parliament.** Paperwork and ceremony brought into a living room. The pleasure of a rubber stamp, a gavel, a ballot slip. The Chamber is a green field with paper on it; nothing floats, glows, or gradients.

## Tokens

```css
--bench: #1E4D3B;   /* the Chamber field */
--paper: #E6EDE8;   /* bills, ballots, the Statute Book: cool green-grey, never cream */
--ink:   #101A16;   /* text on paper */
--chalk: #EAF2EC;   /* text on the green field */
--brass: #C9A227;   /* the only accent: gavel, active nameplate, tap-to-talk ring */
--stamp: #C0262C;   /* stamps, "defeated", nay ink */
```

Derived (not new hues, only tints of the above):

- `--bench-deep`: bench darkened ~20% for the well of the House (the floor in front of the Speaker).
- `--rule`: ink at 18% for hairlines on paper; chalk at 22% for hairlines on the field.
- Member colors are muted mid-tones used only as a 4px stripe on each nameplate, so members are told apart without competing with brass.

Aye ink is `--bench`, nay ink is `--stamp`, abstain is an outlined slip with no ink.

Type, loaded with `next/font`:

| Use | Face | Notes |
|---|---|---|
| Act titles, stamps, the wordmark, nameplates | Zilla Slab 600/700 | Title case for act titles |
| UI, body, buttons | Public Sans 400/600 | Sentence case everywhere |
| Act numbers, the clock, tallies | Spline Sans Mono 500 | "Act 3", "Fri 5:00 PM", "3 / 1 / 0" |

Measure capped at 66ch. Base size 17px on phones so the Order Paper reads at arm's length.

## Layout (360px first)

```
┌──────────────────────────────┐
│ Moot      Chamber  Statutes  House │  plain text nav, active = brass underline
│ Fri 5:00 PM · demo controls ▸│  mono clock; demo strip folds open
├──────────────────────────────┤
│        (Sam)   (Jo)          │
│   (Maya)            (Leo)    │  hemicycle: nameplates on a half-ring
│            ▄▄▄               │
│        Speaker's chair       │  brass gavel + this week's Speaker
├──────────────────────────────┤
│ ░ Order paper ░░░░░░░░░░░░░░ │  paper strip, hairline ruled
│ The Movie Night Act          │  slab
│ Whereas the week is long…    │
│ Proposed by Maya · Fri 5 PM  │
│ Ayes 3  Noes 1  Abstain 0    │  plain count, mono
│               [ENACTED]      │  the stamp lands here
├──────────────────────────────┤
│ Maya: I propose movie night… │  transcript (chalk on field)
│ Clerk: Order! Maya has…      │
│                              │
│        ( ◉  Speak )          │  brass ring, 88px, thumb zone
│   Speaking as Maya · Type    │
└──────────────────────────────┘
```

### The hemicycle

- Members sit on a half-ring that opens toward the viewer, like a real chamber seen from the Speaker's gallery. For `n` members (2 to 8), seat `i` sits at angle `180° − (i + 0.5) · 180° / n` on an ellipse whose width follows the container, so 2 members sit wide apart and 8 members pack the ring without overlapping.
- The ring's focal point (bottom center) is the **Speaker's chair**: a small dais drawn in CSS with a brass gavel glyph (inline SVG, not an emoji) and the Speaker's name.
- Each **nameplate** is a paper block: member color stripe on the left, name in slab, "adult"/"child" in small sans. The member you are speaking as has a 2px brass edge and sits 2px higher. No glow.
- Each nameplate has a **ballot box** beside it: a small open-top tray. Votes appear as paper slips dropped in (aye: green ink "AYE", nay: red ink "NAY", abstain: blank outlined slip). A slip falls 10px and settles; that is the only motion here.
- In Demo mode, tapping a nameplate switches who is speaking ("Speak as"). Nameplates are real buttons with visible focus.

### The stamp (the one orchestrated moment)

1. When a bill becomes enacted (from `close_vote` or `give_assent`), the Order Paper gets an **ENACTED** stamp; a defeated bill gets **DEFEATED** in `--stamp`.
2. The stamp is Zilla Slab 700, letter-spaced, inside a double rule border, rotated by a random angle between −9° and +7°.
3. Ink texture: an SVG `feTurbulence` + `feDisplacementMap` filter roughens the edges, and a turbulence mask knocks out ~15% of the ink so it looks pressed, not printed.
4. Motion: starts at scale 1.9 and 0 opacity, drops to scale 1 in 180ms with a hard ease-in (no bounce), then the paper strip nudges down 2px and back (60ms) as if struck.
5. At the moment of impact: a synthesized thump (Web Audio: a 110→45 Hz sine with a 140ms decay plus a 30ms filtered noise burst) and `navigator.vibrate(25)` where supported.
6. `prefers-reduced-motion`: the stamp simply fades in over 200ms; no scale, no paper nudge, no vibration. The sound still plays (it is information, not decoration).

Calling a vote plays a two-knock gavel (short triangle-wave clicks), so the room hears business change.

### The Clerk's voice

`speechSynthesis` with the device's default voice for ordinary replies. When the Clerk reads parliamentary business (calling a vote, a result, an enactment, a reminder), the reply uses a different English voice when the device has more than one, and pitch 0.8 either way.

### Statute Book

A bound register on `--paper`, full width, not cards:

```
Act 3      The Movie Night Act
─────────────────────────────────────
Every Friday at 5 PM · Enacted October 11, 2026
Penalty: whoever skips it picks the snacks next time.
```

Act number in mono, title in slab, one hairline rule, details in small sans. Tapping an act opens its history in place: the bill text, who proposed it, the roll call (each member and their vote), the debate, and Parental Assent if given. "Repealed and expired" is a separate section below with struck-through act numbers.

### Household setup

A plain form on paper: one row per member (name field, adult/child segmented choice, move up/down, remove), "Add member", a Parental Assent switch, and "Save household". First run shows the wordmark, the tagline, and two buttons: **Use the demo household** (primary, one tap) and **Set up my household**.

## Copy

- Ceremonial and short where the House speaks: "The House will come to order." "The ayes have it."
- Plain and specific where something fails: "Microphone access is blocked. Allow it in your browser settings, or type below." No apologies.
- Buttons say exactly what they do, one word per action everywhere: **Speak**, **Send**, **Type**, **Reset demo**, **Save household**.
- The assistant is "the Clerk". No brand names.

## Review against the brief (and what changed)

| Rule | First draft | Revision |
|---|---|---|
| No identical rounded cards with soft grey shadows | Order Paper as a rounded card with a drop shadow | Square-cornered paper strip, hairline ruled background, no shadow; it sits *on* the field |
| No ALL-CAPS eyebrow labels | "ORDER PAPER" small caps label above the bill | "Order paper" in slab italic, sentence case; caps only on the stamps and ballot slips, where they are real objects |
| No near-black with neon accent | Dark mode with a glowing brass button | No dark mode; the bench green is the dark surface, brass is a flat ring with no glow |
| Do not animate everything | Nameplates pulsed while listening | Only the speaking nameplate changes (brass edge); listening state is shown on the Speak button label and a slow ring, disabled under reduced motion |
| No component-library look | Pill-shaped nav tabs | Plain text nav with a brass underline |
| No dashboards | Tally as a bar chart | Plain mono count: "Ayes 3  Noes 1  Abstain 0" |
| No emojis as icons | Gavel and mic emojis | Small inline SVGs drawn for this app |
| Mobile first, 2–8 members | Fixed circle of 4 | Ellipse sized to the container; seat spacing derived from member count |
