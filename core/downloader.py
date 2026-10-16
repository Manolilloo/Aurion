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
    """Convierte 'MM:SS' o 'HH:MM:SS' a segundos enteros."""
    if not t_str:
        return None
    cleaned = re.sub(r'[^0-9:]', '', str(t_str).strip())
    if not cleaned:
        return None
    parts = [int(p) for p in cleaned.split(':') if p.isdigit()]
    if len(parts) == 3:
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    if len(parts) == 2:
        return parts[0] * 60 + parts[1]
    if len(parts) == 1:
        return parts[0]
    return None


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

    def _get_fallback_default_dir(self):
        return os.path.join(os.path.expanduser("~"), "Videos", "Aurion")

    def _cleanup_on_exit(self):
        with self.lock:
            dirs_to_clean = list(self.active_temp_dirs)
        for d in dirs_to_clean:
            self._force_remove_temp_dir(d)

    def cleanup_all_temp(self):
        with self.lock:
            dirs = list(self.active_temp_dirs)
            self.active_temp_dirs.clear()
        for d in dirs:
            self._force_remove_temp_dir(d)

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

        try:
            cmd = f'rmdir /s /q "{os.path.abspath(target_path)}"'
            subprocess.run(cmd, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=2)
        except Exception:
            pass

    def _cleanup_orphaned_temp_dirs(self):
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

            default_vids = self._get_fallback_default_dir()
            if os.path.exists(default_vids):
                check_dirs.add(default_vids)

            for base in check_dirs:
                if not os.path.exists(base):
                    continue
                try:
                    for root, dirs, _ in os.walk(base, topdown=False):
                        for d in list(dirs):
                            if d.startswith(".tmp_"):
                                target_path = os.path.join(root, d)
                                self._force_remove_temp_dir(target_path)
                except Exception:
                    pass

        threading.Thread(target=run_cleanup, daemon=True).start()

    def cancel_task(self, task_id):
        with self.lock:
            self.cancelled_tasks.add(task_id)
        print(f"[Core] Cancelando tarea: {task_id}")

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
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        api_url = f"https://g.api.mega.co.nz/cs?id={int(time.time() * 1000)}"
        payload = json.dumps([{"a": "g", "g": 1, "p": file_id}]).encode('utf-8')
        req = urllib.request.Request(api_url, data=payload, headers={'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'})

        with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
            res_data = json.loads(resp.read().decode('utf-8'))

        if not isinstance(res_data, list) or not res_data or isinstance(res_data[0], int):
            return False

        dl_url = res_data[0].get('g')
        total_bytes = int(res_data[0].get('s', 0))
        if not dl_url or total_bytes <= 0:
            return False

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
                pct = round((downloaded / total_bytes) * 100, 1)
                if self.bridge and self.bridge._window:
                    self.bridge._window.evaluate_js(
                        f"window.updateDownloadProgress && window.updateDownloadProgress('{task_id}', {pct}, '{speed_mb} MB/s', 'Descargando MEGA ({pct}%)');"
                    )

        return os.path.exists(output_file) and os.path.getsize(output_file) > 1024 * 1024

    # =========================================================================
    # DESEMPAQUETADOR RÁPIDO PARA EMBEDS DE STREAMTAPE, MIXDROP, VOE Y WISH
    # =========================================================================
    def _resolve_embed_to_direct_stream(self, url, referer=""):
        """Si la URL es un embed (/e/ o /v/) o un token caducado de Streamtape/MixDrop, extrae el enlace fresco."""
        u_low = url.lower()
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Referer': referer or url
        }

        try:
            # 1. Resolver Streamtape (streamtape.com/e/... o /v/...)
            if "streamtape" in u_low and ("/e/" in u_low or "/v/" in u_low):
                req = urllib.request.Request(url, headers=headers)
                with urllib.request.urlopen(req, context=ctx, timeout=6) as resp:
                    html = resp.read().decode('utf-8', errors='ignore')
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
                        html = resp.read().decode('utf-8', errors='ignore')

                    # Seguir redirección JS típica de VOE (window.location.href = 'https://...')
                    js_redir = re.search(r"window\.location\.href\s*=\s*['\"](https?://[^'\"]+)['\"]", html)
                    if js_redir:
                        redir_req = urllib.request.Request(js_redir.group(1), headers=headers)
                        with urllib.request.urlopen(redir_req, context=ctx, timeout=6) as resp2:
                            html = resp2.read().decode('utf-8', errors='ignore')

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
        base_dir = (config.get("dir") or "").strip() or self._get_fallback_default_dir()
        mode = config.get("active_mode", "anime")
        anime_title = config.get("title", "").strip()
        clean_title = "".join(c for c in anime_title if c not in r'\/:*?"<>|').strip()

        if config.get("is_youtube") or mode == "youtube":
            if config.get("is_playlist") and config.get("create_playlist_subfolder", True):
                pl_title = config.get("playlist_title") or clean_title or "Playlist_YouTube"
                clean_pl = "".join(c for c in pl_title if c not in r'\/:*?"<>|').strip() or "Playlist_YouTube"
                safe_pl = clean_pl[:45].rstrip(". ")
                final_dir = os.path.abspath(os.path.join(base_dir, safe_pl))
            else:
                raw_folder = clean_title or "Video_YouTube"
                safe_folder = raw_folder[:45].rstrip(". ")
                final_dir = os.path.abspath(os.path.join(base_dir, safe_folder))
        elif mode == "movie":
            if clean_title and clean_title != "Esperando consulta...":
                final_dir = os.path.join(base_dir, clean_title)
            else:
                final_dir = base_dir
        else:
            is_single = config.get("is_single_season", False)
            season_num = config.get("season_num", 1)

            detected_season = None
            if clean_title:
                m = re.search(
                    r'(?:(\d+)(?:st|nd|rd|th|da|ra)?\s*(?:season|temporada))|(?:(?:season|temporada)\s*(\d+))|(?:\bS(\d+)\b)',
                    clean_title,
                    re.IGNORECASE
                )
                if m:
                    num_str = m.group(1) or m.group(2) or m.group(3)
                    if num_str and num_str.isdigit():
                        detected_season = int(num_str)

            effective_season = detected_season if detected_season is not None else season_num

            root_anime_folder = clean_title
            if detected_season is not None:
                root_anime_folder = re.sub(
                    r'[\s\-_]*(?:(?:\d+(?:st|nd|rd|th|da|ra)?\s*(?:season|temporada))|(?:(?:season|temporada)\s*\d+)|(?:\bS\d+\b)).*$',
                    '',
                    clean_title,
                    flags=re.IGNORECASE
                ).strip()
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

        base_dir = (config.get("dir") or "").strip() or self._get_fallback_default_dir()
        anime_title = config.get("title", "").strip()
        clean_title = "".join(c for c in anime_title if c not in r'\/:*?"<>|').strip()

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

        if any_success:
            if self.bridge and self.bridge._window:
                try:
                    self.bridge._window.evaluate_js("window.onBatchFinished && window.onBatchFinished();")
                except Exception:
                    pass

            finish_action = str(config.get("finish_action", "open_folder"))
            should_open = bool(config.get("open_folder", True)) and (finish_action != "none")

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
                    except Exception as e:
                        print(f"[Core] Error abriendo carpeta: {e}")

                threading.Thread(target=_delayed_open, args=(dest_folder,), daemon=True).start()

    def _download_single_task(self, task, dest_folder, config):
        task_id = task.get("id")
        title = task.get("title", "Episodio")
        raw_url = task.get("url")
        page_ref = task.get("pageUrl") or ""

        if not raw_url:
            return False

        with self.lock:
            if task_id in self.cancelled_tasks:
                return False

        is_yt = config.get("is_youtube", False)
        is_audio = config.get("is_audio_only", False)
        quality = str(config.get("quality", "1080"))

        # Si es un enlace de embed (Streamtape, MixDrop, Voe, etc.), extraer su stream directo antes de empezar
        url = raw_url if is_yt else self._resolve_embed_to_direct_stream(raw_url, page_ref)
        if not is_yt and "index-f" in url.lower():
            url = re.sub(r'index-f\d+-[^\.]+\.m3u8', 'master.m3u8', url)

        raw_threads = int(config.get("threads", 32))
        is_m3u8 = '.m3u8' in url.lower()
        threads_count = max(8, raw_threads)

        speed_limit_str = str(config.get("speed_limit", "0")).strip()
        rate_limit_bytes = parse_speed_limit_bytes(speed_limit_str)
        file_conflict_policy = str(config.get("file_conflict", "rename")).strip().lower()
        try:
            configured_aria_conns = int(config.get("aria_connections", 16))
        except ValueError:
            configured_aria_conns = 16

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
        raw_clean_title = "".join(c for c in title if c not in r'\/:*?"<>|').strip() or "video"
        clean_file_title = raw_clean_title[:70].rstrip(". ")

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
        if file_conflict_policy == "skip" and os.path.exists(expected_final_path) and os.path.getsize(expected_final_path) > 100 * 1024:
            existing_size = os.path.getsize(expected_final_path)
            if self.bridge and self.bridge._window:
                self.bridge._window.evaluate_js(
                    f"window.updateRealSizeOnly && window.updateRealSizeOnly('{task_id}', {existing_size});"
                )
                self.bridge._window.evaluate_js(
                    f"window.updateDownloadProgress && window.updateDownloadProgress('{task_id}', 100, 'Omitido', 'Completado');"
                )
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
        print(f"      Formato: .{fmt_choice} | Hilos: {threads_count} | Host: {netloc}")

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
        elif not is_yt and is_m3u8:
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
                'concurrent_fragment_downloads': 8,
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
            ydl_opts['buffersize'] = 1024 * 1024 * 64
            ydl_opts['concurrent_fragment_downloads'] = threads_count
            ydl_opts['fragment_retries'] = 40
            ydl_opts['skip_unavailable_fragments'] = True
            ydl_opts['http_chunk_size'] = 10485760

            is_mp4upload = "mp4upload" in netloc
            # Servidores con tokens sensibles a exceso de conexiones paralelas (MixDrop, Streamtape, YourUpload, Dood)
            is_sensitive_mp4_host = any(h in netloc for h in ["streamtape", "tapecontent", "mixdrop", "mixdrp", "mxcontent", "yourupload", "vidcache", "dood", "d000d"])
            max_aria_conns = max(1, min(16, configured_aria_conns, threads_count))

            if is_mp4upload and self.has_aria2:
                aria_args = [
                    '--console-log-level=warn',
                    '--summary-interval=1',
                    '-s8', '-x8', '-j8', '-k1M',
                    '--min-split-size=1M',
                    '--max-connection-per-server=8',
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

            elif is_sensitive_mp4_host and self.has_aria2 and not is_m3u8:
                # 4 conexiones simultáneas con chunks de 2M: multiplica por 4 la velocidad en MixDrop/Streamtape sin que el servidor corte el token
                aria_args = [
                    '--console-log-level=error',
                    '--summary-interval=0',
                    '-s4', '-x4', '-j4', '-k2M',
                    '--min-split-size=2M',
                    '--max-connection-per-server=4',
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

            elif self.has_aria2 and not is_m3u8:
                aria_args = [
                    '--console-log-level=error',
                    '--summary-interval=0',
                    f'-s{max_aria_conns}',
                    f'-x{max_aria_conns}',
                    '-j16', '-k1M',
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
                appdata_cookie = os.path.join(os.environ.get('LOCALAPPDATA', os.path.expanduser('~')), 'Aurion', '.yt_session.dat')
                local_cookie = os.path.join(root_dir, 'cookies.txt')

                active_cookie_file = None
                # Crear copia temporal sin atributos ocultos para evitar PermissionError [Errno 13] al guardar cookies
                if os.path.isfile(appdata_cookie) and os.path.getsize(appdata_cookie) > 100:
                    try:
                        safe_tmp_cookie = os.path.join(task_temp_dir, 'yt_cookies.txt')
                        shutil.copyfile(appdata_cookie, safe_tmp_cookie)
                        active_cookie_file = safe_tmp_cookie
                    except Exception:
                        active_cookie_file = appdata_cookie
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

                        with yt_dlp.YoutubeDL(try_opts) as ydl_yt:
                            info = ydl_yt.extract_info(url, download=True)
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
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        info = ydl.extract_info(url, download=True)
                except Exception as dl_err:
                    err_str = str(dl_err)
                    if "TASK_CANCELLED_BY_USER" in err_str:
                        raise dl_err

                    # Rescate 1: Si Aria2 fue rechazado por MixDrop/Streamtape, descargar con el motor nativo de yt-dlp sin Aria2
                    if 'external_downloader' in ydl_opts:
                        print("[Core Rescate] Aria2 rechazado por el CDN, descargando con stream directo nativo...")
                        native_opts = dict(ydl_opts)
                        native_opts.pop('external_downloader', None)
                        native_opts.pop('external_downloader_args', None)
                        try:
                            with yt_dlp.YoutubeDL(native_opts) as ydl_nat:
                                info = ydl_nat.extract_info(url, download=True)
                        except Exception:
                            if page_ref and page_ref != url:
                                refreshed_url = self._resolve_embed_to_direct_stream(page_ref, page_ref)
                                if refreshed_url and refreshed_url != url:
                                    with yt_dlp.YoutubeDL(native_opts) as ydl_ref:
                                        info = ydl_ref.extract_info(refreshed_url, download=True)
                    elif url != raw_url:
                        print("[Core Rescate] Master rechazado, descargando stream original a 32 hilos...")
                        with yt_dlp.YoutubeDL(ydl_opts) as ydl_orig:
                            info = ydl_orig.extract_info(raw_url, download=True)
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
                if not is_m3u8 and not is_yt and source_ext:
                    final_file_path = os.path.join(dest_folder, f"{clean_name_check}{source_ext}")

                if os.path.exists(final_file_path):
                    if file_conflict_policy == "skip":
                        os.remove(source_temp)
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
            print(f"   -> Tamaño final: {round(real_file_bytes / 1024 / 1024, 2)} MB")
            print("=======================================================\n")

            if final_res_label and self.bridge and self.bridge._window:
                self.bridge._window.evaluate_js(
                    f"window.updateTaskMetadata && window.updateTaskMetadata('{task_id}', null, '{final_res_label}');"
                )

            min_size_threshold = 20 * 1024 if is_yt else 1 * 1024 * 1024
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