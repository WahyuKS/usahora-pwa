// One-at-a-time execution with an honest wait limit, shared by the web and native repositories.
//
// Guarantee: an operation that is rejected with QueueTimeoutError was NEVER started and never will be.
// The limit only applies while the operation is still waiting for its turn. Once it has started it
// cannot be cancelled, so it is never reported as failed early: the caller always gets its real result.
// That makes a retry after a QueueTimeoutError safe (the write happens exactly once).

export class QueueTimeoutError extends Error {
  constructor(what = "Operasi penyimpanan") {
    super(
      `${what} menunggu terlalu lama dan TIDAK dijalankan. Aman untuk dicoba lagi. ` +
        "(Jangan memanggil repo di dalam transaction; gunakan tx.)",
    );
    this.name = "QueueTimeoutError";
  }
}

export const DEFAULT_WAIT_LIMIT_MS = 15000;

export function createSerialQueue(waitLimitMs = DEFAULT_WAIT_LIMIT_MS) {
  let tail: Promise<unknown> = Promise.resolve();

  function run<T>(fn: () => Promise<T>): Promise<T> {
    let state: "waiting" | "started" | "cancelled" = "waiting";
    let timer: ReturnType<typeof setTimeout> | undefined;

    const result = new Promise<T>((resolve, reject) => {
      timer = setTimeout(() => {
        if (state !== "waiting") return;
        state = "cancelled"; // decided before the turn came: fn will be skipped
        reject(new QueueTimeoutError());
      }, waitLimitMs);

      const turn = tail.then(async () => {
        clearTimeout(timer);
        if (state === "cancelled") return; // never run an operation already reported as failed
        state = "started";
        try {
          resolve(await fn());
        } catch (e) {
          reject(e);
        }
      });
      tail = turn.catch(() => {});
    });
    return result;
  }

  /** Resolves when everything queued so far has finished (used before re-opening a closed repo). */
  const drained = () => tail.then(() => undefined);

  return { run, drained };
}
