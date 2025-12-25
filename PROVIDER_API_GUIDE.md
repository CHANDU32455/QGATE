# QGATE Provider & Admin API Guide

This document defines the system-level APIs used exclusively by the **QGATE Mobile App** and system administrators.

## System Identity & Registration

### 1. Registration Protocol
Used by the mobile app to establish a hardware-bound identity.
- `POST /api/register/initiate`: Get entropy and nonce for attestation.
- `POST /api/register`: Bind Dilithium public key and verify device integrity.

### 2. Identity Sync (Self-Healing)
`POST /api/mobile/sync`
Allows a device with valid hardware keys to recover its identity metadata from the provider.

## Remote Authentication Control
Used by the mobile app to authorize consumer requests.
- `POST /api/mobile/verify`: Submit a quantum signature for a scanned `sessionId`.

## Administrative Control Center
> [!IMPORTANT]
> These endpoints require a session token with the `admin` role.

### 1. Network intelligence
- `GET /api/admin/stats`: Real-time count of nodes, active sessions, and QRNG health.
- `GET /api/admin/users`: List all registered nodes in the mesh.

### 2. Node Management
- `PATCH /api/admin/users/:regUserId/role`: Promote or demote nodes.
- `DELETE /api/admin/users/:regUserId`: Securely unbind and remove a node.

### 3. Session Governance
- `GET /api/admin/users/:regUserId/sessions`: Inspect all live sessions for a node.
- `POST /api/admin/users/:regUserId/revoke-all`: Emergency disconnect for all associated sessions.
