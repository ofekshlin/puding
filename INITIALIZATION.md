# Project Initialization & Local Development

Welcome to **Project Puding**. This repository is managed as a high-performance **pnpm monorepo** using **Turborepo** for build orchestration.

## Prerequisites

1.  **Node.js**: Version 20 or higher.
2.  **pnpm**: Install it globally if you haven't already:
    ```bash
    npm install -g pnpm
    ```
3.  **Docker** (Optional): Required if running the PostgreSQL/pgvector database locally.

## Initial Setup

1.  **Clone the repository**:
    ```bash
    git clone <repo-url>
    cd puding
    ```

2.  **Install dependencies**:
    ```bash
    pnpm install
    ```

3.  **Environment Variables**:
    Create `.env` files in `apps/web` and `apps/server` by copying their respective `.env.example` files (once created).

## Running the Project

### Development Mode
To start all applications (Frontend & Backend) in development mode simultaneously:
```bash
pnpm dev
```

To run a specific app:
```bash
pnpm turbo run dev --filter=@puding/web
```

### Building for Production
```bash
pnpm build
```

### Linting & Formatting
```bash
pnpm lint
```

## Adding New Dependencies

-   **Global dependency**: `pnpm add <pkg> -w`
-   **Specific app dependency**: `pnpm add <pkg> --filter @puding/web`
-   **Shared package dependency**: `pnpm add @puding/shared-types --filter @puding/server --workspace`

## Structure

-   `apps/`: Deployable units (Next.js PWA, Node.js Server).
-   `packages/`: Shared libraries, configurations, and types.
