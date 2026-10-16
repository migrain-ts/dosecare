'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Form, Input, List, Popconfirm, Select, Table, Typography } from 'antd';
import { QueryError } from '@/components/QueryError';
import { api, unwrap } from '@/lib/api';
import type { Role } from '@/lib/dose';
import type { Person } from '@/lib/types';

type Member = { userId: string; name: string; email: string; role: Role };
type Invitation = { id: string; email: string; role: Role; expiresAt: string };
const ROLES = [{ value: 'viewer', label: 'Viewer' }, { value: 'editor', label: 'Editor' }, { value: 'owner', label: 'Owner' }];

export function MembersTab({ person }: { person: Person }) {
  const qc = useQueryClient();
  const { message } = App.useApp();
  const isOwner = person.role === 'owner';
  const members = useQuery({
    queryKey: ['members', person.id],
    queryFn: async () => unwrap<{ members: Member[] }>(await api.recipients[':id'].members.$get({ param: { id: person.id } })),
  });
  const invitations = useQuery({
    enabled: isOwner,
    queryKey: ['invitations', person.id],
    queryFn: async () => unwrap<{ invitations: Invitation[] }>(await api.recipients[':id'].invitations.$get({ param: { id: person.id } })),
  });
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['members', person.id] }), qc.invalidateQueries({ queryKey: ['invitations', person.id] })]);
  const onError = (e: Error) => message.error(e.message);
  const setRole = useMutation({
    mutationFn: async (v: { userId: string; role: Role }) => unwrap(await api.recipients[':id'].members[':userId'].$patch({ param: { id: person.id, userId: v.userId }, json: { role: v.role } })),
    onSuccess: refresh, onError,
  });
  const remove = useMutation({
    mutationFn: async (userId: string) => unwrap(await api.recipients[':id'].members[':userId'].$delete({ param: { id: person.id, userId } })),
    onSuccess: refresh, onError,
  });
  const invite = useMutation({
    mutationFn: async (v: { email: string; role: Role }) => unwrap(await api.recipients[':id'].invitations.$post({ param: { id: person.id }, json: v })),
    onSuccess: () => {
      message.success('Invitation sent. Check Mailpit at http://localhost:8026 when running locally.');
      return refresh();
    },
    onError,
  });
  const revoke = useMutation({
    mutationFn: async (invitationId: string) => unwrap(await api.recipients[':id'].invitations[':invitationId'].$delete({ param: { id: person.id, invitationId } })),
    onSuccess: refresh, onError,
  });

  return (
    <>
      {members.isError && !members.data ? (
        <QueryError title="Could not load members" error={members.error} onRetry={members.refetch} />
      ) : (
        <Table
          rowKey="userId"
          size="small"
          pagination={false}
          loading={members.isLoading}
          dataSource={members.data?.members ?? []}
          scroll={{ x: true }}
          columns={[
            { title: 'Name', dataIndex: 'name' },
            { title: 'Email', dataIndex: 'email' },
            {
              title: 'Role',
              render: (_, m) =>
                isOwner ? (
                  <Select
                    value={m.role}
                    options={ROLES}
                    style={{ width: 110 }}
                    aria-label={`Role for ${m.name}`}
                    disabled={setRole.isPending && setRole.variables?.userId === m.userId}
                    onChange={(role) => setRole.mutate({ userId: m.userId, role })}
                  />
                ) : (
                  m.role
                ),
            },
            {
              title: '',
              render: (_, m) =>
                isOwner && (
                  <Popconfirm title="Remove this member?" onConfirm={() => remove.mutate(m.userId)}>
                    <Button size="small" danger aria-label={`Remove ${m.name}`} loading={remove.isPending && remove.variables === m.userId} disabled={remove.isPending}>Remove</Button>
                  </Popconfirm>
                ),
            },
          ]}
        />
      )}
      {isOwner && (
        <>
          <Typography.Title level={5} className="mt-6">Invite someone</Typography.Title>
          <Form layout="inline" initialValues={{ role: 'viewer' }} onFinish={(v) => invite.mutate(v)}>
            <Form.Item name="email" rules={[{ required: true, type: 'email' }]}><Input placeholder="Email" /></Form.Item>
            <Form.Item name="role"><Select options={ROLES} style={{ width: 110 }} /></Form.Item>
            <Button type="primary" htmlType="submit" loading={invite.isPending} disabled={invite.isPending}>Send invitation</Button>
          </Form>
          {invitations.isError && !invitations.data ? (
            <div className="mt-4"><QueryError title="Could not load invitations" error={invitations.error} onRetry={invitations.refetch} /></div>
          ) : (
            <List
              className="mt-4"
              header="Pending invitations"
              loading={invitations.isLoading}
              dataSource={invitations.data?.invitations ?? []}
              locale={{ emptyText: 'None' }}
              renderItem={(i) => (
                <List.Item
                  actions={[
                    <Button key="r" size="small" aria-label={`Revoke invitation for ${i.email}`} loading={revoke.isPending && revoke.variables === i.id} disabled={revoke.isPending} onClick={() => revoke.mutate(i.id)}>Revoke</Button>,
                  ]}
                >
                  {i.email} · {i.role} · expires {i.expiresAt.slice(0, 10)}
                </List.Item>
              )}
            />
          )}
        </>
      )}
    </>
  );
}
