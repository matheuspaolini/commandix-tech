import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

const roots = new Set<Root>();

export async function render(ui: ReactNode): Promise<HTMLDivElement> {
  const container = document.createElement("div");
  const root = createRoot(container);

  document.body.replaceChildren(container);
  roots.add(root);
  await act(async () => root.render(ui));

  return container;
}

export function setInputValue(id: string, value: string): void {
  const element = getInput(id);

  element.value = value;
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

export function getInput(id: string): HTMLInputElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLInputElement)) throw new Error(`Missing #${id}`);
  return element;
}

export function getSubmitButton(): HTMLButtonElement {
  const element = document.querySelector("button[type=submit]");
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error("Submit button was not found");
  }
  return element;
}

export async function submitForm(form?: HTMLFormElement): Promise<void> {
  const target = form ?? document.querySelector("form");

  if (!(target instanceof HTMLFormElement)) {
    throw new Error("Form was not found");
  }

  await act(async () => {
    target.requestSubmit();
    await Promise.resolve();
  });
}

export async function cleanupDom(): Promise<void> {
  await act(async () => {
    for (const root of roots) root.unmount();
  });
  roots.clear();
  document.body.replaceChildren();
}
