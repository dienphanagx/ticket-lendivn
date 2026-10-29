// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { getNonce } from 'get-nonce';
import { describe, expect, it, vi } from 'vitest';

import { StyleNonce } from '@/components/providers/style-nonce';

import '../support/dom';

vi.mock('server-only', () => ({}));
const requestHeaders = new Headers();
vi.mock('next/headers', () => ({ headers: async () => requestHeaders }));

const { getRequestNonce } = await import('@/lib/request-nonce');

describe('StyleNonce', () => {
  it('should hand the nonce to get-nonce for react-style-singleton', () => {
    render(<StyleNonce nonce="nonce-abc" />);

    expect(getNonce()).toBe('nonce-abc');
  });

  it('should keep the document nonce when the root layout re-renders with a newer request nonce', async () => {
    // Module mới: get-nonce giữ nonce ở biến module, test trước đã đặt giá trị
    vi.resetModules();
    const { StyleNonce: FreshStyleNonce } = await import('@/components/providers/style-nonce');
    const { getNonce: getFreshNonce } = await import('get-nonce');
    const { rerender } = render(<FreshStyleNonce nonce="nonce-abc" />);

    rerender(<FreshStyleNonce nonce="nonce-from-server-action" />);

    expect(getFreshNonce()).toBe('nonce-abc');
  });
});

describe('getRequestNonce', () => {
  it('should read the nonce the proxy put on the request', async () => {
    requestHeaders.set('x-nonce', 'nonce-from-proxy');

    await expect(getRequestNonce()).resolves.toBe('nonce-from-proxy');
  });

  it('should return undefined when the request has no nonce', async () => {
    requestHeaders.delete('x-nonce');

    await expect(getRequestNonce()).resolves.toBeUndefined();
  });
});
