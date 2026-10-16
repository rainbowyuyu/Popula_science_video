"""GET-only credential probe. Does not contain or persist credentials."""
from pathlib import Path
import datetime as dt
import json
import os
import re
import winreg
import requests

OUT = Path(__file__).resolve().parent
HOST = 'https://dashscope.aliyuncs.com'
FIELDS = ['QWEN_API_KEY_PRIMARY', 'QWEN_API_KEY_BACKUP']
TASK = '00000000-0000-0000-0000-000000000000'

def current(field):
    # User-level configuration is read fresh rather than stale shell copies.
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, 'Environment') as key:
            value = winreg.QueryValueEx(key, field)[0]
        if value:
            return str(value).strip(), 'HKCU/Environment/' + field
    except OSError:
        pass
    value = os.environ.get(field, '').strip()
    return value, 'process/' + field

def safe(value):
    return value if isinstance(value, str) and re.fullmatch(r'[A-Za-z0-9_.:-]{1,160}', value) and not value.startswith('sk-') else None

def main():
    report = {'utc': dt.datetime.now(dt.timezone.utc).isoformat(), 'method': 'GET only', 'generationPOSTs': 0,
              'endpoint': HOST, 'region': 'cn-beijing', 'priority': FIELDS, 'probes': [], 'selectedField': None,
              'credentialsPersisted': False, 'modelAvailabilityProvenByGET': False}
    seen = set()
    for field in FIELDS:
        token, source = current(field)
        if not token or token in seen:
            report['probes'].append({'field': field, 'status': 'missing_or_duplicate'})
            continue
        seen.add(token)
        entry = {'field': field, 'credentialSource': source, 'checks': []}
        report['probes'].append(entry)
        auth = {'Authorization': 'Bearer ' + token}
        for route in ['/compatible-mode/v1/models', '/api/v1/tasks/' + TASK]:
            row = {'route': route, 'readOnly': True}
            try:
                response = requests.get(HOST + route, headers=auth, timeout=(10,35), allow_redirects=False)
                try: data = response.json()
                except ValueError: data = {}
                code = safe(data.get('code') or data.get('error', {}).get('code') or data.get('output', {}).get('code'))
                row.update(httpStatus=response.status_code, errorCode=code,
                           requestId=safe(data.get('request_id') or response.headers.get('x-request-id')))
                if route.endswith('/models') and response.status_code == 200:
                    ids = [safe(x.get('id')) for x in data.get('data', []) if isinstance(x, dict)]
                    row.update(modelCount=len(ids),wanModels=[x for x in ids if x and x.startswith('wan')])
                    row['verified'] = isinstance(data.get('data'), list)
                elif route.startswith('/api/v1/tasks/'):
                    out = data.get('output', {})
                    row['verified'] = (response.status_code == 200 and out.get('task_id') == TASK and out.get('task_status') == 'UNKNOWN') or (response.status_code in [400,404] and code in ['InvalidTaskId','InvalidTaskID','TaskNotFound','TaskNotExist','TaskNotExists','TaskNotFoundException'])
                    row['taskStatus'] = safe(out.get('task_status'))
            except requests.RequestException as exc:
                row['errorType'] = type(exc).__name__
            entry['checks'].append(row)
        entry['authenticated'] = any(x.get('verified') for x in entry['checks'])
        if entry['authenticated']:
            report['selectedField'] = field
            break
        # Move to explicitly authorized fallback only after confirmed auth errors.
        if not any(x.get('httpStatus') in [401,403] for x in entry['checks']):
            break
    (OUT/'authentication.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps(report, ensure_ascii=False))

if __name__ == '__main__':
    main()
