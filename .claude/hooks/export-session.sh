#!/usr/bin/env bash
# SessionEnd hook: export the session transcript (plus any subagent transcripts)
# to docs/agent-log/<session-id>.md and commit that file.
#
# Reads the hook payload on stdin:
#   {"session_id": "...", "transcript_path": "...", "cwd": "...", "reason": "..."}
# Can also be run by hand with the same JSON on stdin.
#
# Dependencies: bash, jq, git.
set -uo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
filter="$here/transcript-to-md.jq"

input=$(cat)
sid=$(jq -r '.session_id // empty' <<<"$input")
tp=$(jq -r '.transcript_path // empty' <<<"$input")
reason=$(jq -r '.reason // "manual"' <<<"$input")
cwd=$(jq -r '.cwd // empty' <<<"$input")
root=$(git -C "${CLAUDE_PROJECT_DIR:-${cwd:-$here}}" rev-parse --show-toplevel 2>/dev/null) || root=$(git -C "$here" rev-parse --show-toplevel)

if [[ -z "$sid" || -z "$tp" ]]; then
  echo "export-session: missing session_id or transcript_path in hook input" >&2
  exit 1
fi
if [[ ! -s "$tp" ]]; then
  echo "export-session: transcript $tp missing or empty, nothing to export" >&2
  exit 0
fi

outdir="$root/docs/agent-log"
out="$outdir/$sid.md"
mkdir -p "$outdir"

render() { # render <heading-prefix> ; records on stdin
  jq -rs --arg h "$1" -f "$filter"
}

meta() { # meta <jq expr> over the main transcript
  jq -rs "$1" "$tp"
}

{
  echo "# Agent session $sid"
  echo
  echo "| | |"
  echo "|---|---|"
  echo "| Project | \`$(meta '[.[] | .cwd // empty] | first // ""')\` |"
  echo "| Branch | \`$(meta '[.[] | .gitBranch // empty] | first // ""')\` |"
  echo "| Claude Code | $(meta '[.[] | .version // empty] | first // ""') |"
  echo "| Started | $(meta '[.[] | .timestamp // empty] | min // ""') |"
  echo "| Last record | $(meta '[.[] | .timestamp // empty] | max // ""') |"
  echo "| Exported | $(date -u +%Y-%m-%dT%H:%M:%SZ) (reason: $reason) |"
  echo "| Source | \`$tp\` |"
  echo
  jq -c 'select(.isSidechain != true)' "$tp" | render "##"

  # Subagent transcripts, newer layout: <transcript-dir>/<session-id>/subagents/agent-*.jsonl
  subdir="${tp%.jsonl}/subagents"
  if [[ -d "$subdir" ]]; then
    for f in "$subdir"/*.jsonl; do
      [[ -s "$f" ]] || continue
      name=$(basename "$f" .jsonl)
      echo; echo "---"; echo
      echo "## Subagent \`$name\`"
      echo
      echo "Source: \`$f\`"
      echo
      jq -c '.' "$f" | render "###"
    done
  fi

  # Subagent transcripts, older layout: sidechain records inside the main file.
  for agent in $(jq -r 'select(.isSidechain == true) | .agentId // "sidechain"' "$tp" | sort -u); do
    echo; echo "---"; echo
    echo "## Subagent \`$agent\` (inline sidechain)"
    echo
    jq -c --arg a "$agent" 'select(.isSidechain == true and ((.agentId // "sidechain") == $a))' "$tp" | render "###"
  done
} > "$out.tmp" && mv "$out.tmp" "$out"

echo "export-session: wrote ${out#$root/}" >&2

# Commit only this file, leaving any other staged or unstaged work untouched.
git -C "$root" add -- "$out"
if git -C "$root" diff --cached --quiet -- "$out"; then
  echo "export-session: no changes to commit" >&2
  exit 0
fi
if git -C "$root" commit -q --only -m "docs(agent-log): export session $sid" -- "$out"; then
  echo "export-session: committed $(git -C "$root" rev-parse --short HEAD)" >&2
else
  echo "export-session: commit failed, export left in working tree" >&2
fi
