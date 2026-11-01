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
GENERAL = 'Choose a printer, combine toolheads, hotends, extruders and Mods, and compare the assembled model in 3D. Save and share configurations, export images and download available STEP assemblies.'
PAGES = {'viewer/source-map.html': ('Source part map · 3D Print Rig',
                         'Explore VORON V2.4 and Trident source parts in their default assemblies. Search native components, focus in 3D, open related manual chapters and save review progress.'),
 'layout/index.html': ('Layout planner · 3D Print Rig',
                          'Plan a room for your 3D printers. Import an SVG outline or draw the room, add desks and shelves, then arrange printers and export an image.'),
 'viewer/privacy.html': ('Privacy and cookies · 3D Print Rig',
                         'How 3D Print Rig handles optional analytics, cookies, public usage statistics and privacy requests.'),
 'viewer/machines.html': ('3D printer gallery · 3D Print Rig',
                          'Choose a 3D printer by model and size. Open its 3D viewer from the thumbnail gallery.'),
 'index.html': ('3D Print Rig · Plan your next build',
                'Explore 3D printers, compare toolheads and Mods, and plan your workspace. A browser workbench for printer configurations, components and room layouts.'),
 'viewer/index.html': ('3D Print Rig · 3D printer CAD configurator',
                       'Choose a printer, combine toolheads, hotends, extruders and Mods, and compare the assembled '
                       'model in 3D. Save and share configurations, export images and download available STEP '
                       'assemblies.'),
 'viewer/trident.html': ('VORON Trident configurator · 3D Print Rig',
                         'Choose a VORON Trident size, gantry and toolhead. Compare part combinations in 3D, change '
                         'colors and find available STEP assemblies.'),
 'viewer/v24.html': ('VORON V2.4 configurator · 3D Print Rig',
                     'Choose a VORON V2.4 size, gantry and toolhead. Compare part combinations in 3D, change colors '
                     'and find available STEP assemblies.'),
 'viewer/v24-reference.html': ('VORON V2.4 CAD assemblies · 3D Print Rig',
                               'View VORON V2.4 assemblies by vendor and size. Choose a toolhead, change colors and '
                               'compare the model in 3D.'),
 'viewer/v0.html': ('VORON V0 configurator · 3D Print Rig',
                    'View VORON V0 printers and Mods in 3D. Change colors, preview movement and follow the official '
                    'V0.2 and V0.2r1 assembly steps.'),
 'viewer/toolheads.html': ('3D printer toolhead builder · 3D Print Rig',
                           'Choose a toolhead, hotend, extruder, probe and mounting option. Compare the assembled head '
                           'in 3D and find options for your printer.'),
 'viewer/stealthburner-cutaway.html': ('Inside Stealthburner · 3D Print Rig',
                                     'Cut through the filament path of Stealthburner and Clockwork 2. See how the V6 heater, nozzle, heatbreak, heatsink and 4010 cooling fan work together.'),
 'viewer/gantries.html': ('3D printer gantries · 3D Print Rig',
                          'Compare printer gantries in 3D. Choose a printer family, size, belt width and toolhead.'),
 'viewer/toolchangers.html': ('3D printer toolchangers · 3D Print Rig',
                              'View toolchanger heads, shuttles and docks in 3D. Compare their parts and mounting '
                              'options.'),
 'viewer/cleaning.html': ('Nozzle cleaning mods · 3D Print Rig',
                          'View nozzle wipers and cleaning Mods in 3D. Compare parts and find their original project '
                          'files.'),
 'viewer/components.html': ('3D printer component CAD · 3D Print Rig',
                            'View individual printer parts in 3D. Find the original CAD, project version and license '
                            'for each component.'),
 'viewer/community.html': ('Community 3D printer CAD · 3D Print Rig',
                           'View community 3D printer assemblies in your browser. Change colors, look around the model '
                           'and preview movement where available.'),
 'viewer/annex.html': ('Annex printer CAD · 3D Print Rig',
                       'View Annex 3D printer assemblies in your browser. Change colors, look around the model and use '
                       'the available motion controls.'),
 'viewer/crossant.html': ('Crossant-235 printer CAD · 3D Print Rig',
                          'View the Crossant-235 printer in 3D. Compare covers, change colors and preview movement.'),
 'viewer/custom-voron.html': ('Custom VORON sizes · 3D Print Rig',
                              'Compare custom VORON sizes in 3D, including larger builds and reduced heights. See the '
                              'dimensions and recommended frame and mechanism upgrades.'),
 'viewer/e3ng.html': ('E3NG printer CAD · 3D Print Rig',
                      'View available E3NG printer CAD and toolchanger configurations in 3D. Find their original files '
                      'and included components.'),
 'viewer/kit-reference.html': ('FYSETC kit CAD references · 3D Print Rig',
                               'Find available FYSETC kit CAD and source files. Open the available printer models in '
                               'the 3D viewer.'),
 'viewer/micron.html': ('Micron and Micron Plus CAD · 3D Print Rig',
                        'View Micron and Micron Plus printers in 3D. Change colors, preview movement and download '
                        'available standard STEP assemblies.'),
 'viewer/positron.html': ('Positron folding printer CAD · 3D Print Rig',
                          'View the Positron printer in 3D. Try the folding preview, change colors and find the '
                          'original project files.'),
 'viewer/ratrig.html': ('Rat Rig V-Core CAD · 3D Print Rig',
                        'View Rat Rig V-Core printer assemblies in 3D. Change colors, preview movement and find the '
                        'original CAD files.'),
 'viewer/remorph.html': ('Remorph printer CAD · 3D Print Rig',
                         'View the Remorph printer in 3D. Change colors, preview movement and find the original '
                         'project files.'),
 'support/index.html': ('Combination support · 3D Print Rig',
                        'Find toolhead and part combinations for your printer. Filter by component and open a matching '
                        '3D configuration.'),
 'fun/index.html': ('CAD drawing wallpapers · 3D Print Rig',
                    'Download printer CAD wallpapers for phones and desktops. Browse assembly, exploded and section '
                    'drawings.'),
 'fun/credits.html': ('Original CAD and artwork credits · 3D Print Rig',
                      'Original authors, project versions and licenses for the printer CAD wallpapers.'),
 'viewer/art/credits.html': ('CAD background drawing credits · 3D Print Rig',
                             'Original CAD sources and licenses for the printer drawings used in the viewer '
                             'background.'),
 'embed/index.html': ('Embedded CAD viewer · 3D Print Rig',
                      'Embed a 3D Print Rig viewer on your website. Alpha test; open the full viewer for configuration '
                      'controls and source details.')}
START = '<!-- Generated SEO: scripts/build_seo.py -->'
END = '<!-- End generated SEO -->'
IMAGE_ALT = '3D Print Rig, a browser CAD configurator, alongside original VORON Trident technical drawings.'


def canonical(name):
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
    urls = sorted({canonical(name) for name in PAGES if name != 'embed/index.html'})
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
    print(f'{len(PAGES)} pages / {len(PAGES) - 1} sitemap URLs: ' + ('checked' if args.check else 'updated'))


if __name__ == '__main__':
    main()
