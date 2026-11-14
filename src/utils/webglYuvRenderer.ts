/**
 * Hardware-accelerated WebGL YUV420p -> RGB renderer for <canvas> (with 2D fallback).
 * Uploads Y, U, and V planar buffers from the tinyh264 WASM Web Worker directly to
 * GPU LUMINANCE textures at 30fps without using any <video> element.
 */
export class WebGLYuvRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private yTexture: WebGLTexture | null = null;
  private uTexture: WebGLTexture | null = null;
  private vTexture: WebGLTexture | null = null;
  private imageDataCache: ImageData | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.initWebGL();
  }

  private initWebGL(): void {
    try {
      const gl =
        (this.canvas.getContext('webgl', {
          preserveDrawingBuffer: false,
          antialias: false,
          depth: false,
          stencil: false,
        }) as WebGLRenderingContext | null) ||
        (this.canvas.getContext(
          'experimental-webgl'
        ) as WebGLRenderingContext | null);

      if (!gl) return;

      const vsSource = `
        attribute vec2 a_position;
        attribute vec2 a_texCoord;
        varying vec2 v_texCoord;
        void main() {
          gl_Position = vec4(a_position, 0.0, 1.0);
          v_texCoord = a_texCoord;
        }
      `;

      const fsSource = `
        precision mediump float;
        varying vec2 v_texCoord;
        uniform sampler2D u_textureY;
        uniform sampler2D u_textureU;
        uniform sampler2D u_textureV;
        uniform float u_cropRight;
        uniform float u_cropBottom;
        uniform float u_isRgb;
        void main() {
          vec2 uv = vec2(v_texCoord.x * u_cropRight, v_texCoord.y * u_cropBottom);
          if (u_isRgb > 0.5) {
            gl_FragColor = texture2D(u_textureY, uv);
            return;
          }
          float y = texture2D(u_textureY, uv).r;
          float u = texture2D(u_textureU, uv).r - 0.5;
          float v = texture2D(u_textureV, uv).r - 0.5;
          float yAdj = 1.16438356 * (y - 0.0625);
          float r = yAdj + 1.59602678 * v;
          float g = yAdj - 0.39176229 * u - 0.81296764 * v;
          float b = yAdj + 2.01723214 * u;
          gl_FragColor = vec4(clamp(r, 0.0, 1.0), clamp(g, 0.0, 1.0), clamp(b, 0.0, 1.0), 1.0);
        }
      `;

      const vs = this.compileShader(gl, gl.VERTEX_SHADER, vsSource);
      const fs = this.compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
      if (!vs || !fs) return;

      const program = gl.createProgram();
      if (!program) return;
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        return;
      }

      gl.useProgram(program);

      // Fullscreen quad positions & texture coordinates
      const positionBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW
      );
      const posLoc = gl.getAttribLocation(program, 'a_position');
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

      const texBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]),
        gl.STATIC_DRAW
      );
      const texLoc = gl.getAttribLocation(program, 'a_texCoord');
      gl.enableVertexAttribArray(texLoc);
      gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);

      this.yTexture = this.createPlaneTexture(gl, 0);
      this.uTexture = this.createPlaneTexture(gl, 1);
      this.vTexture = this.createPlaneTexture(gl, 2);

      gl.uniform1i(gl.getUniformLocation(program, 'u_textureY'), 0);
      gl.uniform1i(gl.getUniformLocation(program, 'u_textureU'), 1);
      gl.uniform1i(gl.getUniformLocation(program, 'u_textureV'), 2);
      gl.uniform1f(gl.getUniformLocation(program, 'u_isRgb'), 0.0);

      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

      this.gl = gl;
      this.program = program;
    } catch {
      this.gl = null;
    }
  }

  private compileShader(
    gl: WebGLRenderingContext,
    type: number,
    source: string
  ): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  private createPlaneTexture(
    gl: WebGLRenderingContext,
    unitIndex: number
  ): WebGLTexture | null {
    const tex = gl.createTexture();
    if (!tex) return null;
    gl.activeTexture(gl.TEXTURE0 + unitIndex);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
  }

  public isWebGLActive(): boolean {
    return Boolean(this.gl && this.program);
  }

  public clearFrame(): void {
    if (this.gl) {
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      this.gl.clearColor(0.03, 0.04, 0.06, 1.0);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT);
      return;
    }
    const ctx = this.canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#080b10';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  public renderVideoFrame(
    source: TexImageSource,
    width: number,
    height: number
  ): void {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.imageDataCache = null;
    }

    if (this.gl && this.program && this.yTexture) {
      const gl = this.gl;
      gl.viewport(0, 0, w, h);
      gl.useProgram(this.program);
      gl.uniform1f(gl.getUniformLocation(this.program, 'u_cropRight'), 1.0);
      gl.uniform1f(gl.getUniformLocation(this.program, 'u_cropBottom'), 1.0);
      gl.uniform1f(gl.getUniformLocation(this.program, 'u_isRgb'), 1.0);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.yTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source
      );
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return;
    }

    const ctx = this.canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(source as CanvasImageSource, 0, 0, w, h);
    }
  }

  public renderYuv420Frame(
    yuv: Uint8Array,
    strideWidth: number,
    strideHeight: number,
    displayWidth: number,
    displayHeight: number
  ): void {
    const w = Math.min(strideWidth, displayWidth || strideWidth);
    const h = Math.min(strideHeight, displayHeight || strideHeight);
    if (w <= 0 || h <= 0) return;

    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.imageDataCache = null;
    }

    const lumaSize = strideWidth * strideHeight;
    const chromaSize = lumaSize >> 2;
    const uOffset = lumaSize;
    const vOffset = lumaSize + chromaSize;

    if (
      this.gl &&
      this.program &&
      this.yTexture &&
      this.uTexture &&
      this.vTexture
    ) {
      const gl = this.gl;
      gl.viewport(0, 0, w, h);
      gl.useProgram(this.program);

      gl.uniform1f(
        gl.getUniformLocation(this.program, 'u_cropRight'),
        w / strideWidth
      );
      gl.uniform1f(
        gl.getUniformLocation(this.program, 'u_cropBottom'),
        h / strideHeight
      );
      gl.uniform1f(gl.getUniformLocation(this.program, 'u_isRgb'), 0.0);

      const yPlane = yuv.subarray(0, lumaSize);
      const uPlane = yuv.subarray(uOffset, uOffset + chromaSize);
      const vPlane = yuv.subarray(vOffset, vOffset + chromaSize);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.yTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.LUMINANCE,
        strideWidth,
        strideHeight,
        0,
        gl.LUMINANCE,
        gl.UNSIGNED_BYTE,
        yPlane
      );

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.uTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.LUMINANCE,
        strideWidth >> 1,
        strideHeight >> 1,
        0,
        gl.LUMINANCE,
        gl.UNSIGNED_BYTE,
        uPlane
      );

      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.vTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.LUMINANCE,
        strideWidth >> 1,
        strideHeight >> 1,
        0,
        gl.LUMINANCE,
        gl.UNSIGNED_BYTE,
        vPlane
      );

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return;
    }

    // 2D Canvas fallback if WebGL context is unavailable
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    let imgData = this.imageDataCache;
    if (!imgData || imgData.width !== w || imgData.height !== h) {
      imgData = ctx.createImageData(w, h);
      this.imageDataCache = imgData;
    }

    const rgba = imgData.data;
    const chromaStride = strideWidth >> 1;

    for (let y = 0; y < h; y++) {
      const yRowOffset = y * strideWidth;
      const uvRowOffset = (y >> 1) * chromaStride;
      const outRowOffset = y * w * 4;

      for (let x = 0; x < w; x++) {
        const yVal = yuv[yRowOffset + x] - 16;
        const uvIdx = uvRowOffset + (x >> 1);
        const uVal = yuv[uOffset + uvIdx] - 128;
        const vVal = yuv[vOffset + uvIdx] - 128;

        const c = yVal < 0 ? 0 : yVal * 298;
        const r = (c + 409 * vVal + 128) >> 8;
        const g = (c - 100 * uVal - 208 * vVal + 128) >> 8;
        const b = (c + 516 * uVal + 128) >> 8;

        const outIdx = outRowOffset + (x << 2);
        rgba[outIdx] = r < 0 ? 0 : r > 255 ? 255 : r;
        rgba[outIdx + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
        rgba[outIdx + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
        rgba[outIdx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }
}
