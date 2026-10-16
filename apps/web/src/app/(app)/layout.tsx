'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Layout, Spin } from 'antd';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { ApiRequestError, api, unwrap } from '@/lib/api';

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => unwrap<{ user: { id: string; name: string; email: string } }>(await api.auth.me.$get()),
  });
  const logout = useMutation({
    mutationFn: async () => unwrap(await api.auth.logout.$post()),
    onSuccess: () => {
      qc.clear();
      router.replace('/login');
    },
  });
  useEffect(() => {
    if (me.error instanceof ApiRequestError && me.error.status === 401) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [me.error, router, pathname]);

  if (!me.data) return <Spin fullscreen />;
  return (
    <Layout className="min-h-screen">
      <Layout.Header className="flex items-center justify-between">
        <nav className="flex gap-6 text-white">
          <Link href="/today" className="font-semibold text-white">DoseCare</Link>
          <Link href="/today" className="text-white">Today</Link>
          <Link href="/people" className="text-white">People</Link>
        </nav>
        <div className="flex items-center gap-3 text-white">
          <span>{me.data.user.name}</span>
          <Button size="small" onClick={() => logout.mutate()}>Sign out</Button>
        </div>
      </Layout.Header>
      <Layout.Content className="mx-auto w-full max-w-5xl p-4 md:p-8">{children}</Layout.Content>
    </Layout>
  );
}
