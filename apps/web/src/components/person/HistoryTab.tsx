'use client';
import { useQuery } from '@tanstack/react-query';
import { DatePicker, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { QueryError } from '@/components/QueryError';
import { api, unwrap } from '@/lib/api';
import { statusMeta, viewState, type DoseStatus } from '@/lib/dose';
import { formatInZone } from '@/lib/format';
import type { Person } from '@/lib/types';
import { useLocalDate } from '@/lib/useLocalDate';

type Dose = { id: string; medicationName: string; scheduledAt: string; quantity: number; status: DoseStatus };

export function HistoryTab({ person }: { person: Person }) {
  const today = useLocalDate(person.timeZone);
  // null until the person picks a range: the default always follows "today" in their time zone.
  const [picked, setPicked] = useState<[string, string] | null>(null);
  const range: [string, string] = picked ?? [dayjs(today).subtract(6, 'day').format('YYYY-MM-DD'), today];
  const doses = useQuery({
    queryKey: ['history', person.id, range],
    queryFn: async () => unwrap<{ doses: Dose[] }>(await api.recipients[':id'].doses.$get({ param: { id: person.id }, query: { from: range[0], to: range[1] } })),
  });
  const state = viewState({ isLoading: doses.isLoading, isError: doses.isError, data: doses.data?.doses });
  return (
    <>
      <DatePicker.RangePicker
        className="mb-4"
        allowClear={false}
        value={[dayjs(range[0]), dayjs(range[1])]}
        disabledDate={(d, info) => (info.from ? Math.abs(d.diff(info.from, 'day')) > 30 : false)}
        onChange={(v) => v?.[0] && v?.[1] && setPicked([v[0].format('YYYY-MM-DD'), v[1].format('YYYY-MM-DD')])}
      />
      {state === 'error' ? (
        <QueryError title="Could not load history" error={doses.error} onRetry={doses.refetch} />
      ) : (
        <Table
          rowKey="id"
          size="small"
          loading={state === 'loading'}
          dataSource={doses.data?.doses ?? []}
          locale={{ emptyText: 'No doses in this period.' }}
          pagination={{ pageSize: 20 }}
          scroll={{ x: true }}
          columns={[
            { title: 'When', render: (_, d) => formatInZone(d.scheduledAt, person.timeZone) },
            { title: 'Medication', dataIndex: 'medicationName' },
            { title: 'Quantity', dataIndex: 'quantity' },
            { title: 'Status', render: (_, d) => <Tag color={statusMeta(d.status).color}>{statusMeta(d.status).label}</Tag> },
          ]}
        />
      )}
    </>
  );
}
