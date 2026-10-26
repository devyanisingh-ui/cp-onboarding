import { db } from './context';

/**
 * Next readable ID in a sequence, e.g. nextId('task', 'T-') → "T-0042".
 * The increment takes a row lock that is held until the transaction ends, so two requests
 * creating records at the same time can never receive the same number.
 */
export async function nextId(counter: string, prefix: string, pad = 4): Promise<string> {
  const tx = db();
  await tx.$executeRaw`INSERT INTO Counter (\`key\`, value) VALUES (${counter}, 1) ON DUPLICATE KEY UPDATE value = value + 1`;
  const row = await tx.counter.findUniqueOrThrow({ where: { key: counter } });
  return `${prefix}${String(row.value).padStart(pad, '0')}`;
}
