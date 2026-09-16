/**
 * The transport surface this package actually needs: `OasisApp` calls `send` and
 * `decorateAppAPIMethods`, nothing else.
 *
 * Describing those two methods structurally, rather than naming `Transport` from
 * `@ledgerhq/hw-transport`, lets the app accept either a legacy `Transport` or a
 * `DMKTransport` built on Ledger's Device Management Kit, which replaces hw-transport
 * ahead of the September 2026 cutoff. A hw-transport `Transport` satisfies it as-is,
 * and describing it here is what lets that package leave our dependencies entirely.
 *
 * Passing anything other than a `DMKTransport` is deprecated, though: `OasisApp`'s
 * constructor marks that overload `@deprecated` and logs a one-time warning, and the next
 * major accepts only `DMKTransport`.
 */
export interface LedgerTransport {
  send: (
    cla: number,
    ins: number,
    p1: number,
    p2: number,
    data?: Buffer,
    statusList?: number[],
    options?: { abortTimeoutMs?: number },
  ) => Promise<Buffer>;
  decorateAppAPIMethods: (self: Record<string, any>, methods: string[], scrambleKey: string) => void;
}

/**
 * @deprecated Renamed to {@link LedgerTransport}, and no longer `Transport` from
 * `@ledgerhq/hw-transport` -- that package is being retired, so it is gone from this
 * package's dependencies and its type can no longer be re-exported.
 *
 * The alias keeps `import type { Transport }` resolving, and a hw-transport `Transport`
 * still satisfies it, so passing one is unaffected. What no longer typechecks is
 * *reaching through* this type for a hw-transport member -- `close`, `exchange`, `on`.
 * Import `Transport` from `@ledgerhq/hw-transport` directly if you need those, or
 * annotate with the concrete transport class you construct.
 */
export type Transport = LedgerTransport;

// Ledger transports throw this shape; keep it local so we do not depend on hw-transport types.
export interface TransportStatusError extends Error {
  statusCode: number;
  statusText: "UNKNOWN_ERROR";
}

export type DerivationPath = number[];

/**
 * Generic in the transport so `app.transport` keeps whatever was passed in, rather than
 * collapsing to {@link LedgerTransport} and losing that transport's other members.
 */
export interface App<T extends LedgerTransport = LedgerTransport> {
  transport: T;
}

export type Response<T> =
  T & {
    return_code: number;
    error_message: string;
  } | {
    return_code: number;
    error_message: string;
  };

export type AsyncResponse<T> = Promise<Response<T>>;
