#!/usr/bin/env python3
"""
Universal Conversation Transcript Exporter for Antigravity (AGY).

Extracts verbatim assistant outputs and user requests from conversation transcripts
and exports them into clean, structured Markdown.

Usage:
  # Dump current/latest conversation to default file (e.g. tmp_dont_touch/packaging-progress-local.md):
  python3 scripts/dump_transcript.py

  # Dump to a custom output path:
  python3 scripts/dump_transcript.py output.md
  python3 scripts/dump_transcript.py -o path/to/report.md

  # List recent conversations:
  python3 scripts/dump_transcript.py --list

  # Dump a specific conversation by ID:
  python3 scripts/dump_transcript.py --id <conversation-id> -o export.md
"""
from __future__ import annotations

import argparse
import datetime
import json
import os
import re
import sys
from pathlib import Path


def get_brain_dir() -> Path:
    """Resolve the Antigravity brain storage directory."""
    app_data = os.environ.get("AGY_APP_DATA_DIR") or os.environ.get("ANTIGRAVITY_APP_DATA_DIR")
    if app_data:
        return Path(app_data).expanduser() / "brain"
    return Path.home() / ".gemini" / "antigravity-cli" / "brain"


def find_conversations(brain_dir: Path) -> list[tuple[float, str, Path]]:
    """Return list of (mtime, conversation_id, transcript_path) sorted latest first."""
    if not brain_dir.is_dir():
        return []

    results = []
    for conv_dir in brain_dir.iterdir():
        if not conv_dir.is_dir():
            continue
        logs_dir = conv_dir / ".system_generated" / "logs"
        t_full = logs_dir / "transcript_full.jsonl"
        t_compact = logs_dir / "transcript.jsonl"

        if t_full.is_file():
            results.append((t_full.stat().st_mtime, conv_dir.name, t_full))
        elif t_compact.is_file():
            results.append((t_compact.stat().st_mtime, conv_dir.name, t_compact))

    results.sort(key=lambda item: item[0], reverse=True)
    return results


def get_first_user_preview(transcript_path: Path) -> str:
    """Extract a short preview of the very first user prompt in the transcript."""
    try:
        with open(transcript_path, "r", encoding="utf-8") as f:
            for line in f:
                data = json.loads(line)
                if data.get("type") == "USER_INPUT":
                    content = data.get("content", "")
                    m = re.search(r"<USER_REQUEST>\s*(.*?)\s*</USER_REQUEST>", content, re.DOTALL)
                    text = m.group(1).strip() if m else content.strip()
                    text = re.sub(r"\s+", " ", text)
                    return text[:70] + ("..." if len(text) > 70 else "")
    except Exception:
        pass
    return "(empty)"


def extract_turns(transcript_path: Path) -> list[dict[str, str]]:
    """
    Parse transcript and extract paired turns:
    [{"user": "...", "assistant": "...", "timestamp": "..."}]
    """
    turns = []
    current_user_parts = []
    current_timestamp = ""

    with open(transcript_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            data = json.loads(line)
            stype = data.get("type")
            content = data.get("content", "")
            created_at = data.get("created_at", "")

            if stype == "USER_INPUT":
                m = re.search(r"<USER_REQUEST>\s*(.*?)\s*</USER_REQUEST>", content, re.DOTALL)
                text = m.group(1).strip() if m else content.strip()
                if text:
                    current_user_parts.append(text)
                if created_at and not current_timestamp:
                    current_timestamp = created_at

            elif stype == "PLANNER_RESPONSE" and content:
                user_prompt = "\n\n".join(current_user_parts) if current_user_parts else "(No prompt)"
                turns.append({
                    "user": user_prompt,
                    "assistant": content.strip(),
                    "timestamp": current_timestamp or created_at,
                })
                current_user_parts = []
                current_timestamp = ""

    return turns


def determine_default_output() -> Path:
    """Find the most sensible default output file."""
    cwd = Path.cwd()
    tmp_dir = cwd / "tmp_dont_touch"
    if tmp_dir.is_dir():
        return tmp_dir / "packaging-progress-local.md"
    return cwd / "conversation-transcript.md"


def export_transcript(transcript_path: Path, conversation_id: str, output_path: Path) -> int:
    """Export turns to markdown file."""
    turns = extract_turns(transcript_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as out:
        out.write("# Antigravity Conversation Transcript\n\n")
        out.write(f"- **Conversation ID:** `{conversation_id}`\n")
        out.write(f"- **Exported At:** {datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}\n")
        out.write(f"- **Total Turns:** {len(turns)}\n\n")

        for idx, turn in enumerate(turns, 1):
            out.write(f"---\n\n## Turn {idx}\n\n")
            if turn["timestamp"]:
                out.write(f"*Timestamp: {turn['timestamp']}*\n\n")
            out.write(f"### User Request\n\n```\n{turn['user']}\n```\n\n")
            out.write(f"### Assistant Output\n\n{turn['assistant']}\n\n")

    return len(turns)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="dump_transcript.py",
        description="Universal exporter for Antigravity conversation transcripts.",
    )
    parser.add_argument(
        "output",
        nargs="?",
        default=None,
        help="Target output markdown file path (defaults to tmp_dont_touch/packaging-progress-local.md if present)",
    )
    parser.add_argument(
        "-o", "--output-file",
        dest="flag_output",
        default=None,
        help="Target output markdown file path",
    )
    parser.add_argument(
        "--id",
        dest="conversation_id",
        default=None,
        help="Specify conversation ID (defaults to latest active conversation)",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List recent conversations with timestamps and preview",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=10,
        help="Number of conversations to show when listing (default: 10)",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    brain_dir = get_brain_dir()
    conversations = find_conversations(brain_dir)

    if not conversations:
        print(f"Error: No conversations found in {brain_dir}", file=sys.stderr)
        sys.exit(1)

    if args.list:
        print(f"\nRecent Conversations ({brain_dir}):\n")
        for mtime, cid, path in conversations[:args.limit]:
            dt = datetime.datetime.fromtimestamp(mtime, tz=datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
            preview = get_first_user_preview(path)
            print(f"  • [{dt}] {cid}\n    Preview: {preview}\n")
        return

    # Select target conversation
    if args.conversation_id:
        match = [c for c in conversations if c[1] == args.conversation_id or c[1].startswith(args.conversation_id)]
        if not match:
            print(f"Error: Conversation with ID '{args.conversation_id}' not found.", file=sys.stderr)
            sys.exit(1)
        _, target_id, target_path = match[0]
    else:
        _, target_id, target_path = conversations[0]

    # Select output path
    out_arg = args.flag_output or args.output
    output_path = Path(out_arg).expanduser().resolve() if out_arg else determine_default_output()

    num_turns = export_transcript(target_path, target_id, output_path)
    print(f"✅ Exported {num_turns} turns from conversation '{target_id}' to:\n   {output_path}")


if __name__ == "__main__":
    main()
