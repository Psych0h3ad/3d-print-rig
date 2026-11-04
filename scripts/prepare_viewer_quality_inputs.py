"""Verify/cache the 41 extra public quality inputs before the normal build.

This is transport preparation only. It does not run or replace any actual-model
audit, alter descriptors, or add cache files to the published site.
"""
import argparse
from pathlib import Path

from check_viewer_quality_release import prefetch_public_inputs


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--cache', type=Path, required=True)
    args = parser.parse_args()
    prefetch_public_inputs(args.site, args.output, args.cache)


if __name__ == '__main__':
    main()
