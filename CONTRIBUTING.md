# Contributing to CraftCommand

This is a solo developer's project. I review and merge PRs, but response times can be slow. Please be patient.

## What I Need Help With

- **Bug fixes** — especially around file operations, process lifecycle, and cross-platform issues
- **Test coverage** — adding Jest tests for services that don't have them yet (see `backend/src/features/`)
- **Documentation** — honest, no-hype docs. If you see text that sounds like "AI marketing slop", submit a PR with clearer wording
- **Linux compatibility** — shell scripts, systemd units, and testing on different distros

## Development Setup

1.  **Fork** the repository and clone it locally.
2.  **Install Dependencies**:
    - Root: `npm install`
    - Backend: `cd backend && npm install`
    - Frontend: `cd frontend && npm install`
3.  **Environment**: Copy `.env.example` to `.env` if it doesn't exist.
4.  **Run Locally**: Use `run_CraftCommand.bat` (Windows) or `npm run dev` in the root.

## Running Tests

```bash
cd backend
npx jest --forceExit --verbose
```

Tests live in `__tests__/` subdirectories next to the code they test. If you're adding a feature, include a test or clear verification steps.

## Branching Strategy

- `main`: Stable production branch.
- `develop`: Ongoing feature integration.
- `feature/*`: Specific feature development.
- `fix/*`: Specific bug fixes.

## Pull Request Guidelines

1.  Create a branch from `develop`.
2.  If adding a feature, include a test case or clear verification steps.
3.  Follow existing TypeScript patterns and use functional components in the frontend.
4.  Update relevant `.md` files in `/docs` if your change affects architecture or configuration.
5.  Use clear commit messages (e.g., `feat: Add support for Modrinth installers`, `fix: Handle ENOENT on nested file write`).

## Reporting Bugs

Use the [GitHub Issue Tracker](https://github.com/Extroos/Craft-Commands/issues). Include:

- OS and Node.js version
- Steps to reproduce
- Expected vs. actual behavior
- Log snippets from `backend/logs/app.log`

## Architectural Standards

- **Anti-Slop UX Philosophy**: All new UIs must be purely functional, data-centric, and avoid "consumer-grade" generic elements. Interfaces should look like a highly technical IDE, not a marketing page.
- **Strict TypeScript**: Avoid `any` types. New backend endpoints must have typed request/response signatures synced with the frontend.
- **Data Persistence**: Always provide a JSON fallback. SQLite is opt-in for massive scales, never forced.

## Known Limitations

Before working on something, be aware of current state:

- **Docker**: The `docker-compose.yml` stack handles panel and proxy deployment. Agent node deployments in Docker are working but require strict network binding.
- **Scale**: The SQLite opt-in supports 1000+ nodes, but performance tuning is ongoing.
- **Frontend language**: The UI is being transitioned entirely out of legacy consumer-grade text into the new professional data-centric text standard.

## Code of Conduct

Be respectful. Focus feedback on code, not the developer. If you think something is "AI slop," submit a PR with improved wording instead of just complaining about it.

---

_For technical deep-dives, see the [Architecture Guide](docs/ARCHITECTURE.md)._
