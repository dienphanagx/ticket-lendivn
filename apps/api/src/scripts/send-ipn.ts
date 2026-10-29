import { randomInt } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import * as z from 'zod';

import { AppEnv } from '../config/env.js';
import { orderIdSchema } from '../features/orders/order-id.js';
import { signVnpayParams, VNP_SECURE_HASH } from '../features/payments/vnpay-signature.js';
import { buildOrderInfo, formatVnpayDate, toVnpayAmount } from '../features/payments/vnpay.js';

// Gửi IPN có chữ ký thật (khoá `VNPAY_HASH_SECRET`) tới api local để test luồng thanh toán không cần
// VNPay (specs/architecture.md § Các Quyết Định Kỹ Thuật → Script gửi IPN). Không in khoá, không in
// URL / tham số đã ký (chứa `vnp_TmnCode`).
//
//   node dist/scripts/send-ipn.js <mã đơn> <số tiền VND> <kịch bản> [--txn <số>] [--url <IPN URL>]

export const IpnScenario = {
  SUCCESS: 'success',
  DUPLICATE: 'duplicate',
  BAD_SIGNATURE: 'bad-signature',
  BAD_AMOUNT: 'bad-amount',
} as const;
export type IpnScenario = (typeof IpnScenario)[keyof typeof IpnScenario];

/** `RspCode` mong đợi của từng kịch bản (spec api § D Nhận Thông Báo Thanh Toán). */
export const EXPECTED_RSP_CODE: Readonly<Record<IpnScenario, string>> = {
  [IpnScenario.SUCCESS]: '00',
  [IpnScenario.DUPLICATE]: '02',
  [IpnScenario.BAD_SIGNATURE]: '97',
  [IpnScenario.BAD_AMOUNT]: '04',
};

const DEFAULT_PORT = 8080;
const IPN_PATH = '/api/v1/payments/vnpay/ipn';
const LOCAL_TMN_CODE = 'LOCALTEST';
const SUCCESS_CODE = '00';
const TEST_BANK_CODE = 'NCB';
const TXN_NO_MIN = 10_000_000;
const TXN_NO_MAX = 99_999_999;
const TXN_NO_PATTERN = /^[0-9]{1,20}$/;
/** `bad-amount`: lệch 1.000 VND so với số tiền đúng. */
const AMOUNT_OFFSET_VND = 1000;
const REQUEST_TIMEOUT_MS = 10_000;
const HEX_DIGITS = '0123456789abcdef';

const scriptEnvSchema = z.object({
  APP_ENV: z.enum([AppEnv.DEVELOPMENT, AppEnv.STAGING, AppEnv.PRODUCTION]),
  VNPAY_HASH_SECRET: z.string().min(1, 'VNPAY_HASH_SECRET is required to sign the IPN'),
  VNPAY_TMN_CODE: z.string().optional(),
  PORT: z.coerce.number().int().min(1).max(65535).default(DEFAULT_PORT),
});

const argsSchema = z.object({
  orderId: orderIdSchema,
  amount: z.coerce.number().int().positive(),
  scenario: z.enum(Object.values(IpnScenario)),
  txn: z.string().regex(TXN_NO_PATTERN).optional(),
  url: z.url({ protocol: /^https?$/ }).optional(),
});

export type SendIpnArgs = z.output<typeof argsSchema>;

export interface IpnScenarioInput {
  orderId: string;
  /** Số tiền VND đúng của đơn (`buyerTotal`). */
  amount: number;
  scenario: IpnScenario;
  tmnCode: string;
  hashSecret: string;
  txnNo: string;
  now: Date;
}

/** Đổi 1 ký tự hex cuối, giữ độ dài 128 → chữ ký sai dạng hợp lệ. */
const tamperHash = (hash: string): string => {
  const last = hash.at(-1) ?? HEX_DIGITS[0];
  const replacement = last === HEX_DIGITS[0] ? HEX_DIGITS[1] : HEX_DIGITS[0];
  return hash.slice(0, -1) + replacement;
};

/** Tham số IPN đã ký cho 1 kịch bản. */
export function buildIpnParams(input: IpnScenarioInput): Record<string, string> {
  const amount =
    input.scenario === IpnScenario.BAD_AMOUNT ? input.amount + AMOUNT_OFFSET_VND : input.amount;
  const params = {
    vnp_TmnCode: input.tmnCode,
    vnp_TxnRef: input.orderId,
    vnp_Amount: String(toVnpayAmount(amount)),
    vnp_OrderInfo: buildOrderInfo(input.orderId),
    vnp_ResponseCode: SUCCESS_CODE,
    vnp_TransactionStatus: SUCCESS_CODE,
    vnp_TransactionNo: input.txnNo,
    vnp_BankCode: TEST_BANK_CODE,
    vnp_PayDate: formatVnpayDate(input.now),
  };
  const hash = signVnpayParams(params, input.hashSecret);
  return {
    ...params,
    [VNP_SECURE_HASH]: input.scenario === IpnScenario.BAD_SIGNATURE ? tamperHash(hash) : hash,
  };
}

export interface SendIpnDeps {
  env: NodeJS.ProcessEnv;
  fetch: typeof fetch;
  /** 1 dòng kết quả ra terminal. */
  print: (line: string) => void;
  now?: () => Date;
}

export interface SendIpnOutcome {
  scenario: IpnScenario;
  txnNo: string;
  expected: string;
  received: string;
  ok: boolean;
}

const ipnResponseSchema = z.object({ RspCode: z.string(), Message: z.string() });

/** Parse tham số dòng lệnh (`argv` không gồm `node` + đường dẫn script). */
export function parseSendIpnArgs(argv: readonly string[]): SendIpnArgs {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: { txn: { type: 'string' }, url: { type: 'string' } },
  });
  const [orderId, amount, scenario] = positionals;
  const parsed = argsSchema.safeParse({ orderId, amount, scenario, ...values });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(
      `Usage: send-ipn <orderId> <amountVnd> <${Object.values(IpnScenario).join('|')}> ` +
        `[--txn <transactionNo>] [--url <ipnUrl>] (${issues.join('; ')})`,
    );
  }
  if (parsed.data.scenario === IpnScenario.DUPLICATE && parsed.data.txn === undefined) {
    throw new Error('Scenario duplicate needs --txn <transactionNo> printed by a success run');
  }
  return parsed.data;
}

/** Gửi 1 kịch bản và so `RspCode` nhận được với mong đợi. */
export async function sendIpn(args: SendIpnArgs, deps: SendIpnDeps): Promise<SendIpnOutcome> {
  const env = scriptEnvSchema.parse(deps.env);
  if (env.APP_ENV === AppEnv.PRODUCTION) {
    // Script tạo ra "tiền" không có thật trong sổ cái
    throw new Error('send-ipn refuses to run when APP_ENV=production');
  }
  const txnNo = args.txn ?? String(randomInt(TXN_NO_MIN, TXN_NO_MAX));
  const params = buildIpnParams({
    orderId: args.orderId,
    amount: args.amount,
    scenario: args.scenario,
    tmnCode: env.VNPAY_TMN_CODE || LOCAL_TMN_CODE,
    hashSecret: env.VNPAY_HASH_SECRET,
    txnNo,
    now: deps.now?.() ?? new Date(),
  });
  const target = new URL(args.url ?? `http://localhost:${env.PORT}${IPN_PATH}`);
  target.search = new URLSearchParams(params).toString();

  const res = await deps.fetch(target, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  const body = ipnResponseSchema.parse(await res.json());
  const expected = EXPECTED_RSP_CODE[args.scenario];
  const outcome = {
    scenario: args.scenario,
    txnNo,
    expected,
    received: body.RspCode,
    ok: body.RspCode === expected,
  };
  deps.print(
    `[send-ipn] scenario=${outcome.scenario} order=${args.orderId} txn=${txnNo} ` +
      `expected=${expected} received=${body.RspCode} (${body.Message}) ${outcome.ok ? 'OK' : 'MISMATCH'}`,
  );
  return outcome;
}

async function main(): Promise<void> {
  const outcome = await sendIpn(parseSendIpnArgs(process.argv.slice(2)), {
    env: process.env,
    fetch,
    print: (line) => process.stdout.write(`${line}\n`),
  });
  process.exitCode = outcome.ok ? 0 : 1;
}

// Chỉ chạy khi gọi trực tiếp (`node dist/scripts/send-ipn.js`), không chạy khi test import
const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
