export const plugins = [
  { name: "pii", kind: "privacy", description: "Block requests when the configured detector finds sensitive tool-result content." },
  { name: "otel", kind: "telemetry", description: "Emit traces and token accounting without changing the response." },
  { name: "intent", kind: "context", description: "Preserve tool-call intent so compacted results remain recoverable." },
  { name: "compactor", kind: "context", description: "Economically gated context summarization, disabled by default." },
  { name: "keyword_compactor", kind: "context", description: "Deterministic local reduction for configured tool-result classes." },
  { name: "schema_translator", kind: "interop", description: "Translate provider tool schemas through Torana’s canonical IR." },
] as const;
