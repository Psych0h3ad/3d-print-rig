"""Run all independent source regressions with bounded parallel workers."""
from pathlib import Path
import concurrent.futures,datetime,hashlib,json,subprocess,sys,argparse,time
ROOT=Path(__file__).resolve().parents[1]

def regression_inputs(root):
    """Raw inputs, including producers and newly added/deleted source files."""
    suffixes={'.json','.html','.css','.js','.mjs','.py','.yml','.yaml'}
    return {p.relative_to(root).as_posix():hashlib.sha256(p.read_bytes()).hexdigest()
            for directory in ('site','scripts','.github/workflows')
            for p in sorted((root/directory).rglob('*'))
            if p.is_file() and p.suffix in suffixes}

def changed_inputs(before,after):
    return sorted(n for n in before.keys()|after.keys() if before.get(n)!=after.get(n))
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--workers',type=int,default=4);parser.add_argument('--report',type=Path);args=parser.parse_args()
    if not 1<=args.workers<=8:raise SystemExit('workers must be between 1 and 8')
    before=regression_inputs(ROOT)
    started_at=datetime.datetime.now(datetime.timezone.utc).isoformat()
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
    changed=changed_inputs(before,regression_inputs(ROOT))
    report=dict(all_passed=all(r['passed']for r in rows)and not changed,workers=args.workers,tests=len(rows),
                started_at_utc=started_at,completed_at_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                source_input_sha256=before,source_changed_during_run=changed,
                scope='Source/fixture regressions; actual exported-model and browser reviews are separate required checks.',results=rows)
    if args.report:args.report.write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
    if not report['all_passed']:raise SystemExit('Machine regressions failed'+(': source changed during run: '+', '.join(changed)if changed else ''))
    print(f'All {len(rows)} independent regressions passed with {args.workers} workers.',flush=True)
if __name__=='__main__':main()
