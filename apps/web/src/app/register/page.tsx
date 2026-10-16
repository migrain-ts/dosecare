'use client';
import { useMutation } from '@tanstack/react-query';
import { Alert, Button, Card, Form, Input } from 'antd';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { api, unwrap } from '@/lib/api';
import { safeNext } from '@/lib/nav';

function RegisterForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const register = useMutation({
    mutationFn: async (v: { name: string; email: string; password: string }) =>
      unwrap(await api.auth.register.$post({ json: { ...v, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } })),
    onSuccess: () => router.replace(next),
  });
  return (
    <main className="mx-auto mt-24 max-w-sm px-4">
      <Card title="Create your DoseCare account">
        {register.error && <Alert className="mb-4" type="error" message={register.error.message} />}
        <Form layout="vertical" onFinish={(v) => register.mutate(v)}>
          <Form.Item name="name" label="Your name" rules={[{ required: true }]}>
            <Input autoComplete="name" />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input autoComplete="email" />
          </Form.Item>
          <Form.Item name="password" label="Password (10+ characters)" rules={[{ required: true, min: 10 }]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={register.isPending}>
            Create account
          </Button>
        </Form>
        <p className="mt-4 text-center text-sm">
          Already registered? <Link href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link>
        </p>
      </Card>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
