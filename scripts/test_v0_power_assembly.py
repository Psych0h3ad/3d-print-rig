"""Source/transport/policy controls using the exact approved Python encoder.

The complete actual GLB/controller audit is a separate mandatory release gate.
"""
from pathlib import Path
import subprocess,tempfile,unittest
from prepare_v0_power_delivery import build_v0_power_delivery_body

ROOT=Path(__file__).resolve().parents[1]

class PowerSourceRegression(unittest.TestCase):
    def test_exact_received_source_and_policy_controls(self):
        body,_=build_v0_power_delivery_body(ROOT/'site')
        with tempfile.TemporaryDirectory(prefix='v0-power-source-')as folder:
            encoded=Path(folder)/'references.json.gz';encoded.write_bytes(body)
            result=subprocess.run(['node','--max-old-space-size=176','--max-semi-space-size=1','--v8-pool-size=1',str(ROOT/'scripts/v0_power_assembly_regression.mjs'),str(encoded)],cwd=ROOT,capture_output=True,text=True,encoding='utf8',timeout=120)
            self.assertEqual(result.returncode,0,result.stdout+result.stderr)
            print(result.stdout.strip())

if __name__=='__main__':unittest.main()
