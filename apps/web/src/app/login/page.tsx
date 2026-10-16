'use client';
import { useMutation } from '@tanstack/react-query';
import { Alert, Button, Card, Form, Input } from 'antd';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { api, unwrap } from '@/lib/api';
import { safeNext } from '@/lib/nav';

function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const login = useMutation({
    mutationFn: async (v: { email: string; password: string }) => unwrap(await api.auth.login.$post({ json: v })),
    onSuccess: () => router.replace(next),
  });
  return (
    <main className="mx-auto mt-24 max-w-sm px-4">
      <Card title="Sign in to DoseCare">
        {login.error && <Alert className="mb-4" type="error" message={login.error.message} />}
        <Form layout="vertical" onFinish={(v) => login.mutate(v)}>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input autoComplete="email" />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={login.isPending}>
            Sign in
          </Button>
        </Form>
        <p className="mt-4 text-center text-sm">
          No account? <Link href={`/register?next=${encodeURIComponent(next)}`}>Create one</Link>
        </p>
      </Card>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
