import * as THREE from 'three';
import { halfExtents, smoothNoise } from './backdrop';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * "Ảnh sống" (cinemagraph) từ một ảnh tĩnh:
 * - Bầu trời: mây trôi theo dòng (flow-map 2 pha hoà trộn -> trôi mãi không bị giật về đầu).
 * - Biển mây thung lũng: chảy nhẹ.
 * - Rừng cây: rung rinh theo gió.
 * - Bóng mây mờ lướt qua núi.
 * Vùng nào là trời / sương / cây được nhận diện theo màu ảnh, nên dùng được cho ảnh phong cảnh khác.
 */
const FRAG = /* glsl */ `
uniform sampler2D map;
uniform float time;
uniform float skyPhase;
uniform float mistPhase;
uniform float wind;
uniform float horizon;
uniform vec2 uvScale;
uniform vec2 uvOffset;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
}

// Dòng chảy 2 pha: mỗi lớp trôi một đoạn rồi quay lại, lớp kia che lúc quay lại
vec3 flowSample(vec2 uv, vec2 dir, float strength, float phase) {
    float p0 = fract(phase);
    float p1 = fract(phase + 0.5);
    float w0 = 1.0 - abs(2.0 * p0 - 1.0);
    vec3 a = texture2D(map, uv - dir * (p0 - 0.5) * strength).rgb;
    vec3 b = texture2D(map, uv - dir * (p1 - 0.5) * strength).rgb;
    return mix(b, a, w0);
}

void main() {
    vec2 uv = vUv * uvScale + uvOffset;
    vec3 base = texture2D(map, uv).rgb;
    float lum = dot(base, vec3(0.299, 0.587, 0.114));
    float sat = max(base.r, max(base.g, base.b)) - min(base.r, min(base.g, base.b));

    // Hướng chảy uốn lượn theo nhiễu để mây "biến hình" chứ không trượt cứng
    float warp = fbm(uv * 3.0 + vec2(time * 0.015, 0.0)) - 0.5;

    // 1. Bầu trời
    float skyMask = smoothstep(horizon, horizon + 0.05, uv.y);
    vec3 sky = flowSample(uv, normalize(vec2(1.0, 0.08 + warp * 0.6)), 0.035, skyPhase);

    // 2. Biển mây / sương (vùng sáng, ít màu, dưới đường chân trời)
    float mistMask = smoothstep(0.6, 0.8, lum) * (1.0 - smoothstep(0.1, 0.22, sat)) * (1.0 - skyMask);
    vec3 mist = flowSample(uv, normalize(vec2(1.0, -0.05 + warp * 0.4)), 0.018, mistPhase);

    // 3. Rừng cây rung theo gió (vùng tối)
    float treeMask = (1.0 - smoothstep(0.32, 0.5, lum)) * (1.0 - skyMask);
    float sway = sin(time * 1.9 + uv.y * 160.0 + uv.x * 35.0) * 0.5 + (fbm(uv * 25.0 + time * 0.6) - 0.5);
    vec3 trees = texture2D(map, uv + vec2(sway * 0.0011 * (0.4 + wind), 0.0)).rgb;

    vec3 col = base;
    col = mix(col, trees, treeMask);
    col = mix(col, mist, mistMask);
    col = mix(col, sky, skyMask);

    // 4. Bóng mây lướt chậm qua núi và biển mây
    float shade = fbm(uv * vec2(2.5, 4.0) + vec2(time * 0.012, time * 0.002));
    col *= 1.0 + (shade - 0.5) * 0.09 * (1.0 - skyMask);

    gl_FragColor = vec4(col, 1.0);
}
`;

export class LivingBackground {
    public mesh: THREE.Mesh;
    private material: THREE.ShaderMaterial;
    private camera: THREE.PerspectiveCamera;
    private loader = new THREE.TextureLoader();
    private texture: THREE.Texture | null = null;
    private currentUrl = '';
    private imageAspect = 9 / 16;
    private skyPhase = 0;
    private mistPhase = 0.25;
    private readonly depth = 45;

    constructor(camera: THREE.PerspectiveCamera) {
        this.camera = camera;
        this.material = new THREE.ShaderMaterial({
            vertexShader: VERT,
            fragmentShader: FRAG,
            uniforms: {
                map: { value: null },
                time: { value: 0 },
                skyPhase: { value: 0 },
                mistPhase: { value: 0 },
                wind: { value: 0.5 },
                // Đường chân trời (toạ độ uv, 0 = đáy ảnh): ảnh thung lũng mây ~ 72%
                horizon: { value: 0.715 },
                uvScale: { value: new THREE.Vector2(1, 1) },
                uvOffset: { value: new THREE.Vector2(0, 0) },
            },
            depthTest: false,
            depthWrite: false,
        });
        this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
        this.mesh.name = 'LivingBackground';
        this.mesh.renderOrder = -100;
        this.mesh.frustumCulled = false;
        this.mesh.visible = false;
    }

    public setImage(url: string): void {
        if (url === this.currentUrl) return;
        this.currentUrl = url;
        this.loader.load(url, (tex) => {
            if (url !== this.currentUrl) {
                tex.dispose();
                return;
            }
            // Giữ nguyên giá trị màu của ảnh (shader xuất thẳng, không qua chuyển đổi màu)
            tex.colorSpace = THREE.NoColorSpace;
            tex.wrapS = THREE.MirroredRepeatWrapping;
            tex.wrapT = THREE.ClampToEdgeWrapping;
            tex.anisotropy = 4;
            this.texture?.dispose();
            this.texture = tex;
            const img = tex.image as { width: number; height: number };
            this.imageAspect = img.width / img.height;
            this.material.uniforms.map.value = tex;
            this.mesh.visible = this.enabled;
        });
    }

    private enabled = true;
    public setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        this.mesh.visible = enabled && this.texture !== null;
    }

    public update(delta: number, time: number): void {
        if (!this.mesh.visible) return;
        const dt = Math.min(delta, 0.1);

        // Gió: lúc lặng lúc có cơn -> mây "thỉnh thoảng" trôi nhanh hơn
        const gust = THREE.MathUtils.clamp(0.45 + smoothNoise(time * 0.07, 3) * 0.5 + Math.max(0, smoothNoise(time * 0.19, 8)) * 0.6, 0.15, 1.4);
        this.skyPhase += (dt / 18) * gust;
        this.mistPhase += (dt / 14) * (0.5 + gust * 0.5);

        const u = this.material.uniforms;
        u.time.value = time;
        u.skyPhase.value = this.skyPhase;
        u.mistPhase.value = this.mistPhase;
        u.wind.value = gust;

        // Phủ kín khung hình kiểu "cover" như CSS background-size: cover
        const { halfW, halfH } = halfExtents(this.camera, this.depth);
        this.mesh.position.set(0, 0, -this.depth);
        this.mesh.scale.set(halfW * 2, halfH * 2, 1);
        const viewAspect = this.camera.aspect;
        if (viewAspect > this.imageAspect) {
            const s = this.imageAspect / viewAspect;
            u.uvScale.value.set(1, s);
            u.uvOffset.value.set(0, (1 - s) / 2);
        } else {
            const s = viewAspect / this.imageAspect;
            u.uvScale.value.set(s, 1);
            u.uvOffset.value.set((1 - s) / 2, 0);
        }
    }

    public dispose(): void {
        this.texture?.dispose();
        this.material.dispose();
        this.mesh.geometry.dispose();
    }
}
