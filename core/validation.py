"""Input validation helpers shared by Aurion's bridge and downloader."""

import ipaddress
import re
from urllib.parse import urlsplit

_EXTENSION_ORIGIN_RE = re.compile(r"^chrome-extension://[a-p]{32}$", re.IGNORECASE)
_TASK_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,80}$")
_INVALID_FILENAME_CHARS_RE = re.compile(r'[\x00-\x1f<>:"/\\|?*]')


def is_trusted_extension_origin(origin: str) -> bool:
    """Accept requests only from a Chromium extension origin."""
    return isinstance(origin, str) and bool(_EXTENSION_ORIGIN_RE.fullmatch(origin))


_MEDIA_ORIGIN_HOSTS = {
    "animeflv.net",
    "animeonline.ninja",
    "jkanime.net",
    "tioanime.com",
    "monoschinos2.com",
    "pelisplushd.bz",
    "icuevana3.video",
    "dominioshdfull.com",
    "streamtape.com",
    "tapecontent.net",
    "mixdrop.co",
    "mixdrop.to",
    "mixdrop.ag",
    "mp4upload.com",
    "voe.sx",
    "uqload.com",
    "yourupload.com",
    "streamwish.com",
    "filelions.to",
    "vidhide.com",
    "sprintcdn.com",
    "doodstream.com",
    "d000d.com",
}


def is_allowed_local_api_origin(origin: str) -> bool:
    """Allow the extension and the media portals/hosts that its content script monitors."""
    if is_trusted_extension_origin(origin):
        return True
    if not isinstance(origin, str) or len(origin) > 512:
        return False
    try:
        parsed = urlsplit(origin)
        if parsed.scheme.lower() not in {"http", "https"}:
            return False
        if not parsed.hostname or parsed.username is not None or parsed.password is not None:
            return False
        if parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
            return False
        host = parsed.hostname.lower().rstrip(".")
        return any(host == domain or host.endswith("." + domain) for domain in _MEDIA_ORIGIN_HOSTS)
    except ValueError:
        return False


def is_http_url(value: str, max_length: int = 8192) -> bool:
    """Return True only for bounded absolute HTTP(S) URLs without credentials."""
    if not isinstance(value, str):
        return False
    value = value.strip()
    if not value or len(value) > max_length or any(ord(ch) < 32 for ch in value):
        return False
    try:
        parsed = urlsplit(value)
        hostname = (parsed.hostname or "").lower().rstrip(".")
        if not hostname or hostname in {"localhost", "localhost.localdomain"} or hostname.endswith((".localhost", ".local")):
            return False
        try:
            literal_ip = ipaddress.ip_address(hostname)
            if not literal_ip.is_global:
                return False
        except ValueError:
            pass
        return (
            parsed.scheme.lower() in {"http", "https"}
            and parsed.username is None
            and parsed.password is None
            and (parsed.port is None or 1 <= parsed.port <= 65535)
        )
    except ValueError:
        return False


def is_trusted_update_url(value: str) -> bool:
    """Accept only Aurion release assets or the repository's GitHub source archive."""
    if not isinstance(value, str) or len(value) > 4096:
        return False
    try:
        parsed = urlsplit(value.strip())
        if parsed.scheme.lower() != "https" or parsed.username is not None or parsed.password is not None:
            return False
        if parsed.hostname == "github.com":
            return parsed.path.startswith("/Manolilloo/Aurion/releases/download/")
        if parsed.hostname == "api.github.com":
            return parsed.path.startswith((
                "/repos/Manolilloo/Aurion/zipball/",
                "/repos/Manolilloo/Aurion/legacy.zipball/",
            ))
        return False
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
