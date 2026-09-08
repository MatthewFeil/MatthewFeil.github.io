---
name: Matthew Feil
description: A high-contrast personal project site for creative technology, tools, and ongoing work.
colors:
  background-light: "#f7f7f7"
  surface-light: "#f2f2f2"
  panel-light: "#e7e7e7"
  text-light: "#0a0a0a"
  muted-light: "#626262"
  border-light: "#151515"
  background-dark: "#000000"
  surface-dark: "#141414"
  panel-dark: "#202020"
  text-dark: "#f6f6f6"
  muted-dark: "#a7a7a7"
  border-dark: "#f6f6f6"
  signal-red: "#e3262e"
  signal-red-strong: "#b90f17"
  signal-red-bright: "#ff343d"
  signal-red-soft: "rgb(255 52 61 / 0.13)"
  workbench-border: "rgb(246 246 246 / 0.42)"
  workbench-border-soft: "rgb(246 246 246 / 0.2)"
  success-green: "#16703a"
  warning-amber: "#9b6300"
  error-red: "#b91c1c"
typography:
  display:
    fontFamily: "Archivo Black, Impact, sans-serif"
    fontWeight: 400
    lineHeight: 0.86
    letterSpacing: "0"
  body:
    fontFamily: "Familjen Grotesk, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Familjen Grotesk, Arial, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.07em"
  operational:
    fontFamily: "Familjen Grotesk, Arial, sans-serif"
    fontSize: "0.72rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "0.06em"
rounded:
  square: "0"
spacing:
  compact: "0.65rem"
  section: "0.75rem"
  panel: "0.85rem"
  panel-roomy: "1rem"
  page-gutter: "clamp(1rem, 3.6vw, 3rem)"
components:
  button-primary:
    backgroundColor: "{colors.signal-red}"
    textColor: "#ffffff"
    typography: "{typography.label}"
    rounded: "{rounded.square}"
    padding: "0.7rem 1rem"
    height: "2.5rem"
  panel:
    backgroundColor: "{colors.background-light}"
    rounded: "{rounded.square}"
    padding: "{spacing.panel}"
  post-card:
    backgroundColor: "{colors.background-light}"
    textColor: "{colors.text-light}"
    rounded: "{rounded.square}"
    padding: "clamp(0.85rem, 2.2vw, 1.2rem)"
  workbench-command:
    backgroundColor: "transparent"
    textColor: "{colors.text-dark}"
    typography: "{typography.operational}"
    rounded: "{rounded.square}"
    padding: "0.55rem 0.8rem"
    height: "4.3rem"
  workbench-emphasis-active:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.text-dark}"
    typography: "{typography.operational}"
    rounded: "{rounded.square}"
    padding: "0.35rem 0.65rem"
    height: "2rem"
---

# Design System: Matthew Feil

## Overview

**Creative North Star: "Signalboard Studio"**

The system treats a personal portfolio as a public signalboard: direct, high-contrast, and built around real projects rather than promotional decoration. Large display type establishes authorship; the page then gives visitors concise, practical routes into work, writing, and tools.

The visual language is deliberately crisp and utilitarian. Flat tonal surfaces, square borders, compact uppercase labels, and a restrained red signal preserve clarity across the public site and private trackers. The system supports creative technology without becoming a generic technical dashboard.

The transcription workbench is a scoped **Operate-mode extension** of Signalboard Studio. It stays always dark and arranges the task as four stacked bands: setup controls, recording timeline, pitch analysis, and essential transport. The recording remains central, analysis stays aligned beneath it, and transport stays at hand; this surface is neither a marketing hero nor a panel-heavy DAW clone.

**Key Characteristics:**
- Oversized, decisive display type paired with practical reading and UI text.
- Black, white, and gray tonal structure with red reserved for signal moments.
- Square, bordered components with a calm border-driven interaction response rather than decorative depth.
- Responsive layouts that become single-column and menu-led on smaller screens.
- A dense, user-steered signal workspace for local audio, with waveform and pitch evidence kept in one visual stack.

## Colors

The palette relies on strong neutral contrast and one rare red signal; semantic green, amber, and red appear only for meaningful status.

### Primary
- **Signal Red** (`#e3262e`): marks a key initial, active tool state, focus, and high-priority action in light mode.
- **Signal Red Strong** (`#b90f17`): deepens red for high-emphasis interaction states.
- **Bright Signal Red** (`#ff343d`): the transcription workbench's higher-luminance active state, playhead, A–B selection, analysis crosshair, and keyboard focus signal against pure black.

### Neutral
- **Field Gray** (`#f7f7f7`): light-mode page field.
- **Soft Gray Surface** (`#f2f2f2`): compact, bordered controls and data labels in light mode.
- **Near-Black Ink** (`#0a0a0a`): light-mode reading and display text.
- **Night Field** (`#000000`): dark-mode page field.
- **Dark Surface** (`#141414`): compact, bordered controls and data labels in dark mode.
- **Bright Ink** (`#f6f6f6`): dark-mode reading and display text.
- **Workbench Rules** (`rgb(246 246 246 / 0.42)` and `rgb(246 246 246 / 0.2)`): strong and soft one-pixel divisions inside the transcription workspace.

### Named Rules
**The Rare Signal Rule.** Use red to guide attention, communicate state, or punctuate a key word. Do not use it as ambient decoration or a default section background.

**The Field-First Fill Rule.** A page-scale section, panel, card, table, modal, or repeated-content container uses the page field and its structural border. Reserve the lighter or darker neutral surface for a compact, outlined control or label inside that field: inputs, small buttons, count badges, time tags, stat cells, switcher options, and graph readouts. Never place an equally toned compact control inside an equally toned broad container.

**The Black Signal Field Rule.** Transcription is intentionally always dark. Keep its canvases, bands, and transport on pure black; use Dark Surface only for interactive hover or selected emphasis, never as a stack of floating panels.

## Typography

**Display Font:** Archivo Black, Impact, sans-serif

**Body Font:** Familjen Grotesk, Arial, sans-serif

**Character:** Archivo Black supplies unmistakable, compact display authority. Familjen Grotesk carries reading, labels, forms, and tool data with a sharper, more individual texture than a neutral system sans.

### Hierarchy
- **Display** (Archivo Black, `clamp(4.4rem, 10vw, 11rem)`, `0.86`): hero identity and large section statements.
- **Headline** (Archivo Black, `clamp(2.6rem, 8vw, 8rem)`, `0.86`): major homepage and page-section headings.
- **Title** (Archivo Black, `clamp(2.15rem, 4.8vw, 4.6rem)`, `0.95`): page and app headings.
- **Body** (Familjen Grotesk, `1rem`, `1.6`): ordinary reading copy. Post content is constrained to `74ch`.
- **Label** (Familjen Grotesk, `0.72rem` to `0.86rem`, `700`, `0.07em` to `0.1em`, uppercase): navigation, metadata, controls, and field labels.
- **Operational Floor** (Familjen Grotesk, `0.72rem`, `800`, `0.06em`, uppercase where categorical): transcription control labels, timeline status, compact analysis text, transport labels, and mobile readouts. Numeric values use tabular figures.

### Named Rules
**The Two-Voice Rule.** Archivo Black is for display moments only. Familjen Grotesk carries all reading and operational UI text; do not introduce a third type family without a distinct role.

## Layout

The main shell is centered at `min(100%, 1680px)` with a responsive page gutter of `clamp(1rem, 3.6vw, 3rem)`. The home hero uses an asymmetrical two-column layout on desktop, then stacks into a single column at `1040px` and below. Public page sections use full-width dividers and open space rather than nested containers.

Tool interfaces favor compact CSS grids, fixed control heights, and panel grouping. At smaller widths, navigation becomes a touch-sized menu and major grids collapse to one column without hiding core content.

The transcription workbench fills the viewport with four explicit horizontal bands: an auto-height control bar, a flexible overview-plus-waveform timeline, a flexible keyboard-aligned analysis region, and an auto-height transport. The timeline itself stacks a `4.25rem` overview, the zoomed stereo waveform, and a compact status line. The analysis band places a `clamp(4.5rem, 7vw, 6.5rem)` piano keyboard directly beside the spectrogram so pitch rows remain spatially accountable.

At `1180px`, setup controls move to their own horizontally scrollable row and the nonessential volume control leaves the transport. At `720px`, the page may scroll, setup becomes sticky, filters and secondary analysis commands are suppressed, and the essential transport is fixed to the viewport bottom with rewind, play, forward, loop, and timecode. A square Timeline / Analysis switch changes the relative height of the two signal bands instead of hiding either one; the keyboard remains sticky beside a horizontally scrollable spectrogram.

## Elevation & Depth

The system is flat by default. Borders, tonal surface changes, and spacing establish hierarchy. Hover never moves an element, adds a shadow, or adds a second perimeter: interactive cards and controls simply strengthen their existing border and, where useful, their surface tone. Signal Red is not a generic hover color, so it continues to communicate focus, active state, and priority rather than availability.

### Named Rules
**The Flat-By-Default Rule.** Do not add resting shadows, hover shadows, glass layers, or ornamental blur. Do not translate elements on hover. Depth must explain interaction or content grouping.

**The Active Border Rule.** Pointer hover strengthens the existing border rather than adding an outer outline. Keep touch hover-neutral. Keyboard focus remains a clearly visible Signal Red outline, while destructive actions retain their semantic error color.

## Shapes

All controls, panels, cards, and tool surfaces use square corners (`border-radius: 0`) and thin, high-contrast borders. Borders are structural rules, not decorative frames. Controls use a standard minimum height of `2.5rem`, rising to the `2.75rem` touch target on narrow screens.

Canvas graphics follow the same geometry: crisp one-pixel time, measure, beat, octave, selection, playhead, and crosshair rules. The workbench does not wrap the waveform or spectrum in decorative cards; their rectangular bands are the interface.

## Components

### Buttons
Buttons are compact commands, not pill-shaped decoration.
- **Shape:** square corners (`0`) with a `1px` border.
- **Primary:** Signal Red background with white text, `0.7rem 1rem` padding, and the label type role.
- **Hover / Focus:** pointer hover strengthens the existing border; keyboard focus uses the shared red focus outline.
- **Secondary:** neutral surface with a structural border; do not add a fill merely to create variation.

### Cards / Containers
Cards frame repeated posts and dense tool groups, never whole page sections.
- **Corner Style:** square (`0`).
- **Background:** the page field token according to color scheme; hierarchy comes from a border, spacing, and content grouping.
- **Border:** `1px` soft border.
- **Hover Strategy:** flat at rest; clickable cards strengthen their existing border without movement or shadow.
- **Internal Padding:** `0.85rem` to `1.2rem`, scaled by context.

### Fill Scale
- **Field:** page backgrounds and broad outlined containers. It always uses the main light or dark background.
- **Control:** compact bordered actions, fields, labels, and data cells. It uses the single neighboring neutral surface.
- **State:** a selected, semantic, or primary control may use its established accent or status color. It never creates a new ambient surface tier.

### Inputs / Fields
Inputs and selects use a square, bordered surface and the Familjen Grotesk UI role. Labels remain uppercase, compact, and visibly separate from the field. Focus is communicated by the red outline or border shift, never by color alone.

### Navigation
The sticky header uses a translucent page-colored surface and a `2px` structural bottom border. Desktop links are compact uppercase labels with a red underline reveal. At `1040px` and below, a touch-sized Menu control reveals the right-aligned navigation stack; dropdowns open through opacity and transform motion without animating layout properties.

### Probability Playground
This standalone scroll exhibit may use a distinct palette and animated, experiment-specific visual language. Its hero statistic always shows the complete human-readable result: do not use exponents, scientific notation, or magnitude abbreviations. If the literal number is wide, reduce the statistic's scale responsively rather than shortening it; the visual impact comes from seeing the full extreme.

### Post Cards
Post cards pair a compact Article/date metadata row with a display title and Familjen Grotesk summary. They use tonal surface contrast and a strengthened border on hover, while the homepage hero remains reserved for one featured project.

### Tool Switchers
Tool switchers are square segmented controls with a thin shared border. The active option uses Signal Red with white text; inactive options remain neutral and legible.

### Transcription Workbench
The workbench is a local-audio task surface whose hierarchy comes from aligned signal bands rather than nested panels.
- **Control band:** identity, file state, local-processing status, speed, pitch lock, loop, channel, filters, spectrum, and measure marking share a compact row. Controls use the Operational Floor and square one-pixel separations; overflow scrolls rather than wrapping into cards.
- **Timeline band:** a complete-recording overview sits above a zoomed stereo waveform. Canvas rendering supplies time ticks, a user-marked measure and four-beat lattice, a bright-red playhead, and a translucent red A–B region with explicit draggable endpoints.
- **Analysis band:** selection-driven grayscale frequency energy is vertically aligned from C2 through C8 with a rendered piano keyboard. Pointer, touch, and arrow-key inspection leaves a persistent red crosshair and reports time, Hz, nearest note, and cents offset.
- **Transport band:** playback navigation, A–B loop state, millisecond timecode, volume, and zoom form one continuous bottom rule. On mobile only the essential transport remains fixed at hand.
- **Local file state:** “Local” and the empty-state promise communicate that playback and analysis remain on-device. Decode progress and unsupported-file failure replace that state without adding a modal.
- **Preview gate:** the centered private-preview password form is a casual client-side visibility gate. It shares the always-dark field, square entry controls, display identity, and bright-red submit action; it must never be described or styled as security for sensitive data.

## Do's and Don'ts

### Do:
- **Do** reserve Archivo Black for headings, identity, and short high-impact statements.
- **Do** use Familjen Grotesk for reading copy, controls, labels, data entry, and tool status.
- **Do** use full-width dividers, alignment, and tonal shifts to organize a page before introducing a panel.
- **Do** keep broad outlined regions on the page field and use tonal fill only for compact controls or labels inside them.
- **Do** use red sparingly for emphasis, active state, focus, and meaningful status.
- **Do** keep interactive controls square, bordered, and touch-sized on small screens.
- **Do** keep transcription setup above the signal, the overview above the zoomed waveform, pitch analysis aligned below it, and essential transport fixed at hand on mobile.
- **Do** preserve Hz, note, and cents together when exposing pitch inspection; the crosshair and readout are one persistent state.

### Don't:
- **Don't** introduce rounded SaaS cards, pill controls, or decorative gradient fields.
- **Don't** use red as a generic background or substitute it for hierarchy.
- **Don't** add a third type family, display face, or technical-looking mono type without a unique content role.
- **Don't** make a whole page a floating card or nest cards within cards.
- **Don't** give an outer card and its smaller bordered children the same tonal fill.
- **Don't** animate height, padding, margin, or other layout-driving properties for navigation reveals.
- **Don't** turn the transcription workbench into a marketing landing page, notation editor, or chrome-heavy DAW imitation.
- **Don't** recast the casual preview password as authentication or imply that local audio is uploaded.
