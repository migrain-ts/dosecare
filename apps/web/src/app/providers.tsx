'use client';
import { StyleProvider } from '@ant-design/cssinjs';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App, ConfigProvider } from 'antd';
import { useState, type ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, retry: false } } }));
  return (
    <AntdRegistry>
      <StyleProvider layer>
        <ConfigProvider theme={{ token: { colorPrimary: '#0f766e', borderRadius: 8 } }}>
          <App>
            <QueryClientProvider client={client}>{children}</QueryClientProvider>
          </App>
        </ConfigProvider>
      </StyleProvider>
    </AntdRegistry>
  );
}
