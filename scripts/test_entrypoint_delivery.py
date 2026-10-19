import gzip
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from check_entrypoint_delivery import verify

class EntrypointDelivery(unittest.TestCase):
    def test_existing_page_reference_download_cannot_disappear(self):
        with tempfile.TemporaryDirectory() as folder:
            site = Path(folder); (site/'viewer').mkdir()
            (site/'viewer/micron.html').write_text('<a href="../MICRON_LDO_REFERENCE.json?download=1">Kit reference</a>')
            with self.assertRaisesRegex(ValueError, 'MICRON_LDO_REFERENCE.json'): verify(site)
            # A compressed sibling cannot satisfy a direct HTML download link.
            (site/'MICRON_LDO_REFERENCE.json.gz').write_bytes(gzip.compress(b'{}', mtime=0))
            with self.assertRaisesRegex(ValueError, 'MICRON_LDO_REFERENCE.json'): verify(site)
            (site/'MICRON_LDO_REFERENCE.json').write_text('{"exact_ldo_kit_assembly":false}')
            self.assertTrue(verify(site)['passed'])

    def test_default_lighting_model_is_required_even_without_an_asset_catalog(self):
        with tempfile.TemporaryDirectory() as folder:
            site=Path(folder);(site/'viewer').mkdir()
            (site/'viewer/lighting.js').write_text('export const lighting=true;')
            (site/'DISCO_MOD.json').write_text('{}')
            with self.assertRaisesRegex(ValueError,'missing required default model'):verify(site)
            (site/'Disco_on_a_Stick_XXL_350.glb.gz').write_bytes(gzip.compress(bytes(range(256))*16,mtime=0))
            self.assertTrue(verify(site)['passed'])

    def test_missing_catalog_and_registered_leaves_are_actual_build_failures(self):
        with tempfile.TemporaryDirectory() as folder:
            site = Path(folder)
            (site/'viewer').mkdir()
            (site/'viewer/toolchangers.js').write_text("fetch('../TOOLCHANGER_CONFIGURATIONS.json?v=1')")
            with self.assertRaisesRegex(ValueError, 'missing required catalog'): verify(site)
            catalog = site/'TOOLCHANGER_CONFIGURATIONS.json'
            catalog.write_text(json.dumps({'assets': {'changer': {'meta': 'modules/changer.json', 'glb': 'modules/changer.glb'}}}))
            with self.assertRaisesRegex(ValueError, 'missing registered'): verify(site)
            (site/'modules').mkdir()
            (site/'modules/changer.json').write_text('{"parts":[{"key":"one"}]}')
            with self.assertRaisesRegex(ValueError, 'missing registered glb'): verify(site)
            (site/'modules/changer.glb.gz').write_bytes(gzip.compress(b'Actual transport fixture\0'*4096,mtime=0))
            result = verify(site)
            self.assertTrue(result['passed'])
            self.assertEqual(result['registered_local_leaves'],2)
            self.assertEqual(result['required_root_catalogs'],1)

    def test_external_delivery_requires_exact_stored_and_decoded_bodies(self):
        with tempfile.TemporaryDirectory() as folder:
            site=Path(folder);(site/'viewer').mkdir();(site/'modules').mkdir()
            (site/'viewer/toolchangers.js').write_text("fetch('../TOOLCHANGER_CONFIGURATIONS.json')")
            (site/'TOOLCHANGER_CONFIGURATIONS.json').write_text(json.dumps({'assets':{'changer':{'meta':'modules/changer.json','glb':'modules/changer.glb'}}}))
            (site/'modules/changer.json').write_text('{}')
            decoded=bytes(range(251))*64;stored=gzip.compress(decoded,mtime=0);file=site/'model.asset';file.write_bytes(stored)
            row={'url':'https://raw.githubusercontent.com/Psych0h3ad/3d-print-rig-large-voron-models/'+'a'*40+'/modules/changer.glb.gz','bytes':len(stored),'sha256':hashlib.sha256(stored).hexdigest(),'decoded_bytes':len(decoded),'decoded_sha256':hashlib.sha256(decoded).hexdigest()}
            delivery={'schema':'pinned-model-delivery-v1','commit':'a'*40,'files':{'modules/changer.glb':row}}
            p=site/'viewer/model-delivery.mjs'
            p.write_text('export const externalModelDelivery = '+json.dumps(delivery)+';\n')
            mapping={'files':{'modules/changer.glb.gz':str(file.resolve())}}
            self.assertEqual(verify(site,mapping)['exact_external_models_verified'],1)
            for key,value in [('sha256','0'*64),('decoded_sha256','0'*64),('url',row['url'].replace('raw.githubusercontent.com','example.test'))]:
                broken=json.loads(json.dumps(delivery));broken['files']['modules/changer.glb'][key]=value
                p.write_text('export const externalModelDelivery = '+json.dumps(broken)+';\n')
                with self.assertRaises(ValueError): verify(site,mapping)

if __name__=='__main__':unittest.main()
