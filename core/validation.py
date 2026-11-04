"""Input validation helpers shared by Aurion's bridge and downloader."""

import re
from urllib.parse import urlsplit

_EXTENSION_ORIGIN_RE = re.compile(r"^chrome-extension://[a-p]{32}$", re.IGNORECASE)
_TASK_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,80}$")
_INVALID_FILENAME_CHARS_RE = re.compile(r'[\x00-\x1f<>:"/\\|?*]')


def is_trusted_extension_origin(origin: str) -> bool:
    """Accept requests only from a Chromium extension origin."""
    return isinstance(origin, str) and bool(_EXTENSION_ORIGIN_RE.fullmatch(origin))


def is_http_url(value: str, max_length: int = 8192) -> bool:
    """Return True only for bounded absolute HTTP(S) URLs without credentials."""
    if not isinstance(value, str):
        return False
    value = value.strip()
    if not value or len(value) > max_length or any(ord(ch) < 32 for ch in value):
        return False
    try:
        parsed = urlsplit(value)
        return (
            parsed.scheme.lower() in {"http", "https"}
            and bool(parsed.hostname)
            and parsed.username is None
            and parsed.password is None
            and (parsed.port is None or 1 <= parsed.port <= 65535)
        )
    except ValueError:
        return False


def is_safe_task_id(value: str) -> bool:
    """Task IDs are used in temp paths and DOM/JavaScript identifiers."""
    return isinstance(value, str) and bool(_TASK_ID_RE.fullmatch(value))


def sanitize_path_component(value: str, default: str = "video", max_length: int = 80) -> str:
    """Build a safe single path component, including Windows reserved names."""
    if not isinstance(value, str):
        value = str(value or "")
    cleaned = _INVALID_FILENAME_CHARS_RE.sub("_", value).strip().rstrip(". ")
    cleaned = cleaned[:max_length].rstrip(". ")
    if not cleaned or cleaned in {".", ".."}:
        cleaned = default

    stem = cleaned.split(".", 1)[0].upper()
    reserved = {"CON", "PRN", "AUX", "NUL"} | {
        f"{prefix}{number}" for prefix in ("COM", "LPT") for number in range(1, 10)
    }
    if stem in reserved:
        cleaned = f"_{cleaned}"
    return cleaned or default
