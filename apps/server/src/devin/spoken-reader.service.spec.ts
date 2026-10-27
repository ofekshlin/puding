import { SpokenReader } from "./spoken-reader.service";

const PLAN = [
  "Here's the plan for dark mode.",
  "",
  "## Stage 1: CSS variables",
  "Move every colour in `globals.css` into custom properties. See [the docs](https://example.com).",
  "```css",
  ":root { --bg: #fff; }",
  "```",
  "## Stage 2: Toggle component",
  "Add a `ThemeToggle` component to the header ✨.",
  "## Stage 3: Persist the choice",
  "| Key | Storage |",
  "| --- | --- |",
  "| theme | localStorage |",
].join("\n");

describe("SpokenReader", () => {
  const ctx = { sessionId: "conv", userId: "u1" };
  let reader: SpokenReader;

  beforeEach(() => {
    reader = new SpokenReader();
  });

  it("splits on headings and normalises code, links, tables and emoji", () => {
    expect(SpokenReader.toSections(PLAN)).toEqual([
      { heading: "Intro", text: "Here's the plan for dark mode." },
      {
        heading: "Stage 1: CSS variables",
        text: "Move every colour in globals css into custom properties. See the docs. There's a code snippet on screen.",
      },
      {
        heading: "Stage 2: Toggle component",
        text: "Add a theme toggle component to the header.",
      },
      { heading: "Stage 3: Persist the choice", text: "theme — localStorage." },
    ]);
  });

  it("splits on top-level list items when there are no headings", () => {
    const sections = SpokenReader.toSections(
      "My plan:\n1. **Add config** for the token\n   with defaults\n2. Wire the gateway\n",
    );
    expect(sections.map((s) => s.heading)).toEqual([
      "Intro",
      "1. Add config",
      "2. Wire the gateway",
    ]);
    expect(sections[1].text).toBe("Add config for the token. with defaults.");
  });

  it("splits long sections at sentence boundaries", () => {
    const long = Array.from(
      { length: 40 },
      (_, i) => `Sentence number ${i}.`,
    ).join(" ");
    const sections = SpokenReader.toSections(long);
    expect(sections.length).toBeGreaterThan(1);
    expect(sections.every((s) => s.text.length <= 600)).toBe(true);
    expect(sections[1].heading).toBe("Message, continued");
  });

  it("starts long messages with an outline, then navigates by voice", () => {
    const message = { text: PLAN, at: 1 };

    const outline = reader.read(ctx, "devin-1", message);
    expect(outline.kind).toBe("outline");
    expect(outline.text).toBe(
      "There are 4 parts: Intro; Stage 1: CSS variables; Stage 2: Toggle component; Stage 3: Persist the choice. Want me to go through them?",
    );

    expect(reader.continueReading(ctx, "devin-1", "next")).toMatchObject({
      kind: "section",
      title: "1 of 4: Intro",
      index: 1,
      verbatim: true,
    });
    expect(reader.continueReading(ctx, "devin-1", 3)?.title).toBe(
      "4 of 4: Stage 3: Persist the choice",
    );
    expect(reader.continueReading(ctx, "devin-1", "previous")?.index).toBe(3);
    expect(reader.continueReading(ctx, "devin-1", "repeat")?.index).toBe(3);
    reader.continueReading(ctx, "devin-1", "next");
    expect(reader.continueReading(ctx, "devin-1", "next")?.kind).toBe("end");
    expect(reader.continueReading(ctx, "devin-2", "next")).toBeUndefined();
  });

  it("reads short messages directly and resets on a new message", () => {
    const first = reader.read(ctx, "devin-1", { text: "Short note.", at: 1 });
    expect(first).toMatchObject({
      kind: "section",
      text: "Short note.",
      total: 1,
    });

    const second = reader.read(
      ctx,
      "devin-1",
      { text: "Another.", at: 2 },
      "next",
    );
    expect(second).toMatchObject({
      kind: "section",
      text: "Another.",
      index: 1,
    });
  });

  it("keeps cursors per conversation", () => {
    reader.read(ctx, "devin-1", { text: PLAN, at: 1 }, "start");
    expect(
      reader.continueReading(
        { sessionId: "other", userId: "u1" },
        "devin-1",
        "next",
      ),
    ).toBeUndefined();
  });
});
