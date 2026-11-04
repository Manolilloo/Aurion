"""Privacy-conscious, rotating diagnostics for media downloads."""

from datetime import datetime, timezone
import json
import os
import threading


_LOG_LOCK = threading.Lock()
_LOG_NAME = "download_diagnostics.jsonl"
_ALLOWED_EVENTS = {"started", "completed", "failed", "cancelled"}
_ALLOWED_FIELDS = {
    "protocol",
    "host",
    "host_class",
    "fragment_workers",
    "aria2_connections",
    "simultaneous_downloads",
    "size_bytes",
    "duration_seconds",
    "average_speed_mib_s",
    "resolution",
    "error_type",
    "recovered",
}


def record_download_event(event, details=None, app_data_dir=None, max_bytes=1024 * 1024):
    """Append one allowlisted event and rotate the previous log when it grows too large."""
    if event not in _ALLOWED_EVENTS:
        return False

    try:
        if app_data_dir is None:
            from .paths import get_app_data_dir
            app_data_dir = get_app_data_dir()

        log_dir = os.path.join(app_data_dir, "logs")
        os.makedirs(log_dir, exist_ok=True)
        log_path = os.path.join(log_dir, _LOG_NAME)
        backup_path = log_path + ".1"

        safe_details = {}
        if isinstance(details, dict):
            for key, value in details.items():
                if key not in _ALLOWED_FIELDS:
                    continue
                if isinstance(value, str):
                    safe_details[key] = value.replace("\r", " ").replace("\n", " ")[:120]
                elif isinstance(value, (int, float, bool)) or value is None:
                    safe_details[key] = value

        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "event": event,
            **safe_details,
        }
        serialized = json.dumps(entry, ensure_ascii=False, separators=(",", ":")) + "\n"

        with _LOG_LOCK:
            if os.path.isfile(log_path) and os.path.getsize(log_path) + len(serialized.encode("utf-8")) > max_bytes:
                try:
                    if os.path.exists(backup_path):
                        os.remove(backup_path)
                    os.replace(log_path, backup_path)
                except OSError:
                    pass

            with open(log_path, "a", encoding="utf-8", newline="\n") as log_file:
                log_file.write(serialized)
        return True
    except Exception:
        return False
