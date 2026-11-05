import threading
import time
import unittest
from types import SimpleNamespace
from concurrent.futures import ThreadPoolExecutor

from core.transfer_budget import SharedFragmentLimiter, install_yt_dlp_fragment_limiter


class SharedFragmentLimiterTests(unittest.TestCase):
    def test_global_fragment_limit_is_never_exceeded(self):
        limiter = SharedFragmentLimiter(total_slots=12)
        task_count = 5
        workers_per_task = 8
        start_barrier = threading.Barrier(task_count)

        def run_task(task_number):
            task_id = f"task-{task_number}"
            with limiter.register_task(task_id):
                start_barrier.wait(timeout=5)

                def fetch_fragment(_):
                    with limiter.fragment_slot(task_id):
                        time.sleep(0.002)

                with ThreadPoolExecutor(max_workers=workers_per_task) as pool:
                    list(pool.map(fetch_fragment, range(24)))

        with ThreadPoolExecutor(max_workers=task_count) as pool:
            list(pool.map(run_task, range(task_count)))

        snapshot = limiter.snapshot()
        self.assertEqual(snapshot["active_tasks"], 0)
        self.assertEqual(snapshot["active_fragments"], 0)
        self.assertLessEqual(snapshot["peak_active_fragments"], 12)
        self.assertGreater(snapshot["peak_active_fragments"], 0)

    def test_remaining_downloads_can_use_slots_released_by_finished_tasks(self):
        limiter = SharedFragmentLimiter(total_slots=32)
        task_ids = [f"task-{index}" for index in range(8)]
        registrations = [limiter.register_task(task_id) for task_id in task_ids]
        slots_by_task = {task_id: [] for task_id in task_ids}

        for registration in registrations:
            registration.__enter__()

        try:
            # Eight tasks start with four in-flight fragments apiece.
            for task_id in task_ids:
                for _ in range(4):
                    slot = limiter.fragment_slot(task_id)
                    slot.__enter__()
                    slots_by_task[task_id].append(slot)

            self.assertEqual(limiter.snapshot()["active_fragments"], 32)

            # Seven downloads finish and release their reservations.
            for task_id in task_ids[1:]:
                for slot in slots_by_task[task_id]:
                    slot.__exit__(None, None, None)
                registrations[int(task_id.split("-")[1])].__exit__(None, None, None)

            snapshot = limiter.snapshot()
            self.assertEqual(snapshot["active_tasks"], 1)
            self.assertEqual(snapshot["active_fragments"], 4)
            self.assertEqual(snapshot["per_task_limit"], 32)

            # The last running download can now grow into the freed capacity.
            for _ in range(28):
                slot = limiter.fragment_slot(task_ids[0])
                slot.__enter__()
                slots_by_task[task_ids[0]].append(slot)

            self.assertEqual(limiter.snapshot()["active_fragments"], 32)
        finally:
            for slot in reversed(slots_by_task[task_ids[0]]):
                slot.__exit__(None, None, None)
            registrations[0].__exit__(None, None, None)

    def test_initial_worker_wave_registers_before_any_task_starts(self):
        limiter = SharedFragmentLimiter()
        limiter.begin_batch(expected_initial_tasks=3)
        observed_counts = []
        lock = threading.Lock()
        observation_barrier = threading.Barrier(3)

        def register(task_number):
            with limiter.register_task(f"initial-{task_number}"):
                with lock:
                    observed_counts.append(limiter.snapshot()["active_tasks"])
                observation_barrier.wait(timeout=5)

        with ThreadPoolExecutor(max_workers=3) as pool:
            list(pool.map(register, range(3)))

        self.assertEqual(observed_counts, [3, 3, 3])
        self.assertEqual(limiter.snapshot()["active_tasks"], 0)

    def test_cancelling_a_task_releases_the_initial_startup_barrier(self):
        limiter = SharedFragmentLimiter()
        limiter.begin_batch(expected_initial_tasks=2)
        attempting_registration = threading.Event()

        def register_cancelled_task():
            attempting_registration.set()
            with limiter.register_task("cancelled-before-start"):
                return "released"

        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(register_cancelled_task)
            self.assertTrue(attempting_registration.wait(timeout=2))
            time.sleep(0.02)
            limiter.cancel_task("cancelled-before-start")
            self.assertEqual(future.result(timeout=2), "released")

        with limiter.register_task("remaining-task"):
            self.assertEqual(limiter.snapshot()["active_tasks"], 1)

    def test_cancelled_task_does_not_remain_blocked_waiting_for_a_slot(self):
        limiter = SharedFragmentLimiter(total_slots=1)

        with limiter.register_task("cancel-me"):
            limiter.cancel_task("cancel-me")
            with self.assertRaisesRegex(RuntimeError, "TASK_CANCELLED_BY_USER"):
                with limiter.fragment_slot("cancel-me"):
                    self.fail("Una tarea cancelada no debe obtener un fragmento.")

            limiter.clear_cancelled("cancel-me")
            with limiter.fragment_slot("cancel-me"):
                self.assertEqual(limiter.snapshot()["active_fragments"], 1)

        self.assertEqual(limiter.snapshot()["active_tasks"], 0)

    def test_cancellation_wakes_a_worker_waiting_for_global_capacity(self):
        limiter = SharedFragmentLimiter(total_slots=1)
        first_slot = None
        waiting = threading.Event()

        with limiter.register_task("first"), limiter.register_task("second"):
            first_slot = limiter.fragment_slot("first")
            first_slot.__enter__()

            def wait_for_capacity():
                waiting.set()
                with limiter.fragment_slot("second"):
                    return "unexpected"

            with ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(wait_for_capacity)
                self.assertTrue(waiting.wait(timeout=2))
                time.sleep(0.02)
                limiter.cancel_task("second")
                with self.assertRaisesRegex(RuntimeError, "TASK_CANCELLED_BY_USER"):
                    future.result(timeout=2)

            first_slot.__exit__(None, None, None)
            limiter.clear_cancelled("second")

        self.assertEqual(limiter.snapshot()["active_fragments"], 0)

    def test_duplicate_task_registration_is_rejected(self):
        limiter = SharedFragmentLimiter()

        with limiter.register_task("same-task"):
            with self.assertRaisesRegex(RuntimeError, "ya está registrada"):
                with limiter.register_task("same-task"):
                    pass

    def test_yt_dlp_fragment_hook_installs_once(self):
        from yt_dlp.downloader.fragment import FragmentFD

        install_yt_dlp_fragment_limiter()
        self.assertTrue(getattr(FragmentFD, "_aurion_shared_limiter_installed", False))
        self.assertFalse(install_yt_dlp_fragment_limiter())

    def test_yt_dlp_fragment_hook_uses_the_shared_limiter(self):
        from yt_dlp.downloader.fragment import FragmentFD

        limiter = SharedFragmentLimiter(total_slots=1)
        fake_downloader = object.__new__(FragmentFD)
        fake_downloader.ydl = SimpleNamespace(
            _aurion_fragment_limiter=limiter,
            _aurion_task_id="hook-test",
        )

        with limiter.register_task("hook-test"):
            limiter.cancel_task("hook-test")
            with self.assertRaisesRegex(RuntimeError, "TASK_CANCELLED_BY_USER"):
                FragmentFD._download_fragment(fake_downloader, {}, None)

    def test_yt_dlp_fragment_hook_holds_a_slot_during_download(self):
        from yt_dlp.downloader.fragment import FragmentFD

        limiter = SharedFragmentLimiter(total_slots=1)
        observations = {}
        fake_downloader = object.__new__(FragmentFD)
        fake_downloader.ydl = SimpleNamespace(
            _aurion_fragment_limiter=limiter,
            _aurion_task_id="hook-test",
        )
        fake_downloader.temp_name = lambda filename: filename
        fake_downloader.filesize_or_none = lambda _filename: 0

        def download_fragment(filename, info_dict):
            observations["filename"] = filename
            observations["active_fragments"] = limiter.snapshot()["active_fragments"]
            return True, None

        fragment_context = {
            "tmpfilename": "sample.tmp",
            "fragment_index": 3,
            "dl": SimpleNamespace(
                params={"continuedl": False},
                download=download_fragment,
            ),
        }

        with limiter.register_task("hook-test"):
            self.assertTrue(
                FragmentFD._download_fragment(
                    fake_downloader,
                    fragment_context,
                    "https://cdn.example/segment.ts",
                    {},
                )
            )
            self.assertEqual(observations["active_fragments"], 1)
            self.assertEqual(observations["filename"], "sample.tmp-Frag3")

        self.assertEqual(limiter.snapshot()["active_fragments"], 0)

    def test_empty_task_id_is_rejected(self):
        limiter = SharedFragmentLimiter()
        with self.assertRaises(ValueError):
            with limiter.register_task(""):
                pass


if __name__ == "__main__":
    unittest.main()
