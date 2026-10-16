# V7 模型对应工程参数图

这两张 SVG 和全量零件表直接对应 V7 GLB 的唯一 part_id。单位均为毫米；斜梁的 CSV 包围盒不是开料长度，准确轮廓须使用 Blender 实体几何。每根穿梁的榫头与梁身是一块实体，孔与销为真实几何。

- 01-plan-elevation.svg：平面、立面、支承层次和统一标高。
- 02-joints-assembly.svg：柱梁贯穿榫销、柱头承托、攒尖座装配节点。
- cut-list.csv：每一件实际几何的 ID、角色、父组及三维外包尺寸。

现代木构节点原则参考：
- https://jointandpeg.com/timber-frame-planning/timber-frame-pavilions/
- https://jointandpeg.com/standard-timber-frame-joints/

亭子的柱网、标高、节点间隙及尺寸是本模型自定值；保持原攒尖亭的外观，不冒称宋代名亭的测绘复原。没有把参考图纸当成认证的施工方案。原《营造法式》的图样见 ../real-pavilion-sources.json 所述来源（如文件未同包，参见 research/episode3v2）。
