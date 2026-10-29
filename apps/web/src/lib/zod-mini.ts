// Zod cho code chạy ở trình duyệt: API hàm tree-shake được, chỉ nạp locale `en` (message issue cho log)
import { en } from 'zod/locales';
import { config } from 'zod/mini';

import '@/lib/zod-config';

config(en());

export * from 'zod/mini';
