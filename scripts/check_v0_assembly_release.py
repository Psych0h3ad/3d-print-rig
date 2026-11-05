from prepare_v0_manual_delivery import read_built_v0_stages
"""Audit each complete V0 in a fresh serial process, retaining every row."""
from pathlib import Path
import argparse,hashlib,json,subprocess,tempfile
ROOT=Path(__file__).resolve().parents[1]
REQUIRED_STAGE_PROVIDERS=tuple('viewer/'+name+'.mjs' for name in (
    'v0-bed-assembly','v0-drive-assembly','v0-electronics-assembly',
    'v0-enclosure-assembly','v0-fan-assembly','v0-feet-assembly',
    'v0-head-assembly','v0-idler-assembly','v0-m2-seating',
    'v0-panel-closure','v0-panel-door','v0-power-assembly',
    'v0-power-references','v0-rail-operations','v0-rail-preparation',
    'v0-spool-assembly','v0-tophat-assembly','v0-xy-preparation'))


def require_stage_provider_pins(report, site):
    """A successful stage result must identify every known source provider."""
    pins=report.get('source_sha256',{})
    for name in REQUIRED_STAGE_PROVIDERS:
        expected=hashlib.sha256((Path(site)/name).read_bytes()).hexdigest()
        if pins.get(name)!=expected:
            raise ValueError('Missing exact current V0 stage provider pin: '+name)

def main():
    p=argparse.ArgumentParser();p.add_argument('--site',type=Path,required=True);p.add_argument('--report',type=Path,required=True);p.add_argument('--map',type=Path);a=p.parse_args()
    a.site=a.site.resolve();a.report=a.report.resolve();a.map=a.map.resolve()if a.map else None
    source,stage_delivery=read_built_v0_stages(a.site);machines=json.loads(source)['machines']
    if set(machines)!={'voron_v02_120','voron_v02r1_120'}:raise ValueError('Both registered V0 assemblies required')
    rows=[]
    with tempfile.TemporaryDirectory(prefix='v0-manual-release-')as folder:
        for mid in machines:
            report=Path(folder)/(mid+'.json')
            subprocess.run(['node','--max-old-space-size=176','--max-semi-space-size=1','--v8-pool-size=1','--experimental-vm-modules',str(ROOT/'scripts/audit_v0_assembly_assets.mjs'),'--site',str(a.site),'--machine',mid,'--report',str(report),*(['--map',str(a.map)]if a.map else[])],cwd=ROOT,check=True,timeout=120)
            row=json.loads(report.read_bytes())
            require_stage_provider_pins(row,a.site)
            if not row.get('passed')or len(row['machines'])!=1 or row['machines'][0]['machine_id']!=mid:raise ValueError('Missing exact V0 assembly: '+mid)
            proof=row['machines'][0].get('manualFasteners',{})
            if proof.get('sourceFasteners')!=8 or not all(proof.get(k)for k in ['controlledEarlierPartDisplayLease','currentFastenersOriginalHardwareMaterial','foreignDisplayReplacementRejected','originalTransformsMaterialsGeometryVisibilityRestored']):raise ValueError('Missing actual source fastener/display audit: '+mid)
            head=row['machines'][0].get('headOwnership',{});display=row['machines'][0].get('headDisplay',{})
            if head.get('operations')!=41 or head.get('originalHeadOperationLeaves')!=86 or head.get('originalSourceCohort')!=(100 if mid=='voron_v02r1_120'else 99):raise ValueError('Missing exact original head/companion operation audit: '+mid)
            if len(display.get('visits',[]))!=3 or display.get('separatePalettes')!=3 or not all(display.get(k)for k in ['originalRestored','originalSourceMaterialsRetained','fullGeometryContentRetained']):raise ValueError('Missing actual current head display/material restoration: '+mid)
            rail=row['machines'][0].get('railOwnership',{})
            if rail.get('operations')!=10 or rail.get('originalScrews')!=40 or not all(rail.get(k)for k in ['allOriginalKeysOnce','upperStopsPage26','lowerStopPage35','topBInFollowingFrameSection','fullPopulationOptionRetained']):raise ValueError('Missing source-backed rail page operations: '+mid)
            rail_display=row['machines'][0].get('railDisplay',{})
            if len(rail_display.get('visits',[]))!=10 or rail_display.get('reverseVisits')!=10 or rail_display.get('visibilityRollback')!=1 or not rail_display.get('originalFramesMaterialsVisibilityRestored'):raise ValueError('Missing actual rail operation lifecycle: '+mid)
            electronics=row['machines'][0].get('electronicsOwnership',{});electronics_display=row['machines'][0].get('electronicsDisplay',{})
            if electronics.get('operations')!=13 or electronics.get('introducedSourceKeys')!=772 or electronics.get('referencedSourceKeys')!=778 or electronics.get('purchasedBoardLeaves')!=740:raise ValueError('Missing original electronics ownership: '+mid)
            if len(electronics_display.get('observations',[]))!=13 or electronics_display.get('operationsReverse')!=13 or electronics_display.get('grayJumps')!=6 or electronics_display.get('separatePalettes')!=3 or electronics_display.get('visibilityFailureCases')!=1 or not all(electronics_display.get(k)for k in ['allSelectedFramesEqualOriginal','allNativeMatricesMaterialsVisibilityRestored','fullGeometryBuffersUnchanged']):raise ValueError('Missing actual electronics lifecycle: '+mid)
            power=row['machines'][0].get('powerOwnership',{});power_display=row['machines'][0].get('powerDisplay',{});transport=row['machines'][0].get('powerTransport',{})
            if power.get('operations')!=13 or power.get('introducedSourceKeys')!=3 or power.get('purchasedControllerLeaves')!=739 or not power.get('exactManualAndSourceOwners'):raise ValueError('Missing original power ownership: '+mid)
            if transport.get('requests')!=1 or transport.get('encodedBytes')!=31361 or transport.get('decodedBytes')!=615743 or transport.get('encodedSHA256')!='2367c37c716689d6fe4107f83feb7a8023dcd5d9ba987f05df0b0331586329b7' or transport.get('decodedSHA256')!='f4b455722cd1878a7de8d6566cd4ab2bd8f5c3f6b5fb0de37625cd468a4ceded' or not transport.get('productionDecoderAndCryptoReceipt'):raise ValueError('Missing actual received power delivery: '+mid)
            if len(power_display.get('observations',[]))!=13 or power_display.get('operationsReverse')!=13 or power_display.get('grayJumps')!=3 or power_display.get('separatePalettes')!=3 or power_display.get('visibilityFailureCases')!=1 or not all(power_display.get(k)for k in ['allSelectedFramesEqualOriginal','allNativeMatricesMaterialsVisibilityRestored','fullGeometryBuffersUnchanged']):raise ValueError('Missing actual power lifecycle: '+mid)
            if power_display.get('physicalFitQualified')is not False or power_display.get('electricalQualified')is not False:raise ValueError('Power reference scope overstated: '+mid)
            manual_data=row['machines'][0].get('manualDataTransport',{});manual_tail=row['machines'][0].get('manualTailOwnership',{})
            if manual_data.get('requests')!=13 or not manual_data.get('productionStreamingDecoderAndCryptoReceipt') or manual_data.get('decodedStageSHA256')!=hashlib.sha256(source).hexdigest() or len(manual_data.get('tables',[]))!=13:
                raise ValueError('Missing exact complete received manual data: '+mid)
            if manual_tail.get('operations')!=95 or manual_tail.get('tables')!=6 or not manual_tail.get('originalMotorScrewIntroducedOnceAtReceiver') or manual_tail.get('physicalFitQualified') is not False:
                raise ValueError('Missing full additional manual/source ownership: '+mid)
            hinge_report = Path(folder)/(mid+'-hinge-source.json')
            subprocess.run(['node','--max-old-space-size=176','--max-semi-space-size=1','--v8-pool-size=1','--experimental-vm-modules',str(ROOT/'scripts/audit_v0_hinge_source_assets.mjs'),'--site',str(a.site),'--machine',mid,'--report',str(hinge_report),*(['--map',str(a.map)]if a.map else[])],cwd=ROOT,check=True,timeout=120)
            hinge = json.loads(hinge_report.read_bytes())
            representation = row['machines'][0].get('hingeRepresentation', {})
            if representation.get('requests') != 2 or not representation.get('productionDecoderAndGeometryGuard') or representation.get('nativeClearanceVerified') is not False or representation.get('physicalFitVerified') is not False:
                raise ValueError('Assembly stages did not consume the mandatory source hinge geometry: '+mid)
            if not hinge.get('passed') or hinge.get('machine_id') != mid or hinge.get('source_parts') != (1678 if mid=='voron_v02r1_120' else 1653) or hinge.get('moving_source_leaves') != 10 or hinge.get('stationary_pivot_leaves') != 2 or hinge.get('stationary_latch_leaves') != (14 if mid=='voron_v02r1_120' else 10):
                raise ValueError('Missing exact source hinge/door ownership gate: '+mid)
            if not all(hinge.get(k) for k in ['original_source_materials_and_frames_preserved','wrong_original_model_rejected','prepare_commit_rollback_preserved_source','mandatory_geometry_receipt_verified','detached_source_owner_rejected','original_source_owner_restored']) or any(hinge.get(k) is not False for k in ['native_clearance_verified','physical_fit_verified','continuous_motion_verified']):
                raise ValueError('Missing strict hinge source receipt/restoration or overstated fit scope: '+mid)
            row['machines'][0]['hingeSource'] = hinge
            layout_visits=[]
            for mode in ['success','fail','abort']:
                layout_report=Path(folder)/(mid+'-layout-'+mode+'.json')
                subprocess.run(['node','--max-old-space-size=176','--max-semi-space-size=1','--v8-pool-size=1',str(ROOT/'scripts/audit_v0_layout_source_assets.mjs'),'--site',str(a.site),'--machine',mid,'--mode',mode,'--report',str(layout_report)],cwd=ROOT,check=True,timeout=120)
                visit=json.loads(layout_report.read_bytes())
                if not visit.get('passed') or visit.get('machine')!=mid or visit.get('mode')!=mode or visit.get('finalHashes')!=1 or visit.get('observedGeometryDisposals',0)<1500:
                    raise ValueError('Missing current V0 Layout identity/resource lifecycle gate: '+mid+'/'+mode)
                if visit.get('physicalFitQualified')is not False or visit.get('browserQualified')is not False:
                    raise ValueError('Layout CPU source gate scope overstated')
                layout_visits.append(visit)
            row['machines'][0]['layoutSourceLifecycle']=layout_visits
            rows.append(row)
    if read_built_v0_stages(a.site)[0]!=source:raise ValueError('Stage source changed between machines')
    result={k:v for k,v in rows[0].items()if k not in {'machines','source_sha256'}};result['machines']=[m for row in rows for m in row['machines']];pins={}
    for row in rows:
        for name,pin in row['source_sha256'].items():
            if name in pins and pins[name]!=pin:raise ValueError('Shared actual audit input changed')
            pins[name]=pin
    result['source_sha256']=pins;result['fresh_serial_machine_processes']=len(rows);result['source_sha256']['viewer/data/v0-assembly-stages.json.gz']=stage_delivery['sha256'];result['decoded_source_sha256']={'V0_ASSEMBLY_STAGES.json':hashlib.sha256(source).hexdigest()}
    a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_text(json.dumps(result,separators=(',',':'))+'\n',encoding='utf8')
    print('V0 assembly release: both complete stock revisions passed in fresh serial processes; sampled source references, not physical fit.')

if __name__=='__main__':main()
