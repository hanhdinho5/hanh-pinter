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

test('combo quà gộp thành MỘT vé với tổng kim cương (khung vàng khi đủ ngưỡng)', () => {
    const core = createCore(config);
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

test('chat từ cùng một người chỉ in một lần trên mỗi tờ', () => {
    const core = createCore(config);
    core.engine.pause();
    core.tiktok.simulate('chat', { user: user('b') });
    core.tiktok.simulate('chat', { user: user('b') });
    assert.equal(core.queue.snapshot().pendingFree.length, 1);
});

test('hàng đợi miễn phí đầy thì bỏ comment mới, quà vẫn vào', () => {
    const core = createCore({ ...config, queue: { ...config.queue, maxFree: 3 } });
    core.engine.pause();
    for (let i = 0; i < 10; i++) core.tiktok.simulate('chat', { user: user(`v${i}`) });
    assert.equal(core.queue.snapshot().pendingFree.length, 3);
    core.tiktok.simulate('gift', { ...giftData('z', 1, true), giftDetails: { giftName: 'Rose', diamondCount: 1, giftType: 0 } });
    assert.equal(core.queue.snapshot().pendingPriority.length, 1);
});
