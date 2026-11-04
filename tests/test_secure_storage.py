import os
import tempfile
import unittest

from core.secure_storage import (
    protect_for_current_user,
    read_protected_file,
    unprotect_for_current_user,
    write_protected_file,
)


class SecureStorageTests(unittest.TestCase):
    def test_dpapi_round_trip(self):
        plaintext = b"# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t2000000000\tPREF\tprivate\n"
        encrypted = protect_for_current_user(plaintext)
        self.assertNotEqual(encrypted, plaintext)
        self.assertNotIn(plaintext, encrypted)
        self.assertEqual(unprotect_for_current_user(encrypted), plaintext)

    def test_protected_file_is_atomic_and_round_trips(self):
        plaintext = b"aurion secure local state"
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, "session.dpapi")
            write_protected_file(path, plaintext)
            self.assertTrue(os.path.isfile(path))
            self.assertFalse(os.path.exists(path + ".tmp"))
            with open(path, "rb") as stream:
                self.assertNotIn(plaintext, stream.read())
            self.assertEqual(read_protected_file(path), plaintext)


if __name__ == "__main__":
    unittest.main()
