import type { Sheet } from '../types';
import { AVAILABLE_AVATARS, fallbackAvatarUrl } from './avatarManager';

const av = (idx: number) => AVAILABLE_AVATARS[idx % AVAILABLE_AVATARS.length] ?? fallbackAvatarUrl(String(idx));

export const mockPartialSheet: Sheet = {
    id: 42,
    kind: 'standard',
    capacity: 6,
    completed: false,
    entries: [
        {
            slot: 0,
            jobId: 'job-01',
            userId: 'user-01',
            username: 'Minh Anh',
            avatarUrl: av(0),
            frame: 'normal',
        },
        {
            slot: 1,
            jobId: 'job-02',
            userId: 'user-02',
            username: 'Linh Đan',
            avatarUrl: av(1),
            frame: 'normal',
        },
        {
            slot: 2,
            jobId: 'job-03',
            userId: 'user-03',
            username: 'Hoàng Anh',
            avatarUrl: av(2),
            frame: 'gold', // Quà tặng > 100 kim cương -> chiếm nguyên hàng
            isWide: true,
        },
    ],
};

