import os
import sys
import webview
from core.bridge import AurionBridge

def on_loaded(window, bridge):
    """Callback que se ejecuta cuando el frontend webview termina de cargar."""
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
        resizable=False,
        easy_drag=False,
        background_color='#06090e'
    )
    bridge.set_window(window)

    webview.start(on_loaded, (window, bridge), gui='edgechromium', debug=False)

if __name__ == '__main__':
    main()