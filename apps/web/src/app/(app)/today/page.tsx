'use client';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Empty, Spin, Typography } from 'antd';
import Link from 'next/link';
import { PersonToday, type PersonSummary } from '@/components/PersonToday';
import { api, unwrap } from '@/lib/api';
import { viewState } from '@/lib/dose';

export default function TodayPage() {
  const people = useQuery({
    queryKey: ['recipients'],
    queryFn: async () => unwrap<{ recipients: PersonSummary[] }>(await api.recipients.$get()),
  });
  const state = viewState({ isLoading: people.isLoading, isError: people.isError, data: people.data?.recipients });
  return (
    <>
      <Typography.Title level={3}>Today</Typography.Title>
      {state === 'loading' && <Spin />}
      {state === 'error' && (
        <Alert
          type="error"
          showIcon
          message="Could not load people"
          description={people.error?.message}
          action={<Button size="small" onClick={() => people.refetch()}>Retry</Button>}
        />
      )}
      {state === 'empty' && (
        <Empty description={<span>Nobody to follow yet. <Link href="/people">Add a person</Link>.</span>} />
      )}
      {people.data?.recipients.map((p) => <PersonToday key={p.id} person={p} />)}
      <Typography.Paragraph type="secondary" className="mt-6">
        DoseCare is a tracking tool and does not provide medical advice.
      </Typography.Paragraph>
    </>
  );
}
