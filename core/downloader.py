import os
import sys
import shutil
import threading
import time
import gc
import stat
import atexit
from urllib.parse import urlparse
from concurrent.futures import ThreadPoolExecutor
import yt_dlp

def get_binary_path(binary_name):
    """Devuelve la ruta absoluta al ejecutable en bin/ tanto en desarrollo como congelado con PyInstaller."""
    if getattr(sys, 'frozen', False):
        base_dir = getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
    else:
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    local_exe = os.path.join(base_dir, 'bin', f"{binary_name}.exe")
    if os.path.exists(local_exe):
        return local_exe

    system_path = shutil.which(binary_name)
    return system_path if system_path else None


class AurionDownloader:
    def __init__(self, bridge):
        self.bridge = bridge
        self.queue = []
        self.is_downloading = False
        self.cancelled_tasks = set()
        self.active_temp_dirs = set()
        self.lock = threading.Lock()

        atexit.register(self._cleanup_on_exit)

        self.aria2_path = get_binary_path("aria2c")
        self.ffmpeg_path = get_binary_path("ffmpeg")

        self.has_aria2 = self.aria2_path is not None
        self.has_ffmpeg = self.ffmpeg_path is not None
        
        status_aria = f"DISPONIBLE ({self.aria2_path})" if self.has_aria2 else "NO DETECTADO"
        status_ffmpeg = f"DISPONIBLE ({self.ffmpeg_path})" if self.has_ffmpeg else "NO DETECTADO"
        print(f"[Core] Estado del sistema -> aria2c: {status_aria} | FFmpeg: {status_ffmpeg}")
        self._cleanup_orphaned_temp_dirs()

    def _cleanup_on_exit(self):
        """Se ejecuta automáticamente cuando la app se cierra por cualquier motivo."""
        with self.lock:
            dirs_to_clean = list(self.active_temp_dirs)
        for d in dirs_to_clean:
            self._force_remove_temp_dir(d)

    def cleanup_all_temp(self):
        """Elimina de disco cualquier carpeta temporal registrada o huérfana."""
        with self.lock:
            dirs = list(self.active_temp_dirs)
            self.active_temp_dirs.clear()

        for d in dirs:
            self._force_remove_temp_dir(d)

    def _force_remove_temp_dir(self, target_path):
        """Desbloquea permisos en Windows y borra la carpeta temporal sin dejar rastro."""
        if not target_path or not os.path.exists(target_path):
            return

        import gc
        import subprocess

        with self.lock:
            self.active_temp_dirs.discard(os.path.abspath(target_path))

        gc.collect()

        def _on_rm_error(func, path, exc_info):
            try:
                os.chmod(path, stat.S_IWRITE)
                func(path)
            except Exception:
                pass

        for _ in range(3):
            try:
                shutil.rmtree(target_path, onerror=_on_rm_error)
                if not os.path.exists(target_path):
                    return
            except Exception:
                time.sleep(0.12)

        try:
            cmd = f'rmdir /s /q "{os.path.abspath(target_path)}"'
            subprocess.run(cmd, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=2)
        except Exception:
            pass

    def _cleanup_orphaned_temp_dirs(self):
        """Barre cualquier carpeta residual .tmp_* de cierres bruscos o caídas de corriente."""
        def run_cleanup():
            check_dirs = set()
            try:
                cfg = getattr(self.bridge, 'config', {}) or {}
                for m in ['anime', 'movie', 'youtube']:
                    d = cfg.get(m, {}).get('dir')
                    if d and os.path.exists(d):
                        check_dirs.add(os.path.abspath(d))
            except Exception:
                pass

            check_dirs.update(["J:\\ANIME\\animes", "J:\\ANIME\\peliculas", "J:\\ANIME"])

            for base in check_dirs:
                if not os.path.exists(base):
                    continue
                try:
                    for root, dirs, _ in os.walk(base, topdown=False):
                        for d in list(dirs):
                            if d.startswith(".tmp_"):
                                target_path = os.path.join(root, d)
                                self._force_remove_temp_dir(target_path)
                                print(f"[Core Limpieza] Carpeta temporal residual purgada: {target_path}")
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

        if config.get("is_youtube") or mode == "youtube":
            if config.get("is_playlist") and config.get("create_playlist_subfolder", True):
                pl_title = config.get("playlist_title") or clean_title or "Playlist_YouTube"
                final_dir = os.path.abspath(os.path.join(base_dir, pl_title))
            else:
                yt_folder_name = clean_title or "Video_YouTube"
                final_dir = os.path.abspath(os.path.join(base_dir, yt_folder_name))
        elif mode == "movie":
            if clean_title and clean_title != "Esperando consulta...":
                final_dir = os.path.join(base_dir, clean_title)
            else:
                final_dir = base_dir
        else:
            is_single = config.get("is_single_season", False)
            season_num = config.get("season_num", 1)

            import re
            detected_season = None
            if clean_title:
                m = re.search(r'(?:(\d+)(?:st|nd|rd|th|da|ra)?\s*(?:season|temporada))|(?:(?:season|temporada)\s*(\d+))|(?:\bS(\d+)\b)', clean_title, re.IGNORECASE)
                if m:
                    num_str = m.group(1) or m.group(2) or m.group(3)
                    if num_str and num_str.isdigit():
                        detected_season = int(num_str)

            effective_season = detected_season if detected_season is not None else season_num

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

            res_matches = re.findall(r'RESOLUTION=\d+x(\d+)', content)
            detected_res = None
            if res_matches:
                max_h = max(int(h) for h in res_matches)
                detected_res = f"{max_h}p"

            estimated_bytes = 0
            bw_matches = re.findall(r'BANDWIDTH=(\d+)', content)
            dur_matches = re.findall(r'#EXTINF:([\d\.]+)', content)

            if dur_matches:
                total_duration = sum(float(d) for d in dur_matches)
                if bw_matches:
                    max_bw = max(int(b) for b in bw_matches)
                    estimated_bytes = int((max_bw * total_duration) / 8)
                else:
                    estimated_bytes = int((2200 * 1000 * total_duration) / 8)

            return estimated_bytes, detected_res
        except Exception:
            return 0, None

    def probe_media_info(self, url, page_url=""):
        """Sonda de metadatos optimizada: instantánea para MP4Upload/Streamtape/Filemoon sin demoras."""
        if not url:
            return 0, "N/D"

        import re
        import urllib.request

        probe_url = url
        if any(srv in probe_url.lower() for srv in ["filelions", "streamwish", "vidhide", "playmate", "earnvids", "vixeo"]):
            if "index-f" in probe_url.lower():
                probe_url = re.sub(r'index-f\d+-[^\.]+\.m3u8', 'master.m3u8', probe_url)

        parsed_url = urlparse(probe_url)
        origin_domain = f"{parsed_url.scheme}://{parsed_url.netloc}"
        referer = origin_domain + "/"

        netloc = parsed_url.netloc.lower()
        if "mp4upload" in netloc:
            referer = "https://www.mp4upload.com/"
        elif "streamtape" in netloc:
            referer = "https://streamtape.com/"
        elif any(s in netloc for s in ["sprintcdn", "streamwish", "filelions", "vidhide", "hglamioz", "wish", "vixeo"]):
            referer = origin_domain + "/"
        elif page_url:
            referer = page_url

        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
            'Referer': referer,
            'Origin': origin_domain,
            'Accept': '*/*'
        }

        # 1. MP4UPLOAD & STREAMTAPE: Sonda no bloqueante con cabeceras Range
        if "mp4upload" in netloc:
            mp4_headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
                'Referer': 'https://www.mp4upload.com/',
                'Origin': 'https://www.mp4upload.com',
                'Range': 'bytes=0-1'
            }
            try:
                req = urllib.request.Request(probe_url, headers=mp4_headers)
                with urllib.request.urlopen(req, timeout=2.0) as resp:
                    cr = resp.headers.get('Content-Range')
                    if cr and '/' in cr:
                        total_bytes = cr.split('/')[-1]
                        if total_bytes.isdigit():
                            return int(total_bytes), "1080p"
                    cl = resp.headers.get('Content-Length')
                    if cl and cl.isdigit() and int(cl) > 1024 * 1024:
                        return int(cl), "1080p"
            except Exception:
                pass
            # Si falla la sonda inicial, devolver valor por defecto de inmediato sin bloquear la cola
            return 160 * 1024 * 1024, "1080p"

        if "streamtape" in netloc or (not probe_url.lower().endswith(".m3u8") and ".mp4" in probe_url.lower()):
            try:
                head_req = urllib.request.Request(probe_url, headers=headers, method='HEAD')
                with urllib.request.urlopen(head_req, timeout=2.0) as resp:
                    cl = resp.headers.get('Content-Length')
                    if cl and cl.isdigit() and int(cl) > 1024 * 1024:
                        return int(cl), "1080p"
            except Exception:
                pass

        # 2. HLS FAST PROBE (.m3u8 de VIXEO, Filemoon, CDNs)
        if '.m3u8' in probe_url.lower():
            fast_bytes, fast_res = self._probe_direct_m3u8_fast(probe_url, headers)
            if fast_bytes > 0:
                return fast_bytes, fast_res or "1080p"

        # 3. Fallback solo si es estrictamente necesario
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'nocheckcertificate': True,
            'http_headers': headers,
            'skip_download': True,
            'socket_timeout': 4,
            'ffmpeg_location': os.path.dirname(self.ffmpeg_path) if self.ffmpeg_path else None
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(probe_url, download=False)
                if not info:
                    return 0, "1080p"

                real_height = info.get('height')
                if not real_height and 'formats' in info:
                    for f in reversed(info['formats']):
                        if f.get('height'):
                            real_height = f.get('height')
                            break

                res_str = f"{real_height}p" if real_height else "1080p"
                size_bytes = info.get('filesize') or info.get('filesize_approx') or 0
                return int(size_bytes), res_str
        except Exception:
            return 0, "1080p"

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

        import re
        root_anime_folder = clean_title
        if clean_title and clean_title != "Esperando consulta...":
            root_anime_folder = re.sub(
                r'[\s\-_]*(?:(?:\d+(?:st|nd|rd|th|da|ra)?\s*(?:season|temporada))|(?:(?:season|temporada)\s*\d+)|(?:\bS\d+\b)).*$',
                '',
                clean_title,
                flags=re.IGNORECASE
            ).strip() or clean_title
            root_anime_dir = os.path.join(base_dir, root_anime_folder)
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

        any_success = False
        with ThreadPoolExecutor(max_workers=simul_workers) as executor:
            futures = [
                executor.submit(self._download_single_task, task, dest_folder, config)
                for task in tasks
            ]
            for f in futures:
                try:
                    if f.result() is True:
                        any_success = True
                except Exception as e:
                    print(f"[Core] Error no capturado en worker: {e}")

        self.is_downloading = False
        print("\n[Core] Todas las tareas del lote han concluido.")

        if any_success and config.get("open_folder", True):
            def _delayed_open(target_dest):
                try:
                    time.sleep(0.8)
                    parent_folder = os.path.dirname(target_dest)
                    target_open = parent_folder if os.path.basename(target_dest).lower().startswith("temporada") else target_dest
                    abs_dest = os.path.abspath(target_open if os.path.exists(target_open) else target_dest)

                    if os.path.exists(abs_dest):
                        print(f"[Core] Abriendo carpeta en explorador: {abs_dest}")
                        os.startfile(abs_dest)
                except Exception as e:
                    print(f"[Core] Error abriendo carpeta: {e}")

            threading.Thread(target=_delayed_open, args=(dest_folder,), daemon=True).start()

    def _download_single_task(self, task, dest_folder, config):
        task_id = task.get("id")
        title = task.get("title", "Episodio")
        url = task.get("url")

        if not url:
            return False

        import re
        if any(srv in url.lower() for srv in ["filelions", "streamwish", "vidhide", "vixeo"]):
            if "index-f" in url.lower():
                url = re.sub(r'index-f\d+-[^\.]+\.m3u8', 'master.m3u8', url)

        with self.lock:
            if task_id in self.cancelled_tasks:
                return False

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
            elif q_str in ["min", "144", "144p"]:
                format_selector = "worstvideo+bestaudio/worst"
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

        clean_file_title = "".join(c for c in title if c not in r'\/:*?"<>|').strip() or "video"

        mode = config.get("active_mode", "anime")
        if mode == "anime" and not is_yt:
            ep_match = re.search(r'(?:[\s\-_]+(?:Episodio|Capitulo|Episode|Cap|Ep|E)[\s\-_]*|#\s*)(\d+)', clean_file_title, re.IGNORECASE)
            sea_match = re.search(r'(?:(\d+)(?:st|nd|rd|th|da|ra)?\s*(?:season|temporada))|(?:(?:season|temporada)\s*(\d+))|(?:\bS(\d+)\b)', clean_file_title, re.IGNORECASE)

            if ep_match:
                ep_num = int(ep_match.group(1))
                detected_season = None
                if sea_match:
                    s_str = sea_match.group(1) or sea_match.group(2) or sea_match.group(3)
                    if s_str and s_str.isdigit():
                        detected_season = int(s_str)

                final_s = detected_season if detected_season is not None else int(config.get("season_num", 1))

                raw_base_name = clean_file_title[:ep_match.start()].strip()
                clean_anime_base = re.sub(r'[\s\-_]*(?:(?:\d+(?:st|nd|rd|th|da|ra)?\s*(?:season|temporada))|(?:(?:season|temporada)\s*\d+)|(?:\bS\d+\b)).*$', '', raw_base_name, flags=re.IGNORECASE).strip()
                if not clean_anime_base:
                    clean_anime_base = raw_base_name or "Episodio"

                clean_file_title = f"{clean_anime_base} - S{final_s:02d}E{ep_num:02d}"

        task_temp_dir = os.path.join(dest_folder, f".tmp_{task_id}")
        os.makedirs(task_temp_dir, exist_ok=True)

        if sys.platform == "win32":
            try:
                import ctypes
                ctypes.windll.kernel32.SetFileAttributesW(str(task_temp_dir), 2)
            except Exception:
                pass

        with self.lock:
            self.active_temp_dirs.add(os.path.abspath(task_temp_dir))
        out_template = os.path.join(task_temp_dir, f"{clean_file_title}.%(ext)s")

        parsed_url = urlparse(url)
        netloc = parsed_url.netloc.lower()
        origin_domain = f"{parsed_url.scheme}://{parsed_url.netloc}"

        page_ref = task.get("pageUrl") or ""
        if "mp4upload" in netloc:
            referer = "https://www.mp4upload.com/"
        elif "streamtape" in netloc:
            referer = "https://streamtape.com/"
        elif any(s in netloc for s in ["sprintcdn", "streamwish", "filelions", "vidhide", "hglamioz", "wish", "playmate", "earnvids", "vixeo"]):
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

        # CONFIGURACIÓN RESILIENTE DE POSPROCESADO (BLINDAJE TOTAL VIXEO Y MP4)
        postprocessors_list = []
        if is_yt and is_audio:
            postprocessors_list.append({
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '320',
            })
        elif not is_yt and is_m3u8:
            # Solo aplicamos remuxeo a streams HLS segmentados
            postprocessors_list.append({
                'key': 'FFmpegVideoRemuxer',
                'preferedformat': fmt_choice
            })

        # Parámetros tolerantes para FFmpeg: ignora timestamps desincronizados típicos de VIXEO
        ffmpeg_tolerant_args = [
            '-c', 'copy',
            '-ignore_unknown',
            '-fflags', '+genpts+discardcorrupt',
            '-err_detect', 'ignore_err',
            '-movflags', '+faststart'
        ]

        ydl_opts = {
            'outtmpl': out_template,
            'format': format_selector,
            'merge_output_format': 'mp4' if (is_yt and not is_audio) else (fmt_choice if (not is_yt and is_m3u8) else None),
            'progress_hooks': [progress_hook],
            'nocheckcertificate': True,
            'quiet': True,
            'no_warnings': True,
            'retries': 30,
            'fragment_retries': 35,
            'skip_unavailable_fragments': True,
            'socket_timeout': 15,
            'retry_sleep_functions': {'http': lambda n: 0.1, 'fragment': lambda n: 0.1},
            'hls_use_mpegts': True,
            'fixup': 'warn',
            'postprocessors': postprocessors_list,
            'postprocessor_args': {'ffmpeg': ffmpeg_tolerant_args} if postprocessors_list else {},
            'ffmpeg_location': os.path.dirname(self.ffmpeg_path) if self.ffmpeg_path else None
        }

        if is_yt:
            ydl_opts.update({
                'concurrent_fragment_downloads': 1,
                'http_chunk_size': 10485760,
                'buffersize': 1024 * 1024 * 8,
                'merge_output_format': 'mp4' if not is_audio else None,
            })
        else:
            # OPTIMIZACIÓN AGRESIVA PARA VIXEO Y CDNs: Chunks de 32MB y 32 hilos en paralelo
            ydl_opts['http_headers'] = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
                'Referer': referer if referer and referer != "://" else 'https://animeflv.net/',
                'Origin': origin_domain if origin_domain and origin_domain != "://" else 'https://animeflv.net',
                'Accept': '*/*',
                'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'cross-site'
            }
            ydl_opts['buffersize'] = 1024 * 1024 * 64
            ydl_opts['concurrent_fragment_downloads'] = threads_count
            ydl_opts['fragment_retries'] = 40
            ydl_opts['skip_unavailable_fragments'] = True
            ydl_opts['http_chunk_size'] = 20971520

            is_mp4upload = "mp4upload" in netloc

            if is_mp4upload:
                # Mp4Upload a máxima velocidad: 8 conexiones concurrentes, chunks de 1MB y memoria mapeada
                if self.has_aria2:
                    ydl_opts['external_downloader'] = self.aria2_path
                    ydl_opts['external_downloader_args'] = {
                        'aria2c': [
                            '--console-log-level=warn',
                            '--summary-interval=1',
                            '-s8',
                            '-x8',
                            '-j8',
                            '-k1M',
                            '--min-split-size=1M',
                            '--max-connection-per-server=8',
                            '--file-allocation=none',
                            '--optimize-concurrent-downloads=true',
                            '--conditional-get=true',
                            '--enable-mmap=true',
                            '--header=Referer: https://www.mp4upload.com/',
                            '--header=Origin: https://www.mp4upload.com',
                            '--header=User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
                        ]
                    }
                else:
                    ydl_opts['http_chunk_size'] = 10485760
                    ydl_opts['buffersize'] = 1024 * 1024 * 32
            elif self.has_aria2 and not is_m3u8:
                max_aria_conns = min(16, threads_count)
                ydl_opts['external_downloader'] = self.aria2_path
                ydl_opts['external_downloader_args'] = {
                    'aria2c': [
                        '--console-log-level=error',
                        '--summary-interval=0',
                        f'-s{max_aria_conns}',
                        f'-x{max_aria_conns}',
                        '-j16',
                        '-k1M',
                        '--file-allocation=none',
                        '--optimize-concurrent-downloads=true',
                        f'--max-connection-per-server={max_aria_conns}',
                        '--min-split-size=1M',
                        '--stream-piece-selector=geom',
                        f'--header=Referer: {referer}',
                        f'--header=Origin: {origin_domain}',
                        '--header=User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
                    ]
                }

        try:
            # Notificar al frontend inmediatamente para que no se quede congelado en "En cola"
            if self.bridge and self.bridge._window:
                self.bridge._window.evaluate_js(
                    f"window.updateDownloadProgress && window.updateDownloadProgress('{task_id}', 1, 'Iniciando', 'Descargando...');"
                )

            info = None
            try:
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(url, download=True)
            except Exception as dl_err:
                err_str = str(dl_err)
                # MECANISMO DE RESCATE AUTOMÁTICO ANTE FALLOS DE CONVERSIÓN DE VIXEO
                if any(k in err_str for k in ["Conversion failed", "Postprocessing", "FFmpegPostProcessorError"]):
                    print(f"[Core Rescate VIXEO] Posprocesado fallido en FFmpeg. Rescatando archivo ensamblado directamente...")
                    existing = [f for f in os.listdir(task_temp_dir) if not f.endswith('.part') and os.path.getsize(os.path.join(task_temp_dir, f)) > 3 * 1024 * 1024]
                    if not existing:
                        raise dl_err
                else:
                    raise dl_err

            # LECTURA DE RESOLUCIÓN Y METADATOS
            width = info.get('width', 'N/A') if info else 'N/A'
            height = info.get('height', 'N/A') if info else 'N/A'
            vcodec = info.get('vcodec', 'N/A') if info else 'N/A'
            acodec = info.get('acodec', 'N/A') if info else 'N/A'
            fps = info.get('fps', 'N/A') if info else 'N/A'

            final_res_label = f"{height}p" if height != 'N/A' else None
            clean_name_check = "".join(c for c in title if c not in r'\/:*?"<>|').strip() or "video"

            # TRASLADO DEL ARCHIVO DESDE LA CARPETA TEMPORAL
            generated_files = [f for f in os.listdir(task_temp_dir) if not f.endswith('.part') and not f.startswith('.')]
            final_file_path = os.path.join(dest_folder, f"{clean_name_check}.{fmt_choice}")

            if generated_files:
                generated_files.sort(key=lambda x: os.path.getsize(os.path.join(task_temp_dir, x)), reverse=True)
                source_temp = os.path.join(task_temp_dir, generated_files[0])

                # Si el archivo original era mp4 y no se requería remux, conservar su extensión real
                _, source_ext = os.path.splitext(source_temp)
                if not is_m3u8 and not is_yt and source_ext:
                    final_file_path = os.path.join(dest_folder, f"{clean_name_check}{source_ext}")

                if os.path.exists(final_file_path):
                    for attempt in range(5):
                        try:
                            os.chmod(final_file_path, stat.S_IWRITE)
                            os.remove(final_file_path)
                            break
                        except Exception:
                            time.sleep(0.2)

                try:
                    if os.path.exists(final_file_path):
                        base_root, ext_part = os.path.splitext(final_file_path)
                        final_file_path = f"{base_root}_{int(time.time())}{ext_part}"

                    shutil.move(source_temp, final_file_path)
                except Exception:
                    try:
                        shutil.copy2(source_temp, final_file_path)
                        os.remove(source_temp)
                    except Exception as move_err:
                        print(f"[Core] Error final moviendo archivo: {move_err}")

            real_file_bytes = 0
            if os.path.exists(final_file_path):
                real_file_bytes = os.path.getsize(final_file_path)
                if not final_res_label:
                    probe_res = self._probe_resolution_ffprobe(final_file_path, {})
                    if probe_res:
                        final_res_label = probe_res

            print(f"\n=======================================================")
            print(f"[Core Telemetría] {title}")
            print(f"   -> Archivo generado: {os.path.basename(final_file_path)}")
            print(f"   -> Resolución Real: {final_res_label or '1080p'}")
            print(f"   -> Tamaño final: {round(real_file_bytes / 1024 / 1024, 2)} MB")
            print(f"=======================================================\n")

            if final_res_label and self.bridge and self.bridge._window:
                self.bridge._window.evaluate_js(
                    f"window.updateTaskMetadata && window.updateTaskMetadata('{task_id}', null, '{final_res_label}');"
                )

            min_size_threshold = 50 * 1024 if is_yt else 3 * 1024 * 1024
            if real_file_bytes < min_size_threshold:
                print(f"[Core] ADVERTENCIA: Archivo demasiado pequeño ({real_file_bytes} bytes).")
                try:
                    if os.path.exists(final_file_path):
                        os.remove(final_file_path)
                except Exception:
                    pass
                if self.bridge and self.bridge._window:
                    self.bridge._window.evaluate_js(
                        f"window.updateDownloadProgress && window.updateDownloadProgress('{task_id}', 0, 'Fallo', 'Stream inválido');"
                    )
                return False

            if self.bridge and self.bridge._window:
                self.bridge._window.evaluate_js(
                    f"window.updateRealSizeOnly && window.updateRealSizeOnly('{task_id}', {real_file_bytes});"
                )
                self.bridge._window.evaluate_js(
                    f"window.updateDownloadProgress && window.updateDownloadProgress('{task_id}', 100, '0 KB/s', 'Completado');"
                )
            return True

        except Exception as e:
            if "TASK_CANCELLED_BY_USER" in str(e):
                print(f"[Core] Descarga cancelada: {title}")
                if self.bridge and self.bridge._window:
                    self.bridge._window.evaluate_js(
                        f"window.updateDownloadProgress && window.updateDownloadProgress('{task_id}', 0, 'Cancelado', 'Cancelado');"
                    )
                self._force_remove_temp_dir(task_temp_dir)
            else:
                import traceback
                print(f"[Core] Error descargando {title}:")
                traceback.print_exc()
                with self.lock:
                    self.cancelled_tasks.discard(task_id)
                if self.bridge and self.bridge._window:
                    self.bridge._window.evaluate_js(
                        f"window.updateDownloadProgress && window.updateDownloadProgress('{task_id}', 0, 'Error', 'Error');"
                    )
            return False
        finally:
            self._force_remove_temp_dir(task_temp_dir)