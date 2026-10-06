# Transcribe adapt → polish verification — October 1, 2026

The reported touch-scroll conflict is fixed. This pass also addressed the related height-budget failures and two interaction/label defects found during the broader checks. No remaining confirmed failure was found in the completed workflow matrix below. This is local verification, not a promise that every browser, device or audio workload is defect-free.

## Changes

- The marker ruler permits vertical touch panning. Waveform selection and two-finger timeline panning retain their existing gesture policy. Horizontal marker dragging still works; a cancelled vertical marker drag restores the annotations.
- Touch workspaces retain a minimum usable waveform row and can scroll when header, markers, text and signal panes cannot all fit. The row minimum comes from the layout's actual fixed rows, avoiding canvas intrinsic-size feedback.
- Phone/short-touch playback controls stay fixed at the bottom. A ResizeObserver reserves their measured height, including text growth and safe-area padding, instead of assuming a fixed footer budget. Landscape slider columns have pixel minimums that do not double into horizontal overflow when root text increases.
- Opening Controls on a scrolling mobile workspace brings the panel into view. Grouped settings retain scrolling and enlarged hit areas.
- Escape dismisses an open help popover first, keeping Controls open. A subsequent Escape can close Controls normally.
- Reset actions can grow horizontally with their text while retaining a 44px minimum target, preventing doubled-text label clipping.

The site's opt-in keyboard focus policy, app shortcuts, compact fine-pointer desktop controls and local audio processing are preserved. No changes were committed or published.

## Completed checks

The reusable Chromium check is `tests/transcribe-responsive-browser.cjs`. It uses real CDP touch-start/move/end events for touch reachability and selection. It does **not** assign scrollTop or use scrollIntoView to make a waveform-reachability assertion pass. Config downloads used for model assertions are followed by dismissing the real notification, so a testing notification does not obscure the touch path.

| Input / text | Viewports | Result |
|---|---|---|
| Touch, normal text | 568×320, 667×375, 844×390, 320×568, 390×844, 900×700, 1024×768 | Pass |
| Touch, doubled root text | 320×568, 390×844, 667×375, 844×390 | Pass |
| Fine pointer, normal text | 1440×900, 844×390 | Pass |

Every Chromium workflow case checks audio decode, marker state, reachable waveform selection, play/pause state, keyboard piano navigation/audition, Controls, light/dark rendering, EQ editing/reset, help popover dismissal, target geometry, EQ/Stems separation, document overflow and invalid-audio recovery. The focused marker extension checks vertical cancellation, horizontal touch dragging and undo. A focused enlarged-text confirmation checks Reset text fits inside its action.

Supplementary WebKit layout/control checks passed at the same sizes. The three cases requiring scrolling used touch-enabled desktop WebKit with wheel input because Playwright's mobile WebKit does not support wheel automation. **Native touch scrolling is verified in Chromium, not WebKit or physical Safari.**

The existing Transcribe Node regression suites and shared keyboard-navigation suite passed. These cover selection direction/release, marker history/ranges/import validation, config validation/round trips, playback event races, piano cleanup, spectrum/chords and stem transport/mixing. Jekyll build and `git diff --check` passed.

The temporary build at `/private/tmp/transcribe-complete-check-site` was served on port 4187 for browser verification, using the current touch-scroll CSS/JS assets. The temporary server was stopped afterward.

## Repeatable check

Build and serve a fresh Jekyll destination, then run:

```sh
TRANSCRIBE_BROWSER_URL=http://127.0.0.1:4187/transcribe/ node tests/transcribe-responsive-browser.cjs
```

The test requires Playwright and a Chromium installation. Set `PLAYWRIGHT_MODULE_PATH` and `PLAYWRIGHT_EXECUTABLE_PATH` when using an existing installation outside the repository. `TRANSCRIBE_BROWSER_OUTPUT` saves screenshots/results to an existing directory. `TRANSCRIBE_BROWSER_CASE` optionally selects one named case for a focused confirmation.

## Remaining limits and known advisories

Physical iPhone/Android touch behavior, native Safari, screen-reader speech, native browser zoom, long recordings, full model inference and audio listening quality remain unverified. Root-font doubling is a text-growth check rather than complete browser zoom coverage.

The prior detector's typography/color advisories, layered CSS and design-documentation drift remain maintenance considerations. They do not constitute newly reproduced user-facing failures in this pass. Large-file decode and stem performance remain profiling gaps, not measured defects. These distinctions prevent treating every advisory or untested workload as another repair requirement.
