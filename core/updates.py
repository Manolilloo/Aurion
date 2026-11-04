"""Safe helpers for handling auto-update archives."""

import os
import stat
import zipfile


class UnsafeUpdateArchive(ValueError):
    """Raised when an update archive contains unsafe or excessive entries."""


def safe_extract_zip(
    archive_path: str,
    destination: str,
    *,
    max_files: int = 10000,
    max_uncompressed_bytes: int = 1024 * 1024 * 1024,
) -> int:
    """Extract a ZIP without traversal, symlinks, special files or unbounded expansion."""
    destination = os.path.abspath(destination)
    os.makedirs(destination, exist_ok=True)
    destination_real = os.path.realpath(destination)

    with zipfile.ZipFile(archive_path, "r") as archive:
        entries = archive.infolist()
        if len(entries) > max_files:
            raise UnsafeUpdateArchive("El archivo contiene demasiados elementos")

        declared_total = sum(max(0, info.file_size) for info in entries)
        if declared_total > max_uncompressed_bytes:
            raise UnsafeUpdateArchive("El contenido descomprimido supera el límite permitido")

        checked = []
        seen_paths = set()
        for info in entries:
            raw_name = info.filename
            normalized = raw_name.replace("\\", "/")
            if (
                not normalized
                or normalized.startswith("/")
                or "\x00" in normalized
                or any(part == ".." for part in normalized.split("/"))
            ):
                raise UnsafeUpdateArchive("El archivo contiene una ruta no permitida")

            parts = [part for part in normalized.split("/") if part not in {"", "."}]
            if not parts:
                raise UnsafeUpdateArchive("El archivo contiene una ruta vacía")

            reserved_names = {"CON", "PRN", "AUX", "NUL"} | {
                f"{prefix}{number}"
                for prefix in ("COM", "LPT")
                for number in range(1, 10)
            }
            for part in parts:
                if (
                    ":" in part
                    or any(char in part for char in '<>:"|?*')
                    or part.endswith((".", " "))
                    or part.split(".", 1)[0].upper() in reserved_names
                ):
                    raise UnsafeUpdateArchive("El archivo contiene un nombre no válido en Windows")

            relative_path = os.path.join(*parts)
            target_path = os.path.realpath(os.path.join(destination_real, relative_path))
            try:
                if os.path.commonpath([destination_real, target_path]) != destination_real:
                    raise UnsafeUpdateArchive("El archivo intenta salir del directorio de instalación")
            except ValueError as exc:
                raise UnsafeUpdateArchive("Ruta de archivo inválida") from exc

            normalized_key = os.path.normcase(os.path.normpath(relative_path)).casefold()
            if normalized_key in seen_paths:
                raise UnsafeUpdateArchive("El archivo contiene rutas duplicadas")
            seen_paths.add(normalized_key)

            unix_mode = (info.external_attr >> 16) & 0xFFFF
            file_type = stat.S_IFMT(unix_mode)
            if file_type == stat.S_IFLNK:
                raise UnsafeUpdateArchive("No se permiten enlaces simbólicos en actualizaciones")
            if file_type not in {0, stat.S_IFREG, stat.S_IFDIR}:
                raise UnsafeUpdateArchive("El archivo contiene un tipo de elemento no permitido")

            checked.append((info, target_path))

        extracted_bytes = 0
        extracted_files = 0
        for info, target_path in checked:
            if info.is_dir():
                os.makedirs(target_path, exist_ok=True)
                continue

            os.makedirs(os.path.dirname(target_path), exist_ok=True)
            with archive.open(info, "r") as source, open(target_path, "xb") as target:
                while True:
                    chunk = source.read(128 * 1024)
                    if not chunk:
                        break
                    extracted_bytes += len(chunk)
                    if extracted_bytes > max_uncompressed_bytes:
                        raise UnsafeUpdateArchive("El ZIP supera el tamaño máximo al descomprimirse")
                    target.write(chunk)
            extracted_files += 1

        return extracted_files
