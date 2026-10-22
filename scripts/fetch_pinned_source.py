"""Fetch exact public source inputs; retry only named transient failures."""
import hashlib
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit

TRANSIENT_SOURCE_STATUS = {429, 502, 503, 504}


def file_digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def fetch_pinned_source(row, target, *, allowed_hosts, timeout=60,
                        user_agent='3D-Print-Rig'):
    """Three attempts at the same pinned URL; invalid bodies never retry."""
    if (type(row.get('bytes')) is not int or row['bytes'] <= 0
            or not isinstance(row.get('sha256'), str)
            or len(row['sha256']) != 64
            or any(c not in '0123456789abcdef' for c in row['sha256'])):
        raise ValueError('Invalid registered input size or checksum')
    if type(timeout) is not int or not 0 < timeout <= 60:
        raise ValueError('Invalid registered input timeout')
    origin = urlsplit(row['url'])
    if (origin.scheme != 'https' or origin.hostname not in allowed_hosts
            or origin.username or origin.password or origin.fragment):
        raise ValueError('Unexpected registered input origin')
    if target.exists():
        raise ValueError('Changed registered input; no overwrite: ' + row['path'])
    request = urllib.request.Request(row['url'], headers={
        'Accept-Encoding': 'identity', 'User-Agent': user_agent})
    temporary = target.with_name(target.name + '.download')
    for attempt in range(3):
        deadline = time.monotonic() + timeout
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response, temporary.open('wb') as output:
                final = urlsplit(response.url)
                if (final.scheme != 'https' or final.hostname not in allowed_hosts
                        or final.username or final.password or final.fragment):
                    raise ValueError('Unexpected registered input origin')
                length = getattr(response, 'headers', {}).get('Content-Length')
                if length is not None and (not length.isascii() or not length.isdecimal()
                                           or int(length) != row['bytes']):
                    raise ValueError('Registered body Content-Length mismatch')
                total = 0
                checksum = hashlib.sha256()
                while True:
                    if time.monotonic() >= deadline:
                        raise TimeoutError('Registered input attempt timed out')
                    # read1 returns available data without waiting to fill a block.
                    block = response.read1(min(1024 * 1024, row['bytes'] - total + 1))
                    if not block:
                        break
                    total += len(block)
                    if total > row['bytes']:
                        raise ValueError('Registered body exceeded its size')
                    checksum.update(block)
                    output.write(block)
            if (total != row['bytes'] or checksum.hexdigest() != row['sha256']
                    or temporary.stat().st_size != row['bytes'] or file_digest(temporary) != row['sha256']):
                raise ValueError('Registered body checksum mismatch')
            if time.monotonic() >= deadline:
                raise TimeoutError('Registered input attempt timed out')
            temporary.replace(target)
            return
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as error:
            if isinstance(error, urllib.error.HTTPError):
                retry = error.code in TRANSIENT_SOURCE_STATUS
                error.close()
            else:
                retry = isinstance(error, TimeoutError) or isinstance(
                    getattr(error, 'reason', None), TimeoutError)
            if not retry or attempt == 2:
                raise
        finally:
            if temporary.exists():
                temporary.unlink()
        time.sleep((1, 3)[attempt])
