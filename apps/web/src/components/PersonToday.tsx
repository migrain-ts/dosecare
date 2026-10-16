'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Empty, List, Tag } from 'antd';
import Link from 'next/link';
import { api, unwrap } from '@/lib/api';
import { canRecord, formatLocalTime, statusMeta, todayRange, type DoseStatus, type Role } from '@/lib/dose';

export type PersonSummary = { id: string; displayName: string; timeZone: string; role: Role };
type Dose = { id: string; medicationName: string; scheduledAt: string; quantity: number; status: DoseStatus };

export function PersonToday({ person }: { person: PersonSummary }) {
  const qc = useQueryClient();
  const { message } = App.useApp();
  const range = todayRange(new Date(), person.timeZone);
  const key = ['doses', person.id, range.from];
  const doses = useQuery({
    queryKey: key,
    refetchInterval: 30_000,
    queryFn: async () =>
      unwrap<{ doses: Dose[] }>(await api.recipients[':id'].doses.$get({ param: { id: person.id }, query: range })),
  });
  const record = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'take' | 'skip' }) =>
      unwrap(await api.doses[':id'][action].$post({ param: { id } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['doses', person.id] }),
    onError: (e) => message.error(e.message),
  });

  return (
    <Card
      className="mb-4"
      title={<Link href={`/people/${person.id}`}>{person.displayName}</Link>}
      extra={<span className="text-gray-500">{person.timeZone}</span>}
      loading={doses.isLoading}
    >
      {doses.data && doses.data.doses.length === 0 ? (
        <Empty description="No doses today. Doses appear within a minute after you add a schedule." />
      ) : (
        <List
          dataSource={doses.data?.doses ?? []}
          renderItem={(d) => {
            const meta = statusMeta(d.status);
            const open = d.status === 'pending' || d.status === 'missed';
            return (
              <List.Item
                actions={
                  open && canRecord(person.role)
                    ? [
                        <Button key="take" type="primary" size="small" loading={record.isPending} onClick={() => record.mutate({ id: d.id, action: 'take' })}>
                          Taken
                        </Button>,
                        <Button key="skip" size="small" onClick={() => record.mutate({ id: d.id, action: 'skip' })}>
                          Skip
                        </Button>,
                      ]
                    : []
                }
              >
                <List.Item.Meta title={`${formatLocalTime(d.scheduledAt, person.timeZone)} · ${d.medicationName}`} description={`${d.quantity} per dose`} />
                <Tag color={meta.color}>{meta.label}</Tag>
              </List.Item>
            );
          }}
        />
      )}
    </Card>
  );
}
