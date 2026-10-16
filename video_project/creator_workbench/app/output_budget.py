"""Output allowances are independent of the requested input context window."""
from .context_budget import compact_context, validate_budget

BASE_OUTPUT_TOKENS = 8192
LENGTH_REASONS = frozenset({'length', 'max_tokens', 'max_output_tokens'})


def effort_allowance(effort):
    return 32768 if effort in {'max', 'xhigh'} else 16384 if effort == 'high' else BASE_OUTPUT_TOKENS


def prepare_output_context(messages, tools, *, budget, desired):
    """Fit input and output together, without changing the user's context knob.

    Prefer trimming optional old input over starving high-effort output. If the
    pinned task itself needs more space, find the largest allowance that fits.
    There is no separate workbench output ceiling or recovery-count cap. The
    actual provider may still enforce its own output/context limits.
    """
    budget = validate_budget(budget)
    if type(desired) is not int or desired < 1:
        raise ValueError('输出预算需为正整数 token')
    desired = min(desired, budget - 1)
    try:
        bounded, stats = compact_context(messages, tools, budget=budget, output_reserve=desired)
    except ValueError:
        # A minimum successful fit proves the pinned evidence itself fits;
        # retain its failure instead of hiding an invalid context behind output
        # reductions. Then grow to the selected window's actual remaining room.
        bounded, stats = compact_context(messages, tools, budget=budget, output_reserve=1)
        low, high = 1, desired - 1
        while low < high:
            candidate = (low + high + 1) // 2
            try:
                fit, measured = compact_context(messages, tools, budget=budget, output_reserve=candidate)
            except ValueError:
                high = candidate - 1
            else:
                low, bounded, stats = candidate, fit, measured
        desired = low
        if stats['outputReserveTokens'] != desired:
            bounded, stats = compact_context(messages, tools, budget=budget, output_reserve=desired)
    return bounded, stats, desired


def usage_tokens(usage):
    def number(value):
        return max(0, value) if type(value) is int else 0
    output = number(usage.get('output_tokens', usage.get('completion_tokens')))
    details = usage.get('output_tokens_details') or usage.get('completion_tokens_details') or {}
    reasoning = number(details.get('thinking_tokens', details.get('reasoning_tokens'))) if isinstance(details, dict) else 0
    return output, reasoning


OUTPUT_GUIDANCE = ('单次输出和上下文容量分别计算。长代码按模块或小文件逐步实现；已有文件优先用replace_text做局部修改。'
                   '每轮只发少量完整工具请求，工具参数必须是闭合的完整JSON。不要把半截代码拼接成工具调用；'
                   '先完成当前最小可验证步骤，读取工具结果后再继续。已执行成功的写入、生成和进程不要重做。')
