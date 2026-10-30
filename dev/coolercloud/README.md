# CoolerCloud Emulator

CoolerCloud does not exist yet. These scripts stand in for it during local development so the
app and CoolerBridge can be exercised end to end.

## How the pieces fit together

```
Coolify  ->  CoolerBridge  ->  Expo  ->  device
                  ^
                  | verifies assertions with the cloud public key
                  |
Cooler (app)  ->  CoolerCloud (emulated here)  issues signed assertions
```

- **CoolerCloud** holds the Ed25519 private key and issues short lived JWT assertions (pairing and
  access). The emulator signs these exactly the way CoolerBridge expects.
- **CoolerBridge** verifies the assertions with the matching public key, mints its own opaque
  `cbt_` session tokens, stores Coolify webhook events, and pushes them to devices through Expo.
- **Cooler** signs into CoolerCloud, exchanges an access assertion for a bridge session, registers
  its Expo push token, and receives events.

## Scripts

| Command | Description |
|---|---|
| `bun run cloud:keys` | Generate the Ed25519 keypair into `dev/coolercloud/keys/`. |
| `bun run cloud:serve` | Start the emulated CoolerCloud HTTP server (default port 4000). |
| `bun run cloud:emulate -- --flow success` | Run the full device flow against a bridge and report each step. |
| `bun run cloud:emulate -- --flow fail` | Run flows that must be rejected and assert the bridge refuses them. |

## Setup

1. Generate the keys:

   ```bash
   bun run cloud:keys
   ```

   The public key is printed and written to `dev/coolercloud/keys/cooler-public.pem`. Configure it
   on CoolerBridge as `CLOUD_PUBLIC_KEY` (single line, newlines as `\n`), or drop it in the bridge's
   own `dev/keys/cooler-public.pem` when running the bridge in development mode. The private key
   stays here and is gitignored.

2. Start CoolerBridge locally (it listens on port 3000 by default).

3. Start the emulator:

   ```bash
   bun run cloud:serve
   ```

   On startup it provisions a bridge and pairs it to the development account, so the exchange flow
   works immediately. If the bridge is not reachable it still serves sign in, just without a linked
   bridge.

4. Point the app at the emulator. Set the base URL through an Expo public env var before starting
   the app:

   ```bash
   EXPO_PUBLIC_COOLER_CLOUD_URL=http://<your-lan-ip>:4000 bun run dev
   ```

   Use your machine's LAN IP (not `localhost`) so a device or simulator can reach it.

5. Sign in from the app. The browser flow opens the emulator's `/authorize` page, which offers an
   Approve deep link, a typed code, and a scannable QR for the manual and QR sign in paths.

## Verifying without the app

With CoolerBridge running, the emulate script drives the whole chain from the command line:

```bash
bun run cloud:emulate -- --flow success --bridge http://localhost:3000
bun run cloud:emulate -- --flow fail --bridge http://localhost:3000
```

The success flow pairs a bridge, exchanges an assertion, registers a device, delivers a Coolify
webhook, and reads the event back. The fail flow asserts that tampered, expired, malformed, and
under scoped credentials are rejected, and that reused pairing codes are refused.

The unit tests in `tests/coolercloud-*.test.ts` cover the signing, client, and session logic and
run without a bridge via `bun test`.
