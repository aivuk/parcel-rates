# Agent session log

Every Claude Code session run in this repository is exported here as Markdown
when the session ends, by the `SessionEnd` hook configured in
`.claude/settings.json` (`.claude/hooks/export-session.sh`).

- One file per session, named `<session-id>.md`. A resumed session keeps its
  id, so it overwrites its own earlier export.
- The export contains the full main transcript (user prompts, assistant text,
  thinking, tool calls and tool results) followed by one section per subagent
  transcript spawned from that session.
- The hook commits the exported file on its own (`docs(agent-log): export
  session <id>`), touching nothing else in the index.

To export the current session by hand:

```sh
printf '{"session_id":"%s","transcript_path":"%s","cwd":"%s","reason":"manual"}' \
  "$SID" "$HOME/.claude/projects/<encoded-project-path>/$SID.jsonl" "$PWD" \
  | .claude/hooks/export-session.sh
```

## Reading the logs

`tools/agent_log_html.py` turns these files into local HTML pages: an index of the
sessions, and per session the prompts in a sidebar, Claude's answers, collapsible
thinking and tool calls (each with its input and result), harness messages (background
tasks, subagent reports, local commands) as compact events, and the subagent transcripts.
Statistics (per session, and for all sessions on the index): calls per tool; the shell
commands and builtins the Bash calls ran (from a small tokenizer that skips heredoc bodies
and quoted text and counts what runs inside `$( … )`); and the subagents grouped by what they
did (reviewed a pull request, researched sources, fetched data, wrote Python, wrote
TypeScript / React, wrote tests, Docker/CI/docs), from their task, their tools and the files
they wrote, which is finer than their agent type (most are `general-purpose`).
The pages are published at <https://parcels.vaz.io/agent-log/>: the frontend image
(`frontend/Dockerfile`) renders them at build time and nginx serves them under
`/agent-log/`, so each deploy publishes the sessions committed at that point. To
render them locally:

```sh
uv run tools/agent_log_html.py --open   # writes build/agent-log/ (git-ignored) and opens it
uv run --no-project --with markdown-it-py --with pytest pytest tools   # its tests
```
