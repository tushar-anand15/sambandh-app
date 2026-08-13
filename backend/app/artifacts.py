"""Sakarma's published meeting documents, cleaned enough to read.

Every meeting in ``meetings.meeting`` may carry up to three artifacts in
``meetings.artifact``: a decision register (``dr_html``), the minutes
(``minutes_html``) and attachments (``attachment_pdf``). The two HTML ones are
already the document a council published. This module fetches one from
``gs://sulekhasakarma-meetings`` and rewrites it into a fragment the site can
put on a page.

Two reasons the rewrite happens here and not in the browser.

**It is third-party HTML.** The files are ASP.NET pages carrying ``<script>``
blocks, ``__VIEWSTATE`` inputs and ``javascript:__doPostBack`` links. Injecting
any of that into the site would hand the page to whatever the portal serves.
The parser below keeps a fixed list of tags, drops every attribute except
``colspan`` and ``rowspan``, and discards the rest of the document.

**It is Word paste.** Decisions are typed into Word and pasted into the portal,
so the register carries ``mso-`` styles, ``<o:p>`` tags, ``<span>`` soup that
splits a sentence across thirty elements, and the ``Normal 0 false false false
EN-US X-NONE ML`` block Word writes when its style definitions are pasted as
text. Stripping that is what makes the document legible.

Serving is a proxy, not a signed URL. ``app/presign.py`` signs the project PDFs
because those are megabytes the API has no reason to carry and no reason to
rewrite. Neither is true here: a register is 100 to 400 KB, and the sanitising
above has to happen server-side whether or not a signing identity exists, so a
signed URL would move the same bytes through a second hop and hand the browser
the unsanitised original.
"""

from __future__ import annotations

import os
import re
from html import escape
from html.parser import HTMLParser

# The bucket the Sakarma crawl writes to, in GCP project sulekhasakarma-495616.
BUCKET = os.environ.get("MEETINGS_BUCKET", "sulekhasakarma-meetings")

# The two artifact types that are documents rather than attachments, keyed by
# the URL segment the frontend asks for.
KINDS: dict[str, str] = {"dr": "dr_html", "minutes": "minutes_html"}

# What each one is called on the page, in the register's own terms.
KIND_LABEL: dict[str, str] = {
    "dr": "Decision register",
    "minutes": "Minutes",
}

# Nothing published is anywhere near this large; the largest dr.html in the
# corpus is under 3 MB. The cap is here so a malformed object cannot pull an
# arbitrary amount of memory into the API process.
MAX_BYTES = 8 * 1024 * 1024


# ---------------------------------------------------------------------------
# Sanitising
# ---------------------------------------------------------------------------

# The portal wraps the document itself in this element and everything else on
# the page is chrome: a print script, a postback form, and the hidden inputs
# ASP.NET round-trips. When it is present, nothing outside it is kept.
CONTENT_ID = "Panel1"

# Whether this document has that wrapper at all. Decided before the parse so a
# file without one falls back to keeping the whole body rather than nothing.
_HAS_PANEL = re.compile(r'id\s*=\s*["\']?' + CONTENT_ID + r'["\'\s>]')

# Kept because the register is a table of decisions and loses its meaning
# without one. Everything not named here is unwrapped or dropped.
KEEP = {
    "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption",
    "p", "br", "b", "strong", "i", "em", "u", "sup", "sub",
    "ul", "ol", "li", "h1", "h2", "h3", "h4", "hr",
}

# Dropped with their contents. `head` goes because the title and the print
# stylesheet are not part of the document.
DROP_TREE = {"script", "style", "head", "select", "textarea", "iframe",
             "object", "embed", "noscript", "svg", "math", "button"}

# Dropped as a tag, contents kept. `span` and `font` are the Word soup;
# `div` and `form` are ASP.NET layout; `a` is always a postback link here.
UNWRAP = {"div", "span", "font", "form", "a", "center", "tt", "big", "small",
          "label", "section", "article", "main", "header", "footer", "nobr"}

# Dropped entirely, tag and contents. `input` and `img` are void so they have
# no contents; `o:p` is Word's empty paragraph marker.
DROP_SELF = {"input", "img", "link", "meta", "base", "col", "colgroup",
             "area", "source", "track", "param", "o:p", "v:shapetype",
             "v:shape", "st1:place", "st1:country-region"}

VOID = {"br", "hr"}

ATTRS = {"colspan", "rowspan"}

# Word writes its own style panel out as text when a document is pasted in as
# plain HTML: "Normal 0 false false false EN-US X-NONE ML". After the three
# `false`s come locale codes, which are upper case, so the trailing group stops
# at the first ordinary word and cannot eat the decision that follows it.
WORD_BOILERPLATE = re.compile(
    r"Normal\s+0\s+(?:false\s+){2,3}"
    r"(?:[A-Z][A-Z0-9-]*\s+)*"
    r"(?:MicrosoftInternetExplorer4\s*)?",
)
# Left behind by the same paste: bare style-definition fragments.
WORD_LEFTOVERS = re.compile(
    r"/\*\s*Style Definitions\s*\*/|mso-[a-z-]+\s*:[^;\"']*;?",
)


class _Cleaner(HTMLParser):
    """Rewrites one Sakarma document into a fragment the site can render."""

    def __init__(self, only_content: bool) -> None:
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.open_tags: list[str] = []
        # Depth inside a subtree being discarded. Non-zero means drop text.
        self.dropping = 0
        # True when the document has a Panel1 wrapper, in which case nothing
        # outside it is kept.
        self.only_content = only_content
        self.content_depth: int | None = None
        self.div_depth = 0

    @property
    def _writing(self) -> bool:
        if self.dropping:
            return False
        return self.content_depth is not None or not self.only_content

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        ids = dict(attrs)

        if tag == "div":
            self.div_depth += 1
            if ids.get("id") == CONTENT_ID and self.content_depth is None:
                self.content_depth = self.div_depth
                return

        if tag in DROP_TREE:
            self.dropping += 1
            return
        if self.dropping:
            return
        if tag in DROP_SELF:
            return
        if tag in UNWRAP:
            return
        if tag not in KEEP:
            return
        if not self._writing:
            return

        kept = "".join(
            f' {name}="{escape(value, quote=True)}"'
            for name, value in attrs
            if name.lower() in ATTRS and value and value.strip().isdigit()
        )
        self.out.append(f"<{tag}{kept}>")
        if tag not in VOID:
            self.open_tags.append(tag)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if tag in VOID and self._writing and not self.dropping:
            self.out.append(f"<{tag}>")

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()

        if tag in DROP_TREE:
            self.dropping = max(0, self.dropping - 1)
            return
        if self.dropping:
            return

        if tag == "div":
            closing_content = self.content_depth == self.div_depth
            self.div_depth = max(0, self.div_depth - 1)
            if closing_content:
                self.content_depth = None
            return

        if tag in UNWRAP or tag in DROP_SELF or tag in VOID or tag not in KEEP:
            return
        if not self._writing:
            return

        # The source is not well-formed: a stray </td> with no opener is common.
        if tag in self.open_tags:
            while self.open_tags:
                open_tag = self.open_tags.pop()
                self.out.append(f"</{open_tag}>")
                if open_tag == tag:
                    break

    def handle_data(self, data: str) -> None:
        if self.dropping or not self._writing:
            return
        text = WORD_BOILERPLATE.sub(" ", data)
        text = WORD_LEFTOVERS.sub(" ", text)
        if not text.strip():
            # A run of whitespace between two elements still separates words.
            if text and self.out and not self.out[-1].endswith(" "):
                self.out.append(" ")
            return
        self.out.append(escape(text, quote=False))

    def handle_comment(self, data: str) -> None:  # noqa: D401 - dropped outright
        return

    def result(self) -> str:
        while self.open_tags:
            self.out.append(f"</{self.open_tags.pop()}>")
        return "".join(self.out)


# Empty cells and paragraphs the Word paste leaves behind, collapsed after the
# parse because they are only recognisable once their contents are gone.
_EMPTY_BLOCK = re.compile(r"<(p|h[1-4]|li)>(?:\s|&nbsp;|<br>)*</\1>")
_EMPTY_ROW = re.compile(r"<tr>(?:\s*<t[dh][^>]*>(?:\s|&nbsp;|<br>)*</t[dh]>\s*)*</tr>")
_EMPTY_TABLE = re.compile(r"<table>\s*</table>")
_SPACES = re.compile(r"[ \t\r\f\v]+")
_BLANK_LINES = re.compile(r"\n{2,}")


def sanitise(raw: str) -> str:
    """One Sakarma document as a fragment: no scripts, no styles, no Word.

    The output carries only the tags in ``KEEP``, and the only attributes that
    survive are ``colspan`` and ``rowspan`` with an integer value. Everything
    else — every ``style``, every ``id``, every ``href``, every ``on*`` handler
    — is gone, so the fragment cannot reach outside the page it lands on.
    """
    cleaner = _Cleaner(only_content=_HAS_PANEL.search(raw) is not None)
    cleaner.feed(raw)
    cleaner.close()
    html = cleaner.result()

    for _ in range(3):  # Nested empties need more than one pass.
        before = html
        html = _EMPTY_BLOCK.sub("", html)
        html = _EMPTY_ROW.sub("", html)
        html = _EMPTY_TABLE.sub("", html)
        if html == before:
            break

    html = html.replace(" ", " ")
    html = _SPACES.sub(" ", html)
    html = _BLANK_LINES.sub("\n", html)
    return html.strip()


def is_empty(html: str) -> bool:
    """True when the fragment carries no readable text."""
    return not re.sub(r"<[^>]*>", "", html).strip()


# ---------------------------------------------------------------------------
# Fetching
# ---------------------------------------------------------------------------

_client = None


def _storage_client():
    global _client
    if _client is None:
        from google.cloud import storage  # imported late: not needed by tests

        _client = storage.Client()
    return _client


class ArtifactUnavailable(RuntimeError):
    """The object is named in the database but could not be read."""


def download(gcs_path: str, bucket: str | None = None) -> str:
    """One object from the meetings bucket, decoded as text.

    Sakarma serves these as UTF-8 and declares it in a meta tag, but a handful
    are Windows-1252 with Malayalam in numeric character references. Decoding
    with ``errors="replace"`` keeps the rest of the document readable instead
    of failing the whole request on one byte.
    """
    try:
        client = _storage_client()
        blob = client.bucket(bucket or BUCKET).blob(gcs_path)
        data = blob.download_as_bytes(end=MAX_BYTES - 1)
    except Exception as err:  # noqa: BLE001 - the cause is reported, not swallowed
        raise ArtifactUnavailable(str(err)) from err
    return data.decode("utf-8", errors="replace")
