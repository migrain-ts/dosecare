'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Form, InputNumber, Switch } from 'antd';
import { QueryError } from '@/components/QueryError';
import { api, unwrap } from '@/lib/api';
import type { Person } from '@/lib/types';

type Prefs = { remindersEnabled: boolean; missedAlertEnabled: boolean; missedAlertDelayMinutes: number };

export function NotificationsTab({ person }: { person: Person }) {
  const qc = useQueryClient();
  const { message } = App.useApp();
  const key = ['prefs', person.id];
  const prefs = useQuery({
    queryKey: key,
    queryFn: async () => unwrap<{ preferences: Prefs }>(await api.recipients[':id'].preferences.$get({ param: { id: person.id } })),
  });
  const save = useMutation({
    mutationFn: async (v: Prefs) => unwrap(await api.recipients[':id'].preferences.$put({ param: { id: person.id }, json: v })),
    onSuccess: () => {
      message.success('Saved');
      return qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => message.error(e.message),
  });
  if (prefs.isError && !prefs.data) return <QueryError title="Could not load notification settings" error={prefs.error} onRetry={prefs.refetch} />;
  if (!prefs.data) return <span>Loading…</span>;
  return (
    <Form layout="vertical" initialValues={prefs.data.preferences} onFinish={(v) => save.mutate(v)} style={{ maxWidth: 420 }}>
      <Form.Item name="remindersEnabled" label="Email me a reminder when a dose is due" valuePropName="checked"><Switch /></Form.Item>
      <Form.Item name="missedAlertEnabled" label="Email me when a dose is missed" valuePropName="checked"><Switch /></Form.Item>
      <Form.Item name="missedAlertDelayMinutes" label="Minutes to wait before a missed-dose alert (0 to 120)" rules={[{ required: true }]}>
        <InputNumber min={0} max={120} />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={save.isPending} disabled={save.isPending}>Save</Button>
    </Form>
  );
}
