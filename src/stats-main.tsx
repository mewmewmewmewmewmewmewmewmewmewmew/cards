import React from "react";
import "./ds.css";
import "./app.css";
import ReactDOM from "react-dom/client";
import StatsPage from "./StatsPage";

/** If the page ever fails to draw, say so (with the error) instead of leaving it blank. */
class Crash extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24, boxSizing: "border-box", background: "#101010", color: "#ddd", fontFamily: "ui-monospace, monospace", fontSize: 13, textAlign: "center" }}>
        <div>Something went wrong drawing this page.</div>
        <div style={{ color: "#cb97a5", maxWidth: 640, overflowWrap: "anywhere" }}>{String(this.state.error.message || this.state.error)}</div>
        <button type="button" onClick={() => location.reload()} style={{ padding: "6px 14px", cursor: "pointer", background: "#FF4D9D", border: "none", borderRadius: 4, color: "#141414", fontFamily: "inherit" }}>Reload</button>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Crash>
      <StatsPage />
    </Crash>
  </React.StrictMode>
);
