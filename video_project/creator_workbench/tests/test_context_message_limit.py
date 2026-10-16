"""Large-token sessions must also respect the provider message-count limit."""
import copy
import json
import unittest

from app.context_budget import MAX_CONTEXT_MESSAGES, compact_context, estimate_messages, estimate_text


def batch(index, count=8):
    calls = [{"id": f"call_{index}_{j}", "name": "read_file",
              "arguments": {"path": f"part-{j}.md"}} for j in range(count)]
    return [{"role": "assistant", "content": "", "tool_calls": calls},
            *[{"role": "tool", "tool_call_id": call["id"], "content": "ok"} for call in calls]]


class ContextMessageLimitTests(unittest.TestCase):
    def assert_protocol_complete(self, messages):
        pending = set()
        for message in messages:
            if message.get("tool_calls"):
                self.assertFalse(pending)
                pending = {call["id"] for call in message["tool_calls"]}
            elif message["role"] == "tool":
                self.assertIn(message["tool_call_id"], pending)
                pending.remove(message["tool_call_id"])
            else:
                self.assertFalse(pending)
        self.assertFalse(pending)

    def test_one_million_budget_trims_small_complete_batches_below_adapter_guard(self):
        messages = [{"role": "system", "content": "system"},
                    {"role": "user", "content": "current request", "_context_keep": True}]
        for i in range(70):
            messages.extend(batch(i))
        messages.append({"role": "user", "content": "Please continue from these facts."})
        original = copy.deepcopy(messages)
        result, stats = compact_context(messages, budget=1_000_000)
        self.assertGreater(len(messages), 500)
        self.assertLessEqual(len(result), MAX_CONTEXT_MESSAGES)
        self.assert_protocol_complete(result)
        self.assertEqual(result[-1]["content"], messages[-1]["content"])
        self.assertEqual(result[-2]["tool_call_id"], "call_69_7")
        self.assertIn("current request", [m["content"] for m in result])
        self.assertEqual(stats["inputMessages"], len(result))
        self.assertEqual(stats["beforeMessages"], len(messages))
        self.assertEqual(stats["messageLimit"], 480)
        self.assertGreater(stats["trimmedToolGroups"], 0)
        self.assertEqual(messages, original)

    def test_latest_image_observation_stays_with_its_tool_group(self):
        messages = [{"role": "system", "content": "system"}]
        for i in range(60):
            messages.extend(batch(i))
        messages.append({"role": "user", "content": [
            {"type": "text", "text": "actual frame"},
            {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,AAAA"}}]})
        result, _ = compact_context(messages, budget=1_000_000)
        self.assertLessEqual(len(result), MAX_CONTEXT_MESSAGES)
        self.assertEqual(result[-1]["content"], messages[-1]["content"])
        self.assertEqual(result[-2]["tool_call_id"], "call_59_7")
        self.assert_protocol_complete(result)

    def test_pinned_message_overflow_errors_without_silently_dropping_task(self):
        messages = [{"role": "user", "content": str(i), "_context_keep": True}
                    for i in range(MAX_CONTEXT_MESSAGES + 1)]
        with self.assertRaisesRegex(ValueError, "480 条消息"):
            compact_context(messages, budget=1_000_000)

    def test_tool_compaction_notice_is_included_at_exact_message_boundary(self):
        messages = [{"role": "user", "content": "x"} for _ in range(478)]
        messages.extend(batch(0, count=1))
        messages[-1]["content"] = "large tool result " * 10000
        result, stats = compact_context(messages, budget=16000)
        self.assertLessEqual(len(result), MAX_CONTEXT_MESSAGES)
        self.assertEqual(result[-1]["tool_call_id"], "call_0_0")
        self.assertEqual(stats["compactedToolResults"], 1)
        self.assert_protocol_complete(result)

    def test_native_reasoning_is_budgeted_and_kept_verbatim_with_its_tool_group(self):
        recent = batch(1, count=1)
        recent[0]["content"] = "checking"
        call = recent[0]["tool_calls"][0]
        native_visible = [{"type": "text", "text": "checking"},
                          {"type": "tool_use", "id": call["id"], "name": call["name"],
                           "input": call["arguments"]}]
        normalized_cost = estimate_messages(recent)
        recent[0].update(_provider="claude", assistant_blocks=copy.deepcopy(native_visible))
        self.assertEqual(estimate_messages(recent), normalized_cost, "visible blocks must not be double counted")
        reasoning = [{"type": "thinking", "thinking": "Check the actual tool result.\n", "signature": "SIG==\n  exactly"},
                     {"type": "redacted_thinking", "data": "opaque-base64=="}]
        recent[0]["assistant_blocks"] = [*reasoning, *native_visible]
        expected_extra = sum(estimate_text(json.dumps(block, ensure_ascii=False, separators=(",", ":")))
                             for block in reasoning)
        self.assertEqual(estimate_messages(recent), normalized_cost + expected_extra)
        old = batch(0, count=1)
        old[0].update(_provider="claude", assistant_blocks=[
            {"type": "thinking", "thinking": "older reasoning " * 8000, "signature": "OLD=="}])
        messages = [{"role": "system", "content": "system"},
                    {"role": "user", "content": "current task", "_context_keep": True}, *old, *recent]
        original = copy.deepcopy(messages)
        result, stats = compact_context(messages, budget=16000)
        self.assertGreater(stats["trimmedToolGroups"], 0)
        self.assertFalse(any(m.get("tool_call_id") == "call_0_0" for m in result))
        retained = next(m for m in result if m.get("tool_calls"))
        self.assertEqual(retained["assistant_blocks"], recent[0]["assistant_blocks"])
        self.assertEqual(retained["_provider"], "claude")
        self.assertEqual(result[-1]["tool_call_id"], "call_1_0")
        self.assertEqual(messages, original)
        self.assert_protocol_complete(result)


if __name__ == "__main__":
    unittest.main()
