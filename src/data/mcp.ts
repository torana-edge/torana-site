// Shared by the MCP guide and catalogue. Keep aligned with the linked agent.json
// descriptors; runtime discovery remains authoritative for an installed bundle.
export const pluginMCP: Record<string, { operations: string[]; description: string }> = {
  pii: { operations: ["redaction.explain_last"], description: "Explain the last fresh replacement in this chat, with categories and relative output lines—not secret values." },
  pii_guard: { operations: ["redaction.explain_last"], description: "Explain the last fresh deterministic replacement in this chat without returning the protected value." },
  usage_logger: { operations: ["session.usage", "status"], description: "Read this chat’s recorded token totals, including reported cache usage, or inspect the logging policy." },
  decision_router: { operations: ["status", "conversation.get"], description: "Inspect routing readiness and this session’s routing-thread summaries, without exposing prompts or configured model ladders." },
  compactor: { operations: ["status.get"], description: "Inspect configured input limits, expected reuse and policy count. This does not run compaction or test the model." },
  tool_governor: { operations: ["status", "session.allow_tool"], description: "Inspect restriction counts or request a confirmed tool allowance for this session. Explicit operator denies still apply; undo stays user-controlled." },
  otel: { operations: ["status"], description: "Inspect plugin identity and metric-emission readiness—not collector delivery or a trace browser." },
};
