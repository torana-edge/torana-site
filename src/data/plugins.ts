export const plugins = [
  { name: "auth", kind: "policy", description: "Require or inject credentials before a request leaves the machine." },
  { name: "pii", kind: "privacy", description: "Redact configured sensitive patterns from canonical request content." },
  { name: "otel", kind: "telemetry", description: "Emit traces and token accounting without changing the response." },
  { name: "intent", kind: "context", description: "Preserve tool-call intent so compacted results remain recoverable." },
  { name: "compactor", kind: "context", description: "Economically gated context summarization, disabled by default." },
  { name: "keyword-compactor", kind: "context", description: "Deterministic local reduction for configured tool-result classes." },
  { name: "schema-translator", kind: "interop", description: "Translate provider tool schemas through Torana’s canonical IR." },
] as const;
