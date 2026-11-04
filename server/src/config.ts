import dotenv from 'dotenv';

dotenv.config();

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
        /** Số avatar trên mỗi tờ. */
        sheetCapacity: num('SHEET_CAPACITY', 6),
        /** Thời gian in một avatar ở tốc độ x1 (ms). */
        basePrintMs: num('BASE_PRINT_MS', 2500),
        /** Hệ số thời gian cho trang đặc biệt (in nguyên trang). */
        fullPageTimeFactor: 2,
        minSpeed: 0.25,
        maxSpeed: 10,
    },
    gift: {
        /** Tổng kim cương (diamondCount * giftCount) để ra khung vàng. */
        goldDiamonds: num('GOLD_DIAMONDS', 100),
        /** Tổng kim cương để in nguyên một trang. */
        fullPageDiamonds: num('FULL_PAGE_DIAMONDS', 1000),
    },
    /** Số job đã hoàn tất giữ lại trong bộ nhớ. */
    historyLimit: 50,
} as const;

export type AppConfig = typeof config;
