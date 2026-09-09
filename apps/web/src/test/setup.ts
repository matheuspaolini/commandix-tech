import { afterEach, mock } from "bun:test";
import { Window } from "happy-dom";

import { cleanupDom } from "@/shared/test";

const window = new Window({ url: "http://localhost" });

Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLButtonElement: window.HTMLButtonElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLFormElement: window.HTMLFormElement,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
});

afterEach(async () => {
  await cleanupDom();
  mock.restore();
});
