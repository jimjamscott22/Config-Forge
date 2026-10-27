# Recovery

Config Forge never replaces a config without a backup of the previous file, and
it keeps your project history. This page covers the common recovery paths.

All paths below are relative to the app-data directory, normally
`~/.local/share/com.configforge.desktop/`.

## Undo an apply

Every Apply to an existing file first copies it to
`backups/<terminal>/<project-id>/<timestamp>-<id>-<filename>.bak`. The Apply
result shows the exact backup path.

```bash
cp ~/.local/share/com.configforge.desktop/backups/ghostty/<project-id>/<backup>.bak \
   ~/.config/ghostty/config
```

Applying to a path that did not exist creates no backup (there was nothing to
keep); delete the new file to undo.

## Roll back a project

Open the project, then use **History** in the Studio. Automatic snapshots are
taken before an apply, a restore, and a translation (the newest 20 per project
are kept). Named snapshots are never pruned (there is no project deletion yet). Restoring first snapshots the
current state, so a restore can itself be undone.

## Apply was refused

| Message                                               | Meaning and fix                                                                        |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `destination changed since confirmation`              | The file was edited after you reviewed the diff. Nothing was written; review again.    |
| `refusing to write through symlink` / "symbolic link" | The path is a symlink (often a dotfiles manager). Point Config Forge at the real file. |
| `parent directory does not exist`                     | Create the directory first.                                                            |
| Validation errors listed under the Apply panel        | Fix them in the Studio; blocked applies write nothing.                                 |

A failed write leaves the original file untouched; the only artifact that can
remain is a hidden `.<name>.<id>.cfgforge-tmp` file next to the destination,
which is safe to delete.

## Startup problems

If the app reports a startup or migration error it did not change anything:
the database was not opened for use. Back up and inspect the data directory
before retrying:

```bash
cp -r ~/.local/share/com.configforge.desktop ~/config-forge-data-backup
```

`config-forge.sqlite3` is an ordinary SQLite database (WAL mode, so copy the
`-wal` and `-shm` files with it). Removing the data directory resets the app
but also deletes projects, snapshots, personal templates, and **backups**, so
copy the `backups/` directory out first.

## Leftover files

Native validation briefly writes a hidden `.<name>.<id>.cfgforge-validate` file
next to the destination and removes it afterwards. If the app is killed
mid-validation one can remain; it is safe to delete. `exports/` holds files you
exported. Neither is needed for recovery.
