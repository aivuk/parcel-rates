"""Tests for tools/agent_log_stats.py: shell command counting, files written, agent groups.

    uv run --no-project --with markdown-it-py --with pytest pytest tools
"""

from __future__ import annotations

from collections import Counter

import agent_log_stats as st
import pytest
from agent_log_html import Segment


@pytest.mark.parametrize(
    ("script", "expected"),
    [
        ("cd /x && git status --short | head -5", ["cd", "git", "head"]),
        ('for f in *.md; do echo "$f"; done', ["for", "echo"]),
        ("while read -r l; do printf '%s' \"$l\"; done < x", ["while", "printf"]),
        ("cat > a.py <<'EOF'\nimport os; rm -rf /\nEOF\npython3 a.py 2>&1 | tail -3", ["cat", "python3", "tail"]),
        ('X=1 uv run pytest -q && echo "ok $(git rev-parse HEAD)"', ["uv", "echo", "git"]),
        ("ls `which python3`  # comment; rm x", ["ls", "which"]),
        ("find . -name '*.py' | xargs grep -n 'a; b' | wc -l", ["find", "xargs", "wc"]),
        ("if [ -f x ]; then sed -i 's/a/b/' x; fi", ["if", "sed"]),
        ('dl(){ curl -o "$1" "$2"; }\ndl a b\nfunction get { wget x; }\nget y', ["curl", st.SHELL_FUNCTION, "wget", st.SHELL_FUNCTION]),
        ("/usr/bin/env python3 x.py", ["env"]),
    ],
)
def test_shell_commands(script, expected):
    assert st.shell_commands(script) == expected


def call(name, **inputs):
    return Segment("tool", name=name, inputs=[(k, v, "\n" in v) for k, v in inputs.items()])


def test_files_written_through_tools_and_bash():
    calls = [
        call("Write", file_path="backend/app/x.py"),
        call("Bash", command="cat > frontend/src/A.tsx <<'EOF'\nconst x = 1 > 0;\nEOF\necho hi > /tmp/scratch.txt"),
        call("Bash", command="printf 'a' >> docs/NOTES.md && cat Dockerfile"),
    ]
    paths = st.files_written(calls)
    assert paths == ["backend/app/x.py", "frontend/src/A.tsx", "docs/NOTES.md"]
    assert [st.language(p) for p in paths] == ["Python", "TypeScript", "docs"]


@pytest.mark.parametrize(
    ("description", "agent_type", "tools", "languages", "commands", "group"),
    [
        ("Review PR 17 engine and API", "code-reviewer", {}, {}, {}, "Reviewed a pull request"),
        ("Survey UPS published rate data", "general-purpose", {"WebSearch": 8}, {}, {}, "Researched sources on the web"),
        ("Build raw manifest and refetch PDFs", "general-purpose", {}, {}, {"curl": 30}, "Fetched and archived data"),
        ("Issue 8: Playwright e2e and screenshots", "general-purpose", {}, {"TypeScript": 9}, {}, "Wrote tests"),
        ("Issue 7: Docker and README", "general-purpose", {}, {"config": 4}, {"curl": 9}, "Docker, CI and docs"),
        ("Issue 5: Q1 quote and Q2 breakeven", "general-purpose", {}, {"TypeScript": 19, "Python": 1}, {"curl": 9}, "Wrote TypeScript / React"),
        ("Build FedEx rate pipeline", "general-purpose", {}, {"Python": 6}, {}, "Wrote Python"),
        ("Tidy up", "general-purpose", {}, {}, {}, "Other"),
    ],
)
def test_groups_are_finer_than_the_agent_type(description, agent_type, tools, languages, commands, group):
    assert st.classify(description, agent_type, Counter(tools), Counter(languages), Counter(commands)) == group
