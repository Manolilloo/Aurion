import os
import sys

# Sincronización nativa a los Hz del monitor (165 Hz) sin saturar la CPU
os.environ['WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS'] = (
    '--enable-gpu-rasterization '
    '--enable-zero-copy '
    '--ignore-gpu-blocklist '
    '--canvas-oop-rasterization '
    '--enable-features=VaapiVideoDecoder'
)

import ctypes
import webview
from core.bridge import AurionBridge

def get_base_dir():
    if getattr(sys, 'frozen', False):
        return getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
    return os.path.dirname(os.path.abspath(__file__))

BASE_DIR = get_base_dir()

# Forzar ID de aplicación en Windows para que la barra de tareas fije el icono propio y no el de Python
try:
    myappid = 'manolilloo.aurion.desktop.1.1.9'
    ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)
except Exception:
    pass

def set_window_icon():
    """Fuerza el icono directamente en el HWND nativo de Windows."""
    try:
        candidates = [
            os.path.join(BASE_DIR, "assets", "icon.ico"),
            os.path.join(BASE_DIR, "icon.ico"),
            os.path.join(os.path.dirname(sys.executable), "_internal", "assets", "icon.ico"),
            os.path.join(os.path.dirname(sys.executable), "assets", "icon.ico")
        ]
        ico_path = next((p for p in candidates if os.path.exists(p)), None)
        if not ico_path:
            return

        hicon_big = ctypes.windll.user32.LoadImageW(None, ico_path, 1, 32, 32, 0x00000010)
        hicon_small = ctypes.windll.user32.LoadImageW(None, ico_path, 1, 16, 16, 0x00000010)

        WM_SETICON = 0x0080

        EnumWindowsProc = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
        current_pid = os.getpid()

        def enum_windows_callback(hwnd, lParam):
            lpdwProcessId = ctypes.c_ulong()
            ctypes.windll.user32.GetWindowThreadProcessId(hwnd, ctypes.byref(lpdwProcessId))
            if lpdwProcessId.value == current_pid:
                if hicon_big:
                    ctypes.windll.user32.SendMessageW(hwnd, WM_SETICON, 1, hicon_big)
                if hicon_small:
                    ctypes.windll.user32.SendMessageW(hwnd, WM_SETICON, 0, hicon_small)
            return True

        ctypes.windll.user32.EnumWindows(EnumWindowsProc(enum_windows_callback), 0)
    except Exception:
        pass

def on_loaded(window, bridge):
    import threading
    threading.Timer(0.3, set_window_icon).start()

def main():
    bridge = AurionBridge()

    window = webview.create_window(
        'Aurion',
        'frontend/index.html',
        js_api=bridge,
        width=1320,
        height=780,
        frameless=True,
        easy_drag=False,
        resizable=True,
        min_size=(1100, 650),
        background_color='#06090e'
    )
    bridge.set_window(window)

    webview.start(on_loaded, (window, bridge), gui='edgechromium', debug=False, http_port=8085)

    # Limpieza final una vez que la ventana se ha destruido
    try:
        dl = getattr(bridge, 'downloader', None) or getattr(bridge, '_downloader', None)
        if dl:
            dl.cleanup_all_temp()
    except Exception:
        pass

if __name__ == '__main__':
    main()