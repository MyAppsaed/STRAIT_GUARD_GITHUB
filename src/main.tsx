import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import StraitGuardGame from "@/game/StraitGuardGame";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StraitGuardGame />
  </StrictMode>,
);
