# Render a Claude Code JSONL transcript as readable Markdown.
#
# Usage: jq -rs --arg h "##" -f transcript-to-md.jq transcript.jsonl
#   $h  heading prefix for each turn ("##" for the main session, "###" for subagents)
#
# One record per JSONL line. Only user / assistant / non-meta system records are
# rendered; bookkeeping records (attachment, mode, snapshots, ...) are skipped.
# Assistant records arrive one content block per line, so consecutive records
# from the same role are merged under a single heading. Tool results (user
# records that only carry tool_result blocks) are kept inside the assistant turn.

def fence(s):
  ([s | scan("`+") | length] | max // 0) as $m
  | ("`" * ([3, $m + 1] | max)) as $f
  | "\($f)\n\(s)\n\($f)";

def escape_tags:
  gsub("<(?<t>/?system-reminder)>"; "&lt;\(.t)&gt;");

def details(summary; body):
  "<details>\n<summary>\(summary)</summary>\n\n\(body)\n\n</details>";

def ts:
  (.timestamp // "") | sub("\\.[0-9]+Z$"; "Z");

def inline_ok:
  (test("[`\n]") | not) and (length <= 120);

def render_input:
  if type == "object" then
    [ to_entries[]
      | .key as $k | .value as $v
      | if ($v | type) == "string" then
          if ($v | inline_ok) then "- `\($k)`: `\($v)`"
          else "- `\($k)`:\n\n\(fence($v))" end
        else "- `\($k)`: `\($v | tojson)`" end
    ] | join("\n")
  else fence(tojson) end;

def result_text:
  .content
  | if type == "string" then .
    elif type == "array" then
      [ .[] | if .type == "text" then .text
              elif .type == "image" then "[image]"
              else tojson end ] | join("\n")
    else (. // "" | tostring) end;

def block:
  if .type == "text" then (.text | escape_tags)
  elif .type == "thinking" then details("Thinking"; (.thinking // "") | escape_tags)
  elif .type == "tool_use" then
    "**Tool call:** `\(.name)` <sub>\(.id)</sub>\n\n\(.input | render_input)"
  elif .type == "tool_result" then
    ("**Tool result" + (if .is_error == true then " (error)" else "" end)
      + "** <sub>\(.tool_use_id)</sub>") as $s
    | details($s; fence(result_text | escape_tags))
  elif .type == "image" then "[image]"
  else fence(tojson) end;

def is_tool_result_only:
  .type == "user"
  and (.message.content | type) == "array"
  and (.message.content | length) > 0
  and all(.message.content[]; .type == "tool_result");

def role:
  if is_tool_result_only then "assistant" else .type end;

def role_label:
  if .type == "user" then "User"
  elif .type == "assistant" then "Assistant"
  else "System" end;

def heading:
  "\($h) \(role_label) <sub>\(ts)</sub>";

def body:
  if .type == "system" then
    "> **system\(if .subtype then " (\(.subtype))" else "" end):** \((.content // "") | tostring | escape_tags)"
  elif (.message.content | type) == "string" then
    (.message.content | escape_tags)
  else
    [ .message.content[] | block ] | join("\n\n")
  end;

def renderable:
  ((.type == "user" or .type == "assistant") and .message != null)
  or (.type == "system" and .isMeta != true and .content != null);

map(select(renderable))
| reduce .[] as $r ({prev: null, out: []};
    ($r | role) as $role
    | .out += (if $role != .prev then [($r | heading)] else [] end) + [($r | body)]
    | .prev = $role)
| .out
| join("\n\n")
