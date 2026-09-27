use std::collections::HashMap;
use std::collections::HashSet;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TerminalId {
    Ghostty,
    Kitty,
    Alacritty,
}

impl TerminalId {
    pub const ALL: [TerminalId; 3] = [
        TerminalId::Ghostty,
        TerminalId::Kitty,
        TerminalId::Alacritty,
    ];

    pub fn binary_name(self) -> &'static str {
        match self {
            TerminalId::Ghostty => "ghostty",
            TerminalId::Kitty => "kitty",
            TerminalId::Alacritty => "alacritty",
        }
    }
}

/// Abstracts process environment lookups so path and binary detection can be
/// tested without mutating the real process environment.
pub trait Environment: Send + Sync {
    fn var(&self, key: &str) -> Option<String>;
}

pub struct SystemEnvironment;

impl Environment for SystemEnvironment {
    fn var(&self, key: &str) -> Option<String> {
        std::env::var(key).ok()
    }
}

#[derive(Debug, Clone, Default)]
pub struct TestEnvironment {
    vars: HashMap<String, String>,
}

impl TestEnvironment {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with(mut self, key: &str, value: &str) -> Self {
        self.vars.insert(key.to_string(), value.to_string());
        self
    }
}

impl Environment for TestEnvironment {
    fn var(&self, key: &str) -> Option<String> {
        self.vars.get(key).cloned()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConfigPathCandidate {
    pub path: PathBuf,
    pub exists: bool,
    pub writable: bool,
    pub is_symlink: bool,
}

fn config_home(env: &dyn Environment) -> Option<PathBuf> {
    env.var("XDG_CONFIG_HOME").map(PathBuf::from).or_else(|| {
        env.var("HOME")
            .map(|home| PathBuf::from(home).join(".config"))
    })
}

pub fn candidate_config_paths(terminal: TerminalId, env: &dyn Environment) -> Vec<PathBuf> {
    let home = env.var("HOME").map(PathBuf::from);
    let config_home = config_home(env);
    let mut paths = Vec::new();

    match terminal {
        TerminalId::Ghostty => {
            if let Some(config_home) = &config_home {
                paths.push(config_home.join("ghostty/config"));
            }
            if let Some(home) = &home {
                paths.push(home.join(".config/ghostty/config"));
            }
        }
        TerminalId::Kitty => {
            if let Some(config_home) = &config_home {
                paths.push(config_home.join("kitty/kitty.conf"));
            }
            if let Some(home) = &home {
                paths.push(home.join(".config/kitty/kitty.conf"));
            }
        }
        TerminalId::Alacritty => {
            if let Some(config_home) = &config_home {
                paths.push(config_home.join("alacritty/alacritty.toml"));
            }
            if let Some(home) = &home {
                paths.push(home.join(".config/alacritty/alacritty.toml"));
                paths.push(home.join(".alacritty.toml"));
            }
        }
    }

    let mut seen = HashSet::new();
    paths.retain(|path| seen.insert(path.clone()));
    paths
}

fn describe_path(path: PathBuf) -> ConfigPathCandidate {
    let is_symlink = std::fs::symlink_metadata(&path)
        .map(|metadata| metadata.file_type().is_symlink())
        .unwrap_or(false);
    let metadata = std::fs::metadata(&path);
    let exists = metadata.is_ok();
    let writable = metadata
        .as_ref()
        .map(|metadata| metadata.permissions().mode() & 0o200 != 0)
        .unwrap_or(false);

    ConfigPathCandidate {
        path,
        exists,
        writable,
        is_symlink,
    }
}

/// Candidate config paths for `terminal`, each annotated with whether it
/// exists, is writable, and is a symlink.
pub fn resolve_config_paths(
    terminal: TerminalId,
    env: &dyn Environment,
) -> Vec<ConfigPathCandidate> {
    candidate_config_paths(terminal, env)
        .into_iter()
        .map(describe_path)
        .collect()
}

fn is_executable_file(path: &Path) -> bool {
    std::fs::metadata(path)
        .map(|metadata| metadata.is_file() && metadata.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

/// Locates an executable named `name` on `PATH` without invoking a shell.
pub fn find_binary(name: &str, env: &dyn Environment) -> Option<PathBuf> {
    let path_var = env.var("PATH")?;
    std::env::split_paths(&path_var).find_map(|dir| {
        let candidate = dir.join(name);
        is_executable_file(&candidate).then_some(candidate)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ghostty_paths_respect_xdg_config_home() {
        let env = TestEnvironment::new()
            .with("HOME", "/home/jamie")
            .with("XDG_CONFIG_HOME", "/mnt/dotfiles/config");

        let paths = candidate_config_paths(TerminalId::Ghostty, &env);

        assert_eq!(
            paths[0],
            PathBuf::from("/mnt/dotfiles/config/ghostty/config")
        );
    }

    #[test]
    fn kitty_paths_fall_back_to_home_config() {
        let env = TestEnvironment::new().with("HOME", "/home/jamie");

        let paths = candidate_config_paths(TerminalId::Kitty, &env);

        assert_eq!(
            paths[0],
            PathBuf::from("/home/jamie/.config/kitty/kitty.conf")
        );
    }

    #[test]
    fn alacritty_paths_include_the_legacy_dotfile_fallback() {
        let env = TestEnvironment::new().with("HOME", "/home/jamie");

        let paths = candidate_config_paths(TerminalId::Alacritty, &env);

        assert!(paths.contains(&PathBuf::from("/home/jamie/.alacritty.toml")));
    }

    #[test]
    fn candidate_paths_are_deduplicated_when_xdg_config_home_is_unset() {
        let env = TestEnvironment::new().with("HOME", "/home/jamie");

        let paths = candidate_config_paths(TerminalId::Kitty, &env);

        assert_eq!(paths.len(), 1);
    }

    #[test]
    fn resolve_config_paths_reports_existence_for_a_real_file() {
        let dir = tempfile::tempdir().unwrap();
        let config_dir = dir.path().join("kitty");
        std::fs::create_dir_all(&config_dir).unwrap();
        std::fs::write(config_dir.join("kitty.conf"), "font_size 13\n").unwrap();

        let env = TestEnvironment::new().with("XDG_CONFIG_HOME", dir.path().to_str().unwrap());

        let candidates = resolve_config_paths(TerminalId::Kitty, &env);

        assert!(candidates[0].exists);
        assert!(candidates[0].writable);
        assert!(!candidates[0].is_symlink);
    }

    #[test]
    fn resolve_config_paths_reports_a_missing_file_as_absent() {
        let dir = tempfile::tempdir().unwrap();
        let env = TestEnvironment::new().with("XDG_CONFIG_HOME", dir.path().to_str().unwrap());

        let candidates = resolve_config_paths(TerminalId::Ghostty, &env);

        assert!(!candidates[0].exists);
    }

    #[test]
    fn find_binary_locates_an_executable_on_the_path() {
        let dir = tempfile::tempdir().unwrap();
        let binary_path = dir.path().join("kitty");
        std::fs::write(&binary_path, "#!/bin/sh\n").unwrap();
        let mut permissions = std::fs::metadata(&binary_path).unwrap().permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(&binary_path, permissions).unwrap();

        let env = TestEnvironment::new().with("PATH", dir.path().to_str().unwrap());

        assert_eq!(find_binary("kitty", &env), Some(binary_path));
    }

    #[test]
    fn find_binary_returns_none_when_not_on_the_path() {
        let dir = tempfile::tempdir().unwrap();
        let env = TestEnvironment::new().with("PATH", dir.path().to_str().unwrap());

        assert_eq!(find_binary("kitty", &env), None);
    }

    #[test]
    fn find_binary_returns_none_when_path_is_unset() {
        let env = TestEnvironment::new();

        assert_eq!(find_binary("kitty", &env), None);
    }
}
