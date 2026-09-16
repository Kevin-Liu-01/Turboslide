/* @ts-self-types="./turboslide_native.d.ts" */

export class CoeffsResult {
    static __wrap(ptr) {
        const obj = Object.create(CoeffsResult.prototype);
        obj.__wbg_ptr = ptr;
        CoeffsResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        CoeffsResultFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_coeffsresult_free(ptr, 0);
    }
    /**
     * @returns {Int32Array}
     */
    get bounds() {
        const ret = wasm.__wbg_get_coeffsresult_bounds(this.__wbg_ptr);
        var v1 = getArrayI32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {Int32Array}
     */
    get kk() {
        const ret = wasm.__wbg_get_coeffsresult_kk(this.__wbg_ptr);
        var v1 = getArrayI32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {number}
     */
    get ksize() {
        const ret = wasm.__wbg_get_coeffsresult_ksize(this.__wbg_ptr);
        return ret >>> 0;
    }
}
if (Symbol.dispose) CoeffsResult.prototype[Symbol.dispose] = CoeffsResult.prototype.free;

export class DssimResult {
    static __wrap(ptr) {
        const obj = Object.create(DssimResult.prototype);
        obj.__wbg_ptr = ptr;
        DssimResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        DssimResultFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_dssimresult_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get dssim() {
        const ret = wasm.__wbg_get_dssimresult_dssim(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get scales() {
        const ret = wasm.__wbg_get_dssimresult_scales(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get ssim() {
        const ret = wasm.__wbg_get_dssimresult_ssim(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) DssimResult.prototype[Symbol.dispose] = DssimResult.prototype.free;

export class PixelmatchResult {
    static __wrap(ptr) {
        const obj = Object.create(PixelmatchResult.prototype);
        obj.__wbg_ptr = ptr;
        PixelmatchResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PixelmatchResultFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_pixelmatchresult_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get mismatched() {
        const ret = wasm.__wbg_get_pixelmatchresult_mismatched(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {Uint8Array | undefined}
     */
    get output() {
        const ret = wasm.__wbg_get_pixelmatchresult_output(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
}
if (Symbol.dispose) PixelmatchResult.prototype[Symbol.dispose] = PixelmatchResult.prototype.free;

export class ScreenResult {
    static __wrap(ptr) {
        const obj = Object.create(ScreenResult.prototype);
        obj.__wbg_ptr = ptr;
        ScreenResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ScreenResultFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_screenresult_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get height() {
        const ret = wasm.__wbg_get_screenresult_height(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {Uint8Array}
     */
    get positive() {
        const ret = wasm.__wbg_get_screenresult_positive(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {Uint8Array}
     */
    get tone() {
        const ret = wasm.__wbg_get_screenresult_tone(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {number}
     */
    get width() {
        const ret = wasm.__wbg_get_screenresult_width(this.__wbg_ptr);
        return ret >>> 0;
    }
}
if (Symbol.dispose) ScreenResult.prototype[Symbol.dispose] = ScreenResult.prototype.free;

export class TwoToneResult {
    static __wrap(ptr) {
        const obj = Object.create(TwoToneResult.prototype);
        obj.__wbg_ptr = ptr;
        TwoToneResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        TwoToneResultFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_twotoneresult_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get cell() {
        const ret = wasm.__wbg_get_twotoneresult_cell(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {Uint8Array}
     */
    get darkBits() {
        const ret = wasm.__wbg_get_twotoneresult_darkBits(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {Uint8Array | undefined}
     */
    get darkPng() {
        const ret = wasm.__wbg_get_twotoneresult_darkPng(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @returns {number}
     */
    get height() {
        const ret = wasm.__wbg_get_twotoneresult_height(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {Uint8Array}
     */
    get lightBits() {
        const ret = wasm.__wbg_get_twotoneresult_lightBits(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {Uint8Array | undefined}
     */
    get lightPng() {
        const ret = wasm.__wbg_get_twotoneresult_lightPng(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @returns {string}
     */
    get metricsJson() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.__wbg_get_twotoneresult_metricsJson(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {Uint8Array}
     */
    get positive() {
        const ret = wasm.__wbg_get_twotoneresult_positive(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {Uint8Array}
     */
    get tone() {
        const ret = wasm.__wbg_get_twotoneresult_tone(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {number}
     */
    get width() {
        const ret = wasm.__wbg_get_twotoneresult_width(this.__wbg_ptr);
        return ret >>> 0;
    }
}
if (Symbol.dispose) TwoToneResult.prototype[Symbol.dispose] = TwoToneResult.prototype.free;

/**
 * @returns {Uint8Array}
 */
export function bayerThresholds() {
    const ret = wasm.bayerThresholds();
    var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v1;
}

/**
 * @param {Uint8Array} a
 * @param {Uint8Array} b
 * @returns {number}
 */
export function diffExact(a, b) {
    const ptr0 = passArray8ToWasm0(a, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(b, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.diffExact(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0] >>> 0;
}

/**
 * @param {Uint8Array} a
 * @param {Uint8Array} b
 * @param {number} width
 * @param {number} height
 * @param {number} threshold
 * @param {boolean} include_aa
 * @param {boolean} want_output
 * @param {boolean} checkerboard
 * @returns {PixelmatchResult}
 */
export function diffPixelmatch(a, b, width, height, threshold, include_aa, want_output, checkerboard) {
    const ptr0 = passArray8ToWasm0(a, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(b, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.diffPixelmatch(ptr0, len0, ptr1, len1, width, height, threshold, include_aa, want_output, checkerboard);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return PixelmatchResult.__wrap(ret[0]);
}

/**
 * @param {Uint8Array} tone
 * @param {number} width
 * @param {number} height
 * @param {string} pattern
 * @param {number} levels
 * @param {number} seed
 * @param {number} angle
 * @returns {Uint8Array}
 */
export function ditherLevels(tone, width, height, pattern, levels, seed, angle) {
    const ptr0 = passArray8ToWasm0(tone, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(pattern, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.ditherLevels(ptr0, len0, width, height, ptr1, len1, levels, seed, angle);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v3;
}

/**
 * @param {string} pattern
 * @param {number} width
 * @param {number} height
 * @param {number} seed
 * @param {number} angle
 * @returns {Uint8Array}
 */
export function ditherThresholds(pattern, width, height, seed, angle) {
    const ptr0 = passStringToWasm0(pattern, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.ditherThresholds(ptr0, len0, width, height, seed, angle);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * @param {Uint8Array} a
 * @param {Uint8Array} b
 * @param {number} width
 * @param {number} height
 * @returns {DssimResult}
 */
export function dssim(a, b, width, height) {
    const ptr0 = passArray8ToWasm0(a, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(b, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.dssim(ptr0, len0, ptr1, len1, width, height);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return DssimResult.__wrap(ret[0]);
}

/**
 * @param {Uint8Array} bits
 * @param {number} width
 * @param {number} height
 * @param {string | null | undefined} palette_json
 * @param {number} level
 * @returns {Uint8Array}
 */
export function encodePng1(bits, width, height, palette_json, level) {
    const ptr0 = passArray8ToWasm0(bits, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    var ptr1 = isLikeNone(palette_json) ? 0 : passStringToWasm0(palette_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len1 = WASM_VECTOR_LEN;
    const ret = wasm.encodePng1(ptr0, len0, width, height, ptr1, len1, level);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v3;
}

/**
 * @param {number} sigma
 * @returns {Float64Array}
 */
export function gaussianKernel(sigma) {
    const ret = wasm.gaussianKernel(sigma);
    var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v1;
}

/**
 * @param {number} in_size
 * @param {number} in0
 * @param {number} in1
 * @param {number} out_size
 * @returns {CoeffsResult}
 */
export function lanczosCoeffs(in_size, in0, in1, out_size) {
    const ret = wasm.lanczosCoeffs(in_size, in0, in1, out_size);
    return CoeffsResult.__wrap(ret);
}

/**
 * @param {number} strength
 * @returns {number}
 */
export function planeAlpha(strength) {
    const ret = wasm.planeAlpha(strength);
    return ret >>> 0;
}

/**
 * @param {number} black
 * @param {number} white
 * @param {number} gamma
 * @returns {Uint8Array}
 */
export function toneLut(black, white, gamma) {
    const ret = wasm.toneLut(black, white, gamma);
    var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v1;
}

/**
 * @param {Uint8Array} rgba
 * @param {number} width
 * @param {number} height
 * @param {string} params_json
 * @param {string | null | undefined} plate_json
 * @param {boolean} png
 * @returns {TwoToneResult}
 */
export function twoTone(rgba, width, height, params_json, plate_json, png) {
    const ptr0 = passArray8ToWasm0(rgba, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(params_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    var ptr2 = isLikeNone(plate_json) ? 0 : passStringToWasm0(plate_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len2 = WASM_VECTOR_LEN;
    const ret = wasm.twoTone(ptr0, len0, width, height, ptr1, len1, ptr2, len2, png);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return TwoToneResult.__wrap(ret[0]);
}

/**
 * @param {Uint8Array} rgba
 * @param {number} width
 * @param {number} height
 * @param {string} params_json
 * @returns {ScreenResult}
 */
export function twoToneScreen(rgba, width, height, params_json) {
    const ptr0 = passArray8ToWasm0(rgba, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(params_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.twoToneScreen(ptr0, len0, width, height, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ScreenResult.__wrap(ret[0]);
}

/**
 * @returns {string}
 */
export function version() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.version();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_67e7344beaa85059: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg___wbindgen_throw_5d9e815e6fdf150f: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./turboslide_native_bg.js": import0,
    };
}

const CoeffsResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_coeffsresult_free(ptr, 1));
const DssimResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_dssimresult_free(ptr, 1));
const PixelmatchResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_pixelmatchresult_free(ptr, 1));
const ScreenResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_screenresult_free(ptr, 1));
const TwoToneResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_twotoneresult_free(ptr, 1));

function getArrayF64FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat64ArrayMemory0().subarray(ptr / 8, ptr / 8 + len);
}

function getArrayI32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getInt32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedFloat64ArrayMemory0 = null;
function getFloat64ArrayMemory0() {
    if (cachedFloat64ArrayMemory0 === null || cachedFloat64ArrayMemory0.byteLength === 0) {
        cachedFloat64ArrayMemory0 = new Float64Array(wasm.memory.buffer);
    }
    return cachedFloat64ArrayMemory0;
}

let cachedInt32ArrayMemory0 = null;
function getInt32ArrayMemory0() {
    if (cachedInt32ArrayMemory0 === null || cachedInt32ArrayMemory0.byteLength === 0) {
        cachedInt32ArrayMemory0 = new Int32Array(wasm.memory.buffer);
    }
    return cachedInt32ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedFloat64ArrayMemory0 = null;
    cachedInt32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('turboslide_native_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
