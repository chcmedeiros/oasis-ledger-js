const README_ANCHOR = "https://github.com/oasisprotocol/ledger-js#migrating-to-the-device-management-kit";

function handRolledTransport() {
  return {
    send: () => Promise.resolve(Buffer.from([0x90, 0x00])),
    decorateAppAPIMethods: () => {},
  };
}

// The "already warned" flag is module state, so each test loads its own copy of the package.
// DMKTransport is loaded in the same registry, or `instanceof` would compare different classes.
function loadFresh() {
  let modules;
  jest.isolateModules(() => {
    modules = {
      // eslint-disable-next-line global-require
      OasisApp: require("../src/index").default,
      // eslint-disable-next-line global-require
      DMKTransport: require("@zondax/ledger-js").DMKTransport,
    };
  });
  return modules;
}

describe("legacy transport deprecation", () => {
  let warn;
  let OasisApp;
  let DMKTransport;

  beforeEach(() => {
    ({ OasisApp, DMKTransport } = loadFresh());
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  test("warns when constructed over a non-DMK transport, pointing at the README", () => {
    expect(() => new OasisApp(handRolledTransport())).not.toThrow();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("deprecated"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(README_ANCHOR));
  });

  test("warns once per process, not once per app", () => {
    expect(() => new OasisApp(handRolledTransport())).not.toThrow();
    expect(() => new OasisApp(handRolledTransport())).not.toThrow();

    expect(warn).toHaveBeenCalledTimes(1);
  });

  test("stays silent over a DMKTransport", () => {
    const dmk = {
      sendApdu: () => Promise.resolve({ statusCode: Uint8Array.from([0x90, 0x00]), data: new Uint8Array() }),
    };

    expect(() => new OasisApp(new DMKTransport(dmk, "session-1"))).not.toThrow();

    expect(warn).not.toHaveBeenCalled();
  });

  test("still rejects a missing transport before warning", () => {
    expect(() => new OasisApp(undefined)).toThrow("Transport has not been defined");
    expect(warn).not.toHaveBeenCalled();
  });
});
