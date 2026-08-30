---
name: Matthew Feil
description: A high-contrast personal project site for creative technology, tools, and ongoing work.
colors:
  background-light: "#ffffff"
  surface-light: "#f2f2f2"
  panel-light: "#e7e7e7"
  text-light: "#0a0a0a"
  muted-light: "#626262"
  border-light: "#151515"
  background-dark: "#090909"
  surface-dark: "#141414"
  panel-dark: "#202020"
  text-dark: "#f6f6f6"
  muted-dark: "#a7a7a7"
  border-dark: "#f6f6f6"
  signal-red: "#e3262e"
  signal-red-strong: "#b90f17"
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
    backgroundColor: "{colors.surface-light}"
    rounded: "{rounded.square}"
    padding: "{spacing.panel}"
  post-card:
    backgroundColor: "{colors.surface-light}"
    textColor: "{colors.text-light}"
    rounded: "{rounded.square}"
    padding: "clamp(0.85rem, 2.2vw, 1.2rem)"
---

# Design System: Matthew Feil

## Overview

**Creative North Star: "Signalboard Studio"**

The system treats a personal portfolio as a public signalboard: direct, high-contrast, and built around real projects rather than promotional decoration. Large display type establishes authorship; the page then gives visitors concise, practical routes into work, writing, and tools.

The visual language is deliberately crisp and utilitarian. Flat tonal surfaces, square borders, compact uppercase labels, and a restrained red signal preserve clarity across the public site and private trackers. The system supports creative technology without becoming a generic technical dashboard.

**Key Characteristics:**
- Oversized, decisive display type paired with practical reading and UI text.
- Black, white, and gray tonal structure with red reserved for signal moments.
- Square, bordered components with a calm border-driven interaction response rather than decorative depth.
- Responsive layouts that become single-column and menu-led on smaller screens.

## Colors

The palette relies on strong neutral contrast and one rare red signal; semantic green, amber, and red appear only for meaningful status.

### Primary
- **Signal Red** (`#e3262e`): marks a key initial, active tool state, focus, and high-priority action in light mode.
- **Signal Red Strong** (`#b90f17`): deepens red for high-emphasis interaction states.

### Neutral
- **Paper White** (`#ffffff`): light-mode page field.
- **Soft Gray Surface** (`#f2f2f2`): cards and low-emphasis surfaces in light mode.
- **Near-Black Ink** (`#0a0a0a`): light-mode reading and display text.
- **Night Field** (`#090909`): dark-mode page field.
- **Dark Surface** (`#141414`): dark-mode cards and tool surfaces.
- **Bright Ink** (`#f6f6f6`): dark-mode reading and display text.

### Named Rules
**The Rare Signal Rule.** Use red to guide attention, communicate state, or punctuate a key word. Do not use it as ambient decoration or a default section background.

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

### Named Rules
**The Two-Voice Rule.** Archivo Black is for display moments only. Familjen Grotesk carries all reading and operational UI text; do not introduce a third type family without a distinct role.

## Layout

The main shell is centered at `min(100%, 1680px)` with a responsive page gutter of `clamp(1rem, 3.6vw, 3rem)`. The home hero uses an asymmetrical two-column layout on desktop, then stacks into a single column at `1040px` and below. Public page sections use full-width dividers and open space rather than nested containers.

Tool interfaces favor compact CSS grids, fixed control heights, and panel grouping. At smaller widths, navigation becomes a touch-sized menu and major grids collapse to one column without hiding core content.

## Elevation & Depth

The system is flat by default. Borders, tonal surface changes, and spacing establish hierarchy. Hover never moves an element, adds a shadow, or adds a second perimeter: interactive cards and controls simply strengthen their existing border and, where useful, their surface tone. Signal Red is not a generic hover color, so it continues to communicate focus, active state, and priority rather than availability.

### Named Rules
**The Flat-By-Default Rule.** Do not add resting shadows, hover shadows, glass layers, or ornamental blur. Do not translate elements on hover. Depth must explain interaction or content grouping.

**The Active Border Rule.** Pointer hover strengthens the existing border rather than adding an outer outline. Keep touch hover-neutral. Keyboard focus remains a clearly visible Signal Red outline, while destructive actions retain their semantic error color.

## Shapes

All controls, panels, cards, and tool surfaces use square corners (`border-radius: 0`) and thin, high-contrast borders. Borders are structural rules, not decorative frames. Controls use a standard minimum height of `2.5rem`, rising to the `2.75rem` touch target on narrow screens.

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
- **Background:** light or dark surface token according to color scheme.
- **Border:** `1px` soft border.
- **Hover Strategy:** flat at rest; clickable cards strengthen their existing border without movement or shadow.
- **Internal Padding:** `0.85rem` to `1.2rem`, scaled by context.

### Inputs / Fields
Inputs and selects use a square, bordered surface and the Familjen Grotesk UI role. Labels remain uppercase, compact, and visibly separate from the field. Focus is communicated by the red outline or border shift, never by color alone.

### Navigation
The sticky header uses a translucent page-colored surface and a `2px` structural bottom border. Desktop links are compact uppercase labels with a red underline reveal. At `1040px` and below, a touch-sized Menu control reveals the right-aligned navigation stack; dropdowns open through opacity and transform motion without animating layout properties.

### Post Cards
Post cards pair a compact Article/date metadata row with a display title and Familjen Grotesk summary. They use tonal surface contrast and a strengthened border on hover, while the homepage hero remains reserved for one featured project.

### Tool Switchers
Tool switchers are square segmented controls with a thin shared border. The active option uses Signal Red with white text; inactive options remain neutral and legible.

## Do's and Don'ts

### Do:
- **Do** reserve Archivo Black for headings, identity, and short high-impact statements.
- **Do** use Familjen Grotesk for reading copy, controls, labels, data entry, and tool status.
- **Do** use full-width dividers, alignment, and tonal shifts to organize a page before introducing a panel.
- **Do** use red sparingly for emphasis, active state, focus, and meaningful status.
- **Do** keep interactive controls square, bordered, and touch-sized on small screens.

### Don't:
- **Don't** introduce rounded SaaS cards, pill controls, or decorative gradient fields.
- **Don't** use red as a generic background or substitute it for hierarchy.
- **Don't** add a third type family, display face, or technical-looking mono type without a unique content role.
- **Don't** make a whole page a floating card or nest cards within cards.
- **Don't** animate height, padding, margin, or other layout-driving properties for navigation reveals.
