import { useEffect, useState } from 'react';
import { VIDEO_PRESETS, detectAvailableVideos, type VideoPreset } from '../printer3d/backgroundManager';

/** Chỉ liệt kê những video thực sự có file trong client/public/backgrounds/ (vd2/vd3 chưa có thì ẩn). */
export function useAvailableVideos(): VideoPreset[] {
    const [ids, setIds] = useState<string[] | null>(null);
    useEffect(() => {
        let alive = true;
        void detectAvailableVideos().then((found) => {
            if (alive) setIds(found);
        });
        return () => {
            alive = false;
        };
    }, []);
    return VIDEO_PRESETS.filter((v) => (ids ? ids.includes(v.id) : v.id === VIDEO_PRESETS[0].id));
}
