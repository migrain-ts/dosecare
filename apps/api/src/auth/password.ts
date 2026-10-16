import { hash, verify } from '@node-rs/argon2';

export const hashPassword = (password: string) => hash(password);
export const verifyPassword = (hashed: string, password: string) => verify(hashed, password);

// Verified against when the email is unknown, to keep response time similar.
export const DUMMY_HASH = await hash('dummy-password-for-timing');
