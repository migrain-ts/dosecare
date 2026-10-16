export function createLifecycle(o: {
  pool: { end(): Promise<void> };
  cycle: () => Promise<unknown>;
  everyMs: number;
  log: (line: string) => void;
  logError: (msg: string, err: unknown) => void;
}) {
  let stopping = false;
  let timer: NodeJS.Timeout | undefined;
  let running: Promise<void> | undefined;
  let done: Promise<void> | undefined;

  function tick() {
    timer = undefined;
    running = (async () => {
      try {
        o.log(JSON.stringify(await o.cycle()));
      } catch (err) {
        o.logError('[worker] cycle failed', err);
      }
      running = undefined;
      if (!stopping) timer = setTimeout(tick, o.everyMs);
    })();
  }

  return {
    start: tick,
    // Idempotent: waits for a running cycle, ends the pool exactly once.
    stop(): Promise<void> {
      if (done) return done;
      stopping = true;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      done = (running ?? Promise.resolve()).then(() => o.pool.end()).catch((err) => o.logError('[worker] pool.end failed', err));
      return done;
    },
  };
}
