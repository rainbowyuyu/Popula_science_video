import unittest

from app.memory_matching import match, match_message


def project(pid, folder, aliases=()):
    return {'id': pid, 'folder': folder, 'path': 'D:/video_project/' + folder, 'aliases': list(aliases)}


class MemoryMatchingTests(unittest.TestCase):
    def setUp(self):
        self.catalog = [project('joinery', 'episode3', ['榫卯', '亭子']),
            project('topology', 'topology_optimization', ['拓扑优化']),
            project('tower', 'shanghai_tower', ['上海中心', '上海塔']),
            project('dna', 'dna_storage_algorithms', ['DNA存储']),
            project('crypto', 'cryptography_key_exchange', ['密码学']),
            project('marine', 'zju_marine_ep01'),
            project('beso', 'beso_ai_research_2026'),
            project('evidence', 'ai_engineer_science', ['ai engineer']),
            project('c4', 'cs2_c4', ['c4']),
            project('ch1', 'ai_evolution_ch01_vision_choice'),
            project('ch2', 'ai_evolution_ch02_creation'),
            project('ch3', 'ai_evolution_ch03_language'),
            project('ch4', 'ai_evolution_ch04_space_time'),
            project('ch5', 'ai_evolution_ch05_reasoning_agents')]

    def resolve(self, text, role='user', active=None):
        return match_message(text, self.catalog, role, active)

    def test_requested_destination_wins_over_reference(self):
        result = self.resolve('参考榫卯制作上海中心，保持原来的运镜质感。', active='joinery')
        self.assertEqual(result.match[0], 'tower')
        self.assertIn('joinery', result.references)
        self.assertTrue(result.explicit)

    def test_reference_does_not_switch_current_project(self):
        result = self.resolve('参考之前的 D:/video_project/episode3 的光照。', active='tower')
        self.assertEqual(result.match[0], 'tower')
        self.assertFalse(result.explicit)
        self.assertIn('joinery', result.references)

    def test_assistant_output_path_repairs_stale_active(self):
        result = self.resolve('本次工程：D:/video_project/ai_evolution_ch02_creation。预览已保存。', 'assistant', 'ch1')
        self.assertEqual(result.match[0], 'ch2')
        self.assertTrue(result.explicit)

    def test_assistant_reference_path_does_not_repair_active(self):
        result = self.resolve('沿用 D:/video_project/ai_evolution_ch01_vision_choice 的运镜。', 'assistant', 'ch2')
        self.assertEqual(result.match[0], 'ch2')
        self.assertFalse(result.explicit)

    def test_assistant_mechanism_subtopic_does_not_switch_active_film(self):
        result = self.resolve('19秒开始拓扑优化时，模型现在从镜头外沿同一条轨道进入。', 'assistant', 'beso')
        self.assertEqual(result.match[0], 'beso')
        self.assertFalse(result.explicit)

    def test_reference_heading_applies_across_paragraphs(self):
        result = self.resolve('## 当前任务\n制作 AI Engineer 影片。\n\n'
                              '## 现有视频项目可复用\n项目：\n\nD:/video_project/episode3\n', 'assistant')
        self.assertEqual(result.match[0], 'beso')
        self.assertIn('joinery', result.references)

    def test_historical_session_inventory_is_not_current_deliverable(self):
        result = self.resolve('已知会话发现：\n\n### AI Engineer\n项目：\n'
                              'D:/video_project/beso_ai_research_2026\n', 'assistant', 'marine')
        self.assertEqual(result.match[0], 'marine')
        self.assertFalse(result.explicit)

    def test_reference_scope_ends_at_next_peer_heading(self):
        result = self.resolve('## 参考项目\nD:/video_project/episode3\n'
                              '## 当前工程\nD:/video_project/shanghai_tower', 'assistant', 'joinery')
        self.assertEqual(result.match[0], 'tower')

    def test_assistant_ambiguous_inventory_does_not_change_active(self):
        result = self.resolve('工程列表：\nD:/video_project/episode3\nD:/video_project/shanghai_tower', 'assistant', 'dna')
        self.assertEqual(result.match[0], 'dna')
        self.assertFalse(result.explicit)

    def test_actual_second_chapter_request_uses_series_context(self):
        result = self.resolve('使用我视频制作的技能，按计划完成第二章视频的制作，小狗名字叫做珍珠。', active='ch1')
        self.assertEqual(result.match[0], 'ch2')

    def test_actual_third_chapter_request_switches(self):
        result = self.resolve('帮我制作第三章的内容，让claude帮我绘制左边的动态可视化。', active='ch2')
        self.assertEqual(result.match[0], 'ch3')

    def test_arabic_chapter_and_explicit_family(self):
        result = self.resolve('AI进化系列，制作第4章的内容。')
        self.assertEqual(result.match[0], 'ch4')

    def test_generic_chapter_does_not_invent_ai_ownership(self):
        result = self.resolve('帮我制作第二章的内容。', active='dna')
        self.assertIsNone(result.match)
        self.assertTrue(result.reset)

    def test_chapter_reference_is_not_destination(self):
        result = self.resolve('参考第一章，继续制作第三章的内容。', active='ch2')
        self.assertEqual(result.match[0], 'ch3')

    def test_multiple_chapters_are_ambiguous(self):
        result = self.resolve('第二章和第三章比较一下。', active='ch1')
        self.assertEqual(result.match[0], 'ch1')
        self.assertFalse(result.explicit)

    def test_new_unknown_subject_clears_reference_and_active(self):
        result = self.resolve('参考榫卯，帮我制作一期量子纠错。', active='joinery')
        self.assertIsNone(result.match)
        self.assertTrue(result.reset)

    def test_parked_topic_is_not_owner(self):
        result = self.resolve('换个主题，做密码学，DNA存储先放下。', active='dna')
        self.assertEqual(result.match[0], 'crypto')
        self.assertIn('dna', result.references)

    def test_editor_requests_reset(self):
        result = self.resolve('工作台增加上下文旋钮和exe启动器。', active='dna')
        self.assertIsNone(result.match)
        self.assertTrue(result.editor)
        self.assertTrue(result.reset)

    def test_normal_followup_inherits_low_confidence(self):
        result = self.resolve('继续优化字幕和光照。', active=('dna', .98, '明确路径'))
        self.assertEqual(result.match[0], 'dna')
        self.assertEqual(result.match[1], .68)
        self.assertFalse(result.explicit)

    def test_actual_marine_title_variants(self):
        for text in ('做一个浙大新能源系列海洋学院的一些内容',
                     '标题写浙江大学·海洋新能源。下面第一期海洋风电总览'):
            with self.subTest(text=text):
                self.assertEqual(self.resolve(text, active='tower').match[0], 'marine')

    def test_ai_engineer_resolves_film_not_evidence_folder(self):
        for text in ('主要介绍我 ai engineer 这个项目', 'AI Engineer 发布片 v3：105秒完整重构'):
            with self.subTest(text=text):
                self.assertEqual(self.resolve(text, active='tower').match[0], 'beso')
        result = self.resolve('素材目录 D:/video_project/ai_engineer_science。', 'assistant')
        self.assertEqual(result.match[0], 'evidence')

    def test_uuid_attachment_and_embedded_environment_are_not_topic_clues(self):
        text = ('# Files mentioned by the user:\nC:/Temp/codex-clipboard-12345678-c456-1234-1234-123456789abc.png\n'
                '## My request:\n字幕再大一点。\n<environment_context>D:/video_project/episode3</environment_context>')
        self.assertEqual(self.resolve(text, active='dna').match[0], 'dna')
        self.assertIsNone(match('a9919d7c-c4a1-4697-bb23-6576c28ff288', self.catalog))

    def test_exact_folder_does_not_match_suffixed_version(self):
        self.assertIsNone(match('D:/video_project/episode3_v06/output.mp4', self.catalog))
        self.catalog.append(project('joinery-v6', 'episode3_v06', ['榫卯']))
        self.assertEqual(match('D:/video_project/episode3_v06/output.mp4', self.catalog)[0], 'joinery-v6')

    def test_chapter_preserves_version_line(self):
        self.catalog.extend([project('ch1v6', 'ai_evolution_ch01_vision_choice_v06'),
                             project('ch2v6', 'ai_evolution_ch02_creation_v06')])
        self.assertEqual(self.resolve('制作第二章', active='ch1v6').match[0], 'ch2v6')
        self.assertEqual(self.resolve('制作第二章', active='ch1').match[0], 'ch2')

    def test_compatible_lookup_accepts_windows_path(self):
        self.assertEqual(match(r'D:\video_project\dna_storage_algorithms', self.catalog)[0], 'dna')


if __name__ == '__main__':
    unittest.main()
