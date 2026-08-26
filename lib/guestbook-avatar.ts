/**
 * Guestbook avatar resolution — one implementation.
 *
 * This logic existed in three places with two behavioural forks: the admin
 * page asked for `.png` (only `.avif` files exist, so every admin avatar
 * 404'd) and skipped the negative-index guard.
 */

export const GUESTBOOK_AVATAR_COUNT = 9;

export function guestbookAvatarSrc(message: {
    avatar?: string;
    avatarIndex?: number;
}): string {
    if (message.avatar) return message.avatar;
    const index = Math.abs(message.avatarIndex ?? 0) % GUESTBOOK_AVATAR_COUNT;
    return `/images/avatar/avatar_${index}.avif`;
}
