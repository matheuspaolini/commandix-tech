import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

function Workspace() {
  const [status, setStatus] = useState("Checking connection…");
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    fetch("/api/health", { signal: controller.signal })
      .then((response) => {
        setStatus(
          response.ok
            ? "Workspace connected"
            : "Workspace unavailable. Refresh to check again.",
        );
      })
      .catch(() => setStatus("Connection unavailable. Refresh to try again."))
      .finally(() => clearTimeout(timer));
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);
  return (
    <>
      <header>
        <a href="/" aria-label="Commandix home">
          Commandix
        </a>
        <span>Contract workspace</span>
      </header>
      <main>
        <h1>A place for your contracts.</h1>
        <p className="intro">
          Your company’s documents, their definitions, and the record of every
          change.
        </p>
        <section aria-labelledby="workspace-heading">
          <h2 id="workspace-heading">The workspace is taking shape</h2>
          <p>Contract tools will appear here as they become available.</p>
          <p className="status" role="status">
            {status}
          </p>
        </section>
      </main>
      <footer>Commandix</footer>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Workspace />
  </StrictMode>,
);
