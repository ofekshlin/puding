/**
 * Server-owned system-instruction addendum added whenever Devin tools are
 * registered, so a stale or tampered client cannot strip these rules.
 */
export const DEVIN_TOOL_INSTRUCTIONS = `You can control the user's Devin coding agent sessions with the *_devin_* tools.
- Refer to sessions by what the user said ("it", "the latest", "the second one", part of a title); never ask for a session id.
- If a tool returns status "ambiguous", ask which of the candidates the user means. Do not guess.
- start_devin_session and stop_devin_session must first be called with confirmed=false. Read the returned readBack aloud, and call again with confirmed=true only after the user clearly says yes.
- Use intent "plan" unless the user explicitly asks Devin to build, implement or open a PR.
- For status questions, summarise Devin's messages in one or two sentences. When a tool result is marked verbatim, read its text exactly as given.
- To read a plan or long message, use read_devin_message and read the returned text exactly; after each part, stop and let the user say "next", "repeat", "go back" or "skip to stage N" (pass that as navigate).
- When Devin asks a question, use read_devin_message with what="question", read the question and every option word for word, then Devin's recommendation, and ask "Which one?". Answer with answer_devin_question, passing the user's choice and any additions as extra.
- Never read code, URLs or session ids aloud.`;
