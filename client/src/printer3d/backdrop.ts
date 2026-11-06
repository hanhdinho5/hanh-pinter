import * as THREE from 'three';

/**
 * Các lớp sinh vật/khí quyển (chim, bướm, lá, mây) được gắn vào CAMERA thay vì vào thế giới,
 * vì ảnh/video nền là một lớp 2D cố định phía sau canvas. Như vậy:
 * - Chim luôn bay ở vùng trời, mây luôn trôi ở vùng trời... đúng vị trí trên ảnh nền dù đổi preset camera.
 * - Tờ giấy (gần camera hơn) tự động che khuất chúng nhờ depth test.
 *
 * Toạ độ chuẩn hoá màn hình: nx -1 (trái) .. 1 (phải), ny -1 (đáy) .. 1 (đỉnh).
 * Đổi từ "% tính từ mép trên" sang ny: ny = 1 - 2 * percent / 100.
 */
export function halfExtents(camera: THREE.PerspectiveCamera, depth: number): { halfW: number; halfH: number } {
    const halfH = depth * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    return { halfW: halfH * camera.aspect, halfH };
}

export function screenToCamera(
    camera: THREE.PerspectiveCamera,
    nx: number,
    ny: number,
    depth: number,
    out: THREE.Vector3
): THREE.Vector3 {
    const { halfW, halfH } = halfExtents(camera, depth);
    return out.set(nx * halfW, ny * halfH, -depth);
}

/** Nhiễu mượt 1 chiều rẻ tiền (tổng các sóng sin lệch pha) cho chuyển động tự nhiên, không lặp lộ liễu. */
export function smoothNoise(t: number, seed: number): number {
    return (
        Math.sin(t * 1.0 + seed * 1.7) * 0.5 +
        Math.sin(t * 2.31 + seed * 3.1) * 0.3 +
        Math.sin(t * 4.73 + seed * 5.3) * 0.2
    );
}

/** Bộ sinh số ngẫu nhiên có seed để mỗi lần mở trang chuyển động vẫn giống nhau khi cần tái hiện. */
export function seededRandom(seed: number): () => number {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

export function disposeObjectTree(root: THREE.Object3D): void {
    const textures = new Set<THREE.Texture>();
    root.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose();
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach((m) => {
                const map = (m as THREE.MeshBasicMaterial).map;
                if (map) textures.add(map);
                m.dispose();
            });
        }
    });
    textures.forEach((t) => t.dispose());
}
