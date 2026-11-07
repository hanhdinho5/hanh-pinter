import dotenv from 'dotenv';
import { loadSettings } from './settings.js';

dotenv.config();
const saved = loadSettings();

const num = (name: string, fallback: number): number => {
    const raw = process.env[name];
    if (raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : fallback;
};

export const config = {
    port: num('PORT', 3001),
    clientOrigin: process.env['CLIENT_ORIGIN'] ?? 'http://localhost:5173',
    printer: {
        /** Số avatar trên mỗi tờ (mặc định 4 avatar: 2 hàng x 2 cột). */
        sheetCapacity: num('SHEET_CAPACITY', 4),
        /** Thời gian in một avatar ở tốc độ x1 (ms). */
        basePrintMs: num('BASE_PRINT_MS', 2500),
        /** Hệ số thời gian cho trang đặc biệt (in nguyên trang). */
        fullPageTimeFactor: 2,
        minSpeed: 0.25,
        maxSpeed: 10,
    },
    gift: {
        /** Tổng kim cương (diamondCount * giftCount) để ra khung vàng. */
        goldDiamonds: num('GOLD_DIAMONDS', saved.goldDiamonds ?? 10),
        /** Tổng kim cương để dùng khung VIP vương miện. */
        fullPageDiamonds: num('FULL_PAGE_DIAMONDS', saved.fullPageDiamonds ?? 30),
    },
    queue: {
        /** Số lượt in miễn phí tối đa đang chờ; vượt thì bỏ comment/follow mới (tránh in trễ hàng chục phút). */
        maxFree: num('MAX_FREE_QUEUE', 30),
    },
    /** Số job đã hoàn tất giữ lại trong bộ nhớ. */
    historyLimit: 50,
};

export type AppConfig = typeof config;
