# Transcribe audit after touch-target changes — October 1, 2026

**Implementation integrity: Pass.** Transcribe retains a coherent music-by-ear workflow, shared theme tokens, local audio processing and grouped settings. The requested small-settings-target fix passes, but the enlarged footer exposes a short-landscape layout regression. This report evaluates the current local working tree; it does not certify the deployed website.

**15/20 — Good. One verified finding: 0 P0, 1 P1, 0 P2, 0 P3.** The previous audit scored 16/20. Better settings hit areas do not offset the loss of the main waveform in the newly checked touch-landscape state.

| Dimension | Score | Evidence / limitation |
|---|---:|---|
| Accessibility | 3 | Native labeled fields, keyboard piano and opt-in visible focus remain functional. Enlarged settings targets pass. Screen-reader speech remains untested. |
| Performance | 3 | Worker analysis, bounded canvas pixel ratio and playback-driven rendering remain. Large-file and stem-inference performance are unmeasured. |
| Responsive design | 2 | Settings scroll and enlarged text pass, but the loaded waveform collapses in short touch landscape. |
| Theming | 4 | Loaded controls and canvases render coherently in light and dark. |
| Implementation integrity | 3 | Product-specific controls remain coherent; layered CSS and existing documentation drift increase maintenance cost. |
| **Total** | **15/20** | **Good** |

Scores describe the sampled implementation, not complete standards conformance. No app code was changed during this audit.

## [P1] Touch-landscape footer leaves no room for the main waveform

- **Category:** Responsive design.
- **Location:** `assets/css/transcribe.css:3928` introduces the three-row touch transport, interacting with the short-height workspace allocation at `assets/css/transcribe.css:2588`.
- **Reproduction:** Chromium touch emulation at **844×390**; load an eight-second stereo WAV, close Controls and add a measure marker with `M`.
- **Measured evidence:** The header ends at y=130.59. The footer occupies approximately 162.98px, starting at y=227.02. The timeline receives only 57.84px, while its overview and marker ruler require 52px + 44px. The main waveform canvas measures **844×0px** at y=226.59. The marker ruler extends past the timeline into the piano region. A matching fine-pointer landscape check retains a 46.39px waveform because its footer occupies only 45px.
- **Visual evidence:** [Loaded touch-landscape capture](/private/tmp/transcribe-final-touch-audio-844-390-markers.png). The overview and piano remain visible, but the main waveform is absent.
- **Impact:** Users cannot drag a selection or inspect the detailed waveform in this orientation. Playback and the overview remain available, so the app is not completely blocked.
- **Standard:** This is a reproduced task-layout failure; no specific WCAG violation is asserted from the geometry alone.
- **Recommendation:** Give short touch landscape its own height budget. Preserve usable waveform and marker space by compacting or rearranging the header/footer, or allowing an intentional scrollable workspace. Keep the newly enlarged settings targets. Verify loaded audio with and without markers at 844×390, plus 320×568 portrait.
- **Suggested command:** `$impeccable adapt`, followed by `$impeccable polish`.

## Previous P2 resolved

Fresh measurements found no enabled settings controls or volume/zoom sliders below 44px in either dimension in the scoped touch-target check. Reset/info actions, EQ numeric fields, pitch fields and the settings close button retain their enlarged hit areas. Desktop with a fine pointer keeps its compact controls.

At 900×700, 390×844, 320×568 and 844×390 with touch emulation, and 390×844 with doubled root text, EQ ends before Stems begins. Scrolling reaches the bottom settings. Editing the high-pass value to 120, resetting it to 20, opening EQ help and closing the popover with Escape all worked. Thus the prior dense-settings P2 is closed in the checked contexts.

## Fresh verification and limits

Built Jekyll into `/private/tmp/transcribe-audit-touch-site` and served that exact directory temporarily on port 4187. Fresh browser navigation used that build. The temporary server was stopped after inspection.

The batched checks covered 1440×900 desktop, 900×700 touch tablet, 390×844 and 320×568 touch portrait, 844×390 touch landscape, and 390×844 with doubled root text. Closed, open and scrolled Controls states were captured. Additional loaded-audio checks covered both pointer types and measure-marker states across desktop, portrait and landscape sizes.

An eight-second generated stereo WAV decoded and played; Play changed to Pause. Opt-in keyboard navigation displayed an outline, and piano Space audition did not start the paused recording. Invalid WAV data produced the supported-format recovery message. Light/dark screenshots with audio loaded and Controls open showed coherent fields and canvas styling. No uncaught page errors occurred. `git diff --check` passed.

Not tested: physical devices, Safari/Firefox, screen-reader speech, native browser zoom, long recordings, full stem inference or listening quality. Doubling root text is a text-growth test, not a substitute for every browser zoom mode. The fresh selection check did not produce a selection-status message, so this pass does not claim selection behavior was verified independently of the geometry finding.

## Detector and systemic patterns

One fresh detector pass returned **75 advisories: 73 font-size and 2 color warnings**. These are not 75 confirmed interface defects. Font-size warnings include older overridden rules and intentionally compact operational typography. The two color warnings identify translucent gray and white EQ text; they do not independently establish contrast failures. No new theme defect was reproduced.

The source still has multiple layers of responsive overrides. The new three-row footer and older proportional workspace allocation demonstrate why viewport checks need to include loaded audio and marker state. Existing DESIGN.md/sidecar drift remains a documentation concern rather than an additional counted user-facing finding. Performance inspection confirmed the analysis worker, device-pixel-ratio cap and theme-refresh observer; no large-file performance claim is made.

## Positive findings and recommended actions

The settings improvement preserves compact desktop controls while making touch editing easier. The app retains native fields, local processing, actionable decode-error feedback, keyboard piano access and the site's opt-in focus preference. Settings remain reachable without EQ/Stems overlap.

1. **[P1] `$impeccable adapt`** — Restore a usable waveform and marker region in short touch landscape while retaining enlarged hit areas.
2. **`$impeccable polish`** — Confirm spacing and timeline/transport geometry in empty, loaded and marked states.

You can ask me to run these one at a time, together, or in any order you prefer. A later `$impeccable audit` can reassess the fixes.
