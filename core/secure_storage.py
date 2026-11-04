"""Windows DPAPI helpers for protecting local session material at rest."""

import ctypes
import os
import sys
from ctypes import wintypes


class DataBlob(ctypes.Structure):
    _fields_ = [
        ("cbData", wintypes.DWORD),
        ("pbData", ctypes.POINTER(ctypes.c_ubyte)),
    ]


CRYPTPROTECT_UI_FORBIDDEN = 0x1


def _windows_crypto():
    if sys.platform != "win32":
        raise OSError("DPAPI solo está disponible en Windows.")

    crypt32 = ctypes.WinDLL("crypt32", use_last_error=True)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

    crypt32.CryptProtectData.argtypes = [
        ctypes.POINTER(DataBlob),
        wintypes.LPCWSTR,
        ctypes.POINTER(DataBlob),
        ctypes.c_void_p,
        ctypes.c_void_p,
        wintypes.DWORD,
        ctypes.POINTER(DataBlob),
    ]
    crypt32.CryptProtectData.restype = wintypes.BOOL

    crypt32.CryptUnprotectData.argtypes = [
        ctypes.POINTER(DataBlob),
        ctypes.POINTER(wintypes.LPWSTR),
        ctypes.POINTER(DataBlob),
        ctypes.c_void_p,
        ctypes.c_void_p,
        wintypes.DWORD,
        ctypes.POINTER(DataBlob),
    ]
    crypt32.CryptUnprotectData.restype = wintypes.BOOL

    kernel32.LocalFree.argtypes = [ctypes.c_void_p]
    kernel32.LocalFree.restype = ctypes.c_void_p
    return crypt32, kernel32


def _blob_from_bytes(value: bytes):
    if not isinstance(value, bytes):
        raise TypeError("DPAPI espera datos binarios.")
    if not value:
        raise ValueError("No se pueden proteger datos vacíos.")
    buffer = ctypes.create_string_buffer(value, len(value))
    blob = DataBlob(
        len(value),
        ctypes.cast(buffer, ctypes.POINTER(ctypes.c_ubyte)),
    )
    return blob, buffer


def _blob_to_bytes(blob: DataBlob) -> bytes:
    if not blob.pbData or not blob.cbData:
        return b""
    return ctypes.string_at(blob.pbData, blob.cbData)


def protect_for_current_user(plaintext: bytes) -> bytes:
    """Encrypt bytes so only the current Windows user profile can decrypt them."""
    crypt32, kernel32 = _windows_crypto()
    data_in, keepalive = _blob_from_bytes(plaintext)
    data_out = DataBlob()
    try:
        ok = crypt32.CryptProtectData(
            ctypes.byref(data_in),
            "Aurion local session",
            None,
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            ctypes.byref(data_out),
        )
        if not ok:
            raise ctypes.WinError(ctypes.get_last_error())
        return _blob_to_bytes(data_out)
    finally:
        if data_out.pbData:
            kernel32.LocalFree(ctypes.cast(data_out.pbData, ctypes.c_void_p))
        del keepalive


def unprotect_for_current_user(ciphertext: bytes) -> bytes:
    """Decrypt bytes previously protected for the current Windows user profile."""
    crypt32, kernel32 = _windows_crypto()
    data_in, keepalive = _blob_from_bytes(ciphertext)
    data_out = DataBlob()
    description = wintypes.LPWSTR()
    try:
        ok = crypt32.CryptUnprotectData(
            ctypes.byref(data_in),
            ctypes.byref(description),
            None,
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            ctypes.byref(data_out),
        )
        if not ok:
            raise ctypes.WinError(ctypes.get_last_error())
        return _blob_to_bytes(data_out)
    finally:
        if data_out.pbData:
            kernel32.LocalFree(ctypes.cast(data_out.pbData, ctypes.c_void_p))
        if description:
            kernel32.LocalFree(ctypes.cast(description, ctypes.c_void_p))
        del keepalive


def write_protected_file(path: str, plaintext: bytes) -> None:
    """Atomically write DPAPI-protected bytes to disk."""
    encrypted = protect_for_current_user(plaintext)
    path = os.path.abspath(path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    temp_path = path + ".tmp"
    try:
        with open(temp_path, "wb") as output:
            output.write(encrypted)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temp_path, path)
    except OSError:
        try:
            if os.path.exists(temp_path):
                os.remove(temp_path)
        except OSError:
            pass
        raise


def read_protected_file(path: str) -> bytes:
    """Read and decrypt a DPAPI-protected file for the current Windows user."""
    with open(path, "rb") as source:
        ciphertext = source.read(1024 * 1024 + 1)
    if not ciphertext or len(ciphertext) > 1024 * 1024:
        raise ValueError("El archivo de sesión protegido no es válido.")
    return unprotect_for_current_user(ciphertext)
