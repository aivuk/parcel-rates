#!/usr/bin/env bash
# SessionEnd hook: export the session transcript (plus any subagent transcripts)
# to docs/agent-log/<session-id>.md and commit that file.
#
# Reads the hook payload on stdin:
#   {"session_id": "...", "transcript_path": "...", "cwd": "...", "reason": "..."}
# Can also be run by hand with the same JSON on stdin.
#
# Dependencies: bash, jq, git.
set -euo pipefail

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
main=$(mktemp)
trap 'rm -f "$out.tmp" "$main"' EXIT

# Transcripts are JSONL but can hold a corrupt line (e.g. a record cut off
# mid-write with the next one appended to it). Keep the lines that parse and
# warn about the rest, so one bad line doesn't sink the whole export.
clean() { # clean <jsonl file> ; valid records to stdout, one per line
  local bad
  bad=$(jq -nR '[inputs | (fromjson? | 0) // 1] | add // 0' "$1")
  if (( bad > 0 )); then
    echo "export-session: skipped $bad unparseable line(s) in $1" >&2
  fi
  jq -cR 'fromjson? // empty' "$1"
}

render() { # render <heading-prefix> ; records on stdin
  jq -rs --arg h "$1" -f "$filter"
}

clean "$tp" > "$main"

meta() { # meta <jq expr> over the main transcript
  jq -rs "$1" "$main"
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
  jq -c 'select(.isSidechain != true)' "$main" | render "##"

  # Subagent transcripts, newer layout: <transcript-dir>/<session-id>/subagents/agent-*.jsonl
  subdir="${tp%.jsonl}/subagents"
  if [[ -d "$subdir" ]]; then
    for f in "$subdir"/*.jsonl; do
      [[ -s "$f" ]] || continue
      name=$(basename "$f" .jsonl)
      meta="${f%.jsonl}.meta.json"
      desc=""; atype=""
      if [[ -s "$meta" ]]; then
        desc=$(jq -r '.description // empty' "$meta")
        atype=$(jq -r '.agentType // empty' "$meta")
      fi
      echo; echo "---"; echo
      echo "## Subagent \`$name\`${desc:+: $desc}"
      echo
      echo "Type: \`${atype:-unknown}\` · Source: \`$f\`"
      echo
      clean "$f" | render "###"
    done
  fi

  # Subagent transcripts, older layout: sidechain records inside the main file.
  for agent in $(jq -r 'select(.isSidechain == true) | .agentId // "sidechain"' "$main" | sort -u); do
    echo; echo "---"; echo
    echo "## Subagent \`$agent\` (inline sidechain)"
    echo
    jq -c --arg a "$agent" 'select(.isSidechain == true and ((.agentId // "sidechain") == $a))' "$main" | render "###"
  done
} | sed -e "s|${HOME}|~|g" > "$out.tmp"   # redact the home directory path
mv "$out.tmp" "$out"

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
