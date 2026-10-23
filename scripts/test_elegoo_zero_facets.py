"""Guard exact-zero omissions, tiny source facets and attribute preservation."""
import json
import struct
import unittest

import numpy as np
from filter_elegoo_zero_facets import accessor, exact_zero, filter_model, parse_glb, zero_ids


class ZeroFacets(unittest.TestCase):
    def test_exact_predicate_without_area_tolerance(self):
        tiny = np.nextafter(np.float32(0), np.float32(1))
        huge = np.float32(2**120)
        triangles = np.array([
            [[0,0,0],[1,1,1],[2,2,2]],
            [[0,0,0],[tiny,0,0],[0,tiny,0]],
            [[huge,huge,0],[-huge,-huge,0],[0,0,0]],
            [[0,0,0],[1,1,0],[1,np.nextafter(np.float32(1),np.float32(2)),0]],
            [[1,2,3],[1,2,3],[9,8,7]],
        ], dtype=np.float32)
        self.assertEqual([exact_zero(t) for t in triangles], [True,False,True,False,True])
        self.assertEqual(zero_ids(triangles.reshape(-1,3), np.arange(15).reshape(-1,3)), [0,2,4])

    def test_compact_output_keeps_attributes_and_nonzero_subsequence(self):
        arrays = [np.array([0,1,2,0,1,3],dtype='<u4'),
                  np.array([[0,0,0],[1,0,0],[2,0,0],[0,1e-30,0]],dtype='<f4'),
                  np.tile(np.array([0,0,1],dtype='<f4'),(4,1)),
                  np.array([[2,3,4,255]]*4,dtype='u1')]
        binary = b''.join(a.tobytes() for a in arrays)
        views = []; offset = 0
        for a in arrays:
            views.append({'buffer':0,'byteOffset':offset,'byteLength':a.nbytes}); offset += a.nbytes
        g = {'asset':{'version':'2.0'}, 'buffers':[{'byteLength':len(binary)}],
             'bufferViews':views, 'accessors':[
                 {'bufferView':i,'componentType':ct,'count':len(a),'type':t}
                 for i,(a,ct,t) in enumerate(zip(arrays,[5125,5126,5126,5121],['SCALAR','VEC3','VEC3','VEC4']))],
             'meshes':[{'name':'part_1','primitives':[{'indices':0,'attributes':{'POSITION':1,'NORMAL':2,'COLOR_0':3}}]}],
             'nodes':[{'name':'part_1','mesh':0,'translation':[1,2,3]}],
             'scenes':[{'nodes':[0]}], 'scene':0, 'materials':[{'name':'source'}]}
        j = json.dumps(g).encode(); j += b' '*((-len(j))%4)
        raw = struct.pack('<III',0x46546c67,2,28+len(j)+len(binary))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(binary),0x004e4942)+binary
        manifest = {'triangles':2,'parts':[{'node':'part_1','key':'1','triangle_count':2,'triangles':2,'vertex_count':4}]}
        output, m = filter_model(raw,manifest)
        new, b = parse_glb(output)
        self.assertEqual(m['triangles'],1)
        self.assertEqual(m['parts'][0]['source_triangle_count'],2)
        self.assertEqual(m['parts'][0]['triangles'],1)
        self.assertEqual(m['mesh_export_filter']['primitives'][0]['omitted_exact_zero_facet_ids'],[0])
        self.assertEqual(m['parts'][0]['vertex_count'],4)
        for key in ['nodes','meshes','scenes','scene','materials','asset']:
            self.assertEqual(new[key],g[key])
        self.assertEqual(len(b),len(binary)-12)
        np.testing.assert_array_equal(accessor(new,b,0).reshape(-1),[0,1,3])
        for aid in [1,2,3]:
            self.assertEqual(accessor(new,b,aid).tobytes(),arrays[aid].tobytes())
        self.assertEqual(manifest['triangles'],2)
        with self.assertRaises(ValueError): filter_model(output,m)


if __name__ == '__main__':
    unittest.main()
