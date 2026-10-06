# Transcribe audit after landscape adaptation — October 1, 2026

**Implementation integrity: Pass.** The current workbench remains coherent and specific to music transcription by ear. Local audio processing, grouped settings, theme tokens and opt-in keyboard focus are preserved. The original 844×390 waveform collapse is resolved, but the new overflow fallback conflicts with the canvases' touch gesture policy.

**15/20 — Good. One verified finding: 0 P0, 1 P1, 0 P2, 0 P3.** The score stays at 15 because narrower landscape and enlarged-text states still make the waveform difficult to reach with touch.

| Dimension | Score | Evidence / limitation |
|---|---:|---|
| Accessibility | 3 | Labeled native controls, keyboard piano and opt-in visible focus work. Full screen-reader testing remains outstanding. |
| Performance | 3 | Worker analysis, transferable samples and bounded canvas resolution remain. Long recordings and stem inference are unprofiled. |
| Responsive design | 2 | Main landscape geometry is repaired; the scroll fallback blocks touch access in tighter contexts. |
| Theming | 4 | Fresh loaded-audio light/dark captures show coherent controls and canvases. |
| Implementation integrity | 3 | Product-specific controls remain coherent; layered CSS and existing documentation drift remain maintenance concerns. |
| **Total** | **15/20** | **Good** |

These are sampled implementation scores, not complete accessibility conformance or performance certification. No app code was changed during this audit.

## [P1] Timeline scroll fallback cannot be reached by a touch swipe

- **Category:** Responsive design / accessibility of the interaction path.
- **Location:** `assets/css/transcribe.css:3883` adds vertical overflow to the timeline. Its interactive surfaces retain `touch-action: none` at `assets/css/transcribe.css:497` and `assets/css/transcribe.css:1612`.
- **Reproduction:** Load audio and add a measure marker at **568×320 with touch input**, or at **390×844 with doubled root text**. Swipe upward over the marker ruler to reveal the main waveform.
- **Evidence:** At 568×320, the timeline has an 89px client height and 132px scroll height. The waveform has a 44px box but is almost entirely outside the clipped viewport. At doubled text, the timeline has a 176px client height and 236px scroll height, also clipping the waveform. Chromium CDP touch-start/move/end gestures over the ruler left `scrollTop` at **0 → 0** in both cases. All three timeline canvases report computed `touch-action: none`, which suppresses native vertical panning.
- **Impact:** A touch user cannot use the intended scrolling fallback to reveal and select the clipped waveform. Playback and the overview remain available. Programmatic scrolling or a pointer can expose the waveform, but those do not establish a usable touch path.
- **Testing correction:** The prior fix verification used Playwright `scrollIntoViewIfNeeded()` before waveform selection. Selection then worked, but that bypassed the gesture conflict. This fresh audit distinguishes element height, programmatic reachability and touch reachability.
- **Standard:** A reproduced touch interaction failure. No specific WCAG violation is asserted from this emulated gesture alone.
- **Recommendation:** Ensure tight layouts either keep the waveform visibly usable or provide an explicit touch scrolling path. If vertical panning is enabled on signal surfaces, distinguish it from horizontal selection/marker gestures so scrolling does not create an unintended highlight or move a marker. Verify actual touch events before any programmatic scroll at both affected sizes.
- **Suggested command:** `$impeccable adapt`, followed by `$impeccable polish`.
- **Captures:** [568×320 marked](/private/tmp/transcribe-post-landscape-audit-568-320-true-1-marked.png) · [Doubled text, marked](/private/tmp/transcribe-post-landscape-audit-390-844-true-2-marked.png).

## Confirmed improvements

The original **844×390** failure no longer reproduces. The waveform is approximately **102px high before markers and 58px after a marker**, with the transport ending exactly at y=390. At **667×375**, it is approximately **90px before markers and 46px after**, with the transport ending at y=375. Selection works in these visible waveform regions. [844×390 capture](/private/tmp/transcribe-post-landscape-audit-844-390-true-1-marked.png).

The earlier settings-target P2 remains resolved in the sampled touch contexts. No enabled controls in the scoped settings/volume/zoom check measured below 44px in either dimension. This includes the enabled Stems action after making a selection. EQ and Stems do not overlap, and bottom settings remain reachable. Compact fine-pointer controls are preserved.

## Fresh verification

Built Jekyll to `/private/tmp/transcribe-post-landscape-audit-site` and served that exact directory temporarily at `http://127.0.0.1:4187/transcribe/`. Fresh browser navigation loaded the current `20261001-touch-landscape` stylesheet. The temporary server was stopped afterward.

The batched Chromium checks covered touch at 844×390, 667×375, 568×320, 320×568, 390×844 and 900×700; fine pointer at 1440×900 and 844×390; and doubled root text at 390×844. Each covered empty, loaded and marked states, playback, waveform selection after any required programmatic scroll, keyboard piano, open Controls and bottom settings. Document width matched viewport width in the measured cases. The additional touch-gesture check specifically tested the overflow fallback without programmatic scrolling first.

An eight-second synthetic stereo WAV decoded and played. Play changed to Pause. Home then Right on the piano produced MIDI value 25; Space audition left the recording paused. Opt-in keyboard navigation displayed a visible outline. Invalid WAV bytes produced the supported-format recovery message. Fresh light/dark loaded-audio captures showed coherent controls and canvas styling. No uncaught page errors occurred. `git diff --check` passed.

Not tested: physical devices, Safari/Firefox, screen-reader speech, native browser zoom, long audio, complete stem inference or listening quality. Root-font doubling is a text-growth check, not a complete browser zoom simulation. CDP touch input is stronger evidence than programmatic scrolling but does not replace physical-device testing.

## Detector and systemic patterns

One fresh detector pass produced **75 advisory findings: 73 font-size and 2 color warnings**. These remain design-token/documentation discrepancies rather than 75 verified UI failures. Many font-size warnings identify overridden legacy rules or intentionally compact operational sizes. Translucent gray and white EQ text advisories do not independently demonstrate a contrast failure. Fresh theme captures did not reproduce a new theme defect.

The layered CSS remains the main maintenance pattern: fixing geometry with overflow requires checking the existing pointer/touch behavior of every surface inside it. Worker analysis, transferred sample buffers, capped device-pixel-ratio rendering and theme refresh remain in the source. Large-file decode/channel mixing is an unmeasured performance gap, not a reproduced performance finding. Existing design documentation drift is not repaired as an audit side effect.

## Positive findings and recommended actions

The compact landscape header and horizontal transport restore the original tested orientation. Touch settings preserve enlarged hit areas without overlap. Native controls, local processing, actionable decode-error feedback, theme switching, keyboard piano access and the site's opt-in focus policy remain functional.

1. **[P1] `$impeccable adapt`** — Make the timeline overflow fallback usable with touch at 568×320 and with enlarged text, while preserving selection and marker gestures.
2. **`$impeccable polish`** — Verify touch scrolling and waveform selection together, plus empty/loaded/marked geometry.

You can ask me to run these one at a time, together, or in any order you prefer. A later `$impeccable audit` can reassess the result.
