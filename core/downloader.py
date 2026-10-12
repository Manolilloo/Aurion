import os
import sys
import shutil
import threading
from urllib.parse import urlparse
from concurrent.futures import ThreadPoolExecutor
import yt_dlp

def get_binary_path(binary_name):
    """Devuelve la ruta absoluta al ejecutable en bin/ tanto en desarrollo como congelado con PyInstaller."""
    if getattr(sys, 'frozen', False):
        base_dir = getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
    else:
        # Raíz del proyecto (subiendo un nivel desde 'core')
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    local_exe = os.path.join(base_dir, 'bin', f"{binary_name}.exe")
    if os.path.exists(local_exe):
        return local_exe

    # Fallback al PATH de Windows si existe
    system_path = shutil.which(binary_name)
    return system_path if system_path else None


class AurionDownloader:
    def __init__(self, bridge):
        self.bridge = bridge
        self.queue = []
        self.is_downloading = False
        self.cancelled_tasks = set()
        self.lock = threading.Lock()

        self.aria2_path = get_binary_path("aria2c")
        self.ffmpeg_path = get_binary_path("ffmpeg")

        self.has_aria2 = self.aria2_path is not None
        self.has_ffmpeg = self.ffmpeg_path is not None
        
        status_aria = f"DISPONIBLE ({self.aria2_path})" if self.has_aria2 else "NO DETECTADO"
        status_ffmpeg = f"DISPONIBLE ({self.ffmpeg_path})" if self.has_ffmpeg else "NO DETECTADO"
        print(f"[Core] Estado del sistema -> aria2c: {status_aria} | FFmpeg: {status_ffmpeg}")
        self._cleanup_orphaned_temp_dirs()

    def _cleanup_orphaned_temp_dirs(self):
        """Barre cualquier carpeta residual .tmp_* que haya quedado de cierres inesperados."""
        def run_cleanup():
            check_dirs = ["J:\\ANIME\\animes", "J:\\ANIME\\peliculas"]
            for base in check_dirs:
                if not os.path.exists(base):
                    continue
                try:
                    for root, dirs, _ in os.walk(base):
                        for d in list(dirs):
                            if d.startswith(".tmp_"):
                                target_path = os.path.join(root, d)
                                try:
                                    shutil.rmtree(target_path, ignore_errors=True)
                                    print(f"[Core Limpieza] Carpeta temporal residual eliminada: {target_path}")
                                except Exception:
                                    pass
                except Exception:
                    pass
        threading.Thread(target=run_cleanup, daemon=True).start()

    def cancel_task(self, task_id):
        with self.lock:
            self.cancelled_tasks.add(task_id)
        print(f"[Core] Cancelando tarea: {task_id}")

    def resolve_destination_folder(self, config):
        base_dir = config.get("dir", "J:\\ANIME\\animes")
        mode = config.get("active_mode", "anime")
        anime_title = config.get("title", "").strip()
        clean_title = "".join(c for c in anime_title if c not in r'\/:*?"<>|').strip()

        # MODO YOUTUBE: Crear carpeta con el nombre exacto del vídeo o lista en el destino elegido
        if config.get("is_youtube") or mode == "youtube":
            if config.get("is_playlist") and config.get("create_playlist_subfolder", True):
                pl_title = config.get("playlist_title") or clean_title or "Playlist_YouTube"
                final_dir = os.path.abspath(os.path.join(base_dir, pl_title))
            else:
                yt_folder_name = clean_title or "Video_YouTube"
                final_dir = os.path.abspath(os.path.join(base_dir, yt_folder_name))
        # MODO CINE: Carpeta propia con el título de la película (sin temporadas)
        elif mode == "movie":
            if clean_title and clean_title != "Esperando consulta...":
                final_dir = os.path.join(base_dir, clean_title)
            else:
                final_dir = base_dir
        else:
            # MODO ANIME: Detección automática de temporada por regex en el título
            is_single = config.get("is_single_season", False)
            season_num = config.get("season_num", 1)

            import re
            detected_season = None
            if clean_title:
                # Patrones tipo: 2nd Season, Season 2, Temporada 2, 2da Temporada, S2
                m = re.search(r'(?:(\d+)(?:st|nd|rd|th|da|ra)?\s*(?:season|temporada))|(?:(?:season|temporada)\s*(\d+))|(?:\bS(\d+)\b)', clean_title, re.IGNORECASE)
                if m:
                    num_str = m.group(1) or m.group(2) or m.group(3)
                    if num_str and num_str.isdigit():
                        detected_season = int(num_str)

            effective_season = detected_season if detected_season is not None else season_num

            # Normalizar nombre raíz del anime retirando la etiqueta de temporada para no duplicar carpetas
            root_anime_folder = clean_title
            if detected_season is not None:
                root_anime_folder = re.sub(r'[\s\-_]*(?:(?:\d+(?:st|nd|rd|th|da|ra)?\s*(?:season|temporada))|(?:(?:season|temporada)\s*\d+)|(?:\bS\d+\b)).*$', '', clean_title, flags=re.IGNORECASE).strip()
                if not root_anime_folder:
                    root_anime_folder = clean_title

            if is_single:
                if root_anime_folder and root_anime_folder != "Esperando consulta...":
                    final_dir = os.path.join(base_dir, root_anime_folder)
                else:
                    final_dir = base_dir
            else:
                if root_anime_folder and root_anime_folder != "Esperando consulta...":
                    final_dir = os.path.join(base_dir, root_anime_folder, f"Temporada {effective_season}")
                else:
                    final_dir = os.path.join(base_dir, f"Temporada {effective_season}")

        try:
            os.makedirs(final_dir, exist_ok=True)
        except Exception as e:
            print(f"[Core] Error al crear ruta: {e}")

        return final_dir

    def _probe_resolution_ffprobe(self, media_url, headers):
        """Usa ffprobe para leer la resolución exacta de los primeros paquetes sin inventar nada."""
        if not self.has_ffmpeg:
            return None
        try:
            import subprocess
            import json

            ffprobe_exe = self.ffmpeg_path.replace('ffmpeg.exe', 'ffprobe.exe') if self.ffmpeg_path else 'ffprobe'
            if not os.path.exists(ffprobe_exe):
                ffprobe_exe = shutil.which('ffprobe') or 'ffprobe'

            header_str = "".join([f"{k}: {v}\r\n" for k, v in headers.items()])
            cmd = [
                ffprobe_exe,
                '-v', 'quiet',
                '-print_format', 'json',
                '-show_streams',
                '-headers', header_str,
                media_url
            ]

            proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=4)
            if proc.returncode == 0:
                data = json.loads(proc.stdout.decode('utf-8'))
                for s in data.get('streams', []):
                    if s.get('codec_type') == 'video':
                        height = s.get('height')
                        if height:
                            return f"{height}p"
        except Exception:
            pass
        return None

    def _probe_direct_m3u8_fast(self, url, headers):
        """Sonda ultra rápida por HTTP: analiza manifiestos HLS sin latencia ni bloqueos de yt-dlp."""
        import urllib.request
        import re

        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=3.5) as resp:
                content = resp.read().decode('utf-8', errors='ignore')

            # 1. Buscar resoluciones maestras declaradas: RESOLUTION=1920x1080
            res_matches = re.findall(r'RESOLUTION=\d+x(\d+)', content)
            detected_res = None
            if res_matches:
                max_h = max(int(h) for h in res_matches)
                detected_res = f"{max_h}p"

            # 2. Estimar peso mediante duración total y BANDWIDTH medio si no es master
            estimated_bytes = 0
            bw_matches = re.findall(r'BANDWIDTH=(\d+)', content)
            dur_matches = re.findall(r'#EXTINF:([\d\.]+)', content)

            if dur_matches:
                total_duration = sum(float(d) for d in dur_matches)
                # Si tenemos bitrate asignado, calcular peso exacto
                if bw_matches:
                    max_bw = max(int(b) for b in bw_matches)
                    estimated_bytes = int((max_bw * total_duration) / 8)
                else:
                    # Tasa estándar para 1080p Web-DL (~2200 kbps)
                    estimated_bytes = int((2200 * 1000 * total_duration) / 8)

            return estimated_bytes, detected_res
        except Exception:
            return 0, None

    def probe_media_info(self, url, page_url=""):
        if not url:
            return 0, "N/D"

        import re

        # Normalizar espejos de streaming hacia el master.m3u8 real
        probe_url = url
        if any(srv in probe_url.lower() for srv in ["filelions", "streamwish", "vidhide", "playmate", "earnvids"]):
            if "index-f" in probe_url.lower():
                probe_url = re.sub(r'index-f\d+-[^\.]+\.m3u8', 'master.m3u8', probe_url)

        parsed_url = urlparse(probe_url)
        origin_domain = f"{parsed_url.scheme}://{parsed_url.netloc}"
        referer = origin_domain + "/"

        netloc = parsed_url.netloc.lower()
        if "mp4upload" in netloc:
            referer = "https://www.mp4upload.com/"
        elif any(s in netloc for s in ["sprintcdn", "streamwish", "filelions", "vidhide", "hglamioz", "wish"]):
            referer = origin_domain + "/"
        elif page_url:
            referer = page_url
        else:
            referer = origin_domain + "/"

        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            'Referer': referer,
            'Origin': origin_domain,
            'Accept': '*/*'
        }

        # Intento rápido preliminar: HEAD para archivos directos (.mp4) y HLS para .m3u8
        fast_bytes, fast_res = 0, None
        if '.m3u8' in probe_url.lower():
            fast_bytes, fast_res = self._probe_direct_m3u8_fast(probe_url, headers)
        else:
            # Para servidores directos como Mp4Upload: obtener Content-Length al instante
            try:
                import urllib.request
                head_req = urllib.request.Request(probe_url, headers=headers, method='HEAD')
                with urllib.request.urlopen(head_req, timeout=3.5) as resp:
                    cl = resp.headers.get('Content-Length')
                    if cl and cl.isdigit():
                        fast_bytes = int(cl)
            except Exception:
                pass

        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'nocheckcertificate': True,
            'http_headers': headers,
            'skip_download': True,
            'socket_timeout': 5,
            'ffmpeg_location': os.path.dirname(self.ffmpeg_path) if self.ffmpeg_path else None
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(probe_url, download=False)
                if not info:
                    return fast_bytes, fast_res or "N/D"

                real_height = info.get('height')
                if not real_height and 'formats' in info:
                    for f in reversed(info['formats']):
                        if f.get('height'):
                            real_height = f.get('height')
                            break

                res_str = f"{real_height}p" if real_height else fast_res

                if not res_str:
                    res_str = self._probe_resolution_ffprobe(probe_url, headers)

                if not res_str:
                    res_str = "N/D"

                size_bytes = info.get('filesize') or info.get('filesize_approx') or fast_bytes
                if size_bytes == 0:
                    duration = info.get('duration') or 0
                    tbr = info.get('tbr') or 0
                    if duration > 0 and tbr > 0:
                        size_bytes = int((tbr * 1000 * duration) / 8)

                return int(size_bytes), res_str

        except Exception as e:
            print(f"[Core Sonda] Metadatos en fallback: {e}")
            res_str = fast_res or self._probe_resolution_ffprobe(probe_url, headers) or "N/D"
            return int(fast_bytes), res_str

    def start_engine(self, config, tasks=None):
        if self.is_downloading:
            return False

        self.is_downloading = True
        with self.lock:
            self.cancelled_tasks.clear()

        target_tasks = tasks or self.queue
        threading.Thread(target=self._orchestrate_downloads, args=(config, target_tasks), daemon=True).start()
        return True

    def _save_cover_image(self, config):
        if not config.get("save_cover", True):
            return

        cover_url = config.get("cover_url", "").strip()
        if not cover_url or cover_url.startswith("data:"):
            return

        base_dir = config.get("dir", "J:\\ANIME\\animes")
        anime_title = config.get("title", "").strip()
        clean_title = "".join(c for c in anime_title if c not in r'\/:*?"<>|').strip()

        if clean_title and clean_title != "Esperando consulta...":
            root_anime_dir = os.path.join(base_dir, clean_title)
        else:
            root_anime_dir = base_dir

        try:
            os.makedirs(root_anime_dir, exist_ok=True)
            cover_path = os.path.join(root_anime_dir, "cover.jpg")

            if not os.path.exists(cover_path):
                import urllib.request
                req = urllib.request.Request(cover_url, headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                })
                with urllib.request.urlopen(req, timeout=10) as resp, open(cover_path, 'wb') as out_f:
                    out_f.write(resp.read())
                print(f"[Core] Portada guardada en raíz: {cover_path}")
        except Exception as e:
            print(f"[Core] Error descargando portada: {e}")

    def _orchestrate_downloads(self, config, tasks):
        simul_workers = int(config.get("simul", 5))
        dest_folder = self.resolve_destination_folder(config)

        self._save_cover_image(config)

        print(f"\n[Core] Iniciando pool de descargas: {simul_workers} simultáneas en '{dest_folder}'")

        with ThreadPoolExecutor(max_workers=simul_workers) as executor:
            futures = [
                executor.submit(self._download_single_task, task, dest_folder, config)
                for task in tasks
            ]
            for f in futures:
                try:
                    f.result()
                except Exception as e:
                    print(f"[Core] Error no capturado en worker: {e}")

        self.is_downloading = False
        print("\n[Core] Todas las tareas del lote han concluido.")

        if config.get("open_folder", True):
            try:
                abs_dest = os.path.abspath(dest_folder)
                has_files = os.path.exists(abs_dest) and any(not f.startswith('.') for f in os.listdir(abs_dest))
                if has_files:
                    print(f"[Core] Abriendo carpeta en explorador: {abs_dest}")
                    os.startfile(abs_dest)
                else:
                    if os.path.exists(abs_dest) and not os.listdir(abs_dest):
                        try:
                            os.rmdir(abs_dest)
                        except Exception:
                            pass
            except Exception as e:
                print(f"[Core] Error abriendo carpeta: {e}")

    def _download_single_task(self, task, dest_folder, config):
        task_id = task.get("id")
        title = task.get("title", "Episodio")
        url = task.get("url")

        if not url:
            return

        # Si la extensión interceptó una sub-playlist degradada (f1/v1), apuntamos al master para desbloquear la máxima resolución
        if any(srv in url.lower() for srv in ["filelions", "streamwish", "vidhide"]):
            if "index-f" in url.lower():
                import re
                url = re.sub(r'index-f\d+-[^\.]+\.m3u8', 'master.m3u8', url)

        with self.lock:
            if task_id in self.cancelled_tasks:
                return

        raw_threads = int(config.get("threads", 32))
        is_m3u8 = '.m3u8' in url.lower()
        threads_count = max(8, raw_threads)

        is_yt = config.get("is_youtube", False)
        is_audio = config.get("is_audio_only", False)
        quality = str(config.get("quality", "1080"))

        if is_yt and is_audio:
            fmt_choice = "mp3"
            format_selector = "bestaudio/best"
        elif is_yt:
            fmt_choice = "mp4"
            q_str = str(quality).lower().strip()
            if q_str in ["max", "máx"]:
                format_selector = "bestvideo+bestaudio/best"
            elif q_str == "min":
                format_selector = "worstvideo+worstaudio/worst"
            else:
                if q_str == "4k":
                    h = 2160
                elif q_str == "2k":
                    h = 1440
                elif q_str.endswith("p") and q_str[:-1].isdigit():
                    h = int(q_str[:-1])
                elif q_str.isdigit():
                    h = int(q_str)
                else:
                    h = 1080
                format_selector = f"bestvideo[height<={h}]+bestaudio/best[height<={h}]/best"
        else:
            fmt_choice = str(config.get("fmt", "mp4")).replace(".", "").lower().strip()
            if fmt_choice not in ["mp4", "mkv"]:
                fmt_choice = "mp4"
            format_selector = "bestvideo[height<=1080]+bestaudio/best[height<=1080]/bestvideo+bestaudio/best"

        import re

        clean_file_title = "".join(c for c in title if c not in r'\/:*?"<>|').strip() or "video"

        # Estandarización automática de nombres para Anime (formato Plex / Jellyfin)
        mode = config.get("active_mode", "anime")
        is_yt = config.get("is_youtube", False)

        if mode == "anime" and not is_yt:
            # Buscar número de episodio (ej: - Ep 15, Ep. 15, E15, Capitulo 15)
            ep_match = re.search(r'(?:[\s\-_]+(?:Episodio|Capitulo|Episode|Cap|Ep|E)[\s\-_]*|#\s*)(\d+)', clean_file_title, re.IGNORECASE)
            # Buscar número de temporada si existe en el título o configuración
            sea_match = re.search(r'(?:(\d+)(?:st|nd|rd|th|da|ra)?\s*(?:season|temporada))|(?:(?:season|temporada)\s*(\d+))|(?:\bS(\d+)\b)', clean_file_title, re.IGNORECASE)

            if ep_match:
                ep_num = int(ep_match.group(1))
                detected_season = None
                if sea_match:
                    s_str = sea_match.group(1) or sea_match.group(2) or sea_match.group(3)
                    if s_str and s_str.isdigit():
                        detected_season = int(s_str)

                # Priorizar temporada del título, luego de configuración, por defecto 1
                final_s = detected_season if detected_season is not None else int(config.get("season_num", 1))

                # Extraer nombre base del anime sin la etiqueta del episodio ni de temporada
                raw_base_name = clean_file_title[:ep_match.start()].strip()
                clean_anime_base = re.sub(r'[\s\-_]*(?:(?:\d+(?:st|nd|rd|th|da|ra)?\s*(?:season|temporada))|(?:(?:season|temporada)\s*\d+)|(?:\bS\d+\b)).*$', '', raw_base_name, flags=re.IGNORECASE).strip()
                if not clean_anime_base:
                    clean_anime_base = raw_base_name or "Episodio"

                clean_file_title = f"{clean_anime_base} - S{final_s:02d}E{ep_num:02d}"

        task_temp_dir = os.path.join(dest_folder, f".tmp_{task_id}")
        os.makedirs(task_temp_dir, exist_ok=True)
        out_template = os.path.join(task_temp_dir, f"{clean_file_title}.%(ext)s")

        parsed_url = urlparse(url)
        netloc = parsed_url.netloc.lower()
        origin_domain = f"{parsed_url.scheme}://{parsed_url.netloc}"

        # Detección inteligente de Referer según el servidor de streaming
        page_ref = task.get("pageUrl") or ""
        if "mp4upload" in netloc:
            referer = "https://www.mp4upload.com/"
        elif any(s in netloc for s in ["sprintcdn", "streamwish", "filelions", "vidhide", "hglamioz", "wish", "playmate", "earnvids"]):
            referer = origin_domain + "/"
        elif page_ref:
            referer = page_ref
        else:
            referer = origin_domain + "/"

        print(f"\n[Core -> Tarea Iniciada] {title}")
        print(f"      Formato: .{fmt_choice} | Hilos: {threads_count} | Host: {netloc}")

        setattr(self, f"_p_{task_id}", 0)
        current_stream_type = {"val": "video" if not is_audio else "audio"}

        def progress_hook(d):
            with self.lock:
                if task_id in self.cancelled_tasks:
                    raise Exception("TASK_CANCELLED_BY_USER")

            if d.get("status") == "downloading":
                downloaded = d.get("downloaded_bytes", 0)
                total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0

                raw_percent = (downloaded / total * 100) if total > 0 else 0

                if is_yt and not is_audio:
                    if current_stream_type["val"] == "video":
                        percent = round((raw_percent * 0.85), 1)
                    else:
                        percent = round(85.0 + (raw_percent * 0.14), 1)
                else:
                    frag_index = d.get("fragment_index")
                    frag_count = d.get("fragment_count")
                    if frag_index and frag_count and frag_count > 0:
                        percent = round((frag_index / frag_count) * 100, 1)
                    else:
                        percent = round(raw_percent, 1)

                last_p = getattr(self, f"_p_{task_id}", 0)
                if percent >= last_p:
                    setattr(self, f"_p_{task_id}", percent)
                else:
                    percent = last_p

                speed_bytes = d.get("speed", 0) or 0
                speed_str = f"{round(speed_bytes / 1024 / 1024, 2)} MB/s" if speed_bytes > 0 else "Descargando..."

                if total > 0 and self.bridge and self.bridge._window:
                    self.bridge._window.evaluate_js(
                        f"window.updateRealSizeOnly && window.updateRealSizeOnly('{task_id}', {total});"
                    )

                if self.bridge and self.bridge._window:
                    self.bridge._window.evaluate_js(
                        f"window.updateDownloadProgress && window.updateDownloadProgress('{task_id}', {percent}, '{speed_str}', 'Descargando ({percent}%)');"
                    )

            elif d.get("status") == "finished":
                if is_yt and not is_audio and current_stream_type["val"] == "video":
                    current_stream_type["val"] = "audio"
                    if self.bridge and self.bridge._window:
                        self.bridge._window.evaluate_js(
                            f"window.updateDownloadProgress && window.updateDownloadProgress('{task_id}', 85, 'Procesando', 'Descargando pista de audio...');"
                        )
                else:
                    if self.bridge and self.bridge._window:
                        self.bridge._window.evaluate_js(
                            f"window.updateDownloadProgress && window.updateDownloadProgress('{task_id}', 99, 'Procesando', 'Ensamblando archivo final...');"
                        )

        postprocessors_list = []
        if is_yt and is_audio:
            postprocessors_list.append({
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '320',
            })
        elif not is_yt:
            postprocessors_list.append({
                'key': 'FFmpegVideoRemuxer',
                'preferedformat': fmt_choice
            })

        ydl_opts = {
            'outtmpl': out_template,
            'format': format_selector,
            'merge_output_format': 'mp4' if (is_yt and not is_audio) else (fmt_choice if not is_yt else None),
            'progress_hooks': [progress_hook],
            'nocheckcertificate': True,
            'quiet': True,
            'no_warnings': True,
            'retries': 20,
            'fragment_retries': 20,
            'skip_unavailable_fragments': True,
            'socket_timeout': 15,
            'retry_sleep_functions': {'http': lambda n: 0.5, 'fragment': lambda n: 0.5},
            'hls_use_mpegts': True,
            'fixup': 'warn',
            'postprocessors': postprocessors_list,
            'ffmpeg_location': os.path.dirname(self.ffmpeg_path) if self.ffmpeg_path else None
        }

        if is_yt:
            ydl_opts.update({
                'concurrent_fragment_downloads': 1,
                'http_chunk_size': 10485760,
                'buffersize': 1024 * 1024 * 4,
                'merge_output_format': 'mp4' if not is_audio else None,
            })
        else:
            # Headers específicos para servidores de streaming de anime/películas
            ydl_opts['http_headers'] = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                'Referer': referer if referer and referer != "://" else 'https://animeflv.net/',
                'Origin': origin_domain if origin_domain and origin_domain != "://" else 'https://animeflv.net',
                'Accept': '*/*',
                'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
            }
            ydl_opts['buffersize'] = 1024 * 1024 * 16
            ydl_opts['concurrent_fragment_downloads'] = min(16, threads_count)

            # Mp4Upload utiliza tokens efímeros que bloquean aria2c (403) y ocultan el progreso en tiempo real.
            # En Mp4Upload usamos el descargador nativo para reportar % fluido y evitar bloqueos.
            if self.has_aria2 and not is_m3u8 and "mp4upload" not in netloc:
                max_aria_conns = min(16, threads_count)
                ydl_opts['external_downloader'] = self.aria2_path
                ydl_opts['external_downloader_args'] = {
                    'aria2c': [
                        '--console-log-level=error',
                        '--summary-interval=0',
                        f'-s{max_aria_conns}',
                        f'-x{max_aria_conns}',
                        '-k1M',
                        '--file-allocation=none',
                        '--optimize-concurrent-downloads=true',
                        f'--max-connection-per-server={max_aria_conns}',
                        '--min-split-size=1M',
                        f'--header=Referer: {referer}',
                        f'--header=Origin: {origin_domain}',
                        '--header=User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
                    ]
                }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)

                width = info.get('width', 'N/A')
                height = info.get('height', 'N/A')
                vcodec = info.get('vcodec', 'N/A')
                acodec = info.get('acodec', 'N/A')
                fps = info.get('fps', 'N/A')

                # Si yt-dlp devolvió N/A en un stream HLS, leer el archivo ensamblado con ffprobe
                final_res_label = f"{height}p" if height != 'N/A' else None
                if not final_res_label or height == 'N/A':
                    clean_name_check = "".join(c for c in title if c not in r'\/:*?"<>|').strip() or "video"
                    target_file = os.path.join(dest_folder, f"{clean_name_check}.{fmt_choice}")
                    if os.path.exists(target_file):
                        probe_res = self._probe_resolution_ffprobe(target_file, {})
                        if probe_res:
                            final_res_label = probe_res

                print(f"\n=======================================================")
                print(f"[Core Telemetría] {title}")
                print(f"   -> Archivo generado: {title}.{fmt_choice}")
                print(f"   -> Resolución Real: {width}x{height} ({final_res_label or 'N/A'})")
                print(f"   -> FPS: {fps} | Códec Vídeo: {vcodec} | Audio: {acodec}")
                print(f"   -> Hilos de fragmentos usados: {threads_count}")
                print(f"=======================================================\n")

                if final_res_label and self.bridge and self.bridge._window:
                    self.bridge._window.evaluate_js(
                        f"window.updateTaskMetadata && window.updateTaskMetadata('{task_id}', null, '{final_res_label}');"
                    )

            generated_files = [f for f in os.listdir(task_temp_dir) if not f.endswith('.part') and not f.startswith('.')]
            clean_file_name = "".join(c for c in title if c not in r'\/:*?"<>|').strip() or "video"
            final_file_path = os.path.join(dest_folder, f"{clean_file_name}.{fmt_choice}")

            if generated_files:
                generated_files.sort(key=lambda x: os.path.getsize(os.path.join(task_temp_dir, x)), reverse=True)
                source_temp = os.path.join(task_temp_dir, generated_files[0])

                if os.path.exists(final_file_path):
                    try:
                        os.remove(final_file_path)
                    except Exception as err:
                        print(f"[Core] Sobrescribiendo archivo existente: {err}")

                try:
                    shutil.move(source_temp, final_file_path)
                except Exception:
                    shutil.copy2(source_temp, final_file_path)
                    try:
                        os.remove(source_temp)
                    except Exception:
                        pass

            real_file_bytes = 0
            if os.path.exists(final_file_path):
                real_file_bytes = os.path.getsize(final_file_path)

            if self.bridge and self.bridge._window:
                if real_file_bytes > 0:
                    self.bridge._window.evaluate_js(
                        f"window.updateRealSizeOnly && window.updateRealSizeOnly('{task_id}', {real_file_bytes});"
                    )
                self.bridge._window.evaluate_js(
                    f"window.updateDownloadProgress && window.updateDownloadProgress('{task_id}', 100, '0 KB/s', 'Completado');"
                )
        except Exception as e:
            if "TASK_CANCELLED_BY_USER" in str(e):
                print(f"[Core] Descarga cancelada: {title}")
                if self.bridge and self.bridge._window:
                    self.bridge._window.evaluate_js(
                        f"window.updateDownloadProgress && window.updateDownloadProgress('{task_id}', 0, 'Cancelado', 'Cancelado');"
                    )
                # Purga inmediata y forzada del directorio temporal tras la cancelación
                import time, gc
                gc.collect()
                time.sleep(0.3)
                for _ in range(5):
                    try:
                        if os.path.exists(task_temp_dir):
                            shutil.rmtree(task_temp_dir, ignore_errors=True)
                        break
                    except Exception:
                        time.sleep(0.2)
            else:
                import traceback
                print(f"[Core] Error descargando {title}:")
                traceback.print_exc()
                if self.bridge and self.bridge._window:
                    self.bridge._window.evaluate_js(
                        f"window.updateDownloadProgress && window.updateDownloadProgress('{task_id}', 0, 'Error', 'Fallo al descargar');"
                    )
        finally:
            try:
                shutil.rmtree(task_temp_dir, ignore_errors=True)
            except Exception:
                pass