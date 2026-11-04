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
            avatarUrl: null,
            frame: 'normal',
        },
        {
            slot: 1,
            jobId: 'job-02',
            userId: 'user-02',
            username: 'sarah.dance',
            avatarUrl: null,
            frame: 'normal',
        },
        {
            slot: 2,
            jobId: 'job-03',
            userId: 'user-03',
            username: 'dragon_king_vip',
            avatarUrl: null,
            frame: 'gold', // Quà tặng > 100 kim cương
        },
        {
            slot: 3,
            jobId: 'job-04',
            userId: 'user-04',
            username: 'viet_live_fan',
            avatarUrl: null,
            frame: 'normal',
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
            avatarUrl: null,
            frame: 'normal',
        },
        {
            slot: 1,
            jobId: 'job-12',
            userId: 'user-12',
            username: 'mia_music',
            avatarUrl: null,
            frame: 'normal',
        },
        {
            slot: 2,
            jobId: 'job-13',
            userId: 'user-13',
            username: 'golden_lion_88',
            avatarUrl: null,
            frame: 'gold',
        },
        {
            slot: 3,
            jobId: 'job-14',
            userId: 'user-14',
            username: 'tommy_boy',
            avatarUrl: null,
            frame: 'normal',
        },
        {
            slot: 4,
            jobId: 'job-15',
            userId: 'user-15',
            username: 'luna_celestial',
            avatarUrl: null,
            frame: 'gold',
        },
        {
            slot: 5,
            jobId: 'job-16',
            userId: 'user-16',
            username: 'shadow_ninja',
            avatarUrl: null,
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
            avatarUrl: null,
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

