'use client';
import { useQuery } from '@tanstack/react-query';
import { Empty, Typography } from 'antd';
import Link from 'next/link';
import { PersonToday, type PersonSummary } from '@/components/PersonToday';
import { api, unwrap } from '@/lib/api';

export default function TodayPage() {
  const people = useQuery({
    queryKey: ['recipients'],
    queryFn: async () => unwrap<{ recipients: PersonSummary[] }>(await api.recipients.$get()),
  });
  return (
    <>
      <Typography.Title level={3}>Today</Typography.Title>
      {people.data?.recipients.length === 0 && (
        <Empty description={<span>Nobody to follow yet. <Link href="/people">Add a person</Link>.</span>} />
      )}
      {people.data?.recipients.map((p) => <PersonToday key={p.id} person={p} />)}
      <Typography.Paragraph type="secondary" className="mt-6">
        DoseCare is a tracking tool and does not provide medical advice.
      </Typography.Paragraph>
    </>
  );
}
