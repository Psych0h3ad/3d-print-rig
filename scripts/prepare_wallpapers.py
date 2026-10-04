"""Prepare public wallpaper previews and release downloads from a verified collection.

Only PNGs, author credits and licenses enter the downloads. Local CAD paths,
render diagnostics and working geometry are deliberately not publication inputs.
"""
import argparse,hashlib,html,json,shutil,zipfile
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
TAG='wallpapers-2026-10-05'
URL=f'https://github.com/Psych0h3ad/3d-print-rig/releases/download/{TAG}/'
def main():
    p=argparse.ArgumentParser();p.add_argument('--collection',type=Path,required=True);p.add_argument('--release-output',type=Path,required=True);a=p.parse_args()
    source=a.collection.resolve();out=a.release_output.resolve();out.mkdir(parents=True,exist_ok=True)
    target=ROOT/'site/fun';(target/'previews').mkdir(parents=True,exist_ok=True)
    rows=json.loads((source/'collection-manifest.json').read_text(encoding='utf-8'))['wallpapers'];assert len(rows)==243
    public=[];records=[];license_files={}
    for volume in [source,source/'vol-02']:
        for path in (volume/'source/licenses').rglob('*'):
            if path.is_file():
                rel='licenses/'+path.relative_to(volume/'source/licenses').as_posix()
                if rel in license_files:assert path.read_bytes()==license_files[rel].read_bytes()
                license_files[rel]=path
    for row in rows:
        png=source/row['file'];assert hashlib.sha256(png.read_bytes()).hexdigest()==row['sha256']
        name=png.name;shutil.copyfile(png,out/name)
        with Image.open(source/row['preview']) as im:
            im.thumbnail((850,850),Image.Resampling.LANCZOS);im.save(target/'previews'/(row['id']+'.webp'),'WEBP',quality=87,method=6)
        public.append({k:row[k] for k in ['id','series','no','subject','title','kind','palette','format','width','height','bytes','sha256','sources']}|{'preview':'previews/'+row['id']+'.webp','download':URL+name})
        records.append({'name':name,'bytes':png.stat().st_size,'sha256':row['sha256']})
    sources={}
    for volume in [source,source/'vol-02']:
        for item in json.loads((volume/'source/catalog-sources.json').read_text(encoding='utf-8')):
            sources[item['id']]={k:item[k] for k in ['id','label','url','license','notice'] if k in item}
    entries=[]
    for item in sources.values():
        links=' '.join(f'<a href="{html.escape(name)}">{html.escape(Path(name).name)}</a>' for name in license_files if '/'+item['id']+'/' in name)
        entries.append(f'<li><h2>{html.escape(item.get("label",item["id"]))}</h2><a href="{html.escape(item["url"])}">Original CAD / Author</a><p>{html.escape(item.get("license","Original component terms apply"))}</p><p>{html.escape(item.get("notice",""))}</p>{links}</li>')
    credits='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Original CAD credits</title><style>body{max-width:860px;margin:auto;padding:40px 22px;background:#142128;color:#dfebea;font:16px/1.7 system-ui}a{color:#b9d9d8}li{margin:30px 0}h2{font-size:20px}</style><a href="index.html">Just for fun</a><h1>Original CAD / Credits</h1><p>Drawings derived from actual CAD. Individual author and component terms apply; no blanket license is assigned. Keep these credits and original notices with redistributed files.</p><p>Exploded views use illustrative spacing. Sections pass through the measured filament axis; Sphinx contains printed parts only and YUDX has no hotend in the selected assembly. V2.4 rear-panel exhaust openings are corrected to the native 147 mm width. These are illustrations, not manufacturing drawings.</p><ul>'+''.join(entries)+'</ul></html>'
    (target/'credits.html').write_text(credits,encoding='utf-8')
    for name,path in license_files.items():
        dest=target/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(path,dest)
    manifest={'version':1,'release':TAG,'wallpapers':public,'packs':[]}
    for fmt in ['all','phone','desktop','ultrawide']:
        subset=public if fmt=='all' else [r for r in public if r['format']==fmt]
        name=f'technical-studies-{fmt}-{len(subset)}.zip'
        with zipfile.ZipFile(out/name,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
            for row in subset:z.write(out/Path(row['download']).name,'wallpapers/'+Path(row['download']).name)
            z.writestr('credits.html',credits.replace('<a href="index.html">Just for fun</a>',''))
            z.writestr('manifest.json',json.dumps({'wallpapers':subset},ensure_ascii=False,indent=2))
            for rel,path in license_files.items():z.write(path,rel)
            z.writestr('README.txt','TECHNICAL STUDIES / 3D PRINT RIG\nOriginal-resolution PNG wallpapers from native CAD.\nRead credits.html and licenses/ before redistribution.\nhttps://psych0h3ad.github.io/3d-print-rig/fun/\n')
        with zipfile.ZipFile(out/name) as z:assert z.testzip() is None
        record={'name':name,'bytes':(out/name).stat().st_size,'sha256':hashlib.sha256((out/name).read_bytes()).hexdigest()};records.append(record)
        manifest['packs'].append({'format':fmt,'count':len(subset),'download':URL+name,**record})
    (target/'wallpapers.json').write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    (out/'READY.json').write_text(json.dumps({'tag':TAG,'records':records},indent=2),encoding='utf-8')
    print(json.dumps({'wallpapers':len(public),'release_assets':len(records),'preview_bytes':sum(p.stat().st_size for p in (target/'previews').glob('*'))}))
if __name__=='__main__':main()
