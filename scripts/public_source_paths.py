"""Detect local drive paths without mistaking a public URL scheme for a drive."""
import re
PRIVATE_PATH = re.compile(r'(?<![A-Za-z0-9])[A-Za-z]:[\\/]|/Users/|/Codex/', re.I)

def has_private_path(value):
    return isinstance(value, str) and bool(PRIVATE_PATH.search(value))
