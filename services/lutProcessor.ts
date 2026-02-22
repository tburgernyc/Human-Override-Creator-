// WebGL-based 3D LUT processor for cinematic color grading
// LUT size: 17×17×17 trilinear interpolation in a WebGL fragment shader

export type LUTPreset = 'none' | 'kodak_5219' | 'fuji_400h' | 'bleach_bypass' | 'vintage_faded' | 'clean_rec709';

interface LUTDefinition {
  id: LUTPreset;
  label: string;
  description: string;
  // Transform functions applied per channel [0..1]
  r: (r: number, g: number, b: number) => number;
  g: (r: number, g: number, b: number) => number;
  b: (r: number, g: number, b: number) => number;
}

// ─── LUT math helpers ────────────────────────────────────────────────────────

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const contrast = (v: number, c: number) => clamp(0.5 + (v - 0.5) * c);

// ─── Built-in LUT definitions ────────────────────────────────────────────────

const LUT_DEFS: LUTDefinition[] = [
  {
    id: 'kodak_5219',
    label: 'Kodak 5219',
    description: 'Warm cinematic film stock — rich shadows, saturated highlights',
    r: (r, g, b) => clamp(r * 1.08 + g * 0.02 + b * -0.02 + 0.01),
    g: (r, g, b) => clamp(r * -0.01 + g * 1.00 + b * 0.00 - 0.005),
    b: (r, g, b) => clamp(r * 0.04 + g * -0.04 + b * 0.96 - 0.02),
  },
  {
    id: 'fuji_400h',
    label: 'Fuji 400H',
    description: 'Cool, slightly desaturated — pastel tones, lifted shadows',
    r: (r, g, b) => clamp(contrast(r * 0.96 + g * 0.02, 0.92) + 0.03),
    g: (r, g, b) => clamp(contrast(r * 0.00 + g * 0.98 + b * 0.02, 0.92) + 0.03),
    b: (r, g, b) => clamp(contrast(r * -0.02 + g * 0.04 + b * 1.04, 0.94) + 0.04),
  },
  {
    id: 'bleach_bypass',
    label: 'Bleach Bypass',
    description: 'High-contrast desaturated — silvery, gritty look',
    r: (r, g, b) => {
      const luma = r * 0.299 + g * 0.587 + b * 0.114;
      return clamp(contrast(mix(luma, r, 0.45), 1.35) - 0.03);
    },
    g: (r, g, b) => {
      const luma = r * 0.299 + g * 0.587 + b * 0.114;
      return clamp(contrast(mix(luma, g, 0.45), 1.35) - 0.03);
    },
    b: (r, g, b) => {
      const luma = r * 0.299 + g * 0.587 + b * 0.114;
      return clamp(contrast(mix(luma, b, 0.45), 1.35) - 0.03);
    },
  },
  {
    id: 'vintage_faded',
    label: 'Vintage Faded',
    description: 'Lifted blacks, faded highlights — retro analog look',
    r: (r, g, b) => clamp(r * 0.88 + 0.09),
    g: (r, g, b) => clamp(g * 0.85 + 0.07),
    b: (r, g, b) => clamp(b * 0.80 + 0.10),
  },
  {
    id: 'clean_rec709',
    label: 'Clean Rec.709',
    description: 'Broadcast-standard neutral grade — accurate, unmodified',
    r: (r) => clamp(r),
    g: (_, g) => clamp(g),
    b: (_, _g, b) => clamp(b),
  },
];

// ─── LUT table builder (17×17×17) ───────────────────────────────────────────

const SIZE = 17;

function buildLUTTable(def: LUTDefinition): Float32Array {
  // 3 floats (RGB) per lattice point — stored as R,G,B,R,G,B,...
  const table = new Float32Array(SIZE * SIZE * SIZE * 3);
  let idx = 0;
  for (let bi = 0; bi < SIZE; bi++) {
    for (let gi = 0; gi < SIZE; gi++) {
      for (let ri = 0; ri < SIZE; ri++) {
        const r0 = ri / (SIZE - 1);
        const g0 = gi / (SIZE - 1);
        const b0 = bi / (SIZE - 1);
        table[idx++] = def.r(r0, g0, b0);
        table[idx++] = def.g(r0, g0, b0);
        table[idx++] = def.b(r0, g0, b0);
      }
    }
  }
  return table;
}

// ─── WebGL shader sources ────────────────────────────────────────────────────

const VERT_SRC = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG_SRC = `
precision highp float;
uniform sampler2D u_image;
uniform sampler2D u_lut;
uniform float u_size;  // LUT dimension (17.0)
varying vec2 v_uv;

vec3 applyLUT(vec3 col) {
  float scale = (u_size - 1.0) / u_size;
  float offset = 0.5 / u_size;
  // Encode 3D LUT into a 2D strip (R across X, G*B into Y rows)
  // We bake into a 1D texture instead — trilinear via manual lerp
  float r = col.r * (u_size - 1.0);
  float g = col.g * (u_size - 1.0);
  float b = col.b * (u_size - 1.0);

  float ri = floor(r);
  float gi = floor(g);
  float bi = floor(b);
  float rf = r - ri;
  float gf = g - gi;
  float bf = b - bi;

  float W = u_size * u_size * u_size;

  // 8 corners of the RGB cube
  float i000 = (bi * u_size * u_size + gi * u_size + ri) / W;
  float i100 = (bi * u_size * u_size + gi * u_size + min(ri + 1.0, u_size - 1.0)) / W;
  float i010 = (bi * u_size * u_size + min(gi + 1.0, u_size - 1.0) * u_size + ri) / W;
  float i110 = (bi * u_size * u_size + min(gi + 1.0, u_size - 1.0) * u_size + min(ri + 1.0, u_size - 1.0)) / W;
  float i001 = (min(bi + 1.0, u_size - 1.0) * u_size * u_size + gi * u_size + ri) / W;
  float i101 = (min(bi + 1.0, u_size - 1.0) * u_size * u_size + gi * u_size + min(ri + 1.0, u_size - 1.0)) / W;
  float i011 = (min(bi + 1.0, u_size - 1.0) * u_size * u_size + min(gi + 1.0, u_size - 1.0) * u_size + ri) / W;
  float i111 = (min(bi + 1.0, u_size - 1.0) * u_size * u_size + min(gi + 1.0, u_size - 1.0) * u_size + min(ri + 1.0, u_size - 1.0)) / W;

  vec3 c000 = texture2D(u_lut, vec2(i000, 0.5)).rgb;
  vec3 c100 = texture2D(u_lut, vec2(i100, 0.5)).rgb;
  vec3 c010 = texture2D(u_lut, vec2(i010, 0.5)).rgb;
  vec3 c110 = texture2D(u_lut, vec2(i110, 0.5)).rgb;
  vec3 c001 = texture2D(u_lut, vec2(i001, 0.5)).rgb;
  vec3 c101 = texture2D(u_lut, vec2(i101, 0.5)).rgb;
  vec3 c011 = texture2D(u_lut, vec2(i011, 0.5)).rgb;
  vec3 c111 = texture2D(u_lut, vec2(i111, 0.5)).rgb;

  // Trilinear interpolation
  vec3 c00 = mix(c000, c100, rf);
  vec3 c01 = mix(c001, c101, rf);
  vec3 c10 = mix(c010, c110, rf);
  vec3 c11 = mix(c011, c111, rf);
  vec3 c0  = mix(c00,  c10,  gf);
  vec3 c1  = mix(c01,  c11,  gf);
  return mix(c0, c1, bf);
}

void main() {
  vec4 src = texture2D(u_image, vec2(v_uv.x, 1.0 - v_uv.y));
  gl_FragColor = vec4(applyLUT(src.rgb), src.a);
}`;

// ─── LUTProcessor class ──────────────────────────────────────────────────────

class LUTProcessor {
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private lutTextures: Map<LUTPreset, WebGLTexture> = new Map();
  private lutTables: Map<LUTPreset, Float32Array> = new Map();
  private canvas: HTMLCanvasElement | null = null;

  private initGL(): boolean {
    if (this.gl) return true;
    try {
      this.canvas = document.createElement('canvas');
      const gl = (this.canvas.getContext('webgl') || this.canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
      if (!gl) return false;
      this.gl = gl;

      const compile = (type: number, src: string) => {
        const s = gl.createShader(type)!;
        gl.shaderSource(s, src);
        gl.compileShader(s);
        return s;
      };

      this.program = gl.createProgram()!;
      gl.attachShader(this.program, compile(gl.VERTEX_SHADER, VERT_SRC));
      gl.attachShader(this.program, compile(gl.FRAGMENT_SHADER, FRAG_SRC));
      gl.linkProgram(this.program);

      // Full-screen quad
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

      return true;
    } catch {
      return false;
    }
  }

  private getLUTTexture(preset: LUTPreset): WebGLTexture | null {
    if (!this.gl || !this.program) return null;
    if (this.lutTextures.has(preset)) return this.lutTextures.get(preset)!;

    const def = LUT_DEFS.find(d => d.id === preset);
    if (!def) return null;

    if (!this.lutTables.has(preset)) {
      this.lutTables.set(preset, buildLUTTable(def));
    }
    const table = this.lutTables.get(preset)!;

    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    // 1D strip: width = SIZE³, height = 1, RGB float
    const total = SIZE * SIZE * SIZE;
    // Convert Float32 [0..1] → Uint8 [0..255] for RGBA texture
    const data = new Uint8Array(total * 4);
    for (let i = 0; i < total; i++) {
      data[i * 4 + 0] = Math.round(table[i * 3 + 0] * 255);
      data[i * 4 + 1] = Math.round(table[i * 3 + 1] * 255);
      data[i * 4 + 2] = Math.round(table[i * 3 + 2] * 255);
      data[i * 4 + 3] = 255;
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, total, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.lutTextures.set(preset, tex);
    return tex;
  }

  /** Apply LUT to an ImageData object. Returns new ImageData with LUT applied. */
  applyToImageData(imageData: ImageData, preset: LUTPreset): ImageData {
    if (preset === 'none') return imageData;

    if (!this.initGL() || !this.gl || !this.program || !this.canvas) {
      // CPU fallback — apply LUT table directly
      return this.cpuFallback(imageData, preset);
    }

    const gl = this.gl;
    const { width, height } = imageData;
    this.canvas.width = width;
    this.canvas.height = height;
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);

    // Upload source image as texture unit 0
    const imgTex = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, imgTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, imageData.data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_image'), 0);

    // LUT texture on unit 1
    const lutTex = this.getLUTTexture(preset);
    if (!lutTex) {
      gl.deleteTexture(imgTex);
      return this.cpuFallback(imageData, preset);
    }
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, lutTex);
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_lut'), 1);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_size'), SIZE);

    // Draw
    const posLoc = gl.getAttribLocation(this.program, 'a_pos');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Read back
    const out = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, out);
    gl.deleteTexture(imgTex);

    return new ImageData(new Uint8ClampedArray(out), width, height);
  }

  /** CPU-based LUT fallback using the pre-built table */
  private cpuFallback(imageData: ImageData, preset: LUTPreset): ImageData {
    const def = LUT_DEFS.find(d => d.id === preset);
    if (!def) return imageData;

    const output = new Uint8ClampedArray(imageData.data);
    for (let i = 0; i < output.length; i += 4) {
      const r = output[i] / 255;
      const g = output[i + 1] / 255;
      const b = output[i + 2] / 255;
      output[i]     = Math.round(def.r(r, g, b) * 255);
      output[i + 1] = Math.round(def.g(r, g, b) * 255);
      output[i + 2] = Math.round(def.b(r, g, b) * 255);
    }
    return new ImageData(output, imageData.width, imageData.height);
  }

  /** Returns all available LUT presets */
  getLUTNames(): Array<{ id: LUTPreset; label: string; description: string }> {
    return [
      { id: 'none', label: 'None', description: 'No color grading applied' },
      ...LUT_DEFS.map(d => ({ id: d.id, label: d.label, description: d.description })),
    ];
  }
}

export const lutProcessor = new LUTProcessor();
