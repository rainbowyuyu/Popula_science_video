"""Deterministic collaboration plans; no API calls or filesystem side effects."""
from __future__ import annotations
import json
import math
import re


DEFAULT_ROLES = {"plan": "openai", "model": "openai", "motion": "claude", "integrate": "openai"}
READ_ONLY_TOOLS = {"write_file", "replace_text", "run_process"}


def roles_from(body):
    values = body.get("roles") or {}
    if not isinstance(values, dict) or any(k not in {*DEFAULT_ROLES, "build", "qa"} for k in values):
        raise ValueError("协作角色仅支持plan/model/motion/integrate（兼容build/qa）")
    roles = dict(DEFAULT_ROLES)
    if "build" in values:roles["motion"] = values["build"]
    if "qa" in values:roles["integrate"] = values["qa"]
    roles.update({k:v for k,v in values.items() if k in roles})
    if any(v not in {"openai", "claude"} for v in roles.values()):
        raise ValueError("协作角色仅允许OpenAI与Claude接口")
    return roles


def normalize_context(value, clean):
    if value is None:return {}
    if not isinstance(value, dict):raise ValueError("context必须为JSON对象")
    try:encoded = json.dumps(value, ensure_ascii=False, allow_nan=False)
    except (ValueError, TypeError):raise ValueError("context必须为有效JSON对象") from None
    if len(encoded)>24000:raise ValueError("context最多24000字符")
    def sanitize(obj, depth=0):
        if depth>12:raise ValueError("context嵌套过深")
        if isinstance(obj,str):return clean(obj)
        if isinstance(obj,list):return [sanitize(v,depth+1) for v in obj]
        if isinstance(obj,dict):return {clean(k):sanitize(v,depth+1) for k,v in obj.items()}
        return obj
    context=sanitize(value)
    interval=context.get("timeRange")
    if interval is not None:
        if not isinstance(interval,dict):raise ValueError("timeRange必须为对象")
        start,end=interval.get("startSec"),interval.get("endSec")
        if isinstance(start,bool) or isinstance(end,bool) or not isinstance(start,(int,float)) or not isinstance(end,(int,float)) or not (math.isfinite(start) and math.isfinite(end) and 0<=start<end<=86400):
            raise ValueError("时间范围必须满足0≤startSec<endSec≤86400")
        source=interval.get("sourcePath")
        if source is not None and (not isinstance(source,str) or not source):raise ValueError("sourcePath需为工程相对路径")
    return context


def phase_specs(roles, *, dual, provider, mode, candidates=False):
    def phase(ident,title,who,steps,readonly,instruction):
        return {"id":ident,"title":title,"provider":who,"maxSteps":steps,"readOnly":readonly,"instruction":instruction,"status":"pending","steps":0,"summary":""}
    collaboration=("模型分工是优先主导的偏好，不是专属能力或文件边界。根据当前问题发挥各自优势，"
                   "接续同一任务的真实文件、工具结果、已确认结论和未完成项，避免重复调查或推翻有效成果。"
                   "需要另一模型补充、实现或复核一个限定问题时，可使用request_collaboration工具，明确问题、"
                   "相关文件、已知事实与验收条件；双方共享上下文和当前权限，串行处理，禁止嵌套委托。"
                   "协作者给出文字结论后自动回到原主导，原主导核对结果并继续负责完成任务。"
                   "阶段轮数是进度检查窗口，达到窗口后可接续工作；只以实际证据说明已完成、待办和风险。"
                   "当前任务和用户偏好优先于技能与旧资料，历史授权不重放；已授权的必要工作持续推进，不逐步请求确认。")
    production=("按本次改动尺度选择路线：完整新片/结构重构建立一句故事主线与旁白、镜头、资产、声音共用时间线，"
                "先代表镜头小样，再逐段制作和验证；局部字幕、读音、材质或片段修复直接定位与修改，"
                "只检查受影响部分和必要边界，不强走整片流程。"
                "如提供update_work_plan/report_artifact/record_check，用真实步骤、现存产物和工具返回evidenceId记录进度。"
                "简短呈现目标、关键取舍、当前步骤、成果和未验证项，详细日志放文件，不展示隐藏推理链。"
                "一次有效检查通过后，仅因新修改、失败或未解疑点再查；不重复重跑无关检查。")
    if candidates:
        schema='最终只返回JSON：{"candidates":[{"id":"A","title":"方案名","approach":"具体故事/模型/运镜/实现路线","tradeoffs":"收益、代价和风险"},...]}。恰好3个不同方案，id唯一，不能声称已实现。'
        return [phase("candidate_plan","联合计划 · 三种创作路线",roles["plan"],8,True,collaboration+"只读调查现有工程，提出3个可比较方案。用户还未选择，不得写文件、运行进程或制作素材；协作请求也保持只读。"+schema),
                phase("candidate_compare","协作完善 · 方案比较",roles["motion"],8,True,collaboration+"接续上一阶段事实，检查三方案的可理解性、视觉可行性与取舍。输出可让用户选择的最终3方案；保持只读，等待用户选择后才实施。"+schema)]
    if not dual:
        permission=("当前为审阅模式：只读检查工程与已有结果，不写工程、不运行进程；可记录计划与真实检查。"
                    if mode=="review" else "在选定工程实际完成已授权的修改和必要验证，不停在能力说明或计划。")
        return [phase("execute","创作执行" if mode=="creative" else "工程审阅",provider,24,mode=="review",collaboration+production+permission+"不能把尚未完成的检查或渲染报告为完成。")]
    readonly=mode=="review"
    action=("当前为审阅模式，只读核对与提出可落地建议，不得写文件或运行进程，协作请求不能提升权限。"
            if readonly else "在选定工程内实际实现必要修改并验证；可跨建模、代码、动效和布局补齐缺口，先读取现有文件，保留有效成果。")
    return [phase("plan","联合计划",roles["plan"],8,True,collaboration+production+"只读相关工程入口、最新结果、用户标记与记忆，核对当前问题。给出与任务相称的可执行步骤、修改边界和可观察验收点。新片写一句故事主线和关键机制；局部修复说明位置与最小改动，不重新策划整片。只交接计划与已知证据，不声称完成制作。"),
            phase("model","主导实现",roles["model"],24,readonly,collaboration+production+action+"先处理当前最大缺口。完整片先用代表镜头验证机制、比例、材质与光照，再沿时间线逐段实现；局部问题直接修根因并检查边界。交接已写文件、小样/产物路径、工具证据与未完成项，不能仅交接设想。"),
            phase("motion","协作完善",roles["motion"],24,readonly,collaboration+production+action+"先读上一阶段真实产物和检查记录，围绕观众理解补齐动作、运镜、字幕、声音与衔接；根因在叙事、模型或结构就修对应层。保持共同时间线和接口，保留有效成果。若本次目标已满足，进行有针对性的交叉检查并交接，不为体现分工重写或添加无关内容。"),
            phase("integrate","交叉验证",roles["integrate"],16,readonly,collaboration+production+action+"按本次验收点核对模型、动作、字幕和声音，读取已有有效证据，仅补未验证或受新修改影响的部分；发现问题局部修复后重查相关范围。以真实成片/小样/源文件说明结果，区分解码、静帧抽查、连续观看与听审。最后给最新路径、简短变化和检查结论，不贴整段日志，未渲染不能说已成片。")]


def parse_candidates(text):
    text=text.strip()
    if text.startswith("```"):
        text=re.sub(r"^```(?:json)?\s*|\s*```$","",text,flags=re.I).strip()
    try:data=json.loads(text)
    except ValueError:raise ValueError("候选方案不是有效JSON；未自动选择或执行") from None
    candidates=data.get("candidates") if isinstance(data,dict) else data
    if not isinstance(candidates,list) or len(candidates)!=3:raise ValueError("需要恰好3个可比较候选方案；未执行")
    result=[];ids=set()
    for item in candidates:
        if not isinstance(item,dict):raise ValueError("候选方案格式无效")
        normalized={}
        for key,maximum in (("id",40),("title",100),("approach",2400),("tradeoffs",1600)):
            value=item.get(key)
            if key=="tradeoffs" and isinstance(value,list):value="；".join(str(x) for x in value)
            if not isinstance(value,str) or not value.strip() or len(value)>maximum:raise ValueError("候选方案字段缺失或过长："+key)
            normalized[key]=value.strip()
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,40}",normalized["id"]) or normalized["id"] in ids:raise ValueError("候选方案id无效或重复")
        ids.add(normalized["id"]);result.append(normalized)
    return result
