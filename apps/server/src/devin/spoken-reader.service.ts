import { Injectable } from "@nestjs/common";
import { ToolContext } from "../gemini/gemini-tool.interface";
import { Dilemma } from "./dilemma-parser.service";

export interface SpokenSection {
  heading: string;
  text: string;
}

export type ReadNavigation =
  "start" | "next" | "repeat" | "previous" | "outline" | number;

export interface ReadResult {
  kind: "outline" | "section" | "end";
  title: string;
  text: string;
  index: number;
  total: number;
  verbatim: true;
}

interface Cursor {
  devinId: string;
  messageKey: string;
  sections: SpokenSection[];
  index: number;
}

interface ReadingState {
  cursor?: Cursor;
  dilemma?: { devinId: string; dilemma: Dilemma };
}

const MAX_SECTION_CHARS = 600;
const OUTLINE_THRESHOLD = 3;
const MAX_CONVERSATIONS = 100;
const CODE_PLACEHOLDER = "There's a code snippet on screen.";

/**
 * Turns Devin's Markdown into short speakable sections and keeps a reading
 * cursor per Puding conversation for "next", "repeat" and "skip to stage 3".
 */
@Injectable()
export class SpokenReader {
  private readonly states = new Map<string, ReadingState>();

  /**
   * Reads a message. A message different from the cursor's resets reading.
   */
  read(
    context: ToolContext | undefined,
    devinId: string,
    message: { text: string; at: number },
    navigate?: ReadNavigation,
  ): ReadResult {
    const state = this.state(context);
    const messageKey = `${devinId}:${message.at}`;
    if (state.cursor?.messageKey !== messageKey) {
      state.cursor = {
        devinId,
        messageKey,
        sections: SpokenReader.toSections(message.text),
        index: -1,
      };
      if (
        navigate !== undefined &&
        navigate !== "outline" &&
        typeof navigate !== "number"
      ) {
        navigate = "start";
      }
    }
    return this.move(state.cursor, navigate);
  }

  /**
   * Continues reading the message the cursor is on, if it belongs to devinId.
   */
  continueReading(
    context: ToolContext | undefined,
    devinId: string,
    navigate: ReadNavigation,
  ): ReadResult | undefined {
    const cursor = this.state(context).cursor;
    if (!cursor || cursor.devinId !== devinId) return undefined;
    return this.move(cursor, navigate);
  }

  rememberDilemma(
    context: ToolContext | undefined,
    devinId: string,
    dilemma: Dilemma,
  ): void {
    this.state(context).dilemma = { devinId, dilemma };
  }

  lastDilemma(
    context: ToolContext | undefined,
    devinId: string,
  ): Dilemma | undefined {
    const remembered = this.state(context).dilemma;
    return remembered?.devinId === devinId ? remembered.dilemma : undefined;
  }

  private move(cursor: Cursor, navigate?: ReadNavigation): ReadResult {
    const total = cursor.sections.length;
    const wantsOutline =
      navigate === "outline" ||
      (navigate === undefined && total > OUTLINE_THRESHOLD) ||
      (navigate === "repeat" && cursor.index < 0 && total > OUTLINE_THRESHOLD);
    if (wantsOutline) {
      cursor.index = -1;
      return SpokenReader.outline(cursor.sections);
    }

    let index: number;
    if (typeof navigate === "number") {
      index = SpokenReader.findSection(cursor.sections, navigate);
    } else if (navigate === "next") {
      index = cursor.index + 1;
    } else if (navigate === "previous") {
      index = Math.max(cursor.index - 1, 0);
    } else if (navigate === "repeat") {
      index = Math.max(cursor.index, 0);
    } else {
      index = 0;
    }

    if (index >= total) {
      cursor.index = total;
      return {
        kind: "end",
        title: "End",
        text: "That was the last part of the message.",
        index: total,
        total,
        verbatim: true,
      };
    }
    cursor.index = index;
    const section = cursor.sections[index];
    return {
      kind: "section",
      title: `${index + 1} of ${total}: ${section.heading}`,
      text: section.text,
      index: index + 1,
      total,
      verbatim: true,
    };
  }

  private static outline(sections: SpokenSection[]): ReadResult {
    const headings = sections.map((s) => s.heading);
    return {
      kind: "outline",
      title: "Outline",
      text: `There are ${sections.length} parts: ${headings.join("; ")}. Want me to go through them?`,
      index: 0,
      total: sections.length,
      verbatim: true,
    };
  }

  /**
   * "Stage 3" maps to a section whose heading mentions that number, else to
   * the third section.
   */
  private static findSection(sections: SpokenSection[], n: number): number {
    const byHeading = sections.findIndex((s) =>
      new RegExp(`^(?:(?:stage|step|phase|part|option)\\s+)?${n}\\b`, "i").test(
        s.heading,
      ),
    );
    if (byHeading >= 0) return byHeading;
    return Math.min(Math.max(n - 1, 0), sections.length);
  }

  /**
   * Splits Markdown into titled, speech-normalised sections.
   */
  public static toSections(markdown: string): SpokenSection[] {
    const blocks = SpokenReader.splitBlocks(markdown);
    const sections: SpokenSection[] = [];
    for (const block of blocks) {
      const text = SpokenReader.normalize(block.body);
      if (!text) continue;
      for (const [i, part] of SpokenReader.splitLong(text).entries()) {
        sections.push({
          heading: i === 0 ? block.heading : `${block.heading}, continued`,
          text: part,
        });
      }
    }
    return sections.length
      ? sections
      : [
          {
            heading: "Message",
            text: SpokenReader.normalize(markdown) || "The message is empty.",
          },
        ];
  }

  private static splitBlocks(
    markdown: string,
  ): { heading: string; body: string }[] {
    const lines = markdown.replace(/\r\n/g, "\n").split("\n");
    let inFence = false;
    const isHeading = (line: string) => !inFence && /^#{1,6}\s+\S/.test(line);
    const isTopItem = (line: string) =>
      !inFence && /^(?:\d+[.)]|[-*+])\s+\S/.test(line);

    const fenceAware = (test: (l: string) => boolean) =>
      lines.map((line) => {
        if (/^\s*```/.test(line)) {
          inFence = !inFence;
          return false;
        }
        return test(line);
      });

    inFence = false;
    const headingMarks = fenceAware(isHeading);
    inFence = false;
    const itemMarks = fenceAware(isTopItem);

    const useHeadings = headingMarks.some(Boolean);
    const marks = useHeadings
      ? headingMarks
      : itemMarks.filter(Boolean).length >= 2
        ? itemMarks
        : lines.map(() => false);

    const blocks: { heading: string; body: string[] }[] = [];
    let current = { heading: "Intro", body: [] as string[] };
    lines.forEach((line, i) => {
      if (marks[i]) {
        if (
          current.body.some((l) => l.trim()) ||
          blocks.length ||
          current.heading !== "Intro"
        ) {
          blocks.push(current);
        }
        const content = line
          .replace(/^#{1,6}\s+/, "")
          .replace(/^(?:\d+[.)]|[-*+])\s+/, "");
        current = useHeadings
          ? { heading: SpokenReader.inline(content), body: [] }
          : { heading: SpokenReader.itemHeading(line), body: [content] };
      } else {
        current.body.push(line);
      }
    });
    blocks.push(current);

    if (!marks.some(Boolean)) blocks[0].heading = "Message";
    return blocks
      .filter((b) => b.body.some((l) => l.trim()))
      .map((b) => ({ heading: b.heading, body: b.body.join("\n") }));
  }

  private static itemHeading(line: string): string {
    const numbered = line.match(/^(\d+)[.)]\s+(.*)$/);
    const content = SpokenReader.inline(
      numbered ? numbered[2] : line.replace(/^[-*+]\s+/, ""),
    );
    const bold = line.match(/\*\*([^*]+)\*\*|__([^_]+)__/);
    const lead = bold
      ? SpokenReader.inline(bold[1] ?? bold[2])
      : content
          .split(/[:.—–]/)[0]
          .split(" ")
          .slice(0, 8)
          .join(" ");
    const cleaned = lead.replace(/[:.]+$/, "").trim();
    return numbered ? `${numbered[1]}. ${cleaned}` : cleaned;
  }

  /**
   * Normalises a Markdown block for speech: no code, URLs, markup or emoji.
   */
  public static normalize(markdown: string): string {
    const out: string[] = [];
    let inFence = false;
    let tableRow = 0;

    for (const rawLine of markdown.split("\n")) {
      if (/^\s*```/.test(rawLine)) {
        if (!inFence) out.push(CODE_PLACEHOLDER);
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;

      const line = rawLine.trim();
      if (/^\|.*\|$/.test(line)) {
        if (/^\|[\s:|-]+\|$/.test(line)) continue;
        tableRow++;
        const cells = line
          .slice(1, -1)
          .split("|")
          .map((c) => SpokenReader.inline(c))
          .filter(Boolean);
        // The first row of a table is its header.
        if (tableRow > 1 && cells.length)
          out.push(SpokenReader.sentence(cells.join(" — ")));
        continue;
      }
      tableRow = 0;
      if (!line || /^([-*_])\1{2,}$/.test(line)) continue;

      const content = SpokenReader.inline(
        line
          .replace(/^#{1,6}\s+/, "")
          .replace(/^>\s*/, "")
          .replace(/^(?:\d+[.)]|[-*+])\s+(\[[ xX]\]\s+)?/, ""),
      );
      if (content) out.push(SpokenReader.sentence(content));
    }
    return out.join(" ").replace(/\s+/g, " ").trim();
  }

  private static inline(text: string): string {
    return text
      .replace(/<[^>]+>/g, "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/`([^`]+)`/g, (_m, code: string) => SpokenReader.speakCode(code))
      .replace(/\*\*|__|~~/g, "")
      .replace(/(^|\W)[*_]([^*_]+)[*_](?=\W|$)/g, "$1$2")
      .replace(/\p{Extended_Pictographic}\uFE0F?/gu, "")
      .replace(/\s+/g, " ")
      .replace(/\s+([.,!?;:])/g, "$1")
      .trim();
  }

  private static speakCode(code: string): string {
    return code
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_./\\:-]+/g, " ")
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  private static sentence(text: string): string {
    return /[.!?:;]$/.test(text) ? text : `${text}.`;
  }

  private static splitLong(text: string): string[] {
    if (text.length <= MAX_SECTION_CHARS) return [text];
    const parts: string[] = [];
    let current = "";
    for (const sentence of text.split(/(?<=[.!?])\s+/)) {
      if (current && current.length + sentence.length + 1 > MAX_SECTION_CHARS) {
        parts.push(current);
        current = sentence;
      } else {
        current = current ? `${current} ${sentence}` : sentence;
      }
    }
    if (current) parts.push(current);
    return parts;
  }

  private state(context: ToolContext | undefined): ReadingState {
    const key = context?.sessionId ?? "default";
    let state = this.states.get(key);
    if (state) this.states.delete(key);
    else state = {};
    this.states.set(key, state);
    if (this.states.size > MAX_CONVERSATIONS) {
      const oldest = this.states.keys().next().value;
      if (oldest !== undefined) this.states.delete(oldest);
    }
    return state;
  }
}
