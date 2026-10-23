"""Statistics for the agent-log viewer: which tools were used, which shell commands the Bash
calls ran, and what each subagent actually did (grouped more finely than its agent type)."""

from __future__ import annotations

import os
import re
from collections import Counter
from dataclasses import dataclass, field

# Bash builtins and keywords, shown apart from external programs.
BUILTINS = {
    ".", ":", "[", "[[", "alias", "bg", "break", "builtin", "case", "cd", "command", "continue", "declare",
    "echo", "eval", "exec", "exit", "export", "false", "fg", "for", "function", "getopts", "hash", "if",
    "jobs", "kill", "let", "local", "mapfile", "popd", "printf", "pushd", "pwd", "read", "readarray",
    "readonly", "return", "select", "set", "shift", "shopt", "source", "test", "time", "times", "trap",
    "true", "type", "typeset", "ulimit", "umask", "unalias", "unset", "until", "wait", "while",
}
# Words that continue a compound command; the command is the word after them.
CONTINUATIONS = {"do", "then", "else", "elif", "done", "fi", "esac", "in", "!", "{", "}"}
HEREDOC = re.compile(r"(?<!<)<<-?\s*(['\"]?)([A-Za-z_][\w-]*)\1")
WORD = re.compile(r"^[A-Za-z_./+-][\w.+-]*$")


# ---------------------------------------------------------------------------- shell commands
def strip_heredocs(script: str) -> str:
    """Drop heredoc bodies: their lines are file contents (often Python), not commands."""
    lines = script.split("\n")
    out: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        out.append(line)
        terminators = [m.group(2) for m in HEREDOC.finditer(line)]
        i += 1
        for term in terminators:
            while i < len(lines) and lines[i].strip() != term:
                i += 1
            i += 1
    return "\n".join(out)


def split_quotes(script: str) -> tuple[str, list[str]]:
    """The script with quoted strings and substitutions blanked out, and the inner scripts of
    $( ... ) and backtick substitutions (also those inside double quotes), which run too."""
    top: list[str] = []
    inner: list[str] = []
    i, n = 0, len(script)
    while i < n:
        c = script[i]
        if c == "\\" and i + 1 < n:
            top.append(" ")
            i += 2
        elif c == "'":
            j = script.find("'", i + 1)
            i = n if j < 0 else j + 1
            top.append(" Q ")
        elif c == '"':
            j = i + 1
            while j < n and script[j] != '"':
                if script[j] == "\\":
                    j += 1
                elif script.startswith("$(", j):
                    end = matching_paren(script, j + 1)
                    inner.append(script[j + 2 : end])
                    j = end
                j += 1
            i = j + 1
            top.append(" Q ")
        elif script.startswith("$(", i) and not script.startswith("$((", i):
            end = matching_paren(script, i + 1)
            inner.append(script[i + 2 : end])
            top.append(" Q ")
            i = end + 1
        elif c == "`":
            j = script.find("`", i + 1)
            if j > 0:
                inner.append(script[i + 1 : j])
            i = n if j < 0 else j + 1
            top.append(" Q ")
        elif c == "#" and (i == 0 or script[i - 1] in " \t\n;&|("):
            j = script.find("\n", i)
            i = n if j < 0 else j
        else:
            top.append(c)
            i += 1
    return "".join(top), inner


def matching_paren(s: str, open_at: int) -> int:
    depth, i = 0, open_at
    while i < len(s):
        if s[i] == "(":
            depth += 1
        elif s[i] == ")":
            depth -= 1
            if depth == 0:
                return i
        elif s[i] in "'\"":
            j = s.find(s[i], i + 1)
            i = len(s) if j < 0 else j
        i += 1
    return len(s) - 1


# name() { ... }  or  function name { ... }  (with or without the parentheses)
FUNCTION_DEF = re.compile(r"\bfunction\s+([A-Za-z_][\w-]*)(?:\s*\(\s*\))?\s*\{?|\b([A-Za-z_][\w-]*)\s*\(\s*\)\s*\{?")
SHELL_FUNCTION = "(shell function)"


def shell_commands(script: str, depth: int = 0, defined_outside: frozenset = frozenset()) -> list[str]:
    """The command (or builtin, keyword) that starts each simple command of a Bash script."""
    top, inner = split_quotes(strip_heredocs(script))
    top = re.sub(r"\d*[<>]&\d*|&>>?|\$\(\(.*?\)\)", " ", top)  # redirections like 2>&1, &>, arithmetic
    # Functions the script defines (dl(){ ...; }) are counted as one kind, not as programs.
    defined = {a or b for a, b in FUNCTION_DEF.findall(top)} | defined_outside
    top = FUNCTION_DEF.sub(" { ", top)
    out: list[str] = []
    for segment in re.split(r"[\n;&|(){}]+", top):
        words = segment.split()
        while words and (words[0] in CONTINUATIONS or re.match(r"^\w+=", words[0])):
            words.pop(0)
        if not words:
            continue
        word = words[0]
        if word.startswith(("<", ">")):
            continue
        word = os.path.basename(word) if "/" in word and word not in ("/",) else word
        if word in defined:
            out.append(SHELL_FUNCTION)
        elif word and word != "Q" and WORD.match(word):
            out.append(word)
    if depth < 3:
        for script_inside in inner:
            out += shell_commands(script_inside, depth + 1, frozenset(defined))
    return out


# ---------------------------------------------------------------------------- files written
REDIRECT_FILE = re.compile(r"(?:^|[\s;&|])(?:cat|tee(?:\s+-a)?|printf[^>\n]*|echo[^>\n]*)?\s*>{1,2}\s*([\w./~-]+\.[\w]+|[\w./-]*Dockerfile[\w.-]*)")
LANGUAGE = {
    ".py": "Python", ".ts": "TypeScript", ".tsx": "TypeScript", ".js": "JavaScript", ".mjs": "JavaScript",
    ".css": "CSS", ".md": "docs", ".yml": "config", ".yaml": "config", ".json": "config", ".toml": "config",
    ".conf": "config", ".sh": "shell", ".jq": "shell", ".html": "HTML", ".csv": "data",
}


def files_written(tool_calls) -> list[str]:
    """Paths an agent wrote: Write/Edit targets and Bash redirections into files."""
    paths = []
    for seg in tool_calls:
        inputs = {k: v for k, v, _ in seg.inputs}
        if seg.name in ("Write", "Edit", "MultiEdit", "NotebookEdit") and inputs.get("file_path"):
            paths.append(inputs["file_path"])
        elif seg.name == "Bash":
            for m in REDIRECT_FILE.finditer(strip_heredocs(inputs.get("command", ""))):
                path = m.group(1)
                if not path.startswith(("/dev/", "/tmp/")) and "scratchpad" not in path:
                    paths.append(path)
    return paths


def language(path: str) -> str:
    if os.path.basename(path).startswith("Dockerfile"):
        return "config"
    return LANGUAGE.get(os.path.splitext(path)[1].lower(), "other")


# ---------------------------------------------------------------------------- agent groups
@dataclass
class AgentProfile:
    description: str
    agent_type: str
    group: str
    tools: Counter = field(default_factory=Counter)
    languages: Counter = field(default_factory=Counter)

    @property
    def calls(self) -> int:
        return sum(self.tools.values())


GROUPS = [
    "Reviewed a pull request",
    "Researched sources on the web",
    "Fetched and archived data",
    "Wrote Python",
    "Wrote TypeScript / React",
    "Wrote tests",
    "Docker, CI and docs",
    "Other",
]


def classify(description: str, agent_type: str, tools: Counter, languages: Counter, commands: Counter) -> str:
    """A finer group than the agent type, from what the agent did: what it was asked
    (description), which tools it used and which files it wrote."""
    d = description.lower()
    web = tools["WebSearch"] + tools["WebFetch"]
    if d.startswith("review") or agent_type.endswith("reviewer"):
        return "Reviewed a pull request"
    if web >= 3 or re.search(r"\b(survey|research|investigat)", d):
        return "Researched sources on the web"
    if re.search(r"\b(fetch|refetch|download|manifest|scrape|archive)", d):
        return "Fetched and archived data"
    if re.search(r"\b(e2e|playwright|tests?)\b", d):
        return "Wrote tests"
    if re.search(r"\b(docker|readme|ci|workflow|docs?)\b", d):
        return "Docker, CI and docs"
    code = {k: v for k, v in languages.items() if k in ("Python", "TypeScript", "JavaScript", "CSS")}
    if code:
        top = max(code, key=code.get)
        return "Wrote Python" if top == "Python" else "Wrote TypeScript / React"
    if re.search(r"\b(frontend|view|ui|react|q\d)\b", d):
        return "Wrote TypeScript / React"
    if re.search(r"\b(pipeline|engine|api|parser|sample|billable)\b", d):
        return "Wrote Python"
    # Downloads without code of its own (curl is also how the others test the API).
    if commands["curl"] + commands["wget"] >= 5:
        return "Fetched and archived data"
    return "Other"


def profile_agent(description: str, agent_type: str, turns) -> AgentProfile:
    calls = [g for t in turns for g in t.segments if g.kind == "tool"]
    tools = Counter(g.name for g in calls if g.name != "SubagentHandback")
    languages = Counter(language(p) for p in files_written(calls))
    commands = Counter(c for g in calls if g.name == "Bash" for c in shell_commands({k: v for k, v, _ in g.inputs}.get("command", "")))
    group = classify(description, agent_type, tools, languages, commands)
    return AgentProfile(description, agent_type, group, tools, languages)


# ---------------------------------------------------------------------------- whole sessions
@dataclass
class Stats:
    tools: Counter = field(default_factory=Counter)
    commands: Counter = field(default_factory=Counter)
    agents: list[AgentProfile] = field(default_factory=list)

    def add(self, other: "Stats") -> None:
        self.tools.update(other.tools)
        self.commands.update(other.commands)
        self.agents.extend(other.agents)


def session_stats(session) -> Stats:
    stats = Stats()
    all_turns = session.turns + [t for sub in session.subagents for t in sub.turns]
    for t in all_turns:
        for g in t.segments:
            if g.kind != "tool" or g.name == "SubagentHandback":
                continue
            stats.tools[g.name] += 1
            if g.name == "Bash":
                stats.commands.update(shell_commands({k: v for k, v, _ in g.inputs}.get("command", "")))
    stats.agents = [profile_agent(sub.description or sub.name, sub.agent_type, sub.turns) for sub in session.subagents]
    return stats
