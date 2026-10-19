"""Read CAD-renderer SVG without accepting document type declarations."""
import xml.etree.ElementTree as ET


class SVGDeclarationsForbidden(ValueError):
    """The wallpaper SVG profile does not use a DTD or entity declarations."""


class _NoDocumentType(ET.TreeBuilder):
    def doctype(self, name, pubid, system):
        raise SVGDeclarationsForbidden('Document types are not supported in CAD SVG')


def parse_svg_document(text):
    """Preserve normal ElementTree behavior, rejecting a DTD before its subset."""
    return ET.fromstring(text, parser=ET.XMLParser(target=_NoDocumentType()))
