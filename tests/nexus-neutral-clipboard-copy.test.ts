// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  NEUTRAL_COPY_STYLE,
  NEXUS_NEUTRAL_COPY_ATTR,
  buildNeutralCopyHtml,
  handleNeutralCopyEvent,
  selectionIntersectsNeutralCopyRoot,
} from "@/lib/nexus/neutralClipboardCopy";

const ROOT = path.resolve(import.meta.dirname, "..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("neutral clipboard copy helper", () => {
  it("strips theme classes/styles and forces black-on-white HTML", () => {
    const source = document.createElement("div");
    source.innerHTML =
      '<p class="nexus-markdown-p" style="color:blue;background:#111">Hello <strong style="color:cyan">world</strong></p>';

    const html = buildNeutralCopyHtml(source);
    expect(html).toContain(NEUTRAL_COPY_STYLE);
    expect(html).toContain("Hello");
    expect(html).toContain("world");
    expect(html).not.toContain("nexus-markdown-p");
    expect(html).not.toContain("color:blue");
    expect(html).not.toContain("color:cyan");
    expect(html).not.toContain("background:#111");
  });

  it("detects selection only inside marked neutral-copy roots", () => {
    document.body.innerHTML = `
      <div id="outside">Outside</div>
      <div ${NEXUS_NEUTRAL_COPY_ATTR} id="inside">Answer text</div>
    `;
    const inside = document.getElementById("inside")!;
    const outside = document.getElementById("outside")!;
    const selection = window.getSelection()!;

    selection.removeAllRanges();
    const outsideRange = document.createRange();
    outsideRange.selectNodeContents(outside);
    selection.addRange(outsideRange);
    expect(selectionIntersectsNeutralCopyRoot(selection)).toBe(false);

    selection.removeAllRanges();
    const insideRange = document.createRange();
    insideRange.selectNodeContents(inside);
    selection.addRange(insideRange);
    expect(selectionIntersectsNeutralCopyRoot(selection)).toBe(true);
    expect(selectionIntersectsNeutralCopyRoot(selection, inside)).toBe(true);
    expect(selectionIntersectsNeutralCopyRoot(selection, outside)).toBe(false);
  });

  it("rewrites clipboard payload on copy from a marked root", () => {
    document.body.innerHTML = `
      <div ${NEXUS_NEUTRAL_COPY_ATTR} id="answer">
        <span class="themed" style="color:#0af">Paste me</span>
      </div>
    `;
    const answer = document.getElementById("answer")!;
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(answer);
    selection.addRange(range);

    const store: Record<string, string> = {};
    const event = new Event("copy", { cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", {
      value: {
        setData: (type: string, value: string) => {
          store[type] = value;
        },
      },
    });
    const preventDefault = vi.spyOn(event, "preventDefault");

    expect(handleNeutralCopyEvent(event, answer)).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
    expect(store["text/plain"]).toContain("Paste me");
    expect(store["text/html"]).toContain(NEUTRAL_COPY_STYLE);
    expect(store["text/html"]).not.toContain("themed");
    expect(store["text/html"]).not.toContain("#0af");
  });

  it("leaves unmarked selections alone", () => {
    document.body.innerHTML = `<div id="chrome">Nav label</div>`;
    const chrome = document.getElementById("chrome")!;
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(chrome);
    selection.addRange(range);

    const event = new Event("copy", { cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", {
      value: { setData: vi.fn() },
    });
    expect(handleNeutralCopyEvent(event)).toBe(false);
  });
});

describe("neutral clipboard wiring", () => {
  it("attaches NeutralCopyRoot on Chat, Deep Research, Tasks, and Calendar answer surfaces", () => {
    expect(read("components/chat/AnswerPanel.tsx")).toContain("NeutralCopyRoot");
    expect(read("components/chat/TranscriptMessage.tsx")).toContain("NeutralCopyRoot");
    expect(read("components/workspace/port/ResearchWorkspace.tsx")).toContain(
      "NeutralCopyRoot",
    );
    expect(read("components/workspace/port/MyTasksPanel.tsx")).toContain("NeutralCopyRoot");
    expect(read("components/workspace/port/CalendarEventDialog.tsx")).toContain(
      "NeutralCopyRoot",
    );
  });
});
