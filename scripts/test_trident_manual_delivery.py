"""Exact editable source, generated gzip, and strict build-only approval boundaries."""
import gzip,hashlib,json,tempfile,unittest
from pathlib import Path
import prepare_trident_manual_delivery as packed
import build_approved_site as approved

class TridentReferenceDelivery(unittest.TestCase):
    def fixture(self, raw=b'{"references":[1,2,3]}\n'):
        tmp=tempfile.TemporaryDirectory();self.addCleanup(tmp.cleanup);root=Path(tmp.name);site=root/'site';site.mkdir()
        name=next(iter(packed.TABLE_NAMES));source=next(iter(packed.SOURCE_PATHS));module=packed.MODULE_PATH
        body=bytearray(gzip.compress(raw,compresslevel=9,mtime=0));body[9]=255;body=bytes(body)
        row=[len(raw),hashlib.sha256(raw).hexdigest(),len(body),hashlib.sha256(body).hexdigest()]
        code='const packedDelivery='+json.dumps({name:row},separators=(',',':'))+';\n'+packed.PACKED_DELIVERY_RECIPE+'\n'
        for path,data in [(source,raw),(module,code.encode())]:
            q=site/path;q.parent.mkdir(parents=True,exist_ok=True);q.write_bytes(data)
        inventory={'files':[{'path':'site/'+source,'sha256':row[1]},{'path':'site/'+module,'sha256':hashlib.sha256(code.encode()).hexdigest()}]}
        (root/'docs').mkdir();(root/'docs/SOURCE_INVENTORY.json').write_text(json.dumps(inventory),'utf-8')
        contract={'source_catalog_sha256':{source:row[1],module:hashlib.sha256(code.encode()).hexdigest()}}
        return root,site,source,module,contract,{module:site/module},body

    def test_exact_generation_and_raw_source_excluded(self):
        root,site,source,module,contract,sources,body=self.fixture()
        rows=approved.approved_trident_manual_delivery(root,contract,sources,[])
        self.assertEqual(rows[0][0],body);self.assertFalse(rows[0][1]['raw_source_delivered'])
        self.assertIn(source,approved.BUILD_ONLY_SOURCE_PATHS)
        output=root/'built';output.mkdir();packed.write_trident_manual_delivery(site,output,rows)
        self.assertEqual(gzip.decompress((output/rows[0][1]['path']).read_bytes()),(site/source).read_bytes())
        self.assertFalse((output/source).exists())
        with self.assertRaises(ValueError):packed.write_trident_manual_delivery(site,output,rows)

    def test_changed_approval_identity_and_generated_collisions_fail(self):
        for case in ['approval','module','inventory','duplicate','source','missing','generated-source','generated-runtime']:
            with self.subTest(case=case):
                root,site,source,module,contract,sources,body=self.fixture();runtime=[]
                if case=='approval':contract['source_catalog_sha256'].pop(source)
                elif case=='module':(site/module).write_bytes((site/module).read_bytes()+b'//changed\n')
                elif case in ['inventory','duplicate']:
                    q=root/'docs/SOURCE_INVENTORY.json';d=json.loads(q.read_text('utf-8'))
                    if case=='inventory':d['files'][0]['sha256']='0'*64
                    else:d['files'].append(d['files'][0])
                    q.write_text(json.dumps(d),'utf-8')
                elif case=='source':(site/source).write_bytes(b'{}\n')
                elif case=='missing':(site/source).unlink()
                else:
                    path=packed.delivery_pins(site)[next(iter(packed.TABLE_NAMES))]['gzip']['path']
                    if case=='generated-source':sources[path]=site/source
                    else:runtime.append({'path':path})
                with self.assertRaises((ValueError,FileNotFoundError)):approved.approved_trident_manual_delivery(root,contract,sources,runtime)

    def test_duplicate_json_and_finite_byte_budget_fail(self):
        root,site,source,module,contract,sources,body=self.fixture(b'{"x":1,"x":2}\n')
        with self.assertRaises(ValueError):packed.build_trident_manual_delivery_bodies(site)
        root,site,source,module,contract,sources,body=self.fixture()
        code=(site/module).read_text('utf-8');head=code.splitlines()[0];data=json.loads(head[len('const packedDelivery='):-1])
        for size in [0,-1,True,2*1024*1024+1]:
            copy=json.loads(json.dumps(data));copy[next(iter(copy))][0]=size
            (site/module).write_text('const packedDelivery='+json.dumps(copy,separators=(',',':'))+';\n'+packed.PACKED_DELIVERY_RECIPE+'\n','utf-8')
            with self.assertRaises(ValueError):packed.delivery_pins(site)

if __name__=='__main__':unittest.main()
