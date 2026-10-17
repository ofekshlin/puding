import { DilemmaParser } from "./dilemma-parser.service";

describe("DilemmaParser", () => {
  const parser = new DilemmaParser();

  it("parses numbered options, the question and the recommended option", () => {
    const dilemma = parser.parse(
      [
        "Should the theme follow the system setting?",
        "",
        "1. Always follow the system.",
        "2. Default to the system but let the user override it, stored in `localStorage`.",
        "",
        "I recommend option 2 because it keeps the toggle meaningful.",
      ].join("\n"),
    );

    expect(dilemma).toEqual({
      question: "Should the theme follow the system setting?",
      options: [
        { label: "1", text: "Always follow the system." },
        {
          label: "2",
          text: "Default to the system but let the user override it, stored in localStorage.",
        },
      ],
      recommendation: {
        label: "2",
        reason: "I recommend option 2 because it keeps the toggle meaningful.",
      },
    });
  });

  it("parses 'Option X:' blocks with bold labels and multi-line text", () => {
    const dilemma = parser.parse(
      [
        "Which database should I use?",
        "**Option A:** Postgres — robust,",
        "  with migrations through Prisma.",
        "**Option B:** SQLite — zero setup.",
        "I'd go with Postgres since you deploy on Render.",
      ].join("\n"),
    );

    expect(dilemma?.options).toEqual([
      {
        label: "A",
        text: "Postgres — robust, with migrations through Prisma.",
      },
      { label: "B", text: "SQLite — zero setup." },
    ]);
    expect(dilemma?.recommendation?.label).toBe("A");
  });

  it("splits 'X or Y?' questions into options", () => {
    const dilemma = parser.parse(
      "Done with the API. Should I use REST or GraphQL?",
    );
    expect(dilemma?.options.map((o) => o.text)).toEqual(["REST", "GraphQL"]);
    expect(dilemma?.recommendation).toBeUndefined();
  });

  it("returns undefined when there is no question with options", () => {
    expect(parser.parse("I opened the PR. All checks pass.")).toBeUndefined();
    expect(parser.parse("What do you think?")).toBeUndefined();
  });

  describe("resolveChoice", () => {
    const dilemma = parser.parse(
      [
        "Which database should I use?",
        "A) Postgres with Prisma",
        "B) SQLite for simplicity",
        "I recommend option B.",
      ].join("\n"),
    )!;

    it.each([
      ["B", "B"],
      ["option a", "A"],
      ["2", "B"],
      ["the second one", "B"],
      ["two", "B"],
      ["first", "A"],
      ["the one you recommended", "B"],
      ["sqlite", "B"],
      [1, "A"],
    ])("%s -> %s", (choice, label) => {
      expect(parser.resolveChoice(dilemma, choice)?.label).toBe(label);
    });

    it("returns undefined for unknown choices", () => {
      expect(parser.resolveChoice(dilemma, "redis")).toBeUndefined();
      expect(parser.resolveChoice(dilemma, "5")).toBeUndefined();
    });
  });
});
