# Adapter authoring

A terminal adapter converts between a terminal's native config text and
Config Forge's project model without losing anything it does not understand.
Ghostty (`src/adapters/ghostty/`), Kitty, and Alacritty are the reference
implementations.

## Adapter contract

Implement `TerminalAdapter` from `src/adapters/terminal-adapter.ts` and register
it in `src/adapters/registry.ts`:

| Method                 | Contract                                                                                                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parse(source)`        | Returns `shared`, `overrides`, the `document` node tree, `unmappedNodeIds`, and parse `issues`. Never throws on bad input; report it as an issue and keep the text as a `malformed` node. |
| `generate(project)`    | Re-emits source from `project.document`, rewriting only nodes whose value changed. Returns `source`, `changedNodeIds`, and `issues`.                                                      |
| `validateInternal`     | Pure checks on the project (value ranges, unsupported combinations, preserved-content warnings).                                                                                          |
| `extractPortable`      | The portable subset plus what was omitted and why (`terminal-specific`, `unsupported`, `invalid`).                                                                                        |
| `createOverrides`      | An empty terminal-specific overrides object.                                                                                                                                              |
| `supportedSharedPaths` | Dot-path leaves of `SharedConfig` this adapter reads and writes natively. Translation uses it to classify each field.                                                                     |

Also add the terminal id to `terminalIdSchema` (`src/domain/shared-config.ts`)
and, for detection and native validation, to `TerminalId` and the path tables
in `src-tauri/src/filesystem/paths.rs`.

## Portable mapping table

Keep one mapping per portable field in `<terminal>-mappings.ts`. A mapping has
a `modelPath`, parses a native value into the shared model, reports whether a
native value already equals the model (so unchanged text is not rewritten), and
serializes a model value back (using the original native text where that keeps
formatting, e.g. color case or units). Document, in the mapping file, which
`SharedConfig` fields have no native equivalent; they simply are not in
`supportedSharedPaths()` and translation reports them as omitted or defaulted.

## Parser node requirements

Every line of input must end up in exactly one `DocumentNode`, in order:

- `comment`, `blank` — kept verbatim.
- `known-setting` — has `key`, `value`, and the `modelPath` it fed; record
  `valueStart` / `valueEnd` when inline text (for example a TOML trailing
  comment) must survive a rewrite.
- `unknown-setting` — a well-formed setting the adapter does not model.
- `include` — an include/import directive. Never follow it; surface it.
- `section` — TOML tables and arrays of tables (`array: true`).
- `malformed` — anything unparsable, with a `reason`.

Each node carries `originalText`, `originalLine`, and a `modified` flag. Add
node ids to `unmappedNodeIds` for anything the visual editor cannot edit, so the
UI shows it read-only and still preserves it.

## Structure-preservation fixtures

Add a representative fixture under `fixtures/<terminal>/` and tests that prove:

1. `generate(parse(source)).source === source` for untouched input (byte for
   byte, including line endings and a missing trailing newline).
2. Changing one recognised setting changes only that line; comments, ordering,
   blank lines, unknown settings, includes, and malformed lines are unchanged.
3. Resetting a recognised setting preserves inline comments and line endings.
4. Duplicate keys, repeated settings, and values with quotes or `#` behave as
   the terminal itself would read them.

Never use a personal config as a fixture.

## Internal validation rules

- Return `error` only for content that would be invalid or unsafe to write.
  Errors block Apply.
- Use `warning` for preserved content the app cannot verify (unknown keys,
  includes) and `info` for neutral notes.
- Reject values that could break out of their line when written verbatim
  (control characters and line breaks in font families are rejected in the
  shared schema for this reason).
- Give every issue a stable `id` and `code`, and a `sourceLine` when known.

## Native validation safety rules

Native validation is implemented once, in `src-tauri/src/process/native_validation.rs`:

- The backend chooses the arguments for each terminal (`validator_args`); the
  frontend and editor text never supply an executable or flags.
- The executable must be the binary found on `PATH` for that terminal and the
  candidate must be a file staged under the app staging directory
  (`commands/validation.rs::check_request`).
- Run without a shell, with stdin closed, a timeout, and capped output.
- If a terminal has no side-effect-free validation mode, report native
  validation as unavailable instead of launching the terminal.

A new adapter that needs native validation adds its argument list there, with a
test that the candidate path is passed as a single argument.

## Required tests for a new adapter

- Parse/generate round trip and single-edit tests with a fixture (above).
- A test per mapping for parse, no-op `matches`, and serialize.
- Internal validation: one passing and one failing case per rule.
- Registry test: `getAdapter(<id>)` returns it.
- Translation tests to and from each existing adapter, covering exact,
  omitted, and defaulted fields.
- A Playwright import-and-edit case alongside `tests/e2e/import-config.spec.ts`.
