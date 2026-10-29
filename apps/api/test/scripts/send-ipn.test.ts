import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { OrderStatus } from '../../src/db/enums.js';
import type { Listing, Order, User } from '../../src/db/types.js';
import {
  IpnScenario,
  parseSendIpnArgs,
  sendIpn,
  type SendIpnDeps,
} from '../../src/scripts/send-ipn.js';
import { buildTestApp } from '../support/app.js';
import {
  buildOrder,
  insertEvent,
  insertListing,
  insertOrder,
  insertUser,
} from '../support/fixtures.js';
import { countLedgerTransactions } from '../support/ledger.js';
import { createTestDb, resetDatabase } from '../support/test-db.js';
import { IPN_URL, TEST_HASH_SECRET, TEST_TMN_CODE, TEST_VNPAY_CONFIG } from '../support/vnpay.js';

const db = createTestDb();

let app: FastifyInstance;
let ipnTarget: string;
let buyer: User;
let listing: Listing;
let order: Order;
let printed: string[];

beforeEach(async () => {
  await resetDatabase(db);
  app = await buildTestApp({ db }, TEST_VNPAY_CONFIG);
  // Server thật trên port ngẫu nhiên: script gọi HTTP như khi chạy trong container
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  ipnTarget = `${address}${IPN_URL}`;
  const seller = await insertUser(db);
  buyer = await insertUser(db);
  const event = await insertEvent(db);
  listing = await insertListing(db, { event_id: event.id, seller_id: seller.id });
  order = await insertOrder(db, buildOrder(listing, buyer.id, 2));
  printed = [];
});

afterEach(async () => {
  await app.close();
});

afterAll(async () => {
  await db.destroy();
});

const deps = (env: NodeJS.ProcessEnv = {}): SendIpnDeps => ({
  env: {
    APP_ENV: 'development',
    VNPAY_HASH_SECRET: TEST_HASH_SECRET,
    VNPAY_TMN_CODE: TEST_TMN_CODE,
    ...env,
  },
  fetch,
  print: (line) => printed.push(line),
});

const run = (scenario: string, extra: string[] = [], target: Order = order) =>
  sendIpn(
    parseSendIpnArgs([
      target.id,
      String(target.buyer_total),
      scenario,
      '--url',
      ipnTarget,
      ...extra,
    ]),
    deps(),
  );

const statusOf = async (orderId = order.id) =>
  (
    await db
      .selectFrom('orders')
      .select('status')
      .where('id', '=', orderId)
      .executeTakeFirstOrThrow()
  ).status;

describe('send-ipn script', () => {
  it('should confirm the success scenario with 00 and mark the order PAID', async () => {
    // Act
    const outcome = await run(IpnScenario.SUCCESS);

    // Assert
    expect(outcome).toMatchObject({ expected: '00', received: '00', ok: true });
    expect(outcome.txnNo).toMatch(/^\d{8}$/);
    expect(await statusOf()).toBe(OrderStatus.PAID);
  });

  it('should get 02 when resending the success transaction as duplicate', async () => {
    // Arrange
    const first = await run(IpnScenario.SUCCESS);

    // Act
    const outcome = await run(IpnScenario.DUPLICATE, ['--txn', first.txnNo]);

    // Assert
    expect(outcome).toMatchObject({ expected: '02', received: '02', ok: true });
    expect(await countLedgerTransactions(db)).toBe(1);
  });

  it('should get 97 for bad-signature and leave the order pending', async () => {
    // Act
    const outcome = await run(IpnScenario.BAD_SIGNATURE);

    // Assert
    expect(outcome).toMatchObject({ expected: '97', received: '97', ok: true });
    expect(await statusOf()).toBe(OrderStatus.PENDING_PAYMENT);
  });

  it('should get 04 for bad-amount and leave the order pending', async () => {
    // Act
    const outcome = await run(IpnScenario.BAD_AMOUNT);

    // Assert
    expect(outcome).toMatchObject({ expected: '04', received: '04', ok: true });
    expect(await statusOf()).toBe(OrderStatus.PENDING_PAYMENT);
    expect(await countLedgerTransactions(db)).toBe(0);
  });

  it('should report a mismatch when the received code differs from the expected one', async () => {
    // Arrange: số tiền dòng lệnh sai → success nhận 04
    const args = parseSendIpnArgs([order.id, '1', IpnScenario.SUCCESS, '--url', ipnTarget]);

    // Act
    const outcome = await sendIpn(args, deps());

    // Assert
    expect(outcome).toMatchObject({ expected: '00', received: '04', ok: false });
    expect(printed.at(-1)).toContain('MISMATCH');
  });

  it('should print the result without the hash secret or the merchant code', async () => {
    // Act
    await run(IpnScenario.SUCCESS);

    // Assert
    expect(printed).toHaveLength(1);
    expect(printed[0]).toContain('expected=00 received=00');
    expect(printed[0]).not.toContain(TEST_HASH_SECRET);
    expect(printed[0]).not.toContain(TEST_TMN_CODE);
  });

  it('should refuse to run when APP_ENV is production', async () => {
    // Arrange
    const args = parseSendIpnArgs([order.id, String(order.buyer_total), IpnScenario.SUCCESS]);

    // Act + Assert
    await expect(sendIpn(args, deps({ APP_ENV: 'production' }))).rejects.toThrow(/production/);
    expect(await statusOf()).toBe(OrderStatus.PENDING_PAYMENT);
  });

  it('should fail when VNPAY_HASH_SECRET is not set', async () => {
    // Arrange
    const args = parseSendIpnArgs([order.id, String(order.buyer_total), IpnScenario.SUCCESS]);

    // Act + Assert
    await expect(sendIpn(args, deps({ VNPAY_HASH_SECRET: '' }))).rejects.toThrow(
      /VNPAY_HASH_SECRET/,
    );
  });

  it.each([
    ['an unknown scenario', ['261029ABCDEFGH12', '1100000', 'refund']],
    ['a malformed order id', ['bad', '1100000', 'success']],
    ['a non-integer amount', ['261029ABCDEFGH12', '12.5', 'success']],
    ['duplicate without --txn', ['261029ABCDEFGH12', '1100000', 'duplicate']],
  ])('should reject %s with a usage error', (_case, argv) => {
    expect(() => parseSendIpnArgs(argv)).toThrow();
  });
});
