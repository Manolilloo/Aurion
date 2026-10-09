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

    def cancel_task(self, task_id):
        with self.lock:
            self.cancelled_tasks.add(task_id)
        print(f"[Core] Cancelando tarea: {task_id}")

    def resolve_destination_folder(self, config):
        base_dir = config.get("dir", "J:\\ANIME\\animes")
        mode = config.get("active_mode", "anime")
        anime_title = config.get("title", "").strip()
        clean_title = "".join(c for c in anime_title if c not in r'\/:*?"<>|').strip()

        # MODO YOUTUBE: Crear carpeta con el nombre exacto del vídeo en el destino elegido
        if config.get("is_youtube") or mode == "youtube":
            yt_folder_name = clean_title or "Video_YouTube"
            final_dir = os.path.abspath(os.path.join(base_dir, yt_folder_name))
        # MODO CINE: Carpeta propia con el título de la película (sin temporadas)
        elif mode == "movie":
            if clean_title and clean_title != "Esperando consulta...":
                final_dir = os.path.join(base_dir, clean_title)
            else:
                final_dir = base_dir
        else:
            # MODO ANIME: Conserva su estructura original
            is_single = config.get("is_single_season", False)
            season_num = config.get("season_num", 1)

            if is_single:
                if clean_title and clean_title != "Esperando consulta...":
                    final_dir = os.path.join(base_dir, clean_title)
                else:
                    final_dir = base_dir
            else:
                if clean_title and clean_title != "Esperando consulta...":
                    final_dir = os.path.join(base_dir, clean_title, f"Temporada {season_num}")
                else:
                    final_dir = os.path.join(base_dir, f"Temporada {season_num}")

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

    def probe_media_info(self, url, page_url=""):
        if not url:
            return 0, "N/D"

        parsed_url = urlparse(url)
        origin_domain = f"{parsed_url.scheme}://{parsed_url.netloc}"
        referer = origin_domain + "/"

        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Referer': referer,
            'Origin': origin_domain
        }

        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'nocheckcertificate': True,
            'http_headers': headers,
            'skip_download': True,
            'ffmpeg_location': os.path.dirname(self.ffmpeg_path) if self.ffmpeg_path else None
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                if not info:
                    return 0, "N/D"

                real_height = info.get('height')
                if not real_height and 'formats' in info:
                    for f in reversed(info['formats']):
                        if f.get('height'):
                            real_height = f.get('height')
                            break

                res_str = f"{real_height}p" if real_height else None

                if not res_str:
                    res_str = self._probe_resolution_ffprobe(url, headers)

                if not res_str:
                    res_str = "N/D"

                size_bytes = info.get('filesize') or info.get('filesize_approx') or 0
                if size_bytes == 0:
                    duration = info.get('duration') or 0
                    tbr = info.get('tbr') or 0
                    if duration > 0 and tbr > 0:
                        size_bytes = int((tbr * 1000 * duration) / 8)

                return int(size_bytes), res_str

        except Exception as e:
            print(f"[Core Sonda] Metadatos iniciales no disponibles en el manifiesto: {e}")
            res_str = self._probe_resolution_ffprobe(url, headers) or "N/D"
            return 0, res_str

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
            if q_str == "max":
                format_selector = "bestvideo+bestaudio/best"
            elif q_str == "min":
                format_selector = "worstvideo+worstaudio/worst"
            else:
                q_num = int(quality) if str(quality).isdigit() else 1080
                format_selector = f"bestvideo[height<={q_num}]+bestaudio/best[height<={q_num}]/best"
        else:
            fmt_choice = str(config.get("fmt", "mp4")).replace(".", "").lower().strip()
            if fmt_choice not in ["mp4", "mkv"]:
                fmt_choice = "mp4"
            format_selector = "bestvideo[height<=1080]+bestaudio/best[height<=1080]/bestvideo+bestaudio/best"

        clean_file_title = "".join(c for c in title if c not in r'\/:*?"<>|').strip() or "video"
        task_temp_dir = os.path.join(dest_folder, f".tmp_{task_id}")
        os.makedirs(task_temp_dir, exist_ok=True)
        out_template = os.path.join(task_temp_dir, f"{clean_file_title}.%(ext)s")

        parsed_url = urlparse(url)
        origin_domain = f"{parsed_url.scheme}://{parsed_url.netloc}"
        referer = origin_domain + "/"

        print(f"\n[Core -> Tarea Iniciada] {title}")
        print(f"      Formato: .{fmt_choice} | Hilos: {threads_count}")

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

        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            'Referer': referer if referer and referer != "://" else 'https://animeflv.net/',
            'Origin': origin_domain if origin_domain and origin_domain != "://" else 'https://animeflv.net',
            'Accept': '*/*',
            'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
            'Sec-Ch-Ua': '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'cross-site'
        }

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
            'http_headers': headers,
            'retries': 15,
            'fragment_retries': 15,
            'skip_unavailable_fragments': True,
            'socket_timeout': 10,
            'retry_sleep_functions': {'http': lambda n: 0.2, 'fragment': lambda n: 0.2},
            'hls_use_mpegts': True,
            'fixup': 'warn',
            'buffersize': 1024 * 1024 * 16,
            'concurrent_fragment_downloads': min(16, threads_count),
            'postprocessors': postprocessors_list,
            'ffmpeg_location': os.path.dirname(self.ffmpeg_path) if self.ffmpeg_path else None
        }

        if is_yt:
            ydl_opts.update({
                'concurrent_fragment_downloads': 8,
                'buffersize': 1024 * 1024 * 8,
            })
        elif self.has_aria2 and not is_m3u8:
            ydl_opts['external_downloader'] = self.aria2_path
            ydl_opts['external_downloader_args'] = {
                'aria2c': [
                    f'-s{threads_count}',
                    f'-x16',
                    f'-j{threads_count}',
                    '-k1M',
                    '--file-allocation=none',
                    '--summary-interval=0',
                    '--optimize-concurrent-downloads=true',
                    '--max-connection-per-server=16',
                    '--min-split-size=1M',
                    f'--header=Referer: {referer}',
                    f'--header=Origin: {origin_domain}'
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

                print(f"\n=======================================================")
                print(f"[Core Telemetría] {title}")
                print(f"   -> Archivo generado: {title}.{fmt_choice}")
                print(f"   -> Resolución: {width}x{height} ({height}p)")
                print(f"   -> FPS: {fps} | Códec Vídeo: {vcodec} | Audio: {acodec}")
                print(f"   -> Hilos de fragmentos usados: {threads_count}")
                print(f"=======================================================\n")

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