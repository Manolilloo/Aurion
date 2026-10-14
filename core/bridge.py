import os
import sys
import json
import re
import time
import threading
import ssl
import shutil
import urllib.request
import urllib.parse
import tempfile
import subprocess
from http.server import HTTPServer, BaseHTTPRequestHandler
from PIL import Image
import io
import webview
from .downloader import AurionDownloader
from .database import AurionDatabase

APP_VERSION = "1.1.8"
GITHUB_REPO = "Manolilloo/Aurion"
CONFIG_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config.json")


class AurionHTTPHandler(BaseHTTPRequestHandler):
    """Receptor HTTP para capturas de la extensión del navegador"""
    def log_message(self, format, *args):
        pass  # Silenciar logs ruidosos en consola

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        if self.path == '/api/enqueue':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            try:
                data = json.loads(body.decode('utf-8'))
                if hasattr(self.server, 'bridge_instance'):
                    self.server.bridge_instance.on_extension_link(data)

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "ok"}).encode('utf-8'))
            except Exception:
                self.send_response(400)
                self.end_headers()
        else:
            self.send_response(404)
            self.end_headers()


class AurionBridge:
    def __init__(self):
        self.config = self.load_config()
        self._window = None
        self._is_maximized = False
        self.db = AurionDatabase()
        self.downloader = AurionDownloader(self)
        self.start_internal_server()

    def set_window(self, window):
        self._window = window

    def start_internal_server(self):
        """Inicia un servidor local en el puerto 6800 para recibir enlaces"""
        def run_server():
            server_address = ('127.0.0.1', 6800)
            try:
                httpd = HTTPServer(server_address, AurionHTTPHandler)
                httpd.bridge_instance = self
                print("[Core] Servidor receptor Aurion escuchando en http://127.0.0.1:6800")
                httpd.serve_forever()
            except Exception as e:
                print(f"[Core] Error al iniciar servidor local en 6800: {e}")

        t = threading.Thread(target=run_server, daemon=True)
        t.start()

    def on_extension_link(self, data):
        """Envía el enlace capturado desde la extensión al frontend de la app"""
        if not isinstance(data, dict):
            return

        page_title = str(data.get("page_title") or "").strip()
        active_anime = self.config.get("anime", {}).get("active_title", "").strip()

        # Si el título recibido es un hash alfanumérico sin sentido (ej. 'wl2bdbhqi7s')
        # y ya tenemos un anime fijado en Aurion, usamos el título del anime activo
        is_suspicious_hash = bool(re.match(r'^[a-zA-Z0-9_\-]{6,25}$', page_title))
        if (not page_title or is_suspicious_hash) and active_anime:
            data["page_title"] = active_anime

        if self._window:
            safe_data = json.dumps(data)
            self._window.evaluate_js(f"window.onLinkReceived && window.onLinkReceived({safe_data});")

    def _get_default_config(self):
        return {
            "app_version": APP_VERSION,
            "active_mode": "anime",
            "anime": {
                "dir": "",
                "season": 1,
                "start_ep": 1,
                "save_cover": True,
                "open_folder": True,
                "res": "max",
                "fmt": "mkv",
                "threads": "32",
                "simul": "20",
                "active_title": "",
                "active_tags": "",
                "active_bg": "",
                "accent1": "#ffd60a",
                "accent2": "#ffb703"
            },
            "movie": {
                "dir": "",
                "season": 1,
                "start_ep": 1,
                "save_cover": True,
                "open_folder": True,
                "res": "max",
                "fmt": "mkv",
                "threads": "32",
                "simul": "5",
                "active_title": "",
                "active_tags": "",
                "active_bg": "",
                "accent1": "#bf5af2",
                "accent2": "#5e5ce6"
            },
            "youtube": {
                "dir": "",
                "format": "video",
                "res": "1080",
                "open_folder": True
            },
            "settings": {
                "sound_effects": True,
                "perf_mode": False,
                "check_updates": True,
                "notify_sound": True,
                "accent_theme": "dynamic",
                "glow_intensity": "normal",
                "spinning_cover": False,
                "spin_speed": "normal",
                "speed_limit": "0",
                "file_conflict": "rename",
                "aria_connections": "16",
                "finish_action": "open_folder",
                "sections_order": ["anime", "movie", "youtube"],
                "sections_visibility": {"anime": True, "movie": True, "youtube": True}
            }
        }

    def load_config(self):
        default_config = self._get_default_config()
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    for k, v in data.items():
                        if isinstance(v, dict) and k in default_config and isinstance(default_config[k], dict):
                            default_config[k].update(v)
                        else:
                            default_config[k] = v
                    default_config["app_version"] = APP_VERSION
                    return default_config
            except Exception:
                pass
        return default_config

    def save_config(self, new_data):
        if not isinstance(new_data, dict):
            return False
        for k, v in new_data.items():
            if k == "settings" and isinstance(v, dict):
                if "settings" not in self.config or not isinstance(self.config["settings"], dict):
                    self.config["settings"] = {}
                self.config["settings"].update(v)
            elif isinstance(v, dict) and k in self.config and isinstance(self.config[k], dict):
                self.config[k].update(v)
            else:
                self.config[k] = v
        self.config["app_version"] = APP_VERSION
        try:
            with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump(self.config, f, indent=2)
            return True
        except Exception as e:
            print(f"[Core] Error guardando config.json: {e}")
            return False

    def get_initial_state(self):
        self.config["app_version"] = APP_VERSION
        return self.config

    def toggle_mode(self, mode):
        self.config["active_mode"] = mode
        self.save_config(self.config)
        return True

    def open_external_browser(self, url):
        import webbrowser
        threading.Thread(target=lambda: webbrowser.open(url), daemon=True).start()

    def select_folder(self, current_path=""):
        if not self._window:
            return current_path
        folder = self._window.create_file_dialog(
            webview.FOLDER_DIALOG,
            directory=current_path if (current_path and os.path.exists(current_path)) else os.path.expanduser("~")
        )
        if folder and len(folder) > 0:
            return folder[0]
        return current_path

    def get_disk_space(self, target_path):
        try:
            if target_path and os.path.exists(target_path):
                path = target_path
            elif target_path and os.path.splitdrive(target_path)[0]:
                path = os.path.splitdrive(target_path)[0] + "\\"
            else:
                path = os.path.expanduser("~")

            if not os.path.exists(path):
                path = os.path.abspath(os.sep)

            total, used, free = shutil.disk_usage(path)
            gb_total = round(total / (1024 ** 3), 1)
            gb_free = round(free / (1024 ** 3), 1)
            percent_used = round((used / total) * 100, 1)

            return {
                "drive": os.path.splitdrive(path)[0] or "Unidad",
                "total_gb": gb_total,
                "free_gb": gb_free,
                "percent_used": percent_used
            }
        except Exception:
            return {"drive": "N/A", "total_gb": 0, "free_gb": 0, "percent_used": 0}

    def clear_temp_cache(self):
        """Limpia archivos temporales de descarga residuales y devuelve los MB liberados."""
        total_freed = 0
        try:
            temp_dir = tempfile.gettempdir()
            for f in os.listdir(temp_dir):
                if f.startswith("aurion_") or f.endswith(".aria2"):
                    full_p = os.path.join(temp_dir, f)
                    try:
                        if os.path.isfile(full_p):
                            total_freed += os.path.getsize(full_p)
                            os.remove(full_p)
                        elif os.path.isdir(full_p):
                            total_freed += sum(
                                os.path.getsize(os.path.join(dirpath, filename))
                                for dirpath, _, filenames in os.walk(full_p)
                                for filename in filenames
                            )
                            shutil.rmtree(full_p, ignore_errors=True)
                    except Exception:
                        pass
            if self.downloader:
                self.downloader.cleanup_all_temp()
        except Exception as e:
            print(f"[Core] Error limpiando temporales: {e}")

        return round(total_freed / (1024 * 1024), 1)

    def check_binaries_status(self):
        """Comprueba si aria2c y ffmpeg están disponibles a través del motor."""
        return {
            "aria2": bool(self.downloader and self.downloader.has_aria2),
            "ffmpeg": bool(self.downloader and self.downloader.has_ffmpeg)
        }

    def get_dominant_colors(self, image_url):
        if not image_url:
            return None
        try:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            headers = {'User-Agent': 'Mozilla/5.0'}
            req = urllib.request.Request(image_url, headers=headers)
            with urllib.request.urlopen(req, context=ctx, timeout=5) as resp:
                data = resp.read()
                img = Image.open(io.BytesIO(data)).convert('RGB')
                img = img.resize((60, 60))
                colors = img.getcolors(maxcolors=3600)
                if not colors:
                    return None

                def color_vibrance(rgb):
                    r, g, b = rgb
                    max_c = max(r, g, b)
                    min_c = min(r, g, b)
                    saturation = (max_c - min_c) / max_c if max_c > 0 else 0
                    brightness = max_c / 255.0
                    if brightness < 0.15 or (brightness > 0.85 and saturation < 0.15):
                        return -1
                    return saturation * brightness

                valid_colors = []
                for count, rgb in colors:
                    score = color_vibrance(rgb)
                    if score > 0:
                        valid_colors.append((score * (count ** 0.5), rgb))

                valid_colors.sort(key=lambda x: x[0], reverse=True)

                if len(valid_colors) >= 2:
                    c1_rgb = valid_colors[0][1]
                    c2_rgb = valid_colors[1][1]
                    for _, rgb in valid_colors[1:]:
                        diff = abs(rgb[0] - c1_rgb[0]) + abs(rgb[1] - c1_rgb[1]) + abs(rgb[2] - c1_rgb[2])
                        if diff > 80:
                            c2_rgb = rgb
                            break
                    c1 = f"rgb({c1_rgb[0]}, {c1_rgb[1]}, {c1_rgb[2]})"
                    c2 = f"rgb({c2_rgb[0]}, {c2_rgb[1]}, {c2_rgb[2]})"
                    return {"accent1": c1, "accent2": c2}
                elif len(valid_colors) == 1:
                    c1_rgb = valid_colors[0][1]
                    c1 = f"rgb({c1_rgb[0]}, {c1_rgb[1]}, {c1_rgb[2]})"
                    return {"accent1": c1, "accent2": "#ff3366"}
        except Exception:
            pass
        return None

    def search_media(self, mode, query):
        if not query or len(query.strip()) < 2:
            return []

        clean_q = query.strip().lower()
        if clean_q in ["episodio", "episode", "capitulo", "cap", "video", "anime"]:
            return []

        query = query.strip()
        headers = {'User-Agent': 'Mozilla/5.0'}
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        if mode == 'anime':
            graphql_query = """
            query ($search: String) {
              Page (page: 1, perPage: 8) {
                media (search: $search, type: ANIME, sort: [SEARCH_MATCH, POPULARITY_DESC]) {
                  title { romaji english native }
                  synonyms
                  coverImage { extraLarge large color }
                  status
                  averageScore
                  seasonYear
                }
              }
            }
            """

            def _query_anilist(search_term):
                if not search_term or len(search_term.strip()) < 2:
                    return []
                payload = json.dumps({'query': graphql_query, 'variables': {'search': search_term.strip()}}).encode('utf-8')
                req_obj = urllib.request.Request(
                    'https://graphql.anilist.co',
                    data=payload,
                    headers={'Content-Type': 'application/json', 'User-Agent': headers['User-Agent']}
                )
                try:
                    with urllib.request.urlopen(req_obj, context=ctx, timeout=5) as resp:
                        res = json.loads(resp.read().decode('utf-8'))
                        return res.get('data', {}).get('Page', {}).get('media', [])
                except Exception:
                    return []

            items = _query_anilist(query)

            if not items and "season" in query.lower():
                alt_season_query = re.sub(r'season\s*(\d+)', r'\1', query, flags=re.IGNORECASE).strip()
                items = _query_anilist(alt_season_query)

            if not items:
                words = query.split()
                if len(words) > 2:
                    items = _query_anilist(" ".join(words[:3]))

            if not items and len(query.split()) >= 2:
                items = _query_anilist(" ".join(query.split()[:2]))

            results = []
            for a in items:
                status = 'TERMINADO' if a.get('status') == 'FINISHED' else ('EN EMISIÓN' if a.get('status') == 'RELEASING' else a.get('status'))
                score = f"{a.get('averageScore', 0) / 10:.1f}" if a.get('averageScore') else 'N/A'
                titles = a.get('title', {})
                chosen_title = titles.get('romaji') or titles.get('english') or 'Desconocido'

                cover_data = a.get('coverImage', {})
                high_res_img = cover_data.get('extraLarge') or cover_data.get('large') or ''

                synonyms_list = a.get('synonyms') or []
                results.append({
                    'title': chosen_title,
                    'alt_title': titles.get('english') or '',
                    'synonyms': synonyms_list[:5],
                    'image': high_res_img,
                    'color': cover_data.get('color'),
                    'meta': f"{status} • ★ {score}"
                })
            return results
        else:
            clean_query = query.lower().replace(' ', '_')
            encoded_query = urllib.parse.quote(clean_query)
            url = f"https://v3.sg.media-imdb.com/suggestion/x/{encoded_query}.json"
            req = urllib.request.Request(url, headers=headers)
            try:
                with urllib.request.urlopen(req, context=ctx, timeout=6) as response:
                    data = json.loads(response.read().decode('utf-8'))
                    items = data.get('d', [])
                    results = []
                    for entry in items:
                        title = entry.get('l', '')
                        if not title:
                            continue
                        qid = entry.get('qid', '').lower()
                        stars = entry.get('s', '').lower()
                        if 'anime' in stars or 'animation' in stars or qid in ['video game', 'music video']:
                            continue
                        if qid not in ['movie', 'tvmovie', 'tvseries', 'feature']:
                            continue

                        img_dict = entry.get('i') or {}
                        raw_img = img_dict.get('imageUrl', '')
                        if raw_img and 'media-amazon.com' in raw_img:
                            high_res_img = re.sub(r'\._V1_.*?\.jpg$', '._V1_.jpg', raw_img)
                        else:
                            high_res_img = raw_img

                        year = str(entry.get('y', 'CINE'))
                        results.append({
                            'title': title,
                            'image': high_res_img,
                            'color': None,
                            'meta': f"{year} • PELÍCULA"
                        })
                        if len(results) >= 5:
                            break
                    return results
            except Exception:
                return []

    def minimize_window(self):
        if self._window:
            self._window.minimize()

    def toggle_maximize_window(self):
        if not self._window:
            return False

        if getattr(self, '_is_maximized', False):
            self._window.restore()
            self._is_maximized = False
            if sys.platform == 'win32':
                self._set_window_movable(True)
        else:
            self._window.maximize()
            self._is_maximized = True
            if sys.platform == 'win32':
                self._set_window_movable(False)

        return getattr(self, '_is_maximized', False)

    def _set_window_movable(self, movable=True):
        """Bloquea o desbloquea el movimiento de la ventana a nivel de Windows."""
        try:
            import ctypes
            user32 = ctypes.windll.user32

            hwnd = None
            if hasattr(self._window, 'gui') and hasattr(self._window.gui, 'hwnd'):
                hwnd = self._window.gui.hwnd
            if not hwnd:
                hwnd = user32.FindWindowW(None, 'Aurion')

            if hwnd:
                hmenu = user32.GetSystemMenu(hwnd, False)
                SC_MOVE = 0xF010
                MF_BYCOMMAND = 0x00000000
                MF_DISABLED = 0x00000002
                MF_ENABLED = 0x00000000

                flags = MF_BYCOMMAND | (MF_ENABLED if movable else MF_DISABLED)
                user32.EnableMenuItem(hmenu, SC_MOVE, flags)
        except Exception:
            pass

    def close_app(self):
        """Cierra la aplicación y asegura el borrado de las carpetas temporales activas."""
        try:
            dl = getattr(self, 'downloader', None)
            if dl:
                threading.Thread(target=dl.cleanup_all_temp, daemon=True).start()
        except Exception as e:
            print(f"[Bridge] Error durante el cierre: {e}")

        if self._window:
            self._window.destroy()

    def cancel_download_task(self, task_id):
        """Notifica al downloader para detener la descarga de esta tarea."""
        self.downloader.cancel_task(task_id)
        return True

    def start_downloads(self, payload):
        config = payload.get("config", {}) if isinstance(payload, dict) else {}
        dest_dir = str(config.get("dir") or "").strip()

        if not dest_dir:
            print("[BRIDGE ERROR] Intento de descarga bloqueado: no se especificó ruta de destino.")
            return False

        # Inyectar todos los ajustes globales de Motor & Red desde self.config["settings"]
        user_settings = self.config.get("settings", {})
        config["speed_limit"] = str(user_settings.get("speed_limit", "0"))
        config["file_conflict"] = str(user_settings.get("file_conflict", "rename"))
        config["aria_connections"] = str(user_settings.get("aria_connections", "16"))
        config["finish_action"] = str(user_settings.get("finish_action", "open_folder"))
        config["notify_sound"] = bool(user_settings.get("notify_sound", True))

        tasks = payload.get("tasks", [])
        print(f"\n[BRIDGE] Iniciando lote de {len(tasks)} tarea(s) -> Destino: {dest_dir}")
        return self.downloader.start_engine(config, tasks)

    def probe_stream_metadata(self, task_id, stream_url, page_url):
        """Sonda asíncrona de metadatos exactos (tamaño en bytes y resolución)."""
        def worker():
            size_bytes, res_str = self.downloader.probe_media_info(stream_url, page_url)
            if self._window:
                self._window.evaluate_js(
                    f"window.updateTaskMetadata && window.updateTaskMetadata('{task_id}', {size_bytes}, '{res_str}');"
                )
        threading.Thread(target=worker, daemon=True).start()
        return True

    def search_youtube(self, query: str, search_type: str = "video", page: int = 1, page_size: int = 12):
        if not query or not query.strip():
            return []

        query = query.strip()
        is_direct_url = query.startswith("http://") or query.startswith("https://")
        start_idx = (page - 1) * page_size + 1
        end_idx = start_idx + page_size - 1

        ydl_opts = {
            'quiet': True,
            'skip_download': True,
            'extract_flat': True,
            'no_warnings': True,
            'skip_playlist_after_errors': 0,
            'extractor_args': {
                'youtube': {
                    'player_client': ['web']
                }
            }
        }

        results = []
        try:
            import yt_dlp
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                if is_direct_url:
                    info = ydl.extract_info(query, download=False)
                    raw_entries = info.get('entries', []) if 'entries' in info else [info]
                    is_pl = ('list=' in query) or (info.get('_type') == 'playlist')
                    targets = [('playlist' if is_pl else 'video', e) for e in raw_entries if e]
                elif search_type == "playlist":
                    raw_playlists = []
                    try:
                        clean_q = urllib.parse.quote(query)
                        search_url = f"https://www.youtube.com/results?search_query={clean_q}&sp=EgIQAw%253D%253D"
                        req = urllib.request.Request(
                            search_url,
                            headers={
                                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                                "Accept-Language": "es-ES,es;q=0.9",
                                "Cookie": "SOCS=CAESEwgDEgk2NzI2MDI2NDgaAmVzIAEaBgiA_LyaBg;"
                            }
                        )
                        ctx_pl = ssl.create_default_context()
                        ctx_pl.check_hostname = False
                        ctx_pl.verify_mode = ssl.CERT_NONE

                        with urllib.request.urlopen(req, context=ctx_pl, timeout=4) as resp:
                            html_content = resp.read().decode('utf-8', errors='ignore')

                        match = re.search(r'ytInitialData\s*=\s*({.+?});(?:</script>|\n)', html_content)
                        if match:
                            yt_data = json.loads(match.group(1))
                            sections = yt_data.get('contents', {}).get('twoColumnSearchResultsRenderer', {}).get('primaryContents', {}).get('sectionListRenderer', {}).get('contents', [])
                            for sec in sections:
                                items = sec.get('itemSectionRenderer', {}).get('contents', [])
                                for item in items:
                                    pl = item.get('playlistRenderer')
                                    if not pl:
                                        continue

                                    pl_id = pl.get('playlistId', '')
                                    if not pl_id:
                                        continue

                                    title = pl.get('title', {}).get('simpleText') or ''
                                    if not title:
                                        runs = pl.get('title', {}).get('runs', [])
                                        title = "".join(r.get('text', '') for r in runs) or 'Lista de Reproducción'

                                    uploader = 'YouTube'
                                    byline = pl.get('shortBylineText', {}).get('runs', [])
                                    if byline:
                                        uploader = byline[0].get('text', 'YouTube')

                                    video_count = pl.get('videoCount', '0')

                                    thumb_url = ''
                                    thumbs = pl.get('thumbnails', [{}])[0].get('thumbnails', [])
                                    if thumbs:
                                        thumb_url = thumbs[-1].get('url', '')
                                    if not thumb_url:
                                        thumb_url = f"https://i.ytimg.com/vi/{pl_id}/hqdefault.jpg"

                                    raw_playlists.append({
                                        'id': pl_id,
                                        'is_playlist': True,
                                        'title': title,
                                        'uploader': uploader,
                                        'item_count': video_count,
                                        'url': f"https://www.youtube.com/playlist?list={pl_id}",
                                        'thumbnail': thumb_url
                                    })
                    except Exception as err_fast_pl:
                        print(f"[FAST PL ERROR]: {err_fast_pl}")

                    if raw_playlists:
                        results.extend(raw_playlists[start_idx - 1:end_idx])
                        targets = []
                    else:
                        pl_url = f"https://www.youtube.com/results?search_query={urllib.parse.quote(query)}&sp=EgIQAw%253D%253D"
                        ydl.params['playlist_items'] = f"{start_idx}-{end_idx}"
                        info_pl = ydl.extract_info(pl_url, download=False) or {}
                        raw_entries = info_pl.get('entries', []) or []
                        targets = [('playlist', e) for e in raw_entries if e][:page_size]
                else:
                    search_limit = max(25, page * page_size + 10)
                    search_term = f"ytsearch{search_limit}:{query}"
                    try:
                        info_videos = ydl.extract_info(search_term, download=False) or {}
                    except Exception as err_srch:
                        print(f"[YT SEARCH RETRY ERROR]: {err_srch}")
                        info_videos = {}

                    all_entries = list(info_videos.get('entries', []) or [])
                    if len(all_entries) >= start_idx:
                        raw_entries = all_entries[start_idx - 1:end_idx]
                    else:
                        raw_entries = all_entries if all_entries else []
                    targets = [('video', e) for e in raw_entries if e]

                for item_type, entry in targets:
                    if not entry:
                        continue

                    vid_id = entry.get('id', '')
                    raw_title = (entry.get('title') or '').strip()
                    if not vid_id or not raw_title or raw_title.lower() in ['[private video]', '[deleted video]']:
                        continue

                    uploader = entry.get('uploader') or entry.get('channel') or 'YouTube'

                    if item_type == 'playlist' or entry.get('_type') == 'playlist':
                        raw_url = entry.get('url') or ''
                        clean_pl_id = vid_id

                        if 'list=' in raw_url:
                            clean_pl_id = raw_url.split('list=')[-1].split('&')[0]
                        elif clean_pl_id.startswith('VL'):
                            clean_pl_id = clean_pl_id[2:]

                        p_count = entry.get('playlist_count') or entry.get('item_count') or 0

                        thumb_url = ''
                        thumbs_list = entry.get('thumbnails') or []
                        for t in reversed(thumbs_list):
                            u = t.get('url', '')
                            if u and 'sqp=' not in u and not u.endswith('.webp'):
                                thumb_url = u
                                break

                        if not thumb_url and thumbs_list:
                            thumb_url = thumbs_list[-1].get('url', '')

                        vid_match = re.search(r'/(?:vi|vi_webp)/([a-zA-Z0-9_-]{11})/', thumb_url)
                        if vid_match:
                            thumb_url = f"https://i.ytimg.com/vi/{vid_match.group(1)}/hqdefault.jpg"
                        elif '/vi/PL' in thumb_url or '/vi/VL' in thumb_url or not thumb_url:
                            first_sub = ''
                            sub_entries = entry.get('entries') or []
                            if sub_entries and sub_entries[0]:
                                first_sub = sub_entries[0].get('id') or ''
                            if not first_sub and 'v=' in raw_url:
                                first_sub = raw_url.split('v=')[-1].split('&')[0]

                            if first_sub and len(first_sub) == 11:
                                thumb_url = f"https://i.ytimg.com/vi/{first_sub}/hqdefault.jpg"
                            elif thumbs_list:
                                thumb_url = thumbs_list[0].get('url', '')

                        final_pl_url = f"https://www.youtube.com/playlist?list={clean_pl_id}"

                        results.append({
                            'id': clean_pl_id,
                            'is_playlist': True,
                            'title': raw_title,
                            'uploader': uploader,
                            'item_count': p_count,
                            'url': final_pl_url,
                            'thumbnail': thumb_url
                        })
                    else:
                        duration_sec = entry.get('duration') or 0
                        if duration_sec:
                            total_s = int(duration_sec)
                            h = total_s // 3600
                            m = (total_s % 3600) // 60
                            s = total_s % 60
                            if h > 0:
                                duration_str = f"{h} h {m} min"
                            elif m > 0:
                                duration_str = f"{m} min {s} s" if s > 0 else f"{m} min"
                            else:
                                duration_str = f"{s} s"
                        else:
                            duration_str = "--:--"

                        thumb_url = entry.get('thumbnail') or f"https://i.ytimg.com/vi/{vid_id}/hqdefault.jpg"
                        channel_url = entry.get('uploader_url') or entry.get('channel_url') or ''
                        if not channel_url and entry.get('channel_id'):
                            channel_url = f"https://www.youtube.com/channel/{entry.get('channel_id')}"

                        results.append({
                            'id': vid_id,
                            'is_playlist': False,
                            'title': raw_title,
                            'uploader': uploader,
                            'channel_url': channel_url,
                            'duration': duration_str,
                            'url': entry.get('url') or f"https://www.youtube.com/watch?v={vid_id}",
                            'thumbnail': thumb_url
                        })
        except Exception as e:
            print(f"[ERROR YT SEARCH] {e}")
            return []

        return results

    def get_channel_details(self, channel_url_or_name: str, start_index: int = 1, count: int = 24, *args, **kwargs):
        """Extracción ultrarrápida en una sola pasada: perfil y vídeos en una sola llamada ligera."""
        if not channel_url_or_name or not str(channel_url_or_name).strip():
            return None

        target = str(channel_url_or_name).strip()

        if not target.startswith("http"):
            target = re.split(r'\s+(?:and|y|&)\s+', target, flags=re.IGNORECASE)[0].strip()
            clean_handle = re.sub(r'[^a-zA-Z0-9_\-\.]', '', target.lstrip('@'))
            target = f"https://www.youtube.com/@{clean_handle}"

        base_channel_url = target.split('?')[0].rstrip('/')
        for tab in ['/featured', '/shorts', '/streams', '/live', '/playlists', '/community', '/videos']:
            if base_channel_url.endswith(tab):
                base_channel_url = base_channel_url[:-len(tab)]
                break

        videos_url = f"{base_channel_url}/videos"
        end_index = start_index + count - 1

        def format_num(val):
            if not val or not isinstance(val, (int, float)):
                return "--"
            if val >= 1_000_000:
                return f"{val / 1_000_000:.1f} M".replace('.0', '')
            if val >= 1_000:
                return f"{val / 1_000:.1f} K".replace('.0', '')
            return str(int(val))

        opts = {
            'quiet': True,
            'skip_download': True,
            'extract_flat': 'in_playlist',
            'no_warnings': True,
            'playlist_items': f'{start_index}-{end_index}',
            'extractor_args': {
                'youtube': {
                    'skip': ['dash', 'hls', 'translated_subs'],
                    'player_client': ['android', 'web']
                }
            }
        }

        try:
            import yt_dlp
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(videos_url, download=False)
                if not info:
                    return None

                title = info.get('channel') or info.get('uploader') or info.get('title') or 'Canal'
                subs = format_num(info.get('channel_follower_count') or info.get('subscriber_count'))
                views = format_num(info.get('view_count'))
                desc = (info.get('description') or '').strip()[:240]

                avatar_url = (
                    info.get('uploader_avatar') or
                    info.get('channel_avatar') or
                    info.get('avatar') or ''
                )
                banner_url = (
                    info.get('banner') or
                    info.get('channel_banner') or
                    info.get('uploader_banner') or ''
                )

                thumbs = info.get('thumbnails') or []
                for t in thumbs:
                    u = t.get('url', '')
                    if not u:
                        continue
                    if not banner_url and any(k in u for k in ['banner', 'w1060', 'w2120', 'w2560', 'fcrop64']):
                        banner_url = u
                    elif not avatar_url and any(k in u for k in ['yt3.ggpht.com', 'avatar', '=s', 'photo.jpg']):
                        if 'banner' not in u:
                            avatar_url = u

                if not avatar_url:
                    for t in thumbs:
                        u = t.get('url', '')
                        if 'yt3.ggpht.com' in u or 'photo.jpg' in u:
                            avatar_url = u
                            break
                    if not avatar_url and thumbs:
                        avatar_url = thumbs[0].get('url', '')

                if avatar_url and '=s' in avatar_url:
                    avatar_url = re.sub(r'=s\d+.*?$', '=s240-c-k-c0x00ffffff-no-rj', avatar_url)

                raw_entries = info.get('entries', []) or []
                video_list = []

                for entry in raw_entries:
                    if not entry:
                        continue
                    vid_id = entry.get('id', '')
                    entry_title = entry.get('title', '')
                    if not vid_id or vid_id in ['videos', 'shorts', 'streams', 'live']:
                        continue
                    if entry_title.strip().lower() in ['videos', 'vídeos', 'shorts', 'live', 'directos']:
                        continue

                    dur = entry.get('duration') or 0
                    if dur:
                        total_s = int(dur)
                        h = total_s // 3600
                        m = (total_s % 3600) // 60
                        s = total_s % 60
                        dur_str = f"{h}:{m:02d}:{s:02d}" if h > 0 else f"{m}:{s:02d}"
                    else:
                        dur_str = "--:--"

                    v_thumb = entry.get('thumbnail') or f"https://i.ytimg.com/vi/{vid_id}/hqdefault.jpg"
                    v_views = format_num(entry.get('view_count'))

                    video_list.append({
                        'id': vid_id,
                        'title': entry_title or 'Sin título',
                        'duration': dur_str,
                        'url': entry.get('url') or f"https://www.youtube.com/watch?v={vid_id}",
                        'thumbnail': v_thumb,
                        'views': v_views,
                        'uploader': title
                    })

                return {
                    'title': title,
                    'url': base_channel_url,
                    'avatar': avatar_url,
                    'banner': banner_url,
                    'subscribers': subs,
                    'views': views,
                    'description': desc or 'Canal oficial de YouTube',
                    'videos': video_list
                }
        except Exception as e:
            print(f"[BRIDGE YT ERROR] {e}")
            return None

    def get_playlist_details(self, playlist_url: str):
        """Extrae la información completa de una lista de reproducción de YouTube con soporte resiliente."""
        if not playlist_url or not playlist_url.strip():
            return None

        raw_url = playlist_url.strip()

        if 'list=' in raw_url:
            list_id = raw_url.split('list=')[-1].split('&')[0]
            if list_id.startswith('VL'):
                list_id = list_id[2:]
            raw_url = f"https://www.youtube.com/playlist?list={list_id}"
        elif '/playlist?list=' not in raw_url and not raw_url.startswith('http'):
            raw_url = f"https://www.youtube.com/playlist?list={raw_url}"

        opts = {
            'quiet': True,
            'skip_download': True,
            'extract_flat': 'in_playlist',
            'no_warnings': True,
            'ignoreerrors': True,
            'socket_timeout': 6,
            'extractor_args': {
                'youtube': {
                    'skip': ['dash', 'hls', 'translated_subs'],
                    'player_client': ['android']
                }
            }
        }
        try:
            import yt_dlp
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(raw_url, download=False)
                if not info:
                    return None

                entries = info.get('entries') or []
                if not entries and info.get('id'):
                    entries = [info]

                title = info.get('title') or 'Lista de Reproducción'
                uploader = info.get('uploader') or info.get('channel') or 'YouTube'

                video_list = []
                for entry in entries:
                    if not entry:
                        continue
                    vid_id = entry.get('id', '')
                    raw_title = (entry.get('title') or '').strip()
                    if not vid_id or not raw_title or raw_title.lower() in ['[private video]', '[deleted video]', 'sin título', '']:
                        continue

                    dur = entry.get('duration') or 0
                    if dur:
                        total_s = int(dur)
                        h = total_s // 3600
                        m = (total_s % 3600) // 60
                        s = total_s % 60
                        dur_str = f"{h}:{m:02d}:{s:02d}" if h > 0 else f"{m}:{s:02d}"
                    else:
                        dur_str = "--:--"

                    v_thumb = entry.get('thumbnail') or f"https://i.ytimg.com/vi/{vid_id}/hqdefault.jpg"
                    video_list.append({
                        'id': vid_id,
                        'title': raw_title,
                        'duration': dur_str,
                        'url': entry.get('url') or f"https://www.youtube.com/watch?v={vid_id}",
                        'thumbnail': v_thumb,
                        'uploader': entry.get('uploader') or uploader
                    })

                first_thumb = video_list[0]['thumbnail'] if video_list else ''
                return {
                    'title': title,
                    'uploader': uploader,
                    'thumbnail': first_thumb,
                    'count': len(video_list),
                    'videos': video_list
                }
        except Exception as e:
            print(f"[BRIDGE PLAYLIST ERROR] {e}")
            return None

    def check_for_updates(self):
        """Comprueba en GitHub Releases si hay una versión superior a la instalada."""
        CURRENT_VERSION = APP_VERSION
        REPO_NAME = GITHUB_REPO

        def _worker():
            try:
                time.sleep(1.5)

                url = f"https://api.github.com/repos/{REPO_NAME}/releases/latest"
                req = urllib.request.Request(
                    url,
                    headers={
                        "User-Agent": "Aurion-Desktop-App",
                        "Accept": "application/vnd.github.v3+json"
                    }
                )

                ctx = ssl.create_default_context()
                ctx.check_hostname = False
                ctx.verify_mode = ssl.CERT_NONE

                with urllib.request.urlopen(req, context=ctx, timeout=10) as response:
                    if response.status != 200:
                        return
                    data = json.loads(response.read().decode("utf-8"))

                tag_name = data.get("tag_name", "").strip().lstrip("v")
                if not tag_name:
                    return

                def parse_version_numbers(v_str):
                    return [int(n) for n in re.findall(r"\d+", v_str)]

                if parse_version_numbers(tag_name) > parse_version_numbers(CURRENT_VERSION):
                    download_url = None
                    for asset in data.get("assets", []):
                        name = asset.get("name", "").lower()
                        if name.endswith(".zip"):
                            download_url = asset.get("browser_download_url")
                            break

                    if not download_url:
                        download_url = data.get("zipball_url")

                    if download_url and self._window:
                        payload = {
                            "latest": tag_name,
                            "version": tag_name,
                            "url": download_url,
                            "download_url": download_url,
                            "body": data.get("body", "Nueva versión disponible.")
                        }
                        self._window.evaluate_js(f"window.onUpdateAvailable && window.onUpdateAvailable({json.dumps(payload)})")

            except Exception as e:
                print(f"[check_for_updates] Error comprobando actualización: {e}")

        threading.Thread(target=_worker, daemon=True).start()

    def start_auto_update(self, download_url):
        """Actualización ultrarrápida acelerada por aria2c (16 hilos) con fallback nativo y robocopy."""
        def download_and_run():
            try:
                temp_dir = tempfile.gettempdir()
                bat_path = os.path.join(temp_dir, "aurion_restart.bat")

                app_exe_path = os.path.abspath(
                    sys.executable if getattr(sys, 'frozen', False)
                    else os.path.join(os.path.dirname(__file__), "..", "dist", "Aurion", "Aurion.exe")
                )
                install_dir = os.path.dirname(app_exe_path)

                staging_dir = os.path.join(temp_dir, "aurion_new_version")
                if os.path.exists(staging_dir):
                    shutil.rmtree(staging_dir, ignore_errors=True)
                os.makedirs(staging_dir, exist_ok=True)

                if not download_url or download_url == "local_mock_update" or not download_url.startswith("http"):
                    for pct in [20, 50, 75, 90, 100]:
                        time.sleep(0.2)
                        if self._window:
                            self._window.evaluate_js(f"window.onUpdateProgress && window.onUpdateProgress({pct});")
                else:
                    zip_path = os.path.join(temp_dir, "aurion_update.zip")
                    if os.path.exists(zip_path):
                        os.remove(zip_path)

                    downloaded_ok = False
                    # 1. Intentar descarga Turbo con aria2c a 16 hilos si está disponible
                    if self.downloader and self.downloader.has_aria2:
                        try:
                            if self._window:
                                self._window.evaluate_js("window.onUpdateProgress && window.onUpdateProgress(15);")
                            aria_cmd = [
                                self.downloader.aria2_path,
                                '-x16', '-s16', '-k1M',
                                '--file-allocation=none',
                                '--allow-overwrite=true',
                                '--auto-file-renaming=false',
                                '-d', temp_dir,
                                '-o', 'aurion_update.zip',
                                download_url
                            ]
                            flags = 0x08000000 if sys.platform == 'win32' else 0
                            proc = subprocess.Popen(aria_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=flags)
                            pct_sim = 15
                            while proc.poll() is None:
                                pct_sim = min(92, pct_sim + 7)
                                if self._window:
                                    self._window.evaluate_js(f"window.onUpdateProgress && window.onUpdateProgress({pct_sim});")
                                time.sleep(0.25)
                            if proc.returncode == 0 and os.path.exists(zip_path) and os.path.getsize(zip_path) > 1024 * 100:
                                downloaded_ok = True
                                if self._window:
                                    self._window.evaluate_js("window.onUpdateProgress && window.onUpdateProgress(100);")
                        except Exception as aria_err:
                            print(f"[AutoUpdate] Fallback a descarga estándar ({aria_err})")

                    # 2. Fallback en streaming HTTP si aria2c no estaba disponible
                    if not downloaded_ok:
                        ctx = ssl.create_default_context()
                        req = urllib.request.Request(download_url, headers={'User-Agent': 'AurionApp'})
                        with urllib.request.urlopen(req, context=ctx, timeout=40) as resp, open(zip_path, 'wb') as f:
                            total_length = resp.getheader('content-length')
                            total_bytes = int(total_length) if total_length else 0
                            downloaded = 0
                            chunk_size = 128 * 1024
                            while True:
                                chunk = resp.read(chunk_size)
                                if not chunk:
                                    break
                                f.write(chunk)
                                downloaded += len(chunk)
                                if total_bytes and self._window:
                                    pct = round((downloaded / total_bytes) * 100, 1)
                                    self._window.evaluate_js(f"window.onUpdateProgress && window.onUpdateProgress({pct});")

                    shutil.unpack_archive(zip_path, staging_dir)

                    subdirs = [
                        os.path.join(staging_dir, d)
                        for d in os.listdir(staging_dir)
                        if os.path.isdir(os.path.join(staging_dir, d))
                    ]
                    if len(subdirs) == 1 and not any(os.path.isfile(os.path.join(staging_dir, f)) for f in os.listdir(staging_dir)):
                        staging_dir = subdirs[0]

                bat_content = f"""@echo off
:WAIT_LOOP
tasklist /fi "imagename eq Aurion.exe" 2>nul | find /i "Aurion.exe" >nul
if not errorlevel 1 (
    timeout /t 1 /nobreak >nul
    goto WAIT_LOOP
)

timeout /t 1 /nobreak >nul
if exist "{staging_dir}" (
    robocopy "{staging_dir}" "{install_dir}" /e /r:3 /w:1 /np /nfl /ndl >nul 2>&1
)

start "" "{app_exe_path}"
(goto) 2>nul & del "%~f0"
"""
                with open(bat_path, "w", encoding="utf-8") as f:
                    f.write(bat_content)

                creation_flags = 0x08000000
                subprocess.Popen(["cmd.exe", "/c", bat_path], creationflags=creation_flags)

                if self._window:
                    self._window.destroy()
                os._exit(0)

            except Exception as e:
                err_msg = str(e).replace('"', '\\"').replace("'", "\\'")
                print(f"[AutoUpdate Error]: {e}")
                if self._window:
                    self._window.evaluate_js(f"alert('Error exacto de Python:\\n{err_msg}');")
                    self._window.evaluate_js("window.onUpdateError && window.onUpdateError();")

        threading.Thread(target=download_and_run, daemon=True).start()
        return True

    def reset_factory_config(self):
        """Limpia la memoria RAM de Python y deja config.json como recién instalado."""
        clean_config = self._get_default_config()
        try:
            with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump(clean_config, f, indent=2)
            self.config = clean_config
            print("[Core] ¡Reset de fábrica completado en disco y en memoria RAM!")
            return True
        except Exception as e:
            print(f"[Core] Error en reset_factory_config: {e}")
            return False

    def open_config_folder(self):
        """Abre la carpeta del sistema donde reside el archivo config.json."""
        try:
            folder_path = os.path.dirname(CONFIG_FILE)
            if os.path.exists(CONFIG_FILE):
                subprocess.Popen(['explorer', f'/select,{os.path.normpath(CONFIG_FILE)}'])
            else:
                subprocess.Popen(['explorer', os.path.normpath(folder_path)])
            return True
        except Exception as e:
            print(f"[open_config_folder] Error: {e}")
            return False

    def open_extension_folder(self):
        try:
            if getattr(sys, 'frozen', False):
                exe_dir = os.path.dirname(sys.executable)
                candidates = [
                    os.path.join(exe_dir, 'extension'),
                    os.path.join(exe_dir, '_internal', 'extension'),
                    os.path.join(getattr(sys, '_MEIPASS', exe_dir), 'extension')
                ]
                ext_path = next((p for p in candidates if os.path.exists(p)), candidates[0])
                base_dir = exe_dir
            else:
                base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
                ext_path = os.path.join(base_dir, 'extension')

            if os.path.exists(ext_path):
                subprocess.Popen(['explorer', f'/select,{os.path.normpath(ext_path)}'])
                return True
            else:
                subprocess.Popen(['explorer', os.path.normpath(base_dir)])
                return False
        except Exception as e:
            print(f"[open_extension_folder] Error: {e}")
            return False

    def _get_known_browser_paths(self):
        return {
            "brave": [
                os.path.expandvars(r"%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe"),
                os.path.expandvars(r"%LocalAppData%\BraveSoftware\Brave-Browser\Application\brave.exe"),
                os.path.expandvars(r"%ProgramFiles(x86)%\BraveSoftware\Brave-Browser\Application\brave.exe")
            ],
            "chrome": [
                os.path.expandvars(r"%ProgramFiles%\Google\Chrome\Application\chrome.exe"),
                os.path.expandvars(r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"),
                os.path.expandvars(r"%LocalAppData%\Google\Chrome\Application\chrome.exe")
            ],
            "edge": [
                os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"),
                os.path.expandvars(r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe")
            ],
            "opera": [
                os.path.expandvars(r"%LocalAppData%\Programs\Opera\launcher.exe"),
                os.path.expandvars(r"%ProgramFiles%\Opera\launcher.exe")
            ],
            "operagx": [
                os.path.expandvars(r"%LocalAppData%\Programs\Opera GX\launcher.exe"),
                os.path.expandvars(r"%ProgramFiles%\Opera GX\launcher.exe")
            ],
            "vivaldi": [
                os.path.expandvars(r"%LocalAppData%\Vivaldi\Application\vivaldi.exe"),
                os.path.expandvars(r"%ProgramFiles%\Vivaldi\Application\vivaldi.exe")
            ],
            "arc": [
                os.path.expandvars(r"%LocalAppData%\Programs\Arc\Arc.exe"),
                os.path.expandvars(r"%ProgramFiles%\Arc\Arc.exe")
            ],
            "chromium": [
                os.path.expandvars(r"%LocalAppData%\Chromium\Application\chrome.exe"),
                os.path.expandvars(r"%ProgramFiles%\Chromium\Application\chrome.exe")
            ]
        }

    def get_installed_browsers(self):
        """Devuelve un diccionario indicando cuáles navegadores Chromium están instalados en el sistema."""
        known_paths = self._get_known_browser_paths()
        return {b_key: any(os.path.isfile(p) for p in paths) for b_key, paths in known_paths.items()}

    def launch_browser_for_extension(self, target_url="chrome://extensions", browser_key="chrome"):
        """Copia la URL al portapapeles y abre una ventana nueva del navegador correspondiente."""
        def _worker():
            try:
                import winreg
                known_paths = self._get_known_browser_paths()

                chosen_exe = next((p for p in known_paths.get(browser_key, []) if os.path.isfile(p)), None)
                effective_url = target_url

                if not chosen_exe:
                    try:
                        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice") as key:
                            prog_id, _ = winreg.QueryValueEx(key, "ProgId")
                        with winreg.OpenKey(winreg.HKEY_CLASSES_ROOT, rf"{prog_id}\shell\open\command") as cmd_key:
                            raw_cmd, _ = winreg.QueryValueEx(cmd_key, "")
                        chosen_exe = raw_cmd.split('"')[1] if raw_cmd.startswith('"') else raw_cmd.split()[0]

                        exe_lower = (chosen_exe or "").lower()
                        if "brave" in exe_lower:
                            effective_url = "brave://extensions"
                        elif "edge" in exe_lower:
                            effective_url = "edge://extensions"
                        elif "opera" in exe_lower:
                            effective_url = "opera://extensions"
                        elif "vivaldi" in exe_lower:
                            effective_url = "vivaldi://extensions"
                        elif "arc" in exe_lower:
                            effective_url = "arc://extensions"
                        else:
                            effective_url = "chrome://extensions"
                    except Exception:
                        pass

                subprocess.run(f'cmd /c <nul set /p="{effective_url}"| clip', shell=True, creationflags=0x08000000)

                if chosen_exe and os.path.isfile(chosen_exe):
                    subprocess.Popen([chosen_exe, "--new-window"])
                else:
                    subprocess.Popen('cmd /c start ""', shell=True, creationflags=0x08000000)

            except Exception as e:
                print(f"[Core] Error abriendo navegador: {e}")

        threading.Thread(target=_worker, daemon=True).start()
        return True

    def get_download_history(self, mode_filter="all", search_query=""):
        """Devuelve el historial SQLite y las estadísticas globales."""
        return self.db.get_history(mode_filter, search_query)

    def delete_history_item(self, item_id):
        return self.db.delete_entry(item_id)

    def clear_download_history(self):
        return self.db.clear_all()

    def open_history_file(self, file_path, reveal_in_folder=False):
        """Abre el vídeo en el reproductor predeterminado o lo resalta en su carpeta."""
        if not file_path or not os.path.exists(file_path):
            return False
        try:
            norm_p = os.path.normpath(file_path)
            if reveal_in_folder:
                subprocess.Popen(['explorer', f'/select,{norm_p}'])
            else:
                os.startfile(norm_p)
            return True
        except Exception as e:
            print(f"[Bridge] Error abriendo archivo de historial: {e}")
            return False