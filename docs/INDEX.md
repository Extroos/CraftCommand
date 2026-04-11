# CraftCommand Documentation Index

Welcome to the technical documentation library for CraftCommand. This library provides deep-dives into the architecture, security, and operation of the platform.

## Operations

| Guide                                                           | Description                                 |
| :-------------------------------------------------------------- | :------------------------------------------ |
| [**Architecture**](ARCHITECTURE.md)                             | Technical deep-dive into the hybrid engine. |
| [**Deployment**](support/DEPLOYMENT.md)                         | Windows & Linux OS setup.                   |
| [**Docker Guide**](support/DOCKER.md)                           | Containerization, Volumes, and Networking.  |
| [**Migration**](advanced/MIGRATION.md)                           | Moving existing servers into CraftCommand. |
| [**Templates**](advanced/TEMPLATES.md)                           | Management and creation of server presets. |
| [**Upgrading**](UPGRADING.md)                                   | Safe transition guide for v1.x releases.    |

## Security & Access

| Guide                                                           | Description                                 |
| :-------------------------------------------------------------- | :------------------------------------------ |
| [**Remote Access**](networking/REMOTE_ACCESS.md)                | Tunnels, Proxies, and HTTPS/SSL.            |
| [**2FA Setup**](security/2FA.md)                                | TOTP setup and Security Suite.              |
| [**Security Profile**](security/SYSTEM_INTEGRITY.md)            | Ed25519 & SHA256 safety model.              |

## Networking & Ingress

| Guide                                                           | Description                                 |
| :-------------------------------------------------------------- | :------------------------------------------ |
| [**Overview**](networking/OVERVIEW.md)                          | Ingress protocols, binding, and DNS logic.  |
| [**Tunnels**](networking/TUNNELS.md)                            | `cloudflared` reverse tunnel provisioning.  |
| [**Dynamic DNS**](networking/DDNS.md)                           | IP detection and DuckDNS synchronization.   |
| [**Cross-Play**](networking/CROSSPLAY.md)                       | Geyser/Floodgate protocol translation.      |

## Advanced & Development

| Guide                                                           | Description                                 |
| :-------------------------------------------------------------- | :------------------------------------------ |
| [**Optimization & Performance**](advanced/OPTIMIZATION.md)      | JVM tuning, process discovery, and hardware caps. |
| [**API Reference**](advanced/API_REFERENCE.md)                  | REST & Socket.IO endpoint documentation.    |
| [**Extending CraftCommand**](advanced/EXTENDING.md)            | Custom diagnostic rules and runner engines. |

---

## Policies & Legal

- **[Security Policy](../SECURITY.md)**: Found in the repository root for prominence.
- **[Contributing Guidelines](../CONTRIBUTING.md)**: How to help build the future of CraftCommand.

---

_For general project info, see the root [README.md](../README.md)._
