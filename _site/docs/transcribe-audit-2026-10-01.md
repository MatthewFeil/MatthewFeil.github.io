# Transcribe technical audit — October 1, 2026

Implementation integrity verdict: **Pass for product coherence; responsive and accessibility defects need repair.** The implementation expresses a specific music-by-ear workflow: local audio, waveform selection, playback speed, measure markers, aligned spectrum and playable piano, with grouped Sound, Analysis, EQ and Stems controls. Flat borders, shared theme variables, and persistent control state form a coherent system. The detector did not identify a structural anti-pattern; browser inspection identified layout failures that its token checks do not detect.

## Executive summary

**Audit health: 13/20 — Acceptable, significant work needed.** Five findings: **0 P0, 4 P1, 1 P2, 0 P3**. Prioritize viewport sizing and panel overflow, then keyboard access to the piano and touch hit areas.

| Dimension | Score | Key evidence |
|---|---:|---|
| Accessibility | 2/4 | Piano is pointer-only; enlarged text clips controls. Opt-in navigation and visible focus work. |
| Performance | 3/4 | Worker analysis, transferable samples and bounded device pixel ratio; large-file and stem-processing performance remain unmeasured. |
| Responsive design | 1/4 | Touch landscape loses transport; short portrait Controls overlaps. |
| Theming | 4/4 | Light/dark DOM and canvas appearance update coherently through shared tokens in checked states. |
| Implementation integrity | 3/4 | Coherent workflow; accumulated layout overrides contribute to sizing failures. |
| **Total** | **13/20** | **Acceptable** |

Scores are audit judgments for the sampled implementation, not WCAG certification or a performance benchmark.

## Scope and verification

Audited the current local working tree, including existing uncommitted changes. Built Jekyll into `/private/tmp/transcribe-audit-site` and inspected `/transcribe/` through a temporary local server on port 4187. This report evaluates local source, not the deployed website. No app source was edited, committed or published.

Browser checks used Chromium at 1440×900, 900×700, 390×844, 320×568 and 844×390. A second confirmation pass used touch emulation at 844×390, both themes at 390×844, and doubled root text size. Open and closed Controls states were captured. A generated eight-second stereo WAV exercised decoding, play/pause, waveform interaction and invalid-file recovery. Playback changed its accessible label to Pause; enabling keyboard navigation and pressing Tab produced a visible red focus outline. Invalid audio produced the supported-format error. No uncaught page errors occurred in the first browser pass.

Physical iOS/Android devices, Safari, screen-reader speech, full stem inference, prolonged playback, large recordings, and export/import round trips were not tested. Enlarging the root font is a text-growth stress test; it is not a substitute for every browser's native zoom behavior. Layout screenshots in this report are empty-audio states unless specified.

## Detailed findings

### [P1] Touch landscape places playback controls outside the viewport

- **Category:** Responsive design.
- **Location:** `assets/css/transcribe.css:184`, workspace grid sizing and later mobile overrides; `assets/js/transcribe.js:159`, short touch viewport query.
- **Evidence:** At 844×390 with touch emulation, the waveform spans y=183–605, piano y=907–955, and Play y=1007–1051. The visible page stops at y=390. The screenshot shows setup and part of the waveform, with transport absent. A fine-pointer viewport of the same dimensions also overflows, though by a different amount.
- **Impact:** Phone users who rotate to landscape cannot reach the normal playback controls in the initial workspace. Hidden page overflow compounds the oversized grid.
- **Recommendation:** Give the short touch layout a complete dynamic-viewport height budget. Allow timeline and analysis tracks to shrink with `minmax(0, …)` and keep transport visible. If content cannot fit, provide intentional scrolling that leaves playback reachable.
- **Suggested command:** `$impeccable adapt`.
- **Evidence capture:** [Touch landscape](/private/tmp/transcribe-audit-touch-landscape.png).

### [P1] Controls sections overlap on short portrait screens

- **Category:** Responsive design / implementation integrity.
- **Location:** `assets/css/transcribe.css:3650`, EQ flex/grid sizing; `assets/css/transcribe.css:3658`, controls grid with a shrinking middle track; related overflow rules around line 3470.
- **Evidence:** At 320×568 with Controls open, Stems and its action paint over the EQ graph. Cut inputs remain below Stems; the EQ band fields and saved-data action are clipped or obscured. The same panel fits at 390×844, making this a height-budget failure rather than a general absence of responsive rules.
- **Impact:** Users cannot reliably inspect and edit EQ settings or distinguish the active section on small or shortened phone screens.
- **Recommendation:** Let the Controls content scroll when its natural height exceeds available space. Keep EQ's graph, cut fields and band table in normal content flow so Stems follows their full height. Preserve the two-column Sound/Analysis grouping.
- **Suggested command:** `$impeccable adapt`.
- **Evidence capture:** [320px Controls](/private/tmp/transcribe-audit-320-controls.png).

### [P1] Enlarged text clips labels and overlaps fields

- **Category:** Accessibility / responsive design.
- **Location:** `assets/css/transcribe.css:3596`, fixed control grid rows; `assets/css/transcribe.css:3735`, 20px EQ input heights; navbar and transport sizing rules.
- **Evidence:** At 390×844 with the root font doubled, the identity and speed labels clip, Pitch lock and Stereo text run into their boundaries, Scale/Tolerance labels overlap their fields, and EQ/Stems content overlaps. Several fixed pixel heights remain unchanged while text grows.
- **Impact:** People who enlarge text lose readable labels and usable settings.
- **Standard:** Relates to WCAG 1.4.4 Resize Text. The observed text-growth failure warrants repair; native zoom and assistive-browser verification should follow.
- **Recommendation:** Make control heights accommodate content, permit labels to wrap where needed, and provide panel scrolling. Keep the compact default appearance while supporting enlarged text.
- **Suggested command:** `$impeccable adapt`.
- **Evidence capture:** [Doubled text](/private/tmp/transcribe-audit-text200.png).

### [P1] Playable piano has no keyboard equivalent

- **Category:** Accessibility.
- **Location:** `transcribe.html:232`; `assets/js/transcribe.js:2231`.
- **Evidence:** The piano canvas has an accessible label but no tabindex or semantic note controls. Its note-playing handlers use pointerdown and pointer release events. No keyboard handler starts piano notes. Spectrum arrow-key inspection exists separately and does not play the corresponding note. The browser confirmed the piano's tabindex attribute is absent.
- **Impact:** Users who enable the site's keyboard-navigation mode can operate other controls but cannot audition piano notes with the keyboard.
- **Standard:** WCAG 2.1.1 Keyboard. This concerns missing functionality after opting in; the site's intentional default navigation mode is respected.
- **Recommendation:** Add a keyboard-operable piano interaction, such as a focusable note selector with arrows to select and Space/Enter to audition, or semantic note buttons. Announce the selected note and preserve release/blur cleanup. Scope visible focus to the existing opt-in mode.
- **Suggested command:** `$impeccable harden`.

### [P2] Settings hit areas are consistently small

- **Category:** Responsive design / accessibility.
- **Location:** `assets/css/transcribe.css:3034`, Reset and info controls; `assets/css/transcribe.css:3735`, EQ fields; `assets/css/transcribe.css:2688`, transport sliders.
- **Evidence:** At 390×844, measured Reset targets are 38×20px, info targets 20×20px, EQ fields 20px high, Scale/Tolerance selects about 19.3px high, and pitch sliders about 19.4px high. Some settings are closely packed. Main phone transport buttons and speed buttons have larger hit areas.
- **Impact:** Small settings are harder to tap accurately, especially when entering adjacent EQ values or using info/reset controls.
- **Standard:** 44×44px is the enhanced target-size benchmark (WCAG 2.5.5). WCAG 2.5.8's 24px minimum has spacing and other exceptions; small dimensions alone do not establish a blanket AA violation.
- **Recommendation:** Increase touch hit areas with padding or dedicated coarse-pointer rules while preserving compact visible controls. Check spacing and overlap after enlargement, especially within the two-column settings layout.
- **Suggested command:** `$impeccable adapt`.

## Detector findings and false-positive handling

Ran Impeccable detect once on `transcribe.html`, `assets/css/transcribe.css` and `assets/js/transcribe.js`. It returned **75 advisory findings: 73 font-size entries and 2 color entries**, with no additional finding types.

These are not 75 user-facing defects. Many typography entries belong to older overridden rules or intentional operational sizing. The color advisories concern a translucent gray at CSS line 2230 and white EQ text at line 2862; neither establishes a contrast failure by itself. Current representative foregrounds were #0a0a0a / #626262 in light mode and #f6f6f6 / #a7a7a7 in dark mode. Sampled normal and muted labels remained legible in both themes. Disabled-control contrast is not scored as a normal-text failure.

DESIGN.md describes an always-dark workbench, while the implementation exposes functioning light and dark themes. Treat the actual implementation as the audit target and reconcile the documentation separately. The context loader also reported that `.impeccable/design.json` is older than DESIGN.md; its token warnings need that qualification. Refreshing the sidecar belongs to `$impeccable document`, not an automatic audit repair.

## Patterns and performance observations

The main recurring issue is fitting a dense fixed-height workspace by shrinking grid tracks while their descendants retain minimum heights. Later overrides repeat sizing decisions: Transcribe CSS is approximately 165 KB across over 3,800 lines. This is a maintenance concern and a plausible contributor to inconsistent breakpoint behavior; it is not evidence of a measured frame-rate regression.

Audio loading decodes the full recording, allocates a mono sample array and mixes channels on the main thread before transferring it to the analysis worker (`assets/js/transcribe.js:1642`). Large-recording memory and responsiveness deserve a separate profile. No large-file hang or memory failure was reproduced, so this is a verification gap rather than a counted defect.

Good performance choices include worker analysis, transferable sample buffers, a device-pixel-ratio cap of 2, revision guards against stale audio work, a buffer-size guard for direct stretching, deduplicated session writes, and playback-driven animation. Stem model loading is disclosed and kept behind a user action. No decorative animation or broad `will-change` issue was found in the scoped inspection.

## Positive findings

- Clear local-processing promise and explicit decode failure feedback.
- Native labeled fields, meaningful button names, toggle states and section landmarks.
- Working shared keyboard-navigation include, persistent opt-in state and visible indicators after enabling it.
- Theme variables update both DOM controls and canvas rendering.
- Grouped controls keep related settings together; desktop and normal-height portrait remain compact and coherent.
- Audio playback state reflects the actual media state in the exercised play/pause flow.
- Existing piano pointer-release and focus-loss cleanup prevent stuck notes.

## Recommended actions

1. **[P1/P2] `$impeccable adapt`** — Repair touch landscape, short-height Controls, enlarged-text behavior, then settings hit areas as one scoped responsive pass.
2. **[P1] `$impeccable harden`** — Add keyboard auditioning to the piano in the site's opt-in navigation mode.
3. **`$impeccable polish`** — Final bounded confirmation of the repaired layouts, focus treatment, labels and interaction states.

You can ask me to run these one at a time, all at once, or in any order you prefer. Re-run `$impeccable audit` after fixes to reassess the score.
