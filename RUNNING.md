# Project Puding: Setup and Execution Guide 🍮

This guide outlines the system architecture, directories created during Stage 1.1, configuration steps, and commands required to build, run, and verify the Project Puding workspace.

---

## 1. Project Architecture & Structure

Project Puding is structured as a TypeScript monorepo using **pnpm workspaces** and managed by **Turborepo** for optimal pipeline execution.

### Monorepo Components
* **`apps/server`**: The NestJS WebSocket Proxy gateway. It secures the Google Gemini API key server-side and acts as a bi-directional relay, converting raw binary client PCM audio data to Gemini-compatible payloads and vice versa.
* **`apps/web`**: The Next.js client boilerplate (future PWA), built to record audio from the microphone and play back response streams.
* **`packages/tsconfig`**: Shared TypeScript configuration presets (`base.json`, `nextjs.json`) extended by each workspace package to enforce strict type checking and consistent OOP patterns.

---

## 2. Key Refactoring & SOLID Design Patterns

Following best practices and SOLID design principles, we decoupled the core gateway logic from specific provider implementations:

1. **`LiveSession` (Interface)**: Represents a generic live session interface. Any model provider (Gemini Live, OpenAI Realtime, etc.) will implement this interface.
2. **`LiveSessionService` (Abstract Class)**: Serves as a persistent injection token at runtime in the NestJS Dependency Injection container.
3. **`GeminiService` & `GeminiSession` (Implementations)**: Concrete classes extending `LiveSessionService` and implementing `LiveSession`, registered dynamically via custom providers in `GeminiModule`.
4. **`ProxyGateway` (Decoupled Client)**: Injects the abstract `LiveSessionService` rather than concrete Gemini classes, achieving complete dependency inversion (DIP).

---

## 3. Prerequisites

Ensure you have the following installed on your machine:
* **Node.js** (v18 or higher recommended)
* **pnpm** package manager (enforced via preinstall script)
* **Google Gemini API Key** (required to establish the Live API socket connection)

---

## 4. Initial Configuration

### 1. Install Dependencies
Run the following command at the root of the project to install all workspace dependencies:
```bash
pnpm install
```

### 2. Environment Setup
Configure the environment variables for the NestJS server.
Copy the server's environment variable template:
```bash
cp apps/server/.env.example apps/server/.env
```

Open `apps/server/.env` and supply your API key:
```env
PORT=3001
GEMINI_API_KEY=your_actual_gemini_api_key_here
```

---

## 5. Development and Build Commands

You can run individual apps/packages or trigger monorepo-wide Turborepo pipelines.

### Build the Entire Project
To build all apps and packages in the workspace (verify TypeScript compilation and Next.js optimization):
```bash
pnpm build
```

### Start All Applications in Development Mode
To start both the NestJS server and Next.js client concurrently in watch mode:
```bash
pnpm dev
```
* NestJS Server will listen at `ws://localhost:3001`
* Next.js Web App will be available at `http://localhost:3000`

### Start a Specific Workspace App
If you wish to only run the server during development:
```bash
pnpm --filter @puding/server run dev
```

---

## 6. Verification and Connection Testing

We have created a standalone, non-blocking test client script to verify the WebSocket bridge and Gemini connection.

### Run the Connection Test
1. Start the proxy server:
   ```bash
   pnpm --filter @puding/server run dev
   ```
2. In a separate terminal tab, run the test client script:
   ```bash
   pnpm --filter @puding/server run test:connection
   ```

### Expected Output
The script will output log statements indicating a successful handshake and response:
```text
[Test Client] Connecting to local proxy at ws://localhost:3001...
[Test Client] WebSocket connection opened. Sending setup config...
[Test Client] Received message type: "setup_complete"
[Test Client] Handshake confirmed. Sending a dummy audio packet (silence) and text greeting...
[Test Client] Received message type: "content"
[Test Client] Gemini Text Response: "Hello there! I can hear you loud and clear. How can I help you today?"
[Test Client] Gemini Audio Response: Received 18432 bytes of 24kHz PCM audio.
[Test Client] SUCCESS: Connection test completed successfully!
```
