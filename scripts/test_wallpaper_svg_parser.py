"""DTD rejection and unchanged CAD SVG parsing."""
import unittest
import xml.etree.ElementTree as ET
from wallpaper_svg_parser import SVGDeclarationsForbidden, parse_svg_document

NS = 'http://www.w3.org/2000/svg'
NORMAL = ('<?xml version="1.0" encoding="UTF-8"?>'
          '<svg xmlns="' + NS + '" width="2600">'
          '<path d="M 0,0 L 12.5,-3" stroke-width="0.25"/>'
          '<metadata>A &amp; B</metadata></svg>')


class WallpaperSVGParserTests(unittest.TestCase):
    def test_renderer_paths_and_predefined_entities_unchanged(self):
        old, new = ET.fromstring(NORMAL), parse_svg_document(NORMAL)
        self.assertEqual(ET.tostring(new), ET.tostring(old))
        self.assertEqual(new.find('{' + NS + '}metadata').text, 'A & B')

    def test_plain_document_type_is_rejected(self):
        with self.assertRaises(SVGDeclarationsForbidden):
            parse_svg_document('<!DOCTYPE svg><svg/>')

    def test_internal_entity_cannot_change_rendered_path(self):
        value = ('<!DOCTYPE svg [<!ENTITY p "M 0,0 L 7,7">]>'
                 '<svg><path d="&p;"/></svg>')
        self.assertEqual(ET.fromstring(value)[0].get('d'), 'M 0,0 L 7,7')
        with self.assertRaises(SVGDeclarationsForbidden):
            parse_svg_document(value)

    def test_external_file_or_network_declarations_rejected(self):
        for system in ['file:///never-open-this-test-input.xml',
                       'https://example.invalid/never-fetch-this-input.dtd']:
            for value in [f'<!DOCTYPE svg SYSTEM "{system}"><svg/>',
                          f'<!DOCTYPE svg [<!ENTITY p SYSTEM "{system}">]><svg>&p;</svg>']:
                with self.subTest(value=value), self.assertRaises(SVGDeclarationsForbidden):
                    parse_svg_document(value)

    def test_nested_and_parameter_entities_rejected(self):
        for declaration in ['<!ENTITY a "one"><!ENTITY b "&a;&a;">',
                            '<!ENTITY % p "<!ENTITY a \'one\'>">%p;']:
            with self.subTest(declaration=declaration), self.assertRaises(SVGDeclarationsForbidden):
                parse_svg_document('<!DOCTYPE svg [' + declaration + ']><svg/>')

    def test_encoded_document_types_cannot_bypass_callback(self):
        value = '<!DOCTYPE svg [<!ENTITY a "one">]><svg>&a;</svg>'
        for encoding in ['utf-8', 'utf-16', 'utf-16-le', 'utf-16-be']:
            with self.subTest(encoding=encoding), self.assertRaises(SVGDeclarationsForbidden):
                parse_svg_document(value.encode(encoding))
        with self.assertRaises(SVGDeclarationsForbidden):
            parse_svg_document(value.encode('utf-16-le').decode('latin-1'))

    def test_declaration_text_in_comment_or_cdata_is_not_a_dtd(self):
        value = '<svg><!-- <!DOCTYPE is text> --><metadata><![CDATA[<!DOCTYPE is text>]]></metadata></svg>'
        self.assertEqual(ET.tostring(parse_svg_document(value)), ET.tostring(ET.fromstring(value)))

    def test_malformed_xml_still_fails(self):
        with self.assertRaises(ET.ParseError):
            parse_svg_document('<svg><path></svg>')


if __name__ == '__main__':
    unittest.main()
