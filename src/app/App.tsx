const supportedTerminals = [
  { name: "Ghostty", format: "key/value" },
  { name: "Kitty", format: "directives" },
  { name: "Alacritty", format: "TOML" },
] as const;

export function App() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Config Forge home">
          <span className="brand-mark" aria-hidden="true">
            CF
          </span>
          <span>Config Forge</span>
        </a>
        <p className="local-status">
          <span aria-hidden="true" />
          Local-only workspace
        </p>
      </header>

      <section className="welcome" aria-labelledby="app-title">
        <div className="welcome-copy">
          <p className="eyebrow">Terminal configuration studio</p>
          <h1 id="app-title">Config Forge</h1>
          <p className="lede">
            Shape terminal settings visually, keep the source legible, and apply
            every change with a clear path back.
          </p>

          <div className="foundation-note">
            <span className="foundation-index">01</span>
            <div>
              <strong>Foundation initialized</strong>
              <p>
                The local application shell and portable configuration model are
                ready for the first terminal adapter.
              </p>
            </div>
          </div>
        </div>

        <aside className="terminal-panel" aria-label="Supported terminals">
          <div className="panel-heading">
            <p>v1 targets</p>
            <span>3 formats</span>
          </div>
          <ul className="terminal-list">
            {supportedTerminals.map((terminal, index) => (
              <li key={terminal.name}>
                <span className="terminal-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <strong>{terminal.name}</strong>
                  <span>{terminal.format}</span>
                </div>
                <span className="terminal-state">Planned</span>
              </li>
            ))}
          </ul>
          <p className="safety-line">Preview, validate, back up, then write.</p>
        </aside>
      </section>
    </main>
  );
}
