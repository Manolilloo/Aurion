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

APP_VERSION = "1.0.0"
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
                "accent1": "#00ffaa",
                "accent2": "#00b4d8"
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
        print(f"\n[DEBUG BRIDGE] start_downloads recibido!")
        tasks = payload.get("tasks", [])
        config = payload.get("config", {})
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
                    
                    results.append({
                        'id': vid_id,
                        'title': entry.get('title', 'Sin título'),
                        'uploader': entry.get('uploader') or entry.get('channel', 'Desconocido'),
                        'duration': duration_str,
                        'url': entry.get('url') or f"https://www.youtube.com/watch?v={vid_id}",
                        'thumbnail': thumb_url
                    })
        except Exception as e:
            print(f"[ERROR YT SEARCH] {e}")
            return []
            
        return results

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
        """SIMULACIÓN: Dispara el modal con payload de prueba local."""
        def simular():
            import time
            time.sleep(2)
            if self._window:
                fake_payload = json.dumps({
                    "current": "1.0.0",
                    "latest": "1.1.0",
                    "url": "local_mock_update"
                })
                self._window.evaluate_js(f"window.onUpdateAvailable && window.onUpdateAvailable({fake_payload});")

        threading.Thread(target=simular, daemon=True).start()
        return True

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