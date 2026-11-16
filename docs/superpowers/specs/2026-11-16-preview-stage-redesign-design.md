# Preview Stage redesign: design

Date: 2026-11-16 · Status: approved 2026-11-16

Visual reference: the "Config Forge Layout Options" canvas, board **B · Preview Stage**
(https://claude.ai/artifact/EeENSnhfKayWUoAhASJN8j). The board is a mockup; this
document wins where they differ.

## Intent

The user wants two things together:

1. **Preview focus**: while editing, the terminal preview should be the centre of
   the screen, not one of three tabs.
2. **A dark look**: replace the current cream / serif / copper theme with the
   user's *jamielab* design language (dark terminal ground, IBM Plex Mono, phosphor
   green), plus a new red accent.

## Goals

- App-wide re-theme to jamielab tokens, Home screen included.
- A new red accent with exactly one meaning: **a change not yet written to disk**
  (unsaved/unwritten markers, changed-field edges, the primary write action).
- Studio screen restructured to the Preview Stage layout (below).
- Existing behaviour unchanged: editing, source reconcile, validation, save, apply
  pipeline, export, translate, history, templates, narrow-screen usability.

## Non-goals

- **No "preview as kitty/alacritty" toggle.** The preview shows only the project's
  own terminal. Translation stays in its existing panel. (Deferred by the user.)
- No new settings, controls or features beyond relocating existing ones.
- No light-mode theme in this pass.
- No changes to adapters, services or Rust backend. The store gets exactly one
  addition (a saved baseline, see Changed-field markers); nothing else in it changes.

## Anti-goals (would count as failure even if it "works")

- Red used for errors or decoration. Errors stay the lighter coral `danger`,
  always with a ✕ glyph or text.
- Any panel or action that exists today becoming unreachable, especially on
  narrow (Pixel 5) screens.
- Losing the guarantees of the apply flow (confirm, snapshot, backup, verify) or
  making "Write to disk" bypass the existing `ApplyPanel` review.

## Constraints

- Strict TS, Prettier/ESLint, colocated tests; preserve CSS token approach
  (`src/styles/tokens.css` stays the single source of colors; components keep
  using the semantic variables `--bg-app`, `--text-primary`, `--accent`, ...).
- Personal utility app: small risks fine, keep regression coverage.
- Full check before done: format:check, lint, typecheck, test, build, test:e2e
  (cargo checks unaffected but run if cheap).
- Accessibility floor stays: real buttons/inputs, visible focus, tab keyboard
  navigation, text contrast 4.5:1.

## Approaches considered

1. **Re-theme first, then rework Studio in place** (chosen). Stage 1 swaps
   tokens and fixes CSS with the layout untouched; stage 2 restructures
   `SplitStudio.tsx`, moving existing components rather than rewriting them.
   Each stage is its own commit and independently verifiable. Cost: e2e specs
   tied to the old layout get updated in stage 2.
2. Build a new Studio component beside the old one and switch over. Safer
   mid-flight, but duplicates wiring and tests and the old one is deleted anyway.
   Rejected as unnecessary for a personal app.
3. One combined pass. Same work as 1 but theme and layout regressions become
   indistinguishable. Rejected.

## Stage 1: theme

Replace the palette in `src/styles/tokens.css`; keep the semantic variable names
so components don't change.

| jamielab token | value | maps to |
|---|---|---|
| ground | `#0b0f0e` | `--bg-app`, html/body background |
| panel | `#121816` | `--bg-panel`; `--bg-elevated` one step up (builder picks, e.g. `#18201d`) |
| hairline | `#2a3a34` | decorative dividers only |
| edge | `#5a6f66` | `--border` on interactive elements (3:1) |
| ink | `#d7e4dc` | `--text-primary` |
| ink-muted | `#8aa097` | `--text-secondary` |
| phosphor | `#39ff88` | success, focus ring, active/selected states, cursor |
| teal | `#2ec4b6` | links, info |
| amber | `#ffb000` | `--warning` |
| danger | `#ff5f56` | `--danger` (errors only) |
| **forge red (new)** | `#d62839` | new `--accent` / `--unwritten`: primary write action, unwritten markers; text on it `#ffffff` |

- Font: IBM Plex Mono everywhere (bundle it or use the existing `--mono` stack;
  no network font fetch at runtime in the desktop app — bundle via `@fontsource`
  or ship the woff2 locally; builder's call which).
- Type scale from jamielab: display 48/52, h1 28/36, h2 20/28, body 15/24,
  code 14/22, small 13/20, label 11/16 (500 weight). Weights 400/500/600 only.
- Radii: 0 for panes, 2px controls, 4px max for cards/modals. No drop shadows,
  no gradients; structure from borders.
- Focus: 2px phosphor outline, 2px offset.
- Old tokens (`--copper*`, `--paper*`, `--shadow`, serif family) are removed;
  grep `app.css`/`editor.css` for hard-coded colors and shadows and replace.
- The mock terminal in `TerminalPreview` renders the *project's* colors, not the
  app theme; it must still frame clearly against the dark ground (edge border).

Stage 1 is done when every screen renders in the new theme, layout is unchanged,
and all existing tests pass.

## Stage 2: Studio layout

Restructure `SplitStudio.tsx` (and its CSS) into:

```
┌ CF  [ghostty-daily ▾]  ● 2 changed     [‹/› Source] [⚠ 2] [Save] [Write to disk ›] ┐
│                                              │ Settings panel (VisualControls)     │
│        ┌──── TerminalPreview ────┐           │  collapsible groups                 │
│        └─────────────────────────┘           │  changed fields: red left edge      │
│                                              │                                     │
└──────────────────────────────────────────────┴─────────────────────────────────────┘
                     slide-in side panel (right, over the settings panel):
                     tabs  Source | Validation | Write | Export | Translate | History
```

- **Top bar** (replaces studio header + footer):
  - Project switcher: a button showing the current project name opening a
    menu/listbox of `projects` (replaces the sidebar). "Save as template" and
    "Back to workbench" move into this menu.
  - Status: the existing draft badge states ("Session draft", "Not saved yet",
    "Unsaved changes", "Saved"), with red marker for unsaved/unwritten states.
  - Buttons: Source, a validation button showing the issue count (amber when
    warnings, danger when errors, phosphor/"valid" when none), Save, and the red
    primary **Write to disk** (relabel of "Apply config").
- **Centre**: `TerminalPreview` as large as the space allows (max-width ~800px,
  centred).
- **Right**: `VisualControls` as the settings panel (~360–400px). Existing
  sections become collapsible groups if they aren't already; builder's call on
  default open state (Font and Colors open suggested).
- **Side panel**: one slide-in panel with tabs. Source → `AdvancedSource`;
  Validation → `ValidationPanel`; Write/Export/Translate/History → the existing
  `ApplyPanel`/`ExportPanel`/`TranslatePanel`/`HistoryPanel` (split
  `ProjectActions` into tabs or render it per-tab — builder's call). The Source,
  validation and Write buttons open the panel on their tab. Closeable via button
  and Escape; focus moves into the panel on open and returns to the opener on
  close. Keep the existing tablist keyboard behaviour (arrows/Home/End).
- When `actions` is absent (plain browser, no desktop shell) Write/Export/
  Translate/History tabs are hidden or disabled with the current explanatory
  text, as today.
- **Changed-field markers** (user decision: per-field, option A): the store
  gains a `baseline` — a deep copy of the project as last saved (set on open,
  save, and restore), or, for a never-saved draft, as first created/imported.
  Each control compares its shared-config path against `baseline` → red left
  edge plus "was X" when different. The top bar's "● N changed" counts these
  differing fields; with 0 differing fields but `dirty` (e.g. source-only edit
  of an unmapped line) it shows "● Unsaved changes". Edits during in-flight
  I/O keep today's rule: the baseline only advances to what was actually saved.
  Store tests cover baseline on open/create/import/save/restore.
- **Narrow (≤960px)**: single column — top bar wraps, preview, then settings
  below; side panel becomes full-screen overlay. Every action stays reachable.

- **Calls settled after the builder check** (Claude's calls; correct if wrong):
  - "Write to disk" opens the side panel on the Write tab (focus to its first
    input); the old scroll-to-`#project-actions` behaviour goes away.
  - The footer's persistence line ("Projects are stored locally…" / "Session
    draft · Saving and applying need the desktop app") moves to the top of the
    side panel and to the status badge's accessible description.
  - Project switcher lists all projects with the current one marked
    (`aria-current`), is disabled while `busy`, and keeps today's unsaved-edits
    guard (`canReplace()` in `routes.tsx`) — no new confirmation.
  - `SplitStudio`'s `actions` prop may change shape (e.g. separate nodes per tab
    or a render function) with `routes.tsx` and `desktop.test.tsx` updated.
  - The `preview` and `controls` override props stay.
  - Narrow layout: no tabs; preview then settings scroll in one column; side
    panel is a full-screen overlay.

## Tests

- Update `SplitStudio.test.tsx`, `App.test.tsx`/`desktop.test.tsx` and Playwright
  specs (`app-shell`, `visual-editor`, `source-editor`, `safe-apply`,
  `translate-project`, `templates`) for the new structure; keep their intent.
- Add regression coverage for: project switcher opens projects; side panel opens
  on the right tab from each button and returns focus on close; Write to disk
  still goes through the ApplyPanel review; narrow layout reaches every panel.

## Left to the builder

Exact spacing, the elevated panel shade, font bundling method, collapsible
implementation (`<details>` vs. button+region), whether side panel overlays or
pushes the settings panel on wide screens, icon choices (thin-stroke inline SVG
or text glyphs; no emoji).
