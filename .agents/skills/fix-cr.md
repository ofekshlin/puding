---
name: fix-cr
description: Fix code review notes on the current PR. Usage: /fix-cr [PR_number] [specific notes to address]
---

You are fixing code review (CR) notes for a Pull Request.

## Your Input
Arguments provided: {{args}}

This may contain:
- A PR number (e.g., `42`)
- Specific review notes to address (quoted text or description)
- Both (e.g., `42 "fix the error handling"`)
- Nothing (auto-detect the current PR)

## CRITICAL RULES

1. **Fix ONLY what the review asks for.** Do not refactor, improve, or change anything beyond the scope of the CR notes.
2. **Stay on the current branch.** Do NOT create a new branch. You are pushing fixes to the existing feature branch.
3. **Follow all project rules.** If `.gemini/GEMINI.md` exists, read it and follow all coding standards, conventions, and constraints defined there.
4. **Do NOT advance to the next stage.** Even if the CR suggests future improvements, only fix what's requested now.
5. **Do NOT merge the PR.** Your work is done after pushing fixes and commenting.

## Workflow

### Step 1: Identify the PR

If a PR number was provided in the arguments, use that.

Otherwise, find the current branch's PR:
```
git branch --show-current
```
Then:
```
gh pr list --state open --head <current-branch-name>
```

If no open PR is found for the current branch, try:
```
gh pr list --state open --author @me
```

If still no PR is found, STOP and report:
> "No open PR found. Please provide a PR number: `/fix-cr <PR_number>`"

### Step 2: Read all review comments

Fetch the PR details and all review feedback:

**PR overview and conversation comments:**
```
gh pr view <PR_NUMBER> --comments
```

**Inline code review comments:**
```
gh pr review list <PR_NUMBER>
```

Also check for detailed inline review comments using:
```
gh api repos/{owner}/{repo}/pulls/<PR_NUMBER>/comments --jq '.[] | {path: .path, line: .original_line, body: .body, user: .user.login}'
```

To get the owner/repo automatically:
```
gh repo view --json nameWithOwner --jq '.nameWithOwner'
```

If specific notes were provided in the arguments, focus on those but still read all comments for full context.

### Step 3: Categorize review comments

List all review comments and categorize them:

| Category | Action | Examples |
|----------|--------|----------|
| **🔴 Must Fix** | Implement immediately | Bugs, broken functionality, security issues, rule violations |
| **🟡 Should Fix** | Implement if clearly requested | Style issues, naming improvements, missing best practices |
| **🟢 Nice to Have** | Note but skip | Suggestions for future improvement, "maybe consider..." |

Present this categorization before starting fixes.

### Step 4: Implement the fixes

For each comment being addressed:
1. Read the specific file and line referenced
2. Understand the reviewer's intent
3. Make the minimal, targeted fix
4. Reference which review comment this fix addresses

Follow `.gemini/GEMINI.md` rules strictly (if the file exists).

### Step 5: Verify the build

Auto-detect the project's build system and run the appropriate build/check command:

| File Found | Build Command |
|-----------|--------------|
| `package.json` (with `build` script) | `npm run build` |
| `package.json` (with `tsc` in devDeps) | `npx tsc --noEmit` |
| `Cargo.toml` | `cargo build` |
| `go.mod` | `go build ./...` |
| `pyproject.toml` | `python -m py_compile` on changed files |
| `Makefile` | `make build` or `make check` |
| `pom.xml` | `mvn compile` |
| `build.gradle` / `build.gradle.kts` | `./gradlew build` |

If the project has a custom build command documented in `.gemini/GEMINI.md` (look for a `Build Command` entry), use that instead.

Fix any build errors before proceeding.

### Step 6: Commit the fixes

Use a clear commit message referencing the CR:
```
git add -A
git commit -m "fix: address CR feedback — <brief summary of changes>"
```

If multiple distinct issues were fixed, consider grouping them logically:
```
git commit -m "fix: address CR feedback — improve error handling, fix naming conventions"
```

### Step 7: Push the fixes
```
git push
```

### Step 8: Comment on the PR

Reply to acknowledge the fixes:
```
gh pr comment <PR_NUMBER> --body "## CR Feedback Addressed ✅

### Changes Made
<bullet list of each fix and which comment it addresses>

### Skipped (if any)
<items intentionally skipped with reasoning>

### Build Status
<whether build passes>"
```

## After Completion
Report:
1. ✅ A summary of each review comment and how it was addressed
2. ⏭️ Any review comments that were intentionally skipped (with reasoning)
3. 🔨 Confirmation that the build passes
4. 🔗 Link to the PR

**DO NOT merge the PR. DO NOT proceed to the next stage.**
