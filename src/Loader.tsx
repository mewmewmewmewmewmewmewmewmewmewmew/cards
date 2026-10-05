import React from "react";
import * as D from "./mew-data";

/**
 * The mew.cards loading screen (same as the catalog's): the swirl behind a faint Mew logo,
 * with a solid logo filling up from the bottom as `progress` (0–100) grows. Anything passed as
 * children (the password field) sits below the logo.
 */
const swirlDelay = `${-((Date.now() % 5000) / 1000)}s`; // keeps the swirl continuous across screens

const Loader: React.FC<{ theme?: string; progress?: number; children?: React.ReactNode }> = ({ theme = "dark", progress = 0, children }) => (
  <div data-theme={theme} style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16, boxSizing: "border-box", background: theme === "dark" ? "#101010" : "var(--surface-page)" }}>
    <div style={{ position: "relative", width: 112, height: 112, flex: "0 0 auto" }}>
      <div className="loading-swirl" aria-hidden="true" style={{ position: "absolute", inset: 0, animationDelay: swirlDelay }} />
      <img src="/assets/mew-logo.png" alt="Loading..." style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.25 }} />
      <img src="/assets/mew-logo.png" alt="" aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", transition: "clip-path 300ms linear", clipPath: `inset(${100 - Math.max(0, Math.min(100, progress))}% 0 0 0)` }} />
    </div>
    {children}
    <div style={{ position: "absolute", bottom: 16, left: 0, right: 0, textAlign: "center", fontFamily: "var(--font-data)", fontSize: 10, fontWeight: 600, color: "rgba(203, 151, 165, 0.8)" }}>v{D.APP_VERSION}</div>
  </div>
);

export default Loader;
