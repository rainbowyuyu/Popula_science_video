"""User-owned creative direction. It informs new runs, never rewrites active ones."""
import copy
import math
import time

FIELDS={'question':600,'audience':300,'story':1800,'visual':1400,'keep':1400}

class BriefConflict(ValueError):
    status_code=409
    code='brief_conflict'

def read(studio,pid):
    value=studio.config(pid).get('productionBrief') or {}
    return {**{key:value.get(key,'') for key in FIELDS},'durationSec':value.get('durationSec'),
            'revision':value.get('revision',0),'updatedAt':value.get('updatedAt')}

def save(studio,pid,body):
    from .studio import clean_text
    fields=body.get('brief')
    if not isinstance(fields,dict) or set(fields)-set(FIELDS)-{'durationSec'}:
        raise ValueError('制作简报包含未知字段')
    update={}
    for key,limit in FIELDS.items():
        if key in fields:
            if not isinstance(fields[key],str):raise ValueError('制作简报文本格式无效')
            update[key]=clean_text(fields[key],limit)
    if 'durationSec' in fields:
        duration=fields['durationSec']
        if duration is not None and (isinstance(duration,bool) or not isinstance(duration,(int,float)) or not math.isfinite(duration) or not 1<=duration<=86400):
            raise ValueError('目标时长需为有效秒数；留空可随内容调整')
        update['durationSec']=duration
    revision=body.get('revision')
    if isinstance(revision,bool) or not isinstance(revision,int) or revision<0:raise ValueError('请先读取制作简报再保存')
    with studio.lock:
        current=read(studio,pid)
        if revision!=current['revision']:raise BriefConflict('制作简报已在其他窗口更新。你的输入仍保留，请重新读取后合并。')
        value={**current,**update,'revision':revision+1,'updatedAt':time.time()}
        studio.update_config(pid,lambda config:config.update(productionBrief=copy.deepcopy(value)))
    return {'brief':value,'status':'completed','message':'制作简报已保存，后续任务自动参考；当前运行任务保留原有目标。'}
