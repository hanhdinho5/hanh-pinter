import test from 'node:test';
import assert from 'node:assert/strict';
import { extractUser, extractAvatarUrl, extractGift } from './tiktokAdapter.js';

test('extractUser trích xuất chính xác userId và username từ các cấu trúc dữ liệu TikTok', () => {
    // Trường hợp 1: Dữ liệu phẳng
    const u1 = extractUser({ userId: '123456', uniqueId: 'alex_gamer' });
    assert.equal(u1.userId, '123456');
    assert.equal(u1.username, 'alex_gamer');

    // Trường hợp 2: Lấy nickname khi không có uniqueId
    const u2 = extractUser({ userId: 789, nickname: 'Alex VIP' });
    assert.equal(u2.userId, '789');
    assert.equal(u2.username, 'Alex VIP');

    // Trường hợp 3: Dữ liệu lồng trong user object
    const u3 = extractUser({ user: { id: '999', uniqueId: 'nested_user' } });
    assert.equal(u3.userId, '999');
    assert.equal(u3.username, 'nested_user');

    // Trường hợp 4: Fallback khi rỗng
    const u4 = extractUser(null);
    assert.equal(u4.userId, 'anonymous');
    assert.equal(u4.username, 'Viewer');
});

test('ưu tiên tên hiển thị có dấu/emoji; thiếu tên mới dùng username, giữ nguyên userId', () => {
    const account = { userId: '123', uniqueId: 'kuv.yog.7641176' };
    assert.deepEqual(extractUser({ user: { ...account, nickname: 'KUV YOG HMOOB❤️❤️' } }), {
        userId: '123', username: 'KUV YOG HMOOB❤️❤️',
    });
    assert.equal(extractUser({ ...account, nickname: 'Hạnh Đinho' }).username, 'Hạnh Đinho');
    assert.equal(extractUser({ user: { ...account, nickname: '  ' } }).username, account.uniqueId);
    assert.equal(extractUser({ user: account, nickname: 'Minh Anh' }).username, 'Minh Anh');
});

test('extractAvatarUrl trích xuất avatar theo độ ưu tiên', () => {
    // 1. profilePictureUrl chuỗi trực tiếp
    const a1 = extractAvatarUrl({ profilePictureUrl: 'https://p16.tiktokcdn.com/avatar1.jpg' });
    assert.equal(a1, 'https://p16.tiktokcdn.com/avatar1.jpg');

    // 2. Mảng profilePictureUrls
    const a2 = extractAvatarUrl({ profilePictureUrls: ['https://p16.tiktokcdn.com/avatar2.jpg'] });
    assert.equal(a2, 'https://p16.tiktokcdn.com/avatar2.jpg');

    // 3. userDetails.profilePictureUrls
    const a3 = extractAvatarUrl({
        userDetails: { profilePictureUrls: ['https://p16.tiktokcdn.com/avatar3.jpg'] },
    });
    assert.equal(a3, 'https://p16.tiktokcdn.com/avatar3.jpg');

    // 4. user.avatarThumb.urlList
    const a4 = extractAvatarUrl({
        user: { avatarThumb: { urlList: ['https://p16.tiktokcdn.com/avatar4.jpg'] } },
    });
    assert.equal(a4, 'https://p16.tiktokcdn.com/avatar4.jpg');

    // 5. Fallback khi không có
    const a5 = extractAvatarUrl({});
    assert.equal(a5, null);
});


test('proto v3: user lồng + quà combo chỉ tính phần mới', () => {
    const data = {
        user: { userId: '42', uniqueId: 'viewer_a', avatarThumb: { urlList: ['https://cdn/a.jpg'] } },
        giftId: 5655,
        giftDetails: { giftName: 'Rose', diamondCount: 1, giftType: 1 },
    };
    assert.deepEqual(extractUser(data), { userId: '42', username: 'viewer_a' });
    assert.equal(extractAvatarUrl(data), 'https://cdn/a.jpg');
    const g = extractGift(data);
    assert.equal(g.giftName, 'Rose');
    assert.equal(g.streakable, true);
});
