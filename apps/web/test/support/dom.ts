// File test render import đầu file: `import '../support/dom'`
import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest không bật `globals` nên RTL không tự dọn DOM giữa các test
afterEach(() => cleanup());
