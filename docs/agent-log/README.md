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
