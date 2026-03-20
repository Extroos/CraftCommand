# Systems Integrity & Supply Chain Security

CraftCommand v1.11.3 introduces a production-grade security model for system updates, ensuring that every byte running on your cluster is authentic and untampered.

## 1. The Threat Model

The update system is designed to protect against:

- **Man-in-the-Middle (MITM)**: Attackers injecting malicious binaries into the download stream.
- **Corrupted Downloads**: Partial ZIP extractions that could lead to a "half-updated" broken state.
- **Unauthorized Rollouts**: Updates from unauthorized sources or compromised repositories.

## 2. Cryptographic Guardians

### Ed25519 Signatures

Every update bundle contains a `manifest.sig`. This is a cryptographic signature of the update manifest, generated using a private key held only by the core developers.

- **Verification**: The backend uses a local public key (`keys/update_public_key.pem`) to verify the signature.
- **Integrity**: If a single character in the manifest is changed, verification will fail.

### SHA256 Hashing

The `manifest.json` contains a SHA256 hash for every file in the update package.

- **Verification**: During the extraction phase, the `UpdateVerifier` recalculates the hash of every extracted file.
- **Action**: If a hash mismatch is detected, the process is immediately aborted, and the temporary files are purged.

## 3. Atomic State Transitions

The update isn't applied live to the running directory.

1. **Preparation**: Assets are extracted to a `temp_update` folder.
2. **Verification**: Full cryptographic audit of all files.
3. **The Swap**: The launcher script (`apply_update.ps1`) performs an atomic folder move, replacing the `backend/dist` and `frontend/dist` folders in one operation.
4. **Auto-Rollback**: If the server fails to reach a "Healthy" state within 60 seconds of restarting, the launcher restores the backup automatically.

## 4. Identity & Access Hardening (v1.12.0)

Version 1.12.0 expands the security model to include user-level session and identity protection:

- **Two-Factor Authentication (2FA)**: Native TOTP support with AES-256-CBC encrypted secrets.
- **Session Revocation**: Database-backed session tracking allows users to invalidate specific login identifiers (`jti`) or perform a global logout.
- **Scoped API Tokens**: Users can generate granular API tokens with specific permission scopes (e.g., `READ_ONLY`, `SERVER_CONTROL`), isolated from their main login session.
- **Protocol Guardians**: Distributed nodes perform version-handshake checks to ensure that worker agents match the primary panel's security capabilities before accepting commands.

---

_See [Upgrading](UPGRADING.md) for instructions on performing an update._
