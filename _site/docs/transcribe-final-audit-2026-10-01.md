# Transcribe audit — October 1, 2026, after full responsive verification

**Implementation integrity: Pass.** The current workbench expresses a coherent music-by-ear workflow: local audio, waveform selection, measure markers, piano audition, grouped settings and direct playback controls. Shared theme tokens and the site's opt-in focus policy are preserved. Detector advisories remain distinct from confirmed interface defects.

**16/20 — Good. No confirmed findings: 0 P0, 0 P1, 0 P2, 0 P3.** The previous touch-scroll P1 no longer reproduces. No additional repair workflow is recommended from this audit.

| Dimension | Score | Evidence / reason full marks are not claimed |
|---|---:|---|
| Accessibility | 3 | Labeled controls, keyboard piano, text growth and sampled text contrast pass. Full screen-reader and standards-conformance coverage is outstanding. |
| Performance | 3 | Worker analysis, transferable samples, bounded canvas resolution and guarded footer-size updates remain. Large recordings and stem inference are unprofiled. |
| Responsive design | 3 | All 13 workflow cases pass, including native touch reachability and doubled text. Compact secondary header actions remain; complete device/zoom coverage and universal 44px enhanced targets are not claimed. |
| Theming | 4 | Light/dark controls and canvases remain coherent, theme refresh is wired, and sampled primary/muted text contrast passes. |
| Implementation integrity | 3 | Coherent product-specific system; layered CSS and existing design-documentation/token drift remain maintenance concerns. |
| **Total** | **16/20** | **Good** |

The scores are coarse technical-quality ratings, not proof of complete WCAG conformance or a guarantee against every possible defect. Limits and advisories are not converted into speculative P0–P3 repair findings. No app code was changed during this audit.

## Fresh browser evidence

Built Jekyll into `/private/tmp/transcribe-final-review-site` and served that exact directory temporarily at `http://127.0.0.1:4187/transcribe/`. Fresh navigation loaded the current touch-scroll CSS and JavaScript. The temporary server was stopped after inspection.

Ran the current `tests/transcribe-responsive-browser.cjs` against that fresh build. **All 13 cases passed**:

| Input / text | Viewports |
|---|---|
| Touch, normal text | 568×320, 667×375, 844×390, 320×568, 390×844, 900×700, 1024×768 |
| Touch, doubled root text | 320×568, 390×844, 667×375, 844×390 |
| Fine pointer, normal text | 1440×900, 844×390 |

Each case loaded an eight-second stereo WAV and exercised markers, waveform selection, play/pause, keyboard piano, Controls, both themes, EQ edit/reset, help popover dismissal, settings geometry, document width and invalid-audio recovery. No uncaught page errors occurred. `git diff --check` passed.

Touch reachability used native Chromium CDP touch-start/move/end events. The test did not assign scrollTop or call scrollIntoView to make waveform reachability pass. It then made a horizontal touch selection on the actually visible waveform and confirmed selection-only playback became active.

The focused marker check also passed: a vertical gesture starting on a marker left annotations unchanged; horizontal touch dragging moved the marker; undo restored it. Home then Right on the piano produced MIDI 25, and piano Space left the recording paused. The Reset-label assertion passes at enlarged text. Help Escape preserves the open Controls panel, allowing the rest of the workflow to complete.

The previously failing 568×320 and doubled-text cases now expose a **44px usable waveform** through the native touch path. At 844×390 with a marker, it remains approximately **58px high**. Playback stays within the viewport, EQ/Stems do not overlap, and enabled settings/volume/zoom targets meet the scoped 44px dimension check.

## Accessibility and theming

Fresh computed-token measurements on the workbench background gave:

| Text role | Light contrast | Dark contrast |
|---|---:|---:|
| Primary text | 18.48:1 | 19.43:1 |
| Muted text | 5.69:1 | 8.73:1 |

These exceed the 4.5:1 normal-text benchmark for the sampled solid-background roles. They are not measurements of every translucent, selected or disabled state.

Focus remained visually off by default in the sampled control. Alt+Shift+K enabled the shared keyboard-navigation preference. Positive focus styling remains scoped to that preference. Piano semantics, bounded navigation and shortcut preservation remain in the source and regression check. Reduced-motion rules retain short state feedback rather than globally eliminating every transition.

Fresh light/dark loaded Controls captures show consistent DOM styling. Canvas colors remain derived from theme state, and the theme observer redraws them. No additional contrast or theme-switching defect was reproduced.

## Detector and implementation patterns

One fresh detector pass returned **75 advisories: 73 font-size and 2 color warnings**, matching the preceding audit distribution. These are not 75 confirmed interface bugs.

Font warnings identify differences from the documented typography ramp, including legacy overridden rules and compact operational sizes. The two color advisories concern translucent gray and white EQ text; neither alone establishes a contrast failure. Measured common text roles pass, and no new visible defect was established from these advisories.

The stylesheet still contains layered responsive overrides, and existing DESIGN.md/sidecar descriptions differ from parts of the current implementation. These are maintenance considerations already disclosed in previous reports. They are not newly counted user-facing findings, and this audit does not repair documentation as a side effect.

Performance source inspection reconfirmed analysis in a Worker, transferred sample buffers, the device-pixel-ratio cap and playback-driven updates. Footer-height observation writes only when its value changes. Full-recording decode/channel mixing and model inference remain profiling gaps; this audit does not claim measured large-file performance.

## Positive findings and remaining limits

The app now has a repeatable browser regression check covering the states that escaped earlier narrow tests. Real touch reachability, selection, marker cancellation and viewport geometry are checked together. Native fields, local processing, enlarged settings targets, recoverable decode errors, theme consistency and opt-in keyboard focus remain intact.

No additional app fix is recommended from the verified findings. Preserve the regression check for subsequent changes.

Physical devices, native Safari, screen-reader speech, native browser zoom, long audio, complete stem inference and listening quality remain unverified. This fresh audit used Chromium; the preceding pass's supplementary WebKit checks are documented in `transcribe-responsive-verification-2026-10-01.md` and were not rerun here. Root-font doubling tests text growth rather than every browser zoom mode. This report evaluates the local working tree, not the deployed website.
