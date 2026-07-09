const { spawn } = require("child_process");
const net = require("net");
const path = require("path");
const fs = require("fs");

// Path to apps/server/.env
const dotenvPath = path.resolve(__dirname, "../apps/server/.env");

// Parse the port from .env, defaulting to 3001
let port = 3001;
if (fs.existsSync(dotenvPath)) {
  const envContent = fs.readFileSync(dotenvPath, "utf8");
  const match = envContent.match(/^PORT\s*=\s*(\d+)/m);
  if (match) {
    port = parseInt(match[1], 10);
  }
}

const CHECK_TIMEOUT = 10000; // 10 seconds max timeout
const CHECK_INTERVAL = 500; // Check every 500ms

/**
 * Checks if a TCP port is open.
 * @param {number} port 
 * @returns {Promise<boolean>}
 */
async function checkPort(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();

    const onError = () => {
      socket.destroy();
      resolve(false);
    };

    socket.setTimeout(1000);
    socket.once("error", onError);
    socket.once("timeout", onError);

    socket.connect(port, "127.0.0.1", () => {
      socket.end();
      resolve(true);
    });
  });
}

async function run() {
  console.log("Starting validation of Puding Server...");
  console.log(`Using configuration from: ${dotenvPath}`);

  // Path to main.js in dist of apps/server
  const serverPath = path.resolve(__dirname, "../apps/server/dist/main.js");
  
  if (!fs.existsSync(serverPath)) {
    console.error(`\x1b[31mError: Server build file not found at ${serverPath}. Please run a build first.\x1b[0m`);
    process.exit(1);
  }

  // Spawn the server process, inheriting the parent environment variables
  console.log(`Spawning server process at: ${serverPath} on port ${port}...`);
  const server = spawn("node", [serverPath], {
    env: process.env,
    cwd: path.resolve(__dirname, "../apps/server"),
    stdio: "pipe",
  });

  let serverOutput = "";
  server.stdout.on("data", (data) => {
    serverOutput += data.toString();
  });
  
  server.stderr.on("data", (data) => {
    serverOutput += data.toString();
  });

  let isRunning = false;
  const startTime = Date.now();

  // Wait for the port to be open
  while (Date.now() - startTime < CHECK_TIMEOUT) {
    // Check if the process exited early
    if (server.killed || server.exitCode !== null) {
      console.error("\x1b[31mServer process exited prematurely!\x1b[0m");
      console.error("Server output:\n", serverOutput);
      process.exit(1);
    }

    const open = await checkPort(port);
    if (open) {
      isRunning = true;
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, CHECK_INTERVAL));
  }

  // Terminate the server
  console.log("Stopping server process...");
  server.kill("SIGTERM");

  // Wait for it to close
  await new Promise((resolve) => {
    server.on("close", () => resolve());
    // Force kill if it doesn't close in 2s
    setTimeout(() => {
      server.kill("SIGKILL");
      resolve();
    }, 2000);
  });

  if (isRunning) {
    console.log("\x1b[32mValidation successful! Server started and responded successfully.\x1b[0m");
    process.exit(0);
  } else {
    console.error(`\x1b[31mValidation failed! Server port ${port} did not open within ${CHECK_TIMEOUT}ms.\x1b[0m`);
    console.error("Server output:\n", serverOutput);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Validation script error:", err);
  process.exit(1);
});
