# Transcribe re-audit — October 1, 2026

**Implementation integrity: Pass.** The current app retains a coherent music-by-ear workflow, consistent theme tokens and grouped controls. The four major findings from the earlier audit did not reproduce in the fresh checks below. This is a technical audit of the local working tree, not a certification of the deployed website.

## Executive summary

**16/20 — Good**, up from the earlier 13/20. **One remaining counted finding: 0 P0, 0 P1, 1 P2, 0 P3.** Small settings targets remain; they were outside the requested four-major-issue repair scope.

| Dimension | Before | Now | Evidence / remaining limit |
|---|---:|---:|---|
| Accessibility | 2 | 3 | Keyboard piano, focus and enlarged text pass; small targets remain. Full screen-reader testing is outstanding. |
| Performance | 3 | 3 | Worker analysis and bounded rendering remain; large-file and stem-inference performance are unmeasured. |
| Responsive design | 1 | 3 | Landscape transport and scrolling settings pass; dense settings targets remain. |
| Theming | 4 | 4 | Loaded-audio controls and canvases render coherently in light and dark. |
| Implementation integrity | 3 | 3 | Product-specific controls and scoped fixes; layered CSS and stale design documentation remain maintenance concerns. |
| **Total** | **13/20** | **16/20** | **Good** |

These scores reflect the sampled implementation, not complete WCAG conformance or performance benchmarks. No app code was changed during this re-audit.

## Fresh verification

Built Jekyll to `/private/tmp/transcribe-reaudit-site` and served that exact directory temporarily at `http://127.0.0.1:4187/transcribe/`. There was no existing preview on the checked ports. The temporary server was stopped after inspection.

Checked Chromium at 1440×900, 900×700, 390×844, 320×568, and 844×390. Phone and landscape checks used touch emulation; 844×390 was also checked with a fine pointer. Repeated 390×844 with the root font doubled. Examined closed Controls, open Controls and its scrolled bottom. Each view exercised keyboard piano selection, upper-bound clamping, Space press/release, and Enter cleanup after moving focus. No uncaught page errors occurred.

A separate loaded-audio check used an eight-second stereo WAV. Decode and play/pause worked, the playback label became Pause during playback, opt-in Tab navigation showed a visible outline, and piano Space did not start the paused recording. Invalid WAV data produced the supported-format recovery message. Both themes were inspected with audio loaded and Controls open.

Not tested: physical devices, Safari/Firefox, screen-reader speech, native browser zoom, full stem inference, long recordings or listening quality. Root-font doubling tests text growth; it does not reproduce every browser's zoom mode.

## Four major findings resolved in checked contexts

1. **Landscape transport:** In touch 844×390, Play ends at y=382, within the 390px viewport; with a fine pointer it ends at y=390. Waveform, piano and transport are visible together. The short-height workspace rule now budgets dynamic viewport height (`assets/css/transcribe.css:2587`). [Landscape capture](/private/tmp/transcribe-reaudit-844-390-touch-1-closed.png).
2. **Short portrait Controls overlap:** At 320×568, Controls has approximately 221px of visible content space and approximately 559px of scrollable content. EQ ends before Stems begins; scrolling reaches cut fields, band values, Stems and Clear saved data. [Scrolled short-phone capture](/private/tmp/transcribe-reaudit-320-568-touch-1-bottom.png).
3. **Enlarged text:** At 390×844 with doubled root text, Sound and Analysis reflow vertically, settings scroll, and EQ ends at approximately y=1326 while Stems begins at y=1334 in content coordinates. The visible transport remains within the viewport. Font-relative container rules own this reflow (`assets/css/transcribe.css:3868`). [Enlarged settings capture](/private/tmp/transcribe-reaudit-390-844-touch-2-bottom.png).
4. **Keyboard piano:** The accessibility tree exposes the piano as a slider with an instruction description. Right arrow changes C4 to C♯4; Home/End and octave movement have defined bounds. Space/Enter create an audition voice, release stops it, and focus loss cleans it up. The selected note scrolls into view, and piano keys do not trigger transport playback (`assets/js/transcribe.js:2235`, `transcribe.html:232`).

## Remaining finding

### [P2] Dense settings targets remain small

- **Category:** Responsive design / accessibility.
- **Location:** `assets/css/transcribe.css:3035` (20px Reset/info controls), `assets/css/transcribe.css:3735` (EQ field height), and transport slider rules around line 2688.
- **Evidence:** Current source retains 20px info controls and EQ fields with a normal-text floor of 20px. The fresh loaded-audio screenshots show closely packed EQ numeric fields and small secondary actions. Enlarged text increases field height, but ordinary phone settings remain dense.
- **Impact:** Accurately tapping adjacent EQ values and secondary actions requires precision. Keyboard users have working alternatives, and scrolling now makes the fields reachable.
- **Standard:** WCAG 2.5.5's enhanced benchmark is 44×44px. WCAG 2.5.8's 24px minimum includes spacing and other exceptions; these dimensions alone do not justify a blanket AA-failure claim.
- **Recommendation:** Increase coarse-pointer hit areas for numeric fields, Reset and info controls, with enough spacing to avoid overlap. Preserve the compact visual structure and verify that scrolling still reaches all settings.
- **Suggested command:** `$impeccable adapt`, followed by `$impeccable polish`.

## Detector and implementation patterns

One fresh detector pass returned **75 advisory findings: 73 font-size warnings and 2 color warnings**. This is the same finding distribution as the earlier audit. These are token/documentation discrepancies, not 75 confirmed UI defects. Many font-size entries are older overridden rules or intentional operational sizes. The two color advisories concern translucent gray and white EQ text; neither alone demonstrates a contrast failure.

The shared theme mapping and refresh observer remain in place. Fresh light/dark loaded-audio captures show consistent DOM controls and canvas rendering. [Light](/private/tmp/transcribe-reaudit-light-loaded.png) · [Dark](/private/tmp/transcribe-reaudit-dark-loaded.png).

The CSS still contains many layers of layout overrides. That makes further responsive changes harder to reason about, but no additional major rendering failure was observed in this pass. DESIGN.md's always-dark workbench description differs from the functioning light/dark implementation, and the previously reported design sidecar is stale. Documentation reconciliation belongs to a separate requested `$impeccable document` pass.

Performance inspection found worker analysis, transferable audio samples, a device-pixel-ratio cap, stale-work guards, deduplicated session saves and playback-driven animation. Full-recording decode and channel mixing remain a large-file profiling gap, not a reproduced defect. No measured large-file or stem-processing performance claim is made.

## Positive findings and next steps

The fixes preserve local processing, native labeled fields, saved control state, opt-in focus treatment and normal application shortcuts. Playback/error feedback remains functional. The piano now has keyboard access with cleanup, and constrained settings remain reachable through scrolling.

1. **[P2] `$impeccable adapt`** — Improve the remaining small settings hit areas if desired.
2. **`$impeccable polish`** — Confirm spacing and scroll reachability after that change.

You can ask me to run these individually or together. A later `$impeccable audit` can reassess any further changes.
