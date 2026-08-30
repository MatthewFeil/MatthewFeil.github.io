---
target: homepage project index
total_score: 21
max_score: 24
na_heuristics: 5,7,9,10
p0_count: 0
p1_count: 0
timestamp: 2026-08-29T03-07-26Z
slug: layouts-home-html
---
⚠️ DEGRADED: single-context (the isolated evidence agent could not access terminal or browser tools; its required scan and overlay pass was completed directly after the independent design review).

# Homepage Project Index Critique

## Design Health

| # | Heuristic | Score | Key Issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 4 | Hover/focus states and link behavior are clear. |
| 2 | Match System / Real World | 4 | The featured-work then secondary-project structure fits a personal project site. |
| 3 | User Control and Freedom | 3 | All destinations are direct, though there is no broader projects destination from this small index. |
| 4 | Consistency and Standards | 4 | Square rules, rare red accents, and the Archivo Black/Familjen hierarchy match the documented system. |
| 5 | Error Prevention | n/a | Direct navigation component. |
| 6 | Recognition Rather Than Recall | 3 | Project names are clear, but My Playlists is the least explicit destination. |
| 7 | Flexibility and Efficiency | n/a | Secondary navigation on a Persuade surface. |
| 8 | Aesthetic and Minimalist Design | 4 | The index is compact, legible, and correctly subordinate to the featured work. |
| 9 | Error Recovery | n/a | Direct navigation component. |
| 10 | Help and Documentation | n/a | Help is not expected for this component. |
| **Total** | | **21/24** | **Strong** |

## Design Specificity Verdict

The project index feels authored for this site: Chicago 'L' Live Art remains expressive while three supporting destinations form a calm, functional stack. The reading order is feature, section heading, then links.

The static detector found 0 findings for `_layouts/home.html`, but ran in regex fallback mode. The injected browser overlay was available in the fresh `[Human]` tab. Its only type warning in this area targeted the separate Featured project utility label, not the index. At 320px, the index is 288px wide with no overflow, its heading is 16px, and all three link rows are 52px high.

## What's Working

- More to explore is a real heading and clearly hands off from the featured project.
- Each route has one left-aligned text anchor; removing category labels reduced noise.
- Mobile retains the same information order with no horizontal overflow and adequate touch targets.

## Priority Issues

### [P2] No defined expansion path

The three-link stack is appropriate now, but more items would turn the hero into a directory. Cap it at three supporting links and use a distinct projects destination or intentional rotation once the portfolio grows. Suggested command: `/impeccable shape`.

### [P3] My Playlists is ambiguous

The calculator titles predict their outcome, but My Playlists could mean several things. Rename it only if the destination has a more factual specific title; do not restore generic category labels. Suggested command: `/impeccable clarify`.

### [P3] Featured project utility label is undersized

The overlay flagged Featured project at narrow widths. This does not affect the index but weakens the feature's support cue. Raise `.home-project-label` modestly at narrow widths or reduce tracking. Suggested command: `/impeccable typeset`.

## Persona Red Flags

- A first-time visitor can scan the index, but cannot fully predict My Playlists.
- A returning visitor has no all-projects route when the curated stack outgrows three items.
- A mobile visitor has adequate current tap targets; unusually long future names could make the stack taller.

## Minor Observations

- Page-level overlay warnings for display line-height and overflow do not reproduce in the measured project-index mobile layout.
- One-pixel dividers are sufficient; do not add cards or ornament.
- The More projects and tools aria label is still valid, though the stack includes a playlist destination.

## Questions to Consider

Is the stack a curated right-now selection or a gateway to a fuller projects archive? What does the playlists page specifically represent to a first-time visitor?
