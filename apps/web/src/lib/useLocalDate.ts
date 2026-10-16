'use client';
import { useEffect, useState } from 'react';
import { localDate } from '@dosecare/shared';

/** The current local date (YYYY-MM-DD) in a time zone, re-checked every 30 s and on window focus. */
export function useLocalDate(timeZone: string): string {
  const [date, setDate] = useState(() => localDate(new Date(), timeZone));
  useEffect(() => {
    const check = () => setDate(localDate(new Date(), timeZone));
    check();
    const t = setInterval(check, 30_000);
    window.addEventListener('focus', check);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', check);
    };
  }, [timeZone]);
  return date;
}
