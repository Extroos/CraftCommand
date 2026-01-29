# CraftCommand Architecture

## Overview

CraftCommand is a Minecraft Server Management Solution built as a Monorepo.

### Tech Stack

- **Frontend**: React, Vite, TailwindCSS
- **Backend**: Node.js, Express, Socket.IO, TypeScript
- **Shared**: TypeScript Types (`@shared/types`)

## Structure

```
/
├── frontend/           # React Application
│   ├── src/
│   │   ├── components/ # UI Components
│   │   ├── features/   # Feature-grouped Components
│   │   ├── lib/        # API and Utilities
│   │   └── state/      # Context / Store
│   └── dist/           # Built static files
│
├── backend/            # Node.js Server
│   ├── src/
│   │   ├── services/   # Business Logic (Auth, Servers, System)
│   │   ├── storage/    # Data Access Layer (Repositories)
│   │   ├── sockets/    # Real-time Event Handlers
│   │   └── server.ts   # Entry Point
│   └── data/           # Runtime Date (JSON files)
│
└── shared/             # Shared Code
    └── types/          # TypeScript Interfaces
```

## Backend Services

Services handle business logic and delegate data access to Repositories.

- **AuthService**: User authentication (JWT based).
- **ServerService**: Server lifecycle (start/stop/managing).
- **ProcessManager**: Manages child processes (Java server instances).
- **ScheduleService**: Cron-based task execution.
- **AuditService**: Logs systematic actions for security.

## Storage Layer

We use a **Repository Pattern** to abstract the underlying data storage (JSON files).

- `UserRepository` -> `data/users.json`
- `ServerRepository` -> `data/servers.json`
- `AuditRepository` -> `data/audit.json`

## Real-time Communication

Socket.IO is used for:

- Console streaming (server logs).
- Server status updates (ONLINE/OFFLINE).
- Real-time stat monitoring (CPU/RAM).
