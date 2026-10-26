import { db } from './context';
import { defineFeature } from './rpc';

/** platform.health: is the server up and can it reach the database? Public, for load balancers. */
defineFeature('platform', {
  health: {
    public: true,
    handler: async () => {
      const [row] = await db().$queryRaw<{ now: Date }[]>`SELECT NOW(3) AS now`;
      return { ok: true, database: 'up', time: row!.now.toISOString() };
    },
  },
});
