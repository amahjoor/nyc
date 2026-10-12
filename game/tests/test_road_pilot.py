"""Road pilot geometry keeps official boundaries, ground/deck separation and provenance."""
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('road_pilot', ROOT / 'scripts/build-road-pilot.py')
PILOT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PILOT)
try:
    from shapely.geometry import Point, Polygon, box
    import numpy
    HAS_GEO = True
except ImportError:
    HAS_GEO = False


def grid():
    return {'bounds':{'minX':0,'maxX':4,'minZ':0,'maxZ':4},'width':5,'height':5,
            'heights':[row * .2 + column * .1 for row in range(5) for column in range(5)]}


class TriangleSamplingTests(unittest.TestCase):
    def test_nonplanar_grid_uses_rendered_triangle_instead_of_bilinear(self):
        data={'bounds':{'minX':0,'maxX':1,'minZ':0,'maxZ':1},'width':2,'height':2,'heights':[0,0,0,4]}
        self.assertEqual(PILOT.sample_grid(data,.25,.25),0)
        self.assertAlmostEqual(PILOT.sample_grid(data,.75,.75),2)
        self.assertIsNone(PILOT.sample_grid(data,2,0))
        self.assertIsNone(PILOT.sample_grid({**data,'heights':[None,0,0,4]},.25,.25))

    def test_edge_blend_preserves_baseline_and_measured_interior(self):
        data=grid()
        result=PILOT.blend_grid(data,lambda x,z:10,margin=1)
        for index,x,z in PILOT.grid_nodes(data):
            self.assertEqual(result['heights'][index],10 if PILOT.edge_distance(data['bounds'],x,z)==0 else data['heights'][index])
        self.assertNotEqual(data['heights'][0],10)

    def test_transfer_limit_is_never_silently_accepted(self):
        with self.assertRaises(ValueError):PILOT.validate_response({'features':[],'exceededTransferLimit':True})
        with self.assertRaises(ValueError):PILOT.validate_response({'features':[{}]*2000})
        self.assertEqual(PILOT.validate_response({'features':[]}),[])


@unittest.skipUnless(HAS_GEO,'Install requirements-reconstruction-ai.txt for geometry tests')
class GroundMeshingTests(unittest.TestCase):
    def test_coverage_partition_is_stable_and_roadbed_owns_parking_overlap(self):
        road={'kind':'roadbed','sourceFeatureId':'road:2'}
        parking={'kind':'parking','sourceFeatureId':'parking:1'}
        footprints=[(parking,0,box(0,0,4,4)),(road,0,box(1,0,3,4))]
        first,repairs=PILOT.partition_coverage(footprints)
        reversed_order,_=PILOT.partition_coverage(list(reversed(footprints)))
        self.assertEqual([(p['sourceFeatureId'],i,g.wkt) for p,i,g in first],[(p['sourceFeatureId'],i,g.wkt) for p,i,g in reversed_order])
        self.assertEqual(sum(g.area for _,_,g in first),16)
        self.assertEqual(repairs[0]['sourceFeatureId'],'parking:1')
        self.assertEqual(repairs[0]['removedAreaSquareMeters'],8)
        for i,(_,_,a) in enumerate(first):
            for _,_,b in first[i+1:]:self.assertEqual(a.intersection(b).area,0)

    def test_mesh_keeps_holes_and_exact_triangle_heights(self):
        polygon=Polygon([(0,0),(4,0),(4,4),(0,4)],holes=[[(1,1),(1,2),(2,2),(2,1)]])
        terrain=grid();terrain['heights'][12]=1.8
        mesh=PILOT.mesh_from_grid(polygon,terrain)
        xyz=[mesh['positions'][i:i+3] for i in range(0,len(mesh['positions']),3)]
        area=0
        for offset in range(0,len(mesh['indices']),3):
            a,b,c=[xyz[i] for i in mesh['indices'][offset:offset+3]]
            signed=(b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0])
            self.assertLess(signed,0,'Winding must point upward')
            area-=signed/2
            cx,cz=(a[0]+b[0]+c[0])/3,(a[2]+b[2]+c[2])/3
            self.assertTrue(polygon.covers(Point(cx,cz)))
            self.assertAlmostEqual((a[1]+b[1]+c[1])/3,PILOT.sample_grid(terrain,cx,cz),places=6)
        self.assertAlmostEqual(area,15,places=6)

    def test_nominal_ground_spot_on_bridge_is_not_a_bare_earth_constraint(self):
        origin=PILOT.LAND.ORIGIN
        raw={'bounds':{'minX':-100,'maxX':100,'minZ':-100,'maxZ':100},'width':2,'height':2,'heights':[0]*4}
        feature={'attributes':{'OBJECTID':1,'SOURCE_ID':11,'ELEVATION':2,'SUB_FEATURE_CODE':300000},
                 'geometry':{'x':origin['lon'],'y':origin['lat'],'z':2}}
        points,accepted,rejected=PILOT.survey_points({'features':[feature]},raw,box(-50,-50,50,50),box(-1,-1,1,1))
        self.assertEqual(len(accepted),0)
        self.assertEqual(points[0]['reason'],'Inside elevated transport footprint')
        self.assertAlmostEqual(points[0]['y'],2*1200/3937,places=6)

    def test_ground_residual_does_not_change_elevated_footprint(self):
        terrain=grid(); bridge=box(1.5,1.5,2.5,2.5)
        result=PILOT.constrain_ground(terrain,[{'x':1,'z':2,'demResidual':.2}],box(0,0,4,4),bridge)
        self.assertEqual(result['heights'][12],terrain['heights'][12])
        self.assertGreater(result['heights'][11],terrain['heights'][11])


class ShippedPilotTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        path=ROOT/'dist/road-pilot.json'
        if not path.exists():raise unittest.SkipTest('Pilot build has not finished')
        cls.data=json.loads(path.read_bytes())
        cls.terrain=json.loads((ROOT/'dist/road-pilot-source/terrain.json').read_bytes())

    def test_offline_inputs_have_verifiable_hashes_and_datum(self):
        self.assertEqual(self.data['verticalDatum'],'NAVD88')
        self.assertEqual(self.data['elevationUnits'],'meters')
        self.assertTrue(self.terrain['alreadyBlended'])
        self.assertGreaterEqual(self.terrain['edgeBlendMeters'],20)
        for source in self.data['sources'].values():
            path=source.get('snapshotUrl',source.get('url'))
            if path.startswith('./'):
                raw=(ROOT/'dist'/path[2:]).read_bytes()
                self.assertEqual(hashlib.sha256(raw).hexdigest(),source['sha256'])
        self.assertEqual(hashlib.sha256((ROOT/'dist/road-pilot-source/terrain.json').read_bytes()).hexdigest(),self.data['terrain']['sha256'])

    def test_geometry_is_finite_and_matches_shared_heightfield(self):
        for feature in self.data['features']:
            mesh=feature['geometry'];self.assertTrue(mesh['indices'])
            self.assertTrue(all(math.isfinite(v) for v in mesh['positions']))
            self.assertLess(max(mesh['indices']),len(mesh['positions'])//3)
            for offset in range(0,len(mesh['positions']),max(3,(len(mesh['positions'])//150//3)*3)):
                x,y,z=mesh['positions'][offset:offset+3]
                self.assertAlmostEqual(y,PILOT.sample_grid(self.terrain,x,z),delta=.002)
        self.assertGreater(self.data['stats']['groundConstraints'],20)
        self.assertLess(self.data['stats']['maxGroundConstraintErrorMeters'],.15)

    def test_required_baseline_regions_and_bounded_seam_error(self):
        self.assertEqual(self.data['terrain']['requiredRegions'],['meadow-lake'])
        base=json.loads((ROOT/'dist/landscape/nyc-terrain.json').read_bytes())
        raw=json.loads((ROOT/'dist/landscape/meadow-lake-terrain.json').read_bytes())
        fine=PILOT.blend_grid(raw,lambda x,z:PILOT.sample_grid(base,x,z))
        def baseline(x,z):
            height=PILOT.sample_grid(fine,x,z)
            return height if height is not None else PILOT.sample_grid(base,x,z)
        self.assertLessEqual(PILOT.boundary_error(self.terrain,baseline),.05)
        self.assertEqual(self.data['terrain']['baselineHashes'],self.terrain['baselineHashes'])

    @unittest.skipUnless(HAS_GEO,'Install requirements-reconstruction-ai.txt for geometry tests')
    def test_ground_footprints_have_no_coplanar_overlap(self):
        polygons=[Polygon(f['outer'],f['holes']) for f in self.data['features']]
        for index,a in enumerate(polygons):
            for b in polygons[index+1:]:self.assertLess(a.intersection(b).area,.0001)
        repairs=self.data['topologyRepairs']
        self.assertGreater(repairs['removedOverlapSquareMeters'],30)
        self.assertTrue(all(item['retainedBy'] for item in repairs['features']))

    @unittest.skipUnless(HAS_GEO,'Install requirements-reconstruction-ai.txt for geometry tests')
    def test_no_ground_triangles_fill_measured_bridge_footprints(self):
        review=json.loads((ROOT/'dist/road-pilot-source/survey-review.json').read_bytes())
        bridges=[Polygon(b['outer']).buffer(-.003) for b in review['bridges']]
        self.assertGreater(len(bridges),0)
        for feature in self.data['features']:
            xyz=[feature['geometry']['positions'][i:i+3] for i in range(0,len(feature['geometry']['positions']),3)]
            indices=feature['geometry']['indices']
            for i in range(0,len(indices),3):
                a,b,c=[xyz[index] for index in indices[i:i+3]]
                center=Point((a[0]+b[0]+c[0])/3,(a[2]+b[2]+c[2])/3)
                self.assertFalse(any(bridge.contains(center) for bridge in bridges))

    @unittest.skipUnless(HAS_GEO,'Install requirements-reconstruction-ai.txt for geometry tests')
    def test_spawn_is_inside_ordinary_reconstructed_pavement(self):
        spawn=self.data['spawn'];point=Point(spawn['x'],spawn['z'])
        matching=[feature for feature in self.data['features'] if Polygon(feature['outer'],feature['holes']).contains(point)]
        # NYC classifies the parking loop's footprint as parking while CSCL
        # names its drivable centerline Meadow Lake Drive. Retain both facts.
        self.assertTrue(any(f['kind'] in ('roadbed','parking') for f in matching))
        roads=json.loads((ROOT/'dist/roads/13_-2.json').read_bytes())['roads']
        road=next(r for r in roads if r['id']==spawn['roadId'])
        from shapely.geometry import LineString
        self.assertLess(LineString(road['points']).distance(point),.01)
        a,b=road['points'][0],road['points'][-1]
        self.assertAlmostEqual(spawn['angle'],math.atan2(b[0]-a[0],b[1]-a[1]),places=6)
        self.assertTrue(math.isfinite(PILOT.sample_grid(self.terrain,spawn['x'],spawn['z'])))


if __name__=='__main__':unittest.main()
