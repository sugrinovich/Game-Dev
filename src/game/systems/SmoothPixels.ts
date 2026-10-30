import Phaser from 'phaser';

/*
 * «Гладкие пиксели»: кадр игры (холст) увеличивается на экран не браузером, а шейдером.
 * Внутри каждого пикселя цвет не меняется — картинка остаётся пиксельной. Но там, где по краю идёт «лесенка»
 * (угол пикселя зажат двумя одинаковыми соседями другого цвета), угол срезается ровной линией —
 * идея алгоритмов Scale2x / xBR. Одиночные пиксели (глаза, блики) и прямые края не трогаются.
 * Каждый пиксель экрана — четыре отсчёта: края сглажены даже при дробном увеличении (холст в 1,5 или 2,5 раза).
 * Рисуется на отдельный WebGL-холст поверх холста Phaser; мышь проходит сквозь него к игре.
 */

/** Насколько цвета считаются одинаковыми (по каждому каналу, 0–1): мелкий шум пола не мешает найти край. */
const SAME_COLOR = 0.1;

const VERTEX = `
attribute vec2 pos;
varying vec2 uv;
void main() {
  uv = vec2(pos.x, 1.0 - pos.y);
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D src;
uniform vec2 size;   // кадр игры (холст), пикселей
uniform float foot;  // половина пикселя экрана в пикселях холста
varying vec2 uv;

vec3 at(vec2 cell) { return texture2D(src, (cell + 0.5) / size).rgb; }
bool same(vec3 a, vec3 b) { vec3 d = abs(a - b); return max(d.r, max(d.g, d.b)) < ${SAME_COLOR.toFixed(3)}; }

// цвет в точке p: цвет пикселя, но угол-ступенька лесенки срезан по линии через середины сторон
vec3 cut(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = p - cell - 0.5;                                        // от -0.5 до 0.5 внутри пикселя
  vec2 s = vec2(f.x < 0.0 ? -1.0 : 1.0, f.y < 0.0 ? -1.0 : 1.0);  // к какому углу ближе
  vec3 e = at(cell);
  vec3 h = at(cell + vec2(s.x, 0.0)), v = at(cell + vec2(0.0, s.y));        // соседи у этого угла
  vec3 ho = at(cell - vec2(s.x, 0.0)), vo = at(cell - vec2(0.0, s.y));      // и с противоположных сторон
  // правило Scale2x: соседи у угла одного цвета, а линия не продолжается дальше — это ступенька
  if (abs(f.x) + abs(f.y) > 0.5 && same(h, v) && !same(h, e) && !same(h, vo) && !same(v, ho)) return (h + v) * 0.5;
  return e;
}

void main() {
  vec2 p = uv * size;
  float d = foot * 0.5;
  // четыре отсчёта внутри пикселя экрана: края сглажены при любом, в том числе дробном, увеличении
  vec3 c = cut(p + vec2(-d, -d)) + cut(p + vec2(d, -d)) + cut(p + vec2(-d, d)) + cut(p + vec2(d, d));
  gl_FragColor = vec4(c * 0.25, 1.0);
}`;

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

/**
 * Включает гладкое увеличение. Если WebGL недоступен — ничего не делает, игра показывается как раньше.
 * Холст Phaser должен лежать в контейнере с position: relative (см. style.css).
 */
export function attachSmoothPixels(game: Phaser.Game): void {
  const source = game.canvas;
  const parent = source.parentElement;
  const view = document.createElement('canvas');
  const gl = view.getContext('webgl', { alpha: false, antialias: false, depth: false, premultipliedAlpha: false });
  if (!parent || !gl) return;
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX), fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  const program = gl.createProgram();
  if (!vs || !fs || !program) return;
  gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
  gl.useProgram(program);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const pos = gl.getAttribLocation(program, 'pos');
  gl.enableVertexAttribArray(pos);
  gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]] as const) gl.texParameteri(gl.TEXTURE_2D, k, v);
  const uSize = gl.getUniformLocation(program, 'size'), uFoot = gl.getUniformLocation(program, 'foot');

  // поверх холста игры, мышь и касания проходят к нему
  Object.assign(view.style, { position: 'absolute', pointerEvents: 'none', imageRendering: 'auto' });
  parent.appendChild(view);

  // Phaser сам задаёт холсту размер на экране и отступы для центрирования — повторяем их, когда они меняются
  let layout = '';
  const syncLayout = (): void => {
    const s = source.style, dpr = window.devicePixelRatio || 1;
    const key = `${s.width}|${s.height}|${s.marginLeft}|${s.marginTop}|${dpr}`;
    if (key === layout) return;
    layout = key;
    Object.assign(view.style, { width: s.width, height: s.height, left: s.marginLeft || '0px', top: s.marginTop || '0px' });
    view.width = Math.max(1, Math.round(parseFloat(s.width) * dpr));
    view.height = Math.max(1, Math.round(parseFloat(s.height) * dpr));
    gl.viewport(0, 0, view.width, view.height);
    gl.uniform2f(uSize, source.width, source.height);
    gl.uniform1f(uFoot, (0.5 * source.width) / view.width);
  };

  // сразу после отрисовки кадра (пока он ещё в буфере холста Phaser) копируем его и увеличиваем
  game.events.on(Phaser.Core.Events.POST_RENDER, () => {
    syncLayout();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  });
}
