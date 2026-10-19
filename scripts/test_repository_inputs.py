import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from prepare_repository_inputs import prepare,selected

class RepositoryInputs(unittest.TestCase):
    def test_source_checks_receive_only_exact_registered_inputs(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'site').mkdir();body=root/'pinned.asset';body.write_bytes(b'{"schema":"source input fixture"}\n')
            rows=[]
            for name in ['TOOLCHANGER_CONFIGURATIONS.json','source-assembly-assets/packet.json','assets/machines/source-projection.json','community-machines-assets/switchwire/revision/model.glb.gz','modules/not-needed-by-source-check.glb.gz']:
                rows.append({'path':name,'url':'https://psych0h3ad.github.io/3d-print-rig/'+name,'bytes':body.stat().st_size,'sha256':hashlib.sha256(body.read_bytes()).hexdigest(),'approval_receipt_sha256':'a'*64})
            contract={'schema':'approved-static-delivery-v1','files':rows}
            mapping={'files':{r['path']:str(body.resolve()) for r in rows}}
            result=prepare(root,contract,mapping)
            self.assertEqual(result['verified_source_check_inputs'],4)
            self.assertFalse((root/'site/modules/not-needed-by-source-check.glb.gz').exists())
            self.assertTrue((root/'site/source-assembly-assets/packet.json').is_file())
            self.assertEqual(prepare(root,contract,mapping)['verified_source_check_inputs'],4)
            (root/'site/TOOLCHANGER_CONFIGURATIONS.json').write_bytes(b'wrong source')
            with self.assertRaisesRegex(ValueError,'no overwrite'):prepare(root,contract,mapping)
            self.assertEqual((root/'site/TOOLCHANGER_CONFIGURATIONS.json').read_bytes(),b'wrong source')

    def test_missing_map_is_not_a_download_fallback(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'site').mkdir()
            row={'path':'SOURCE.json','url':'https://psych0h3ad.github.io/3d-print-rig/SOURCE.json','bytes':1,'sha256':'a'*64,'approval_receipt_sha256':'b'*64}
            with self.assertRaisesRegex(ValueError,'Missing source-check input mapping'):prepare(root,{'schema':'approved-static-delivery-v1','files':[row]},{'files':{}})

if __name__=='__main__':unittest.main()
