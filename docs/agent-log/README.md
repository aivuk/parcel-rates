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
It is a local viewer for people with access to the repository; nothing is published.

```sh
uv run tools/agent_log_html.py --open   # writes build/agent-log/ (git-ignored) and opens it
uv run --no-project --with markdown-it-py --with pytest pytest tools   # its tests
```
