import * as THREE from 'three';
import { disposeObjectTree, halfExtents, seededRandom } from './backdrop';

interface Wisp {
    mesh: THREE.Mesh;
    material: THREE.MeshBasicMaterial;
    depth: number;
    ny: number;
    width: number;
    speed: number;
    maxOpacity: number;
    x: number;
    bobPhase: number;
}

/**
 * Lớp khí quyển (gắn vào camera):
 * - Mây trời: vài cụm mây mỏng trôi rất chậm qua bầu trời (~4–6 phút mới đi hết khung).
 * - Sương thung lũng: dải sương trôi lững lờ giữa các rặng núi.
 * Mỗi cụm mờ dần ở hai mép khung hình nên khi quay vòng không bao giờ thấy "nhảy".
 */
export class MistLayerSystem {
    public group = new THREE.Group();
    private camera: THREE.PerspectiveCamera;
    private wisps: Wisp[] = [];
    private textures: THREE.CanvasTexture[] = [];
    private random = seededRandom(4242);
    private isVisible = true;

    constructor(camera: THREE.PerspectiveCamera) {
        this.camera = camera;
        this.group.name = 'MistLayerSystem';

        const cloudTex = this.createPuffTexture(9, 0.55);
        const mistTex = this.createPuffTexture(14, 0.3);
        this.textures.push(cloudTex, mistTex);

        // Mây trời (vùng 3% – 25% tính từ mép trên)
        const skyRows = [0.9, 0.74, 0.6, 0.82];
        skyRows.forEach((ny, i) => {
            this.addWisp(cloudTex, { depth: 22 + i, ny, widthFrac: 0.55 + this.random() * 0.3, aspect: 0.38, speed: 0.0065, opacity: 0.42, startFrac: i / skyRows.length });
        });

        // Sương thung lũng (vùng 30% – 55%)
        const mistRows = [0.32, 0.18, 0.05, -0.12];
        mistRows.forEach((ny, i) => {
            this.addWisp(mistTex, { depth: 12 + i * 0.6, ny, widthFrac: 0.9 + this.random() * 0.4, aspect: 0.22, speed: 0.009 + i * 0.002, opacity: 0.38, startFrac: (i + 0.5) / mistRows.length });
        });
    }

    private createPuffTexture(puffs: number, density: number): THREE.CanvasTexture {
        const w = 512;
        const h = 256;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;

        // Nhiều "cục bông" mềm chồng lên nhau, tâm dồn về giữa, không chạm mép -> mép luôn trong suốt
        for (let i = 0; i < puffs * 3; i++) {
            const t = this.random();
            const cx = w * (0.18 + 0.64 * t);
            const cy = h * (0.5 + (this.random() - 0.5) * 0.25);
            const r = h * (0.16 + this.random() * 0.2) * (1 - Math.abs(t - 0.5));
            const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
            g.addColorStop(0, `rgba(255, 255, 255, ${density * 0.5})`);
            g.addColorStop(0.6, `rgba(244, 248, 252, ${density * 0.22})`);
            g.addColorStop(1, 'rgba(240, 246, 252, 0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, w, h);
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    private addWisp(
        texture: THREE.Texture,
        o: { depth: number; ny: number; widthFrac: number; aspect: number; speed: number; opacity: number; startFrac: number }
    ): void {
        const { halfW } = halfExtents(this.camera, o.depth);
        const width = halfW * 2 * o.widthFrac;
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            depthWrite: false,
            opacity: 0,
        });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, o.aspect), material);
        mesh.scale.setScalar(width);
        if (this.random() > 0.5) mesh.rotation.z = Math.PI; // đảo hình cho đỡ giống nhau
        this.group.add(mesh);

        const span = halfW * 2 + width;
        this.wisps.push({
            mesh,
            material,
            depth: o.depth,
            ny: o.ny,
            width,
            speed: o.speed,
            maxOpacity: o.opacity,
            x: -halfW - width / 2 + span * o.startFrac,
            bobPhase: this.random() * Math.PI * 2,
        });
    }

    public update(delta: number, time = 0): void {
        if (!this.isVisible) return;
        const dt = Math.min(delta, 0.1);

        for (const w of this.wisps) {
            const { halfW, halfH } = halfExtents(this.camera, w.depth);
            // speed tính theo tỷ lệ bề ngang khung hình / giây để không phụ thuộc độ sâu
            w.x += w.speed * halfW * 2 * dt;
            const limit = halfW + w.width / 2;
            if (w.x > limit) w.x = -limit;

            const y = w.ny * halfH + Math.sin(time * 0.05 + w.bobPhase) * halfH * 0.015;
            w.mesh.position.set(w.x, y, -w.depth);

            // Mờ dần khi ra/vào mép khung hình
            const edge = 1 - Math.abs(w.x) / limit;
            w.material.opacity = w.maxOpacity * THREE.MathUtils.smoothstep(edge, 0, 0.35);
        }
    }

    public setVisible(visible: boolean): void {
        this.isVisible = visible;
        this.group.visible = visible;
    }

    public getVisible(): boolean {
        return this.isVisible;
    }

    public dispose(): void {
        disposeObjectTree(this.group);
        this.textures.forEach((t) => t.dispose());
    }
}
