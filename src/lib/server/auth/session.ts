/**
 * Server-side sessions (D11). The cookie holds a random token; the database stores only its SHA-256,
 * so a leaked database can't be used to hijack sessions. Sessions slide: they're extended when used
 * in the second half of their lifetime.
 */
import { eq } from 'drizzle-orm';
import type { Cookies } from '@sveltejs/kit';
import { sessions, users } from '../db/schema';
import type { Db } from '../db/types';

export const SESSION_COOKIE = 'session';
const DAY_MS = 86_400_000;
const SESSION_DAYS = 30;

export interface SessionUser {
	id: string;
	email: string;
	timezone: string;
}

export interface Session {
	id: string;
	userId: string;
	expiresAt: Date;
}

export function generateSessionToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return Buffer.from(bytes).toString('base64url');
}

async function hashToken(token: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
	return Buffer.from(digest).toString('hex');
}

export async function createSession(db: Db, token: string, userId: string): Promise<Session> {
	const session: Session = {
		id: await hashToken(token),
		userId,
		expiresAt: new Date(Date.now() + SESSION_DAYS * DAY_MS)
	};
	await db.insert(sessions).values(session);
	return session;
}

export async function validateSessionToken(
	db: Db,
	token: string
): Promise<{ session: Session; user: SessionUser } | null> {
	const id = await hashToken(token);
	const [row] = await db
		.select({
			session: sessions,
			user: { id: users.id, email: users.email, timezone: users.timezone }
		})
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(eq(sessions.id, id));
	if (!row) return null;

	const { session, user } = row;
	if (Date.now() >= session.expiresAt.getTime()) {
		await db.delete(sessions).where(eq(sessions.id, id));
		return null;
	}
	if (Date.now() >= session.expiresAt.getTime() - (SESSION_DAYS / 2) * DAY_MS) {
		session.expiresAt = new Date(Date.now() + SESSION_DAYS * DAY_MS);
		await db.update(sessions).set({ expiresAt: session.expiresAt }).where(eq(sessions.id, id));
	}
	return { session, user };
}

export async function invalidateSession(db: Db, sessionId: string): Promise<void> {
	await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function invalidateUserSessions(db: Db, userId: string): Promise<void> {
	await db.delete(sessions).where(eq(sessions.userId, userId));
}

export function setSessionCookie(cookies: Cookies, token: string, expiresAt: Date): void {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		expires: expiresAt
	});
}

export function deleteSessionCookie(cookies: Cookies): void {
	cookies.delete(SESSION_COOKIE, { path: '/' });
}
