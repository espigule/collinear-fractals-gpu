import {
  computeEnclosureGeneral, getEffectiveC, getTrapHalfWidths, inLens
} from '../compute/inverse_search_reference.mjs';
import {
  GPU_SEARCH_CODES, GPU_SEARCH_FRAGMENT_SOURCE, GPU_SEARCH_LIMITS
} from '../compute/gpu_search_shader.mjs';
import {
  PIECE_COLORS, PIECE_OUTLINE_COLOR, CAPTURE_SHADING, UNKNOWN_CAPTURE_DEPTH,
  hexToRgb, parameterLayerKeys, parameterLayerColor
} from './palettes.mjs';

export const GPU_PREVIEW_LIMITS = Object.freeze({
  pixels: 120000,
  totalSearchSamples: 480000,
  parameterLayers: 66,
  dimension: 768,
  minimumPixelErrorRatio: 16
});

const PALETTE_WIDTH = 101;
const PALETTE_HEIGHT = 9;
const PIECE_PALETTE_WIDTH = 256;
const MAX_PARAMETER_LAYERS = GPU_PREVIEW_LIMITS.parameterLayers;
const DEFAULT_PIECE_COLORS = Uint8Array.from(PIECE_COLORS.flatMap(value => {
  const { r, g, b } = hexToRgb(value); return [r, g, b];
}));
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
uniform sampler2D u_pieces;
uniform sampler2D u_piecePalette;
uniform sampler2D u_occupied;
uniform sampler2D u_uncertain;
uniform highp sampler2DArray u_layers;
uniform sampler2D u_layerColors;
uniform int u_pieceCount;
uniform int u_n;
uniform int u_rasterHalo;
uniform int u_layerCount;
uniform bool u_showEscapeStrata;
uniform bool u_captureDepthStyle;
uniform int u_modulo;
uniform vec3 u_captureInterior;
uniform vec3 u_captureOffLens;
uniform vec3 u_outline;
uniform int u_kind;
uniform bool u_showDifference;
uniform bool u_showOriginal;
uniform vec3 u_exterior;
uniform vec3 u_branch;
uniform float u_survivalOpacity;
uniform float u_originalOpacity;
uniform bool u_originalBoundary;
uniform bool u_firstLevelPieces;
out vec4 outColor;

vec3 palette(int code, int depth) {
  return texelFetch(u_palette, ivec2(clamp(depth, 0, 100), clamp(code, 0, 8)), 0).rgb;
}

bool knownCapture(int minimumDepth) { return minimumDepth >= 0 && minimumDepth <= 100; }

vec3 captureShade(vec3 base, int code, int minimumDepth) {
  if (!u_captureDepthStyle) return base;
  if (knownCapture(minimumDepth)) {
    int q = clamp(u_modulo, 1, 12);
    float scale = q == 1 ? ${CAPTURE_SHADING.singleBandScale}
      : ${CAPTURE_SHADING.minimumScale} + ${CAPTURE_SHADING.scaleRange} * float(minimumDepth % q) / float(q - 1);
    return base * scale;
  }
  if (code == 3) return mix(base, vec3(1.0), ${CAPTURE_SHADING.survivorWhite});
  return base;
}

uint maskAt(sampler2D source, ivec2 coordinate) {
  uvec4 bytes = uvec4(round(texelFetch(source, coordinate, 0) * 255.0));
  return bytes.x | (bytes.y << 8u) | (bytes.z << 16u) | (bytes.w << 24u);
}

int diagnosticPriority(int code) {
  if (code == 5) return 5;
  if (code == 8) return 4;
  if (code == 6) return 3;
  if (code == 7) return 2;
  if (code == 4) return 1;
  return 0;
}

void main() {
  ivec2 coordinate = ivec2(gl_FragCoord.xy) + ivec2(u_rasterHalo);
  ivec4 result = ivec4(round(texelFetch(u_classification, coordinate, 0) * 255.0));
  ivec4 pieceRecord = ivec4(round(texelFetch(u_pieces, coordinate, 0) * 255.0));
  vec3 color = palette(result.r, result.g);
  if (u_kind != 3 && u_layerCount >= 0) {
    vec3 sum = vec3(0.0);
    int covered = 0;
    int diagnostic = 0;
    int diagnosticDepth = 0;
    int escapeDepth = 0;
    for (int index = 0; index < ${MAX_PARAMETER_LAYERS}; ++index) {
      if (index >= u_layerCount) break;
      ivec3 layer = ivec3(round(texelFetch(u_layers, ivec3(coordinate, index), 0).rgb * 255.0));
      if (knownCapture(layer.z) || layer.x == 1 || layer.x == 2 || layer.x == 3) {
        sum += captureShade(texelFetch(u_layerColors, ivec2(index, 0), 0).rgb, layer.x, layer.z);
        ++covered;
      } else if (diagnosticPriority(layer.x) > diagnosticPriority(diagnostic)) {
        diagnostic = layer.x;
        diagnosticDepth = layer.y;
      }
      if (layer.x == 0) escapeDepth = max(escapeDepth, layer.y);
    }
    if (covered > 0) color = u_showEscapeStrata ? u_exterior : sum / float(covered);
    else if (diagnostic != 0) color = palette(diagnostic, diagnosticDepth);
    else color = u_layerCount == 0 ? u_exterior : palette(0, escapeDepth);
  } else if (u_kind != 3 && (result.r == ${GPU_SEARCH_CODES.DOMAIN} ||
      (u_kind == 2 && result.b == ${GPU_SEARCH_CODES.DOMAIN}))) {
    color = palette(${GPU_SEARCH_CODES.DOMAIN}, 0);
  } else if ((u_kind == 1 || u_kind == 4) && result.r == ${GPU_SEARCH_CODES.DEPTH_CAP}) {
    color = vec3(50.0, 138.0, 148.0) / 255.0;
  } else if (u_kind == 2) {
    if (result.b == ${GPU_SEARCH_CODES.INTERIOR} || result.b == ${GPU_SEARCH_CODES.DEPTH_CAP}) {
      color = vec3(50.0, 138.0, 148.0) / 255.0;
    } else if (result.b != ${GPU_SEARCH_CODES.EXTERIOR}) {
      color = palette(${GPU_SEARCH_CODES.NODE_CAP}, 0);
    }
  } else if (u_kind == 3) {
    color = u_showDifference ? color : u_exterior;
    if (u_showDifference && (knownCapture(pieceRecord.b) || result.r == 1 || result.r == 2 || result.r == 3)) {
      color = u_showEscapeStrata ? u_exterior : captureShade(
        result.r == 2 ? u_captureOffLens : u_captureInterior, result.r, pieceRecord.b);
    }
    if (u_showOriginal) {
      if (u_originalBoundary) {
        uint occupied = u_firstLevelPieces ? maskAt(u_occupied, coordinate) : 0u;
        if (occupied != 0u || knownCapture(pieceRecord.a) || result.b == ${GPU_SEARCH_CODES.INTERIOR} ||
            result.b == ${GPU_SEARCH_CODES.OFF_LENS} || result.b == ${GPU_SEARCH_CODES.DEPTH_CAP}) {
          int encodedPiece = pieceRecord.g;
          vec3 fill = u_branch;
          bool outline = false;
          if (u_firstLevelPieces) {
            vec3 sum = vec3(0.0);
            int count = 0;
            for (int index = 0; index < 32; ++index) {
              if (index >= u_n) break;
              if ((occupied & (1u << uint(index))) != 0u) {
                sum += texelFetch(u_piecePalette, ivec2(index % u_pieceCount, 0), 0).rgb;
                ++count;
              }
            }
            if (count > 0) fill = sum / float(count);
            else if (encodedPiece > 0) fill = texelFetch(u_piecePalette,
              ivec2((encodedPiece - 1) % u_pieceCount, 0), 0).rgb;
            ivec2 offsets[4] = ivec2[4](ivec2(-1,0), ivec2(1,0), ivec2(0,-1), ivec2(0,1));
            for (int neighbor = 0; neighbor < 4; ++neighbor) {
              ivec2 adjacent = coordinate + offsets[neighbor];
              uint absent = ~(maskAt(u_occupied, adjacent) | maskAt(u_uncertain, adjacent));
              outline = outline || (occupied & absent) != 0u;
            }
          }
          int coveredCode = result.b == 1 || result.b == 2 ? result.b : 3;
          fill = outline ? u_outline : captureShade(fill, coveredCode, pieceRecord.a);
          color = mix(color, fill, u_originalOpacity);
        } else if (result.b != ${GPU_SEARCH_CODES.EXTERIOR} && result.b != ${GPU_SEARCH_CODES.DOMAIN}) {
          color = palette(result.b, result.a);
        }
      } else if (result.b == ${GPU_SEARCH_CODES.NUMERICAL} || result.b == ${GPU_SEARCH_CODES.PRECISION_GUARD}) {
        color = palette(result.b, result.a);
      } else if (result.b == ${GPU_SEARCH_CODES.INTERIOR} || result.b == ${GPU_SEARCH_CODES.OFF_LENS} ||
                 result.b == ${GPU_SEARCH_CODES.DEPTH_CAP} || result.b == ${GPU_SEARCH_CODES.NODE_CAP} ||
                 result.b == ${GPU_SEARCH_CODES.WORK_CAP}) {
        color = mix(color, captureShade(u_branch, result.b, pieceRecord.a), u_survivalOpacity);
      }
    }
  }
  // Match the byte palette and CPU compositing, including opaque PNG export.
  outColor = vec4(floor(color * 255.0 + 0.5) / 255.0, 1.0);
}
`;

const SEARCH_UNIFORMS = [
  'u_kind', 'u_center', 'u_span', 'u_resolution', 'u_c', 'u_n', 'u_kMax', 'u_lMax',
  'u_showDifference', 'u_showOriginal', 'u_fixedEnclosure', 'u_fixedTrap', 'u_fixedLens',
  'u_fixedOriginalTrap', 'u_fixedOriginalLens', 'u_originalBoundary', 'u_firstLevelPieces',
  'u_escapeDepth', 'u_captureDepth', 'u_boundaryWork', 'u_pixelRadius', 'u_parameterRadius', 'u_firstDigit', 'u_rasterHalo', 'u_layerOutput'
];
const PALETTE_UNIFORMS = [
  'u_classification', 'u_palette', 'u_kind', 'u_showDifference', 'u_showOriginal',
  'u_exterior', 'u_branch', 'u_survivalOpacity', 'u_originalOpacity', 'u_originalBoundary',
  'u_firstLevelPieces', 'u_pieces', 'u_piecePalette', 'u_pieceCount',
  'u_occupied', 'u_uncertain', 'u_layers', 'u_layerColors', 'u_layerCount', 'u_n',
  'u_rasterHalo', 'u_showEscapeStrata', 'u_outline', 'u_captureDepthStyle', 'u_modulo', 'u_captureInterior', 'u_captureOffLens'
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
      gl.deleteTexture(resources.piecesTexture);
      gl.deleteTexture(resources.piecePaletteTexture);
      gl.deleteTexture(resources.occupiedTexture);
      gl.deleteTexture(resources.uncertainTexture);
      gl.deleteTexture(resources.layersTexture);
      gl.deleteTexture(resources.layerColorsTexture);
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

  function configureTexture(texture, target = gl.TEXTURE_2D) {
    gl.bindTexture(target, texture);
    gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
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
        piecesTexture: null, piecePaletteTexture: null,
        occupiedTexture: null, uncertainTexture: null, layersTexture: null, layerColorsTexture: null,
        vao: null, searchProgram: null, paletteProgram: null,
        width: 0, height: 0, rasterWidth: 0, rasterHeight: 0, layerCount: 0, firstDraw: true
      };
      resources.searchProgram = program(GPU_SEARCH_FRAGMENT_SOURCE);
      resources.paletteProgram = program(PALETTE_SOURCE);
      resources.searchUniforms = locations(resources.searchProgram, SEARCH_UNIFORMS);
      resources.paletteUniforms = locations(resources.paletteProgram, PALETTE_UNIFORMS);
      resources.vao = gl.createVertexArray();
      resources.framebuffer = gl.createFramebuffer();
      resources.classificationTexture = gl.createTexture();
      resources.paletteTexture = gl.createTexture();
      resources.piecesTexture = gl.createTexture();
      resources.piecePaletteTexture = gl.createTexture();
      resources.occupiedTexture = gl.createTexture();
      resources.uncertainTexture = gl.createTexture();
      resources.layersTexture = gl.createTexture();
      resources.layerColorsTexture = gl.createTexture();
      if (!resources.vao || !resources.framebuffer || !resources.classificationTexture || !resources.paletteTexture ||
          !resources.piecesTexture || !resources.piecePaletteTexture || !resources.occupiedTexture ||
          !resources.uncertainTexture || !resources.layersTexture || !resources.layerColorsTexture) {
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
      gl.activeTexture(gl.TEXTURE2);
      configureTexture(resources.piecesTexture);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, resources.piecesTexture, 0);
      gl.activeTexture(gl.TEXTURE4);
      configureTexture(resources.occupiedTexture);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, resources.occupiedTexture, 0);
      gl.activeTexture(gl.TEXTURE5);
      configureTexture(resources.uncertainTexture);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT3, gl.TEXTURE_2D, resources.uncertainTexture, 0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2, gl.COLOR_ATTACHMENT3]);
      gl.activeTexture(gl.TEXTURE1);
      configureTexture(resources.paletteTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, PALETTE_WIDTH, PALETTE_HEIGHT, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.activeTexture(gl.TEXTURE3);
      configureTexture(resources.piecePaletteTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, PIECE_PALETTE_WIDTH, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.activeTexture(gl.TEXTURE6);
      configureTexture(resources.layersTexture, gl.TEXTURE_2D_ARRAY);
      // A complete placeholder is needed even for shader branches that do not
      // read the array on this draw; WebGL validates every active sampler.
      gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, 1, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.activeTexture(gl.TEXTURE7);
      configureTexture(resources.layerColorsTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, MAX_PARAMETER_LAYERS, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
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
    const parameterKinds = { mn: 0, mn0: 1, rn: 1, compare: 2, mn1: 4 };
    const kind = job.kind === 'dynamical' ? 3 : parameterKinds[job.parameterMode ?? 'mn'];
    if (kind === undefined) throw new Error('The parameter preview mode is unsupported.');
    // Legacy single-mode jobs use the same layer/color path as explicit arrays.
    const parameterLayerIds = kind !== 3 ? parameterLayerKeys(job) : null;
    if (parameterLayerIds && (parameterLayerIds.length > MAX_PARAMETER_LAYERS || parameterLayerIds.some(id =>
      !['mn', 'mn0', 'mn1'].includes(id) &&
      !(id.startsWith('digit:') && Number.isSafeInteger(Number(id.slice(6))) && Math.abs(Number(id.slice(6))) < n)))) {
      throw new Error('The GPU parameter layer selection is outside its supported alphabet.');
    }
    if (job.parameterRadius !== undefined && (!finite(job.parameterRadius) || job.parameterRadius < 0)) {
      throw new Error('The parameter-cell radius must be finite and nonnegative.');
    }
    const escapeDepth = job.escapeDepth ?? (n === 2 ? 16 : 12);
    const captureDepth = Math.min(kMax, 100);
    if (job.captureDepth !== undefined && job.captureDepth !== captureDepth) {
      throw new Error('Capture depth is derived from kMax; an explicit value must equal min(kMax, 100).');
    }
    const boundaryWork = job.boundaryWork ?? 20000;
    if (!Number.isSafeInteger(escapeDepth) || escapeDepth < 0 || escapeDepth > 100 ||
        !Number.isSafeInteger(captureDepth) || captureDepth < 0 || captureDepth > 100 ||
        !Number.isSafeInteger(boundaryWork) || boundaryWork < 1 || boundaryWork > MAX_GL_INT) {
      throw new Error('The original-attractor search requires finite bounded depth and work limits.');
    }
    const originalRenderer = job.originalRenderer ?? 'boundary';
    if (!['boundary', 'survival'].includes(originalRenderer)) throw new Error('Unknown original-attractor renderer.');
    const captureStyle = job.captureStyle ?? 'depth';
    const modulo = job.modulo ?? 3;
    if (!['depth', 'sets'].includes(captureStyle) || !Number.isInteger(modulo) || modulo < 1 || modulo > 12) {
      throw new Error('Capture shading requires depth or sets mode and a modulus between one and twelve.');
    }
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
    const originalOpacity = colors.originalOpacity ?? job.originalOpacity ?? 1;
    if (!finite(opacity) || !finite(originalOpacity) || originalOpacity < 0 || originalOpacity > 1) {
      throw new Error('The original-attractor opacity must be finite and between zero and one.');
    }
    const pieceColors = colors.pieceColors ?? DEFAULT_PIECE_COLORS;
    if (!(pieceColors instanceof Uint8Array || pieceColors instanceof Uint8ClampedArray) ||
        pieceColors.length < 3 || pieceColors.length % 3 !== 0 || pieceColors.length > 3 * PIECE_PALETTE_WIDTH) {
      throw new Error('First-piece colors must be a nonempty flat RGB byte palette.');
    }
    let context = null;
    if (kind === 3) {
      if (!finite(job.cx) || !finite(job.cy)) throw new Error('The dynamical parameter must be finite.');
      const c = getEffectiveC(job.cx, job.cy);
      const rho = Math.hypot(c.x, c.y);
      if (c.y === 0 && rho > 1 && finite(rho)) {
        throw new Error('Real dynamical parameters use the CPU one-dimensional interval and pixel-footprint renderer.');
      }
      if (!finite(rho) || rho - 1 < GPU_SEARCH_LIMITS.minModulusGap ||
          rho > GPU_SEARCH_LIMITS.maxModulus || Math.abs(c.y) / rho < GPU_SEARCH_LIMITS.minRelativeImaginary) {
        throw new Error('This dynamical parameter needs the CPU precision or domain handling.');
      }
      const key = `${c.x}:${c.y}:${n}:${tol}`;
      if (key !== fixedContextKey) {
        const difference = computeEnclosureGeneral(c.x, c.y, 2 * n - 1, tol);
        const original = computeEnclosureGeneral(c.x, c.y, n, tol);
        const lens = inLens(c.x, c.y, n);
        const trap = lens ? getTrapHalfWidths(c.x, c.y, 2 * n - 1, true) : { S: 0, V: 0 };
        const originalLens = rho * rho + 2 * Math.abs(c.x) < n;
        const originalTrap = originalLens ? getTrapHalfWidths(c.x, c.y, n, true) : { S: 0, V: 0 };
        if (difference.err || original.err ||
            ![difference.se, difference.ve, original.se, original.ve, trap.S, trap.V].every(value => finite(value) && Number.isFinite(Math.fround(value)))) {
          throw new Error('The dynamical enclosure exceeds the GPU numerical range.');
        }
        fixedContext = { c, difference, original, lens, trap, originalLens, originalTrap };
        fixedContextKey = key;
      }
      context = fixedContext;
    }
    const originalBoundary = originalRenderer === 'boundary';
    const firstLevelPieces = kind === 3 && job.firstLevelPieces !== false;
    const searchPasses = kind === 3
      ? Math.max(1, (job.showOriginalSurvival === true ? (firstLevelPieces && originalBoundary ? n + 1 : 1) : 0) +
        (job.showDifference === true ? 1 : 0))
      : (parameterLayerIds?.length ?? 0) + 1;
    const captureSearchPasses = kind === 3
      ? (job.showOriginalSurvival === true && originalBoundary ? 1 : 0)
      : (parameterLayerIds?.length ?? 0) + 1;
    const largestAlphabet = kind === 3 ? (job.showDifference === true ? 2 * n - 1 : n)
      : (kind === 0 || kind === 2 || parameterLayerIds?.includes('mn') ? 2 * n - 1 : n);
    // The same number of pixels can cost much more with a large alphabet.
    // Include each separately budgeted center-capture search as well as pixel
    // coverage. Invalid traps exit immediately but the upper bound remains safe.
    const previewWorkWeight = Math.max(1, largestAlphabet / 8);
    const weightedSearchPasses = (searchPasses + captureSearchPasses) * previewWorkWeight;
    const previewPixelBudget = Math.min(GPU_PREVIEW_LIMITS.pixels,
      Math.floor(GPU_PREVIEW_LIMITS.totalSearchSamples / weightedSearchPasses));
    const halo = firstLevelPieces && originalBoundary && job.showOriginalSurvival === true ? 1 : 0;
    const maximumDimension = capabilities.maxPreviewDimension;
    let scale = Math.min(1, maximumDimension / width, maximumDimension / height,
      Math.sqrt(previewPixelBudget / (width * height)));
    if (halo) {
      // Include the contour halo in the total search budget, including at the
      // largest alphabets. Solve (s*w+2h)(s*hgt+2h)<=budget before rounding.
      const linear = 2 * halo * (width + height);
      const available = previewPixelBudget - 4 * halo * halo;
      const haloScale = 2 * available / (linear + Math.sqrt(linear * linear + 4 * width * height * available));
      scale = Math.min(scale, haloScale);
    }
    const previewWidth = Math.max(1, Math.floor(width * scale));
    const previewHeight = Math.max(1, Math.floor(height * scale));
    const halfDiagonal = 0.5 * Math.hypot(spanX / previewWidth, spanY / previewHeight);
    return {
      kind, kMax, LMax, tol, spanX, spanY, context,
      escapeDepth, captureDepth, boundaryWork, originalBoundary, originalOpacity, pieceColors,
      parameterLayerIds,
      searchPasses, captureSearchPasses, previewPixelBudget, previewWorkWeight, weightedSearchPasses,
      captureStyle, modulo,
      parameterRadius: kind === 3 ? 0 : (job.parameterRadius ?? halfDiagonal),
      halo,
      // Parameter M_n0 may capture at the root. M_n1 independently requires its
      // complement first step; piece-color deferral belongs to dynamics only.
      firstLevelPieces,
      // Rounding the downsampled dimensions can make their world pixels slightly
      // nonsquare. Use the true half diagonal so coverage never undercounts y.
      pixelRadius: kind === 3 && originalBoundary
        ? halfDiagonal : 0,
      width: previewWidth,
      height: previewHeight,
      opacity: Math.max(0, Math.min(1, opacity)),
      showDifference: job.showDifference === true,
      showOriginal: job.showOriginalSurvival === true,
      unitsPerPixel, minimumUnitsPerPixel
    };
  }

  function resize(width, height, halo, layerCount) {
    const rasterWidth = width + 2 * halo, rasterHeight = height + 2 * halo;
    if (resources.width === width && resources.height === height && resources.rasterWidth === rasterWidth &&
        resources.rasterHeight === rasterHeight && resources.layerCount === layerCount) return;
    canvas.width = width;
    canvas.height = height;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, resources.classificationTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, rasterWidth, rasterHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, resources.piecesTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, rasterWidth, rasterHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    for (const [unit, texture] of [[gl.TEXTURE4, resources.occupiedTexture], [gl.TEXTURE5, resources.uncertainTexture]]) {
      gl.activeTexture(unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, rasterWidth, rasterHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, resources.layersTexture);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, rasterWidth, rasterHeight, Math.max(1, layerCount), 0,
      gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, resources.framebuffer);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('The GPU preview framebuffer is incomplete.');
    }
    resources.width = width;
    resources.height = height;
    resources.rasterWidth = rasterWidth;
    resources.rasterHeight = rasterHeight;
    resources.halo = halo;
    resources.layerCount = layerCount;
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
      resize(p.width, p.height, p.halo, p.parameterLayerIds?.length ?? 0);
      gl.viewport(0, 0, resources.rasterWidth, resources.rasterHeight);
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
      gl.uniform1i(u.u_originalBoundary, p.originalBoundary ? 1 : 0);
      gl.uniform1i(u.u_firstLevelPieces, p.firstLevelPieces ? 1 : 0);
      gl.uniform1i(u.u_escapeDepth, p.escapeDepth);
      gl.uniform1i(u.u_captureDepth, p.captureDepth);
      gl.uniform1i(u.u_boundaryWork, Math.min(p.boundaryWork, GPU_SEARCH_LIMITS.boundaryWork));
      gl.uniform1f(u.u_pixelRadius, p.pixelRadius * (1 + 16 * FLOAT32_UNIT));
      gl.uniform1f(u.u_parameterRadius, p.parameterRadius * (1 + 16 * FLOAT32_UNIT));
      gl.uniform1i(u.u_firstDigit, 0);
      gl.uniform1i(u.u_rasterHalo, p.halo);
      gl.uniform1i(u.u_layerOutput, 0);
      const fixed = p.context;
      gl.uniform2f(u.u_c, fixed?.c.x ?? 0, fixed?.c.y ?? 0);
      gl.uniform4f(u.u_fixedEnclosure,
        fixed?.difference.se ?? 0, fixed?.difference.ve ?? 0,
        fixed?.original.se ?? 0, fixed?.original.ve ?? 0);
      gl.uniform2f(u.u_fixedTrap, fixed?.trap.S ?? 0, fixed?.trap.V ?? 0);
      gl.uniform1i(u.u_fixedLens, fixed?.lens ? 1 : 0);
      gl.uniform2f(u.u_fixedOriginalTrap, fixed?.originalTrap.S ?? 0, fixed?.originalTrap.V ?? 0);
      gl.uniform1i(u.u_fixedOriginalLens, fixed?.originalLens ? 1 : 0);
      if (!p.parameterLayerIds) gl.drawArrays(gl.TRIANGLES, 0, 3);

      if (p.parameterLayerIds) {
        gl.uniform1i(u.u_layerOutput, 1);
        for (let index = 0; index < p.parameterLayerIds.length; index++) {
          const id = p.parameterLayerIds[index];
          const layerKind = { mn: 0, mn0: 1, mn1: 4 }[id] ?? 5;
          gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, resources.layersTexture, 0, index);
          gl.uniform1i(u.u_kind, layerKind);
          gl.uniform1i(u.u_firstDigit, layerKind === 5 ? Number(id.slice(6)) : 0);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, resources.classificationTexture, 0);
        // Keep the legacy diagnostic pair and its piece indices together even
        // when the visible frame composites additional independently selected
        // layers. The normal display path never reads these bytes to the CPU.
        gl.uniform1i(u.u_kind, p.kind);
        gl.uniform1i(u.u_firstDigit, 0);
        gl.uniform1i(u.u_layerOutput, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, p.width, p.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, resources.classificationTexture);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, resources.paletteTexture);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, PALETTE_WIDTH, PALETTE_HEIGHT,
        gl.RGBA, gl.UNSIGNED_BYTE, colors.table);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, resources.piecesTexture);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, resources.piecePaletteTexture);
      const pieceCount = p.pieceColors.length / 3;
      const piecePalette = new Uint8Array(PIECE_PALETTE_WIDTH * 4);
      for (let index = 0; index < pieceCount; index++) {
        piecePalette.set(p.pieceColors.subarray(index * 3, index * 3 + 3), index * 4);
        piecePalette[index * 4 + 3] = 255;
      }
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, PIECE_PALETTE_WIDTH, 1, gl.RGBA, gl.UNSIGNED_BYTE, piecePalette);
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, resources.occupiedTexture);
      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_2D, resources.uncertainTexture);
      gl.activeTexture(gl.TEXTURE6);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, resources.layersTexture);
      gl.activeTexture(gl.TEXTURE7);
      gl.bindTexture(gl.TEXTURE_2D, resources.layerColorsTexture);
      const layerColors = new Uint8Array(MAX_PARAMETER_LAYERS * 4);
      (p.parameterLayerIds ?? []).forEach((id, index) => {
        const { r, g, b } = hexToRgb(parameterLayerColor(id, job.n));
        layerColors.set([r, g, b, 255], index * 4);
      });
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, MAX_PARAMETER_LAYERS, 1, gl.RGBA, gl.UNSIGNED_BYTE, layerColors);
      gl.useProgram(resources.paletteProgram);
      const color = resources.paletteUniforms;
      gl.uniform1i(color.u_classification, 0);
      gl.uniform1i(color.u_palette, 1);
      gl.uniform1i(color.u_pieces, 2);
      gl.uniform1i(color.u_piecePalette, 3);
      gl.uniform1i(color.u_pieceCount, pieceCount);
      gl.uniform1i(color.u_occupied, 4);
      gl.uniform1i(color.u_uncertain, 5);
      gl.uniform1i(color.u_layers, 6);
      gl.uniform1i(color.u_layerColors, 7);
      gl.uniform1i(color.u_layerCount, p.parameterLayerIds?.length ?? -1);
      gl.uniform1i(color.u_n, job.n);
      gl.uniform1i(color.u_rasterHalo, p.halo);
      gl.uniform1i(color.u_showEscapeStrata, job.showEscapeStrata === true ? 1 : 0);
      gl.uniform1i(color.u_captureDepthStyle, p.captureStyle === 'depth' ? 1 : 0);
      gl.uniform1i(color.u_modulo, p.modulo);
      const captureColor = code => {
        const value = code === 2 ? colors.captureOffLens : colors.captureInterior;
        return rgbBytes(value) ? value : colors.table.subarray(code * PALETTE_WIDTH * 4, code * PALETTE_WIDTH * 4 + 3);
      };
      gl.uniform3f(color.u_captureInterior, ...Array.from(captureColor(1), value => value / 255));
      gl.uniform3f(color.u_captureOffLens, ...Array.from(captureColor(2), value => value / 255));
      gl.uniform3f(color.u_outline, ...PIECE_OUTLINE_COLOR.map(value => value / 255));
      gl.uniform1i(color.u_kind, p.kind);
      gl.uniform1i(color.u_showDifference, p.showDifference ? 1 : 0);
      gl.uniform1i(color.u_showOriginal, p.showOriginal ? 1 : 0);
      gl.uniform3f(color.u_exterior, ...Array.from(colors.exterior, value => value / 255));
      gl.uniform3f(color.u_branch, ...Array.from(colors.branch, value => value / 255));
      gl.uniform1f(color.u_survivalOpacity, p.opacity);
      gl.uniform1f(color.u_originalOpacity, p.originalOpacity);
      gl.uniform1i(color.u_originalBoundary, p.originalBoundary ? 1 : 0);
      gl.uniform1i(color.u_firstLevelPieces, p.firstLevelPieces ? 1 : 0);
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
        requested: { depth: p.kMax, frontier: p.LMax, tolerance: p.tol,
          escape_depth: p.escapeDepth, capture_depth: p.captureDepth,
          boundary_work: p.boundaryWork, capture_work: p.boundaryWork },
        effective: {
          depth: Math.min(p.kMax, GPU_SEARCH_LIMITS.depth),
          frontier: Math.min(p.LMax, GPU_SEARCH_LIMITS.frontier),
          work: GPU_SEARCH_LIMITS.work,
          escape_depth: Math.min(p.escapeDepth, GPU_SEARCH_LIMITS.depth),
          capture_depth: Math.min(p.captureDepth, GPU_SEARCH_LIMITS.depth),
          boundary_work: Math.min(p.boundaryWork, GPU_SEARCH_LIMITS.boundaryWork),
          capture_work: Math.min(p.boundaryWork, GPU_SEARCH_LIMITS.boundaryWork),
          tail: fixed ? Math.max(fixed.difference.truncationDepth, fixed.original.truncationDepth) : GPU_SEARCH_LIMITS.tail
        },
        enclosureArithmetic: fixed ? 'binary64' : 'float32',
        enclosureTailToleranceReached: fixed ? fixed.difference.tailCertifiedToTol && fixed.original.tailCertifiedToTol : null,
        fixedEnclosureDepths: fixed ? [fixed.difference.truncationDepth, fixed.original.truncationDepth] : null,
        unitsPerPixel: p.unitsPerPixel,
        minimumUnitsPerPixel: p.minimumUnitsPerPixel,
        renderer: capabilities.renderer,
        floatPrecisionBits: capabilities.highFloat.precision,
        original_renderer: p.originalBoundary ? 'boundary' : 'survival',
        original_sample_type: p.pixelRadius > 0 ? 'pixel-footprint' : 'point',
        pixel_radius_world: p.pixelRadius,
        parameter_sample_type: p.kind === 3 ? null : (p.parameterRadius > 0 ? 'parameter-cell' : 'point'),
        parameter_radius_world: p.parameterRadius,
        parameter_layer_ids: p.parameterLayerIds,
        parameter_cell_model: p.parameterRadius > 0 ? 'complex-taylor-disk' : null,
        parameter_analytic_membership: p.kind === 3 ? null :
          'strict-Mn-annulus-over-valid-expanding-and-reciprocal-charts',
        analytic_membership_capture: 'unknown-unless-independent-center-capture-found',
        parameter_angular_guard: p.kind === 3 ? null :
          (p.parameterRadius > 0 ? 'local-Cartesian-error-checks' : 'canonical-point-angular-guard'),
        parameter_support: p.kind === 3 ? null : 'series-and-first-moment-vertical-bounds',
        off_lens_mn_branch_order: p.kind === 3 || p.parameterRadius === 0 ? null :
          'complex-tree-parallelogram-minimax; ordering-only',
        boundary_work_scope: p.kind === 3 && p.firstLevelPieces ? 'per-first-level-piece' : 'per-selected-layer',
        capture_sample_type: 'pixel-center',
        capture_depth_convention: 'minimum center capture depth; 255 means unknown or unavailable',
        capture_arithmetic: 'padded-binary32',
        capture_search: 'iterative-deepening-with-independent-work-budget',
        capture_work_scope: 'per-original-union-or-selected-layer; separate from pixel coverage',
        difference_capture_search: 'canonical-breadth-first',
        capture_style: p.captureStyle,
        capture_modulo: p.modulo,
        capture_depth_encoding: { attachment: 1, channels: ['blue-primary', 'alpha-secondary'], unknown: 255 },
        piece_boundaries: p.halo ? 'all-piece-coverage-with-uncertainty-aware-neighbors' : null,
        raster_halo: p.halo,
        search_passes: p.searchPasses,
        capture_search_passes: p.captureSearchPasses,
        preview_pixel_budget: p.previewPixelBudget,
        preview_work_weight: p.previewWorkWeight,
        weighted_search_passes: p.weightedSearchPasses,
        piece_encoding: { attachment: 1, channels: ['primary-index-plus-one', 'secondary-index-plus-one'], absent: 0 },
        piece_mask_encoding: p.halo ? { occupied_attachment: 2, uncertain_attachment: 3,
          bits_per_word: 32, byte_order: 'little-endian', includes_halo: true } : null,
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
      gl.readBuffer(gl.COLOR_ATTACHMENT0);
      gl.readPixels(resources.halo, resources.halo, resources.width, resources.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
    }
    return {
      width: resources.width, height: resources.height, data,
      origin: 'bottom-left', metadata: lastMetadata
    };
  }

  function readPieces() {
    if (!classificationReady || !supported || disposed || lost || !resources || gl.isContextLost()) return null;
    const rgba = new Uint8Array(resources.width * resources.height * 4);
    const previousFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    try {
      gl.bindFramebuffer(gl.FRAMEBUFFER, resources.framebuffer);
      gl.readBuffer(gl.COLOR_ATTACHMENT1);
      gl.readPixels(resources.halo, resources.halo, resources.width, resources.height, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    } finally {
      gl.readBuffer(gl.COLOR_ATTACHMENT0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
    }
    const data = new Uint8Array(resources.width * resources.height * 2);
    for (let index = 0; index < data.length / 2; index++) {
      data[index * 2] = rgba[index * 4];
      data[index * 2 + 1] = rgba[index * 4 + 1];
    }
    return { width: resources.width, height: resources.height, data, origin: 'bottom-left',
      encoding: 'primary/secondary firstLevelIndex+1; zero means absent', metadata: lastMetadata };
  }

  /** Pixel-center minimum capture depths; independent of coverage verdicts. */
  function readCaptureDepths() {
    if (!classificationReady || !supported || disposed || lost || !resources || gl.isContextLost()) return null;
    const rgba = new Uint8Array(resources.width * resources.height * 4);
    const previousFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    try {
      gl.bindFramebuffer(gl.FRAMEBUFFER, resources.framebuffer);
      gl.readBuffer(gl.COLOR_ATTACHMENT1);
      gl.readPixels(resources.halo, resources.halo, resources.width, resources.height, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    } finally {
      gl.readBuffer(gl.COLOR_ATTACHMENT0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
    }
    const data = new Uint8Array(resources.width * resources.height * 2);
    for (let pixel = 0; pixel < data.length / 2; pixel++) {
      data[pixel * 2] = rgba[pixel * 4 + 2];
      data[pixel * 2 + 1] = rgba[pixel * 4 + 3];
    }
    return { width: resources.width, height: resources.height, data, origin: 'bottom-left',
      sampleType: 'pixel-center', unknown: UNKNOWN_CAPTURE_DEPTH,
      encoding: 'primary/secondary minimum capture depth; 255 means unknown', metadata: lastMetadata };
  }

  function readPieceMasks() {
    if (!classificationReady || !supported || disposed || lost || !resources || gl.isContextLost()) return null;
    const width = resources.rasterWidth, height = resources.rasterHeight;
    const previousFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    const arrays = [];
    try {
      gl.bindFramebuffer(gl.FRAMEBUFFER, resources.framebuffer);
      for (const attachment of [gl.COLOR_ATTACHMENT2, gl.COLOR_ATTACHMENT3]) {
        const bytes = new Uint8Array(width * height * 4);
        gl.readBuffer(attachment);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
        const mask = new Uint32Array(width * height);
        for (let i = 0; i < mask.length; i++) mask[i] =
          (bytes[i * 4] | bytes[i * 4 + 1] << 8 | bytes[i * 4 + 2] << 16 | bytes[i * 4 + 3] << 24) >>> 0;
        arrays.push(mask);
      }
    } finally {
      gl.readBuffer(gl.COLOR_ATTACHMENT0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
    }
    return { width, height, halo: resources.halo, wordsPerPixel: 1,
      pieceMasks: arrays[0], pieceUncertainMasks: arrays[1], origin: 'bottom-left', metadata: lastMetadata };
  }

  function readLayers() {
    if (!classificationReady || !supported || disposed || lost || !resources || gl.isContextLost() ||
        !lastMetadata.parameter_layer_ids) return null;
    const { width, height } = resources;
    const ids = lastMetadata.parameter_layer_ids;
    const data = new Uint8Array(width * height * ids.length * 2);
    const captureDepths = new Uint8Array(width * height * ids.length).fill(UNKNOWN_CAPTURE_DEPTH);
    const previousFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    try {
      gl.bindFramebuffer(gl.FRAMEBUFFER, resources.framebuffer);
      gl.readBuffer(gl.COLOR_ATTACHMENT0);
      for (let layer = 0; layer < ids.length; layer++) {
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, resources.layersTexture, 0, layer);
        const bytes = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
        for (let pixel = 0; pixel < width * height; pixel++) {
          data[(pixel * ids.length + layer) * 2] = bytes[pixel * 4];
          data[(pixel * ids.length + layer) * 2 + 1] = bytes[pixel * 4 + 1];
          captureDepths[pixel * ids.length + layer] = bytes[pixel * 4 + 2];
        }
      }
    } finally {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, resources.classificationTexture, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
    }
    return { width, height, layerIds: [...ids], layerCount: ids.length, data, captureDepths,
      encoding: 'pixel-major code/depth pairs with separate pixel-center minimum capture depths',
      unknownCaptureDepth: UNKNOWN_CAPTURE_DEPTH, origin: 'bottom-left', metadata: lastMetadata };
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
    canvas, render, readClassification, readPieces, readPieceMasks, readCaptureDepths, readLayers, dispose
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
