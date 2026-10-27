# Third-party notices

Config Forge is licensed GPL-3.0-only (see `LICENSE`). It ships with the open
source components below; each remains under its own license. This list covers
direct dependencies. For the complete transitive set, run `npm ls --all` and
`cargo tree --manifest-path src-tauri/Cargo.toml`, and consult each package's
license file.

Built-in templates are original to this project and carry no third-party
palettes or attribution.

## JavaScript (bundled into the frontend)

| Package                  | License           |
| ------------------------ | ----------------- |
| @codemirror/language     | MIT               |
| @codemirror/legacy-modes | MIT               |
| @codemirror/state        | MIT               |
| @codemirror/view         | MIT               |
| @iarna/toml              | ISC               |
| @tauri-apps/api          | Apache-2.0 OR MIT |
| diff (jsdiff)            | BSD-3-Clause      |
| react, react-dom         | MIT               |
| zod                      | MIT               |
| zustand                  | MIT               |

## Rust (linked into the desktop binary)

| Crate                 | License           |
| --------------------- | ----------------- |
| tauri, tauri-plugin-* | Apache-2.0 OR MIT |
| sqlx (SQLite)         | MIT OR Apache-2.0 |
| tokio                 | MIT               |
| serde, serde_json     | MIT OR Apache-2.0 |
| chrono                | MIT OR Apache-2.0 |
| sha2, hex             | MIT OR Apache-2.0 |
| uuid                  | Apache-2.0 OR MIT |
| thiserror             | MIT OR Apache-2.0 |
| tempfile              | MIT OR Apache-2.0 |

SQLite itself is in the public domain. The desktop shell renders with
WebKitGTK (LGPL-2.1+); the Debian package depends on the system copy.
