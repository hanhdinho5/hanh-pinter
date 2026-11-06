import { DEFAULT_SERVER_URL } from '../socket/socketClient';

// Chỉ lấy tên file, không tải trước nội dung ảnh.
const bundledAvatars = import.meta.glob('../../public/avatars/*', { query: '?url', import: 'default' });
const imageExtension = /\.(png|jpe?g|webp|svg|gif|avif)$/i;
const placeholder = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#dbeafe"/><circle cx="128" cy="92" r="46" fill="#64748b"/><path d="M40 256v-30a88 88 0 0 1 176 0v30" fill="#64748b"/></svg>')}`;

// Khi thiếu ảnh người xem, không dùng ảnh của một người khác trong kho test.
export const DEFAULT_VIEWER_AVATAR = placeholder;

export const AVAILABLE_AVATARS: string[] = Object.keys(bundledAvatars)
    .filter((file) => imageExtension.test(file))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    .map((file) => `/avatars/${encodeURIComponent(file.split('/').pop()!)}`);

export function fallbackAvatarUrl(username: string): string {
    let hash = 0;
    for (let i = 0; i < username.length; i++) hash = (hash * 31 + username.charCodeAt(i)) | 0;
    return AVAILABLE_AVATARS[Math.abs(hash) % AVAILABLE_AVATARS.length] ?? placeholder;
}

export function getRandomAvatarUrl(): string {
    return AVAILABLE_AVATARS[Math.floor(Math.random() * AVAILABLE_AVATARS.length)] ?? placeholder;
}

let syncPromise: Promise<string[]> | undefined;

/** Một request mỗi lần mở trang; danh sách server thay thế cả ảnh đã xóa. */
export function syncAvatarsFromServer(serverUrl = DEFAULT_SERVER_URL): Promise<string[]> {
    return syncPromise ??= (async () => {
        try {
            const res = await fetch(`${serverUrl}/api/avatars`, { signal: AbortSignal.timeout(3000) });
            if (!res.ok) return AVAILABLE_AVATARS;
            const list: unknown = await res.json();
            if (Array.isArray(list) && list.every((url): url is string =>
                typeof url === 'string' && /^\/avatars\/[^/]+$/.test(url) && imageExtension.test(url))) {
                // Backend cũ có thể còn cache các ảnh đã di chuyển/xóa.
                // Kiểm tra một lần bằng HEAD, không tải nội dung ảnh và không lặp trong render.
                const candidates = [...new Set([...list, ...AVAILABLE_AVATARS])];
                const checked = await Promise.all(candidates.map(async (url) => {
                    try {
                        const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
                        return response.ok && response.headers.get('content-type')?.startsWith('image/') ? url : null;
                    } catch { return null; }
                }));
                const valid = checked.filter((url): url is string => url !== null)
                    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
                AVAILABLE_AVATARS.splice(0, AVAILABLE_AVATARS.length, ...valid);
            }
        } catch {
            // Backend offline: dùng danh sách lúc build.
        }
        return AVAILABLE_AVATARS;
    })();
}
