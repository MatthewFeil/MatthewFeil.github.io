# Authoring Transcribe guide cursor animations

Use this guide when adding or changing demonstrations at `/transcribe/guide/`.
It records the current approach and the decisions established while refining the
pilot. Read the relevant app handlers before designing a new sequence; the guide
must teach behavior that Transcribe actually supports.

## Organize a section as one walkthrough

The Quick start at `/transcribe/guide/quick-start/` follows a first-time user's
progression: open an MP3, Play/pause, find a passage, loop it, then adjust speed.
The full app guide at `/transcribe/guide/` is a text-first reference organized by
the actual workspace and Controls groups. It keeps every prose section readable
without JavaScript and opens its one inert viewer only from a demonstration link. Keep advanced settings
out of the Quick start. Its Open an MP3 walkthrough is one step: click Open audio
and illustrate the loaded result. Do not create separate animation stops for the
system file chooser or waiting for loading; neither needs a cursor demonstration.

Each demonstration owns **one ordered animation**, not independent movies
for links to individual controls. Its numbered list is the animation's step index.
Mark the current instruction with `aria-current="step"`, an accent title and number.
Connect the numbered bullets with one vertical progress rail. Fill its current
segment from the shared pause-aware clock, accounting for cursor gestures, waits,
and camera durations. Earlier segments stay filled; future segments stay empty.
Use the same geometry on resize and when headers wrap. Do not add status copy such
as Complete, Walkthrough complete, Step 4 of 4, or a duplicate step title below the
mockup. The instruction title itself remains useful. Do not add a second timeline
or a replay link per bullet.

A step button starts at that step and continues through the rest of the same
walkthrough. Reconstruct the correct before-state from the lesson's preceding
steps, without rapidly playing those steps or showing their completed result
before the cursor acts. Pause must also freeze the current instruction. Completion
returns the overlay to Play; replay starts the whole section at its first step.
Include Pause as an instruction only when teaching Pause itself or when stopping
is necessary for the next action. Do not append it as routine chapter cleanup.
In Quick start, Find ends playing, Loop continues playing, and Speed changes
happen during that same running loop. Speed needs no Pause or extra Play click.
Move to the next section only through an explicit section/Next link. When an
automatic step advance puts its instruction outside the reading area, bring that
row below the sticky viewer/header. In Quick Start, ease that movement over
500ms at the shared pace using the demonstration clock; animation speed scales
it, and Pause freezes it at the same frame. Reduced motion moves immediately.
Only follow when the new instruction is outside the reading area. Cancel a
pending follow on section/step navigation, wheel, touch or pointer reading input,
or scrolling keys; playback/settings controls must preserve pause/resume.
Reading scrolls must never seek the animation. Full-reference dialogs continue
scrolling only their own instruction pane.

Use `#section/step` fragments for direct step links. Preserve old control fragments
through the legacy alias map. Ordinary reading scrolls must not change the active
step, camera or lesson. On portrait phones the viewer scrolls with the page and a
current instruction appears immediately below it; the complete step list remains
available for navigation. Automatic step changes do not scroll the reader on phones.

## Start with a lesson and an action sequence

A demonstration should show how to do something and what happens as a result.
Pointing at a control is not enough when a gesture or sequence would explain it
better.

Before implementing a topic, write down:

1. **Starting state:** recording state, visible time range, playhead, selection,
   Repeat, Selection only, playback speed, and any necessary panels.
2. **User actions:** every click, press, drag, and release needed to produce the
   result. Distinguish these from consequences the real app performs automatically.
3. **Visible responses:** the state or drawing that must change after each action.
4. **Camera views:** where the reader needs context, a control close-up, or a view
   of the result. Include every control used by a multi-step sequence.
5. **Ending state:** where the sequence stops and what remains visible for study.

Use the existing topic and illustration machinery. Do not initialize the real
app engine or make the reference accept user input to demonstrate a feature.

### Examples to follow

| Lesson | Sequence and response |
| --- | --- |
| Find a passage | Start without a selection. Approach the overview's visible-range window, press, drag it, then release. Move the window, waveform, and time labels together. Keep the playhead position unchanged and playback stopped. |
| Make a highlight | Start without a selection. Approach the waveform, press, drag, and release. Grow the selection with the cursor. On release, show the Selection only and Repeat states that the real app enables automatically. |
| Repeat a passage | Show the highlighted passage first. Frame Repeat and Play, click Repeat on, then click Play. Pull back to show the playhead wrapping through the selected passage. Leave the loop running unless stopping is itself part of the lesson; a necessary Pause must have a visible click. |
| Play/pause | Click Play before the illustrated playhead moves. Pull back to show the effect. Return to the control and click Pause before showing paused playback. |
| Return to start | Click the control, then pull back so the reader can see the resulting playhead position. |

Do not make playback start just because Repeat was enabled. Do not silently change the app’s playing state when a walkthrough ends. A loop
can remain playing in the frozen final illustration, with the guide control
returning to Play for replay. Demonstrate a Pause click only when stopping is a
necessary action or the lesson is teaching Pause itself.
A genuine automatic app consequence, such as selection playback stopping at its
end when Repeat is off, can happen without an invented click.

## Keep examples appropriate to their instructions section

The lesson's starting scene and ordered actions define its context. Do not give
an individual control a universal selected-passage example.

**Every Quick start Find a passage step must remain selection-free**, including
overview navigation, waveform seeking, Play and Pause. Do not introduce selection
shading, endpoints, Selection only, or Repeat in those examples, even transiently
during camera movement or playback. The overview's visible-range window uses a
neutral outline without a highlighted fill; it represents the span in view.

Loop and Speed can use a selection once the Quick start has introduced it. The
app guide's Timeline section can introduce selection after its navigation steps,
and its Playback section can begin with a clearly stated highlight precondition.
These are different lessons from Find, even when they click the same Play control.

`transcribe-guide-lessons.js` owns each lesson's `start` scene and ordered `steps`.
`beforeStep()` reconstructs state for a review/deep link; `afterStep()` defines the
result of each action. Keep the animated and static paths consistent with these
same transitions. This replaces the earlier per-control `withoutSelection` patch.

## Show the correct starting state immediately

Prepare the before-state as soon as a topic is selected, before any camera
movement. Keep that same state throughout the camera approach and cursor approach.
Only the appropriate cursor action should produce its corresponding response.

Use `beforeStep()` and `prepare()` as the shared source of starting states.
Do not render the completed example while the camera moves and reset it when the
cursor appears. This caused visible flashes of selected passages and enabled
buttons before the demonstrations had performed those actions.

Apply the same discipline to replay, theme/font refreshes, resizing, and direct
fragment navigation. A cancelled sequence must not paint its result into the next
topic. Keep preparation and final-state rendering distinct.

## Cursor appearance and motion

Reuse the current SVG and `.guide-demo-pointer` styling. The intended cursor is a
slim, recognizable desktop arrow with lightly rounded corners and a thin white
border. Keep the arrowhead and stem narrow. Avoid replacing it with a chunky,
heavily rounded, artificially symmetrical, or separately rotated custom shape.

- Move deliberately at a moderate speed, with smooth acceleration and deceleration.
- Shrink the cursor slightly while pressed; retain that size throughout a drag.
  Grow it back on release. The current pressed scale is `0.78`.
- For a click, approach, briefly settle, press, apply the response, and release.
- For a drag, press first, move while held, update the mockup along the path, and
  release at the endpoint. Do not show an already completed selection behind a
  decorative cursor drag.
- Keep successive cursor actions continuous within a view. Hide the cursor during
  a camera reframing and calculate fresh target coordinates afterward.
- Do not add floating text labels, click rings, or explanatory tooltips over the
  reference. Put explanations in the instructions column.

Update `stepDuration()` when adding or retiming an action so the vertical connector
accounts for its gesture, effect preview, waits, and planned camera transitions.
Do not animate the rail independently of the demonstration or let it advance while
paused.

Quick Start includes an Autoplay checkbox and an Animation speed selector below
the animation timeline. Autoplay defaults on and Animation speed defaults to 1×,
which preserves the established pace. These settings last while the page is open
and carry across sections. Turning Autoplay off pauses the current run; later
sections and step jumps show their before-state and wait for Play. Manual Play
runs the remaining sequence. Enabling Autoplay resumes a paused run or starts an
idle section, while still honoring reduced motion. The full-reference dialogs do
not show these settings.

Animation speed is independent of the illustrated audio playback speed. It scales
the shared virtual clock, camera animations and cursor press transition together;
changing it must preserve the current frame, progress and pause state. Supported
rates are 0.5×, 0.75×, 1×, 1.5× and 2×. Validate pause/resume and cancellation after
rate changes, including mid-gesture and during camera movement.

The player applies a shared **1.25× duration multiplier** to cursor gestures,
waits and camera movement. Keep the progress estimate on the same multiplier.
Before acting, hold the first step of a run for **2.25 seconds** and later steps
for about **1.06 seconds**, so the reader can locate and read the instruction.
After each action, hold its result for about **1.63 seconds** before advancing.
Replay and jumping to a step receive the longer first-step reading hold too.
These holds use the pause-aware clock and must cancel on navigation or closing a
dialog. Reduced-motion static examples remain immediate.

Base timing values below are multiplied by the shared pace. They are useful
starting points, not a requirement for every future action: a `650ms` approach, `200ms` settle, `220ms` click press, `350ms`
response hold, `1500ms` selection drag, and `2200ms` overview drag. Tune longer
paths for clarity rather than making them jump or race.

## Frame the action and its effect

Size the full app surface to the reference window before calculating camera poses.
Keep the complete app mounted and move/scale that surface; do not extract controls
or rearrange them to create close-ups.

Use three kinds of view deliberately:

- **Context:** show the relevant initial passage or the result of a tool.
- **Controls:** make the control and every necessary follow-up action readable.
- **Effect:** pull back when a button's consequence occurs elsewhere, such as a
  moving playhead or a repeating selection.

When an adjustment visibly changes another surface, keep that surface in view
**during the action**, not just after it. Timeline zoom must show the waveform
changing throughout the slider drag. Playback, speed, selection/Repeat controls,
return-to-start, panel opening and measure navigation use context framing so the
result is visible alongside the cursor action. Keep cursor targets separate from
camera framing; a button target must not force a close-up. EQ Reset includes its
graph, and section resets include their affected settings. Use the same framing
policy for live gestures, static reduced-motion states and duration estimates.

The current camera interface accepts `context` or a focus object with a control
selector and optional `relatedTargets`; an effect often uses the context view. A demo may use context → controls → context → controls →
context, as Repeat does. Avoid starting with an unnecessary close-up only to pull
back immediately to establish the lesson's initial state.

For nearby controls in the same area or row, use a short pan or small zoom
adjustment. Restore broader context when moving to a distant area or another
panel. Ordinary article scrolling does not select topics or drive the camera.

**Whole-width surfaces need whole-width framing.** For the overview, waveform,
ruler, or spectrum, prefer little or no zoom when a close-up would cut off the
surface. Never shrink the app below its full-window fit. The current camera uses
that fit for targets occupying at least 70% of the app width.

Use `relatedTargets` when a sequence clicks multiple controls. Check that all of
them remain visible on phones as well as desktop. If fitting a group makes its
controls too small, use separate camera views. The first Repeat implementation
kept Play outside the phone close-up; adding the click alone was insufficient.

Do not add Full app, Focus control, Expand, Collapse, or manual camera controls.
The topic and its scripted sequence determine framing. Preserve the app's own
Timeline zoom control; it changes the visible span of audio, not the guide camera.

## Separate app state from instructional highlights

Walkthroughs have **no guide control outline**, including after completion and in
their reduced-motion examples. The numbered instruction identifies the current
action instead of outlining its control.

A real app state needed by the lesson is different: the highlighted passage in
Make a highlight or Repeat is part of the demonstration. Keep it synchronized
with the gesture. Conversely, Find must not carry a passage selection merely
because another lesson or a shared control uses one.

Guide annotations and app selection state are independent of opt-in keyboard
focus indicators.

## One play/pause control in the viewer’s bottom row

Use the icon button in the bottom row beneath the mockup, beside its text-free
timeline indicator. Keep the row outside the inert app and camera so the control
does not cover the app. Separate it with the same 1px `--tr-border` line as the
viewer’s outer border. Both horizontal and instruction timelines share the same
progress values and pause-aware clock. Each timeline segment is a semantic button
with the corresponding instruction as its accessible name. Clicking anywhere in
a segment starts that step from its before-state and continues the walkthrough;
never seek proportionally within the segment. Keep a 44px-tall hit area around
the thin track and preserve opt-in keyboard focus styling. Do not restore the replay
text link in the instructions or add a second playback control for the guide.

| Demonstration state | Icon and action |
| --- | --- |
| Running, including camera movement | Pause; freeze at the current frame. |
| Paused | Play; resume from that frame. |
| Completed | Play; restart from the correct before-state. |
| Reduced-motion static example | Play; explicit activation can start the cursor demonstration. |
| Topic without a demonstration | Hide the guide playback control. |

Pause must freeze the cursor position and pressed appearance, selection growth,
viewport movement, illustrated playback/analysis, waits between steps, and camera
animation. Resume must exclude the paused wall-clock time and must not jump ahead
or restart the sequence.

Use the demonstration's pause-aware clock for gesture frames and waits. Pause the
camera's Web Animations API animation and hold its `currentTime`; freeze active
cursor scale transitions too. Do not implement each step with independent timers
that keep firing while the demonstration is paused.

Use revision/cancellation tokens and check them after awaited work. Changing topics
or replaying must cancel both pending gesture frames and camera movement. Pause
while the document is hidden; do not resume on return if the reader had paused it
manually. Respect reduced motion by showing a static example automatically and
keeping camera transitions immediate.

## Preserve the inert reference and site conventions

The reference is a static copy of the initialized app layout, not an iframe or a
second working app. Its app root stays `inert` and `aria-hidden="true"`; only the
guide's own navigation and playback control are interactive.

Reuse the real app layout and styles, plus the existing illustration pipeline.
The current renderer uses precomputed recording data for consistent waveforms and
analysis. Do not initialize AudioContext, workers, decoding, real playback,
IndexedDB, session restoration, or model downloads to add a cursor demonstration.
Do not introduce new recordings or media assets merely to demonstrate another control.

Draw canvases in the app's untransformed coordinates. Compute cursor targets from
the rendered element bounds relative to the camera, with the existing cursor-tip
offset. Recalculate positions after reframing or resizing; do not hardcode screen
coordinates for a single desktop window.

Keep drawing work scoped to what changes. `createTimelinePainter()` caches static
timeline drawings for selection/playhead updates. `createViewportPainter()` redraws
the overview, waveform, and ruler for panning without treating a pan as a seek.
Use the recording's `audioDuration` rather than duplicating its total duration.

Use existing theme tokens and site control styles. Keep the overlay touch-sized
and give its changing action a useful accessible name. Visible focus treatment is
opt-in under `:root[data-keyboard-navigation="on"]`. Preserve the shared keyboard
navigation include and Option/Alt+Shift+K even though the guide hides the visible
keyboard-navigation toggle. Do not restore the removed pilot footer copy.

## Where to make changes

| File | Responsibility |
| --- | --- |
| `transcribe-guide.html` | App guide instructions grouped by app area. |
| `transcribe-quick-start.html` | First-use progression and basic controls. |
| `_includes/transcribe-guide-viewer.html` | Shared viewer and bordered playback row with text-free timeline. |
| `_includes/transcribe-guide-mockup.html` | Inert app layout reference. |
| `assets/js/transcribe-guide.js` | Lesson selection, active instructions, vertical rail geometry, panels, camera, step URLs, and guide playback UI. |
| `assets/js/transcribe-guide-lessons.js` | Quick start/shared steps, deterministic before/after states, and legacy fragment aliases. |
| `assets/js/transcribe-guide-reference.js` | Full-reference demo scenes, ordered actions, titles and concise instructions. |
| `assets/js/transcribe-guide-demonstration.js` | Continuous lesson execution, cursor gestures, pause clock, cancellation, and reduced-motion examples. |
| `assets/js/transcribe-guide-illustration.js` | Recording data, canvas drawings, and efficient frame painters. |
| `assets/css/transcribe-guide.css` | Viewer layout, camera containment, cursor, outlines, and overlay control styling. |

Keep production Transcribe runtime behavior unchanged when adding guide-only
teaching sequences.

## Validation before delivery

Run checks appropriate to the changed sequence and inspect the rendered result.
A source check or successful Jekyll build alone does not verify an animation.

- Check the complete before → actions → effects → ending sequence. Confirm each
  user-triggered state change follows a visible cursor action on the right control.
- Exercise desktop, 390px and 320px phones, and phone landscape. Check light/dark
  themes, control visibility, cursor alignment, and full-width timeline framing.
- Pause during a press/drag, illustrated playback, and camera movement. Compare the
  held frame, resume, let it complete, and replay.
- Change topics during a pending click, drag, camera move, or playback interval.
  Verify the old sequence cannot update the new example.
- Test direct `#section/step` fragments, legacy aliases, bullet selection, section
  links, and Next links. Verify one active instruction and an aligned progress rail.
- Verify section context across initial, intermediate, final, replay, refresh, and
  reduced-motion states. Find must never draw selection boundaries or shading.
- Confirm walkthroughs have no locator outlines, and keyboard navigation still
  works in both preference modes.

Existing browser checks are starting points for regressions:

| Test | Coverage |
| --- | --- |
| `tests/transcribe-guide-browser.cjs` | Both guide routes, ordered steps, responsive layout, themes, inertness, and keyboard behavior. |
| `tests/transcribe-guide-initial-state.cjs` | Reconstructed step states, legacy links, direct links, and current instructions. |
| `tests/transcribe-guide-sequence.cjs` | One continuous Loop lesson, synchronized instructions, visible Play/Pause clicks, looping, replay, and cancellation. |
| `tests/transcribe-guide-pacing.cjs` | Longer first-step and later reading holds, slower gestures, result holds and paused reading in both guide modes. |
| `tests/transcribe-guide-pause.cjs` | Exact-frame cursor/camera/playback pause, resume, completion, and overlay placement. |
| `tests/transcribe-guide-pan.cjs` | Overview dragging, waveform scrolling, stable playhead, pause/replay, and responsive framing. |
| `tests/transcribe-guide-find-controls.cjs` | The entire Quick start Find sequence remains selection-free. |
| `tests/transcribe-guide-progress.cjs` | Number-to-number rail geometry, live fill, frozen progress during pause, and removal of status/caption clutter. |
| `tests/transcribe-guide-live-speed.cjs` | Speed clicks and effect previews during continuous playback, without Pause/Play transitions. |
| `tests/transcribe-guide-quick-start.cjs` | End-to-end first-use progression, explicit Next navigation, and coherent practice state across chapters. |

These scripts use Playwright. Configure `PLAYWRIGHT_MODULE_PATH` and
`PLAYWRIGHT_EXECUTABLE_PATH` if the local environment needs explicit paths. Most
focused tests accept `TRANSCRIBE_GUIDE_URL` as a full guide URL; the general browser
test uses `TRANSCRIBE_BROWSER_URL` as the Transcribe base URL. Read the test's setup
before running against a different preview.

For local preview work, identify the active server's port and exact destination
first. Rebuild that destination, update relevant versioned asset imports, and
verify the live guide and changed assets match the new build. Do not assume the
server uses `_site`, and do not claim the preview was updated from a build alone.
Report the checks actually run and their limits. Do not commit or publish unless
requested.


## Full reference: optional demonstration dialogs

The full guide keeps the mockup out of the reading layout. Link a control with
`data-guide-demo="lesson/step"` and a matching fragment. Every article demonstration link starts the lesson at its first step, including
links describing a control used later in the sequence. Its href must name that
first step so opening the link in another tab behaves consistently. The
`data-guide-demo` suffix may identify the described control, but must not skip
introductory steps. Numbered instructions, timeline segments, and explicit direct
step URLs can still jump within the lesson. Opening the link reveals the
shared viewer and numbered instructions in a native modal dialog. The same player
handles the cursor, camera, timeline jumping, progress and exact-frame pause as
Quick start. No new app instance or real app runtime is created. The dialog is
closed and no animation runs when the reference first loads without a demo URL.

`transcribe-guide-reference.js` owns reference demo titles, concise instructions,
starting scenes and advanced examples. Build each new scene with `beforeStep()` /
`afterStep()`, including static reduced-motion results. A link into the middle of
a lesson must reconstruct its preconditions; never replay earlier actions quickly.

The reading page scrolls normally and never drives an animation. During a demo,
automatic step changes scroll only the dialog instructions, not the underlying
article. Close, Escape and backdrop dismissal stop pending gestures/camera work,
unlock page scrolling and return focus to the invoking link. Resize/theme refresh
must never start a closed dialog. A direct `#lesson/step` URL opens its demo;
plain section fragments stay text navigation. Preserve old control aliases.

Advanced examples must explain their preconditions. Stems starts with an explicitly
pre-separated illustration and demonstrates the real On/Off switches and Reset;
it must not imitate a fast model download or run separation. EQ updates its band,
curve and number field during the held drag, then demonstrates Reset. Marker
examples start with labeled marks and update the ruler as the marker moves. The
piano example shows press/hold/release but produces no real tone. State clearly
that the illustrations are silent; explanations of sound belong in the prose.

Reference validation includes every demo link, no-JavaScript prose, closed-dialog
inactivity, reduced-motion states, animated advanced gestures, progress/pause,
Escape/backdrop/Close, focus return, direct URLs, and desktop/phone/landscape
framing. `tests/transcribe-guide-reference.cjs` checks the reading/modal surfaces;
`tests/transcribe-guide-reference-animation.cjs` checks animated advanced states,
pause and cancellation; `tests/transcribe-guide-browser.cjs` retains Quick start
coverage.


## Shared guide navigation

Both guide pages use the same sidebar width, outer alignment and guide-page
switcher. Section links live inside `.guide-topic-links` in the native
`.guide-contents` disclosure. The full reference groups them under Workspace,
Playback, Controls, and Reference; Quick start keeps its numbered Steps list.
Select descendant links rather than only direct children so grouped reference
links keep their active state. It stays expanded on desktop and collapses below
1100px, showing the active section in its summary. Selecting a section closes the
compact disclosure before the page or lesson navigates. Contents navigation must
never become a manual camera control or alter a running demonstration on scroll.
`transcribe-guide-contents.js` handles the disclosure and current-section label;
`transcribe-guide-navigation.js` handles the full reference's reading position.
