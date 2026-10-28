# /// script
# requires-python = ">=3.10"
# dependencies = ["markdown-it-py>=3"]
# ///
"""Render the exported agent sessions (docs/agent-log/*.md) as static HTML pages.

The same pages are built into the frontend image (frontend/Dockerfile) and published
at https://parcels.vaz.io/agent-log/; this script also runs them locally. The
SessionEnd hook (.claude/hooks/export-session.sh) writes one Markdown file per session;
this script reads those files back into turns (prompts, answers, thinking, tool calls with
their results, subagents) and writes a browsable site:

    uv run tools/agent_log_html.py            # writes build/agent-log/, prints the index path
    uv run tools/agent_log_html.py --open     # and opens it in the browser

The output folder is git-ignored. Sessions without a prompt are skipped.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import webbrowser
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from markdown_it import MarkdownIt

sys.path.insert(0, str(Path(__file__).resolve().parent))
from agent_log_stats import BUILTINS, GROUPS, Stats, session_stats  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
LOG_DIR = ROOT / "docs" / "agent-log"
OUT_DIR = ROOT / "build" / "agent-log"

MD = MarkdownIt("commonmark", {"html": False, "linkify": False}).enable("table").enable("strikethrough")

TURN = re.compile(r"^(#{2,3}) (User|Assistant|System) <sub>(.*?)</sub>\s*$")
SUBAGENT = re.compile(r"^## Subagent `([^`]+)`(?:: (.*))?\s*$")
SUBAGENT_TYPE = re.compile(r"^Type: `([^`]*)`")
FENCE = re.compile(r"^ {0,3}(`{3,}|~{3,})(.*)$")
TOOL_CALL = re.compile(r"^\*\*Tool call:\*\* `([^`]+)` <sub>([^<]+)</sub>\s*$")
RESULT_SUMMARY = re.compile(r"^<summary>\*\*Tool result( \(error\))?\*\* <sub>([^<]+)</sub></summary>\s*$")
REMINDER = re.compile(r"&lt;system-reminder&gt;(.*?)&lt;/system-reminder&gt;", re.S)
META_ROW = re.compile(r"^\| (.+?) \| (.*) \|\s*$")


# ---------------------------------------------------------------------------- model
@dataclass
class Segment:
    kind: str  # text | thinking | tool | result | system
    text: str = ""
    name: str = ""
    tool_id: str = ""
    inputs: list[tuple[str, str, bool]] = field(default_factory=list)  # (key, value, multiline)
    error: bool = False
    result: "Segment | None" = None


@dataclass
class Turn:
    role: str  # User | Assistant | System
    time: str
    segments: list[Segment] = field(default_factory=list)


@dataclass
class Subagent:
    name: str
    description: str
    agent_type: str
    turns: list[Turn] = field(default_factory=list)


@dataclass
class Session:
    sid: str
    meta: dict[str, str]
    turns: list[Turn]
    subagents: list[Subagent]

    @property
    def prompts(self) -> list[Turn]:
        """The owner's own prompts; notifications, subagent reports and local commands excluded."""
        return [t for t in self.turns if t.role == "User" and user_kind(t)[0] == "prompt"]

    @property
    def tool_calls(self) -> int:
        all_turns = self.turns + [t for s in self.subagents for t in s.turns]
        return sum(1 for t in all_turns for s in t.segments if s.kind == "tool")


# ---------------------------------------------------------------------------- user turn kinds
INTERRUPTED = "[Request interrupted by user]"


def user_text(turn: Turn) -> str:
    return html.unescape(REMINDER.sub("", "\n".join(s.text for s in turn.segments if s.kind in ("text", "system")))).strip()


def tag(text: str, name: str) -> str:
    m = re.search(rf"<{name}>(.*?)</{name}>", text, re.S)
    return m.group(1).strip() if m else ""


def user_kind(turn: Turn) -> tuple[str, str]:
    """(kind, label) of a user turn. The harness speaks as the user for some messages: a
    background task finishing, a subagent handing back its report, a local slash command."""
    text = user_text(turn)
    if text.startswith("<task-notification>"):
        status = tag(text, "status")
        return "event", f"Background task {status}: {tag(text, 'summary')}" if status else "Background task"
    if text.startswith("Another Claude session sent a message"):
        sender = re.search(r'<agent-message from="([^"]+)"', text)
        return "event", "Report from a subagent" + (f" ({sender.group(1)[:8]})" if sender else "")
    if "<local-command-caveat>" in text or text.startswith("<command-name>"):
        name, args = tag(text, "command-name"), tag(text, "command-args")
        return "event", f"Local command {name} {args}".strip()
    if text == INTERRUPTED:
        return "event", "Interrupted by the user"
    if not re.sub(r"\[Image[^\]]*\]|\[image\]", "", text).strip():
        return "event", "An image (a screenshot the session read)" if text else "An empty message"
    return "prompt", ""


# ---------------------------------------------------------------------------- parsing
class FenceTracker:
    """Knows whether a line is inside a fenced code block (CommonMark rules, simplified)."""

    def __init__(self) -> None:
        self.open: str | None = None

    def step(self, line: str) -> bool:
        """Feed a line; True if it is inside a fence or is a fence line itself."""
        m = FENCE.match(line)
        if self.open is None:
            if m and not (m.group(1)[0] == "`" and "`" in m.group(2)):
                self.open = m.group(1)
                return True
            return False
        if m and m.group(1)[0] == self.open[0] and len(m.group(1)) >= len(self.open) and not m.group(2).strip():
            self.open = None
        return True


def parse_inputs(lines: list[str]) -> list[tuple[str, str, bool]]:
    """The hook writes inputs as "- `key`: `value`" or "- `key`:" followed by a fenced block."""
    out: list[tuple[str, str, bool]] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        inline = re.match(r"^- `([^`]+)`: `(.*)`\s*$", line)
        block = re.match(r"^- `([^`]+)`:\s*$", line)
        if inline:
            out.append((inline.group(1), inline.group(2), False))
            i += 1
            continue
        if block:
            j = i + 1
            while j < len(lines) and not lines[j].strip():
                j += 1
            fence = FENCE.match(lines[j]) if j < len(lines) else None
            if fence:
                marker = fence.group(1)
                k = j + 1
                body: list[str] = []
                while k < len(lines) and not (lines[k].startswith(marker) and not lines[k][len(marker):].strip()):
                    body.append(lines[k])
                    k += 1
                out.append((block.group(1), "\n".join(body), True))
                i = k + 1
                continue
        if line.strip():
            out.append(("", line, True))
        i += 1
    return out


def parse_segments(lines: list[str]) -> list[Segment]:
    segments: list[Segment] = []
    fence = FenceTracker()
    buf: list[str] = []
    i = 0

    def flush_text() -> None:
        text = "\n".join(buf).strip()
        if text:
            if text.startswith("> **system"):
                segments.append(Segment("system", text=text.removeprefix("> ")))
            else:
                segments.append(Segment("text", text=text))
        buf.clear()

    while i < len(lines):
        line = lines[i]
        if fence.open is None:
            call = TOOL_CALL.match(line)
            nxt = lines[i + 1] if i + 1 < len(lines) else ""
            if call:
                flush_text()
                j = i + 1
                body: list[str] = []
                inner = FenceTracker()
                while j < len(lines):
                    if inner.open is None and (TOOL_CALL.match(lines[j]) or lines[j].strip() == "<details>"):
                        break
                    inner.step(lines[j])
                    body.append(lines[j])
                    j += 1
                segments.append(Segment("tool", name=call.group(1), tool_id=call.group(2).strip(), inputs=parse_inputs(body)))
                i = j
                continue
            if line.strip() == "<details>" and (nxt.startswith("<summary>Thinking</summary>") or RESULT_SUMMARY.match(nxt)):
                flush_text()
                result = RESULT_SUMMARY.match(nxt)
                j = i + 2
                body = []
                inner = FenceTracker()
                while j < len(lines) and not (inner.open is None and lines[j].strip() == "</details>"):
                    inner.step(lines[j])
                    body.append(lines[j])
                    j += 1
                text = "\n".join(body).strip()
                if result:
                    m = re.match(r"^(`{3,})\n(.*)\n\1$", text, re.S)
                    segments.append(Segment("result", text=m.group(2) if m else text, tool_id=result.group(2).strip(),
                                            error=bool(result.group(1))))
                else:
                    segments.append(Segment("thinking", text=text))
                i = j + 1
                continue
        fence.step(line)
        buf.append(line)
        i += 1
    flush_text()

    # Attach each result to its call; a result without a call stays on its own.
    calls = {s.tool_id: s for s in segments if s.kind == "tool"}
    kept = []
    for s in segments:
        if s.kind == "result" and s.tool_id in calls and calls[s.tool_id].result is None:
            calls[s.tool_id].result = s
        else:
            kept.append(s)
    return kept


def parse_session(path: Path) -> Session:
    lines = path.read_text(encoding="utf-8", errors="replace").replace("\x00", "").split("\n")
    meta: dict[str, str] = {}
    turns: list[Turn] = []
    subagents: list[Subagent] = []
    current: Turn | None = None
    body: list[str] = []
    fence = FenceTracker()
    target = turns

    def close() -> None:
        nonlocal current
        if current is not None:
            current.segments = parse_segments(body)
            # The hook merges records of the same role; join a turn split by a subagent boundary.
            target.append(current)
        current = None
        body.clear()

    for idx, line in enumerate(lines):
        if current is None and not turns and not subagents:
            row = META_ROW.match(line)
            if row and row.group(1).strip() not in ("", "---"):
                meta[row.group(1).strip()] = row.group(2).strip().strip("`")
        if fence.open is None:
            turn = TURN.match(line)
            sub = SUBAGENT.match(line)
            if turn:
                close()
                current = Turn(turn.group(2), turn.group(3))
                continue
            if sub:
                close()
                agent_type = ""
                for look in lines[idx + 1 : idx + 4]:
                    t = SUBAGENT_TYPE.match(look)
                    if t:
                        agent_type = t.group(1)
                subagents.append(Subagent(sub.group(1), (sub.group(2) or "").strip(), agent_type))
                target = subagents[-1].turns
                continue
            if current is not None and line.strip() == "---" and idx + 2 < len(lines) and SUBAGENT.match(lines[idx + 2]):
                continue
        if current is not None:
            fence.step(line)
            body.append(line)
    close()
    turns = split_command_prompts(turns)
    for sub in subagents:
        sub.turns = split_command_prompts(sub.turns)
    for group in [turns] + [sub.turns for sub in subagents]:
        attach_across_turns(group)
    return Session(path.stem, meta, turns, subagents)


COMMAND_END = re.compile(r"</(?:local-command-caveat|command-name|command-message|command-args|local-command-stdout|local-command-stderr)>")


def split_command_prompts(turns: list[Turn]) -> list[Turn]:
    """The hook merges consecutive user records, so a prompt typed right after a local slash
    command shares its heading. Give the text after the command's output a turn of its own."""
    out: list[Turn] = []
    for t in turns:
        texts = [s for s in t.segments if s.kind == "text"]
        ends = [m.end() for m in COMMAND_END.finditer(texts[-1].text)] if t.role == "User" and texts else []
        rest = texts[-1].text[ends[-1]:].strip() if ends else ""
        if not rest:
            out.append(t)
            continue
        last = texts[-1]
        command = Segment("text", text=last.text[: ends[-1]])
        out.append(Turn(t.role, t.time, [command if s is last else s for s in t.segments]))
        out.append(Turn(t.role, t.time, [Segment("text", text=rest)]))
    return out


def attach_across_turns(turns: list[Turn]) -> None:
    """A result the hook wrote under the next heading still belongs to its call."""
    waiting = {s.tool_id: s for t in turns for s in t.segments if s.kind == "tool" and s.result is None}
    for t in turns:
        kept = []
        for s in t.segments:
            if s.kind == "result" and s.tool_id in waiting:
                waiting.pop(s.tool_id).result = s
            else:
                kept.append(s)
        t.segments = kept


# ---------------------------------------------------------------------------- rendering
def esc(s: str) -> str:
    return html.escape(s, quote=True)


def when(ts: str, with_date: bool = False) -> str:
    try:
        d = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        return esc(ts)
    return d.strftime("%b %-d, %H:%M") if with_date else d.strftime("%H:%M")


DESCRIPTORS = ("description", "command", "file_path", "path", "pattern", "query", "url", "skill", "prompt", "questions")


def descriptor(seg: Segment) -> str:
    values = {k: v for k, v, _ in seg.inputs}
    for key in DESCRIPTORS:
        if values.get(key):
            first = values[key].strip().split("\n")[0]
            return first[:140] + ("…" if len(first) > 140 else "")
    return ""


def render_prompt(text: str) -> str:
    """A user prompt: injected context (system reminders) collapsed, the rest as Markdown."""
    chunks: list[str] = []
    pos = 0
    for m in REMINDER.finditer(text):
        before = text[pos : m.start()].strip()
        if before:
            chunks.append(MD.render(html.unescape(before)))
        chunks.append(
            '<details class="ctx"><summary>Injected context</summary><pre>'
            + esc(html.unescape(m.group(1).strip()))
            + "</pre></details>"
        )
        pos = m.end()
    rest = text[pos:].strip()
    if rest:
        chunks.append(MD.render(html.unescape(rest)))
    return "\n".join(chunks)


def render_tool(seg: Segment, links: dict[str, str]) -> str:
    error = seg.result is not None and seg.result.error
    summary = (
        f'<span class="tool__name">{esc(seg.name)}</span>'
        f'<span class="tool__what">{esc(descriptor(seg))}</span>'
        + ('<span class="tool__flag">error</span>' if error else "")
        + ("" if seg.result is not None else '<span class="tool__flag tool__flag--quiet">no result</span>')
    )
    rows = []
    for key, value, multiline in sorted(seg.inputs, key=lambda kv: kv[0] != "description"):
        cell = f"<pre>{esc(value)}</pre>" if multiline or len(value) > 120 else f"<code>{esc(value)}</code>"
        rows.append(f"<dt>{esc(key)}</dt><dd>{cell}</dd>")
    link = links.get(dict((k, v) for k, v, _ in seg.inputs).get("description", ""), "")
    result = ""
    if seg.result is not None:
        result = f'<div class="tool__result{" tool__result--error" if error else ""}"><span class="kicker">Result</span><pre>{esc(seg.result.text)}</pre></div>'
    sub = f'<p class="tool__sub"><a href="#{link}">Open this subagent’s transcript ↓</a></p>' if link else ""
    return (
        f'<details class="tool{" tool--error" if error else ""}"><summary>{summary}</summary>'
        f'<div class="tool__body"><dl class="tool__input">{"".join(rows)}</dl>{sub}{result}</div></details>'
    )


def render_turn(turn: Turn, number: int | None, links: dict[str, str], anchor: str) -> str:
    if turn.role == "System":
        text = " ".join(s.text for s in turn.segments)
        return f'<div class="sys" id="{anchor}"><span class="sys__time">{when(turn.time)}</span>{MD.render(text)}</div>'
    if turn.role == "User":
        text = "\n\n".join(s.text for s in turn.segments if s.kind in ("text", "system"))
        kind, event = user_kind(turn)
        if kind == "event":
            return (
                f'<details class="event" id="{anchor}"><summary><span class="event__time">{when(turn.time)}</span>'
                f'<span class="event__what">{esc(event)}</span></summary><pre>{esc(user_text(turn))}</pre></details>'
            )
        interrupted = ""
        if html.unescape(text).lstrip().startswith(INTERRUPTED):
            text = html.unescape(text).lstrip()[len(INTERRUPTED):]
            interrupted = '<span class="turn__flag">after interrupting</span>'
        label = f"Prompt {number}" if number else "Prompt"
        return (
            f'<article class="turn turn--user" id="{anchor}"><header class="turn__head"><span class="turn__who">{label}</span>'
            f'<time>{when(turn.time, True)}</time>{interrupted}</header><div class="prose">{render_prompt(text)}</div></article>'
        )
    parts = []
    for s in turn.segments:
        if s.kind == "text":
            parts.append(f'<div class="prose">{MD.render(html.unescape(s.text))}</div>')
        elif s.kind == "thinking":
            parts.append(f'<details class="thinking"><summary>Thinking</summary><div class="prose">{MD.render(html.unescape(s.text))}</div></details>')
        elif s.kind == "tool":
            parts.append(render_tool(s, links))
        elif s.kind == "result":
            parts.append(f'<details class="tool"><summary><span class="tool__name">Result</span></summary><pre>{esc(s.text)}</pre></details>')
        elif s.kind == "system":
            parts.append(f'<div class="sys">{MD.render(s.text)}</div>')
    return (
        f'<article class="turn turn--agent" id="{anchor}"><header class="turn__head"><span class="turn__who">Claude</span>'
        f'<time>{when(turn.time)}</time></header>{"".join(parts)}</article>'
    )


IMAGE_NOTE = re.compile(r"\[Image[^\]]*\]|\[image\]")


def bars(counter, limit: int, builtins: bool = False, wide: bool = False) -> str:
    """A horizontal bar per item, longest first; the rest summed into one line."""
    items = counter.most_common()
    if not items:
        return '<p class="stats__none">None.</p>'
    top, rest = items[:limit], items[limit:]
    peak = top[0][1]
    rows = []
    for name, n in top:
        kind = " bar--builtin" if builtins and name in BUILTINS else ""
        rows.append(
            f'<li class="bar{kind}{" bar--wide" if wide else ""}"><span class="bar__name">{esc(name)}</span>'
            f'<span class="bar__track"><span class="bar__fill" style="width:{max(1.5, 100 * n / peak):.1f}%"></span></span>'
            f'<span class="bar__n">{n:,}</span></li>'
        )
    if rest:
        rows.append(f'<li class="bar bar--rest"><span class="bar__name">{len(rest)} others</span><span class="bar__track"></span>'
                    f'<span class="bar__n">{sum(n for _, n in rest):,}</span></li>')
    return f'<ol class="bars">{"".join(rows)}</ol>'


def render_agents(stats: Stats) -> str:
    if not stats.agents:
        return '<p class="stats__none">No subagents.</p>'
    groups = []
    for group in GROUPS:
        members = [a for a in stats.agents if a.group == group]
        if not members:
            continue
        rows = "".join(
            f'<tr><td>{esc(a.description)}</td><td><code>{esc(a.agent_type or "?")}</code></td><td class="num">{a.calls:,}</td>'
            f'<td>{esc(", ".join(f"{k} {v}" for k, v in a.tools.most_common(3)))}</td>'
            f'<td>{esc(", ".join(f"{k} {v}" for k, v in a.languages.most_common(3)) or "—")}</td></tr>'
            for a in sorted(members, key=lambda a: -a.calls)
        )
        groups.append(
            f'<tr class="agents__group"><th colspan="5">{esc(group)} <span class="agents__n">{len(members)}</span></th></tr>{rows}'
        )
    return (
        '<table class="agents"><thead><tr><th>Subagent</th><th>Agent type</th><th class="num">Tool calls</th>'
        f'<th>Most used tools</th><th>Files written</th></tr></thead><tbody>{"".join(groups)}</tbody></table>'
    )


def render_stats(stats: Stats, open_: bool = True) -> str:
    by_group = {g: sum(1 for a in stats.agents if a.group == g) for g in GROUPS}
    return f"""<details class="stats"{" open" if open_ else ""}><summary>Statistics</summary>
<div class="stats__grid">
<section><h2 class="stats__h">Tools <span class="stats__sub">calls per tool, subagents included</span></h2>{bars(stats.tools, 14)}</section>
<section><h2 class="stats__h">Shell commands <span class="stats__sub">what the Bash calls ran; <span class="key key--builtin"></span>
Bash builtin or keyword, <span class="key"></span> program</span></h2>{bars(stats.commands, 30, builtins=True)}</section>
<section><h2 class="stats__h">Subagents by what they did <span class="stats__sub">grouped from their task, tools and the files they wrote</span></h2>
{bars(Counter({g: n for g, n in by_group.items() if n}), 10, wide=True)}</section>
</div>
<section class="stats__agents">{render_agents(stats)}</section>
</details>"""


def first_line(turn: Turn, limit: int = 90) -> str:
    raw = user_text(turn).removeprefix(INTERRUPTED)
    text = re.sub(r"\s+", " ", IMAGE_NOTE.sub("", raw)).strip()
    if not text:
        return "(an image)" if IMAGE_NOTE.search(raw) else "(empty)"
    return text[:limit] + ("…" if len(text) > limit else "")


def page(title: str, body: str, depth: int = 0) -> str:
    up = "../" * depth
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<link rel="stylesheet" href="{up}assets/style.css"></head>
<body>{body}<script src="{up}assets/app.js"></script></body></html>
"""


def render_session(s: Session) -> str:
    links: dict[str, str] = {}
    for i, sub in enumerate(s.subagents):
        if sub.description:
            links.setdefault(sub.description, f"sub-{i + 1}")
    toc, turns = [], []
    n = 0
    for i, t in enumerate(s.turns):
        anchor = f"t{i}"
        if t.role == "User" and user_kind(t)[0] == "prompt":
            n += 1
            anchor = f"p{n}"
            toc.append(f'<li><a href="#{anchor}"><span class="toc__n">{n}</span><span class="toc__t">{esc(first_line(t, 70))}</span></a></li>')
        turns.append(render_turn(t, n if anchor.startswith("p") else None, links, anchor))
    subs = []
    for i, sub in enumerate(s.subagents):
        inner = "".join(render_turn(t, None, links, f"sub-{i + 1}-t{j}") for j, t in enumerate(sub.turns))
        subs.append(
            f'<details class="subagent" id="sub-{i + 1}"><summary><span class="tool__name">{esc(sub.agent_type or "subagent")}</span>'
            f'<span class="tool__what">{esc(sub.description or sub.name)}</span></summary><div class="subagent__body">{inner}</div></details>'
        )
    meta = s.meta
    started = meta.get("Started", "")
    facts = [
        ("Started", when(started, True)),
        ("Prompts", str(len(s.prompts))),
        ("Tool calls", f"{s.tool_calls:,}"),
        ("Subagents", str(len(s.subagents))),
        ("Branch", esc(meta.get("Branch", ""))),
    ]
    strip = "".join(f'<div class="fact"><span class="kicker">{k}</span><span class="fact__v">{v}</span></div>' for k, v in facts)
    body = f"""
<header class="mast"><a class="mast__back" href="../index.html">← All sessions</a>
<h1>Session <code>{esc(s.sid[:8])}</code></h1><div class="facts">{strip}</div>
<div class="controls"><button type="button" data-toggle="tool">Expand tool calls</button>
<button type="button" data-toggle="thinking">Expand thinking</button></div></header>
<div class="stats__wrap">{render_stats(session_stats(s), open_=False)}</div>
<div class="layout"><nav class="toc" aria-label="Prompts"><p class="kicker">Prompts</p>
<input type="search" class="toc__filter" placeholder="Filter prompts" aria-label="Filter prompts"><ol>{"".join(toc)}</ol></nav>
<main class="log">{"".join(turns)}{f'<h2 class="subs__h">Subagents ({len(subs)})</h2>' + "".join(subs) if subs else ""}</main></div>
"""
    return page(f"Session {s.sid[:8]}", body, depth=1)


def render_index(sessions: list[Session]) -> str:
    total = Stats()
    for s in sessions:
        total.add(session_stats(s))
    rows = []
    for s in sessions:
        started = s.meta.get("Started", "")
        first = first_line(s.prompts[0], 160) if s.prompts else ""
        rows.append(
            f'<li class="card"><a href="sessions/{esc(s.sid)}.html"><span class="card__when">{when(started, True)}</span>'
            f'<span class="card__first">{esc(first)}</span>'
            f'<span class="card__facts">{len(s.prompts)} prompts · {s.tool_calls:,} tool calls · {len(s.subagents)} subagents · '
            f'<code>{esc(s.sid[:8])}</code></span></a></li>'
        )
    body = f"""<header class="mast"><h1>How it was built</h1>
<p class="mast__deck">The Claude Code sessions that built this repository, exported by the SessionEnd hook to
<code>docs/agent-log/</code>, oldest first. A local view for people with access to the repository.</p></header>
<main class="sessions"><ol class="sessions__list">{"".join(rows)}</ol>
<h2 class="all__h">All sessions together</h2>{render_stats(total)}</main>"""
    return page("How it was built", body)


CSS = r"""
:root{--paper:#fff;--sheet:#f3f4f2;--ink:#111;--muted:#5b6066;--rule:#d3d6d9;--accent:#e8590c;--user:#1f4e9a;
--display:"Barlow Condensed","Arial Narrow",sans-serif;--ui:"IBM Plex Sans",Arial,sans-serif;--mono:"IBM Plex Mono",ui-monospace,monospace}
@media (prefers-color-scheme:dark){:root{--paper:#0f1113;--sheet:#191c1f;--ink:#eceeea;--muted:#a6acb2;--rule:#34393e;--user:#7fa8ee}}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 var(--ui)}
a{color:inherit}code,pre{font-family:var(--mono);font-size:.86em}
pre{white-space:pre-wrap;word-break:break-word;background:var(--sheet);padding:.6rem .75rem;margin:.4rem 0;max-height:32rem;overflow:auto}
.kicker{font-size:.72rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.mast{border-bottom:2px solid var(--ink);padding:1rem 1.5rem}.mast h1{font:700 2.2rem/1 var(--display);margin:.2rem 0}
.mast__deck{color:var(--muted);max-width:70ch;margin:.4rem 0 0}.mast__back{font-size:.85rem;color:var(--muted)}
.facts{display:flex;flex-wrap:wrap;gap:0 1.5rem;margin-top:.6rem}.fact{display:grid}.fact__v{font:700 1.25rem/1.2 var(--display)}
.controls{margin-top:.6rem;display:flex;gap:.5rem}
button{font:600 .72rem var(--ui);letter-spacing:.08em;text-transform:uppercase;background:none;color:inherit;border:1px solid var(--ink);padding:.35rem .6rem;cursor:pointer}
button:hover{background:var(--sheet)}
.layout{display:grid;grid-template-columns:17rem minmax(0,1fr);gap:2rem;padding:0 1.5rem}
.toc{position:sticky;top:0;align-self:start;max-height:100vh;overflow:auto;padding:1rem 0;border-right:2px solid var(--ink);padding-right:1rem}
.toc ol{list-style:none;margin:.5rem 0 0;padding:0}.toc li a{display:grid;grid-template-columns:2rem 1fr;gap:.3rem;padding:.3rem 0;border-bottom:1px solid var(--rule);text-decoration:none;font-size:.82rem}
.toc li a:hover .toc__t{text-decoration:underline}.toc__n{font:700 1rem var(--display);color:var(--muted)}
.toc__filter{width:100%;padding:.35rem .5rem;border:0;border-bottom:2px solid var(--ink);background:var(--sheet);color:inherit;font:inherit}
.log{padding:1rem 0 4rem;min-width:0}
.turn{padding:.8rem 0 1rem;border-bottom:1px solid var(--rule)}
.turn__head{display:flex;gap:.75rem;align-items:baseline;margin-bottom:.3rem}.turn__head time{font-size:.75rem;color:var(--muted)}
.turn__who{font:700 1.05rem var(--display);text-transform:uppercase;letter-spacing:.04em}
.turn--user{border-top:2px solid var(--ink);margin-top:1.5rem;padding:1rem 1.1rem;background:var(--sheet);border-bottom:0}
.turn--user .turn__who{color:var(--user)}.turn--user .prose{font-size:1rem}
.prose{max-width:80ch}.prose>:first-child{margin-top:0}.prose>:last-child{margin-bottom:0}
.prose table{border-collapse:collapse;font-size:.85rem}.prose th,.prose td{border-bottom:1px solid var(--rule);padding:.25rem .6rem .25rem 0;text-align:left}
details>summary{cursor:pointer}
.thinking{margin:.35rem 0;color:var(--muted)}.thinking>summary{font-size:.8rem;font-style:italic}
.thinking .prose{border-left:3px solid var(--rule);padding-left:.8rem;margin-top:.3rem;font-size:.9rem}
.tool{margin:.25rem 0;border-left:3px solid var(--rule);padding-left:.6rem}.tool--error{border-left-color:var(--accent)}
.tool>summary{display:flex;gap:.6rem;align-items:baseline;list-style:none;font-size:.85rem;padding:.15rem 0}
.tool>summary::-webkit-details-marker{display:none}
.tool>summary::before{content:"+";font-family:var(--mono);color:var(--muted)}.tool[open]>summary::before{content:"−"}
.tool__name{font:600 .72rem var(--mono);text-transform:uppercase;letter-spacing:.04em;background:var(--ink);color:var(--paper);padding:.05rem .35rem;white-space:nowrap}
.tool__what{color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.tool__flag{font:600 .7rem var(--ui);text-transform:uppercase;color:var(--accent)}.tool__flag--quiet{color:var(--muted)}
.tool__input{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:.2rem .8rem;margin:.4rem 0;font-size:.85rem}
.tool__input dt{font-family:var(--mono);color:var(--muted)}.tool__input dd{margin:0;min-width:0}.tool__input pre{margin:0}
.tool__result--error pre{border-left:3px solid var(--accent)}.tool__sub{font-size:.85rem;margin:.3rem 0}
.ctx{margin:.4rem 0;font-size:.8rem;color:var(--muted)}.ctx pre{font-size:.75rem}
.event{font-size:.8rem;color:var(--muted);padding:.35rem 0;border-left:3px solid var(--user);padding-left:.6rem;margin:.4rem 0}
.event>summary{display:flex;gap:.6rem}.event__time{font-variant-numeric:tabular-nums}.event__what{font-weight:600}
.turn__flag{font:600 .7rem var(--ui);text-transform:uppercase;letter-spacing:.06em;color:var(--accent)}
.sys{font-size:.78rem;color:var(--muted);display:flex;gap:.6rem;padding:.3rem 0}.sys p{margin:0}
.subs__h{font:700 1.6rem var(--display);border-top:2px solid var(--ink);padding-top:1rem;margin-top:3rem}
.subagent{border-top:1px solid var(--rule);padding:.5rem 0}.subagent>summary{display:flex;gap:.6rem;align-items:baseline}
.subagent__body{padding-left:1rem;border-left:3px solid var(--rule)}
.sessions{padding:0 1.5rem}.sessions__list{list-style:none;padding:0;margin:1rem 0;max-width:60rem}
.card a{display:grid;gap:.2rem;padding:1rem 0;border-bottom:1px solid var(--rule);text-decoration:none}
.card a:hover .card__first{text-decoration:underline}.card__when{font:700 1.3rem var(--display)}
.card__facts{font-size:.8rem;color:var(--muted)}
.stats__wrap{padding:0 1.5rem}.stats{border-bottom:2px solid var(--ink);padding:.6rem 0 1rem}
.stats>summary{font:700 1.2rem var(--display);text-transform:uppercase;letter-spacing:.04em}
.stats__grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(20rem,1fr));gap:1rem 2.5rem;margin-top:.8rem}
.stats__h{font:700 1.15rem var(--display);margin:0 0 .4rem}.stats__sub{font:400 .78rem var(--ui);color:var(--muted)}
.stats__none{color:var(--muted);font-size:.85rem}
.bars{list-style:none;margin:0;padding:0;display:grid;gap:3px}
.bar{display:grid;grid-template-columns:9.5rem minmax(0,1fr) 3.5rem;gap:.6rem;align-items:center;font-size:.8rem}
.bar__name{font-family:var(--mono);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar--wide{grid-template-columns:14rem minmax(0,1fr) 2.5rem}.bar--wide .bar__name{font-family:var(--ui)}
.bar__track{height:.7rem;background:var(--sheet)}.bar__fill{display:block;height:100%;background:var(--ink)}
.bar--builtin .bar__fill{background:var(--user)}.bar--rest{color:var(--muted)}
.bar__n{text-align:right;font-variant-numeric:tabular-nums}
.key{display:inline-block;width:.7rem;height:.7rem;background:var(--ink);vertical-align:middle}.key--builtin{background:var(--user)}
.stats__agents{margin-top:1.4rem;overflow-x:auto}
.agents{border-collapse:collapse;font-size:.8rem;width:100%}
.agents th,.agents td{border-bottom:1px solid var(--rule);padding:.3rem .8rem .3rem 0;text-align:left;vertical-align:baseline}
.agents thead th{font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);border-bottom:2px solid var(--ink)}
.agents__group th{font:700 1rem var(--display);padding-top:.8rem}.agents__n{font:500 .8rem var(--ui);color:var(--muted)}
.agents .num{text-align:right;font-variant-numeric:tabular-nums}
.all__h{font:700 1.6rem var(--display);border-top:2px solid var(--ink);padding-top:1rem;margin-top:2rem}
@media (max-width:52rem){.layout{grid-template-columns:1fr}.toc{position:static;max-height:40vh;border-right:0;border-bottom:2px solid var(--ink)}}
"""

JS = r"""
document.querySelectorAll("[data-toggle]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const sel = btn.dataset.toggle === "tool" ? "details.tool" : "details.thinking";
    const all = [...document.querySelectorAll(sel)];
    const open = !all.every((d) => d.open);
    all.forEach((d) => (d.open = open));
    btn.textContent = (open ? "Collapse " : "Expand ") + (btn.dataset.toggle === "tool" ? "tool calls" : "thinking");
  });
});
const filter = document.querySelector(".toc__filter");
if (filter) filter.addEventListener("input", () => {
  const q = filter.value.toLowerCase();
  document.querySelectorAll(".toc li").forEach((li) => (li.hidden = q && !li.textContent.toLowerCase().includes(q)));
});
// A link into a collapsed subagent opens it.
addEventListener("hashchange", () => {
  const el = document.getElementById(location.hash.slice(1));
  if (el && el.tagName === "DETAILS") el.open = true;
});
"""


def build(log_dir: Path, out_dir: Path) -> tuple[Path, list[Session]]:
    sessions = [parse_session(p) for p in sorted(log_dir.glob("*.md")) if p.name != "README.md"]
    sessions = [s for s in sessions if s.prompts]
    sessions.sort(key=lambda s: s.meta.get("Started", ""))
    (out_dir / "sessions").mkdir(parents=True, exist_ok=True)
    (out_dir / "assets").mkdir(parents=True, exist_ok=True)
    (out_dir / "assets" / "style.css").write_text(CSS.strip() + "\n", encoding="utf-8")
    (out_dir / "assets" / "app.js").write_text(JS.strip() + "\n", encoding="utf-8")
    for s in sessions:
        (out_dir / "sessions" / f"{s.sid}.html").write_text(render_session(s), encoding="utf-8")
    index = out_dir / "index.html"
    index.write_text(render_index(sessions), encoding="utf-8")
    (out_dir / "sessions.json").write_text(
        json.dumps([{"session": s.sid, "prompts": len(s.prompts), "tool_calls": s.tool_calls, "subagents": len(s.subagents)}
                    for s in sessions], indent=1) + "\n", encoding="utf-8")
    return index, sessions


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--logs", type=Path, default=LOG_DIR, help="folder of exported sessions")
    parser.add_argument("--out", type=Path, default=OUT_DIR, help="where to write the pages")
    parser.add_argument("--open", action="store_true", help="open the index in the browser")
    args = parser.parse_args(argv)
    index, sessions = build(args.logs, args.out)
    for s in sessions:
        print(f"{s.sid[:8]}  {len(s.prompts):3d} prompts  {s.tool_calls:5d} tool calls  {len(s.subagents):2d} subagents")
    print(index)
    if args.open:
        webbrowser.open(index.as_uri())
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
