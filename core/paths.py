"""Shared paths for persistent user data outside the application installation."""

import os
import shutil
import tempfile


def get_app_data_dir() -> str:
    """Return the per-user Aurion data directory and create it if needed."""
    base_dir = (
        os.environ.get("LOCALAPPDATA")
        or os.environ.get("APPDATA")
        or os.environ.get("XDG_DATA_HOME")
    )
    if not base_dir:
        base_dir = os.path.join(os.path.expanduser("~"), ".local", "share")

    app_data_dir = os.path.join(base_dir, "Aurion")
    os.makedirs(app_data_dir, exist_ok=True)
    return app_data_dir


def get_app_data_file(filename: str, legacy_path: str | None = None) -> str:
    """Resolve a user data file and migrate an older installation copy once."""
    if (
        not isinstance(filename, str)
        or not filename
        or filename in {".", ".."}
        or "/" in filename
        or chr(92) in filename
    ):
        raise ValueError("El nombre del archivo de datos no es válido.")

    app_data_dir = get_app_data_dir()
    destination = os.path.join(app_data_dir, filename)

    if (
        legacy_path
        and not os.path.exists(destination)
        and os.path.isfile(legacy_path)
    ):
        temporary_path = None
        try:
            descriptor, temporary_path = tempfile.mkstemp(
                prefix=f".{filename}.",
                suffix=".migration",
                dir=app_data_dir,
            )
            os.close(descriptor)
            shutil.copy2(legacy_path, temporary_path)
            if not os.path.exists(destination):
                os.replace(temporary_path, destination)
                temporary_path = None
        except OSError:
            # Mantener el archivo antiguo accesible si el directorio de usuario
            # no permite completar la migración.
            return legacy_path
        finally:
            if temporary_path and os.path.exists(temporary_path):
                try:
                    os.remove(temporary_path)
                except OSError:
                    pass

    return destination
