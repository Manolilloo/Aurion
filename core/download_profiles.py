"""Deterministic transfer profiles for the supported media protocols.

The profile keeps segmented streams on yt-dlp's fragment downloader and reserves
aria2 for direct HTTP files, where multi-connection range downloads make sense.
"""
from dataclasses import dataclass
import re
from urllib.parse import urlparse


@dataclass(frozen=True)
class DownloadProfile:
    protocol: str
    host_class: str
    fragment_workers: int
    use_aria2: bool
    aria_connections: int
    reason: str


_TOKEN_SENSITIVE_HOSTS = (
    "streamtape",
    "tapecontent",
    "mixdrop",
    "mixdrp",
    "mxcontent",
    "yourupload",
    "vidcache",
    "dood",
    "d000d",
)


def _safe_int(value, default):
    try:
        return int(value)
    except (TypeError, ValueError, OverflowError):
        return default


def _url_host(url):
    try:
        return (urlparse(str(url)).hostname or "").lower()
    except (TypeError, ValueError):
        return ""


def _detect_protocol(url, is_youtube=False, protocol_hint=None):
    if is_youtube:
        return "youtube"

    value = str(url or "").lower()
    if re.search(r"\.m3u8(?:[?#]|$)", value):
        return "hls"
    if re.search(r"\.mpd(?:[?#]|$)", value):
        return "dash"
    if re.search(r"\.(?:mp4|webm|mkv)(?:[?#]|$)", value):
        return "http"
    if protocol_hint in {"http", "hls", "dash"}:
        return protocol_hint
    return "http"



_RETRYABLE_SEGMENT_MARKERS = (
    "429",
    "500",
    "502",
    "503",
    "504",
    "timed out",
    "timeout",
    "connection reset",
    "connection aborted",
    "remote end closed",
    "incomplete read",
    "unable to download a fragment",
    "unable to download a segment",
)


def effective_parallel_downloads(configured_workers, task_count, maximum=8):
    """Return the actual number of workers needed for the current batch."""
    configured = max(1, min(_safe_int(configured_workers, 1), maximum))
    count = max(0, _safe_int(task_count, 0))
    return min(configured, count)


def fragment_fallback_levels(current_workers):
    """Return progressively smaller, unique fragment-worker counts."""
    current = max(1, _safe_int(current_workers, 8))
    candidates = (max(4, current // 2), 4)
    return tuple(dict.fromkeys(value for value in candidates if 0 < value < current))


def is_retryable_segment_error(error_text):
    """Limit adaptive retries to transient network/fragment failures."""
    message = str(error_text or "").lower()
    if re.search(r"\\b(?:401|403|404)\\b", message):
        return False
    return any(marker in message for marker in _RETRYABLE_SEGMENT_MARKERS if not marker.isdigit()) or bool(
        re.search(r"\\b(?:429|500|502|503|504)\\b", message)
    )

def build_download_profile(
    url,
    configured_threads=32,
    configured_aria_connections=16,
    has_aria2=False,
    is_youtube=False,
    simultaneous_downloads=1,
    protocol_hint=None,
):
    """Choose conservative, protocol-aware transfer settings without network probes."""
    protocol = _detect_protocol(url, is_youtube=is_youtube, protocol_hint=protocol_hint)
    host = _url_host(url)
    active_downloads = max(1, min(_safe_int(simultaneous_downloads, 1), 8))
    per_task_budget = max(4, 32 // active_downloads)

    if protocol == "youtube":
        return DownloadProfile(
            protocol="youtube",
            host_class="youtube",
            fragment_workers=8,
            use_aria2=False,
            aria_connections=0,
            reason="YouTube conserva su perfil de yt-dlp.",
        )

    if protocol in {"hls", "dash"}:
        requested_workers = max(4, _safe_int(configured_threads, 16))
        # Share a 32-worker budget across active downloads so a large batch
        # cannot make every stream open dozens of fragment requests at once.
        fragment_workers = min(requested_workers, 16, per_task_budget)
        return DownloadProfile(
            protocol=protocol,
            host_class="segmented",
            fragment_workers=fragment_workers,
            use_aria2=False,
            aria_connections=0,
            reason=(
                f"Fragmentos con yt-dlp; presupuesto de {per_task_budget} por "
                f"descarga ({active_downloads} simultáneas)."
            ),
        )

    requested_connections = _safe_int(configured_aria_connections, 16)
    requested_connections = max(1, min(requested_connections, 16))
    requested_connections = min(requested_connections, max(2, per_task_budget))

    if "mp4upload" in host:
        host_class = "mp4upload"
        aria_connections = min(requested_connections, 8)
        reason = "MP4Upload utiliza un máximo de 8 conexiones."
    elif any(marker in host for marker in _TOKEN_SENSITIVE_HOSTS):
        host_class = "token-sensitive"
        aria_connections = min(requested_connections, 4)
        reason = "Servidor sensible a conexiones paralelas: máximo 4."
    else:
        host_class = "standard"
        aria_connections = requested_connections
        reason = "Archivo directo: aria2 puede dividir la descarga si está disponible."

    use_aria2 = bool(has_aria2)
    return DownloadProfile(
        protocol="http",
        host_class=host_class,
        fragment_workers=8,
        use_aria2=use_aria2,
        aria_connections=aria_connections if use_aria2 else 0,
        reason=reason if use_aria2 else "aria2 no está disponible; se usa yt-dlp.",
    )
