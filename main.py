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

import webview
from core.bridge import AurionBridge

def on_loaded(window, bridge):
    pass

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

    webview.start(on_loaded, (window, bridge), gui='edgechromium', debug=False)

if __name__ == '__main__':
    main()