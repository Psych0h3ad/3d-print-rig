"""Maintain crawlable page metadata and a sitemap without loading CAD or JavaScript."""
from pathlib import Path
import argparse
import base64
import hashlib
import html
import json
import re

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'site'
BASE = 'https://psych0h3ad.github.io/3d-print-rig/'
GENERAL = 'Explore 3D printer, toolhead and gantry configurations in your browser. Compare registered CAD combinations, customize colors and download available standard STEP assemblies.'
PAGES = {
    'viewer/machines.html': ('3D printer gallery · 3D Print Rig', 'Choose a 3D printer from the CAD thumbnail gallery. Browse registered models by family and size, then open their interactive configuration viewers.'),
    'index.html': ('3D Print Rig · 3D printer CAD configurator', GENERAL),
    'viewer/index.html': ('3D Print Rig · 3D printer CAD configurator', GENERAL),
    'viewer/trident.html': ('VORON Trident configurator · 3D Print Rig', 'Explore VORON Trident CAD, registered toolheads, gantries and mods. Compare colors and motion previews, and find available standard STEP assemblies.'),
    'viewer/v24.html': ('VORON V2.4 configurator · 3D Print Rig', 'Explore VORON V2.4 CAD, registered toolheads, gantries and mods. Compare colors and motion previews, and find available standard STEP assemblies.'),
    'viewer/v24-reference.html': ('VORON V2.4 CAD assemblies · 3D Print Rig', 'Inspect VORON V2.4 assemblies by vendor and size, with registered toolhead combinations, colors, motion previews and original source notices.'),
    'viewer/v0.html': ('VORON V0 configurator · 3D Print Rig', 'Inspect VORON V0 CAD, registered mods, colors and motion previews. Review original versions, assembly scope and available standard downloads.'),
    'viewer/toolheads.html': ('3D printer toolhead builder · 3D Print Rig', 'Compare registered toolheads, hotends, extruders, probes and mounting options in 3D. Review companion parts and installation limitations before choosing a configuration.'),
    'viewer/gantries.html': ('3D printer gantries · 3D Print Rig', 'Inspect registered gantry CAD assemblies, belt widths and mounting options. Compare original sources and the scope of each configuration.'),
    'viewer/toolchangers.html': ('3D printer toolchangers · 3D Print Rig', 'Explore registered toolchanger heads, shuttles and dock assemblies in 3D. Review their source versions, included components and installation limitations.'),
    'viewer/cleaning.html': ('Nozzle cleaning mods · 3D Print Rig', 'Explore nozzle wiper and cleaning mod CAD. Inspect source parts and registered installations, with original versions, licenses and review scope.'),
    'viewer/components.html': ('3D printer component CAD · 3D Print Rig', 'Browse original 3D printer component CAD, inspect individual parts and find source versions and licenses. Component previews have separate installation review scopes.'),
    'viewer/community.html': ('Community 3D printer CAD · 3D Print Rig', 'Explore community printer assemblies in 3D, compare colors and inspect registered motion previews. Original versions, missing parts and review limitations remain visible.'),
    'viewer/annex.html': ('Annex printer CAD · 3D Print Rig', 'Explore registered Annex printer CAD assemblies, colors and available motion previews, with original source versions and review limitations.'),
    'viewer/crossant.html': ('Crossant-235 printer CAD · 3D Print Rig', 'Explore Crossant-235 CAD, covers, colors and registered motion previews. Review original source data and the scope of unfinished installations.'),
    'viewer/custom-voron.html': ('Custom VORON sizes · 3D Print Rig', 'Inspect enlarged and reduced-height VORON CAD references. Compare sizes, colors and registered motion previews, with scaling and mechanism upgrade notices.'),
    'viewer/e3ng.html': ('E3NG printer CAD · 3D Print Rig', 'Inspect E3NG printer assemblies and registered changer configurations in 3D, with original source versions, included components and review scope.'),
    'viewer/kit-reference.html': ('FYSETC kit CAD references · 3D Print Rig', 'Browse registered FYSETC printer kit CAD references and source information. Unavailable CAD and unverified installations are identified separately.'),
    'viewer/micron.html': ('Micron and Micron Plus CAD · 3D Print Rig', 'Explore Micron and Micron Plus printer CAD, colors, registered motion previews and available standard STEP assemblies, with original source notices.'),
    'viewer/positron.html': ('Positron folding printer CAD · 3D Print Rig', 'Inspect Positron printer CAD, colors and the registered folding preview. Review original source versions, component notices and motion limitations.'),
    'viewer/ratrig.html': ('Rat Rig V-Core CAD · 3D Print Rig', 'Explore registered Rat Rig V-Core printer assemblies, colors and motion previews in 3D, with original CAD versions, licenses and review scope.'),
    'viewer/remorph.html': ('Remorph printer CAD · 3D Print Rig', 'Inspect the registered Remorph printer CAD assembly, colors and motion preview, with original source information and installation limitations.'),
    'support/index.html': ('Combination support · 3D Print Rig', 'Find registered printer and toolhead combinations, filter their component options and open matching 3D configurations. Check installation limitations and unavailable CAD.'),
    'fun/index.html': ('CAD drawing wallpapers · 3D Print Rig', 'Download technical drawing wallpapers derived from actual printer CAD. Explore phone and desktop artwork, original authors, source versions and credits.'),
    'fun/credits.html': ('Original CAD and artwork credits · 3D Print Rig', 'Find original authors, CAD versions and licenses for the 3D Print Rig technical drawing collection. Individual designs retain their original terms.'),
    'viewer/art/credits.html': ('CAD background drawing credits · 3D Print Rig', 'Find original CAD sources, versions, licenses and reproduction details for the technical drawings used in the 3D Print Rig viewer background.'),
    'embed/index.html': ('Embedded CAD viewer · 3D Print Rig', 'Alpha test of the embedded 3D Print Rig CAD viewer. Open the full viewer to inspect registered configurations, sources and review limitations.'),
}
START = '<!-- Generated SEO: scripts/build_seo.py -->'
END = '<!-- End generated SEO -->'
IMAGE_ALT = '3D Print Rig, a browser CAD configurator, alongside original VORON Trident technical drawings.'


def canonical(name):
    name = 'viewer/index.html' if name == 'index.html' else name
    return BASE + (name[:-10] if name.endswith('index.html') else name)


def metadata(name, image_url):
    title, description = PAGES[name]
    url = canonical(name)
    esc = lambda value: html.escape(value, quote=True)
    rows = [START, f'<title>{esc(title)}</title>']
    values = {
        'description': description,
        'robots': 'noindex,follow' if name == 'embed/index.html' else 'index,follow,max-image-preview:large',
        'twitter:card': 'summary_large_image',
        'twitter:title': title,
        'twitter:description': description,
        'twitter:image': image_url,
        'twitter:image:alt': IMAGE_ALT,
    }
    rows.extend(f'<meta name="{key}" content="{esc(value)}">' for key, value in values.items())
    values = {'og:type': 'website', 'og:site_name': '3D Print Rig', 'og:title': title,
              'og:description': description, 'og:url': url, 'og:locale': 'en_US',
              'og:image': image_url, 'og:image:type': 'image/png',
              'og:image:width': '1200', 'og:image:height': '630', 'og:image:alt': IMAGE_ALT}
    rows.extend(f'<meta property="{key}" content="{esc(value)}">' for key, value in values.items())
    rows += [f'<link rel="canonical" href="{url}">', f'<link rel="sitemap" type="application/xml" href="{BASE}sitemap.xml">']
    schema = {'@context': 'https://schema.org', '@type': 'WebPage', '@id': url + '#page',
              'name': title, 'description': description, 'url': url, 'inLanguage': 'en',
              'isPartOf': {'@type': 'WebSite', '@id': BASE + '#website', 'name': '3D Print Rig', 'url': BASE}}
    if name in ('index.html', 'viewer/index.html'):
        schema['mainEntity'] = {'@type': 'WebApplication', '@id': BASE + 'viewer/#application',
                                'name': '3D Print Rig', 'url': BASE + 'viewer/',
                                'applicationCategory': 'DesignApplication', 'operatingSystem': 'Web browser',
                                'isAccessibleForFree': True, 'description': GENERAL}
    rows += ['<script type="application/ld+json">' + json.dumps(schema, ensure_ascii=True, separators=(',', ':')).replace('<', '\\u003c') + '</script>', END]
    return '\n'.join(rows)


def update_page(text, name, image_url):
    text = text.replace('\r\n', '\n')
    # Two legacy credit pages used an implicit head. Make their head explicit.
    if not re.search(r'<head\b', text, re.I):
        text = re.sub(r'(<html\b[^>]*>)', r'\1\n<head>', text, count=1, flags=re.I)
        style = list(re.finditer(r'</style\s*>', text, re.I))
        if not style:
            raise ValueError('No safe implicit-head boundary: ' + name)
        pos = style[-1].end()
        text = text[:pos] + '\n</head>\n<body>' + text[pos:]
        text = re.sub(r'</html\s*>', '</body></html>', text, count=1, flags=re.I) if re.search(r'</html\s*>', text, re.I) else text + '\n</body>\n</html>\n'
    start = re.search(r'<head\b[^>]*>', text, re.I).end()
    end = re.search(r'</head\s*>', text, re.I).start()
    head = text[start:end]
    head = re.sub(re.escape(START) + r'.*?' + re.escape(END) + r'\n?', '', head, flags=re.S)
    head = re.sub(r'<title\b[^>]*>.*?</title>\n?', '', head, flags=re.S | re.I)
    head = re.sub(r'<meta\b[^>]*(?:name|property)=["\'](?:description|robots|og:[^"\']+|twitter:[^"\']+)["\'][^>]*>\n?', '', head, flags=re.I)
    head = re.sub(r'<link\b[^>]*rel=["\'](?:canonical|sitemap)["\'][^>]*>\n?', '', head, flags=re.I)
    charset = re.search(r'<meta\b[^>]*charset=[^>]+>', head, re.I)
    if not charset:
        raise ValueError('Missing charset: ' + name)
    pos = charset.end()
    head = head[:pos] + '\n' + metadata(name, image_url) + '\n' + head[pos:].lstrip('\n')
    return text[:start] + head + text[end:]


def preview_svg():
    image = base64.b64encode((SITE / 'fun/previews/03-trident-paper-3840x2160.webp').read_bytes()).decode('ascii')
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="{IMAGE_ALT}">
<rect width="1200" height="630" fill="#eeece4"/>
<g font-family="Arial, sans-serif" fill="#20343b">
<rect x="54" y="48" width="46" height="46" rx="5" fill="#20343b"/>
<text x="77" y="78" text-anchor="middle" font-size="19" font-weight="700" fill="#eeece4">PR</text>
<text x="116" y="77" font-size="19" letter-spacing="2.4">3D PRINT RIG</text>
<path d="M54 151h46" stroke="#b7633f" stroke-width="4"/>
<text x="50" y="253" font-size="76" font-weight="700" letter-spacing="-3">3D Print</text>
<text x="50" y="336" font-size="76" font-weight="700" letter-spacing="-3">Rig</text>
<text x="54" y="398" font-size="24">Explore your next build.</text>
<text x="54" y="436" font-size="18" fill="#58696c">Printers · Toolheads · Gantries</text>
<image x="465" y="102" width="718" height="404" href="data:image/webp;base64,{image}"/>
<path d="M54 532h1092" stroke="#c6cbc7"/>
<text x="54" y="579" font-size="18">Free browser-based CAD viewer</text>
<text x="1146" y="579" font-size="15" text-anchor="end" fill="#58696c">Original CAD: VoronDesign · GPL-3.0</text>
</g></svg>'''


def outputs():
    discovered = {p.relative_to(SITE).as_posix() for p in SITE.rglob('*.html') if 'licenses' not in p.relative_to(SITE).parts}
    if discovered != set(PAGES):
        raise ValueError('Register every public HTML page: ' + repr(sorted(discovered ^ set(PAGES))))
    image = SITE / 'assets/social/3d-print-rig-preview.png'
    if not image.is_file():
        raise ValueError('Render assets/social/preview.svg at 1200 x 630 before generating metadata')
    digest = hashlib.sha256(image.read_bytes()).hexdigest()[:20]
    image_url = BASE + 'assets/social/3d-print-rig-preview.png?v=' + digest
    result = {SITE / name: update_page((SITE / name).read_text(encoding='utf8'), name, image_url) for name in PAGES}
    urls = sorted({canonical(name) for name in PAGES if name not in ('index.html', 'embed/index.html')})
    result[SITE / 'sitemap.xml'] = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + ''.join(f'  <url><loc>{url}</loc></url>\n' for url in urls) + '</urlset>\n'
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--preview-source', action='store_true')
    args = parser.parse_args()
    if args.preview_source:
        target = SITE / 'assets/social/preview.svg'
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(preview_svg(), encoding='utf8', newline='\n')
        print('Preview source ready for 1200 x 630 rendering')
        return
    result = outputs()
    changed = [path for path, value in result.items() if not path.is_file() or path.read_text(encoding='utf8') != value]
    if args.check:
        if changed:
            raise SystemExit('Stale SEO metadata: ' + ', '.join(path.relative_to(ROOT).as_posix() for path in changed))
    else:
        for path, value in result.items():
            path.write_text(value, encoding='utf8', newline='\n')
    print(f'{len(PAGES)} pages / {len(PAGES) - 2} sitemap URLs: ' + ('checked' if args.check else 'updated'))


if __name__ == '__main__':
    main()
