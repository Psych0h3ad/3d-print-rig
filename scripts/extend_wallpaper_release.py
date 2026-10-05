"""Append reviewed collection sheets without replacing existing download URLs."""
import argparse
import hashlib
import json
import shutil
import zipfile
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]

def digest(path):
    with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()

def main():
    p=argparse.ArgumentParser();p.add_argument('--collection',type=Path,required=True);p.add_argument('--existing-assets',type=Path,required=True);p.add_argument('--release-output',type=Path,required=True);p.add_argument('--tag',required=True);a=p.parse_args()
    site=ROOT/'site/fun';out=a.release_output;out.mkdir(parents=True,exist_ok=True)
    catalog=json.loads((site/'wallpapers.json').read_text(encoding='utf8'))
    additions=json.loads((a.collection/'manifest.json').read_text(encoding='utf8'))
    rows=additions['wallpapers'];assert len(rows)==108 and len({r['series'] for r in rows})==12
    new_ids={r['id'] for r in rows};old=[r for r in catalog['wallpapers'] if r['id'] not in new_ids]
    base=f'https://github.com/Psych0h3ad/3d-print-rig/releases/download/{a.tag}/'
    files={};records=[];new=[]
    for row in old:
        path=a.existing_assets/Path(row['download']).name
        assert path.stat().st_size==row['bytes'] and digest(path)==row['sha256'], row['id']
        files[row['id']]=path
    for row in rows:
        png=a.collection/row['file'];assert png.stat().st_size==row['bytes'] and digest(png)==row['sha256']
        with Image.open(png) as image:
            assert image.size==(row['width'],row['height']) and image.mode=='RGB'
            assert all(pair[0] in image.info['Sources'] for pair in row['sources'])
        target=out/png.name;shutil.copyfile(png,target);files[row['id']]=target
        preview=site/'previews'/(row['id']+'.webp');shutil.copyfile(a.collection/row['preview'],preview)
        public={k:row[k] for k in ['id','series','no','subject','title','kind','palette','format','width','height','bytes','sha256','sources','view_count']}
        public.update(preview='previews/'+preview.name+'?v='+row['sha256'][:12],download=base+png.name)
        new.append(public);records.append({'name':png.name,'bytes':row['bytes'],'sha256':row['sha256']})
    public=old+new
    credits=(site/'credits.html').read_text(encoding='utf8')
    note='<p id="collection-sheets">Collection sheets and repeating patterns retain the same reviewed native-CAD projections. Views use independent scales. Repeated patterns reuse the original views without mirroring. Original authors are named within the artwork; complete source links are stored in PNG metadata, gallery entries and the download manifest.</p>'
    if 'id="collection-sheets"' not in credits:credits=credits.replace('<ul>',note+'<ul>',1)
    (site/'credits.html').write_text(credits,encoding='utf8')
    provenance={'method':'Composition of existing native-BREP hidden-line projections; uniform scale only','inputs':additions['inputs'],'sheets':[{k:r[k] for k in ['id','placements','view_count']} for r in rows]}
    (site/'collection-provenance.json').write_text(json.dumps(provenance,separators=(',',':')),encoding='utf8')
    catalog={'version':1,'release':a.tag,'wallpapers':public,'packs':[]}
    licenses=sorted(p for p in (site/'licenses').rglob('*') if p.is_file())
    for fmt in ['new','all','phone','desktop','ultrawide']:
        subset=new if fmt=='new' else public if fmt=='all' else [r for r in public if r['format']==fmt]
        name=f'technical-studies-{fmt}-{len(subset)}.zip'
        with zipfile.ZipFile(out/name,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
            for row in subset:z.write(files[row['id']],'wallpapers/'+files[row['id']].name)
            z.writestr('credits.html',credits.replace('<a href="index.html">Just for fun</a>',''))
            z.writestr('manifest.json',json.dumps({'wallpapers':subset},ensure_ascii=False,indent=2))
            for path in licenses:z.write(path,path.relative_to(site).as_posix())
            z.writestr('README.txt','TECHNICAL STUDIES / 3D PRINT RIG\nNative-CAD wallpapers. Dimensions belong to filenames, not artwork.\nRead credits.html and the original author licenses before redistribution.\nhttps://psych0h3ad.github.io/3d-print-rig/fun/\n')
        with zipfile.ZipFile(out/name) as z:assert z.testzip() is None
        record={'name':name,'bytes':(out/name).stat().st_size,'sha256':digest(out/name)}
        records.append(record);catalog['packs'].append({'format':fmt,'count':len(subset),'download':base+name,**record})
    (site/'wallpapers.json').write_text(json.dumps(catalog,ensure_ascii=False,separators=(',',':')),encoding='utf8')
    (out/'READY.json').write_text(json.dumps({'tag':a.tag,'records':records,'new_wallpapers':len(new),'total_wallpapers':len(public),'new_designs':12},indent=2),encoding='utf8')
    print(json.dumps({'new':len(new),'total':len(public),'assets':len(records),'preview_bytes':sum(p.stat().st_size for p in (site/'previews').glob('*.webp'))}),flush=True)

if __name__=='__main__':main()
