import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface BackgroundSettings {
    presetId: string;
    autoRotate: boolean;
    intervalMinutes: number;
    showButterflies: boolean;
    showBirds: boolean;
}

export interface PersistedSettings {
    tiktokUser?: string;
    goldDiamonds?: number;
    fullPageDiamonds?: number;
    background?: BackgroundSettings;
}

export const DEFAULT_BACKGROUND_SETTINGS: BackgroundSettings = {
    presetId: 'mountain-mist',
    autoRotate: false,
    intervalMinutes: 5,
    showButterflies: true,
    showBirds: true,
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
        fs.writeFileSync(file, JSON.stringify({ ...loadSettings(), ...patch }, null, 2));
    } catch (err) {
        console.error('Không lưu được settings.json:', err);
    }
};
