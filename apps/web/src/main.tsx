import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import "./style.css";
import { Workspace } from "./workspace";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Workspace />
    </BrowserRouter>
  </StrictMode>,
);
