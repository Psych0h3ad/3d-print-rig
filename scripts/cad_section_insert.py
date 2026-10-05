import cadquery as cq
import numpy as np

def bounds(s):
 b=s.BoundingBox();return [[b.xmin,b.ymin,b.zmin],[b.xmax,b.ymax,b.zmax]]

def vec(axis,value):
 v=[0,0,0];v[axis]=value;return tuple(v)

def insert_length(s,axis,cut,amount):
 """Insert constant section at cut; left stays, right translates. No scaling."""
 b=np.asarray(bounds(s));lo=b[0]-5;hi=b[1]+5
 if b[0,axis]>=cut-1e-7:return s.translate(vec(axis,amount))
 if b[1,axis]<=cut+1e-7:return s
 def half(positive):
  mn=lo.copy();mx=hi.copy()
  if positive:mn[axis]=cut
  else:mx[axis]=cut
  return s.intersect(cq.Solid.makeBox(*(mx-mn),pnt=tuple(mn)))
 left=half(False);right=half(True).translate(vec(axis,amount))
 caps=[]
 for f in left.Faces():
  fb=np.asarray(bounds(f))
  if abs(fb[0,axis]-cut)<1e-5 and abs(fb[1,axis]-cut)<1e-5:
   caps.append(cq.Solid.extrudeLinear(f.outerWire(),f.innerWires(),vec(axis,amount)))
 if not caps:raise ValueError(f'No section caps axis={axis} cut={cut}')
 result=left.fuse(*caps,right,tol=1e-6).clean().fix()
 if not result.isValid():result=left.fuse(*caps,right,tol=1e-4).clean().fix()
 if not result.isValid():raise ValueError('Invalid section insertion')
 return result

def extend_center(s,axis,amount=50,cut=0):
 return insert_length(s,axis,cut,amount).translate(vec(axis,-amount/2))

def expand_edges(s,axis,amount=50,cuts=(-100,100)):
 # Keep central interfaces stationary, move each perimeter out by amount/2.
 s=insert_length(s,axis,cuts[0],amount/2)
 s=insert_length(s,axis,cuts[1]+amount/2,amount/2)
 return s.translate(vec(axis,-amount/2))

