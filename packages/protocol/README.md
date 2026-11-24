# Protocol Schemas (`packages/protocol`)

> **Stage:** Schema definitions active in **Stage 0 / Stage 2**  
> **Spec:** See [docs/protocol.md](../../docs/protocol.md) for full specifications.

This package contains canonical JSON Schemas used to code-generate types for:
1. TypeScript (`packages/gesture-core`, `apps/desktop/src`)
2. Rust serde (`apps/desktop/src-tauri`)
3. Kotlin kotlinx.serialization (`apps/android`)

## Canonical Message Envelope
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "MessageEnvelope",
  "type": "object",
  "required": ["v", "id", "type", "ts", "payload"],
  "properties": {
    "v": { "type": "integer", "enum": [1] },
    "id": { "type": "string" },
    "type": { "type": "string" },
    "ts": { "type": "integer" },
    "payload": { "type": "object" }
  }
}
```
