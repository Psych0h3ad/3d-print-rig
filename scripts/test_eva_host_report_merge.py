"""Coverage/identity fixtures for report aggregation, not a geometry assay."""
from copy import deepcopy
from check_eva_options_release import merge_host_reports

registry={'hosts':{m:{'model_sha256':m*64,'manifest_sha256':'1'*64,'profile_sha256':'2'*64,'configurations':[m+'0',m+'1']} for m in ['a','b']},
          'variants':[{'id':m+str(i),'machine_id':m} for m in ['a','b'] for i in [0,1]]}
reports=[]
for m in registry['hosts']:
    reports.append({'passed':True,'production_code_sha256':{'loader':'3'*64},'input_sha256':{'registry':'4'*64},
        'source_artifacts':[{'sha256':'5'*64}],'hosts':[{'machine_id':m,**registry['hosts'][m],
        'configurations':[{'id':m+str(i)} for i in [0,1]]}],
        'coverage':{'registered_hosts':['a','b'],'registered_variants':['a0','a1','b0','b1'],
                    'selected_hosts':[m],'reviewed_variants':[m+'0',m+'1']}})
assert merge_host_reports(registry,reports)['host_shards']==2
bad=[]
bad.append(reports[:1])
bad.append([reports[0],reports[0]])
for change in ['failed','code','input','source','variant','result','model','selection']:
    rows=deepcopy(reports)
    if change=='failed':rows[1]['passed']=False
    if change=='code':rows[1]['production_code_sha256']={}
    if change=='input':rows[1]['input_sha256']={}
    if change=='source':rows[1]['source_artifacts']=[]
    if change=='variant':rows[1]['coverage']['reviewed_variants'].pop()
    if change=='result':rows[1]['hosts'][0]['configurations'].pop()
    if change=='model':rows[1]['hosts'][0]['model_sha256']='0'*64
    if change=='selection':rows[1]['coverage']['selected_hosts']=['missing']
    bad.append(rows)
for rows in bad:
    try:merge_host_reports(registry,rows)
    except ValueError:pass
    else:raise AssertionError('Incomplete or changed shard accepted')
print('EVA host report merge: complete disjoint coverage accepted; 10 missing/duplicate/stale/failed cases rejected. No models loaded.')
