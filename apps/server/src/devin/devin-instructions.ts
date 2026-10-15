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
- When Devin asks a question, read every option before asking the user to choose.
- Never read code, URLs or session ids aloud.`;
