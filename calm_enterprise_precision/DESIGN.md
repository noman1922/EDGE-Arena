---
name: Calm Enterprise Precision
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#3f493f'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#6f7a6e'
  outline-variant: '#becabc'
  surface-tint: '#006d30'
  primary: '#00652c'
  on-primary: '#ffffff'
  primary-container: '#15803d'
  on-primary-container: '#d3ffd5'
  inverse-primary: '#79db8d'
  secondary: '#545f73'
  on-secondary: '#ffffff'
  secondary-container: '#d5e0f8'
  on-secondary-container: '#586377'
  tertiary: '#415d4d'
  on-tertiary: '#ffffff'
  tertiary-container: '#597665'
  on-tertiary-container: '#dcfce7'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#95f8a7'
  primary-fixed-dim: '#79db8d'
  on-primary-fixed: '#00210a'
  on-primary-fixed-variant: '#005323'
  secondary-fixed: '#d8e3fb'
  secondary-fixed-dim: '#bcc7de'
  on-secondary-fixed: '#111c2d'
  on-secondary-fixed-variant: '#3c475a'
  tertiary-fixed: '#caead6'
  tertiary-fixed-dim: '#afceba'
  on-tertiary-fixed: '#042014'
  on-tertiary-fixed-variant: '#314d3e'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Inter
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.015em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: -0.005em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-xs:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.03em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system is engineered for high-stakes enterprise assessment, skills verification, and career tracking. The brand ethos prioritizes functional clarity, intellectual honesty, and sustained cognitive endurance over decorative trends.

### Tone & Personality
- **Rigorous & Trustworthy:** Interfaces feel measured, deliberate, and mathematically aligned.
- **Cognitively Quiet:** Unnecessary ornamentation, intense saturated surfaces, and heavy layered elevations are stripped away to preserve candidate focus and administrative efficiency.
- **Understated Utility:** Inspired by the disciplined typesetting of engineering toolchains and the operational directness of diagnostic platforms.

### Design Movement
The aesthetic synthesizes modern functional minimalism with crisp data density:
- **Hairline boundaries** define structure rather than drop shadows.
- **Generous vertical line heights** offset compact data grids to sustain reading comprehension.
- **Targeted chromatic accents** reserve high-value hues (e.g., deep forest green) exclusively for affirmative progress, confirmed states, and primary commitments.

## Colors

The palette establishes an ultra-usable environment where contrast ratios comfortably clear WCAG AAA guidelines for text and essential graphical indicators.

### Palette Architecture
- **Primary Canvas (`#F8FAFC`):** Soft, neutral cool-gray canvas foundation that reduces ocular fatigue during long diagnostic sessions.
- **Card & Component Surfaces (`#FFFFFF`):** Crisp pure white applied to active forms, cards, tables, and modal dialogs.
- **Utility & Muted Foundations (`#F1F5F9`):** Neutral gray dedicated to code-blocks, disabled inputs, progress rail troughs, and subtle table header bands.
- **Hairline Borders (`#E2E8F0`):** Single-pixel perimeter rules that maintain structure without segmenting the interface aggressively.
- **Typography Primary (`#0F172A` / `#1E293B`):** Deep charcoal slate engineered for high-contrast reading without the jarring hardness of pitch black (`#000000`).
- **Typography Secondary & Meta (`#64748B`):** Cool slate for helper labels, placeholder states, timestamps, and column headers.
- **Primary Affirmation (`#15803D` / Hover `#166534`):** Forest green applied strictly to primary submission paths, score completion tracks, and confirmed validation events.
- **Affirmative Fill / Badging (`#DCFCE7`):** Tinted emerald surface for chips, pass indicators, and active question flags, paired with `#166534` text.

## Typography

Typographic scale and rhythm rely entirely on the systematic properties of `Inter`. 

### Rules of Engagement
- **Optical Kerning:** Track negative letter spacing on headings (`-0.01em` to `-0.02em`) to ensure title lockups feel cohesive and balanced.
- **Vertical Rhythm:** Question prompts and instructional passages employ relaxed proportional line heights (`1.6x` to `1.65x`) to reduce scan fatigue.
- **Structural Metadata:** System meta labels, table column indicators, and section tags leverage semi-bold weights (`500` or `600`) with positive letter-spacing (`0.01em` to `0.03em`) for immediate recognition at reduced optical sizes.
- **Tabular Figures:** All scoring badges, numeric test timers, candidate counts, and analytical tables must enforce `font-variant-numeric: tabular-nums` to eliminate layout jitter.

## Layout & Spacing

The structural layout uses a predictable 8pt rhythmic grid optimized for single-task focus and complex multi-column management.

### Responsive Breakpoint System
- **Mobile (`< 640px`):** Single-column stacked layouts, `16px` (`margin-mobile`) exterior padding, and full-width atomic cards.
- **Tablet (`640px - 1024px`):** 8-column layout, `24px` gutters, adaptive collapsible sidebar menus, centered assessment forms.
- **Desktop (`> 1024px`):** 12-column layout with a fixed diagnostic shell: maximum content constraint of `1280px` for standard data tables, and `768px` optimal read-width for assessment question flows.

### Spacing Usage Rules
- `space-xs (4px)`: Micro gaps between badge icons and label text; input clear buttons.
- `space-sm (8px)`: Padding inside buttons, pills, chips, and tight form field elements.
- `space-md (16px)`: Standard field vertical separation, card internal padding, table column cell gaps.
- `space-lg (24px)`: Major section chunking, standard card inner padding, separation between question panels.
- `space-xl (40px)`: Macro page-level breaks between headers, diagnostic progress groups, and result summaries.

## Elevation & Depth

Visual hierarchy is maintained via surface contrast and hairline borders rather than deep directional shadows.

### Elevation Levels
- **Level 0 (Flat Canvas):** `#F8FAFC`. Base view floor. Zero shadow, zero boundary.
- **Level 1 (Subtle Paneling / Primary Cards):** `#FFFFFF` fill with a `1px` solid border in `#E2E8F0`, accented by an ultra-subtle ambient shadow: `box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05)`.
- **Level 2 (Dropdowns, Menus & Tooltips):** `#FFFFFF` fill with a `1px` solid border in `#E2E8F0` and diffuse elevation: `box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05)`.
- **Level 3 (Modal Dialogs & Critical Confirmations):** Centered floating white container bounded by `1px` solid `#CBD5E1`, supported by `box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.03)` over a backdrop tint of `rgba(15, 23, 42, 0.4)` with `backdrop-filter: blur(2px)`.

Dark glows, saturated colored shadows, and skeuomorphic drop-shadows are strictly prohibited.

## Shapes

The design system implements a controlled, disciplined border-radius scale designed to prevent bubbly softness while eliminating harsh industrial points.

### Radius Assignments
- **Input Fields, Selection Cards, standard Buttons:** `6px` (`rounded-md`). Provides balanced tactical focus.
- **Cards, Panels, Modals, Table Containers:** `8px` (`rounded-lg`). Ensures structured clarity at large scales without visual bulk.
- **Pills, Status Badges, Progress Avatars:** `9999px` (`rounded-full`). Used exclusively for micro-status indicators, completion counters, and tag labels to demarcate them instantly from actionable square-cornered fields.

## Components

### Buttons
- **Primary:** Solid `#15803D` background, `#FFFFFF` text, `6px` border-radius, font size `14px`, font weight `500`. Hover state deepens to `#166534`. Active state drops scale to `0.98`. Focus ring uses `2px` offset with `rgba(21, 128, 61, 0.35)`.
- **Secondary / Subtle:** `#FFFFFF` background with `1px` solid `#E2E8F0` border and `#1E293B` text. Hover transitions background to `#F8FAFC` and border to `#CBD5E1`.
- **Ghost:** Transparent background, `#64748B` text. Hover transitions to `#F1F5F9` background and `#0F172A` text.

### Form Inputs & Textareas
- **Base State:** `#FFFFFF` background, `1px` solid `#E2E8F0` border, `6px` border-radius, `14px` text in `#0F172A`, placeholder in `#94A3B8`.
- **Height & Padding:** Text fields feature a standard `40px` height with `12px` horizontal padding.
- **Focus State:** Crisp `1px` border shift to `#15803D` accompanied by a `3px` focus ring halo `rgba(21, 128, 61, 0.15)`.

### Assessment Multiple Choice Cards (Selection Items)
- **Neutral:** Clean `#FFFFFF` card, `1px` hairline border `#E2E8F0`, padding `16px`, containing unselected radio button.
- **Hover:** Border shifts to `#94A3B8`, background shifts to `#F8FAFC`.
- **Selected State:** Border transitions to `#15803D`, background transitions to an ultra-subtle tint `#F0FDF4`, radio marker fills with `#15803D`.

### Checkboxes & Radios
- Size `18px x 18px`, `4px` radius for checkboxes, circular for radios. Hairline border `#CBD5E1`. On check: `#15803D` fill with pure white centered glyph.

### Status Pills & Badges
- Height `24px`, horizontal padding `8px`, radius `9999px`, font size `12px`, weight `500`.
- **Passed / Active:** Background `#DCFCE7`, text `#166534`.
- **Pending / In Review:** Background `#FEF3C7`, text `#92400E`.
- **Draft / Inactive:** Background `#F1F5F9`, text `#475569`.

### Data Tables
- Row height: generous `52px` minimum for baseline scan-ability.
- Header row: `#F8FAFC` surface, `#64748B` uppercase `11px` typography, `1px` bottom border `#E2E8F0`.
- Cells: `#FFFFFF` surface, `14px` `#1E293B` text, `1px` bottom divider `#F1F5F9`. Hover state on row triggers clean `#F8FAFC`.