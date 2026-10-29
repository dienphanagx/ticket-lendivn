// UUID v4 (RFC 9562 § 5.4) từ `crypto.getRandomValues`: chạy cả ở trang HTTP không phải localhost,
// nơi `crypto.randomUUID` không có (chỉ có trong secure context)
const BYTE_COUNT = 16;
const VERSION_BYTE = 6;
const VARIANT_BYTE = 8;
const HEX_GROUPS = [8, 4, 4, 4, 12] as const;

export function uuidV4(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(BYTE_COUNT));
  bytes[VERSION_BYTE] = ((bytes[VERSION_BYTE] ?? 0) & 0x0f) | 0x40; // version 4
  bytes[VARIANT_BYTE] = ((bytes[VARIANT_BYTE] ?? 0) & 0x3f) | 0x80; // variant 10xx
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  let offset = 0;
  return HEX_GROUPS.map((length) => {
    const group = hex.slice(offset, offset + length);
    offset += length;
    return group;
  }).join('-');
}
