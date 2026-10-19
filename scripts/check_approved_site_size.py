"""Measure the completed static site after generated catalogs and release jobs."""
import argparse
from pathlib import Path
from build_approved_site import MAX_SITE_BYTES

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--site',type=Path,required=True);args=p.parse_args()
    if not args.site.is_dir():raise ValueError('Missing completed site')
    size=sum(p.stat().st_size for p in args.site.rglob('*') if p.is_file())
    if size>=MAX_SITE_BYTES:raise ValueError('Completed site reaches/exceeds 990000000 bytes: '+str(size))
    print('Completed approved static site: '+str(size)+' bytes; below '+str(MAX_SITE_BYTES)+'.')

if __name__=='__main__':main()
