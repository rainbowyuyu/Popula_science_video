"""CPU-only conservation tests. No CFD/structural solver or production writes."""
import copy
import json
import unittest
from pathlib import Path
import numpy as np
from map_cfd_layers import HERE, PROJECT, read, map_layers, validate_mapped, topology_hash, sha, write
from ops_load_adapter import apply_wind_loads, sum_external_wrenches, six_dof_load, load_metadata


def record(force=(0,0,0), moment=(0,0,0)):
    return {'force_N':list(force), 'moment_Nm':list(moment)}


def band(low, high, force=(0,0,0), moment=(0,0,0)):
    return {'heightMin_m':low, 'heightMax_m':high, **record(force,moment)}


def fixture(bins=None):
    if bins is None:
        bins=[band(i,min(i+10,632)) for i in range(0,632,10)]
        # A small force applied at the true crown plus independent vertical torque.
        bins[-1].update(record((10,0,0),(0,6320,75)))
    f=np.sum([b['force_N'] for b in bins],axis=0).tolist()
    m=np.sum([b['moment_Nm'] for b in bins],axis=0).tolist()
    return {'schema':'rainbow.cfd-layer-loads/1',
            'description':'SYNTHETIC UNIT TEST ONLY. No CFD was run to produce these values.',
            'units':{'length':'m','force':'N','moment':'N m'},
            'coordinates':'CFD_Z_UP','forceConvention':'fluid-on-solid','bodySurface':'tower',
            'temporalKind':'steady-mean','momentOrigin_m':[0,0,0],'heightRange_m':[0,632],
            'quality':{'acceptedForCoupling':False},
            'provenance':{'kind':'synthetic numerical fixture','solverRun':False},
            'bins':bins,'integratedTotal':record(f,m)}


class MappingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source=PROJECT/'public/physics/structural-graph.json'
        cls.source_sha=sha(cls.source)
        cls.graph=read(cls.source)

    @classmethod
    def tearDownClass(cls):
        if sha(cls.source)!=cls.source_sha:
            raise AssertionError('Frozen production graph changed during isolated tests')

    def map(self,cfd=None):
        return map_layers(cfd or fixture(),self.graph,allow_unvalidated=True)

    def test_crown_force_and_torque_survive(self):
        mapped,report=self.map()
        top=mapped['windLoads'][-1]
        np.testing.assert_allclose(top['force'],[10,0,0],atol=1e-10)
        np.testing.assert_allclose(top['moment'],[0,75,-520],atol=1e-10)
        np.testing.assert_allclose(report['mappedMomentAboutStructuralOrigin_Nm'],[0,75,-6320],atol=1e-10)
        self.assertTrue(report['requiresMomentDOFs'])
        self.assertEqual(len(mapped['windLoads']),132)

    def test_pure_vertical_torque_without_force(self):
        mapped,report=self.map(fixture([band(0,632,moment=(0,0,75))]))
        np.testing.assert_allclose(report['mappedForce_N'],[0,0,0],atol=1e-12)
        np.testing.assert_allclose(report['mappedMomentAboutStructuralOrigin_Nm'],[0,75,0],atol=1e-12)
        self.assertGreater(sum(abs(w['moment'][1]) for w in mapped['windLoads']),74.99)

    def test_centered_force_has_no_artificial_nodal_couples(self):
        cfd=fixture([band(0,100),band(100,110,(10,0,0),(0,1050,0)),band(110,632)])
        mapped,report=self.map(cfd)
        self.assertLess(report['maximumNodalCouple_Nm'],1e-9)
        np.testing.assert_allclose(report['mappedMomentAboutStructuralOrigin_Nm'],[0,0,-1050],atol=1e-9)
        self.assertEqual(sum(np.linalg.norm(w['force'])>0 for w in mapped['windLoads']),2)

    def test_reference_origin_and_coordinate_rotation(self):
        cfd=fixture([band(0,632,(11,-7,3),(13,17,19))])
        cfd['momentOrigin_m']=[2,3,4]
        cfd['translationToStructuralOrigin_m']=[5,6,7]
        _,report=self.map(cfd)
        # R F=(11,3,7), structural input origin=(7,10,4),
        # R M=(13,19,-17); r cross F=(58,-5,-89).
        np.testing.assert_allclose(report['mappedForce_N'],[11,3,7],atol=1e-9)
        np.testing.assert_allclose(report['mappedMomentAboutStructuralOrigin_Nm'],[71,14,-106],atol=1e-9)

    def test_three_coordinate_input_is_not_rotated_twice(self):
        cfd=fixture([band(0,632,(1,2,3),(4,5,6))])
        cfd['coordinates']='THREE_Y_UP'
        _,report=self.map(cfd)
        np.testing.assert_allclose(report['mappedForce_N'],[1,2,3],atol=1e-9)
        np.testing.assert_allclose(report['mappedMomentAboutStructuralOrigin_Nm'],[4,5,6],atol=1e-9)

    def test_pressure_plus_viscous_decomposition(self):
        cfd=fixture([band(0,632,(11,22,33),(44,55,66))])
        for item in [cfd['bins'][0],cfd['integratedTotal']]:
            item['pressure']=record((10,20,30),(40,50,60))
            item['viscous']=record((1,2,3),(4,5,6))
        mapped,_=self.map(cfd)
        self.assertTrue(mapped['windLoadProvenance']['pressureViscousDecompositionChecked'])
        cfd['bins'][0]['viscous']['moment_Nm'][0]+=1
        with self.assertRaisesRegex(ValueError,'pressure.*viscous'):
            self.map(cfd)

    def test_missing_moment_is_rejected(self):
        cfd=fixture(); del cfd['bins'][-1]['moment_Nm']
        with self.assertRaisesRegex(ValueError,'Missing moment_Nm'):
            self.map(cfd)
        with self.assertRaisesRegex(ValueError,'missing moment'):
            six_dof_load({'force':[0,0,0]})

    def test_independent_integral_mismatch_is_rejected(self):
        cfd=fixture(); cfd['integratedTotal']['moment_Nm'][1]+=50
        with self.assertRaisesRegex(ValueError,'independent whole-tower'):
            self.map(cfd)

    def test_gap_overlap_and_partial_height_are_rejected(self):
        for bad in [fixture([band(0,200),band(201,632)]),
                    fixture([band(0,201),band(200,632)]),
                    fixture([band(0,580)])]:
            with self.subTest(bins=bad['bins']):
                with self.assertRaises(ValueError):self.map(bad)

    def test_unaccepted_source_is_blocked_and_labeled(self):
        with self.assertRaisesRegex(ValueError,'not accepted'):
            map_layers(fixture(),self.graph)
        mapped,report=self.map()
        self.assertFalse(report['sourceAcceptedForCoupling'])
        self.assertFalse(mapped['windLoadProvenance']['acceptedForCoupling'])
        self.assertIn('UNVALIDATED',mapped['scope'][-1])
        self.assertIn('UNVALIDATED',mapped['windLoadProvenance']['kind'])

    def test_force_sign_units_and_temporal_contract(self):
        for key,value in [('forceConvention','solid-on-fluid'),('bodySurface','ground'),
                          ('temporalKind','pseudo-iteration'),('coordinates','unknown')]:
            cfd=fixture();cfd[key]=value
            with self.subTest(key=key):
                with self.assertRaises(ValueError):self.map(cfd)
        cfd=fixture();cfd['units']['force']='coefficient'
        with self.assertRaisesRegex(ValueError,'dimensional SI'):self.map(cfd)

    def test_topology_load_order_and_postwrite_tampering(self):
        mapped,report=self.map()
        self.assertEqual(topology_hash(self.graph),topology_hash(mapped))
        self.assertTrue(validate_mapped(self.graph,mapped,report)['passed'])
        mutated=copy.deepcopy(mapped);mutated['members'][0]['id']+='-changed'
        with self.assertRaisesRegex(ValueError,'fingerprint'):
            validate_mapped(self.graph,mutated,report)
        mutated=copy.deepcopy(mapped);mutated['windLoads'][0]['moment'][1]+=10
        with self.assertRaisesRegex(ValueError,'total-moment'):
            validate_mapped(self.graph,mutated,report)

    def test_same_count_modified_source_geometry_is_rejected(self):
        changed=copy.deepcopy(self.graph)
        changed['nodes'][0]['xyz'][0]=1
        with self.assertRaisesRegex(ValueError,'fingerprint'):
            map_layers(fixture(),changed,allow_unvalidated=True)

    def test_fake_ops_receives_six_dofs_and_preserves_gravity(self):
        class Collector:
            def __init__(self):self.calls=[]
            def load(self,*args):self.calls.append(args)
        mapped,report=self.map()
        by={n['id']:n for n in mapped['nodes']}
        ops=Collector(); gravity_node=mapped['windLoads'][4]['nodeId']
        applied={gravity_node:np.array([0.,-123.,0.])}
        apply_wind_loads(ops,mapped,by,applied)
        self.assertEqual(len(ops.calls),132)
        self.assertTrue(all(len(call)==7 for call in ops.calls))
        self.assertEqual([call[0] for call in ops.calls],[by[w['nodeId']]['tag'] for w in mapped['windLoads']])
        f,m=sum_external_wrenches(by,applied)
        np.testing.assert_allclose(f,[10,-123,0],atol=1e-9)
        np.testing.assert_allclose(m,[0,75,-6320],atol=1e-9)
        meta=load_metadata(mapped,by)
        self.assertEqual(len(meta['baseForce_N']),132)
        self.assertEqual(len(meta['baseMoment_Nm']),132)


if __name__=='__main__':
    import sys
    if '--write-fixture' in sys.argv:
        path=HERE/'synthetic-crown-and-torque.fixture.json'
        write(path,fixture())
        print(json.dumps({'fixture':str(path),'synthetic':True,'solverRun':False}))
    else:
        unittest.main(verbosity=2)
