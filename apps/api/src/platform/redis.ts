import type { SecondaryStorage } from "better-auth";
import Redis from "ioredis";

const incrementScript = `
  local current = redis.call('INCR', KEYS[1])
  if current == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  return current
`;

const getAndDeleteScript = `
  local value = redis.call('GET', KEYS[1])
  if value then
    redis.call('DEL', KEYS[1])
  end
  return value
`;

export function createRedisClient(url: string): Redis {
  return new Redis(url, {
    connectTimeout: 5_000,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
}

export function createRedisSecondaryStorage(redis: Redis): SecondaryStorage {
  return {
    async delete(key) {
      await redis.del(key);
    },
    async get(key) {
      const value = await redis.get(key);
      return value;
    },
    async getAndDelete(key) {
      const value = await redis.eval(getAndDeleteScript, 1, key);
      return value === null ? null : String(value);
    },
    async increment(key, ttl) {
      return Number(await redis.eval(incrementScript, 1, key, ttl));
    },
    async set(key, value, ttl) {
      if (ttl === undefined) {
        await redis.set(key, value);
      } else {
        await redis.set(key, value, "EX", ttl);
      }
    },
  };
}
