import { Injectable } from "@nestjs/common";

export interface DilemmaOption {
  label: string;
  text: string;
}

export interface Dilemma {
  question: string;
  options: DilemmaOption[];
  recommendation?: { label?: string; reason: string };
}

const OPTION_LINE =
  /^\s*(?:[-*+]\s+)?(?:\*\*|__)?(?:option\s+)?([0-9]{1,2}|[A-Ha-h])(?:\*\*|__)?\s*[.):\]]\s*(?:\*\*|__)?\s*(.+)$/i;
const OPTION_HEADING =
  /^\s*(?:#{1,6}\s*)?(?:\*\*|__)?option\s+([0-9]{1,2}|[A-Ha-h])\b\s*[:.)\-–—]?\s*(.*)$/i;
const RECOMMEND = /\b(recommend|suggest|i'd go with|i would go with|prefer)\b/i;
const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  first: 1,
  two: 2,
  second: 2,
  three: 3,
  third: 3,
  four: 4,
  fourth: 4,
  five: 5,
  fifth: 5,
  six: 6,
  sixth: 6,
};

/**
 * Extracts a question, its full options and Devin's recommendation from a
 * Devin message so Puding can read every option word for word.
 */
@Injectable()
export class DilemmaParser {
  parse(markdown: string): Dilemma | undefined {
    const text = markdown.replace(/```[\s\S]*?```/g, "").trim();
    if (!text) return undefined;

    const lines = text.split("\n");
    const options: DilemmaOption[] = [];
    const leadIn: string[] = [];
    const trailing: string[] = [];
    let current: DilemmaOption | undefined;

    for (const line of lines) {
      const match = line.match(OPTION_HEADING) ?? line.match(OPTION_LINE);
      if (match) {
        current = {
          label: match[1].toUpperCase(),
          text: DilemmaParser.clean(match[2]),
        };
        options.push(current);
        continue;
      }
      if (current && /^\s{2,}\S/.test(line)) {
        current.text = `${current.text} ${DilemmaParser.clean(line)}`.trim();
        continue;
      }
      if (current && line.trim() && options.length && !RECOMMEND.test(line)) {
        // Unindented prose right under an option heading belongs to it.
        if (!current.text) {
          current.text = DilemmaParser.clean(line);
          continue;
        }
      }
      if (line.trim()) (options.length ? trailing : leadIn).push(line.trim());
      if (!line.trim()) current = current?.text ? undefined : current;
    }

    const prose = [...leadIn, ...trailing].map(DilemmaParser.clean);
    const question =
      DilemmaParser.lastQuestion(prose.join(" ")) ??
      (leadIn.length ? DilemmaParser.clean(leadIn.join(" ")) : undefined);

    let parsedOptions = options.filter((o) => o.text);
    if (parsedOptions.length < 2 && question) {
      parsedOptions = DilemmaParser.splitOrQuestion(question);
    }
    if (!question || parsedOptions.length < 2) return undefined;

    return {
      question,
      options: parsedOptions,
      ...DilemmaParser.recommendation(prose, parsedOptions),
    };
  }

  /**
   * Resolves a spoken choice ("2", "two", "B", "option b", "the one you
   * recommended", or words from an option) to one of the dilemma's options.
   */
  resolveChoice(
    dilemma: Dilemma,
    choice: string | number,
  ): DilemmaOption | undefined {
    const raw = String(choice).trim().toLowerCase();
    if (!raw) return undefined;

    if (/recommend|suggest|your (pick|choice)/.test(raw)) {
      const label = dilemma.recommendation?.label;
      return label ? dilemma.options.find((o) => o.label === label) : undefined;
    }

    const labelMatch = raw.match(
      /^(?:option |the |number |choice )?([0-9]{1,2}|[a-h]|[a-z]+)(?:st|nd|rd|th)?(?: one| option)?$/,
    );
    if (labelMatch) {
      const token = labelMatch[1];
      const byLabel = dilemma.options.find(
        (o) => o.label.toLowerCase() === token,
      );
      if (byLabel) return byLabel;
      const index = /^\d+$/.test(token)
        ? parseInt(token, 10)
        : NUMBER_WORDS[token];
      if (index && dilemma.options[index - 1])
        return dilemma.options[index - 1];
    }

    const words = raw.split(/[^a-z0-9]+/).filter((w) => w.length > 2);
    if (!words.length) return undefined;
    const scored = dilemma.options
      .map((option) => {
        const text = option.text.toLowerCase();
        return { option, hits: words.filter((w) => text.includes(w)).length };
      })
      .filter((s) => s.hits > 0)
      .sort((a, b) => b.hits - a.hits);
    if (
      scored.length &&
      (scored.length === 1 || scored[0].hits > scored[1].hits)
    ) {
      return scored[0].option;
    }
    return undefined;
  }

  private static recommendation(
    prose: string[],
    options: DilemmaOption[],
  ): Pick<Dilemma, "recommendation"> {
    const sentence = prose
      .join(" ")
      .split(/(?<=[.!?])\s+/)
      .find((s) => RECOMMEND.test(s));
    if (!sentence) return {};
    const labelMatch = sentence.match(/\boption\s+([0-9]{1,2}|[A-Ha-h])\b/i);
    let label = labelMatch?.[1].toUpperCase();
    if (!label) {
      const lower = sentence.toLowerCase();
      label = options.find((o) => {
        const head = o.text
          .split(/[:—–(,.]/)[0]
          .trim()
          .toLowerCase();
        return head.length > 2 && lower.includes(head);
      })?.label;
    }
    return { recommendation: { ...(label && { label }), reason: sentence } };
  }

  private static splitOrQuestion(question: string): DilemmaOption[] {
    const match =
      question.match(
        /^.*\b(?:use|keep|go with|choose|prefer|want|be|do|make it|add)\s+([^,?]+?)\s+or\s+([^,?]+?)\?$/i,
      ) ?? question.match(/^([^,?]+?)\s+or\s+([^,?]+?)\?$/i);
    if (!match) return [];
    return [match[1], match[2]].map((text, i) => ({
      label: String(i + 1),
      text: text.trim(),
    }));
  }

  private static lastQuestion(text: string): string | undefined {
    const questions = text
      .split(/(?<=[.!?])\s+/)
      .filter((s) => s.trim().endsWith("?"));
    return questions.length
      ? questions[questions.length - 1].trim()
      : undefined;
  }

  private static clean(text: string): string {
    return text
      .replace(/\*\*|__|~~/g, "")
      .replace(/`([^`]*)`/g, "$1")
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/^\s*[-*+]\s+/, "")
      .replace(/\s+/g, " ")
      .trim();
  }
}
