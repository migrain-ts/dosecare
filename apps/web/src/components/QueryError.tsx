'use client';
import { Alert, Button } from 'antd';

export function QueryError({ title, error, onRetry }: { title: string; error: Error | null; onRetry: () => unknown }) {
  return (
    <Alert
      type="error"
      showIcon
      message={title}
      description={error?.message}
      action={<Button size="small" onClick={() => onRetry()}>Retry</Button>}
    />
  );
}
