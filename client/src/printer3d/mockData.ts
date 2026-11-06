import type { Sheet } from '../types';

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
            username: 'alex_gamer99',
            avatarUrl: '/avatars/avatar-01.svg',
            frame: 'normal',
        },
        {
            slot: 1,
            jobId: 'job-02',
            userId: 'user-02',
            username: 'sarah.dance',
            avatarUrl: '/avatars/avatar-02.svg',
            frame: 'normal',
        },
        {
            slot: 2,
            jobId: 'job-03',
            userId: 'user-03',
            username: 'dragon_king_vip',
            avatarUrl: '/avatars/avatar-03.svg',
            frame: 'gold', // Quà tặng > 100 kim cương -> chiếm nguyên hàng
            isWide: true,
        },
    ],
};

export const mockFullSheet: Sheet = {
    id: 43,
    kind: 'standard',
    capacity: 6,
    completed: true,
    entries: [
        {
            slot: 0,
            jobId: 'job-11',
            userId: 'user-11',
            username: 'alex_streamer',
            avatarUrl: '/avatars/avatar-05.svg',
            frame: 'normal',
        },
        {
            slot: 1,
            jobId: 'job-12',
            userId: 'user-12',
            username: 'mia_music',
            avatarUrl: '/avatars/avatar-06.svg',
            frame: 'normal',
        },
        {
            slot: 2,
            jobId: 'job-13',
            userId: 'user-13',
            username: 'golden_lion_88',
            avatarUrl: '/avatars/avatar-07.svg',
            frame: 'gold',
        },
        {
            slot: 3,
            jobId: 'job-14',
            userId: 'user-14',
            username: 'tommy_boy',
            avatarUrl: '/avatars/avatar-08.svg',
            frame: 'normal',
        },
        {
            slot: 4,
            jobId: 'job-15',
            userId: 'user-15',
            username: 'luna_celestial',
            avatarUrl: '/avatars/avatar-09.svg',
            frame: 'gold',
        },
        {
            slot: 5,
            jobId: 'job-16',
            userId: 'user-16',
            username: 'shadow_ninja',
            avatarUrl: '/avatars/avatar-10.svg',
            frame: 'normal',
        },
    ],
};

export const mockSpecialSheet: Sheet = {
    id: 44,
    kind: 'special',
    capacity: 1,
    completed: true,
    entries: [
        {
            slot: 0,
            jobId: 'job-vip-999',
            userId: 'user-superstar',
            username: 'KING_OF_DONORS',
            avatarUrl: '/avatars/avatar-11.svg',
            frame: 'gold',
        },
    ],
};

export const mockEmptySheet: Sheet = {
    id: 45,
    kind: 'standard',
    capacity: 6,
    completed: false,
    entries: [],
};

