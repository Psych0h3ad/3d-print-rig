from pathlib import Path
import hashlib,tempfile,unittest
from check_v0_assembly_release import REQUIRED_STAGE_PROVIDERS,require_stage_provider_pins

class SourcePinTests(unittest.TestCase):
    def test_success_cannot_omit_or_relabel_a_provider(self):
        with tempfile.TemporaryDirectory(prefix='v0-provider-pins-') as folder:
            root=Path(folder).resolve()
            self.assertEqual(root.parent,Path(tempfile.gettempdir()).resolve())
            pins={}
            for index,name in enumerate(REQUIRED_STAGE_PROVIDERS):
                p=root/name;p.parent.mkdir(parents=True,exist_ok=True)
                body=('export const source='+str(index)+';\n').encode();p.write_bytes(body)
                pins[name]=hashlib.sha256(body).hexdigest()
            require_stage_provider_pins({'passed':True,'source_sha256':pins},root)
            for name in REQUIRED_STAGE_PROVIDERS:
                missing={k:v for k,v in pins.items()if k!=name}
                with self.assertRaisesRegex(ValueError,'Missing exact current'):
                    require_stage_provider_pins({'passed':True,'source_sha256':missing},root)
            changed=dict(pins);changed[REQUIRED_STAGE_PROVIDERS[0]]='0'*64
            with self.assertRaisesRegex(ValueError,'Missing exact current'):
                require_stage_provider_pins({'passed':True,'source_sha256':changed},root)
            (root/REQUIRED_STAGE_PROVIDERS[-1]).write_bytes(b'export const source="changed";\n')
            with self.assertRaisesRegex(ValueError,'Missing exact current'):
                require_stage_provider_pins({'passed':True,'source_sha256':pins},root)

if __name__=='__main__':unittest.main()
