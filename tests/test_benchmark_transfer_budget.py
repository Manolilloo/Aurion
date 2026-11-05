import unittest

from benchmarks.benchmark_transfer_budget import run_benchmark


class TransferBudgetBenchmarkTests(unittest.TestCase):
    def test_benchmark_compares_fixed_and_adaptive_strategies(self):
        result = run_benchmark(
            [2, 3, 5],
            total_slots=6,
            per_task_ceiling=4,
            latency_seconds=0.01,
            repeats=1,
        )

        self.assertEqual(result["settings"]["total_fragments"], 10)
        self.assertGreaterEqual(result["fixed_budget"]["peak_active_requests"], 1)
        self.assertLessEqual(result["fixed_budget"]["peak_active_requests"], 6)
        self.assertLessEqual(result["adaptive_budget"]["peak_active_requests"], 6)
        self.assertIn("adaptive_time_improvement_percent", result)
        self.assertIn("synthetic_fixed_latency_requests", result["measurement"])

    def test_benchmark_rejects_more_than_eight_tasks(self):
        with self.assertRaises(ValueError):
            run_benchmark([1] * 9, repeats=1)


if __name__ == "__main__":
    unittest.main()
