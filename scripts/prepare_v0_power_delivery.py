"""Build the exact small gzip representation of public manual reference JSON.

Only SOURCE_PATH is build-only. This function neither changes delivery limits
nor handles original CAD, model bodies, approval contracts or private receipts.
The caller must inventory and strictly pin SOURCE_PATH, exclude that one source
from runtime copying, then invoke this before the final approved site size gate.
"""
from pathlib import Path
import gzip,hashlib,json

SOURCE_PATH='viewer/data/v0-power-references.source.json'
OUTPUT_PATH='viewer/data/v0-power-references.json.gz'
SOURCE_BYTES=615743
SOURCE_SHA256='f4b455722cd1878a7de8d6566cd4ab2bd8f5c3f6b5fb0de37625cd468a4ceded'
ENCODED_BYTES=31361
ENCODED_SHA256='2367c37c716689d6fe4107f83feb7a8023dcd5d9ba987f05df0b0331586329b7'

def exact_v0_power_source(site_source):
 source=Path(site_source)/SOURCE_PATH
 raw=source.read_bytes()
 if len(raw)!=SOURCE_BYTES or hashlib.sha256(raw).hexdigest()!=SOURCE_SHA256:
  raise ValueError('Changed exact power reference source')
 data=json.loads(raw)
 if set(data)!={'voron_v02_120','voron_v02r1_120'}:
  raise ValueError('Unknown power manual source')
 return raw

def build_v0_power_delivery_body(site_source):
 raw=exact_v0_power_source(site_source)
 encoded=bytearray(gzip.compress(raw,compresslevel=9,mtime=0));encoded[9]=255;encoded=bytes(encoded)
 if len(encoded)!=ENCODED_BYTES or hashlib.sha256(encoded).hexdigest()!=ENCODED_SHA256 or gzip.decompress(encoded)!=raw:
  raise ValueError('Power reference compressor differs from exact delivery pin')
 return encoded,dict(path=OUTPUT_PATH,bytes=len(encoded),sha256=ENCODED_SHA256,decoded_bytes=len(raw),decoded_sha256=SOURCE_SHA256,raw_source_delivered=False)

def write_v0_power_delivery(site_source,output,encoded):
 raw=exact_v0_power_source(site_source);target=Path(output)/OUTPUT_PATH
 if len(encoded)!=ENCODED_BYTES or hashlib.sha256(encoded).hexdigest()!=ENCODED_SHA256 or gzip.decompress(encoded)!=raw:
  raise ValueError('Changed prepared power reference body')
 if (Path(output)/SOURCE_PATH).exists() or target.exists():
  raise ValueError('Power reference delivery collision or raw source copied')
 target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(encoded)

def prepare_v0_power_delivery(site_source,output):
 encoded,receipt=build_v0_power_delivery_body(site_source)
 write_v0_power_delivery(site_source,output,encoded)
 return receipt
