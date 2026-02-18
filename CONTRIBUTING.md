# Contributing to CraftCommand

Thank you for your interest in contributing! I build CraftCommand as an open-source solution for the Minecraft community, and I welcome all kinds of contributions.

## Development Setup

1.  **Fork** the repository and clone it to your local machine.
2.  **Install Dependencies**:
    - Root: `npm install`
    - Backend: `cd backend && npm install`
    - Frontend: `cd frontend && npm install`
3.  **Environment**: Copy `.env.example` to `.env` if it doesn't exist.
4.  **Run Locally**: Use `run_locally.bat` (Windows) or `npm run dev` in the root.

## Branching Strategy

- `main`: Stable production branch.
- `develop`: Ongoing feature integration.
- `feature/*`: Specific feature development.
- `fix/*`: Specific bug fixes.

## Pull Request Guidelines

1.  Create a branch from `develop`.
2.  **Mandatory Tests**: If adding a feature, include a test case or clear verification steps.
3.  **Code Quality**: Follow existing TypeScript patterns and use functional components in the frontend.
4.  **Documentation**: Update relevant `.md` files in `/docs` if your change affects architecture or configuration.
5.  **Commit Messages**: Use clear, descriptive messages (e.g., `feat: Add support for Modrinth installers`).

## Reporting Bugs

Please use the [GitHub Issue Tracker](https://github.com/Extroos/Craft-Commands/issues). Provide:

- OS and Node.js version.
- Exact steps to reproduce.
- Expected behavior vs. actual result.
- Log snippets from `backend/logs/app.log`.

## Code of Conduct

Help keep the community professional and welcoming. Be respectful to other contributors and users.

---

_For technical deep-dives, see the [Architecture Guide](docs/ARCHITECTURE.md)._
