import unittest

from core.downloader import parse_speed_limit_bytes, parse_time_to_seconds


class DownloaderHelperTests(unittest.TestCase):
    def test_speed_limit_parser(self):
        self.assertIsNone(parse_speed_limit_bytes("0"))
        self.assertIsNone(parse_speed_limit_bytes(""))
        self.assertEqual(parse_speed_limit_bytes("5M"), 5 * 1024 * 1024)
        self.assertEqual(parse_speed_limit_bytes("1.5G"), int(1.5 * 1024 ** 3))
        self.assertEqual(parse_speed_limit_bytes("512K"), 512 * 1024)
        self.assertIsNone(parse_speed_limit_bytes("not-a-limit"))

    def test_time_parser(self):
        self.assertEqual(parse_time_to_seconds("01:30"), 90)
        self.assertEqual(parse_time_to_seconds("01:02:03"), 3723)
        self.assertEqual(parse_time_to_seconds("42"), 42)
        self.assertIsNone(parse_time_to_seconds(""))
        self.assertIsNone(parse_time_to_seconds("n/a"))


if __name__ == "__main__":
    unittest.main()
