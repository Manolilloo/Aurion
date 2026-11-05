"""Synthetic benchmark for Aurion's shared fragment-concurrency coordinator.

This measures scheduler behaviour with fixed-latency requests. It does not measure
internet, CDN, provider, disk, or real-video performance.
Run from the repository root:
    python -m benchmarks.benchmark_transfer_budget
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import statistics
import threading
import time

from core.transfer_budget import SharedFragmentLimiter


def _parse_fragment_counts(value):
    try:
        counts = [int(part.strip()) for part in value.split(",")]
    except (TypeError, ValueError) as exc:
        raise argparse.ArgumentTypeError(
            "Usa una lista de enteros separados por comas."
        ) from exc
    if not counts or any(count < 1 for count in counts):
        raise argparse.ArgumentTypeError("Cada descarga debe tener al menos 1 fragmento.")
    if len(counts) > 8:
        raise argparse.ArgumentTypeError("El benchmark admite un máximo de 8 descargas.")
    return counts


def _run_fixed(fragment_counts, total_slots, per_task_ceiling, latency_seconds):
    task_count = len(fragment_counts)
    fixed_workers = max(1, min(per_task_ceiling, total_slots // task_count))
    current_requests = 0
    peak_requests = 0
    lock = threading.Lock()
    global_slots = threading.BoundedSemaphore(total_slots)

    def run_task(fragment_count):
        nonlocal current_requests, peak_requests

        def fetch_fragment(_fragment_index):
            nonlocal current_requests, peak_requests
            with global_slots:
                with lock:
                    current_requests += 1
                    peak_requests = max(peak_requests, current_requests)
                try:
                    time.sleep(latency_seconds)
                finally:
                    with lock:
                        current_requests -= 1

        with ThreadPoolExecutor(max_workers=fixed_workers) as pool:
            list(pool.map(fetch_fragment, range(fragment_count)))

    started = time.perf_counter()
    with ThreadPoolExecutor(max_workers=task_count) as pool:
        list(pool.map(run_task, fragment_counts))
    elapsed = time.perf_counter() - started

    return {
        "elapsed_seconds": elapsed,
        "peak_active_requests": peak_requests,
        "worker_limit_per_task": fixed_workers,
    }


def _run_adaptive(fragment_counts, total_slots, per_task_ceiling, latency_seconds):
    limiter = SharedFragmentLimiter(total_slots=total_slots)
    limiter.begin_batch(expected_initial_tasks=len(fragment_counts))

    def run_task(task_number, fragment_count):
        task_id = f"benchmark-{task_number}"

        def fetch_fragment(_fragment_index):
            with limiter.fragment_slot(task_id):
                time.sleep(latency_seconds)

        with limiter.register_task(task_id):
            with ThreadPoolExecutor(max_workers=per_task_ceiling) as pool:
                list(pool.map(fetch_fragment, range(fragment_count)))

    started = time.perf_counter()
    with ThreadPoolExecutor(max_workers=len(fragment_counts)) as pool:
        futures = [
            pool.submit(run_task, index, count)
            for index, count in enumerate(fragment_counts)
        ]
        for future in futures:
            future.result()
    elapsed = time.perf_counter() - started
    snapshot = limiter.snapshot()

    return {
        "elapsed_seconds": elapsed,
        "peak_active_requests": snapshot["peak_active_fragments"],
        "worker_limit_per_task": per_task_ceiling,
    }


def _summarize(samples, fragment_total):
    elapsed_values = [sample["elapsed_seconds"] for sample in samples]
    median_elapsed = statistics.median(elapsed_values)
    return {
        "median_elapsed_seconds": round(median_elapsed, 4),
        "fragments_per_second": round(fragment_total / median_elapsed, 2),
        "peak_active_requests": max(sample["peak_active_requests"] for sample in samples),
        "worker_limits_per_trial": [sample["worker_limit_per_task"] for sample in samples],
        "trial_seconds": [round(value, 4) for value in elapsed_values],
    }


def run_benchmark(fragment_counts, total_slots=32, per_task_ceiling=16, latency_seconds=0.05, repeats=3):
    if not 1 <= total_slots <= 128:
        raise ValueError("El límite global debe estar entre 1 y 128.")
    if not 1 <= per_task_ceiling <= 16:
        raise ValueError("El máximo por tarea debe estar entre 1 y 16.")
    if not 0.0001 <= latency_seconds <= 5:
        raise ValueError("La latencia simulada debe estar entre 0,0001 y 5 segundos.")
    if not 1 <= repeats <= 20:
        raise ValueError("Las repeticiones deben estar entre 1 y 20.")

    counts = list(fragment_counts)
    if not counts or len(counts) > 8 or any(int(count) < 1 for count in counts):
        raise ValueError("Se requieren entre 1 y 8 descargas con al menos un fragmento.")

    fragment_total = sum(counts)
    fixed_samples = [
        _run_fixed(counts, total_slots, per_task_ceiling, latency_seconds)
        for _ in range(repeats)
    ]
    adaptive_samples = [
        _run_adaptive(counts, total_slots, per_task_ceiling, latency_seconds)
        for _ in range(repeats)
    ]
    fixed = _summarize(fixed_samples, fragment_total)
    adaptive = _summarize(adaptive_samples, fragment_total)
    fixed_time = fixed["median_elapsed_seconds"]
    adaptive_time = adaptive["median_elapsed_seconds"]
    improvement = (
        ((fixed_time - adaptive_time) / fixed_time) * 100
        if fixed_time > 0 else 0.0
    )

    return {
        "benchmark": "aurion_shared_fragment_budget",
        "measurement": "synthetic_fixed_latency_requests",
        "warning": (
            "No mide velocidad de internet, CDN, reproductores, disco ni "
            "descargas reales. Solo compara el reparto de concurrencia."
        ),
        "settings": {
            "fragment_counts_per_task": counts,
            "total_fragments": fragment_total,
            "global_slots": total_slots,
            "per_task_ceiling": per_task_ceiling,
            "simulated_request_latency_seconds": latency_seconds,
            "repeats": repeats,
        },
        "fixed_budget": fixed,
        "adaptive_budget": adaptive,
        "adaptive_time_improvement_percent": round(improvement, 2),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--fragments",
        type=_parse_fragment_counts,
        default=_parse_fragment_counts("8,16,24,32,48,64,80,96"),
        help="Fragmentos por descarga, separados por comas (máximo 8 descargas).",
    )
    parser.add_argument("--slots", type=int, default=32, help="Límite global de peticiones.")
    parser.add_argument("--workers", type=int, default=16, help="Máximo de workers por tarea.")
    parser.add_argument("--latency", type=float, default=0.05, help="Latencia simulada por fragmento.")
    parser.add_argument("--repeats", type=int, default=3, help="Número de repeticiones por estrategia.")
    args = parser.parse_args()

    try:
        result = run_benchmark(
            args.fragments,
            total_slots=args.slots,
            per_task_ceiling=args.workers,
            latency_seconds=args.latency,
            repeats=args.repeats,
        )
    except ValueError as exc:
        parser.error(str(exc))
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
