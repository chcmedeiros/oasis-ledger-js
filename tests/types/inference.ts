/**
 * Type-only test: `yarn test:types` compiles this file and never runs it.
 *
 * It compiles against the emitted `dist/*.d.ts`, which is what consumers see, rather than `src`.
 * Against the JS source, TypeScript does not carry the class template into construct signatures
 * built from JSDoc `@overload`, so no transport can bind `T`; the emitted declarations are plain
 * TypeScript and infer it from the argument.
 *
 * Each `@ts-expect-error` asserts something that must not compile. If it starts compiling, `tsc`
 * fails with "Unused '@ts-expect-error' directive".
 */
import OasisApp, { successOrThrow } from "@oasisprotocol/ledger";
import type { Transport } from "@oasisprotocol/ledger/dist/types";
import TransportWebUSB from "@ledgerhq/hw-transport-webusb";
import { DMKTransport } from "@zondax/ledger-js";

export async function transportInference() {
  const usb = await TransportWebUSB.create();

  // `T` is inferred from a hw-transport, so its own members survive.
  const usbApp = new OasisApp(usb);
  await usbApp.transport.close();
  // @ts-expect-error `T` is that transport, not `any`.
  usbApp.transport.sendApdu();

  // A DMK-only member survives the same way.
  const dmk = { sendApdu: async () => ({ statusCode: new Uint8Array(), data: new Uint8Array() }) };
  const dmkApp = new OasisApp(new DMKTransport(dmk, "session"));
  dmkApp.transport.setScrambleKey("x");
  // @ts-expect-error DMKTransport has no close.
  await dmkApp.transport.close();

  // A bare annotation falls back to the structural default.
  const bare: OasisApp = new OasisApp(usb);
  await bare.transport.send(0x05, 0x00, 0, 0);
  // @ts-expect-error close is not on LedgerTransport.
  await bare.transport.close();

  // The fix for a bare annotation: name the transport type.
  const annotated: OasisApp<typeof usb> = new OasisApp(usb);
  await annotated.transport.close();

  // The deprecated alias still accepts a hw-transport...
  const alias: Transport = usb;
  // @ts-expect-error ...but reaching through it for a hw-transport member no longer typechecks.
  await alias.close();

  // @ts-expect-error A transport without `send` is rejected.
  new OasisApp({ decorateAppAPIMethods: () => {} });
}

// Response types do not depend on the transport, so a bare `OasisApp` covers them.
export async function responseTypes(app: OasisApp) {
  successOrThrow(await app.getVersion()).major.toFixed();
  successOrThrow(await app.appInfo()).appName.trim();
  successOrThrow(await app.deviceInfo()).mcuVersion.trim();
  successOrThrow(await app.publicKey([44])).pk.byteLength.toFixed();
  successOrThrow(await app.getAddressAndPubKey_ed25519([44])).bech32_address.trim();
  successOrThrow(await app.showAddressAndPubKey_ed25519([44])).bech32_address.trim();
  successOrThrow(await app.getAddressAndPubKey_secp256k1([44])).hex_address.trim();
  successOrThrow(await app.showAddressAndPubKey_secp256k1([44])).hex_address.trim();

  const ctx = "oasis-core/consensus";
  const msg = Buffer.from("a");
  successOrThrow(await app.sign([44], ctx, msg)).signature?.byteLength.toFixed();
}
