'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, List, Modal, Popconfirm, Tag } from 'antd';
import { useState } from 'react';
import { QueryError } from '@/components/QueryError';
import { api, unwrap } from '@/lib/api';
import { canRecord, viewState } from '@/lib/dose';
import { scheduleSummary, stockLabel } from '@/lib/format';
import type { Person } from '@/lib/types';
import { MedicationForm, type MedicationFormValues } from './MedicationForm';

export type Medication = {
  id: string; name: string; strength: string | null; unit: string; active: boolean;
  schedules: { id: string; daysOfWeek: number[]; timeOfDay: string; quantityPerDose: number }[];
  stock: { tracked: boolean; remaining: number; daysLeft: number | null };
};

export function useMedications(personId: string) {
  return useQuery({
    queryKey: ['medications', personId],
    queryFn: async () => unwrap<{ medications: Medication[] }>(await api.recipients[':id'].medications.$get({ param: { id: personId } })),
  });
}

export function MedicationsTab({ person }: { person: Person }) {
  const qc = useQueryClient();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const key = ['medications', person.id];
  const meds = useMedications(person.id);
  const create = useMutation({
    mutationFn: async (v: MedicationFormValues) =>
      unwrap(
        await api.recipients[':id'].medications.$post({
          param: { id: person.id },
          json: {
            name: v.name, strength: v.strength || undefined, unit: v.unit,
            schedules: [{ daysOfWeek: v.daysOfWeek, timeOfDay: v.time.format('HH:mm'), quantityPerDose: v.quantityPerDose, startDate: v.startDate.format('YYYY-MM-DD') }],
          },
        }),
      ),
    onSuccess: () => {
      setOpen(false);
      message.success('Saved. Doses appear within a minute.');
      return qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => message.error(e.message),
  });
  const archive = useMutation({
    mutationFn: async (id: string) => unwrap(await api.medications[':id'].$delete({ param: { id } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e) => message.error(e.message),
  });
  const editable = canRecord(person.role);
  const active = (meds.data?.medications ?? []).filter((m) => m.active);
  const state = viewState({ isLoading: meds.isLoading, isError: meds.isError, data: meds.data ? active : undefined });

  return (
    <>
      {editable && <Button type="primary" className="mb-4" onClick={() => setOpen(true)}>Add medication</Button>}
      {state === 'error' ? (
        <QueryError title="Could not load medications" error={meds.error} onRetry={meds.refetch} />
      ) : (
        <List
          bordered
          loading={state === 'loading'}
          dataSource={active}
          locale={{ emptyText: 'No medications yet.' }}
          renderItem={(m) => {
            const stock = stockLabel(m.stock);
            const busy = archive.isPending && archive.variables === m.id;
            return (
              <List.Item
                actions={
                  editable
                    ? [
                        <Popconfirm key="a" title="Archive this medication?" onConfirm={() => archive.mutate(m.id)}>
                          <Button size="small" danger aria-label={`Archive ${m.name}`} loading={busy} disabled={archive.isPending}>Archive</Button>
                        </Popconfirm>,
                      ]
                    : []
                }
              >
                <List.Item.Meta
                  title={`${m.name}${m.strength ? ` ${m.strength}` : ''} ${m.unit}`}
                  description={m.schedules.map((s) => <div key={s.id}>{scheduleSummary(s)}</div>)}
                />
                <Tag color={stock.color}>{stock.text}</Tag>
              </List.Item>
            );
          }}
        />
      )}
      <Modal title="Add medication" open={open} onCancel={() => setOpen(false)} footer={null} destroyOnClose>
        <MedicationForm timeZone={person.timeZone} loading={create.isPending} onSubmit={(v) => create.mutate(v)} />
      </Modal>
    </>
  );
}
