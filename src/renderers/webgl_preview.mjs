import {
  computeEnclosureGeneral, getEffectiveC, getTrapHalfWidths, inLens
} from '../compute/inverse_search_reference.mjs';
import {
  GPU_SEARCH_CODES, GPU_SEARCH_FRAGMENT_SOURCE, GPU_SEARCH_LIMITS
} from '../compute/gpu_search_shader.mjs';

export const GPU_PREVIEW_LIMITS = Object.freeze({
  pixels: 120000,
  dimension: 768,
  minimumPixelErrorRatio: 16
});

const PALETTE_WIDTH = 101;
const PALETTE_HEIGHT = 9;
const FLOAT32_UNIT = 2 ** -23;
const MAX_GL_INT = 2 ** 31 - 1;
const VERTEX_SOURCE = `#version 300 es
void main() {
  vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;

const PALETTE_SOURCE = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_classification;
uniform sampler2D u_palette;
uniform int u_kind;
uniform bool u_showDifference;
uniform bool u_showOriginal;
uniform vec3 u_exterior;
uniform vec3 u_branch;
uniform float u_survivalOpacity;
out vec4 outColor;

vec3 palette(int code, int depth) {
  return texelFetch(u_palette, ivec2(clamp(depth, 0, 100), clamp(code, 0, 8)), 0).rgb;
}

void main() {
  ivec4 result = ivec4(round(texelFetch(u_classification, ivec2(gl_FragCoord.xy), 0) * 255.0));
  vec3 color = palette(result.r, result.g);
  if (u_kind != 3 && (result.r == ${GPU_SEARCH_CODES.DOMAIN} ||
      (u_kind == 2 && result.b == ${GPU_SEARCH_CODES.DOMAIN}))) {
    color = palette(${GPU_SEARCH_CODES.DOMAIN}, 0);
  } else if (u_kind == 1 && result.r == ${GPU_SEARCH_CODES.DEPTH_CAP}) {
    color = vec3(50.0, 138.0, 148.0) / 255.0;
  } else if (u_kind == 2) {
    if (result.b == ${GPU_SEARCH_CODES.DEPTH_CAP}) {
      color = vec3(50.0, 138.0, 148.0) / 255.0;
    } else if (result.b != ${GPU_SEARCH_CODES.EXTERIOR}) {
      color = palette(${GPU_SEARCH_CODES.NODE_CAP}, 0);
    }
  } else if (u_kind == 3) {
    color = u_showDifference ? color : u_exterior;
    if (u_showOriginal) {
      if (result.b == ${GPU_SEARCH_CODES.NUMERICAL} || result.b == ${GPU_SEARCH_CODES.PRECISION_GUARD}) {
        color = palette(result.b, result.a);
      } else if (result.b == ${GPU_SEARCH_CODES.INTERIOR} || result.b == ${GPU_SEARCH_CODES.OFF_LENS} ||
                 result.b == ${GPU_SEARCH_CODES.DEPTH_CAP} || result.b == ${GPU_SEARCH_CODES.NODE_CAP} ||
                 result.b == ${GPU_SEARCH_CODES.WORK_CAP}) {
        color = mix(color, u_branch, u_survivalOpacity);
      }
    }
  }
  // Match the byte palette and CPU compositing, including opaque PNG export.
  outColor = vec4(floor(color * 255.0 + 0.5) / 255.0, 1.0);
}
`;

const SEARCH_UNIFORMS = [
  'u_kind', 'u_center', 'u_span', 'u_resolution', 'u_c', 'u_n', 'u_kMax', 'u_lMax',
  'u_showDifference', 'u_showOriginal', 'u_fixedEnclosure', 'u_fixedTrap', 'u_fixedLens'
];
const PALETTE_UNIFORMS = [
  'u_classification', 'u_palette', 'u_kind', 'u_showDifference', 'u_showOriginal',
  'u_exterior', 'u_branch', 'u_survivalOpacity'
];

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function rgbBytes(value) {
  return value?.length === 3 && Array.from(value).every(channel => finite(channel) && channel >= 0 && channel <= 255);
}

/**
 * Own one auxiliary WebGL2 canvas. The visible explorer canvases remain 2D.
 *
 * render() is synchronous: copy its canvas with drawImage before yielding or
 * awaiting. preserveDrawingBuffer is false, so a later animation frame cannot
 * rely on the default framebuffer still containing this image.
 *
 * Numeric classification stays on the GPU in normal use. readClassification()
 * is an explicit, synchronous diagnostic for tests, not a production render step.
 */
export function createWebGLPreview({ onUnavailable } = {}) {
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  let gl = null;
  let resources = null;
  let supported = false;
  let disposed = false;
  let lost = false;
  let reason = '';
  let generation = 0;
  let classificationReady = false;
  let lastMetadata = null;
  let fixedContext = null;
  let fixedContextKey = '';
  let capabilities = Object.freeze({
    webglVersion: 2,
    preserveDrawingBuffer: false,
    searchLimits: GPU_SEARCH_LIMITS,
    previewLimits: GPU_PREVIEW_LIMITS
  });

  function notifyUnavailable() {
    if (typeof onUnavailable === 'function') {
      // Failure handling must remain available even if a host callback fails.
      try { onUnavailable(reason); } catch { /* The caller still receives null. */ }
    }
  }

  function releaseResources() {
    if (!resources || !gl) return;
    if (!lost && !gl.isContextLost()) {
      gl.deleteFramebuffer(resources.framebuffer);
      gl.deleteTexture(resources.classificationTexture);
      gl.deleteTexture(resources.paletteTexture);
      gl.deleteVertexArray(resources.vao);
      gl.deleteProgram(resources.searchProgram);
      gl.deleteProgram(resources.paletteProgram);
    }
    resources = null;
    classificationReady = false;
  }

  function unavailable(message, notify = true) {
    supported = false;
    reason = message;
    releaseResources();
    if (notify && !disposed) notifyUnavailable();
  }

  function shader(type, source) {
    const object = gl.createShader(type);
    if (!object) throw new Error('WebGL could not allocate a shader.');
    try {
      gl.shaderSource(object, source);
      gl.compileShader(object);
      if (!gl.getShaderParameter(object, gl.COMPILE_STATUS)) {
        throw new Error(`WebGL shader compilation failed: ${gl.getShaderInfoLog(object) || 'no driver details'}`);
      }
      return object;
    } catch (error) {
      gl.deleteShader(object);
      throw error;
    }
  }

  function program(fragmentSource) {
    let vertex = null;
    let fragment = null;
    let object = null;
    try {
      vertex = shader(gl.VERTEX_SHADER, VERTEX_SOURCE);
      fragment = shader(gl.FRAGMENT_SHADER, fragmentSource);
      object = gl.createProgram();
      if (!object) throw new Error('WebGL could not allocate a program.');
      gl.attachShader(object, vertex);
      gl.attachShader(object, fragment);
      gl.linkProgram(object);
      if (!gl.getProgramParameter(object, gl.LINK_STATUS)) {
        throw new Error(`WebGL program linking failed: ${gl.getProgramInfoLog(object) || 'no driver details'}`);
      }
      return object;
    } catch (error) {
      if (object) gl.deleteProgram(object);
      throw error;
    } finally {
      if (vertex) gl.deleteShader(vertex);
      if (fragment) gl.deleteShader(fragment);
    }
  }

  function locations(object, names) {
    return Object.fromEntries(names.map(name => [name, gl.getUniformLocation(object, name)]));
  }

  function configureTexture(texture) {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  function initialize() {
    if (!gl || disposed || lost) return;
    releaseResources();
    generation++;
    try {
      const highFloat = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
      if (!highFloat || highFloat.precision < 23 || highFloat.rangeMax < 127) {
        throw new Error('WebGL fragment precision is insufficient for the float32 preview.');
      }
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      const viewport = Array.from(gl.getParameter(gl.MAX_VIEWPORT_DIMS));
      const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      capabilities = Object.freeze({
        webglVersion: 2,
        version: gl.getParameter(gl.VERSION),
        shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
        renderer: gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
        vendor: gl.getParameter(debug ? debug.UNMASKED_VENDOR_WEBGL : gl.VENDOR),
        highFloat: Object.freeze({
          precision: highFloat.precision,
          rangeMin: highFloat.rangeMin,
          rangeMax: highFloat.rangeMax
        }),
        maxTextureSize,
        maxViewportDimensions: Object.freeze(viewport),
        maxPreviewDimension: Math.min(GPU_PREVIEW_LIMITS.dimension, maxTextureSize, ...viewport),
        preserveDrawingBuffer: false,
        searchLimits: GPU_SEARCH_LIMITS,
        previewLimits: GPU_PREVIEW_LIMITS
      });
      // Retain each handle as it is allocated, including partial failures.
      resources = {
        framebuffer: null, classificationTexture: null, paletteTexture: null,
        vao: null, searchProgram: null, paletteProgram: null,
        width: 0, height: 0, firstDraw: true
      };
      resources.searchProgram = program(GPU_SEARCH_FRAGMENT_SOURCE);
      resources.paletteProgram = program(PALETTE_SOURCE);
      resources.searchUniforms = locations(resources.searchProgram, SEARCH_UNIFORMS);
      resources.paletteUniforms = locations(resources.paletteProgram, PALETTE_UNIFORMS);
      resources.vao = gl.createVertexArray();
      resources.framebuffer = gl.createFramebuffer();
      resources.classificationTexture = gl.createTexture();
      resources.paletteTexture = gl.createTexture();
      if (!resources.vao || !resources.framebuffer || !resources.classificationTexture || !resources.paletteTexture) {
        throw new Error('WebGL could not allocate preview resources.');
      }
      gl.disable(gl.BLEND);
      gl.disable(gl.DITHER);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.STENCIL_TEST);
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.CULL_FACE);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.activeTexture(gl.TEXTURE0);
      configureTexture(resources.classificationTexture);
      gl.bindFramebuffer(gl.FRAMEBUFFER, resources.framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, resources.classificationTexture, 0);
      gl.activeTexture(gl.TEXTURE1);
      configureTexture(resources.paletteTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, PALETTE_WIDTH, PALETTE_HEIGHT, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      supported = true;
      reason = '';
    } catch (error) {
      unavailable(error instanceof Error ? error.message : 'WebGL initialization failed.');
    }
  }

  function fallback(message) {
    reason = message;
    classificationReady = false;
    return null;
  }

  function prepareJob(job, colors) {
    if (!job || (job.kind !== 'parameter' && job.kind !== 'dynamical')) {
      throw new Error('The preview requires a parameter or dynamical view.');
    }
    const { width, height, center, spanX, n } = job;
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
      throw new Error('The view has no valid drawable size.');
    }
    if (!finite(center?.x) || !finite(center?.y) || !finite(spanX) || spanX <= 0) {
      throw new Error('The preview requires finite coordinates and a positive span.');
    }
    if (!Number.isSafeInteger(n) || n < 2 || 2 * n - 1 > GPU_SEARCH_LIMITS.alphabet) {
      throw new Error('The GPU preview supports arities from 2 through 32.');
    }
    const kMax = job.kMax ?? 37;
    const LMax = job.LMax ?? 1000;
    const tol = job.tol ?? 1e-8;
    if (!Number.isSafeInteger(kMax) || kMax < 0 || !Number.isSafeInteger(LMax) || LMax < 1 || !finite(tol) || tol <= 0) {
      throw new Error('The preview requires valid finite search limits and tolerance.');
    }
    const kind = job.kind === 'dynamical' ? 3 : ['mn', 'rn', 'compare'].indexOf(job.parameterMode ?? 'mn');
    if (kind < 0) throw new Error('The parameter preview mode is unsupported.');
    const spanY = (spanX / width) * height;
    const coordinateScale = Math.max(1, Math.hypot(center.x, center.y), spanX, spanY);
    const unitsPerPixel = spanX / width;
    const minimumUnitsPerPixel = GPU_PREVIEW_LIMITS.minimumPixelErrorRatio * FLOAT32_UNIT * coordinateScale;
    if (!finite(spanY) || !finite(coordinateScale) ||
        ![center.x, center.y, spanX, spanY].every(value => Number.isFinite(Math.fround(value))) ||
        unitsPerPixel <= minimumUnitsPerPixel) {
      throw new Error('This view needs more coordinate precision than a float32 GPU preview provides.');
    }
    if (!(colors?.table instanceof Uint8Array || colors?.table instanceof Uint8ClampedArray) ||
        colors.table.length !== PALETTE_WIDTH * PALETTE_HEIGHT * 4 ||
        !rgbBytes(colors.branch) || !rgbBytes(colors.exterior)) {
      throw new Error('The preview requires a 9 by 101 RGBA byte palette and RGB colors.');
    }
    const opacity = colors.survivalOpacity ?? job.survivalOpacity ?? 0.45;
    if (!finite(opacity)) throw new Error('The survival opacity must be finite.');
    let context = null;
    if (kind === 3) {
      if (!finite(job.cx) || !finite(job.cy)) throw new Error('The dynamical parameter must be finite.');
      const c = getEffectiveC(job.cx, job.cy);
      const rho = Math.hypot(c.x, c.y);
      if (!finite(rho) || rho - 1 < GPU_SEARCH_LIMITS.minModulusGap ||
          rho > GPU_SEARCH_LIMITS.maxModulus || Math.abs(c.y) / rho < GPU_SEARCH_LIMITS.minRelativeImaginary) {
        throw new Error('This dynamical parameter needs the CPU precision or domain handling.');
      }
      const key = `${c.x}:${c.y}:${n}:${tol}`;
      if (key !== fixedContextKey) {
        const difference = computeEnclosureGeneral(c.x, c.y, 2 * n - 1, tol);
        const original = computeEnclosureGeneral(c.x, c.y, n, tol);
        const lens = inLens(c.x, c.y, n);
        const trap = getTrapHalfWidths(c.x, c.y, 2 * n - 1, lens);
        if (difference.err || original.err ||
            ![difference.se, difference.ve, original.se, original.ve, trap.S, trap.V].every(value => finite(value) && Number.isFinite(Math.fround(value)))) {
          throw new Error('The dynamical enclosure exceeds the GPU numerical range.');
        }
        fixedContext = { c, difference, original, lens, trap };
        fixedContextKey = key;
      }
      context = fixedContext;
    }
    const maximumDimension = capabilities.maxPreviewDimension;
    const scale = Math.min(1, maximumDimension / width, maximumDimension / height,
      Math.sqrt(GPU_PREVIEW_LIMITS.pixels / (width * height)));
    return {
      kind, kMax, LMax, tol, spanX, spanY, context,
      width: Math.max(1, Math.floor(width * scale)),
      height: Math.max(1, Math.floor(height * scale)),
      opacity: Math.max(0, Math.min(1, opacity)),
      showDifference: job.showDifference === true,
      showOriginal: job.showOriginalSurvival === true,
      unitsPerPixel, minimumUnitsPerPixel
    };
  }

  function resize(width, height) {
    if (resources.width === width && resources.height === height) return;
    canvas.width = width;
    canvas.height = height;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, resources.classificationTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, resources.framebuffer);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('The GPU preview framebuffer is incomplete.');
    }
    resources.width = width;
    resources.height = height;
  }

  function render(job, colors) {
    classificationReady = false;
    if (disposed || !supported || lost || !resources) return null;
    if (gl.isContextLost()) {
      handleContextLost();
      return null;
    }
    let prepared;
    try {
      prepared = prepareJob(job, colors);
    } catch (error) {
      return fallback(error instanceof Error ? error.message : 'The view is outside the GPU preview limits.');
    }
    const start = performance.now();
    try {
      const p = prepared;
      resize(p.width, p.height);
      gl.viewport(0, 0, p.width, p.height);
      gl.bindVertexArray(resources.vao);
      // Classification is exact byte encoding into a linear, unblended target.
      gl.disable(gl.BLEND);
      gl.disable(gl.DITHER);
      gl.bindFramebuffer(gl.FRAMEBUFFER, resources.framebuffer);
      gl.useProgram(resources.searchProgram);
      const u = resources.searchUniforms;
      gl.uniform1i(u.u_kind, p.kind);
      gl.uniform2f(u.u_center, job.center.x, job.center.y);
      gl.uniform2f(u.u_span, p.spanX, p.spanY);
      gl.uniform2f(u.u_resolution, p.width, p.height);
      gl.uniform1i(u.u_n, job.n);
      // Preserve a requested depth beyond the shader ceiling so it is reported
      // as a resource cap, never as completed finite survival at that depth.
      gl.uniform1i(u.u_kMax, Math.min(p.kMax, MAX_GL_INT));
      gl.uniform1i(u.u_lMax, Math.min(p.LMax, GPU_SEARCH_LIMITS.frontier));
      gl.uniform1i(u.u_showDifference, p.showDifference ? 1 : 0);
      gl.uniform1i(u.u_showOriginal, p.showOriginal ? 1 : 0);
      const fixed = p.context;
      gl.uniform2f(u.u_c, fixed?.c.x ?? 0, fixed?.c.y ?? 0);
      gl.uniform4f(u.u_fixedEnclosure,
        fixed?.difference.se ?? 0, fixed?.difference.ve ?? 0,
        fixed?.original.se ?? 0, fixed?.original.ve ?? 0);
      gl.uniform2f(u.u_fixedTrap, fixed?.trap.S ?? 0, fixed?.trap.V ?? 0);
      gl.uniform1i(u.u_fixedLens, fixed?.lens ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, resources.classificationTexture);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, resources.paletteTexture);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, PALETTE_WIDTH, PALETTE_HEIGHT,
        gl.RGBA, gl.UNSIGNED_BYTE, colors.table);
      gl.useProgram(resources.paletteProgram);
      const color = resources.paletteUniforms;
      gl.uniform1i(color.u_classification, 0);
      gl.uniform1i(color.u_palette, 1);
      gl.uniform1i(color.u_kind, p.kind);
      gl.uniform1i(color.u_showDifference, p.showDifference ? 1 : 0);
      gl.uniform1i(color.u_showOriginal, p.showOriginal ? 1 : 0);
      gl.uniform3f(color.u_exterior, ...Array.from(colors.exterior, value => value / 255));
      gl.uniform3f(color.u_branch, ...Array.from(colors.branch, value => value / 255));
      gl.uniform1f(color.u_survivalOpacity, p.opacity);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (resources.firstDraw) {
        const error = gl.getError();
        if (error !== gl.NO_ERROR) throw new Error(`The first GPU preview draw failed (WebGL error ${error}).`);
        resources.firstDraw = false;
      }
      if (gl.isContextLost()) {
        handleContextLost();
        return null;
      }
      reason = '';
      lastMetadata = {
        backend: 'webgl2', arithmetic: 'float32', preview: true,
        generation, width: p.width, height: p.height,
        requestedWidth: job.width, requestedHeight: job.height,
        downsampled: p.width !== job.width || p.height !== job.height,
        requested: { depth: p.kMax, frontier: p.LMax, tolerance: p.tol },
        effective: {
          depth: Math.min(p.kMax, GPU_SEARCH_LIMITS.depth),
          frontier: Math.min(p.LMax, GPU_SEARCH_LIMITS.frontier),
          work: GPU_SEARCH_LIMITS.work,
          tail: fixed ? Math.max(fixed.difference.truncationDepth, fixed.original.truncationDepth) : GPU_SEARCH_LIMITS.tail
        },
        enclosureArithmetic: fixed ? 'binary64' : 'float32',
        enclosureTailToleranceReached: fixed ? fixed.difference.tailCertifiedToTol && fixed.original.tailCertifiedToTol : null,
        fixedEnclosureDepths: fixed ? [fixed.difference.truncationDepth, fixed.original.truncationDepth] : null,
        unitsPerPixel: p.unitsPerPixel,
        minimumUnitsPerPixel: p.minimumUnitsPerPixel,
        renderer: capabilities.renderer,
        floatPrecisionBits: capabilities.highFloat.precision,
        // Submission duration includes host work and possible driver backpressure;
        // it is not a GPU execution time. No fence or readback is used here.
        submissionTimeMs: performance.now() - start
      };
      classificationReady = true;
      return { canvas, metadata: lastMetadata };
    } catch (error) {
      unavailable(error instanceof Error ? error.message : 'The GPU preview could not render this frame.');
      return null;
    }
  }

  function readClassification() {
    if (!classificationReady || !supported || disposed || lost || !resources || gl.isContextLost()) return null;
    const data = new Uint8Array(resources.width * resources.height * 4);
    const previousFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    try {
      gl.bindFramebuffer(gl.FRAMEBUFFER, resources.framebuffer);
      gl.readPixels(0, 0, resources.width, resources.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
    }
    return {
      width: resources.width, height: resources.height, data,
      origin: 'bottom-left', metadata: lastMetadata
    };
  }

  function handleContextLost(event) {
    event?.preventDefault();
    if (disposed || lost) return;
    lost = true;
    generation++;
    supported = false;
    classificationReady = false;
    // A lost context invalidates every owned GL object automatically.
    resources = null;
    reason = 'The WebGL context was lost; CPU rendering remains available.';
    notifyUnavailable();
  }

  function handleContextRestored() {
    if (disposed) return;
    lost = false;
    initialize();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    generation++;
    supported = false;
    reason = 'The GPU preview has been disposed.';
    releaseResources();
    fixedContext = null;
    fixedContextKey = '';
    canvas?.removeEventListener('webglcontextlost', handleContextLost);
    canvas?.removeEventListener('webglcontextrestored', handleContextRestored);
    if (canvas) {
      canvas.width = 1;
      canvas.height = 1;
    }
  }

  const api = {
    get supported() { return supported; },
    get reason() { return reason; },
    get capabilities() { return capabilities; },
    canvas, render, readClassification, dispose
  };
  if (!canvas) {
    unavailable('WebGL preview requires a browser canvas.');
    return api;
  }
  canvas.width = 1;
  canvas.height = 1;
  canvas.addEventListener('webglcontextlost', handleContextLost, false);
  canvas.addEventListener('webglcontextrestored', handleContextRestored, false);
  try {
    gl = canvas.getContext('webgl2', {
      alpha: false, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: false, preserveDrawingBuffer: false,
      powerPreference: 'high-performance'
    });
    if (gl) initialize();
    else unavailable('WebGL2 is unavailable on this browser or device.');
  } catch (error) {
    unavailable(error instanceof Error ? error.message : 'WebGL2 context creation failed.');
  }
  return api;
}
