'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Form, Input, List, Modal, Select, Tag, Typography } from 'antd';
import Link from 'next/link';
import { useState } from 'react';
import { QueryError } from '@/components/QueryError';
import { api, unwrap } from '@/lib/api';
import { viewState } from '@/lib/dose';
import type { Person } from '@/lib/types';

const ZONES = Intl.supportedValuesOf('timeZone');

export default function PeoplePage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const people = useQuery({ queryKey: ['recipients'], queryFn: async () => unwrap<{ recipients: Person[] }>(await api.recipients.$get()) });
  const create = useMutation({
    mutationFn: async (v: { displayName: string; timeZone: string }) => unwrap(await api.recipients.$post({ json: v })),
    onSuccess: () => {
      setOpen(false);
      return qc.invalidateQueries({ queryKey: ['recipients'] });
    },
  });
  const state = viewState({ isLoading: people.isLoading, isError: people.isError, data: people.data?.recipients });
  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Typography.Title level={3} className="!mb-0">People</Typography.Title>
        <Button type="primary" onClick={() => setOpen(true)}>Add a person</Button>
      </div>
      {state === 'error' ? (
        <QueryError title="Could not load people" error={people.error} onRetry={people.refetch} />
      ) : (
        <List
          bordered
          loading={state === 'loading'}
          dataSource={people.data?.recipients ?? []}
          locale={{ emptyText: 'No one yet. Add a person to get started.' }}
          renderItem={(p) => (
            <List.Item extra={<Tag>{p.role}</Tag>}>
              <Link href={`/people/${p.id}`}>{p.displayName}</Link>
            </List.Item>
          )}
        />
      )}
      <Modal title="Add a person" open={open} onCancel={() => setOpen(false)} footer={null} destroyOnClose>
        <Form layout="vertical" initialValues={{ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }} onFinish={(v) => create.mutate(v)}>
          <Form.Item name="displayName" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="timeZone" label="Time zone" rules={[{ required: true }]}>
            <Select showSearch options={ZONES.map((z) => ({ value: z, label: z }))} />
          </Form.Item>
          {create.error && <Typography.Text type="danger" className="mb-2 block">{create.error.message}</Typography.Text>}
          <Button type="primary" htmlType="submit" loading={create.isPending} disabled={create.isPending}>Add</Button>
        </Form>
      </Modal>
    </>
  );
}
