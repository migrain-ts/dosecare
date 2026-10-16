'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App, Button, Form, InputNumber, List, Radio, Tag } from 'antd';
import { QueryError } from '@/components/QueryError';
import { api, unwrap } from '@/lib/api';
import { canRecord, viewState } from '@/lib/dose';
import { stockLabel } from '@/lib/format';
import type { Person } from '@/lib/types';
import { useMedications } from './MedicationsTab';

function MovementForm({ medicationId, medicationName, personId }: { medicationId: string; medicationName: string; personId: string }) {
  const qc = useQueryClient();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const add = useMutation({
    mutationFn: async (v: { reason: 'refill' | 'adjustment'; quantity: number }) =>
      unwrap(await api.medications[':id']['stock-movements'].$post({ param: { id: medicationId }, json: v })),
    onSuccess: () => {
      form.resetFields(['quantity']);
      return qc.invalidateQueries({ queryKey: ['medications', personId] });
    },
    onError: (e) => message.error(e.message),
  });
  return (
    <Form form={form} layout="inline" initialValues={{ reason: 'refill' }} onFinish={(v) => add.mutate(v)}>
      <Form.Item name="reason"><Radio.Group options={[{ label: 'Refill (+)', value: 'refill' }, { label: 'Adjustment (±)', value: 'adjustment' }]} /></Form.Item>
      <Form.Item name="quantity" rules={[{ required: true }]}><InputNumber placeholder="Quantity" aria-label={`Quantity for ${medicationName}`} /></Form.Item>
      <Button htmlType="submit" aria-label={`Record stock change for ${medicationName}`} loading={add.isPending} disabled={add.isPending}>Record</Button>
    </Form>
  );
}

export function StockTab({ person }: { person: Person }) {
  const meds = useMedications(person.id);
  const active = (meds.data?.medications ?? []).filter((m) => m.active);
  const state = viewState({ isLoading: meds.isLoading, isError: meds.isError, data: meds.data ? active : undefined });
  if (state === 'error') return <QueryError title="Could not load stock" error={meds.error} onRetry={meds.refetch} />;
  return (
    <List
      bordered
      loading={state === 'loading'}
      dataSource={active}
      locale={{ emptyText: 'No medications yet.' }}
      renderItem={(m) => (
        <List.Item>
          <div className="w-full">
            <div className="mb-2 flex items-center justify-between">
              <strong>{m.name}</strong>
              <Tag color={stockLabel(m.stock).color}>{stockLabel(m.stock).text}</Tag>
            </div>
            {canRecord(person.role) && <MovementForm medicationId={m.id} medicationName={m.name} personId={person.id} />}
          </div>
        </List.Item>
      )}
    />
  );
}
