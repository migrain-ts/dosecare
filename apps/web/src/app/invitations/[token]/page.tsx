'use client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, Card } from 'antd';
import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ApiRequestError, api, unwrap } from '@/lib/api';

const MESSAGES: Record<string, string> = {
  invitation_expired: 'This invitation has expired. Ask for a new one.',
  invitation_used: 'This invitation was already used.',
  already_member: 'You already have access to this person.',
  not_found: 'This invitation does not exist or was revoked.',
};

export default function AcceptInvitationPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const me = useQuery({ queryKey: ['me'], queryFn: async () => unwrap(await api.auth.me.$get()) });
  const accept = useMutation({
    mutationFn: async () => unwrap<{ recipientId: string }>(await api.invitations[':token'].accept.$post({ param: { token } })),
    onSuccess: (r) => router.replace(`/people/${r.recipientId}`),
  });
  useEffect(() => {
    if (me.error instanceof ApiRequestError && me.error.status === 401) router.replace(`/login?next=${encodeURIComponent(`/invitations/${token}`)}`);
  }, [me.error, router, token]);

  const acceptError = accept.error instanceof ApiRequestError ? (MESSAGES[accept.error.code] ?? (accept.error.status === 404 ? MESSAGES.not_found : undefined)) : undefined;
  return (
    <main className="mx-auto mt-24 max-w-md px-4">
      <Card title="You have been invited to help with someone's medication">
        {accept.error && <Alert className="mb-4" type="error" message={acceptError ?? accept.error.message} />}
        {me.isError && !(me.error instanceof ApiRequestError && me.error.status === 401) && (
          <Alert className="mb-4" type="error" message="Could not check your session." action={<Button size="small" onClick={() => me.refetch()}>Retry</Button>} />
        )}
        <Button type="primary" disabled={!me.data || accept.isPending} loading={accept.isPending} onClick={() => accept.mutate()}>
          Accept invitation
        </Button>
      </Card>
    </main>
  );
}
