# ADR-0005: Versioned JSON over WebSocket & HTTP Range Transfer

| Attribute | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-24 |
| **Decision Makers** | Lead Systems Architect |

## Context
Transferring mixed content (real-time hand cursor events, thumbnail previews, and multi-gigabyte video files) over a single monolithic channel leads to head-of-line blocking and fragile error recovery.

## Decision
1. Control and synchronization events use **versioned JSON envelopes over WebSocket**.
2. Large payload and binary file transfers use **HTTP/1.1 Range streaming** with 1 MB–4 MB chunking.
3. Every chunk is cryptographically hashed with **BLAKE3**.
4. JSON Schemas maintained in `packages/protocol` generate type definitions for TypeScript, Rust (`serde`), and Kotlin (`kotlinx.serialization`).

## Consequences
- **Positive:** Transfers are resumable after Wi-Fi drops; memory usage remains constant (<150 MB RAM).
- **Negative:** Requires managing dual server routes (WebSocket handler + HTTP static chunk handler).

[← Return to Architecture Index](../../architecture.md)
