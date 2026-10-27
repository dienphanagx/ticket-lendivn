import { NAV_LABELS } from '@/constants/messages';

// Khung trang chủ; danh sách sự kiện (§B) dựng ở feature
export default function HomePage() {
  return <h1 className="text-xl font-semibold">{NAV_LABELS.EVENTS}</h1>;
}
