# Two-Factor Authentication (2FA) Security

CraftCommand implements 2FA to protect administrative accounts from credential leaks. 

## Security Implementation

The 2FA system is built on industry-standard **TOTP** (Time-based One-Time Password) protocols.

- **Algorithm**: HMAC-SHA1.
- **Interval**: 30 seconds.
- **Secret Storage**: 2FA secrets are encrypted using **AES-256-CBC** before being stored in the database.
- **Backup Codes**: Generated as 8-character alphanumeric strings, hashed using **bcrypt** (10 rounds).

## Setup

1.  **Navigate** to your **User Profile** (Click your username in the sidebar).
2.  Click **"Enable Two-Factor Authentication"**.
3.  **Scan the QR Code** with an authenticator app (e.g., Google Authenticator, Authy, or Ente Auth).
4.  **Save your Backup Codes**: The system will provide 10 one-time-use recovery codes. **Store these offline.**

## Management

Administrators can manage 2FA requirements across the entire panel in **Global Settings -> Security**:

- **Require 2FA**: When enabled, any account with the `Admin` or `Owner` role is forced to set up 2FA before accessing the dashboard.
- **Session Duration**: Control how long a 2FA-verified session remains valid before requiring a re-challenge.

## Recovery

If you lose access to your authenticator device:
1.  **Use a Backup Code**: At the login screen, select "Use Backup Code".
2.  **Admin Reset**: If you have no backup codes, a user with the **Owner** role can reset your 2FA status from the **User Management** tab.
3.  **CLI Recovery**: In extreme cases, run the following command on the host machine to reset the owner's 2FA:
    ```bash
    npm run security:reset-owner-2fa
    ```
