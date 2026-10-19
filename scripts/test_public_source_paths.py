import unittest
from public_source_paths import has_private_path

class PublicSourcePaths(unittest.TestCase):
    def test_public_schemes(self):
        for text in ['https://rh3d.xyz/virtu', 'http://example.test/a', 'https://files.printables.com/a.stl', 'https://raw.githubusercontent.com/owner/repo/pin/CAD/a.step']:
            with self.subTest(text=text): self.assertFalse(has_private_path(text))
    def test_actual_local_drive_paths(self):
        for text in ['C:\\path', 'D:/path', '"E:\\parts\\child.step"', 'vendor object "D:/local/child"', '/Users/person/file', '/Codex/file']:
            with self.subTest(text=text): self.assertTrue(has_private_path(text))

if __name__ == '__main__': unittest.main()
