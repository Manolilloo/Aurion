import os
import sys
import re
import json
import shutil
import threading
import time
import gc
import stat
import atexit
import ssl
import base64
import struct
import subprocess
import urllib.request
from urllib.parse import urlparse
from concurrent.futures import ThreadPoolExecutor
import yt_dlp
from .validation import is_http_url, is_safe_task_id, sanitize_path_component
from .secure_storage import read_protected_file
from .paths import get_app_data_dir
from .download_profiles import (
    build_download_profile,
    effective_parallel_downloads,
    fragment_fallback_levels,
    is_retryable_segment_error,
)
from .diagnostics import record_download_event
from .transfer_budget import SharedFragmentLimiter, install_yt_dlp_fragment_limiter


def get_binary_path(binary_name):
    """Devuelve la ruta absoluta al ejecutable en bin/ tanto en desarrollo como congelado con PyInstaller."""
    candidates = []
    if getattr(sys, 'frozen', False):
        exe_dir = os.path.dirname(sys.executable)
        meipass = getattr(sys, '_MEIPASS', exe_dir)
        candidates.extend([
            os.path.join(meipass, 'bin', f"{binary_name}.exe"),
            os.path.join(exe_dir, '_internal', 'bin', f"{binary_name}.exe"),
            os.path.join(exe_dir, 'bin', f"{binary_name}.exe"),
        ])
    else:
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        candidates.append(os.path.join(base_dir, 'bin', f"{binary_name}.exe"))

    for c in candidates:
        if os.path.isfile(c):
            return c

    system_path = shutil.which(binary_name)
    return system_path if system_path else None


def parse_speed_limit_bytes(speed_str):
    """Convierte cadenas como '5M', '10M', '25M' a bytes/s enteros para yt-dlp."""
    if not speed_str or str(speed_str).strip() in ["0", "", "none", "None"]:
        return None
    s = str(speed_str).strip().upper()
    m = re.match(r'^(\d+(?:\.\d+)?)\s*([KMG])?B?$', s)
    if not m:
        return None
    val = float(m.group(1))
    unit = m.group(2) or 'M'
    multipliers = {'K': 1024, 'M': 1024 * 1024, 'G': 1024 * 1024 * 1024}
    return int(val * multipliers.get(unit, 1024 * 1024))


def parse_time_to_seconds(t_str):
    """Convierte SS, MM:SS o HH:MM:SS (con fracciones opcionales) a segundos."""
    if t_str is None:
        return None

    value = str(t_str).strip()
    if not value:
        return None

    if re.fullmatch(r"\d+(?:\.\d+)?", value):
        return int(float(value))

    parts = value.split(":")
    if len(parts) == 2:
        minutes_text, seconds_text = parts
        if not minutes_text.isdigit() or not re.fullmatch(r"\d{1,2}(?:\.\d+)?", seconds_text):
            return None
        minutes = int(minutes_text)
        seconds = float(seconds_text)
        if seconds >= 60:
            return None
        return int(minutes * 60 + seconds)

    if len(parts) == 3:
        hours_text, minutes_text, seconds_text = parts
        if (
            not hours_text.isdigit()
            or not minutes_text.isdigit()
            or not re.fullmatch(r"\d{1,2}(?:\.\d+)?", seconds_text)
        ):
            return None
        hours = int(hours_text)
        minutes = int(minutes_text)
        seconds = float(seconds_text)
        if minutes >= 60 or seconds >= 60:
            return None
        return int(hours * 3600 + minutes * 60 + seconds)

    return None


class AurionDownloader:
    def __init__(self, bridge):
        self.bridge = bridge
        self.queue = []
        self.is_downloading = False
        self.cancelled_tasks = set()
        self.active_task_ids = set()
        self.active_temp_dirs = set()
        self.lock = threading.Lock()
        self.fragment_limiter = SharedFragmentLimiter(total_slots=32)
        install_yt_dlp_fragment_limiter()

        atexit.register(self._cleanup_on_exit)

        self.aria2_path = get_binary_path("aria2c")
        self.ffmpeg_path = get_binary_path("ffmpeg")

        self.has_aria2 = self.aria2_path is not None
        self.has_ffmpeg = self.ffmpeg_path is not None

        status_aria = f"DISPONIBLE ({self.aria2_path})" if self.has_aria2 else "NO DETECTADO"
        status_ffmpeg = f"DISPONIBLE ({self.ffmpeg_path})" if self.has_ffmpeg else "NO DETECTADO"
        print(f"[Core] Estado del sistema -> aria2c: {status_aria} | FFmpeg: {status_ffmpeg}")
        self._cleanup_orphaned_temp_dirs()

    def _get_fallback_default_dir(self):
        return os.path.join(os.path.expanduser("~"), "Videos", "Aurion")

    def _cleanup_on_exit(self):
        self.cleanup_all_temp()

    def cleanup_all_temp(self):
        """Cancela el lote activo y evita borrar temporales que aún estén en uso."""
        with self.lock:
            if self.is_downloading:
                self.cancelled_tasks.update(getattr(self, "active_task_ids", set()))
                return False
            dirs = list(self.active_temp_dirs)
            self.active_temp_dirs.clear()

        for directory in dirs:
            self._force_remove_temp_dir(directory)
        return True

    def _force_remove_temp_dir(self, target_path):
        if not target_path or not os.path.exists(target_path):
            return

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

        # No recurrir a shell=True: el borrado recursivo con un comando construido
        # a partir de una ruta no aporta nada que shutil.rmtree no cubra.
        print(f"[Core] No se pudo eliminar la carpeta temporal tras varios intentos: {target_path}")

    def _cleanup_orphaned_temp_dirs(self):
        """Elimina temporales huérfanos de más de 24 h, nunca temporales activos."""
        def run_cleanup():
            check_dirs = set()
            try:
                cfg = getattr(self.bridge, "config", {}) or {}
                for mode in ("anime", "movie", "youtube"):
                    mode_cfg = cfg.get(mode, {})
                    directory = mode_cfg.get("dir") if isinstance(mode_cfg, dict) else None
                    if directory and os.path.isdir(directory):
                        check_dirs.add(os.path.abspath(directory))
            except Exception as exc:
                print(f"[Core] No se pudieron leer rutas para limpiar temporales: {exc}")

            fallback_dir = self._get_fallback_default_dir()
            if os.path.isdir(fallback_dir):
                check_dirs.add(os.path.abspath(fallback_dir))

            older_than = time.time() - (24 * 60 * 60)
            with self.lock:
                active_dirs = set(self.active_temp_dirs)

            for base in check_dirs:
                if not os.path.isdir(base):
                    continue
                try:
                    for root, dirs, _ in os.walk(base, topdown=False):
                        for directory in dirs:
                            if not directory.startswith(".tmp_"):
                                continue
                            target_path = os.path.abspath(os.path.join(root, directory))
                            if target_path in active_dirs:
                                continue
                            try:
                                if os.path.getmtime(target_path) < older_than:
                                    self._force_remove_temp_dir(target_path)
                            except OSError:
                                continue
                except OSError as exc:
                    print(f"[Core] Error recorriendo temporales en {base}: {exc}")

        threading.Thread(target=run_cleanup, name="Aurion-Temp-Cleanup", daemon=True).start()

    def cancel_task(self, task_id):
        with self.lock:
            self.cancelled_tasks.add(task_id)
        if hasattr(self, "fragment_limiter"):
            self.fragment_limiter.cancel_task(task_id)
        print(f"[Core] Cancelando tarea: {task_id}")

    def _extract_with_yt_dlp(self, options, url, task_id, use_fragment_limiter=False):
        """Ejecuta yt-dlp y limita globalmente sus peticiones HLS/DASH simultáneas."""
        if use_fragment_limiter:
            with self.fragment_limiter.register_task(task_id):
                with yt_dlp.YoutubeDL(options) as downloader:
                    downloader._aurion_fragment_limiter = self.fragment_limiter
                    downloader._aurion_task_id = str(task_id)
                    return downloader.extract_info(url, download=True)

        with yt_dlp.YoutubeDL(options) as downloader:
            return downloader.extract_info(url, download=True)

    def _skip_existing_output(self, task_id, file_path, conflict_policy):
        """Preserva cualquier archivo existente cuando la política es omitir."""
        if conflict_policy != "skip" or not os.path.isfile(file_path):
            return False

        try:
            existing_size = os.path.getsize(file_path)
        except OSError:
            return False

        bridge = getattr(self, "bridge", None)
        window = getattr(bridge, "_window", None)
        if window:
            task_literal = json.dumps(task_id)
            try:
                window.evaluate_js(
                    "window.updateRealSizeOnly && window.updateRealSizeOnly("
                    f"{task_literal}, {existing_size});"
                )
                window.evaluate_js(
                    "window.updateDownloadProgress && window.updateDownloadProgress("
                    f"{task_literal}, 100, 'Omitido', 'Completado');"
                )
            except Exception as exc:
                print(f"[Core] No se pudo actualizar la interfaz para la tarea omitida: {exc}")

        return True

    # =========================================================================
    # MOTOR NATIVO DE DESENCRIPTACIÓN Y DESCARGA PARA MEGA.NZ (AES-128-CTR)
    # =========================================================================
    def _download_mega_native(self, mega_url, output_file, task_id):
        """Descarga y desencripta al vuelo enlaces de mega.nz/embed o mega.nz/file a máxima velocidad."""
        m = re.search(r'mega\.nz/(?:embed/|file/|#!?)([a-zA-Z0-9_-]+)[#!]([a-zA-Z0-9_-]+)', mega_url)
        if not m:
            return False

        file_id, file_key_b64 = m.group(1), m.group(2)
        padding = '=' * ((4 - len(file_key_b64) % 4) % 4)
        raw_key = base64.urlsafe_b64decode(file_key_b64 + padding)
        if len(raw_key) < 32:
            return False

        k = struct.unpack('>8I', raw_key[:32])
        aes_key = struct.pack('>4I', k[0] ^ k[4], k[1] ^ k[5], k[2] ^ k[6], k[3] ^ k[7])
        iv_prefix = struct.pack('>2I', k[4], k[5])

        ctx = ssl.create_default_context()

        api_url = f"https://g.api.mega.co.nz/cs?id={int(time.time() * 1000)}"
        payload = json.dumps([{"a": "g", "g": 1, "p": file_id}]).encode('utf-8')
        req = urllib.request.Request(api_url, data=payload, headers={'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'})

        with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
            api_response_url = urlparse(resp.geturl())
            if (
                api_response_url.scheme.lower() != "https"
                or api_response_url.hostname != "g.api.mega.co.nz"
                or api_response_url.port not in (None, 443)
            ):
                raise ValueError("La API de MEGA redirigió a un host inesperado.")
            api_response = self._read_limited_response(resp, max_bytes=4 * 1024 * 1024)
            res_data = json.loads(api_response.decode("utf-8"))

        if not isinstance(res_data, list) or not res_data or isinstance(res_data[0], int):
            return False

        dl_url = res_data[0].get('g')
        total_bytes = int(res_data[0].get('s', 0))
        if not is_http_url(dl_url) or total_bytes <= 0:
            return False
        if total_bytes > 100 * 1024 * 1024 * 1024:
            raise ValueError("El archivo de MEGA supera el límite de 100 GB.")

        if self.bridge and self.bridge._window:
            self.bridge._window.evaluate_js(f"window.updateRealSizeOnly && window.updateRealSizeOnly('{task_id}', {total_bytes});")

        # Inicializar motor AES-CTR (compatible con PyCryptodome incluido con yt-dlp o cryptography)
        decrypt_fn = None
        try:
            from Cryptodome.Cipher import AES
            from Cryptodome.Util import Counter
            ctr = Counter.new(128, initial_value=int.from_bytes(iv_prefix + b'\x00' * 8, 'big'))
            cipher = AES.new(aes_key, AES.MODE_CTR, counter=ctr)
            decrypt_fn = cipher.decrypt
        except Exception:
            try:
                from Crypto.Cipher import AES
                from Crypto.Util import Counter
                ctr = Counter.new(128, initial_value=int.from_bytes(iv_prefix + b'\x00' * 8, 'big'))
                cipher = AES.new(aes_key, AES.MODE_CTR, counter=ctr)
                decrypt_fn = cipher.decrypt
            except Exception:
                from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
                cipher = Cipher(algorithms.AES(aes_key), modes.CTR(iv_prefix + b'\x00' * 8))
                decryptor = cipher.decryptor()
                decrypt_fn = decryptor.update

        dl_req = urllib.request.Request(dl_url, headers={'User-Agent': 'Mozilla/5.0'})
        downloaded = 0
        start_t = time.time()
        chunk_size = 1024 * 1024 * 2  # Bloques de 2 MB para máxima velocidad

        with urllib.request.urlopen(dl_req, context=ctx, timeout=20) as stream, open(output_file, 'wb') as out_f:
            while True:
                with self.lock:
                    if task_id in self.cancelled_tasks:
                        raise Exception("TASK_CANCELLED_BY_USER")
                chunk = stream.read(chunk_size)
                if not chunk:
                    break
                out_f.write(decrypt_fn(chunk))
                downloaded += len(chunk)
                elapsed = max(0.05, time.time() - start_t)
                speed_mb = round((downloaded / (1024 * 1024)) / elapsed, 2)
                pct = round(min(100.0, (downloaded / total_bytes) * 100), 1)
                if self.bridge and self.bridge._window:
                    self.bridge._window.evaluate_js(
                        f"window.updateDownloadProgress && window.updateDownloadProgress('{task_id}', {pct}, '{speed_mb} MB/s', 'Descargando MEGA ({pct}%)');"
                    )

        return os.path.exists(output_file) and os.path.getsize(output_file) > 1024 * 1024

    def _read_limited_response(self, response, max_bytes=5 * 1024 * 1024):
        """Read a bounded HTTP response and reject redirects to non-public URL schemes/hosts."""
        final_url = response.geturl() if hasattr(response, "geturl") else ""
        if final_url and not is_http_url(final_url):
            raise ValueError("El servidor redirigió a una URL no permitida.")
        data = response.read(max_bytes + 1)
        if len(data) > max_bytes:
            raise ValueError("La respuesta del servidor supera el tamaño máximo permitido.")
        return data

    # =========================================================================
    # DESEMPAQUETADOR RÁPIDO PARA EMBEDS DE STREAMTAPE, MIXDROP, VOE Y WISH
    # =========================================================================
    def _resolve_embed_to_direct_stream(self, url, referer=""):
        """Si la URL es un embed (/e/ o /v/) o un token caducado de Streamtape/MixDrop, extrae el enlace fresco."""
        u_low = url.lower()
        ctx = ssl.create_default_context()
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Referer': referer or url
        }

        try:
            # 1. Resolver Streamtape (streamtape.com/e/... o /v/...)
            if "streamtape" in u_low and ("/e/" in u_low or "/v/" in u_low):
                req = urllib.request.Request(url, headers=headers)
                with urllib.request.urlopen(req, context=ctx, timeout=6) as resp:
                    html = self._read_limited_response(resp).decode("utf-8", errors="ignore")
                # Buscar construcción de robotlink en JS de Streamtape
                m_bot = re.search(r"document\.getElementById\(['\"]robotlink['\"]\)\.innerHTML\s*=\s*['\"]([^'\"]+)['\"]\s*\+\s*\(['\"]([^'\"]+)['\"]\)\.substring\((\d+)\)", html)
                if m_bot:
                    p1, p2, sub_idx = m_bot.group(1), m_bot.group(2), int(m_bot.group(3))
                    direct_st = "https:" + p1 + p2[sub_idx:]
                    if "stream=" not in direct_st:
                        direct_st += "&stream=1"
                    return direct_st

            # 2. Resolver MixDrop / Voe / Filelions / Streamwish / Uqload desde HTML o JS empaquetado
            if any(x in u_low for x in ["/e/", "/embed", "mixdrop", "mixdrp", "voe.sx", "uqload", "yourupload"]):
                if not any(u_low.split('?')[0].endswith(ext) for ext in ['.mp4', '.m3u8', '.mkv']):
                    req = urllib.request.Request(url, headers=headers)
                    with urllib.request.urlopen(req, context=ctx, timeout=6) as resp:
                        html = self._read_limited_response(resp).decode("utf-8", errors="ignore")

                    # Seguir redirección JS típica de VOE (window.location.href = 'https://...')
                    js_redir = re.search(r"window\.location\.href\s*=\s*['\"](https?://[^'\"]+)['\"]", html)
                    if js_redir and is_http_url(js_redir.group(1)):
                        redir_req = urllib.request.Request(js_redir.group(1), headers=headers)
                        with urllib.request.urlopen(redir_req, context=ctx, timeout=6) as resp2:
                            html = self._read_limited_response(resp2).decode("utf-8", errors="ignore")

                    # Desempaquetar eval(function(p,a,c,k,e,d)) típico de MixDrop y Streamwish
                    packed = re.search(r"eval\(function\(p,a,c,k,e,[dr]\)\{.*?\}\('(.*?)',(\d+),(\d+),'(.*?)'\.split\('\|'\)", html, re.DOTALL)
                    if packed:
                        payload, radix, count, symtab = packed.groups()
                        radix = int(radix)
                        symbols = symtab.split('|')

                        def _b_enc(num, b):
                            chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
                            return chars[num] if num < b else _b_enc(num // b, b) + chars[num % b]

                        for i in range(int(count) - 1, -1, -1):
                            if i < len(symbols) and symbols[i]:
                                payload = re.sub(r'\b' + re.escape(_b_enc(i, radix)) + r'\b', symbols[i], payload)
                        html += "\n" + payload

                    # MixDrop MDCore.wurl
                    md_match = re.search(r'wurl\s*=\s*["\']((?:https?:)?//[^"\']+\.mp4[^"\']*)["\']', html)
                    if md_match:
                        wurl = md_match.group(1)
                        return ("https:" + wurl) if wurl.startswith("//") else wurl

                    # Voe HLS base64 o directo
                    voe_b64 = re.search(r"['\"]hls['\"]\s*:\s*['\"]([a-zA-Z0-9+/=]+)['\"]", html)
                    if voe_b64:
                        try:
                            dec = base64.b64decode(voe_b64.group(1)).decode('utf-8')
                            if dec.startswith('http'):
                                return dec
                        except Exception:
                            pass

                    m3u8_list = re.findall(r'["\'](https?://[^"\']+\.m3u8(?:\?[^"\']*)?)["\']', html)
                    if m3u8_list:
                        return m3u8_list[0]

                    mp4_list = re.findall(r'["\']((?:https?:)?//[^"\']+\.mp4(?:\?[^"\']*)?)["\']', html)
                    if mp4_list:
                        found = mp4_list[0]
                        return ("https:" + found) if found.startswith("//") else found
        except Exception as e:
            print(f"[Core Resolver] Info: {e}")

        return url

    # =========================================================================
    # RECORTE ULTRA-RÁPIDO LOCAL CON FFMPEG (0.2s SIN QUEDARSE COLGADO)
    # =========================================================================
    def _trim_media_file_local(self, file_path, clip_start_str, clip_end_str, task_id):
        """Recorta el vídeo o audio descargado localmente usando stream copy (-c copy) en una fracción de segundo."""
        if not self.has_ffmpeg or not os.path.exists(file_path):
            return file_path

        s_sec = parse_time_to_seconds(clip_start_str)
        e_sec = parse_time_to_seconds(clip_end_str)

        if s_sec is None and e_sec is None:
            return file_path
        s_sec = s_sec or 0
        if e_sec is not None and e_sec <= s_sec:
            return file_path

        try:
            if self.bridge and self.bridge._window:
                self.bridge._window.evaluate_js(
                    f"window.updateDownloadProgress && window.updateDownloadProgress('{task_id}', 99, 'Recortando Clip', 'Cortando fragmento exacto...');"
                )

            base_p, ext_p = os.path.splitext(file_path)
            trimmed_path = f"{base_p}_clip{ext_p}"

            cmd = [self.ffmpeg_path, '-y', '-loglevel', 'error']
            if s_sec > 0:
                cmd.extend(['-ss', str(s_sec)])
            if e_sec is not None:
                cmd.extend(['-to', str(e_sec)])
            cmd.extend([
                '-i', file_path,
                '-c', 'copy',
                '-avoid_negative_ts', 'make_zero',
                trimmed_path
            ])

            flags = 0x08000000 if sys.platform == 'win32' else 0
            proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30, creationflags=flags)

            if proc.returncode == 0 and os.path.exists(trimmed_path) and os.path.getsize(trimmed_path) > 10 * 1024:
                os.remove(file_path)
                os.rename(trimmed_path, file_path)
                print(f"[Core Clip Trimmer] Recorte completado con éxito ({s_sec}s -> {e_sec}s)")
        except Exception as e:
            print(f"[Core Clip Trimmer] Aviso recorte: {e}")

        return file_path

    def resolve_destination_folder(self, config):
        """Resuelve carpetas de salida sin permitir que títulos salgan de la ruta elegida."""
        config = config if isinstance(config, dict) else {}
        base_dir = (config.get("dir") or "").strip() or self._get_fallback_default_dir()
        base_dir = os.path.abspath(os.path.expanduser(base_dir))
        mode = config.get("active_mode", "anime")
        if mode not in {"anime", "movie", "youtube"}:
            mode = "anime"

        raw_title = config.get("title") or ""
        clean_title = sanitize_path_component(str(raw_title), default="", max_length=80)
        if clean_title == "Esperando consulta...":
            clean_title = ""

        if config.get("is_youtube") or mode == "youtube":
            if config.get("is_playlist") and config.get("create_playlist_subfolder", True):
                raw_folder = config.get("playlist_title") or clean_title or "Playlist_YouTube"
            else:
                raw_folder = clean_title or "Video_YouTube"
            folder = sanitize_path_component(str(raw_folder), "Video_YouTube", 60)
            final_dir = os.path.join(base_dir, folder)

        elif mode == "movie":
            final_dir = os.path.join(
                base_dir,
                sanitize_path_component(clean_title, "Peliculas", 80)
            ) if clean_title else base_dir

        else:
            try:
                requested_season = int(config.get("season_num", 1))
            except (TypeError, ValueError):
                requested_season = 1
            requested_season = max(1, min(requested_season, 999))

            detected_season = None
            if clean_title:
                match = re.search(
                    r'(?:(\d+)(?:st|nd|rd|th|da|ra)?\s*(?:season|temporada))|'
                    r'(?:(?:season|temporada)\s*(\d+))|(?:\bS(\d+)\b)',
                    clean_title,
                    re.IGNORECASE
                )
                if match:
                    season_text = match.group(1) or match.group(2) or match.group(3)
                    if season_text and season_text.isdigit():
                        detected_season = max(1, min(int(season_text), 999))

            season = detected_season if detected_season is not None else requested_season
            root_title = clean_title
            if detected_season is not None:
                root_title = re.sub(
                    r'[\s\-_]*(?:(?:\d+(?:st|nd|rd|th|da|ra)?\s*(?:season|temporada))|'
                    r'(?:(?:season|temporada)\s*\d+)|(?:\bS\d+\b)).*$',
                    '',
                    clean_title,
                    flags=re.IGNORECASE
                ).strip() or clean_title

            if root_title:
                root_folder = sanitize_path_component(root_title, "Anime", 80)
                root_dir = os.path.join(base_dir, root_folder)
            else:
                root_dir = base_dir

            if config.get("is_single_season", False):
                final_dir = root_dir
            else:
                final_dir = os.path.join(root_dir, f"Temporada {season}")

        base_abs = os.path.abspath(base_dir)
        final_abs = os.path.abspath(final_dir)
        try:
            if os.path.commonpath([base_abs, final_abs]).lower() != base_abs.lower():
                print("[Core] Ruta de salida fuera del directorio elegido; se usará el directorio base.")
                final_abs = base_abs
        except ValueError:
            final_abs = base_abs

        try:
            os.makedirs(final_abs, exist_ok=True)
        except OSError as exc:
            print(f"[Core] Error al crear ruta de salida: {exc}")
            return base_abs

        return final_abs

    def _probe_resolution_ffprobe(self, media_url, headers):
        if not self.has_ffmpeg:
            return None
        try:
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

            proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=4, creationflags=0x08000000 if sys.platform == 'win32' else 0)
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
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=3.5) as resp:
                content = resp.read().decode('utf-8', errors='ignore')

            res_matches = re.findall(r'RESOLUTION=\d+x(\d+)', content)
            detected_res = f"{max(int(h) for h in res_matches)}p" if res_matches else None

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
        if not url:
            return 0, "N/D"

        if "mega.nz" in url.lower():
            m = re.search(r'mega\.nz/(?:embed/|file/|#!?)([a-zA-Z0-9_-]+)', url)
            if m:
                try:
                    api_url = f"https://g.api.mega.co.nz/cs?id={int(time.time() * 1000)}"
                    payload = json.dumps([{"a": "g", "g": 1, "p": m.group(1)}]).encode('utf-8')
                    req = urllib.request.Request(api_url, data=payload, headers={'Content-Type': 'application/json'})
                    with urllib.request.urlopen(req, timeout=4) as resp:
                        res_data = json.loads(resp.read().decode('utf-8'))
                        if isinstance(res_data, list) and res_data and isinstance(res_data[0], dict):
                            return int(res_data[0].get('s', 0)), "1080p"
                except Exception:
                    pass
            return 250 * 1024 * 1024, "1080p"

        #IMPORTANTE: No hacer peticiones HEAD previas a Streamtape o MixDrop porque invalidan el token de descarga única
        if any(s in url.lower() for s in ["streamtape", "tapecontent", "mixdrop", "mixdrp", "mxcontent"]):
            return 185 * 1024 * 1024, "1080p"

        probe_url = url
        if "index-f" in probe_url.lower():
            probe_url = re.sub(r'index-f\d+-[^\.]+\.m3u8', 'master.m3u8', probe_url)

        parsed_url = urlparse(probe_url)
        origin_domain = f"{parsed_url.scheme}://{parsed_url.netloc}"
        referer = origin_domain + "/"

        netloc = parsed_url.netloc.lower()
        if "mp4upload" in netloc:
            referer = "https://www.mp4upload.com/"
        elif any(s in netloc for s in ["sprintcdn", "streamwish", "filelions", "vidhide", "hglamioz", "wish", "vixeo", "lion", "peytone", "ryderjet"]):
            referer = origin_domain + "/"
        elif page_url:
            referer = page_url

        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Referer': referer,
            'Origin': origin_domain,
            'Accept': '*/*'
        }

        if "mp4upload" in netloc:
            mp4_headers = {
                'User-Agent': headers['User-Agent'],
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
            except Exception:
                pass
            return 160 * 1024 * 1024, "1080p"

        if '.m3u8' in probe_url.lower():
            fast_bytes, fast_res = self._probe_direct_m3u8_fast(probe_url, headers)
            if fast_bytes > 0:
                return fast_bytes, fast_res or "1080p"

        return 0, "1080p"

    def start_engine(self, config, tasks=None):
        """Inicia un lote validado; el estado se protege frente a dobles clics."""
        if not isinstance(config, dict):
            return False
        target_tasks = list(tasks) if tasks is not None else list(self.queue)
        if not target_tasks or len(target_tasks) > 500:
            return False

        seen_ids = set()
        for task in target_tasks:
            if not isinstance(task, dict):
                return False
            task_id = task.get("id")
            task_url = task.get("url")
            if not is_safe_task_id(task_id) or not is_http_url(task_url):
                return False
            if task_id in seen_ids:
                return False
            seen_ids.add(task_id)

        with self.lock:
            if self.is_downloading:
                return False
            self.is_downloading = True
            self.cancelled_tasks.clear()
            self.active_task_ids = set(seen_ids)

        worker = threading.Thread(
            target=self._orchestrate_downloads,
            args=(dict(config), target_tasks),
            name="Aurion-Download-Batch",
            daemon=True
        )
        try:
            worker.start()
            return True
        except RuntimeError as exc:
            with self.lock:
                self.is_downloading = False
                self.active_task_ids.clear()
                self.cancelled_tasks.clear()
            print(f"[Core] No se pudo iniciar el motor de descargas: {exc}")
            return False

    def _orchestrate_downloads(self, config, tasks):
        """Coordina el lote y garantiza que el motor siempre vuelve a estado libre."""
        try:
            try:
                configured_workers = int(config.get("simul", 5))
            except (TypeError, ValueError):
                configured_workers = 5
            configured_workers = max(1, min(configured_workers, 8))
            simul_workers = max(1, effective_parallel_downloads(configured_workers, len(tasks)))
            config["simul"] = simul_workers

            dest_folder = self.resolve_destination_folder(config)
            self._save_cover_image(config)
            print(f"\n[Core] Iniciando pool de descargas: {simul_workers} simultáneas en '{dest_folder}'")

            any_success = False
            with ThreadPoolExecutor(max_workers=simul_workers, thread_name_prefix="Aurion-Download") as executor:
                futures = [
                    executor.submit(self._download_single_task, task, dest_folder, config)
                    for task in tasks
                ]
                for future in futures:
                    try:
                        if future.result() is True:
                            any_success = True
                    except Exception as exc:
                        print(f"[Core] Error no capturado en worker: {exc}")

            print("\n[Core] Todas las tareas del lote han concluido.")

            if any_success and self.bridge and self.bridge._window:
                try:
                    self.bridge._window.evaluate_js("window.onBatchFinished && window.onBatchFinished();")
                except Exception:
                    pass

            finish_action = str(config.get("finish_action", "open_folder"))
            should_open = bool(config.get("open_folder", True)) and finish_action != "none"
            if should_open:
                def _delayed_open(target_dest):
                    try:
                        time.sleep(0.8)
                        parent_folder = os.path.dirname(target_dest)
                        target_open = parent_folder if os.path.basename(target_dest).lower().startswith("temporada") else target_dest
                        abs_dest = os.path.abspath(target_open if os.path.exists(target_open) else target_dest)
                        if os.path.exists(abs_dest):
                            print(f"[Core] Abriendo carpeta en explorador: {abs_dest}")
                            os.startfile(abs_dest)
                    except Exception as exc:
                        print(f"[Core] Error abriendo carpeta: {exc}")

                threading.Thread(target=_delayed_open, args=(dest_folder,), daemon=True).start()

        except Exception as exc:
            print(f"[Core] Error coordinando el lote de descargas: {exc}")
        finally:
            with self.lock:
                self.is_downloading = False
                self.active_task_ids.clear()
                self.cancelled_tasks.clear()


    def _save_cover_image(self, config):
        """Guarda una portada remota con ruta contenida y tamaño de respuesta limitado."""
        if not isinstance(config, dict) or not config.get("save_cover", True):
            return

        cover_url = config.get("cover_url", "")
        if not is_http_url(cover_url):
            return

        base_dir = (config.get("dir") or "").strip() or self._get_fallback_default_dir()
        base_dir = os.path.abspath(os.path.expanduser(base_dir))
        raw_title = config.get("title") or ""
        clean_title = sanitize_path_component(str(raw_title), "Anime", 80)

        root_title = re.sub(
            r'[\s\-_]*(?:(?:\d+(?:st|nd|rd|th|da|ra)?\s*(?:season|temporada))|'
            r'(?:(?:season|temporada)\s*\d+)|(?:\bS\d+\b)).*$',
            '',
            clean_title,
            flags=re.IGNORECASE
        ).strip() or clean_title
        root_title = sanitize_path_component(root_title, "Anime", 80)
        root_anime_dir = os.path.join(base_dir, root_title)

        try:
            base_abs = os.path.abspath(base_dir)
            root_abs = os.path.abspath(root_anime_dir)
            if os.path.commonpath([base_abs, root_abs]).lower() != base_abs.lower():
                return
            os.makedirs(root_abs, exist_ok=True)
            cover_path = os.path.join(root_abs, "cover.jpg")
            if os.path.exists(cover_path):
                return

            request = urllib.request.Request(
                cover_url,
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
            )
            with urllib.request.urlopen(request, timeout=10) as response:
                data = response.read(8 * 1024 * 1024 + 1)
            if not data or len(data) > 8 * 1024 * 1024:
                return

            temp_cover = cover_path + ".tmp"
            with open(temp_cover, "wb") as cover_file:
                cover_file.write(data)
            os.replace(temp_cover, cover_path)
            print(f"[Core] Portada guardada en raíz: {cover_path}")
        except (OSError, ValueError, urllib.error.URLError) as exc:
            print(f"[Core] Error descargando portada: {exc}")

    def _download_single_task(self, task, dest_folder, config):
        if not isinstance(task, dict) or not isinstance(config, dict):
            return False
        task_id = task.get("id")
        if not is_safe_task_id(task_id):
            print("[Core] Tarea rechazada: ID inválido.")
            return False

        title = sanitize_path_component(str(task.get("title") or "Episodio"), "video", 70)
        raw_url = task.get("url")
        page_ref = task.get("pageUrl") or ""
        if not is_http_url(raw_url):
            print(f"[Core] Tarea {task_id} rechazada: URL inválida.")
            return False
        if not is_http_url(page_ref):
            page_ref = ""

        with self.lock:
            if task_id in self.cancelled_tasks:
                self.cancelled_tasks.discard(task_id)
                return False


        is_yt = config.get("is_youtube", False)
        is_audio = config.get("is_audio_only", False)
        quality = str(config.get("quality", "1080"))

        # Si es un enlace de embed (Streamtape, MixDrop, Voe, etc.), extraer su stream directo antes de empezar
        url = raw_url if is_yt else self._resolve_embed_to_direct_stream(raw_url, page_ref)
        if not is_http_url(url):
            url = raw_url
        if not is_yt and "index-f" in url.lower():
            url = re.sub(r'index-f\d+-[^\.]+\.m3u8', 'master.m3u8', url)

        try:
            raw_threads = int(config.get("threads", 32))
        except (TypeError, ValueError):
            raw_threads = 32

        profile = build_download_profile(
            url,
            configured_threads=raw_threads,
            configured_aria_connections=config.get("aria_connections", 16),
            has_aria2=self.has_aria2,
            is_youtube=is_yt,
            simultaneous_downloads=config.get("simul", 1),
            protocol_hint=task.get("protocol"),
        )
        is_segmented_stream = profile.protocol in {"hls", "dash"}
        threads_count = profile.fragment_workers

        speed_limit_str = str(config.get("speed_limit", "0")).strip()
        rate_limit_bytes = parse_speed_limit_bytes(speed_limit_str)
        file_conflict_policy = str(config.get("file_conflict", "rename")).strip().lower()
        if file_conflict_policy not in {"rename", "skip", "overwrite"}:
            file_conflict_policy = "rename"
        configured_aria_conns = profile.aria_connections

        yt_target_height = None
        if is_yt and is_audio:
            fmt_choice = "mp3"
            format_selector = "bestaudio/best"
        elif is_yt:
            fmt_choice = "mp4"
            q_str = str(quality).lower().strip()
            if q_str in ["max", "máx"]:
                yt_target_height = 4320
                format_selector = "bestvideo+bestaudio/best"
            elif q_str in ["min", "144", "144p"]:
                yt_target_height = 144
                format_selector = "worstvideo+bestaudio/worst"
            else:
                if q_str == "4k":
                    yt_target_height = 2160
                elif q_str == "2k":
                    yt_target_height = 1440
                elif q_str.endswith("p") and q_str[:-1].isdigit():
                    yt_target_height = int(q_str[:-1])
                elif q_str.isdigit():
                    yt_target_height = int(q_str)
                else:
                    yt_target_height = 1080
                format_selector = (
                    f"bestvideo[height<={yt_target_height}]+bestaudio/"
                    f"best[height<={yt_target_height}]/"
                    f"bestvideo+bestaudio/"
                    f"best"
                )
        else:
            fmt_choice = str(config.get("fmt", "mp4")).replace(".", "").lower().strip()
            if fmt_choice not in ["mp4", "mkv"]:
                fmt_choice = "mp4"
            format_selector = "bestvideo[height<=1080]+bestaudio/best[height<=1080]/bestvideo+bestaudio/best"

        # Limpiar caracteres prohibidos y limitar a 70 caracteres para evitar el tope MAX_PATH de 260 caracteres en Windows
        clean_file_title = sanitize_path_component(str(title), "video", 70)

        mode = config.get("active_mode", "anime")
        if mode == "anime" and not is_yt:
            ep_match = re.search(r'(?:[\s\-_]+(?:Episodio|Capitulo|Episode|Cap|Ep|E)[\s\-_]*|#\s*)(\d+)', clean_file_title, re.IGNORECASE)
            sea_match = re.search(
                r'(?:(\d+)(?:st|nd|rd|th|da|ra)?\s*(?:season|temporada))|(?:(?:season|temporada)\s*(\d+))|(?:\bS(\d+)\b)',
                clean_file_title,
                re.IGNORECASE
            )

            if ep_match:
                ep_num = int(ep_match.group(1))
                detected_season = None
                if sea_match:
                    s_str = sea_match.group(1) or sea_match.group(2) or sea_match.group(3)
                    if s_str and s_str.isdigit():
                        detected_season = int(s_str)

                final_s = detected_season if detected_season is not None else int(config.get("season_num", 1))

                raw_base_name = clean_file_title[:ep_match.start()].strip()
                clean_anime_base = re.sub(
                    r'[\s\-_]*(?:(?:\d+(?:st|nd|rd|th|da|ra)?\s*(?:season|temporada))|(?:(?:season|temporada)\s*\d+)|(?:\bS\d+\b)).*$',
                    '',
                    raw_base_name,
                    flags=re.IGNORECASE
                ).strip()
                if not clean_anime_base:
                    clean_anime_base = raw_base_name or "Episodio"

                clean_file_title = f"{clean_anime_base} - S{final_s:02d}E{ep_num:02d}"

        expected_final_path = os.path.join(dest_folder, f"{clean_file_title}.{fmt_choice}")
        if self._skip_existing_output(task_id, expected_final_path, file_conflict_policy):
            return True

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
        diagnostic_host = (parsed_url.hostname or "").lower()
        origin_domain = f"{parsed_url.scheme}://{parsed_url.netloc}"

        if "mp4upload" in netloc:
            referer = "https://www.mp4upload.com/"
        elif "streamtape" in netloc or "tapecontent" in netloc:
            referer = "https://streamtape.com/"
            origin_domain = "https://streamtape.com"
        elif "mixdrop" in netloc or "mixdrp" in netloc or "mxcontent" in netloc:
            referer = page_ref if (page_ref and "mixdr" in page_ref.lower()) else "https://mixdrop.ag/"
            origin_domain = "https://mixdrop.ag"
        elif "yourupload" in netloc or "vidcache" in netloc:
            referer = "https://www.yourupload.com/"
            origin_domain = "https://www.yourupload.com"
        elif any(s in netloc for s in ["sprintcdn", "streamwish", "filelions", "vidhide", "hglamioz", "wish", "playmate", "earnvids", "vixeo", "lion", "peytone", "ryderjet", "voe"]):
            referer = origin_domain + "/"
        elif page_ref:
            referer = page_ref
        else:
            referer = origin_domain + "/"

        print(f"\n[Core -> Tarea Iniciada] {title}")
        worker_label = str(threads_count) if profile.protocol in {"hls", "dash", "youtube"} else "no aplica"
        print(
            f"      Perfil: {profile.protocol.upper()} | Host: {profile.host_class} | "
            f"Fragmentos simultáneos: {worker_label} | aria2: "
            f"{'sí (' + str(configured_aria_conns) + ' conexiones)' if profile.use_aria2 else 'no'}"
        )
        print(f"      Motivo: {profile.reason} | Formato: .{fmt_choice} | Servidor: {netloc}")

        setattr(self, f"_p_{task_id}", 0)
        current_stream_type = {"val": "video" if not is_audio else "audio"}

        def progress_hook(d):
            with self.lock:
                if task_id in self.cancelled_tasks or (is_yt and "youtube_active" in self.cancelled_tasks):
                    raise Exception("TASK_CANCELLED_BY_USER")

            if d.get("status") == "downloading":
                downloaded = d.get("downloaded_bytes", 0)
                total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0

                raw_percent = (downloaded / total * 100) if total > 0 else 0

                if is_yt and not is_audio:
                    # Progreso lineal continuo: 0% a 85% vídeo, 85% a 97% audio
                    if current_stream_type["val"] == "video":
                        percent = round(min(85.0, raw_percent * 0.85), 1)
                    else:
                        percent = round(min(97.0, 85.0 + (raw_percent * 0.12)), 1)
                elif is_yt and is_audio:
                    percent = round(min(96.0, raw_percent * 0.96), 1)
                else:
                    frag_index = d.get("fragment_index")
                    frag_count = d.get("fragment_count")
                    if frag_index and frag_count and frag_count > 0:
                        percent = round(min(98.0, (frag_index / frag_count) * 98.0), 1)
                    else:
                        percent = round(min(98.0, raw_percent * 0.98), 1)

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
                            f"window.updateDownloadProgress && window.updateDownloadProgress('{task_id}', 85, 'Pista de audio', 'Descargando audio...');"
                        )
                else:
                    if self.bridge and self.bridge._window:
                        self.bridge._window.evaluate_js(
                            f"window.updateDownloadProgress && window.updateDownloadProgress('{task_id}', 98, 'Ensamblando', 'Procesando archivo final...');"
                        )

        postprocessors_list = []
        if is_yt and is_audio:
            postprocessors_list.append({
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '320',
            })
        elif not is_yt and is_segmented_stream:
            postprocessors_list.append({
                'key': 'FFmpegVideoRemuxer',
                'preferedformat': fmt_choice
            })

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
            'merge_output_format': 'mp4' if (is_yt and not is_audio) else (fmt_choice if (not is_yt and is_segmented_stream) else None),
            'progress_hooks': [progress_hook],
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
            'postprocessor_args': {'ffmpeg': ffmpeg_tolerant_args} if (postprocessors_list and not is_audio and not is_yt) else {},
            'ffmpeg_location': os.path.dirname(self.ffmpeg_path) if self.ffmpeg_path else None
        }

        if rate_limit_bytes:
            ydl_opts['ratelimit'] = rate_limit_bytes

        if is_yt:
            # En YouTube descargamos a máxima velocidad sin download_ranges remotos (el corte se hace en 0.2s en local con FFmpeg al terminar)
            ydl_opts.pop('hls_use_mpegts', None)
            ydl_opts.pop('http_chunk_size', None)
            ydl_opts.update({
                'concurrent_fragment_downloads': threads_count,
                'merge_output_format': 'mp4' if not is_audio else None,
            })
        else:
            custom_http_headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                'Referer': referer if referer and referer != "://" else 'https://animeflv.net/',
                'Origin': origin_domain if origin_domain and origin_domain != "://" else 'https://animeflv.net',
                'Accept': '*/*',
                'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'cross-site'
            }
            ydl_opts['http_headers'] = custom_http_headers
            # Se conserva el buffer adaptativo de yt-dlp para evitar reservar 64 MiB por tarea.
            ydl_opts['concurrent_fragment_downloads'] = threads_count
            ydl_opts['fragment_retries'] = 40
            ydl_opts['skip_unavailable_fragments'] = True
            if not is_segmented_stream:
                ydl_opts['http_chunk_size'] = 10485760

            max_aria_conns = configured_aria_conns

            if profile.use_aria2 and profile.host_class == "mp4upload":
                mp4upload_connections = max(1, min(8, max_aria_conns))
                aria_args = [
                    '--console-log-level=warn',
                    '--summary-interval=1',
                    f'-s{mp4upload_connections}',
                    f'-x{mp4upload_connections}',
                    f'-j{mp4upload_connections}',
                    '-k1M',
                    '--min-split-size=1M',
                    f'--max-connection-per-server={mp4upload_connections}',
                    '--file-allocation=none',
                    '--optimize-concurrent-downloads=true',
                    '--conditional-get=true',
                    '--enable-mmap=true',
                    '--header=Referer: https://www.mp4upload.com/',
                    '--header=Origin: https://www.mp4upload.com',
                    f'--header=User-Agent: {custom_http_headers["User-Agent"]}'
                ]
                if speed_limit_str not in ["0", ""]:
                    aria_args.append(f'--max-overall-download-limit={speed_limit_str}')
                ydl_opts['external_downloader'] = self.aria2_path
                ydl_opts['external_downloader_args'] = {'aria2c': aria_args}

            elif profile.use_aria2 and profile.host_class == "token-sensitive":
                token_connections = max(1, min(4, max_aria_conns))
                aria_args = [
                    '--console-log-level=error',
                    '--summary-interval=0',
                    f'-s{token_connections}',
                    f'-x{token_connections}',
                    f'-j{token_connections}',
                    '-k2M',
                    '--min-split-size=2M',
                    f'--max-connection-per-server={token_connections}',
                    '--file-allocation=none',
                    '--retry-wait=1',
                    '--max-tries=10',
                    f'--header=Referer: {referer}',
                    f'--header=Origin: {origin_domain}',
                    f'--header=User-Agent: {custom_http_headers["User-Agent"]}'
                ]
                if speed_limit_str not in ["0", ""]:
                    aria_args.append(f'--max-overall-download-limit={speed_limit_str}')
                ydl_opts['external_downloader'] = self.aria2_path
                ydl_opts['external_downloader_args'] = {'aria2c': aria_args}

            elif profile.use_aria2:
                aria_args = [
                    '--console-log-level=error',
                    '--summary-interval=0',
                    f'-s{max_aria_conns}',
                    f'-x{max_aria_conns}',
                    f'-j{max_aria_conns}', '-k1M',
                    '--file-allocation=none',
                    '--optimize-concurrent-downloads=true',
                    f'--max-connection-per-server={max_aria_conns}',
                    '--min-split-size=1M',
                    '--stream-piece-selector=geom',
                    f'--header=Referer: {referer}',
                    f'--header=Origin: {origin_domain}',
                    f'--header=User-Agent: {custom_http_headers["User-Agent"]}'
                ]
                if speed_limit_str not in ["0", ""]:
                    aria_args.append(f'--max-overall-download-limit={speed_limit_str}')
                ydl_opts['external_downloader'] = self.aria2_path
                ydl_opts['external_downloader_args'] = {'aria2c': aria_args}

        transfer_started_at = time.monotonic()
        recovered_transfer = False
        record_download_event("started", {
            "protocol": profile.protocol,
            "host": diagnostic_host,
            "host_class": profile.host_class,
            "fragment_workers": threads_count if profile.protocol in {"hls", "dash"} else None,
            "aria2_connections": configured_aria_conns,
            "simultaneous_downloads": config.get("simul", 1),
        })
        try:
            if self.bridge and self.bridge._window:
                self.bridge._window.evaluate_js(
                    f"window.updateDownloadProgress && window.updateDownloadProgress('{task_id}', 1, 'Iniciando', 'Descargando...');"
                )

            info = None
            if "mega.nz" in url.lower():
                mega_out = os.path.join(task_temp_dir, f"{clean_file_title}.{fmt_choice}")
                ok_mega = self._download_mega_native(url, mega_out, task_id)
                if not ok_mega:
                    raise Exception("No se pudo desencriptar o descargar el stream de MEGA")
            elif is_yt:
                root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                appdata_cookie = os.path.join(
                    get_app_data_dir(),
                    '.yt_session.dpapi'
                )
                local_cookie = os.path.join(root_dir, 'cookies.txt')

                active_cookie_file = None
                # El archivo de sesión se mantiene cifrado en AppData. Solo se descifra
                # a una copia temporal de esta tarea para que yt-dlp pueda leerlo.
                if os.path.isfile(appdata_cookie) and os.path.getsize(appdata_cookie) > 100:
                    try:
                        cookie_bytes = read_protected_file(appdata_cookie)
                        if (
                            len(cookie_bytes) <= 512 * 1024
                            and cookie_bytes.startswith(b"# Netscape HTTP Cookie File")
                        ):
                            safe_tmp_cookie = os.path.join(task_temp_dir, 'yt_cookies.txt')
                            with open(safe_tmp_cookie, 'wb') as cookie_output:
                                cookie_output.write(cookie_bytes)
                            active_cookie_file = safe_tmp_cookie
                    except Exception as cookie_error:
                        print(f"[Core] No se pudo descifrar la sesión local de YouTube: {cookie_error}")
                elif os.path.isfile(local_cookie) and os.path.getsize(local_cookie) > 100:
                    active_cookie_file = local_cookie

                yt_attempts = [
                    # 1. Motor Directo Nativo
                    {'name': 'Motor Nativo Directo', 'use_cookies': False, 'clients': None},
                    # 2. Rescate con copia segura de sesión
                    {'name': 'Rescate con Sesión Segura', 'use_cookies': True, 'clients': None},
                ]

                last_err = None
                for idx, strat in enumerate(yt_attempts):
                    with self.lock:
                        if task_id in self.cancelled_tasks or "youtube_active" in self.cancelled_tasks:
                            raise Exception("TASK_CANCELLED_BY_USER")
                    try:
                        try_opts = dict(ydl_opts)
                        if strat.get('clients'):
                            try_opts['extractor_args'] = {'youtube': {'player_client': strat['clients']}}
                        else:
                            try_opts.pop('extractor_args', None)

                        if strat.get('use_cookies') and active_cookie_file:
                            try_opts['cookiefile'] = active_cookie_file

                        info = self._extract_with_yt_dlp(
                            try_opts, url, task_id, use_fragment_limiter=True
                        )
                        last_err = None
                        break
                    except Exception as err_yt:
                        if "TASK_CANCELLED_BY_USER" in str(err_yt):
                            raise err_yt
                        last_err = err_yt
                        print(f"[Core YouTube Retry {idx + 1}/{len(yt_attempts)} - {strat['name']}] Probando siguiente...")
                        time.sleep(0.2)

                if last_err is not None:
                    raise last_err
            else:
                try:
                    info = self._extract_with_yt_dlp(
                        ydl_opts, url, task_id, use_fragment_limiter=is_segmented_stream
                    )
                except Exception as dl_err:
                    err_str = str(dl_err)
                    if "TASK_CANCELLED_BY_USER" in err_str:
                        raise dl_err

                    # Recuperación HLS/DASH: reducir concurrencia solo ante fallos transitorios.
                    if is_segmented_stream and is_retryable_segment_error(err_str):
                        recovery_error = dl_err
                        for fallback_workers in fragment_fallback_levels(threads_count):
                            print(
                                f"[Core Rescate {profile.protocol.upper()}] Reintentando con "
                                f"{fallback_workers} fragmentos simultáneos..."
                            )
                            recovery_opts = dict(ydl_opts)
                            recovery_opts['concurrent_fragment_downloads'] = fallback_workers
                            recovery_opts['fragment_retries'] = 50
                            try:
                                info = self._extract_with_yt_dlp(
                                    recovery_opts, url, task_id, use_fragment_limiter=True
                                )
                                recovery_error = None
                                recovered_transfer = True
                                print(
                                    f"[Core Rescate {profile.protocol.upper()}] Recuperada "
                                    f"con {fallback_workers} fragmentos simultáneos."
                                )
                                break
                            except Exception as recovery_exc:
                                if "TASK_CANCELLED_BY_USER" in str(recovery_exc):
                                    raise recovery_exc
                                recovery_error = recovery_exc
                                print(
                                    f"[Core Rescate {profile.protocol.upper()}] "
                                    f"También falló con {fallback_workers}: {recovery_exc}"
                                )

                        if recovery_error is not None and url != raw_url:
                            print(
                                f"[Core Rescate {profile.protocol.upper()}] "
                                "Probando la URL original del reproductor..."
                            )
                            original_opts = dict(ydl_opts)
                            original_opts['concurrent_fragment_downloads'] = (
                                fragment_fallback_levels(threads_count)[-1]
                                if fragment_fallback_levels(threads_count)
                                else threads_count
                            )
                            try:
                                info = self._extract_with_yt_dlp(
                                    original_opts, raw_url, task_id, use_fragment_limiter=True
                                )
                                recovery_error = None
                                recovered_transfer = True
                            except Exception as original_exc:
                                if "TASK_CANCELLED_BY_USER" in str(original_exc):
                                    raise original_exc
                                recovery_error = original_exc

                        if recovery_error is not None:
                            raise recovery_error

                    # Rescate 1: Si Aria2 fue rechazado por MixDrop/Streamtape, descargar con el motor nativo de yt-dlp sin Aria2
                    elif 'external_downloader' in ydl_opts:
                        print("[Core Rescate] Aria2 rechazado por el CDN, descargando con stream directo nativo...")
                        native_opts = dict(ydl_opts)
                        native_opts.pop('external_downloader', None)
                        native_opts.pop('external_downloader_args', None)
                        try:
                            info = self._extract_with_yt_dlp(native_opts, url, task_id)
                        except Exception:
                            if page_ref and page_ref != url:
                                refreshed_url = self._resolve_embed_to_direct_stream(page_ref, page_ref)
                                if refreshed_url and refreshed_url != url:
                                    info = self._extract_with_yt_dlp(native_opts, refreshed_url, task_id)
                    elif url != raw_url:
                        print("[Core Rescate] Master rechazado, descargando stream original a 32 hilos...")
                        info = self._extract_with_yt_dlp(
                            ydl_opts, raw_url, task_id, use_fragment_limiter=is_segmented_stream
                        )
                    elif any(k in err_str for k in ["Conversion failed", "Postprocessing", "FFmpegPostProcessorError"]):
                        existing = [
                            f for f in os.listdir(task_temp_dir)
                            if not f.endswith('.part') and os.path.getsize(os.path.join(task_temp_dir, f)) > 2 * 1024 * 1024
                        ]
                        if not existing:
                            raise dl_err
                    else:
                        raise dl_err

            height = 'N/A'
            if info:
                height = info.get('height') or 'N/A'
                if height == 'N/A' and info.get('requested_downloads'):
                    height = info['requested_downloads'][0].get('height') or 'N/A'
            final_res_label = f"{height}p" if height != 'N/A' else None
            clean_name_check = "".join(c for c in title if c not in r'\/:*?"<>|').strip() or "video"

            generated_files = [f for f in os.listdir(task_temp_dir) if not f.endswith('.part') and not f.startswith('.')]
            final_file_path = os.path.join(dest_folder, f"{clean_name_check}.{fmt_choice}")

            if generated_files:
                generated_files.sort(key=lambda x: os.path.getsize(os.path.join(task_temp_dir, x)), reverse=True)
                source_temp = os.path.join(task_temp_dir, generated_files[0])

                # Si el usuario activó el Recorte de Clips en YouTube, recortar localmente en 0.2s con FFmpeg (-c copy)
                if is_yt:
                    clip_start = str(config.get("clip_start") or "").strip()
                    clip_end = str(config.get("clip_end") or "").strip()
                    if clip_start or clip_end:
                        source_temp = self._trim_media_file_local(source_temp, clip_start, clip_end, task_id)

                _, source_ext = os.path.splitext(source_temp)
                if not is_segmented_stream and not is_yt and source_ext:
                    final_file_path = os.path.join(dest_folder, f"{clean_name_check}{source_ext}")

                if os.path.exists(final_file_path):
                    if file_conflict_policy == "skip":
                        if self._skip_existing_output(task_id, final_file_path, file_conflict_policy):
                            try:
                                os.remove(source_temp)
                            except OSError:
                                pass
                            return True
                        raise FileExistsError(
                            f"Ya existe una ruta de destino que no es un archivo: {final_file_path}"
                        )
                    elif file_conflict_policy == "rename":
                        base_root, ext_part = os.path.splitext(final_file_path)
                        counter = 1
                        while os.path.exists(f"{base_root} ({counter}){ext_part}"):
                            counter += 1
                        final_file_path = f"{base_root} ({counter}){ext_part}"
                    else:
                        for _ in range(5):
                            try:
                                os.chmod(final_file_path, stat.S_IWRITE)
                                os.remove(final_file_path)
                                break
                            except Exception:
                                time.sleep(0.2)
                        if os.path.exists(final_file_path):
                            base_root, ext_part = os.path.splitext(final_file_path)
                            final_file_path = f"{base_root}_{int(time.time())}{ext_part}"

                if os.path.exists(source_temp):
                    try:
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

            print("\n=======================================================")
            print(f"[Core Telemetría] {title}")
            print(f"   -> Archivo generado: {os.path.basename(final_file_path)}")
            print(f"   -> Resolución Real: {final_res_label or '1080p'}")
            elapsed_seconds = max(time.monotonic() - transfer_started_at, 0.001)
            average_speed_mb = (real_file_bytes / (1024 * 1024)) / elapsed_seconds
            elapsed_label = f"{int(elapsed_seconds // 60):02d}:{elapsed_seconds % 60:05.2f}"
            print(f"   -> Tamaño final: {round(real_file_bytes / 1024 / 1024, 2)} MB")
            print(f"   -> Tiempo total: {elapsed_label} | Media efectiva: {average_speed_mb:.2f} MB/s")
            print("=======================================================\n")

            if final_res_label and self.bridge and self.bridge._window:
                self.bridge._window.evaluate_js(
                    f"window.updateTaskMetadata && window.updateTaskMetadata('{task_id}', null, '{final_res_label}');"
                )

            min_size_threshold = 20 * 1024 if is_yt else 1 * 1024 * 1024
            if real_file_bytes < min_size_threshold:
                record_download_event("failed", {
                    "protocol": profile.protocol,
                    "host": diagnostic_host,
                    "host_class": profile.host_class,
                    "error_type": "InvalidStreamSize",
                    "size_bytes": real_file_bytes,
                })
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

            record_download_event("completed", {
                "protocol": profile.protocol,
                "host": diagnostic_host,
                "host_class": profile.host_class,
                "fragment_workers": threads_count if profile.protocol in {"hls", "dash"} else None,
                "aria2_connections": configured_aria_conns,
                "simultaneous_downloads": config.get("simul", 1),
                "size_bytes": real_file_bytes,
                "duration_seconds": round(elapsed_seconds, 2),
                "average_speed_mib_s": round(average_speed_mb, 2),
                "resolution": final_res_label,
                "recovered": recovered_transfer,
            })

            if self.bridge and hasattr(self.bridge, 'db') and self.bridge.db:
                rec_mode = "youtube" if is_yt else config.get("active_mode", "anime")
                rec_res = "MP3" if (is_yt and is_audio) else (final_res_label or f"{quality}p")
                self.bridge.db.log_download(
                    title=os.path.splitext(os.path.basename(final_file_path))[0],
                    mode=rec_mode,
                    resolution=rec_res,
                    size_bytes=real_file_bytes,
                    file_path=os.path.abspath(final_file_path),
                    source_url=url
                )

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
                record_download_event("cancelled", {
                    "protocol": profile.protocol,
                    "host": diagnostic_host,
                    "host_class": profile.host_class,
                    "duration_seconds": round(max(time.monotonic() - transfer_started_at, 0), 2),
                })
                print(f"[Core] Descarga cancelada: {title}")
                if self.bridge and self.bridge._window:
                    self.bridge._window.evaluate_js(
                        f"window.updateDownloadProgress && window.updateDownloadProgress('{task_id}', 0, 'Cancelado', 'Cancelado');"
                    )
                self._force_remove_temp_dir(task_temp_dir)
            else:
                record_download_event("failed", {
                    "protocol": profile.protocol,
                    "host": diagnostic_host,
                    "host_class": profile.host_class,
                    "duration_seconds": round(max(time.monotonic() - transfer_started_at, 0), 2),
                    "error_type": type(e).__name__,
                })
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
            with self.lock:
                self.cancelled_tasks.discard(task_id)
                getattr(self, "active_task_ids", set()).discard(task_id)
            self.fragment_limiter.clear_cancelled(task_id)
            progress_attr = f"_p_{task_id}"
            if hasattr(self, progress_attr):
                try:
                    delattr(self, progress_attr)
                except AttributeError:
                    pass