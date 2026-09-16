# ledger-js

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![CI test status][github-ci-tests-badge]][github-ci-tests-link]

<!-- markdownlint-disable line-length -->
[github-ci-tests-badge]: https://github.com/oasisprotocol/ledger-js/workflows/ci-tests/badge.svg
[github-ci-tests-link]: https://github.com/oasisprotocol/ledger-js/actions?query=workflow:ci-tests+branch:master
<!-- markdownlint-enable line-length -->

This package provides a basic client library to communicate with the Oasis apps running on a Ledger Nano S/X.

We recommend using the npmjs package in order to receive updates/fixes.

![Example](docs/example.png)

## Migrating to the Device Management Kit

Ledger deprecated LedgerJS (`@ledgerhq/hw-transport` and the `@ledgerhq/hw-transport-*` packages) in favour of the
[Device Management Kit](https://github.com/LedgerHQ/device-sdk-ts) (DMK). Since 2.0.0, `OasisApp` accepts a
`DMKTransport` from [`@zondax/ledger-js`](https://github.com/Zondax/ledger-js), which adapts a DMK session to the
transport interface this package uses.

### Upgrading to 2.0.0

Upgrading and migrating are separate steps: 2.0.0 still accepts your existing transport.

- **LedgerJS transports still work, but are deprecated.** `new OasisApp(transport)` is struck through in editors and
  logs a one-time `console.warn`. The next major version accepts only `DMKTransport`.
- **Node.js 20 or newer.** `@zondax/ledger-js` declares `engines.node >=20`, which yarn classic enforces on install.
- **The exported `Transport` type is narrower.** `@ledgerhq/hw-transport` is no longer a dependency, so this package's
  `Transport` is now an alias of `LedgerTransport`, which only has `send` and `decorateAppAPIMethods`. Passing a
  LedgerJS transport still typechecks. Calling `close()`, `exchange()` or `on()` through this package's type, or
  through `app.transport` on a bare `OasisApp` annotation, does not: import `Transport` from `@ledgerhq/hw-transport`,
  or annotate `OasisApp<TransportWebUSB>` (inference does this for you on `new OasisApp(transport)`).

### From `@ledgerhq/hw-transport-webusb`

In the browser, the DMK talks to the device over WebHID instead of WebUSB.

```sh
yarn add @ledgerhq/device-management-kit @ledgerhq/device-transport-kit-web-hid rxjs @zondax/ledger-js
```

`rxjs` is a peer dependency of the DMK. `@zondax/ledger-js` already comes with this package, but you import
`DMKTransport` from it, so depend on it directly and keep a single copy in your tree: a `DMKTransport` from a second
copy fails the `instanceof` check and is treated as a legacy transport.

Before:

```ts
import TransportWebUSB from "@ledgerhq/hw-transport-webusb";
import OasisApp from "@oasisprotocol/ledger";

const transport = await TransportWebUSB.create();
try {
  const app = new OasisApp(transport);
  // ...
} finally {
  await transport.close();
}
```

After:

```ts
import { DeviceManagementKitBuilder } from "@ledgerhq/device-management-kit";
import { webHidTransportFactory } from "@ledgerhq/device-transport-kit-web-hid";
import OasisApp from "@oasisprotocol/ledger";
import { DMKTransport } from "@zondax/ledger-js";
import { firstValueFrom } from "rxjs";

// Build once and reuse it.
const dmk = new DeviceManagementKitBuilder().addTransport(webHidTransportFactory).build();

// Run this from a user gesture, such as a click handler: it opens the browser's device picker.
const device = await firstValueFrom(dmk.startDiscovering({}));
const sessionId = await dmk.connect({
  device,
  // See "Disable the session refresher" below.
  sessionRefresherOptions: { isRefresherDisabled: true },
});
try {
  const app = new OasisApp(new DMKTransport(dmk, sessionId));
  // ...
} finally {
  await dmk.disconnect({ sessionId });
}
```

| `@ledgerhq/hw-transport-webusb` | Device Management Kit |
| --- | --- |
| `TransportWebUSB.isSupported()` | `dmk.isEnvironmentSupported()` (synchronous) |
| `TransportWebUSB.create()` | `dmk.startDiscovering({})`, then `dmk.connect({ device, ... })` |
| `new OasisApp(transport)` | `new OasisApp(new DMKTransport(dmk, sessionId))` |
| `transport.close()` | `dmk.disconnect({ sessionId })` |
| picker cancelled: rejects with `No device selected.` | rejects with a DMK error whose `_tag` is `NoAccessibleDeviceError` |

Things that behave differently:

- **Users grant access again.** Browsers keep WebUSB and WebHID permissions apart, so a device allowed for WebUSB has
  to be picked once more. Both APIs are only available in Chromium-based browsers.
- **The picker opens every time.** `TransportWebUSB.create()` silently reuses a device the user already granted;
  `startDiscovering` always prompts. `dmk.listenToAvailableDevices({})` lists the already-granted devices, so you can
  connect to one of those without prompting.
- **Disable the session refresher.** By default the DMK polls the device every second, on the same queue
  `DMKTransport` sends on, so a poll can land between two chunks of a signing request. Pass
  `sessionRefresherOptions: { isRefresherDisabled: true }` to `connect`, as in the example.
- **One call at a time, as before.** Starting a second `OasisApp` call while one is in flight rejects with
  `DMKTransportLockedError`, which carries the same `id` (`TransportLocked`) as the LedgerJS error.
- **Device errors are unchanged.** Status words still come back as `return_code` and `error_message`, so
  `successOrThrow` and existing return-code handling keep working. Connection problems surface as DMK errors, which
  you identify by `_tag` rather than by message.

### Method by method

Once you have an `app`, the calls themselves do not change: every method keeps its name, arguments, response fields
and status codes. Only the lines that open and close the connection differ, so each example below is a diff from the
`hw-transport-webusb` version to the DMK version, reusing `dmk` and `device` from the example above.

Paths are arrays of numbers. For ed25519, use the ADR 8 path `[44, 474, index]` (or the legacy
`[44, 474, 0, 0, index]`); every component is hardened for you. For secp256k1, use the BIP-44 path
`[44, 60, 0, 0, index]` with unhardened values; the first three components are hardened for you. A malformed path
throws an `Error` rather than returning a `return_code`.

| Method | On the device | Returns, besides `return_code` and `error_message` |
| --- | --- | --- |
| [`getVersion()`](#getversion) | nothing to confirm | `major`, `minor`, `patch`, `test_mode`, `device_locked`, `target_id` |
| [`appInfo()`](#appinfo) | nothing to confirm | `appName`, `appVersion`, `flagLen`, `flagsValue`, `flag_recovery`, `flag_signed_mcu_code`, `flag_onboarded`, `flag_pin_validated` |
| [`deviceInfo()`](#deviceinfo) | nothing to confirm; dashboard only | `targetId`, `seVersion`, `flag`, `mcuVersion` |
| [`publicKey(path)`](#publickey) | nothing to confirm | `pk` |
| [`getAddressAndPubKey_ed25519(path)`](#getaddressandpubkey_ed25519) | nothing to confirm | `bech32_address`, `pk` |
| [`showAddressAndPubKey_ed25519(path)`](#showaddressandpubkey_ed25519) | user confirms the address | `bech32_address`, `pk` |
| [`getAddressAndPubKey_secp256k1(path)`](#getaddressandpubkey_secp256k1) | nothing to confirm | `hex_address`, `pk` |
| [`showAddressAndPubKey_secp256k1(path)`](#showaddressandpubkey_secp256k1) | user confirms the address | `hex_address`, `pk` |
| [`sign(path, context, message)`](#sign) | user reviews and approves | `signature` |
| [`signRtEd25519(path, meta, message)`](#signrted25519) | user reviews and approves | `signature` |
| [`signRtSecp256k1(path, meta, message)`](#signrtsecp256k1) | user reviews and approves | `signature` |

For the methods that wait for the user (`show*` and `sign*`):

- **There is no timeout by default.** Neither the DMK nor `DMKTransport` aborts an exchange unless you pass
  `abortTimeout`, as in `new DMKTransport(dmk, sessionId, { abortTimeout })`. If you do, leave the user time to read
  the screen.
- **Rejecting on the device** comes back as `return_code` `0x6986`, as before.

#### `getVersion`

The Oasis app's version, and whether it runs in test mode or the device is locked.

```diff
-const transport = await TransportWebUSB.create();
-const app = new OasisApp(transport);
+const sessionId = await dmk.connect({ device, sessionRefresherOptions: { isRefresherDisabled: true } });
+const app = new OasisApp(new DMKTransport(dmk, sessionId));
 try {
   const { major, minor, patch, test_mode, device_locked } = successOrThrow(await app.getVersion());
 } finally {
-  await transport.close();
+  await dmk.disconnect({ sessionId });
 }
```

#### `appInfo`

The name and version of the app open on the device. Check it before anything else, to tell the user to open the
Oasis app.

```diff
-const transport = await TransportWebUSB.create();
-const app = new OasisApp(transport);
+const sessionId = await dmk.connect({ device, sessionRefresherOptions: { isRefresherDisabled: true } });
+const app = new OasisApp(new DMKTransport(dmk, sessionId));
 try {
   const { appName, appVersion } = successOrThrow(await app.appInfo());
   if (appName !== "Oasis") throw new Error("Open the Oasis app on the device");
 } finally {
-  await transport.close();
+  await dmk.disconnect({ sessionId });
 }
```

#### `deviceInfo`

The secure element and MCU firmware versions. The device only answers this from the dashboard: while an app is
open, the Oasis app included, it returns `return_code` `0x6e00` and `successOrThrow` throws.

```diff
-const transport = await TransportWebUSB.create();
-const app = new OasisApp(transport);
+const sessionId = await dmk.connect({ device, sessionRefresherOptions: { isRefresherDisabled: true } });
+const app = new OasisApp(new DMKTransport(dmk, sessionId));
 try {
   const { seVersion, mcuVersion } = successOrThrow(await app.deviceInfo());
 } finally {
-  await transport.close();
+  await dmk.disconnect({ sessionId });
 }
```

#### `publicKey`

The 32-byte ed25519 public key for a path, without showing anything on the device.

```diff
-const transport = await TransportWebUSB.create();
-const app = new OasisApp(transport);
+const sessionId = await dmk.connect({ device, sessionRefresherOptions: { isRefresherDisabled: true } });
+const app = new OasisApp(new DMKTransport(dmk, sessionId));
 try {
   const { pk } = successOrThrow(await app.publicKey([44, 474, 0]));
 } finally {
-  await transport.close();
+  await dmk.disconnect({ sessionId });
 }
```

#### `getAddressAndPubKey_ed25519`

The bech32 address (`oasis1...`) and 32-byte ed25519 public key for a path, without showing anything on the device.

```diff
-const transport = await TransportWebUSB.create();
-const app = new OasisApp(transport);
+const sessionId = await dmk.connect({ device, sessionRefresherOptions: { isRefresherDisabled: true } });
+const app = new OasisApp(new DMKTransport(dmk, sessionId));
 try {
   const { bech32_address, pk } = successOrThrow(await app.getAddressAndPubKey_ed25519([44, 474, 0]));
 } finally {
-  await transport.close();
+  await dmk.disconnect({ sessionId });
 }
```

#### `showAddressAndPubKey_ed25519`

Same response as `getAddressAndPubKey_ed25519`, but the device shows the address and waits for the user to confirm
it.

```diff
-const transport = await TransportWebUSB.create();
-const app = new OasisApp(transport);
+const sessionId = await dmk.connect({ device, sessionRefresherOptions: { isRefresherDisabled: true } });
+const app = new OasisApp(new DMKTransport(dmk, sessionId));
 try {
   const { bech32_address } = successOrThrow(await app.showAddressAndPubKey_ed25519([44, 474, 0]));
 } finally {
-  await transport.close();
+  await dmk.disconnect({ sessionId });
 }
```

#### `getAddressAndPubKey_secp256k1`

The address (40 hex characters, no `0x` prefix) and 33-byte compressed secp256k1 public key for a BIP-44 path,
without showing anything on the device.

```diff
-const transport = await TransportWebUSB.create();
-const app = new OasisApp(transport);
+const sessionId = await dmk.connect({ device, sessionRefresherOptions: { isRefresherDisabled: true } });
+const app = new OasisApp(new DMKTransport(dmk, sessionId));
 try {
   const { hex_address, pk } = successOrThrow(await app.getAddressAndPubKey_secp256k1([44, 60, 0, 0, 0]));
 } finally {
-  await transport.close();
+  await dmk.disconnect({ sessionId });
 }
```

#### `showAddressAndPubKey_secp256k1`

Same response as `getAddressAndPubKey_secp256k1`, but the device shows the address and waits for the user to
confirm it.

```diff
-const transport = await TransportWebUSB.create();
-const app = new OasisApp(transport);
+const sessionId = await dmk.connect({ device, sessionRefresherOptions: { isRefresherDisabled: true } });
+const app = new OasisApp(new DMKTransport(dmk, sessionId));
 try {
   const { hex_address } = successOrThrow(await app.showAddressAndPubKey_secp256k1([44, 60, 0, 0, 0]));
 } finally {
-  await transport.close();
+  await dmk.disconnect({ sessionId });
 }
```

#### `sign`

Signs a consensus transaction with ed25519. `context` is the signature context,
`oasis-core/consensus: tx for chain <chain context>`, and `message` is the CBOR-encoded transaction. The device shows
the transaction and waits for the user to approve it. The signature is 64 bytes.

```diff
-const transport = await TransportWebUSB.create();
-const app = new OasisApp(transport);
+const sessionId = await dmk.connect({ device, sessionRefresherOptions: { isRefresherDisabled: true } });
+const app = new OasisApp(new DMKTransport(dmk, sessionId));
 try {
   const { signature } = successOrThrow(await app.sign([44, 474, 0], context, message));
 } finally {
-  await transport.close();
+  await dmk.disconnect({ sessionId });
 }
```

#### `signRtEd25519`

Signs a runtime (ParaTime) transaction with ed25519. `meta` is a CBOR map with `runtime_id` and `chain_context`, and
`message` is the CBOR-encoded runtime transaction. The device shows the transaction and waits for the user to approve
it. The signature is 64 bytes.

```diff
-const transport = await TransportWebUSB.create();
-const app = new OasisApp(transport);
+const sessionId = await dmk.connect({ device, sessionRefresherOptions: { isRefresherDisabled: true } });
+const app = new OasisApp(new DMKTransport(dmk, sessionId));
 try {
   const { signature } = successOrThrow(await app.signRtEd25519([44, 474, 0], meta, message));
 } finally {
-  await transport.close();
+  await dmk.disconnect({ sessionId });
 }
```

#### `signRtSecp256k1`

Same as `signRtEd25519`, for a secp256k1 account on a BIP-44 path. The signature is `r || s || v`: drop the last
byte to verify it as a plain ECDSA signature.

```diff
-const transport = await TransportWebUSB.create();
-const app = new OasisApp(transport);
+const sessionId = await dmk.connect({ device, sessionRefresherOptions: { isRefresherDisabled: true } });
+const app = new OasisApp(new DMKTransport(dmk, sessionId));
 try {
   const { signature } = successOrThrow(await app.signRtSecp256k1([44, 60, 0, 0, 0], meta, message));
 } finally {
-  await transport.close();
+  await dmk.disconnect({ sessionId });
 }
```

### Other environments

| LedgerJS | DMK transport kit |
| --- | --- |
| `@ledgerhq/hw-transport-node-hid` | `@ledgerhq/device-transport-kit-node-hid` (`nodeHidTransportFactory`) |
| `@ledgerhq/hw-transport-web-ble` | `@ledgerhq/device-transport-kit-web-ble` (`webBleTransportFactory`) |
| `@ledgerhq/react-native-hw-transport-ble` | `@ledgerhq/device-transport-kit-react-native-ble` (`RNBleTransportFactory`) |

Outside the browser there is no picker: find the device with `dmk.listenToAvailableDevices({})`.

If no kit exists for your platform (a Capacitor or Ionic app, for example), `addTransport` accepts any DMK
`TransportFactory`, so you can write one. Until then, your LedgerJS transport keeps working in 2.x, with the
deprecation warning.
