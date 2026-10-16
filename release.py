import os
import re
import sys
import shutil
import subprocess

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))

FILES_TO_BUMP = [
    (os.path.join(ROOT_DIR, "core", "bridge.py"), r'(APP_VERSION\s*=\s*")[^"]+(")', r'\g<1>{ver}\g<2>'),
    (os.path.join(ROOT_DIR, "main.py"), r"(myappid\s*=\s*'manolilloo\.aurion\.desktop\.)[^']+(')", r"\g<1>{ver}\g<2>"),
    (os.path.join(ROOT_DIR, "installer.iss"), r'(#define\s+MyAppVersion\s+")[^"]+(")', r'\g<1>{ver}\g<2>'),
    (os.path.join(ROOT_DIR, "frontend", "index.html"), r'(Aurion\s+v)\d+\.\d+\.\d+', r'\g<1>{ver}'),
    (os.path.join(ROOT_DIR, "frontend", "index.html"), r'(Versión\s+)\d+\.\d+\.\d+', r'\g<1>{ver}'),
    (os.path.join(ROOT_DIR, "frontend", "js", "modules", "settings.js"), r'(Aurion\s+v)\d+\.\d+\.\d+', r'\g<1>{ver}'),
]


def update_version_everywhere(new_version):
    print(f"\n[1/3] Sincronizando versión v{new_version} en todo el proyecto...")
    for file_path, pattern, replacement in FILES_TO_BUMP:
        if not os.path.exists(file_path):
            continue
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        updated = re.sub(pattern, replacement.format(ver=new_version), content)
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(updated)
        print(f"   ✔ Actualizado: {os.path.relpath(file_path, ROOT_DIR)}")


def build_pyinstaller_and_zip(version):
    print("\n[2/3] Compilando ejecutable con PyInstaller (Aurion.spec)...")
    subprocess.run([sys.executable, "-m", "PyInstaller", "Aurion.spec", "--noconfirm"], cwd=ROOT_DIR, check=True)

    dist_folder = os.path.join(ROOT_DIR, "dist", "Aurion")
    zip_target = os.path.join(ROOT_DIR, "dist", f"Aurion-v{version}")
    print(f"\n[3/3] Empaquetando release para GitHub Auto-Updater: Aurion-v{version}.zip...")
    shutil.make_archive(zip_target, 'zip', dist_folder)
    print(f"\n🚀 ¡LISTO! Release generada en: dist/Aurion-v{version}.zip")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python release.py <nueva_version> [--build]")
        print("Ejemplo solo cambiar versión: python release.py 1.2.0")
        print("Ejemplo cambiar versión + compilar .exe y .zip: python release.py 1.1.8 --build")
        sys.exit(1)

    target_ver = sys.argv[1].lstrip("v").strip()
    update_version_everywhere(target_ver)

    if "--build" in sys.argv:
        build_pyinstaller_and_zip(target_ver)