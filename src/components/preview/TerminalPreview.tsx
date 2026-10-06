import type { SharedConfig, TerminalId } from "../../domain/shared-config";
import { buildPreviewModel } from "./preview-model";

export function TerminalPreview({
  shared,
  terminal,
}: {
  shared: SharedConfig;
  terminal?: TerminalId;
}) {
  const model = buildPreviewModel(shared, terminal);
  return (
    <div className="terminal-preview">
      <div className="workspace-heading">
        <h2>Terminal preview</h2>
        <span>Mock · no commands run</span>
      </div>
      <div className="preview-checkerboard">
        <div
          className="preview-terminal"
          style={model.style}
          data-decorations={model.decorations}
          aria-label="Mock terminal"
        >
          {model.decorations !== "none" ? (
            <div className="preview-titlebar">
              <span aria-hidden="true">● ● ●</span>
              <span>forge — ~/projects</span>
            </div>
          ) : null}
          <div className="preview-tabstrip" aria-label="Sample terminal tabs">
            <span>1 · shell</span>
            <span>2 · notes</span>
          </div>
          <div className="preview-lines">
            {model.scrollbackLines !== 0 ? (
              <div className="preview-history">
                Last login: today · a fresh workspace
              </div>
            ) : null}
            <p>
              <span className="preview-prompt">~/projects</span>{" "}
              <span className="preview-branch">git:(main)</span> $ git status
            </p>
            <p>
              On branch <strong>main</strong>
              <br />
              Working tree clean.
            </p>
            <p>
              <span className="preview-prompt">~/projects</span> $ ls
              <br />
              documents/ &nbsp; notes.md &nbsp; config/
            </p>
            <p>
              <strong>Bold text</strong> · <em>Italic text</em> ·{" "}
              <strong>
                <em>Both styles</em>
              </strong>
            </p>
            <p>
              <span className="preview-selection">
                Selected text looks like this.
              </span>
            </p>
            <div className="preview-palette" aria-label="ANSI color palette">
              {model.palette.map((color) => (
                <span
                  key={color.name}
                  style={{ backgroundColor: color.color }}
                  title={`${color.name}: ${color.color}`}
                  aria-label={`${color.name}: ${color.color}`}
                />
              ))}
            </div>
            <p className="preview-last-line">
              <span className="preview-prompt">~/projects</span> ${" "}
              <span
                className={`preview-cursor cursor-${model.cursorShape}${model.cursorBlink ? " cursor-blink" : ""}`}
                aria-label={`${model.cursorShape} cursor`}
              >
                <span>{model.cursorShape === "block" ? " " : ""}</span>
              </span>
            </p>
          </div>
        </div>
      </div>
      <p className="preview-note">
        An illustrative sample, not an embedded terminal. Unset values use
        preview defaults; your terminal’s defaults may differ. Fonts must be
        installed locally. Opacity is simulated over the checkerboard.
      </p>
    </div>
  );
}
