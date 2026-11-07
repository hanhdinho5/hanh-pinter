import test from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../app.js';
import { config } from '../config.js';

const user = (id: string) => ({ userId: `u-${id}`, uniqueId: id, nickname: id });
const giftData = (id: string, repeatCount: number, repeatEnd = false) => ({
    user: user(id),
    giftId: 5655,
    giftDetails: { giftName: 'Rose', diamondCount: 1, giftType: 1 },
    repeatCount,
    repeatEnd,
});

test('tim cộng riêng từng người: 9 chưa in, đủ 10 in; giữ tim dư và avatar thật', () => {
    const core = createCore(config);
    core.engine.pause();
    const viewer = { ...user('likes'), nickname: 'Minh Anh', avatarThumb: { urlList: ['https://p16.tiktokcdn.com/a.jpg'] } };
    core.tiktok.simulate('like', { user: viewer, count: 9, total: '1000000' });
    core.tiktok.simulate('like', { user: user('other'), likeCount: 9 });
    assert.equal(core.queue.freeSize, 0);
    core.tiktok.simulate('like', { user: viewer, count: 12 });
    assert.equal(core.queue.freeSize, 2);
    core.tiktok.simulate('like', { user: viewer, count: 9 });
    assert.equal(core.queue.freeSize, 3);
    const job = core.queue.snapshot().pendingFree[0]!;
    assert.equal(job.source, 'LIKE');
    assert.equal(job.username, 'Minh Anh');
    assert.equal(job.avatarUrl, 'https://p16.tiktokcdn.com/a.jpg');
    assert.equal(job.frame, 'normal');
});

test('5 lượt tim đầu cần 10, từ lượt 6 cần 30; vượt ngưỡng ngay trong cùng gói tim', () => {
    const core = createCore(config);
    core.engine.pause();
    const data = { user: user('tiered') };
    core.tiktok.simulate('like', { ...data, count: 49 });
    assert.equal(core.queue.freeSize, 4);
    core.tiktok.simulate('like', { ...data, count: 30 });
    assert.equal(core.queue.freeSize, 5); // tổng 79: 50 cho 5 lượt đầu, dư 29
    core.tiktok.simulate('like', { ...data, count: 1 });
    assert.equal(core.queue.freeSize, 6);
    core.tiktok.simulate('like', { ...data, count: 60 });
    assert.equal(core.queue.freeSize, 8);
    core.tiktok.simulate('like', { user: user('another'), count: 10 });
    assert.equal(core.queue.freeSize, 9); // người khác vẫn bắt đầu ở 10
    core.tiktok.simulate('gift', giftData('tiered', 1, true));
    core.tiktok.simulate('gift', giftData('tiered', 1, true));
    assert.equal(core.queue.snapshot().pendingPriority.length, 2);
});

test('tim không mất khi queue đầy, chia sẻ lặp vẫn được in', async () => {
    const core = createCore({ ...config, printer: { ...config.printer, basePrintMs: 1 }, queue: { ...config.queue, maxFree: 1 } });
    core.engine.pause();
    const data = { user: user('full') };
    core.tiktok.simulate('share', data);
    core.tiktok.simulate('like', { ...data, count: 10 });
    assert.equal(core.queue.freeSize, 1);
    core.engine.resume();
    await core.engine.idle();
    core.tiktok.simulate('like', { ...data, count: 1 });
    await core.engine.idle();
    assert.equal(core.queue.snapshot().recentCompleted.filter((job) => job.source === 'LIKE').length, 1);
    for (let i = 0; i < 7; i++) { core.tiktok.simulate('share', data); await core.engine.idle(); }
    assert.equal(core.queue.snapshot().recentCompleted.filter((job) => job.source === 'SHARE').length, 8);
});
test('bỏ sự kiện tim/chia sẻ trùng message ID, thiếu người hoặc số tim không hợp lệ', () => {
    const core = createCore(config);
    core.engine.pause();
    const data = { user: user('dedup'), common: { msgId: '123' } };
    for (let i = 0; i < 2; i++) core.tiktok.simulate('like', { ...data, count: 10 });
    for (let i = 0; i < 2; i++) core.tiktok.simulate('share', data);
    core.tiktok.simulate('like', { count: 10 });
    core.tiktok.simulate('share', {});
    for (const count of [-1, 0, 1.5, NaN, Infinity]) core.tiktok.simulate('like', { user: user('bad'), count });
    core.tiktok.simulate('like', { user: user('bad'), total: 10000 });
    assert.equal(core.queue.freeSize, 2);
});

test('combo quà gộp thành MỘT vé với tổng kim cương (khung vàng khi đủ ngưỡng)', () => {
    const core = createCore({ ...config, gift: { goldDiamonds: 100, fullPageDiamonds: 1000 } });
    core.engine.pause(); // giữ job trong hàng đợi để kiểm tra
    core.tiktok.simulate('gift', giftData('a', 20));
    core.tiktok.simulate('gift', giftData('a', 60));
    core.tiktok.simulate('gift', giftData('a', 100));
    assert.equal(core.queue.snapshot().pendingPriority.length, 0); // chưa kết thúc combo thì chưa in
    core.tiktok.simulate('gift', giftData('a', 100, true));
    const jobs = core.queue.snapshot().pendingPriority;
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0]?.frame, 'gold');
});

test('5 chat cùng người tạo 5 lượt in và chặn các chat tiếp theo', () => {
    const core = createCore(config);
    core.engine.pause();
    for (let i = 0; i < 7; i++) core.tiktok.simulate('chat', { user: user('b') });
    assert.equal(core.queue.snapshot().pendingFree.length, 5);
});

test('hàng đợi miễn phí đầy thì bỏ comment mới, quà vẫn vào', () => {
    const core = createCore({ ...config, queue: { ...config.queue, maxFree: 3 } });
    core.engine.pause();
    for (let i = 0; i < 10; i++) core.tiktok.simulate('share', { user: user(`v${i}`) });
    assert.equal(core.queue.snapshot().pendingFree.length, 3);
    core.tiktok.simulate('gift', { ...giftData('z', 1, true), giftDetails: { giftName: 'Rose', diamondCount: 1, giftType: 0 } });
    assert.equal(core.queue.snapshot().pendingPriority.length, 1);
});
