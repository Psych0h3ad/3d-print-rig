"""Source/transport/policy controls using the exact approved Python encoder.

The complete actual GLB/controller audit is a separate mandatory release gate.
"""
from pathlib import Path
import base64,json,os,subprocess,tempfile,unittest
from prepare_v0_power_delivery import build_v0_power_delivery_body
from prepare_v0_manual_delivery import build_v0_manual_delivery_bodies

ROOT=Path(__file__).resolve().parents[1]

class PowerSourceRegression(unittest.TestCase):
    def test_exact_received_source_and_policy_controls(self):
        body,_=build_v0_power_delivery_body(ROOT/'site')
        with tempfile.TemporaryDirectory(prefix='v0-power-source-')as folder:
            encoded=Path(folder)/'references.json.gz';encoded.write_bytes(body)
            manual=Path(folder)/'manual.json'
            manual.write_text(json.dumps({Path(pin['path']).name.removesuffix('.json.gz'):base64.b64encode(data).decode('ascii') for data,pin in build_v0_manual_delivery_bodies(ROOT/'site')}),encoding='utf8')
            env=os.environ.copy();env['RIG_MANUAL_REFERENCE_FIXTURE']=str(manual)
            result=subprocess.run(['node','--max-old-space-size=176','--max-semi-space-size=1','--v8-pool-size=1',str(ROOT/'scripts/v0_power_assembly_regression.mjs'),str(encoded)],cwd=ROOT,env=env,capture_output=True,text=True,encoding='utf8',timeout=120)
            self.assertEqual(result.returncode,0,result.stdout+result.stderr)
            print(result.stdout.strip())

if __name__=='__main__':unittest.main()
