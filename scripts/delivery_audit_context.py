"""Expose an exact delivery contract to assembled-site audits, then remove it."""
import argparse
import contextlib
import hashlib
from pathlib import Path
import subprocess


@contextlib.contextmanager
def audit_delivery_contract(delivery_path, site_dir, expected_sha256):
    source, site = Path(delivery_path), Path(site_dir)
    body = source.read_bytes()
    if hashlib.sha256(body).hexdigest() != expected_sha256:
        raise ValueError('Delivery contract changed before actual-asset audits')
    if not site.is_dir():
        raise ValueError('An existing assembled site directory is required')
    target = site/'APPROVED_DELIVERY.json'
    # Exclusive creation preserves pre-existing files, including broken links.
    with target.open('xb') as stream:
        stream.write(body)
    try:
        yield target
    finally:
        if target.is_symlink() or not target.is_file() or target.read_bytes() != body:
            raise ValueError('Temporary audit contract changed; build rejected')
        target.unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--delivery', type=Path, required=True)
    parser.add_argument('--site', type=Path, required=True)
    parser.add_argument('--expected-sha256', required=True)
    parser.add_argument('command', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ['--'] else args.command
    if not command:
        parser.error('An audit command after -- is required')
    with audit_delivery_contract(args.delivery, args.site, args.expected_sha256):
        subprocess.run(command, check=True)


if __name__ == '__main__':
    main()
