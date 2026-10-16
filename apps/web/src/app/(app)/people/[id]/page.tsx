'use client';
import { useQuery } from '@tanstack/react-query';
import { Tabs, Typography } from 'antd';
import { useParams } from 'next/navigation';
import { HistoryTab } from '@/components/person/HistoryTab';
import { MedicationsTab } from '@/components/person/MedicationsTab';
import { MembersTab } from '@/components/person/MembersTab';
import { NotificationsTab } from '@/components/person/NotificationsTab';
import { StockTab } from '@/components/person/StockTab';
import { QueryError } from '@/components/QueryError';
import { ApiRequestError, api, unwrap } from '@/lib/api';
import type { Person } from '@/lib/types';

export default function PersonPage() {
  const { id } = useParams<{ id: string }>();
  const person = useQuery({
    queryKey: ['recipient', id],
    queryFn: async () => unwrap<{ recipient: Person }>(await api.recipients[':id'].$get({ param: { id } })),
  });
  if (!person.data) {
    if (person.error instanceof ApiRequestError && person.error.status === 404) return <Typography.Text>Person not found.</Typography.Text>;
    if (person.isError) return <QueryError title="Could not load this person" error={person.error} onRetry={person.refetch} />;
    return <Typography.Text>Loading…</Typography.Text>;
  }
  const p = person.data.recipient;
  return (
    <>
      <Typography.Title level={3}>{p.displayName}</Typography.Title>
      <Typography.Paragraph type="secondary">{p.timeZone} · your role: {p.role}</Typography.Paragraph>
      <Tabs
        items={[
          { key: 'medications', label: 'Medications', children: <MedicationsTab person={p} /> },
          { key: 'history', label: 'History', children: <HistoryTab person={p} /> },
          { key: 'stock', label: 'Stock', children: <StockTab person={p} /> },
          { key: 'members', label: 'Members', children: <MembersTab person={p} /> },
          { key: 'notifications', label: 'Notifications', children: <NotificationsTab person={p} /> },
        ]}
      />
    </>
  );
}
