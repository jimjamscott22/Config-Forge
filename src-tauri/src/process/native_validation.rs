use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use tokio::io::{AsyncRead, AsyncReadExt};
use tokio::process::Command;
use tokio::time::timeout;

use crate::error::AppError;
use crate::filesystem::paths::{self, TerminalId};

const MAX_CAPTURED_OUTPUT_BYTES: usize = 64 * 1024;
const DEFAULT_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ValidationSeverity {
    Error,
    Warning,
    Info,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationIssue {
    pub id: String,
    pub severity: ValidationSeverity,
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_line: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationResult {
    pub valid: bool,
    pub native_available: bool,
    pub issues: Vec<ValidationIssue>,
}

/// A fixed, backend-chosen invocation for validating one terminal's config.
/// `executable` and `args` never come from untrusted editor text: the
/// executable is a real file the backend already found on `PATH`, and the
/// arguments are chosen here from `terminal` alone.
pub struct NativeValidatorSpec {
    pub terminal: TerminalId,
    pub executable: PathBuf,
    pub args: Vec<OsString>,
    pub timeout: Duration,
}

fn validator_args(terminal: TerminalId, candidate_path: &Path) -> Vec<OsString> {
    match terminal {
        TerminalId::Ghostty => vec![
            OsString::from("+validate-config"),
            OsString::from("--config-file"),
            candidate_path.as_os_str().to_owned(),
        ],
        TerminalId::Kitty => vec![
            OsString::from("--config"),
            candidate_path.as_os_str().to_owned(),
            OsString::from("--debug-config"),
        ],
        TerminalId::Alacritty => vec![
            OsString::from("--config-file"),
            candidate_path.as_os_str().to_owned(),
            OsString::from("--print-events"),
        ],
    }
}

pub fn build_validator_spec(
    terminal: TerminalId,
    executable: &Path,
    candidate_path: &Path,
) -> NativeValidatorSpec {
    NativeValidatorSpec {
        terminal,
        executable: executable.to_path_buf(),
        args: validator_args(terminal, candidate_path),
        timeout: DEFAULT_TIMEOUT,
    }
}

struct ProcessOutcome {
    success: bool,
    exit_code: Option<i32>,
    stdout: String,
    stderr: String,
}

async fn read_capped<R>(mut reader: R) -> Vec<u8>
where
    R: AsyncRead + Unpin,
{
    let mut buffer = Vec::new();
    let mut chunk = [0u8; 4096];

    loop {
        let read = match reader.read(&mut chunk).await {
            Ok(0) | Err(_) => break,
            Ok(read) => read,
        };

        let remaining = MAX_CAPTURED_OUTPUT_BYTES.saturating_sub(buffer.len());
        let take = read.min(remaining);
        buffer.extend_from_slice(&chunk[..take]);

        if buffer.len() >= MAX_CAPTURED_OUTPUT_BYTES {
            break;
        }
    }

    buffer
}

fn launch_failed(spec: &NativeValidatorSpec, reason: impl std::fmt::Display) -> AppError {
    AppError::NativeValidationFailed {
        terminal: spec.terminal.binary_name().to_string(),
        reason: reason.to_string(),
    }
}

async fn run_native_validation(spec: &NativeValidatorSpec) -> Result<ProcessOutcome, AppError> {
    let mut command = Command::new(&spec.executable);
    command
        .args(&spec.args)
        .kill_on_drop(true)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command
        .spawn()
        .map_err(|source| launch_failed(spec, source))?;
    let stdout = child.stdout.take().expect("stdout was piped");
    let stderr = child.stderr.take().expect("stderr was piped");

    let stdout_task = tokio::spawn(read_capped(stdout));
    let stderr_task = tokio::spawn(read_capped(stderr));

    let status = match timeout(spec.timeout, child.wait()).await {
        Ok(status) => status.map_err(|source| launch_failed(spec, source))?,
        Err(_) => {
            let _ = child.kill().await;
            return Err(launch_failed(
                spec,
                format!("timed out after {:?}", spec.timeout),
            ));
        }
    };

    let stdout_bytes = stdout_task.await.unwrap_or_default();
    let stderr_bytes = stderr_task.await.unwrap_or_default();

    Ok(ProcessOutcome {
        success: status.success(),
        exit_code: status.code(),
        stdout: String::from_utf8_lossy(&stdout_bytes).into_owned(),
        stderr: String::from_utf8_lossy(&stderr_bytes).into_owned(),
    })
}

fn unavailable_result(terminal: TerminalId) -> ValidationResult {
    ValidationResult {
        valid: true,
        native_available: false,
        issues: vec![ValidationIssue {
            id: "native:unavailable".to_string(),
            severity: ValidationSeverity::Info,
            code: "NATIVE_VALIDATION_UNAVAILABLE".to_string(),
            message: format!(
                "No safe native validator is available for {}.",
                terminal.binary_name()
            ),
            model_path: None,
            source_line: None,
        }],
    }
}

fn failure_result(outcome: &ProcessOutcome) -> ValidationResult {
    let exit_description = match outcome.exit_code {
        Some(code) => format!("exit code {code}"),
        None => "an unknown signal".to_string(),
    };
    let detail = if outcome.stderr.trim().is_empty() {
        outcome.stdout.trim()
    } else {
        outcome.stderr.trim()
    };

    ValidationResult {
        valid: false,
        native_available: true,
        issues: vec![ValidationIssue {
            id: "native:exit-code".to_string(),
            severity: ValidationSeverity::Error,
            code: "NATIVE_VALIDATION_FAILED".to_string(),
            message: format!("Native validation failed with {exit_description}: {detail}"),
            model_path: None,
            source_line: None,
        }],
    }
}

/// Validates the config at `candidate_path` by running the terminal's own
/// binary against it. `binary_path` is treated as untrusted: it is only
/// executed once confirmed to be a real, executable file, never passed
/// through a shell.
pub async fn validate_candidate(
    terminal: TerminalId,
    binary_path: &Path,
    candidate_path: &Path,
) -> Result<ValidationResult, AppError> {
    if !paths::is_executable_file(binary_path) {
        return Ok(unavailable_result(terminal));
    }

    let spec = build_validator_spec(terminal, binary_path, candidate_path);
    let outcome = run_native_validation(&spec).await?;

    if outcome.success {
        return Ok(ValidationResult {
            valid: true,
            native_available: true,
            issues: vec![],
        });
    }

    Ok(failure_result(&outcome))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    fn write_script(dir: &Path, name: &str, contents: &str) -> PathBuf {
        let path = dir.join(name);
        std::fs::write(&path, contents).unwrap();
        let mut permissions = std::fs::metadata(&path).unwrap().permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(&path, permissions).unwrap();
        path
    }

    #[tokio::test]
    async fn reports_unavailable_when_the_binary_path_is_not_executable() {
        let dir = tempfile::tempdir().unwrap();
        let binary_path = dir.path().join("not-a-binary");
        std::fs::write(&binary_path, "not executable").unwrap();
        let candidate_path = dir.path().join("candidate.conf");

        let result = validate_candidate(TerminalId::Kitty, &binary_path, &candidate_path)
            .await
            .unwrap();

        assert!(result.valid);
        assert!(!result.native_available);
        assert_eq!(result.issues[0].code, "NATIVE_VALIDATION_UNAVAILABLE");
    }

    #[tokio::test]
    async fn reports_success_for_a_zero_exit() {
        let dir = tempfile::tempdir().unwrap();
        let binary_path = write_script(dir.path(), "kitty", "#!/bin/sh\nexit 0\n");
        let candidate_path = dir.path().join("candidate.conf");

        let result = validate_candidate(TerminalId::Kitty, &binary_path, &candidate_path)
            .await
            .unwrap();

        assert!(result.valid);
        assert!(result.native_available);
        assert!(result.issues.is_empty());
    }

    #[tokio::test]
    async fn reports_a_structured_issue_for_a_non_zero_exit() {
        let dir = tempfile::tempdir().unwrap();
        let binary_path = write_script(
            dir.path(),
            "kitty",
            "#!/bin/sh\necho 'bad setting on line 3' >&2\nexit 1\n",
        );
        let candidate_path = dir.path().join("candidate.conf");

        let result = validate_candidate(TerminalId::Kitty, &binary_path, &candidate_path)
            .await
            .unwrap();

        assert!(!result.valid);
        assert!(result.native_available);
        assert_eq!(result.issues[0].code, "NATIVE_VALIDATION_FAILED");
        assert!(result.issues[0].message.contains("bad setting on line 3"));
    }

    #[tokio::test]
    async fn kills_a_validator_that_exceeds_its_timeout() {
        let dir = tempfile::tempdir().unwrap();
        let binary_path = write_script(dir.path(), "kitty", "#!/bin/sh\nsleep 2\nexit 0\n");

        let spec = NativeValidatorSpec {
            terminal: TerminalId::Kitty,
            executable: binary_path,
            args: vec![],
            timeout: Duration::from_millis(50),
        };

        let result = run_native_validation(&spec).await;

        assert!(matches!(
            result,
            Err(AppError::NativeValidationFailed { .. })
        ));
    }

    #[tokio::test]
    async fn caps_captured_output_at_64_kib() {
        let dir = tempfile::tempdir().unwrap();
        let binary_path = write_script(
            dir.path(),
            "kitty",
            "#!/bin/sh\nhead -c 200000 /dev/zero | tr '\\0' 'a'\nexit 1\n",
        );

        let spec = NativeValidatorSpec {
            terminal: TerminalId::Kitty,
            executable: binary_path,
            args: vec![],
            timeout: Duration::from_secs(5),
        };

        let outcome = run_native_validation(&spec).await.unwrap();

        assert!(outcome.stdout.len() <= MAX_CAPTURED_OUTPUT_BYTES);
    }
}
