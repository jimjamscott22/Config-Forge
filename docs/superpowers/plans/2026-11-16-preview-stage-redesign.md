# Preview Stage Redesign Implementation Plan

> **For agentic workers:** Execute inline with superpowers:executing-plans (project preference: inline execution, no TDD — implement, then add regression coverage; skip the final whole-branch review). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-theme the whole app to jamielab (dark, IBM Plex Mono, phosphor green + forge red) and restructure the Studio screen into the preview-centred "Preview Stage" layout with per-field change markers.

**Architecture:** Stage 1 swaps the palette at the token level (`tokens.css`) without layout changes. Stage 2 adds a saved `baseline` to the Zustand store, per-field change markers in the editor, a reusable slide-in `StudioSidePanel`, a `ProjectSwitcher`, and rebuilds `SplitStudio.tsx` around them, moving existing components rather than rewriting them.

**Tech Stack:** React 19, TypeScript, Vite, Zustand (vanilla), Vitest + Testing Library, Playwright, `@fontsource/ibm-plex-mono`.

**Spec:** `docs/superpowers/specs/2026-11-16-preview-stage-redesign-design.md`

## Global Constraints

- Work on branch `feat/preview-stage` (cut from `main`); one commit per task, `feat:`/`chore:` prefixes.
- Colors (exact): ground `#0b0f0e`, panel `#121816`, hairline `#2a3a34`, edge `#5a6f66`, ink `#d7e4dc`, ink-muted `#8aa097`, phosphor `#39ff88`, teal `#2ec4b6`, amber `#ffb000`, danger `#ff5f56`, forge red `#d62839` (text on it `#ffffff`).
- Red means only "change not yet written to disk". Errors use `danger` with ✕ or text, never red alone.
- Type: IBM Plex Mono only; weights 400/500/600; scale display 48/52, h1 28/36, h2 20/28, body 15/24, code 14/22, small 13/20, label 11/16 @500.
- Radii: 0 panes, 2px controls, 4px max cards/modals. No box-shadows, no gradients. Focus: `2px solid` phosphor, `outline-offset: 2px`.
- No runtime network font fetch (bundle the font).
- No "preview as other terminal" toggle. No changes to adapters, services or Rust; store change limited to `baseline`.
- Every existing action stays reachable at ≤960px (Pixel 5 e2e project).
- Full check before done: `npm run format:check && npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e`.

## Review Focus

1. **Write while dirty** — opening Write with unsaved edits must show ApplyPanel's existing "save first" state, not silently write. Test in Task 6 (`write button opens apply panel which still requires a saved project`).
2. **Baseline after save with edits made during the save** — fields edited mid-save must still show as changed afterwards. Test in Task 2 (`baseline is what was saved, not edits made during the save`).
3. **Source-only edits** (unmapped line changed in source) — no field differs but project is dirty; top bar must say "Unsaved changes", not "0 changed". Test in Task 6.
4. **Escape / close returns focus** to the button that opened the side panel; panel open on narrow screens must not trap the user. Test in Task 4 and e2e in Task 7.
5. **Plain browser (no desktop shell)** — Write/Export/Translate/History tabs absent, Save disabled, explanatory line shown. Test in Task 6.

---

### Task 1: Dark theme tokens and bundled font (Stage 1)

**Files:**
- Modify: `src/styles/tokens.css`, `src/styles/app.css`, `src/styles/editor.css`, `src/main.tsx`, `package.json`
- Test: existing suites (no layout change)

**Interfaces:**
- Produces CSS variables used by later tasks: `--bg-app`, `--bg-panel`, `--bg-elevated` (`#18201d`), `--text-primary`, `--text-secondary`, `--hairline`, `--border` (edge), `--accent` (`#d62839`), `--accent-contrast` (`#ffffff`), `--signal` (phosphor), `--info` (teal), `--warning`, `--danger`, `--success` (phosphor), `--unwritten` (`#d62839`), `--radius-sm` 2px, `--radius-md` 4px, `--radius-lg` 4px, `--mono`.

- [ ] **Step 1:** `npm install @fontsource/ibm-plex-mono` and import weights 400/500/600 in `src/main.tsx`.
- [ ] **Step 2:** Rewrite `:root` in `tokens.css` with the values above; root `font-family: var(--mono)`, `color: var(--text-primary)`, `background: var(--bg-app)`; `color-scheme: dark`. Remove `--copper*`, `--paper*`, `--green`, `--shadow`, serif family. Add `:focus-visible { outline: 2px solid var(--signal); outline-offset: 2px; }`.
- [ ] **Step 3:** In `app.css`/`editor.css` replace every hard-coded color, `box-shadow`, gradient and removed token reference (27 matches of `font-family|box-shadow|#hex` today; also grep `--copper|--paper|--shadow|--green`). Primary buttons (`.button-primary`) use `--accent`/`--accent-contrast`; selected/active states use `--signal`; links `--info`; decorative dividers `--hairline`.
- [ ] **Step 4:** Run `npm run lint && npm run typecheck && npm test && npm run test:e2e`. Expected: all pass (no markup changed).
- [ ] **Step 5:** `npm run dev`, check Home, Create, Import and Studio at desktop and 375px widths in the browser pane; fix contrast or leftover light surfaces.
- [ ] **Step 6:** Commit `feat: jamielab dark theme and bundled IBM Plex Mono`.

### Task 2: Saved baseline in the project store

**Files:**
- Modify: `src/state/project-store.ts`
- Test: `src/state/project-store.test.ts`

**Interfaces:**
- Produces: `ProjectStore.baseline: TerminalProject | null` — deep copy of the project as last saved/opened/adopted, or as first created/imported for a draft.

- [ ] **Step 1:** Add `baseline` (initial `null`). Set it to: `current` in `open`; the parsed project in `startDraft`; `saved` in `save` (always — it is what was persisted, even when `state.current !== current`); `project` in `adopt`. `edit` never touches it. Use `structuredClone`.
- [ ] **Step 2:** Add tests: `baseline is set when a project opens`, `startDraft sets baseline to the draft`, `edit leaves baseline unchanged`, `save advances baseline to the saved project`, `baseline is what was saved, not edits made during the save` (edit while `saveProject` promise is pending → baseline equals pre-edit saved project, `dirty` true), `adopt sets baseline`.
- [ ] **Step 3:** `npx vitest run src/state/project-store.test.ts` → PASS; commit `feat: track saved baseline in project store`.

### Task 3: Per-field change markers

**Files:**
- Modify: `src/components/editor/control-fields.ts`, `src/components/editor/FieldControl.tsx`, `src/components/editor/VisualControls.tsx`, `src/components/editor/ColorControls.tsx` (passes props through only), `src/styles/editor.css`
- Test: `src/components/editor/FieldControl.test.tsx`, `src/components/editor/control-fields.test.ts` (create if absent)

**Interfaces:**
- Consumes: `ProjectStore.baseline` (Task 2), via props.
- Produces:
  - `allControlFields: readonly ControlField[]` (font + appearance + behavior + color + ansi fields).
  - `changedFields(shared: SharedConfig, baseline: SharedConfig | null): ControlField[]` — fields whose `read()` differs; `[]` when baseline is `null`.
  - `ControlsProps.baseline?: SharedConfig` and `VisualControls` prop `baseline?: SharedConfig`.

- [ ] **Step 1:** Implement `allControlFields` and `changedFields` in `control-fields.ts`.
- [ ] **Step 2:** In `FieldControl`, when `baseline` is given and `field.read(shared) !== field.read(baseline)`: add class `field-changed` (red `--unwritten` 3px left border) and render `was {formatted baseline value}` in the label row (`was unset` for `null`). Thread `baseline` through `VisualControls` → `FieldControls`/`ColorControls`.
- [ ] **Step 3:** Tests: `changedFields returns only differing fields`, `changedFields is empty without a baseline`, `FieldControl marks a changed field and shows the previous value`, `FieldControl shows no marker when value equals baseline`.
- [ ] **Step 4:** `npx vitest run src/components/editor` → PASS; commit `feat: mark fields changed since last save`.

### Task 4: Slide-in side panel

**Files:**
- Create: `src/components/layout/StudioSidePanel.tsx`, `src/components/layout/StudioSidePanel.test.tsx`
- Modify: `src/styles/app.css`

**Interfaces:**
- Produces:
  ```ts
  export type SidePanelTab = "source" | "validation" | "write" | "export" | "translate" | "history";
  export interface SidePanelSection { id: SidePanelTab; label: string; content: ReactNode }
  export function StudioSidePanel(props: {
    open: boolean;
    active: SidePanelTab;
    sections: SidePanelSection[];   // only tabs that exist are passed
    note?: ReactNode;               // persistence line shown at top
    onSelect(tab: SidePanelTab): void;
    onClose(): void;                // caller restores focus to the opener
  }): JSX.Element | null;
  ```
- Behaviour: `role="dialog"` `aria-modal="false"` `aria-label="Project tools"`; tablist with arrow/Home/End handling (move the logic from `SplitStudio.keydown`); Escape and a "Close" button call `onClose`; on open, focus the active tab panel's first focusable element (fallback: the tab). Inactive panels stay mounted with `hidden` so drafts in `AdvancedSource`/`ApplyPanel` survive tab switches. CSS: fixed right, width `min(560px, 100vw)`, full height below the top bar, `--bg-panel`, left `--border`; ≤960px: `inset: 0`.

- [ ] **Step 1:** Implement component and CSS.
- [ ] **Step 2:** Tests: `renders nothing when closed`, `shows the active section and hides others`, `arrow keys move between tabs`, `Escape calls onClose`, `keeps inactive sections mounted`.
- [ ] **Step 3:** `npx vitest run src/components/layout/StudioSidePanel.test.tsx` → PASS; commit `feat: add studio side panel`.

### Task 5: Project switcher

**Files:**
- Create: `src/components/layout/ProjectSwitcher.tsx`, `src/components/layout/ProjectSwitcher.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export function ProjectSwitcher(props: {
    current: TerminalProject;
    projects: TerminalProject[];
    busy: boolean;
    onOpen(id: string): void;
    onHome(): void;
    onSaveAsTemplate?(project: TerminalProject): void;
  }): JSX.Element;
  ```
- Behaviour: a button labelled with the project name + terminal (`aria-haspopup="menu"`, `aria-expanded`) opening a menu: all projects (current one `aria-current="page"` and not actionable), then "Save as template" (when provided) and "Back to workbench". Trigger disabled while `busy`. Escape/outside click closes and returns focus to the trigger. Unsaved-edit guarding stays in `routes.tsx` (`canReplace()`), unchanged.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Tests: `lists all projects with the current one marked`, `opening another project calls onOpen`, `disabled while busy`, `Escape closes and refocuses the trigger`, `offers save as template only when provided`.
- [ ] **Step 3:** Run tests → PASS; commit `feat: add project switcher`.

### Task 6: Rebuild SplitStudio as the Preview Stage

**Files:**
- Modify: `src/components/layout/SplitStudio.tsx`, `src/app/routes.tsx`, `src/components/workflows/ProjectActions.tsx`, `src/styles/app.css`
- Test: `src/components/layout/SplitStudio.test.tsx`, `src/app/desktop.test.tsx`, `src/app/App.test.tsx`

**Interfaces:**
- Consumes: `StudioSidePanel` (Task 4), `ProjectSwitcher` (Task 5), `changedFields`/`baseline` (Tasks 2–3).
- Produces:
  - `ProjectActions.tsx` exports `projectActionPanels(props: ProjectActionsProps): Record<"write" | "export" | "translate" | "history", ReactNode>` (each entry the existing panel element with its current props/keys); the `ProjectActions` wrapper component is removed.
  - `SplitStudio` props: `actions?: Partial<Record<"write" | "export" | "translate" | "history", ReactNode>>` and new `baseline?: TerminalProject | null`; `controls`/`preview` overrides kept; sidebar-only props unchanged.

- [ ] **Step 1:** `routes.tsx`: read `baseline` from the store, pass `baseline` and `actions={workflows ? projectActionPanels({...}) : undefined}` (same props as today's `<ProjectActions>`).
- [ ] **Step 2:** Rebuild `SplitStudio` markup: top bar (`ProjectSwitcher`; status badge; buttons "Source", validation button, "Save project", primary "Write to disk"); centre `TerminalPreview` (max-width 800px); right settings panel with `VisualControls` + `baseline={baseline?.shared}`; `StudioSidePanel` with sections Source (`AdvancedSource`), Validation (`ValidationPanel`), and the `actions` entries labelled Write/Export/Translate/History. Remove the old sidebar, tablist, narrow tab logic, footer and `scrollIntoView` handler. Keep the `useSyncExternalStore` media query only if the CSS cannot express the layout (prefer pure CSS).
  - Status badge text: no persistence → "Session draft"; `changedFields(...).length = n > 0` → "● {n} changed" (red marker); else dirty or not persisted → "Unsaved changes" / "Not saved yet"; else "Saved". `aria-describedby` points at the persistence line.
  - Validation button: label `Validation: {errors} errors, {warnings} warnings` for screen readers; visible `✕ n` (danger) when errors, `⚠ n` (amber) when only warnings, `✓ valid` (signal) when none.
  - Persistence line (today's footer copy, verbatim) is the panel `note`.
  - Write to disk: disabled when `actions.write` is absent; opens the panel on `write`. Opener ref restored on close.
  - CSS: `.studio-view` grid `minmax(0,1fr) minmax(320px, 400px)`; ≤960px single column, preview then settings.
- [ ] **Step 3:** Update `SplitStudio.test.tsx`, `desktop.test.tsx`, `App.test.tsx` to the new structure (same intents). Add: `write button opens apply panel which still requires a saved project`, `source button opens the source tab and close returns focus`, `status shows changed field count`, `status shows unsaved changes for a source-only edit`, `plain browser hides write/export/translate/history and disables save`.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint` → PASS; commit `feat: preview stage studio layout`.

### Task 7: End-to-end specs and full check

**Files:**
- Modify: `tests/e2e/app-shell.spec.ts`, `visual-editor.spec.ts`, `source-editor.spec.ts`, `safe-apply.spec.ts`, `translate-project.spec.ts`, `templates.spec.ts` (only where they reference the old sidebar/tabs/footer)
- Modify: `docs/project-status.md` (one paragraph: Preview Stage layout + theme), `CLAUDE.md` UI line (mentions "responsive Split Studio")

- [ ] **Step 1:** Update selectors to the new top-bar buttons, side-panel tabs and project switcher; keep each spec's assertions. Add to `app-shell.spec.ts`: `narrow layout reaches every side panel tab and closes back to the studio` (Pixel 5 project).
- [ ] **Step 2:** Run the full check from Global Constraints → all green.
- [ ] **Step 3:** `graphify update .`; commit `chore: update e2e specs and docs for preview stage`.
