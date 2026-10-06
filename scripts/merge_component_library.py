"""Merge pinned additions without replacing the original bundle catalog."""
import json
from pathlib import Path

def merge_components(target):
    target=Path(target)
    source=target/'COMPONENT_ADDITIONS.json'
    additions=json.loads(source.read_text(encoding='utf8'))
    library_file=target/'COMPONENT_LIBRARY.json'
    library=json.loads(library_file.read_text(encoding='utf8'))
    if additions.get('schema')!='3d-print-rig-components-v1':
        raise ValueError('Invalid component additions schema')
    ids={p['id'] for p in library['items']}
    for item in additions['items']:
        if item['id'] in ids or item['module'] not in additions['assets']:
            raise ValueError('Duplicate or missing component registration')
        ids.add(item['id'])
    if set(library['assets']) & set(additions['assets']):
        raise ValueError('Duplicate component asset')
    library['items'].extend(additions['items'])
    library['assets'].update(additions['assets'])
    library['additions_version']=additions['version']
    library_file.write_text(json.dumps(library,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')
