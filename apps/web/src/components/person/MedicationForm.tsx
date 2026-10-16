'use client';
import { Button, Checkbox, DatePicker, Form, Input, InputNumber, TimePicker } from 'antd';
import dayjs from 'dayjs';
import { useLocalDate } from '@/lib/useLocalDate';

const DAYS = [
  { label: 'Mon', value: 1 }, { label: 'Tue', value: 2 }, { label: 'Wed', value: 3 }, { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 }, { label: 'Sat', value: 6 }, { label: 'Sun', value: 7 },
];

export type MedicationFormValues = {
  name: string; strength?: string; unit: string; daysOfWeek: number[]; time: dayjs.Dayjs; quantityPerDose: number; startDate: dayjs.Dayjs;
};

export function MedicationForm({ timeZone, loading, onSubmit }: { timeZone: string; loading: boolean; onSubmit: (v: MedicationFormValues) => void }) {
  const today = useLocalDate(timeZone);
  return (
    <Form
      layout="vertical"
      onFinish={onSubmit}
      initialValues={{ unit: 'mg', daysOfWeek: [1, 2, 3, 4, 5, 6, 7], quantityPerDose: 1, time: dayjs('08:00', 'HH:mm'), startDate: dayjs(today) }}
    >
      <Form.Item name="name" label="Medication name" rules={[{ required: true }]}><Input /></Form.Item>
      <div className="flex gap-3">
        <Form.Item name="strength" label="Strength" className="flex-1"><Input placeholder="e.g. 500" /></Form.Item>
        <Form.Item name="unit" label="Unit" rules={[{ required: true }]} className="flex-1"><Input /></Form.Item>
      </div>
      <Form.Item name="daysOfWeek" label="Days" rules={[{ required: true, type: 'array', min: 1 }]}><Checkbox.Group options={DAYS} /></Form.Item>
      <div className="flex flex-wrap gap-3">
        <Form.Item name="time" label={`Time (${timeZone})`} rules={[{ required: true }]}><TimePicker format="HH:mm" minuteStep={5} needConfirm={false} /></Form.Item>
        <Form.Item name="quantityPerDose" label="Quantity per dose" rules={[{ required: true }]}><InputNumber min={0.25} step={0.25} /></Form.Item>
        <Form.Item name="startDate" label="Start date" rules={[{ required: true }]}><DatePicker /></Form.Item>
      </div>
      <Button type="primary" htmlType="submit" loading={loading} disabled={loading}>Save</Button>
    </Form>
  );
}
