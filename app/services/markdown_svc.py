"""
Markdown rendering service.

Wraps markdown-it-py with a curated plugin set for rich document output:
  - Tables, strikethrough (CommonMark extensions)
  - Front-matter (YAML metadata block, stripped from output)
  - Footnotes
  - Task lists (GitHub-style checkboxes)
  - Linkification
  - Typographer (smart quotes, dashes)
  - Pandoc-style Fenced Divs (::: class / ::: {.class #id key=value} ... :::)
  - Inline spans & attributes ([text]{.class #id})

The renderer is a module-level singleton — build cost is paid once.
"""
from html import escape
import shlex

from markdown_it import MarkdownIt
from mdit_py_plugins.attrs import attrs_block_plugin, attrs_plugin
from mdit_py_plugins.container import container_plugin
from mdit_py_plugins.footnote import footnote_plugin
from mdit_py_plugins.front_matter import front_matter_plugin
from mdit_py_plugins.tasklists import tasklists_plugin


# ---------------------------------------------------------------------------
# Code highlighter (no external lib — just adds language classes for CSS)
# ---------------------------------------------------------------------------

def _highlight_code(code: str, lang: str, attrs: str) -> str:  # noqa: ARG001
    """Wrap code blocks with a language class for CSS-based highlighting."""
    escaped = escape(code)
    lang_class = f"language-{lang}" if lang else "language-text"
    return f'<pre class="code-block"><code class="{lang_class}">{escaped}</code></pre>'


# ---------------------------------------------------------------------------
# Pandoc-style Fenced Divs parser & renderer (::: class / ::: {.class #id})
# ---------------------------------------------------------------------------

def _parse_fenced_div_info(info: str) -> tuple[list[str], str | None, dict[str, str]]:
    """Parse Pandoc/Myst container info line:

    Examples:
      ::: warning
      ::: {.warning #my-id}
      ::: {.callout color="blue" data-align="center"}
    """
    info = info.strip()
    classes: list[str] = []
    element_id: str | None = None
    attrs: dict[str, str] = {}

    if info.startswith("{") and info.endswith("}"):
        info = info[1:-1].strip()

    try:
        parts = shlex.split(info)
    except Exception:
        parts = info.split()

    for part in parts:
        if part.startswith("."):
            classes.append(part[1:])
        elif part.startswith("#"):
            element_id = part[1:]
        elif "=" in part:
            k, v = part.split("=", 1)
            attrs[k] = v
        elif part:
            classes.append(part)

    return classes, element_id, attrs


def _render_fenced_div(self, tokens, idx, options, env) -> str:
    token = tokens[idx]
    if token.nesting == 1:
        classes, element_id, attrs = _parse_fenced_div_info(token.info)
        attr_strs = []
        if classes:
            attr_strs.append(f'class="{escape(" ".join(classes))}"')
        if element_id:
            attr_strs.append(f'id="{escape(element_id)}"')
        for k, v in attrs.items():
            attr_strs.append(f'{escape(k)}="{escape(v)}"')
        attrs_joined = (" " + " ".join(attr_strs)) if attr_strs else ""
        return f"<div{attrs_joined}>\n"
    return "</div>\n"


# ---------------------------------------------------------------------------
# Renderer singleton
# ---------------------------------------------------------------------------

def _build_renderer() -> MarkdownIt:
    md = (
        MarkdownIt(
            "commonmark",
            {
                "html": True,
                "linkify": True,
                "typographer": True,
                "highlight": _highlight_code,
            },
        )
        .enable(["table", "strikethrough"])
        .use(front_matter_plugin)
        .use(footnote_plugin)
        .use(tasklists_plugin)
        .use(attrs_plugin, spans=True)
        .use(attrs_block_plugin)
    )

    # Register generic fenced divs container for :::
    container_plugin(
        md,
        name="fenced_div",
        marker=":",
        validate=lambda params, markup: True,
        render=_render_fenced_div,
    )

    return md


_renderer = _build_renderer()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def render_markdown(text: str) -> str:
    """
    Convert *text* (markdown) to an HTML fragment.

    Returns an HTML body fragment — no <html> or <body> wrapper.
    Caller is responsible for embedding it in a full document when needed.
    """
    return _renderer.render(text)
