"""Run all independent source regressions with bounded parallel workers."""
from pathlib import Path
import concurrent.futures,json,subprocess,sys,argparse,time
ROOT=Path(__file__).resolve().parents[1]
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--workers',type=int,default=4);parser.add_argument('--report',type=Path);args=parser.parse_args()
    if not 1<=args.workers<=8:raise SystemExit('workers must be between 1 and 8')
    tasks=[['node',str(p)]for p in sorted((ROOT/'scripts').glob('test_*.mjs'))]
    tasks.extend([['node',str(ROOT/'scripts/check_machine_coverage.mjs')],[sys.executable,str(ROOT/'scripts/test_build_evidence.py')]])
    def run(command):
        start=time.monotonic();result=subprocess.run(command,cwd=ROOT,capture_output=True,text=True,encoding='utf8',errors='replace')
        return dict(test=Path(command[-1]).name,passed=result.returncode==0,seconds=round(time.monotonic()-start,3),output=(result.stdout+result.stderr).strip())
    rows=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers)as pool:
        for row in pool.map(run,tasks):
            rows.append(row);print(('PASS 'if row['passed']else'FAIL ')+row['test'],flush=True)
            if not row['passed']:print(row['output'],flush=True)
    report=dict(all_passed=all(r['passed']for r in rows),workers=args.workers,tests=len(rows),scope='Source/fixture regressions; actual exported-model and browser reviews are separate required checks.',results=rows)
    if args.report:args.report.write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
    if not report['all_passed']:raise SystemExit('Machine regressions failed')
    print(f'All {len(rows)} independent regressions passed with {args.workers} workers.',flush=True)
if __name__=='__main__':main()
