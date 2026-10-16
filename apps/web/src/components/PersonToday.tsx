'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Empty, List, Tag } from 'antd';
import Link from 'next/link';
import { api, unwrap } from '@/lib/api';
import { useLocalDate } from '@/lib/useLocalDate';
import { canRecord, formatLocalTime, statusMeta, viewState, type DoseStatus, type Role } from '@/lib/dose';

export type PersonSummary = { id: string; displayName: string; timeZone: string; role: Role };
type Dose = { id: string; medicationName: string; scheduledAt: string; quantity: number; status: DoseStatus };

export function PersonToday({ person }: { person: PersonSummary }) {
  const qc = useQueryClient();
  const { message } = App.useApp();
  const today = useLocalDate(person.timeZone);
  const range = { from: today, to: today };
  const key = ['doses', person.id, today];
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

  const state = viewState({ isLoading: doses.isLoading, isError: doses.isError, data: doses.data?.doses });

  return (
    <Card
      className="mb-4"
      title={<Link href={`/people/${person.id}`}>{person.displayName}</Link>}
      extra={<span className="text-gray-500">{person.timeZone}</span>}
      loading={state === 'loading'}
    >
      {state === 'error' ? (
        <Alert
          type="error"
          showIcon
          message="Could not load doses"
          description={doses.error?.message}
          action={<Button size="small" onClick={() => doses.refetch()}>Retry</Button>}
        />
      ) : state === 'empty' ? (
        <Empty description="No doses today." />
      ) : (
        <List
          dataSource={doses.data?.doses ?? []}
          renderItem={(d) => {
            const meta = statusMeta(d.status);
            const busy = record.isPending && record.variables?.id === d.id;
            const open = d.status === 'pending' || d.status === 'missed';
            return (
              <List.Item
                actions={
                  open && canRecord(person.role)
                    ? [
                        <Button key="take" type="primary" size="small" aria-label={`Mark ${d.medicationName} as taken`} loading={busy && record.variables?.action === 'take'} disabled={busy} onClick={() => record.mutate({ id: d.id, action: 'take' })}>
                          Taken
                        </Button>,
                        <Button key="skip" size="small" aria-label={`Skip ${d.medicationName}`} loading={busy && record.variables?.action === 'skip'} disabled={busy} onClick={() => record.mutate({ id: d.id, action: 'skip' })}>
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
