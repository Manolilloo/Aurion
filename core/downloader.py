import os
import shutil
import threading
from concurrent.futures import ThreadPoolExecutor
import yt_dlp

class AurionDownloader:
    def __init__(self, bridge):
        self.bridge = bridge
        self.queue = []
        self.is_downloading = False
        self.cancelled_tasks = set()
        self.lock = threading.Lock()

        # Comprobación de binarios clave en el sistema
        self.has_aria2 = shutil.which("aria2c") is not None
        self.has_ffmpeg = shutil.which("ffmpeg") is not None
        
        print(f"[Core] Estado del sistema -> aria2c: {'DISPONIBLE' if self.has_aria2 else 'NO DETECTADO'} | FFmpeg: {'DISPONIBLE' if self.has_ffmpeg else 'NO DETECTADO'}")

    def cancel_task(self, task_id):
        with self.lock:
            self.cancelled_tasks.add(task_id)
        print(f"[Core] Cancelando tarea: {task_id}")

    def resolve_destination_folder(self, config):
        base_dir = config.get("dir", "J:\\ANIME\\animes")
        is_single = config.get("is_single_season", False)
        season_num = config.get("season_num", 1)

        if not is_single and season_num:
            final_dir = os.path.join(base_dir, f"Temporada {season_num}")
        else:
            final_dir = base_dir

        try:
            os.makedirs(final_dir, exist_ok=True)
        except Exception as e:
            print(f"[Core] Error al crear ruta: {e}")

        return final_dir

    def _build_format_selector(self, res_choice):
        """Traduce la elección del chip de Calidad al selector exacto de yt-dlp."""
        res = str(res_choice).lower().strip()
        if res == "720p":
            return "bestvideo[height<=720]+bestaudio/best[height<=720]/best"
        elif res == "1080p":
            return "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best"
        else:
            # MAX: La máxima calidad absoluta disponible en el servidor
            return "bestvideo+bestaudio/best"

    def start_engine(self, config, tasks=None):
        if self.is_downloading:
            return False

        self.is_downloading = True
        with self.lock:
            self.cancelled_tasks.clear()

        target_tasks = tasks or self.queue
        threading.Thread(target=self._orchestrate_downloads, args=(config, target_tasks), daemon=True).start()
        return True

    def _orchestrate_downloads(self, config, tasks):
        # Chip PARALELAS (20, 10, 5)
        simul_workers = int(config.get("simul", 5))
        dest_folder = self.resolve_destination_folder(config)

        print(f"[Core] Iniciando pool de descargas: {simul_workers} hilos paralelos activos.")

        with ThreadPoolExecutor(max_workers=simul_workers) as executor:
            futures = [
                executor.submit(self._download_single_task, task, dest_folder, config)
                for task in tasks
            ]
            for f in futures:
                try:
                    f.result()
                except Exception as e:
                    print(f"[Core] Error en worker: {e}")

        self.is_downloading = False
        print("[Core] Pool de descargas finalizado con éxito.")

    def _download_single_task(self, task, dest_folder, config):
        task_id = task.get("id")
        title = task.get("title", "Episodio")
        url = task.get("url")

        if not url:
            return

        with self.lock:
            if task_id in self.cancelled_tasks:
                return

        # 1. Leer chips de configuración seleccionados por el usuario
        threads_count = int(config.get("threads", 32))
        res_choice = config.get("res", "max")
        fmt_choice = config.get("fmt", "mp4").lower()
        
        format_selector = self._build_format_selector(res_choice)
        out_template = os.path.join(dest_folder, f"{title}.%(ext)s")

        print(f"[Core] Tarea '{title}' -> Calidad: {res_choice} | Formato: {fmt_choice} | Hilos: {threads_count}")

        def progress_hook(d):
            with self.lock:
                if task_id in self.cancelled_tasks:
                    raise Exception("TASK_CANCELLED_BY_USER")

            if d.get("status") == "downloading":
                downloaded = d.get("downloaded_bytes", 0)
                total = d.get("total_bytes") or d.get("total_bytes_estimate", 0)
                percent = round((downloaded / total) * 100, 1) if total > 0 else 0
                speed_bytes = d.get("speed", 0) or 0
                speed_str = f"{round(speed_bytes / 1024 / 1024, 2)} MB/s" if speed_bytes > 0 else "Acelerando..."

                if self.bridge and self.bridge._window:
                    self.bridge._window.evaluate_js(
                        f"window.updateDownloadProgress && window.updateDownloadProgress('{task_id}', {percent}, '{speed_str}', 'Descargando ({percent}%)');"
                    )
            elif d.get("status") == "finished":
                if self.bridge and self.bridge._window:
                    self.bridge._window.evaluate_js(
                        f"window.updateDownloadProgress && window.updateDownloadProgress('{task_id}', 100, '0 KB/s', 'Completado');"
                    )

        # Opciones avanzadas de saturación de ancho de banda y máxima resolución
        ydl_opts = {
            'outtmpl': out_template,
            'format': format_selector,
            'merge_output_format': fmt_choice,
            'progress_hooks': [progress_hook],
            'nocheckcertificate': True,
            'quiet': True,
            'no_warnings': True,
            'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'referer': task.get("pageUrl", ""),
            # Aceleración extrema para streams HLS/DASH (descarga en ráfagas simultáneas)
            'concurrent_fragment_downloads': threads_count,
            'buffersize': 1024 * 512,       # Buffer de medio mega por conexión
            'http_chunk_size': 20971520,    # Bloques gigantes de 20 MB para exprimir fibra 1 Gbps
            'retries': 10,
            'fragment_retries': 10
        }

        # Inyección de aria2c para enlaces directos HTTP/HTTPS
        if self.has_aria2:
            ydl_opts['external_downloader'] = 'aria2c'
            ydl_opts['external_downloader_args'] = {
                'aria2c': [
                    f'-s{threads_count}',
                    f'-x{threads_count}',
                    f'-j{threads_count}',
                    '-k1M',
                    '--file-allocation=none',
                    '--summary-interval=0',
                    '--retry-wait=1',
                    '--max-tries=5'
                ]
            }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])
            print(f"[Core] Completado con máxima calidad: {title}")
        except Exception as e:
            if "TASK_CANCELLED_BY_USER" in str(e):
                print(f"[Core] Descarga abortada por el usuario: {title}")
                if self.bridge and self.bridge._window:
                    self.bridge._window.evaluate_js(
                        f"window.updateDownloadProgress && window.updateDownloadProgress('{task_id}', 0, 'Cancelado', 'Cancelado');"
                    )
            else:
                print(f"[Core] Error descargando {title}: {e}")
                if self.bridge and self.bridge._window:
                    self.bridge._window.evaluate_js(
                        f"window.updateDownloadProgress && window.updateDownloadProgress('{task_id}', 0, 'Error', 'Fallo al descargar');"
                    )