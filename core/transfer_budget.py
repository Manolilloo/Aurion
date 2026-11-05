"""Shared, adaptive concurrency control for yt-dlp fragment requests.

Each segmented download keeps its configured per-task worker ceiling, while this
coordinator enforces one global in-flight request limit and adjusts each task's
share as other downloads start or finish.
"""
from contextlib import contextmanager
import threading


class SharedFragmentLimiter:
    """Fairly share a fixed number of in-flight media-fragment requests."""

    def __init__(self, total_slots=32):
        try:
            slots = int(total_slots)
        except (TypeError, ValueError, OverflowError):
            slots = 32
        self.total_slots = max(1, min(slots, 256))
        self._condition = threading.Condition()
        self._active_tasks = {}
        self._cancelled_tasks = set()
        self._in_flight = 0
        self._peak_in_flight = 0

    @staticmethod
    def _key(task_id):
        key = str(task_id or "").strip()
        if not key:
            raise ValueError("El identificador de tarea no puede estar vacío.")
        return key

    def snapshot(self):
        """Return a thread-safe view suitable for logs and diagnostics."""
        with self._condition:
            active_count = len(self._active_tasks)
            per_task_limit = (
                (self.total_slots + active_count - 1) // active_count
                if active_count else 0
            )
            return {
                "active_tasks": active_count,
                "active_fragments": self._in_flight,
                "total_slots": self.total_slots,
                "per_task_limit": per_task_limit,
                "peak_active_fragments": self._peak_in_flight,
            }

    @contextmanager
    def register_task(self, task_id):
        """Register one active segmented transfer for its full yt-dlp run."""
        key = self._key(task_id)
        with self._condition:
            if key in self._active_tasks:
                raise RuntimeError(f"La tarea {key} ya está registrada en el coordinador.")
            self._active_tasks[key] = 0
            self._condition.notify_all()

        try:
            yield self.snapshot()
        finally:
            with self._condition:
                # yt-dlp normally joins its fragment workers before returning.
                # Waiting here also makes cleanup safe if an implementation changes.
                while self._active_tasks.get(key, 0):
                    self._condition.wait()
                self._active_tasks.pop(key, None)
                self._condition.notify_all()

    @contextmanager
    def fragment_slot(self, task_id):
        """Acquire one global fragment-request slot, respecting the live fair share."""
        key = self._key(task_id)
        with self._condition:
            while True:
                if key in self._cancelled_tasks:
                    raise RuntimeError("TASK_CANCELLED_BY_USER")
                if key not in self._active_tasks:
                    raise RuntimeError(f"La tarea {key} no está registrada en el coordinador.")

                active_count = len(self._active_tasks)
                # Round up so the global pool is not left partly idle when the
                # number of active downloads does not divide the slot count.
                task_limit = max(1, (self.total_slots + active_count - 1) // active_count)
                task_in_flight = self._active_tasks[key]

                if self._in_flight < self.total_slots and task_in_flight < task_limit:
                    self._active_tasks[key] = task_in_flight + 1
                    self._in_flight += 1
                    self._peak_in_flight = max(self._peak_in_flight, self._in_flight)
                    break

                self._condition.wait()

        try:
            yield
        finally:
            with self._condition:
                self._active_tasks[key] -= 1
                self._in_flight -= 1
                self._condition.notify_all()

    def cancel_task(self, task_id):
        """Wake blocked fragment workers so they can abort a cancelled task."""
        key = self._key(task_id)
        with self._condition:
            self._cancelled_tasks.add(key)
            self._condition.notify_all()

    def clear_cancelled(self, task_id):
        """Forget cancellation state after the task has fully unwound."""
        key = self._key(task_id)
        with self._condition:
            self._cancelled_tasks.discard(key)
            self._condition.notify_all()


def install_yt_dlp_fragment_limiter():
    """Install one transparent FragmentFD hook; non-Aurion yt-dlp instances are untouched."""
    from functools import wraps
    from yt_dlp.downloader.fragment import FragmentFD

    if getattr(FragmentFD, "_aurion_shared_limiter_installed", False):
        return False

    original_download_fragment = FragmentFD._download_fragment

    @wraps(original_download_fragment)
    def _download_fragment_with_shared_limit(self, *args, **kwargs):
        ydl = getattr(self, "ydl", None)
        limiter = getattr(ydl, "_aurion_fragment_limiter", None)
        task_id = getattr(ydl, "_aurion_task_id", None)
        if limiter is None or task_id is None:
            return original_download_fragment(self, *args, **kwargs)

        with limiter.fragment_slot(task_id):
            return original_download_fragment(self, *args, **kwargs)

    FragmentFD._download_fragment = _download_fragment_with_shared_limit
    FragmentFD._aurion_shared_limiter_installed = True
    FragmentFD._aurion_original_download_fragment = original_download_fragment
    return True
