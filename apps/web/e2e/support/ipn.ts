import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { expect } from '@playwright/test';

// e2e/support → apps/web/e2e/support; root repo cách 4 cấp (cwd của `docker compose`)
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const EXEC_TIMEOUT_MS = 30_000;

export type IpnScenario = 'success' | 'duplicate' | 'bad-signature' | 'bad-amount';

/**
 * Chạy `send-ipn` trong container api (apps/api/src/scripts/send-ipn.ts): script tự ký bằng khoá
 * VNPay thử nghiệm trong env của container; spec không đọc, không in khoá.
 * Exit code ≠ 0 (RspCode lệch mong đợi) → `execFileSync` throw. Trả stdout của script.
 */
export function sendIpn(orderId: string, amountVnd: number, scenario: IpnScenario, txn: string) {
  const stdout = execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'api',
      'node',
      'dist/scripts/send-ipn.js',
      orderId,
      String(amountVnd),
      scenario,
      '--txn',
      txn,
    ],
    { cwd: REPO_ROOT, encoding: 'utf8', timeout: EXEC_TIMEOUT_MS },
  );
  expect(stdout).toContain(`scenario=${scenario}`);
  return stdout;
}
