# Testing Strategy & Quality Standards

As a solo developer, my goal is to build automated testing to ensure stability, but currently, most testing is manual. This document outlines the *intended* testing strategy for the future.

## 🏁 The Development Flow

Features are tested manually before release. The following layers represent the roadmap for automated validation.

---

## 1. Unit & Integration Testing

- **Logic Validation**: Core services (Auth, Process, Installer) must have unit tests covering success, failure, and edge-case scenarios.
- **Repository Integrity**: Data access layer tests must verify that atomic writes succeed and that malformed data is rejected before persistence.

## 2. End-to-End (E2E) Suites (Planned)

In the future, I plan to use Playwright or Cypress to automate critical user journeys:

- **Onboarding**: Fresh installation, admin creation, and first-server deployment.
- **File Management**: Uploading large plugins and verifying in-place flattening logic.

## 3. Chaos & Resilience Testing

Because Minecraft servers are prone to external failures, the following are simulated:

- **Network Flapping**: Ensuring the DDNS and Telemetry layers recover silently after a disconnect.
- **Abrupt Termination**: Killing the background worker or server process to verify state recovery and "Ghost Protection."
- **NBT Overflows**: Stress-testing the logger and console buffer with high-velocity data.

## 4. Security & Authentication (v1.12.5)

Mandatory checks for every stable release:

- **2FA Recovery Flow**: Verifying that backup codes are correctly invalidated after use and that encrypted secrets remain inaccessible to non-privileged actors.
- **Session Revocation**: Testing that "Logout All Devices" terminates all active JWT identifiers (`jti`) across the cluster.
- **Path Traversal Audit**: Automated scans for `../` escapes in the File Manager and API.
- **Role Isolation**: Verifying that `Manager` accounts cannot access `Admin` settings or modify `Owner` users.

## 5. UI/UX & Compatibility

- **Mobile Responsiveness**: Manual verification of the dashboard across varying viewport widths (e.g., 375px to 1440px) ensuring touch-target sizes and layout density remain functional.
- **Modpack Stabilization**: Verifying the "Triple-Layer" Modrinth API integration by deploying packs with known client-side mods and ensuring they are quarantined correctly.
- **Chained Task Sequencing**: Validation of multi-action scheduled tasks (e.g., Command -> Wait -> Backup -> Restart).

---

## 📊 Quality KPIs

Success is measured based on the following target metrics:

| Metric                      | Target | Description                                                      |
| :-------------------------- | :----- | :--------------------------------------------------------------- |
| **Recovery Success**        | 100%   | Automatic repair success after unexpected backend shutdown.          |
| **False-Positive Warnings** | <1%    | Diagnostic results where "The Doctor" suggests an incorrect fix. |
| **Install Success Rate**    | >98%   | Successful extraction and deployment of heuristic installers.    |

---

_To contribute tests or report a bug, please see the [Contributing Guide](../../CONTRIBUTING.md)._
