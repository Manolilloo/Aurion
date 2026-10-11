import os
import json
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

APP_VERSION = "1.0.3"
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
        if self._window:
            safe_data = json.dumps(data)
            self._window.evaluate_js(f"window.onLinkReceived && window.onLinkReceived({safe_data});")

    def load_config(self):
        default_config = {
            "active_mode": "anime",
            "anime": {
                "dir": "",
                "season": 1,
                "start_ep": 1,
                "save_cover": True,
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
            }
        }
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    default_config.update(data)
                    return default_config
            except Exception:
                pass
        return default_config

    def save_config(self, new_data):
        for k, v in new_data.items():
            if isinstance(v, dict) and k in self.config and isinstance(self.config[k], dict):
                self.config[k].update(v)
            else:
                self.config[k] = v
        try:
            with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump(self.config, f, indent=2)
            return True
        except Exception as e:
            print(f"[Core] Error guardando config.json: {e}")
            return False

    def get_initial_state(self):
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
            directory=current_path if os.path.exists(current_path) else os.path.expanduser("~")
        )
        if folder and len(folder) > 0:
            return folder[0]
        return current_path

    def get_disk_space(self, target_path):
        try:
            path = target_path if os.path.exists(target_path) else os.path.splitdrive(target_path)[0] + "\\"
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

        query = query.strip()
        headers = {'User-Agent': 'Mozilla/5.0'}
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        if mode == 'anime':
            graphql_query = """
            query ($search: String) {
              Page (page: 1, perPage: 6) {
                media (search: $search, type: ANIME) {
                  title { romaji english }
                  coverImage { extraLarge large color }
                  status
                  averageScore
                }
              }
            }
            """
            data = json.dumps({'query': graphql_query, 'variables': {'search': query}}).encode('utf-8')
            req = urllib.request.Request(
                'https://graphql.anilist.co',
                data=data,
                headers={'Content-Type': 'application/json', 'User-Agent': headers['User-Agent']}
            )
            try:
                with urllib.request.urlopen(req, context=ctx, timeout=6) as response:
                    res_json = json.loads(response.read().decode('utf-8'))
                    items = res_json.get('data', {}).get('Page', {}).get('media', [])
                    results = []
                    for a in items:
                        status = 'TERMINADO' if a.get('status') == 'FINISHED' else ('EN EMISIÓN' if a.get('status') == 'RELEASING' else a.get('status'))
                        score = f"{a.get('averageScore', 0) / 10:.1f}" if a.get('averageScore') else 'N/A'
                        titles = a.get('title', {})
                        chosen_title = titles.get('romaji') or titles.get('english') or 'Desconocido'
                        
                        cover_data = a.get('coverImage', {})
                        high_res_img = cover_data.get('extraLarge') or cover_data.get('large') or ''

                        results.append({
                            'title': chosen_title,
                            'alt_title': titles.get('english', ''),
                            'image': high_res_img,
                            'color': cover_data.get('color'),
                            'meta': f"{status} • ★ {score}"
                        })
                    return results
            except Exception:
                return []
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
                    import re
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
                            high_res_img = re.sub(r'._V1_.*?.jpg$', '._V1_.jpg', raw_img)
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

        import sys
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
            
            # Buscar el HWND nativo de la ventana Aurion
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

                # Deshabilitar SC_MOVE impide que Windows inicie cualquier bucle de arrastre
                flags = MF_BYCOMMAND | (MF_ENABLED if movable else MF_DISABLED)
                user32.EnableMenuItem(hmenu, SC_MOVE, flags)
        except Exception:
            pass

    def close_app(self):
        if self._window:
            self._window.destroy()
        os._exit(0)

    def cancel_download_task(self, task_id):
        """Notifica al downloader para detener la descarga de esta tarea."""
        self.downloader.cancel_task(task_id)
        return True

    def start_downloads(self, payload):
        """Inicia el proceso de descarga delegando al downloader."""
        config = payload.get("config", {}) if isinstance(payload, dict) else {}
        dest_dir = str(config.get("dir") or "").strip()

        # Blindaje: si no hay ruta válida especificada, bloquear la descarga
        if not dest_dir:
            print("[BRIDGE ERROR] Intento de descarga bloqueado: no se especificó ruta de destino.")
            return False

        print(f"\n[DEBUG BRIDGE] start_downloads recibido!")
        tasks = payload.get("tasks", [])
        print(f"[DEBUG BRIDGE] Tareas a descargar: {len(tasks)}")
        for t in tasks:
            print(f"   -> Episodio: {t.get('title')} | URL: {t.get('url')}")
        return self.downloader.start_engine(config, tasks)

    def probe_stream_metadata(self, task_id, stream_url, page_url):
        """Sonda asíncrona de metadatos exactos (tamaño en bytes y resolución)."""
        import threading
        def worker():
            size_bytes, res_str = self.downloader.probe_media_info(stream_url, page_url)
            if self._window:
                self._window.evaluate_js(
                    f"window.updateTaskMetadata && window.updateTaskMetadata('{task_id}', {size_bytes}, '{res_str}');"
                )
        threading.Thread(target=worker, daemon=True).start()
        return True

    def search_youtube(self, query: str):
        print(f"\n[BRIDGE YT] >>> Petición recibida desde el frontend con query: '{query}'")
        if not query or not query.strip():
            return []
        
        query = query.strip()
        search_target = f"ytsearch25:{query}" if not (query.startswith("http://") or query.startswith("https://")) else query
        
        ydl_opts = {
            'quiet': True,
            'skip_download': True,
            'extract_flat': True,
            'no_warnings': True,
            'skip_playlist_after_errors': 0,
            'extractor_args': {
                'youtube': {
                    'skip': ['dash', 'hls'],
                    'player_client': ['android']
                }
            }
        }
        
        results = []
        try:
            import yt_dlp
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(search_target, download=False)
                entries = info.get('entries', []) if 'entries' in info else [info]
                
                for entry in entries:
                    if not entry:
                        continue
                    
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
                    
                    vid_id = entry.get('id', '')
                    thumb_url = entry.get('thumbnail') or f"https://i.ytimg.com/vi/{vid_id}/hqdefault.jpg"
                    channel_url = entry.get('uploader_url') or entry.get('channel_url') or ''
                    if not channel_url and entry.get('channel_id'):
                        channel_url = f"https://www.youtube.com/channel/{entry.get('channel_id')}"
                    
                    results.append({
                        'id': vid_id,
                        'title': entry.get('title', 'Sin título'),
                        'uploader': entry.get('uploader') or entry.get('channel', 'Desconocido'),
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
        if not (target.startswith("http://") or target.startswith("https://")):
            target = f"https://www.youtube.com/@{target.lstrip('@')}"

        base_channel_url = target.split('?')[0].rstrip('/')
        for tab in ['/featured', '/shorts', '/streams', '/live', '/playlists', '/community', '/videos']:
            if base_channel_url.endswith(tab):
                base_channel_url = base_channel_url[:-len(tab)]
                break

        # Consultar directamente /videos en modo plano
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

                avatar_url = info.get('uploader_avatar') or ''
                banner_url = ''
                thumbs = info.get('thumbnails') or []

                for t in thumbs:
                    u = t.get('url', '')
                    if not banner_url and any(k in u for k in ['banner', 'w1060', 'w2120', 'w2560', 'fcrop64']):
                        banner_url = u
                    elif not avatar_url and any(k in u for k in ['avatar', 'yt3.ggpht.com', '=s', 'photo.jpg', 'googleusercontent']):
                        avatar_url = u

                # Si sigue vacío, buscar cualquier miniatura cuadrada típica de avatar
                if not avatar_url:
                    for t in thumbs:
                        u = t.get('url', '')
                        w = t.get('width') or 0
                        h = t.get('height') or 0
                        if w and h and w == h and 'banner' not in u:
                            avatar_url = u
                            break

                if not avatar_url and thumbs:
                    avatar_url = thumbs[0].get('url', '')

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

    def get_yt_download_options(self, output_path: str, is_audio_only: bool = False, quality: str = "1080"):
        print(f"\n[BRIDGE YT] >>> Canal: '{channel_url_or_name}' | Rango: {start_index}-{start_index + count - 1}")
        if not channel_url_or_name or not channel_url_or_name.strip():
            return None

        target = channel_url_or_name.strip()
        if not (target.startswith("http://") or target.startswith("https://")):
            target = f"https://www.youtube.com/@{target.lstrip('@')}"

        base_channel_url = target.split('?')[0].rstrip('/')
        for tab in ['/featured', '/shorts', '/streams', '/live', '/playlists', '/community', '/videos']:
            if base_channel_url.endswith(tab):
                base_channel_url = base_channel_url[:-len(tab)]
                break

        videos_target_url = f"{base_channel_url}/videos?view=0&sort=dd"

        def format_num(val):
            if not val or not isinstance(val, (int, float)):
                return "--"
            if val >= 1_000_000:
                return f"{val / 1_000_000:.1f} M".replace('.0', '')
            if val >= 1_000:
                return f"{val / 1_000:.1f} K".replace('.0', '')
            return str(int(val))

        channel_meta = {
            'title': 'Canal',
            'avatar': '',
            'banner': '',
            'subscribers': '--',
            'views': '--',
            'description': ''
        }

        import yt_dlp

        # 1. Metadatos del perfil del canal
        if start_index == 1:
            try:
                meta_opts = {
                    'quiet': True,
                    'skip_download': True,
                    'extract_flat': True,
                    'playlist_items': '0',
                    'no_warnings': True,
                }
                with yt_dlp.YoutubeDL(meta_opts) as ydl_meta:
                    info_meta = ydl_meta.extract_info(base_channel_url, download=False)
                    if info_meta:
                        channel_meta['title'] = (
                            info_meta.get('uploader') or 
                            info_meta.get('channel') or 
                            info_meta.get('title') or 
                            'Canal de YouTube'
                        )
                        channel_meta['subscribers'] = format_num(
                            info_meta.get('channel_follower_count') or 
                            info_meta.get('subscriber_count')
                        )
                        channel_meta['views'] = format_num(info_meta.get('view_count'))
                        channel_meta['description'] = (info_meta.get('description') or '').strip()[:240]

                        thumbs = info_meta.get('thumbnails') or []
                        for t in thumbs:
                            u = t.get('url', '')
                            # Detección inteligente de banner panorámico y avatar
                            if any(k in u for k in ['banner', 'w1060', 'w2120', 'w2560', 'fcrop64=1']):
                                channel_meta['banner'] = u
                            elif any(k in u for k in ['avatar', 'yt3.ggpht.com', '=s', 'photo.jpg']):
                                if not channel_meta['avatar']:
                                    channel_meta['avatar'] = u

                        if not channel_meta['avatar'] and thumbs:
                            channel_meta['avatar'] = thumbs[-1].get('url', '')
            except Exception as e_meta:
                print(f"[BRIDGE YT META ERROR] {e_meta}")

        # 2. Extracción de vídeos recientes
        end_index = start_index + count - 1
        video_opts = {
            'quiet': True,
            'skip_download': True,
            'extract_flat': 'in_playlist',
            'no_warnings': True,
            'playlist_items': f'{start_index}-{end_index}',
            'extractor_args': {
                'youtube': {
                    'skip': ['dash', 'hls'],
                    'player_client': ['web']
                }
            }
        }

        video_list = []
        try:
            with yt_dlp.YoutubeDL(video_opts) as ydl_vids:
                vids_info = ydl_vids.extract_info(videos_target_url, download=False)
                if vids_info:
                    raw_entries = vids_info.get('entries', []) or []
                    if channel_meta['title'] == 'Canal':
                        channel_meta['title'] = (
                            vids_info.get('uploader') or 
                            vids_info.get('channel') or 
                            vids_info.get('title') or 
                            'Canal'
                        )

                    for entry in raw_entries:
                        if not entry:
                            continue
                        vid_id = entry.get('id', '')
                        title = entry.get('title', 'Sin título')

                        if not vid_id or vid_id in ['videos', 'shorts', 'streams', 'live']:
                            continue
                        if title.strip().lower() in ['videos', 'vídeos', 'shorts', 'live', 'directos']:
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

                        raw_views = entry.get('view_count') or 0
                        video_list.append({
                            'id': vid_id,
                            'title': title,
                            'duration': dur_str,
                            'url': entry.get('url') or f"https://www.youtube.com/watch?v={vid_id}",
                            'thumbnail': entry.get('thumbnail') or f"https://i.ytimg.com/vi/{vid_id}/hqdefault.jpg",
                            'views': format_num(raw_views),
                            'uploader': channel_meta['title']
                        })
        except Exception as e_vids:
            print(f"[BRIDGE YT VIDS ERROR] {e_vids}")

        return {
            'title': channel_meta['title'],
            'url': base_channel_url,
            'avatar': channel_meta['avatar'],
            'banner': channel_meta['banner'],
            'subscribers': channel_meta['subscribers'],
            'views': channel_meta['views'],
            'description': channel_meta['description'],
            'videos': video_list
        }
        """Extrae perfil completo con avatar/banner y vídeos ordenados por recientes o populares reales."""
        print(f"\n[BRIDGE YT] >>> Canal: '{channel_url_or_name}' | Rango: {start_index}-{start_index + count - 1} | Orden: {sort_by}")
        if not channel_url_or_name or not channel_url_or_name.strip():
            return None

        target = channel_url_or_name.strip()
        if not (target.startswith("http://") or target.startswith("https://")):
            target = f"https://www.youtube.com/@{target.lstrip('@')}"

        # 1. URL base para la metadata del canal
        base_channel_url = target.split('?')[0].rstrip('/')
        for tab in ['/featured', '/shorts', '/streams', '/live', '/playlists', '/community', '/videos']:
            if base_channel_url.endswith(tab):
                base_channel_url = base_channel_url[:-len(tab)]
                break

        # 2. URL de vídeos según el criterio de ordenación real de YouTube
        if sort_by == "views":
            videos_target_url = f"{base_channel_url}/videos?view=0&sort=p"
        else:
            videos_target_url = f"{base_channel_url}/videos?view=0&sort=dd"

        def format_num(val):
            if not val or not isinstance(val, (int, float)):
                return "--"
            if val >= 1_000_000:
                return f"{val / 1_000_000:.1f} M".replace('.0', '')
            if val >= 1_000:
                return f"{val / 1_000:.1f} K".replace('.0', '')
            return str(int(val))

        channel_meta = {
            'title': 'Canal',
            'avatar': '',
            'banner': '',
            'subscribers': '--',
            'views': '--',
            'video_count': '--',
            'description': ''
        }

        import yt_dlp

        # Solo en la primera página consultamos la información base del perfil del canal
        if start_index == 1:
            try:
                meta_opts = {
                    'quiet': True,
                    'skip_download': True,
                    'extract_flat': True,
                    'playlist_items': '0',
                    'no_warnings': True,
                }
                with yt_dlp.YoutubeDL(meta_opts) as ydl_meta:
                    info_meta = ydl_meta.extract_info(base_channel_url, download=False)
                    if info_meta:
                        channel_meta['title'] = (
                            info_meta.get('uploader') or 
                            info_meta.get('channel') or 
                            info_meta.get('title') or 
                            'Canal de YouTube'
                        )
                        channel_meta['subscribers'] = format_num(
                            info_meta.get('channel_follower_count') or 
                            info_meta.get('subscriber_count')
                        )
                        channel_meta['views'] = format_num(info_meta.get('view_count'))
                        channel_meta['description'] = (info_meta.get('description') or '').strip()[:240]

                        # Avatar y Banner
                        thumbs = info_meta.get('thumbnails') or []
                        for t in thumbs:
                            u = t.get('url', '')
                            if 'avatar' in u or 'yt3.ggpht.com' in u or '=s' in u:
                                channel_meta['avatar'] = u
                            elif 'banner' in u or 'w1060' in u or 'w2120' in u:
                                channel_meta['banner'] = u
                        
                        if not channel_meta['avatar'] and thumbs:
                            channel_meta['avatar'] = thumbs[-1].get('url', '')
            except Exception as e_meta:
                print(f"[BRIDGE YT META ERROR] {e_meta}")

        # 3. Extracción de los vídeos del canal
        end_index = start_index + count - 1
        video_opts = {
            'quiet': True,
            'skip_download': True,
            'extract_flat': 'in_playlist',
            'no_warnings': True,
            'playlist_items': f'{start_index}-{end_index}',
            'extractor_args': {
                'youtube': {
                    'skip': ['dash', 'hls'],
                    'player_client': ['web']
                }
            }
        }

        video_list = []
        try:
            with yt_dlp.YoutubeDL(video_opts) as ydl_vids:
                vids_info = ydl_vids.extract_info(videos_target_url, download=False)
                if vids_info:
                    raw_entries = vids_info.get('entries', []) or []
                    
                    # Si no teníamos título, recuperarlo
                    if channel_meta['title'] == 'Canal':
                        channel_meta['title'] = (
                            vids_info.get('uploader') or 
                            vids_info.get('channel') or 
                            vids_info.get('title') or 
                            'Canal'
                        )

                    total_possible = vids_info.get('playlist_count')
                    channel_meta['video_count'] = format_num(total_possible) if total_possible else "10 K+"

                    for entry in raw_entries:
                        if not entry:
                            continue
                        vid_id = entry.get('id', '')
                        title = entry.get('title', 'Sin título')

                        # Descartar contenedores o listas que no sean vídeos
                        if not vid_id or vid_id in ['videos', 'shorts', 'streams', 'live']:
                            continue
                        if title.strip().lower() in ['videos', 'vídeos', 'shorts', 'live', 'directos']:
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

                        raw_views = entry.get('view_count') or 0
                        video_list.append({
                            'id': vid_id,
                            'title': title,
                            'duration': dur_str,
                            'url': entry.get('url') or f"https://www.youtube.com/watch?v={vid_id}",
                            'thumbnail': entry.get('thumbnail') or f"https://i.ytimg.com/vi/{vid_id}/hqdefault.jpg",
                            'views': format_num(raw_views),
                            'raw_views': int(raw_views) if isinstance(raw_views, (int, float)) else 0,
                            'uploader': channel_meta['title']
                        })
        except Exception as e_vids:
            print(f"[BRIDGE YT VIDS ERROR] {e_vids}")

        return {
            'title': channel_meta['title'],
            'url': base_channel_url,
            'avatar': channel_meta['avatar'],
            'banner': channel_meta['banner'],
            'subscribers': channel_meta['subscribers'],
            'views': channel_meta['views'],
            'video_count': channel_meta['video_count'],
            'description': channel_meta['description'],
            'videos': video_list
        }
        """Extrae perfil completo y solo vídeos normales del canal con soporte de paginación."""
        print(f"\n[BRIDGE YT] >>> Consultando canal: '{channel_url_or_name}' (Desde {start_index} hasta {start_index + count - 1})")
        if not channel_url_or_name or not channel_url_or_name.strip():
            return None

        target = channel_url_or_name.strip()
        if not (target.startswith("http://") or target.startswith("https://")):
            target = f"https://www.youtube.com/@{target.lstrip('@')}"

        # Limpiar cualquier subpestaña residual y forzar la ruta directa /videos
        clean_target = target.rstrip('/')
        for tab in ['/featured', '/shorts', '/streams', '/live', '/playlists', '/community']:
            if clean_target.endswith(tab):
                clean_target = clean_target[:-len(tab)]
                break

        if not clean_target.endswith('/videos'):
            channel_videos_url = f"{clean_target}/videos"
        else:
            channel_videos_url = clean_target

        end_index = start_index + count - 1
        ydl_opts = {
            'quiet': True,
            'skip_download': True,
            'extract_flat': 'in_playlist',
            'no_warnings': True,
            'playlist_items': f'{start_index}-{end_index}',
            'compat_opts': ['no-youtube-channel-redirect'],
            'extractor_args': {
                'youtube': {
                    'skip': ['dash', 'hls'],
                    'player_client': ['web']
                }
            }
        }

        try:
            import yt_dlp
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(channel_videos_url, download=False)
                if not info:
                    return None

                def format_num(val):
                    if not val or not isinstance(val, (int, float)):
                        return "--"
                    if val >= 1_000_000:
                        return f"{val / 1_000_000:.1f} M".replace('.0', '')
                    if val >= 1_000:
                        return f"{val / 1_000:.1f} K".replace('.0', '')
                    return str(int(val))

                channel_title = info.get('uploader') or info.get('channel') or info.get('title') or 'Canal de YouTube'
                subscribers = format_num(info.get('channel_follower_count') or info.get('subscriber_count'))
                total_views = format_num(info.get('view_count'))

                # Miniatura o Avatar del canal
                thumbnails = info.get('thumbnails') or []
                avatar_url = ''
                banner_url = ''
                for t in thumbnails:
                    url = t.get('url', '')
                    if 'avatar' in url or '=s' in url or 'yt3.ggpht.com' in url:
                        avatar_url = url
                    elif 'banner' in url or 'w1060' in url or 'w2120' in url:
                        banner_url = url

                if not avatar_url and thumbnails:
                    avatar_url = thumbnails[-1].get('url', '')

                raw_entries = info.get('entries', []) or []
                
                # Desempaquetar si YouTube devolvió sub-playlists como primer nivel
                flattened_entries = []
                for item in raw_entries:
                    if not item:
                        continue
                    title_lower = (item.get('title') or '').strip().lower()
                    if 'entries' in item and item.get('entries'):
                        flattened_entries.extend(item['entries'])
                    elif title_lower in ['videos', 'vídeos', 'shorts', 'live', 'directos']:
                        # Ignorar el contenedor/pestaña huérfano
                        continue
                    else:
                        flattened_entries.append(item)

                video_list = []
                for entry in flattened_entries:
                    if not entry:
                        continue
                    
                    vid_id = entry.get('id', '')
                    title = entry.get('title', 'Sin título')

                    # Descartar si el elemento no es un vídeo real
                    if not vid_id or vid_id in ['videos', 'shorts', 'streams', 'live']:
                        continue
                    if title.strip().lower() in ['videos', 'vídeos', 'shorts', 'live', 'directos']:
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

                    raw_views = entry.get('view_count') or 0
                    video_list.append({
                        'id': vid_id,
                        'title': title,
                        'duration': dur_str,
                        'url': entry.get('url') or f"https://www.youtube.com/watch?v={vid_id}",
                        'thumbnail': entry.get('thumbnail') or f"https://i.ytimg.com/vi/{vid_id}/hqdefault.jpg",
                        'views': format_num(raw_views),
                        'raw_views': int(raw_views) if isinstance(raw_views, (int, float)) else 0,
                        'uploader': channel_title
                    })

                total_videos = format_num(info.get('playlist_count') or len(video_list))

                return {
                    'title': channel_title,
                    'url': target,
                    'avatar': avatar_url,
                    'banner': banner_url,
                    'subscribers': subscribers,
                    'views': total_views,
                    'video_count': total_videos,
                    'description': (info.get('description') or '').strip()[:240],
                    'videos': video_list
                }
        except Exception as e:
            print(f"[ERROR YT CHANNEL] {e}")
            return None

    def get_yt_download_options(self, output_path: str, is_audio_only: bool = False, quality: str = "1080"):
        """Genera las opciones de yt-dlp optimizadas para YouTube."""
        opts = {
            'outtmpl': os.path.join(output_path, '%(title)s.%(ext)s'),
            'quiet': True,
            'no_warnings': True,
        }
        
        if is_audio_only:
            opts.update({
                'format': 'bestaudio/best',
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '192',
                }]
            })
        else:
            # Seleccionar resolución deseada combinada con el mejor audio
            opts.update({
                'format': f'bestvideo[height<={quality}]+bestaudio/best[height<={quality}]/best',
                'merge_output_format': 'mp4'
            })
            
        return opts

    def check_for_updates(self):
        """Comprueba en GitHub Releases si hay una versión superior a la instalada."""
        CURRENT_VERSION = APP_VERSION
        REPO_NAME = GITHUB_REPO

        def _worker():
            try:
                import urllib.request
                import json
                import re

                url = f"https://api.github.com/repos/{REPO_NAME}/releases/latest"
                req = urllib.request.Request(
                    url,
                    headers={
                        "User-Agent": "Aurion-Desktop-App",
                        "Accept": "application/vnd.github.v3+json"
                    }
                )

                with urllib.request.urlopen(req, timeout=10) as response:
                    if response.status != 200:
                        return
                    data = json.loads(response.read().decode("utf-8"))

                tag_name = data.get("tag_name", "").strip().lstrip("v")
                if not tag_name:
                    return

                def parse_version_numbers(v_str):
                    return [int(n) for n in re.findall(r"\d+", v_str)]

                # Si la versión remota de GitHub es más reciente que la local
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
                        self._window.evaluate_js(f"window.onUpdateAvailable({json.dumps(payload)})")

            except Exception as e:
                print(f"[check_for_updates] No se pudo consultar GitHub: {e}")

        import threading
        threading.Thread(target=_worker, daemon=True).start()

    def start_auto_update(self, download_url):
        """Actualización limpia con robocopy, detección dinámica de ruta y sin UAC."""
        def download_and_run():
            try:
                import sys
                import time
                import shutil
                temp_dir = tempfile.gettempdir()
                bat_path = os.path.join(temp_dir, "aurion_restart.bat")
                
                # Detectar dinámicamente la ruta exacta donde está corriendo el ejecutable
                if getattr(sys, 'frozen', False):
                    app_exe_path = sys.executable
                    install_dir = os.path.dirname(sys.executable)
                else:
                    install_dir = os.path.expandvars(r"%LOCALAPPDATA%\Programs\Aurion")
                    app_exe_path = os.path.join(install_dir, "Aurion.exe")

                staging_dir = os.path.join(temp_dir, "aurion_new_version")
                os.makedirs(staging_dir, exist_ok=True)

                # Si es simulación local, avanzamos la barra sin hacer peticiones web
                if not download_url or download_url == "local_mock_update" or not download_url.startswith("http"):
                    for pct in [20, 50, 75, 90, 100]:
                        time.sleep(0.2)
                        if self._window:
                            self._window.evaluate_js(f"window.onUpdateProgress && window.onUpdateProgress({pct});")
                else:
                    ctx = ssl.create_default_context()
                    req = urllib.request.Request(download_url, headers={'User-Agent': 'AurionApp'})
                    zip_path = os.path.join(temp_dir, "aurion_update.zip")
                    with urllib.request.urlopen(req, context=ctx, timeout=40) as resp, open(zip_path, 'wb') as f:
                        total_length = resp.getheader('content-length')
                        total_bytes = int(total_length) if total_length else 0
                        downloaded = 0
                        chunk_size = 64 * 1024
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

                    # Si el zip contenía una sola carpeta raíz contenedora, usarla como origen
                    subdirs = [os.path.join(staging_dir, d) for d in os.listdir(staging_dir) if os.path.isdir(os.path.join(staging_dir, d))]
                    if len(subdirs) == 1 and not any(os.path.isfile(os.path.join(staging_dir, f)) for f in os.listdir(staging_dir)):
                        staging_dir = subdirs[0]

                # Script que espera cierre de Aurion.exe, copia archivos y relanza
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

                creation_flags = 0x08000000  # CREATE_NO_WINDOW
                subprocess.Popen(["cmd.exe", "/c", bat_path], creationflags=creation_flags)

                if self._window:
                    self._window.destroy()
                os._exit(0)

            except Exception as e:
                err_msg = str(e).replace('"', '\\"').replace("'", "\\'")
                print(f"[AutoUpdate Error]: {e}")
                if self._window:
                    # Muestra una ventana de alerta con el error exacto
                    self._window.evaluate_js(f"alert('Error exacto de Python:\\n{err_msg}');")
                    self._window.evaluate_js("window.onUpdateError && window.onUpdateError();")

        threading.Thread(target=download_and_run, daemon=True).start()
        return True

    def open_extension_folder(self):
        """Abre la carpeta raíz de Aurion con la carpeta 'extension' seleccionada y resaltada."""
        def _worker():
            try:
                import sys, os, subprocess, ctypes
                from ctypes import wintypes

                if getattr(sys, 'frozen', False):
                    base_dir = os.path.dirname(sys.executable)
                else:
                    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

                ext_dir = os.path.abspath(os.path.join(base_dir, "extension"))
                if not os.path.exists(ext_dir):
                    os.makedirs(ext_dir, exist_ok=True)

                # Método 1 (Nativo de Windows API: Shell32): Infalible, abre Aurion y marca 'extension'
                opened = False
                try:
                    shell32 = ctypes.windll.shell32
                    ole32 = ctypes.windll.ole32

                    ole32.CoInitialize(None)

                    # Obtener el ITEMIDLIST (PIDL) de la carpeta extension
                    ILCreateFromPathW = shell32.ILCreateFromPathW
                    ILCreateFromPathW.argtypes = [wintypes.LPCWSTR]
                    ILCreateFromPathW.restype = ctypes.c_void_p

                    pidl = ILCreateFromPathW(ext_dir)
                    if pidl:
                        SHOpenFolderAndSelectItems = shell32.SHOpenFolderAndSelectItems
                        SHOpenFolderAndSelectItems.argtypes = [ctypes.c_void_p, wintypes.UINT, ctypes.c_void_p, wintypes.DWORD]
                        SHOpenFolderAndSelectItems.restype = ctypes.HRESULT

                        # Le pide directamente al shell de Windows que abra la carpeta padre y seleccione el item
                        hr = SHOpenFolderAndSelectItems(pidl, 0, None, 0)
                        shell32.ILFree(pidl)
                        if hr == 0:
                            opened = True
                    ole32.CoUninitialize()
                except Exception as ex:
                    print(f"[Core] Fallo en SHOpenFolderAndSelectItems: {ex}")

                # Método 2 (Fallback estándar de Windows con explorer.exe):
                if not opened:
                    # explorer.exe requiere que la ruta use barras invertidas estrictas de Windows
                    win_path = ext_dir.replace("/", "\\")
                    cmd = f'explorer.exe /select,"{win_path}"'
                    subprocess.Popen(cmd, shell=True)

            except Exception as e:
                print(f"[Core] Error abriendo y seleccionando carpeta extension: {e}")

        threading.Thread(target=_worker, daemon=True).start()
        return True

    def get_installed_browsers(self):
        """Devuelve un diccionario indicando cuáles navegadores Chromium están instalados en el sistema."""
        known_paths = {
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
        installed = {}
        for b_key, paths in known_paths.items():
            installed[b_key] = any(os.path.isfile(p) for p in paths)
        return installed

    def launch_browser_for_extension(self, target_url="chrome://extensions", browser_key="chrome"):
        """Copia la URL al portapapeles y abre una ventana nueva del navegador correspondiente."""
        def _worker():
            try:
                import os, subprocess, winreg
                known_paths = {
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

                chosen_exe = None
                for path in known_paths.get(browser_key, []):
                    if os.path.isfile(path):
                        chosen_exe = path
                        break

                effective_url = target_url

                # Si el navegador elegido no existe, buscar el predeterminado y adaptar la URL a ese
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

                # Copiar al portapapeles la URL que de verdad coincida con el navegador abierto
                subprocess.run(f'cmd /c <nul set /p="{effective_url}"| clip', shell=True, creationflags=0x08000000)

                if chosen_exe and os.path.isfile(chosen_exe):
                    subprocess.Popen([chosen_exe, "--new-window"])
                else:
                    subprocess.Popen('cmd /c start ""', shell=True, creationflags=0x08000000)

            except Exception as e:
                print(f"[Core] Error abriendo navegador: {e}")
        threading.Thread(target=_worker, daemon=True).start()
        return True