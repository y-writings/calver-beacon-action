import { setFailed } from './action/core';
import { run } from './main';

void run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  setFailed(message);
});
