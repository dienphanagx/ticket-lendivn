// Helper số cho NumberInput (.claude/skills/_shared/number-input.md § Helper số)

/** Số chữ số thập phân: 0.01 → 2, 5 → 0, 1e-7 → 7 */
export function decimals(n: number): number {
  const [mantissa = '', exp = '0'] = String(n).split('e');
  return Math.max(0, (mantissa.split('.')[1]?.length ?? 0) - Number(exp));
}

export const clamp = (n: number, min = -Infinity, max = Infinity) =>
  Math.min(max, Math.max(min, n));

export type StepOptions = { step?: number; min?: number; max?: number };

/** Giá trị mới khi bấm − / + */
export function stepNumber(
  current: number | null,
  delta: 1 | -1,
  { step = 1, min, max }: StepOptions,
) {
  if (current === null) return clamp(min ?? 0, min, max);
  const places = Math.max(decimals(step), decimals(current));
  return clamp(Number((current + delta * step).toFixed(places)), min, max);
}

/** Giá trị ô nhập → số; '' (ô rỗng hoặc chuỗi sai như '1e', trình duyệt trả '') → null */
export const toNumber = (s: string): number | null => (s.trim() === '' ? null : Number(s));

/** '' / khoảng trắng / null → undefined */
export const emptyToUndefined = (v: unknown) =>
  v === null || (typeof v === 'string' && v.trim() === '') ? undefined : v;
