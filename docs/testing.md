# Testing Strategy & Quality Standards

CraftCommand is a mission-critical tool for server administrators. To ensure zero-downtime operations and data integrity, I adhere to the following rigorous testing standards.

## 🏁 The "Verify First" Rule

All development must follow a **Test-Driven Flow**. No feature is considered "Merge-Ready" unless it has been validated against the following layers.

---

## 1. Unit & Integration Testing

- **Logic Validation**: Core services (Auth, Process, Installer) must have unit tests covering success, failure, and edge-case scenarios.
- **Repository Integrity**: Data access layer tests must verify that atomic writes succeed and that malformed data is rejected before persistence.

## 2. End-to-End (E2E) Suites

Using Playwright/Cypress, critical user journeys are automated:

- **Onboarding**: Fresh installation, admin creation, and first-server deployment.
- **Remote Enrollment**: The multi-step wizard for pairing worker nodes.
- **File Management**: Uploading large plugins and verifying in-place flattening logic.

## 3. Chaos & Resilience Testing

Because Minecraft servers are prone to external failures, the following are simulated:

- **Network Flapping**: Ensuring the DDNS and Telemetry layers recover silently after a disconnect.
- **Abrupt Termination**: Killing the background worker or server process to verify state recovery and "Ghost Protection."
- **NBT Overflows**: Stress-testing the logger and console buffer with high-velocity data.

## 4. Security Regressions

Mandatory checks for every stable release:

- **Path Traversal Audit**: Automated scans for `../` escapes in the File Manager and API.
- **Role Isolation**: Verifying that `Manager` accounts cannot access `Admin` settings or modify `Owner` users.
- **Token Integrity**: Expired or malformed JWT tokens must be rejected with `401 Unauthorized`.

---

## 📊 Quality KPIs

Success is measured based on the following target metrics:

| Metric                      | Target | Description                                                      |
| :-------------------------- | :----- | :--------------------------------------------------------------- |
| **Recovery Success**        | 100%   | Auto-healing success after unexpected backend shutdown.          |
| **False-Positive Warnings** | <1%    | Diagnostic results where "The Doctor" suggests an incorrect fix. |
| **Install Success Rate**    | >98%   | Successful extraction and deployment of heuristic installers.    |

---

_To contribute tests or report a bug, please see the [Contributing Guide](../../CONTRIBUTING.md)._
