# Site and public tool analytics

GA4 measurement ID: `G-DSJ82YWBSZ`.

## Basic site interactions

`window.siteAnalytics.trackSite(event, value, placement)` uses fixed, allowlisted
values and the same consent and page exclusions as tool events. It discards
pre-consent actions. It never reads link text, query strings, or arbitrary URLs.

| Event | Parameters | Meaning |
| --- | --- | --- |
| `navigation_click` | `destination`, `placement` | Header/footer links, homepage project and post links, and My Work cards. |
| `navigation_menu` | `state` | Explicit menu-button use: `open` or `close`. Automatic closing does not count. |
| `theme_change` | `theme` | User selects `system`, `light`, or `dark`. |
| `keyboard_navigation_change` | `state` | User selects `on` or `off`, through the button or keyboard shortcut. |

Destinations are `home`, `about`, `posts`, `playlists`, `work`, `personal_space`,
`privacy`, `transcribe`, `cta_l_live_art`, `grade_calculator`,
`investment_calculator`, or `post`. Placements are `header`, `footer`, `home`,
`work`, or `posts`. The Personal Space entry click can be counted on a public
page; its destination remains excluded. Individual post names are not sent.
Initial/restored settings and cross-tab synchronization do not count as changes.
Existing GA4 page views, scrolling, and outbound clicks are not duplicated.

For Exploration breakdowns, register event-scoped custom dimensions for
`destination`, `placement`, `theme`, and `state` in GA4. This change does not
alter property settings or add detailed tool actions. Existing tool work below
is preserved.

The existing consent controller exposes `window.siteAnalytics.track(event, tool, value)`.
It sends only fixed, allowlisted names after current consent on an eligible page.
It drops pre-consent events rather than replaying them. Browser opt-outs, expired
consent, withdrawal, and `no_analytics` pages block these events. Production builds
load the controller; development builds leave tracking calls inactive.

## Events

| Event | Parameter | Meaning |
| --- | --- | --- |
| `tool_start` | `tool_name` | First tracked use per tool per page visit; automatically precedes other events. |
| `tool_action` | `tool_name`, `action` | Feature adoption, once per feature per page visit. |
| `tool_interaction` | `tool_name`, `action` | Detailed calculator control use, counted each time. |
| `tool_complete` | `tool_name`, `action` | Successful operation, counted each time. |
| `tool_export` | `tool_name`, `format` | Export requested through the browser, counted each time; does not prove the user saved the file. |
| `tool_error` | `tool_name`, `error_code` | Fixed failure category, counted each time; no raw error text. |

## Implemented tool actions

- `transcribe`: `audio_loaded`, `playback_started`, `loop_enabled`,
  `speed_changed`, `pitch_changed`, `config_imported`, `stems_started`.
  Completion: `stems_separated`. Export: `json` (configuration only).
  Errors: `audio_load_failed`, `config_import_failed`, `stems_failed`.
  Automatic session restoration does not count as a user loading audio.
- `investment_calculator`: `stock_view`, `interest_view`, `details_opened`.
  Detailed interactions and outcomes are listed below.
- `interest_calculator`: `details_opened`. Detailed interactions and outcomes
  are listed below.
- `grade_calculator`: adoption actions `rounding_changed`, `scale_saved`,
  `weight_saved`. Detailed interactions and outcomes are listed below.

## Detailed Transcribe events

All events use `tool_name: transcribe` and fixed allowlisted labels. No audio,
filenames, recording fingerprints, marker IDs/labels/positions, detected notes or
chords, numeric settings, or raw validation/backend errors are sent.

| Event | Actions / categories | Trigger |
| --- | --- | --- |
| `tool_complete` | `audio_loaded`, `config_imported` | Successful explicit load, every time; auto-restoration does not count. |
| `tool_interaction` | `playback_started`, `playback_paused` | Explicit transport button or Space shortcut; play counts after playback succeeds. Automatic pauses, loop restarts, loading, and stem transport changes do not count. |
| `tool_interaction` | `return_to_start`, `seek_backward`, `seek_forward`, `seek_committed`, `waveform_seek`, `overview_navigated` | Transport buttons/shortcuts, committed seek slider, waveform click, overview drag release. |
| `tool_interaction` | `preset_speed_changed`, `custom_speed_changed`, `pitch_changed`, `volume_changed`, `channel_changed`, `zoom_changed` | Explicit speed choice or committed setting edit; no keystroke/slider movement events. Keyboard speed/seek/zoom shortcuts also count. |
| `tool_interaction` | `pitch_lock_enabled`, `pitch_lock_disabled`, `loop_enabled`, `loop_disabled`, `selection_only_enabled`, `selection_only_disabled` | Explicit playback toggle. |
| `tool_interaction` | `piano_note_played` | Reference piano voice starts from pointer or keyboard input; note/pitch is not sent. |
| `tool_interaction` | `selection_changed`, `selection_cleared` | Waveform selection release, keyboard endpoint, two-point range, or selection cleared by a waveform click. Canceled drags do not count. |
| `tool_interaction` | `chords_enabled`, `chords_disabled`, `selection_analysis_enabled`, `selection_analysis_disabled`, `spectrum_shown`, `spectrum_hidden` | Explicit analysis toggle. |
| `tool_interaction` | `detection_balanced_selected`, `detection_bass_selected`, `detection_chordal_selected`, `detection_melody_selected`, `detection_range_changed` | Detection selector or valid changed range committed. |
| `tool_interaction` | `eq_changed`, `eq_reset` | EQ numeric edit, graph drag release, graph keyboard edit, or explicit reset. Wheel edits are capped at one event per 300 ms; cut-handle synthetic changes and reset cascades do not generate additional edits. |
| `tool_interaction` | `timeline_view`, `analysis_view`, `controls_opened`, `controls_closed`, `shortcuts_opened`, `shortcuts_closed` | Explicit view changes and sidebar open/close, including shortcuts, Escape, and mobile outside dismissal. |
| `tool_interaction` | `sound_reset`, `analysis_reset`, `stems_reset` | Explicit section reset. Reset cascades do not count as separate setting toggles. |
| `tool_interaction` | `measure_marked`, `section_marked`, `marker_removed`, `marker_moved`, `marker_section_changed`, `measures_deleted`, `markers_undone`, `markers_redone`, `numbering_changed` | Successful marker edit or history operation, including keyboard actions. Existing-marker selection and empty history do not count as edits. |
| `tool_interaction` | `marker_navigated`, `measure_navigated`, `marked_passage_looped` | Successful navigation or marked passage loop. |
| `tool_interaction` | `stems_requested`, `stems_canceled`, `stems_enabled`, `stems_disabled`, `stem_muted`, `stem_unmuted` | Valid stem request, explicit cancellation, or mix toggle. Stem names and audio are not sent. |
| `tool_complete` | `stems_separated`, `saved_data_cleared` | Stem processing finishes or confirmed local-data clearing succeeds. |
| `tool_export` | format `json` | Existing configuration export requested; does not prove the file was saved. |
| `tool_error` | `audio_load_failed`, `config_import_failed`, `stems_failed`, `playback_failed`, `detection_range_invalid`, `saved_data_clear_failed` | Fixed failure category. |

Existing `tool_action` adoption events remain once per feature per visit.
Use `tool_interaction` for repeated control use and `tool_complete` for successful
operations; do not sum adoption and detailed event counts as unique actions.
`tool_start` precedes the first consented event once per page visit. Refusal,
withdrawal, expired consent, browser opt-outs, and page exclusions still block
tracking. Pre-consent interactions are dropped. Initial/default settings,
automatic autosaves and restoration, analysis frames, pointer hover/movement,
media time updates, and layout/theme synchronization do not create detailed
interaction events. The existing `tool_name`, `action`, and `error_code`
event-scoped custom dimensions cover this schema.

## Detailed investment calculator events

Stock controls use `tool_name: investment_calculator`; interest controls use
`tool_name: interest_calculator`, preserving the existing reporting names.
All actions use the existing consent gate and fixed allowlists. No ticker,
amount, date, rate, result, or backend error message is sent.

| Event | Action or error code | Trigger |
| --- | --- | --- |
| `tool_interaction` | `stock_view`, `interest_view` | Explicit switch to a different view; repeated switches count. |
| `tool_interaction` | `amount_changed`, `amount_cleared`, `start_date_changed`, `start_date_cleared`, `end_date_changed`, `end_date_cleared` | Committed edit in either form: native `change`, or masked date blur. |
| `tool_interaction` | `ticker_changed`, `ticker_cleared` | Committed stock ticker edit. |
| `tool_interaction` | `rate_changed`, `rate_cleared` | Committed interest rate edit. |
| `tool_interaction` | `compound_selected`, `simple_selected` | Interest growth selector changed. |
| `tool_interaction` | `calculation_requested` | Valid submission begins, every time. |
| `tool_interaction` | `details_opened`, `details_closed` | Explicit details toggle, every time. |
| `tool_interaction` | `inflation_unavailable` | Historical calculation succeeds without inflation data; future projections do not count as missing data. |
| `tool_complete` | `calculation` | Successful calculation, every time; use this for total completed calculations. |
| `tool_complete` | `compound_historical`, `simple_historical`, `compound_projection`, `simple_projection` | Additional interest outcome breakdown by method and historical/future end date. |
| `tool_error` | `dates_invalid`, `inputs_invalid` | Submit handler rejects semantic date or other input validation. |
| `tool_error` | `amount_invalid`, `ticker_invalid`, `rate_invalid`, `start_date_invalid`, `end_date_invalid`, `method_invalid` | Native form validation rejects a field; several fields can emit errors in one attempt. Only applicable fields are allowlisted per tool. |
| `tool_error` | `calculation_failed` | Calculation or stock data request fails; fixed category only. |

Committed edits count whether filled values are valid or invalid. Masked dates
commit on blur and deduplicate a native change for the same value; a date with
only template characters counts as cleared. Keystrokes,
initial defaults, automatic result rendering, restored views, browser-history
restoration, and clicking the already selected view do not count. Existing
once-per-visit `tool_action` adoption events remain. Use `tool_interaction` for
repeated control use, and filter `tool_complete` to `action: calculation` for
completion totals; adding adoption, interaction, and outcome-breakdown counts
would count some actions more than once. `tool_start` is sent once per tool per
page visit before its first consented event. Pre-consent actions are discarded.
The existing event-scoped `tool_name`, `action`, and `error_code` dimensions
cover these events; no additional custom dimensions are required.

## Detailed finals grade calculator events

All these events use `tool_name: grade_calculator`. They send only fixed action
or error names, never grades, scores, scale cutoffs, rounding windows, final
weights, letter-grade results, or validation text.

| Event | Action or error code | Trigger |
| --- | --- | --- |
| `tool_complete` | `calculation` | Valid current-grade edit committed by the native `change` event. |
| `tool_complete` | `final_score_preview` | Valid final-score edit committed while the current-grade input is valid. |
| `tool_complete` | `rounding_saved`, `scale_saved`, `weight_saved` | Successful explicit save, including repeated saves. |
| `tool_interaction` | `current_grade_cleared`, `final_score_cleared` | Input cleared and edit committed. |
| `tool_interaction` | `mobile_settings_opened`, `mobile_settings_closed` | Mobile settings button or explicit Escape dismissal. |
| `tool_interaction` | `rounding_opened`, `scale_opened`, `weight_opened` | Settings dialog opened. |
| `tool_interaction` | `rounding_dismissed`, `scale_dismissed`, `weight_dismissed` | Dialog closed with its close button, backdrop, or Escape; successful saves do not count as dismissals. |
| `tool_interaction` | `rounding_enabled`, `rounding_disabled` | Rounding toggle changed, every time. |
| `tool_interaction` | `rounding_reset`, `scale_reset`, `weight_reset` | Explicit reset to defaults. |
| `tool_error` | `current_grade_invalid`, `final_score_invalid` | Invalid input edit committed. |
| `tool_error` | `rounding_invalid`, `scale_invalid`, `weight_invalid` | Explicit save rejected by validation. |

Live rendering, individual keystrokes, automatic recalculations from settings,
initialization, and responsive layout changes do not produce calculation or
preview events. All consent rules still apply, and actions before consent are
discarded. `tool_start` occurs once per page visit before the first accepted
interaction, outcome, or error. Existing `tool_action` adoption counts coexist
with repeated interactions and completions; do not add their counts together
as a total of unique clicks.

No audio, filenames, tickers, grades, investment amounts, dates, free text,
processing results, or private tracker content is passed to this helper.

## GA4 property setup

The connector now has read access to property `558030185`. At the most recent
check in this chat, there were no custom dimensions or metrics. Property settings
have not been changed by this implementation.

1. Open the property for this measurement ID. Under **Admin → Custom definitions**,
   create these four **Event** scoped custom dimensions. Use the parameter names
   exactly as shown:

   | Display name | Event parameter |
   | --- | --- |
   | Tool name | `tool_name` |
   | Tool action | `action` |
   | Export format | `format` |
   | Tool error category | `error_code` |

2. Review **Admin → Data streams → web stream → Enhanced measurement**. Review
   automatic form interactions and site search before enabling them; these are
   separate from the fixed tool event schema.
3. Custom events do not require advance creation in GA4. Once deployed, consented
   interactions send them automatically. Allow 24–48 hours for custom dimension
   reporting after registration.
4. Build a free-form Exploration with Tool name and Tool action as rows, and
   Event count and Total users as metrics. Filter Event name to `tool_action` for
   feature adoption. Filter to `tool_error` for failures.
5. Build a funnel for a specific tool: `tool_start` → `tool_complete`; for
   Transcribe audio loading and playback, use `tool_action` filtered by
   `audio_loaded` → `playback_started`. Configuration export is a separate goal.
6. Optionally mark `tool_complete` or `tool_export` as key events if these are the
   outcomes you want to measure. The site does not mark events automatically.
7. Verify live collection with a consented test in Realtime or DebugView. Enable
   debug mode only for test traffic, using Tag Assistant or the GA debugger.
   Confirm refusal and withdrawal stop tracking. Local tests intercept Google
   endpoints and do not prove delivery to the live GA4 property.

Google references:
- [Send events](https://developers.google.com/analytics/devguides/collection/ga4/events)
- [Custom definitions](https://support.google.com/analytics/answer/14240153)
- [Enhanced measurement](https://support.google.com/analytics/answer/9216061)
- [DebugView](https://support.google.com/analytics/answer/7201382)

## Verification

Build with `JEKYLL_ENV=production bundle exec jekyll build --destination /private/tmp/mf-ga4-tool-events`.
Run `tests/analytics-consent-browser.cjs` with `ANALYTICS_BUILD_DIR` pointing to
that directory, and the available Playwright module/browser paths as needed.
The suite intercepts Google requests, checks the consent lifecycle and exclusions,
checks allowlist rejection and feature deduplication, and exercises valid grade
and interest calculations and a real local WAV load with loop controls.
