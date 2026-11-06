import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface BackgroundSettings {
    presetId: string;
    autoRotate: boolean;
    intervalMinutes: number;
    showButterflies: boolean;
    showBirds: boolean;
    /** 'image' = cảnh sống (ảnh động), 'video' = video nền */
    mode: 'image' | 'video';
    videoId: string;
}

export interface AudioSettings {
    /** 0..1 – âm lượng tiếng bút / chuông / cuộn giấy */
    sfxVolume: number;
    /** 0..1 – âm lượng nhạc nền */
    bgmVolume: number;
    /** Overlay có phát nhạc nền không */
    bgmEnabled: boolean;
    /** Tắt toàn bộ âm thanh trên overlay */
    muted: boolean;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = { sfxVolume: 1, bgmVolume: 0.7, bgmEnabled: true, muted: false };

export const getAudioConfig = (): AudioSettings => {
    const s = loadSettings();
    return s.audio ? { ...DEFAULT_AUDIO_SETTINGS, ...s.audio } : DEFAULT_AUDIO_SETTINGS;
};

export interface PersistedSettings {
    tiktokUser?: string;
    goldDiamonds?: number;
    fullPageDiamonds?: number;
    background?: BackgroundSettings;
    audio?: AudioSettings;
}

export const DEFAULT_BACKGROUND_SETTINGS: BackgroundSettings = {
    presetId: 'mountain-mist',
    autoRotate: false,
    intervalMinutes: 5,
    showButterflies: true,
    showBirds: true,
    mode: 'image',
    videoId: 'vd1',
};

export const getBackgroundConfig = (): BackgroundSettings => {
    const s = loadSettings();
    return s.background ? { ...DEFAULT_BACKGROUND_SETTINGS, ...s.background } : DEFAULT_BACKGROUND_SETTINGS;
};

const dir = process.env['DATA_DIR'] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const file = path.join(dir, 'settings.json');

export const loadSettings = (): PersistedSettings => {
    try {
        const raw: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
        return typeof raw === 'object' && raw !== null ? (raw as PersistedSettings) : {};
    } catch {
        return {};
    }
};

export const saveSettings = (patch: PersistedSettings): void => {
    try {
        fs.mkdirSync(dir, { recursive: true });
        // Ghi ra file tạm rồi đổi tên: tắt máy đột ngột giữa chừng cũng không làm hỏng settings.json
        const tmp = `${file}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify({ ...loadSettings(), ...patch }, null, 2));
        fs.renameSync(tmp, file);
    } catch (err) {
        console.error('Không lưu được settings.json:', err);
    }
};

let saveTimer: NodeJS.Timeout | null = null;
let pendingPatch: PersistedSettings = {};

export const saveSettingsDebounced = (patch: PersistedSettings, delayMs = 300): void => {
    pendingPatch = { ...pendingPatch, ...patch };
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        saveSettings(pendingPatch);
        pendingPatch = {};
        saveTimer = null;
    }, delayMs);
};
