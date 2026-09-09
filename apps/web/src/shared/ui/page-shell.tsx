import type { PropsWithChildren } from "react";

export function PageShell({ children }: PropsWithChildren) {
  return (
    <>
      <header>
        <a href="/" aria-label="Commandix home">
          Commandix
        </a>
        <span>Contract workspace</span>
      </header>
      {children}
      <footer>Commandix</footer>
    </>
  );
}
