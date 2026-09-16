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
`DMKTransport` from it, so depend on it directly and keep a single copy in your tree: a `DMKTransport` from a second copy
fails the `instanceof` check and is treated as a legacy transport.

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
