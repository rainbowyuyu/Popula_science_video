"""Offline checks for production routing and provider/permission compatibility."""
import unittest

from app.collaboration import DEFAULT_ROLES, phase_specs
from app.creative_prompt import creative_system_prompt


class CreativePromptTests(unittest.TestCase):
    def test_system_prompt_has_actionable_shared_contract_without_granting_tools(self):
        prompt=creative_system_prompt()
        for contract in ('共用时间线','局部','实际TTS时长','creativeMemory','evidenceId',
                         '当前工具列表','历史付费、发送、发布或删除授权不延续','不要求或展示隐藏推理链',
                         'context.productionBrief','本次明确要求优先于保存的简报','不强推默认300秒'):
            self.assertIn(contract,prompt)
        self.assertLess(len(prompt),6000)

    def test_review_prompt_does_not_include_creative_write_authorization(self):
        review=creative_system_prompt(mode='review')
        self.assertIn('不写入工程、不运行进程、不生成素材',review)
        self.assertNotIn('在选定工程内完成用户已授权的必要制作',review)
        self.assertIn('协作不能提高本次权限',review)
        with self.assertRaises(ValueError):creative_system_prompt(mode='arbitrary')

    def test_dual_plan_keeps_stable_phase_identity_and_provider_overrides(self):
        roles={**DEFAULT_ROLES,'model':'claude','motion':'openai'}
        phases=phase_specs(roles,dual=True,provider='openai',mode='creative')
        self.assertEqual([p['id'] for p in phases],['plan','model','motion','integrate'])
        self.assertEqual([p['provider'] for p in phases],['openai','claude','openai','openai'])
        self.assertTrue(phases[0]['readOnly'])
        self.assertTrue(all(not p['readOnly'] for p in phases[1:]))
        for phase in phases:
            self.assertEqual(phase['status'],'pending')
            self.assertIn('局部',phase['instruction'])
            self.assertIn('共用时间线',phase['instruction'])
            self.assertIn('真实',phase['instruction'])

    def test_review_and_candidate_routes_keep_readonly_boundaries(self):
        review=phase_specs(DEFAULT_ROLES,dual=True,provider='openai',mode='review')
        self.assertTrue(all(p['readOnly'] for p in review))
        candidates=phase_specs(DEFAULT_ROLES,dual=True,provider='openai',mode='creative',candidates=True)
        self.assertEqual([p['id'] for p in candidates],['candidate_plan','candidate_compare'])
        self.assertTrue(all(p['readOnly'] for p in candidates))
        self.assertTrue(all('最终只返回JSON' in p['instruction'] for p in candidates))
        self.assertTrue(all('恰好3个' in p['instruction'] for p in candidates))

    def test_single_model_also_receives_same_workflow_and_review_permission(self):
        for provider in ('openai','claude'):
            for mode in ('creative','review'):
                with self.subTest(provider=provider,mode=mode):
                    phase=phase_specs(DEFAULT_ROLES,dual=False,provider=provider,mode=mode)[0]
                    self.assertEqual(phase['id'],'execute')
                    self.assertEqual(phase['provider'],provider)
                    self.assertEqual(phase['readOnly'],mode=='review')
                    self.assertIn('不强走整片流程',phase['instruction'])
                    if mode=='review':self.assertIn('不写工程、不运行进程',phase['instruction'])


if __name__=='__main__':unittest.main()
