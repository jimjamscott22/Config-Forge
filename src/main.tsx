import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/editor.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Config Forge could not find the application root");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
