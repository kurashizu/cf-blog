
import {Buffer} from "node:buffer";
globalThis.Buffer = Buffer;

import {AsyncLocalStorage} from "node:async_hooks";
globalThis.AsyncLocalStorage = AsyncLocalStorage;


const defaultDefineProperty = Object.defineProperty;
Object.defineProperty = function(o, p, a) {
  if(p=== '__import_unsupported' && Boolean(globalThis.__import_unsupported)) {
    return;
  }
  return defaultDefineProperty(o, p, a);
};

  
  
  globalThis.openNextDebug = false;globalThis.openNextVersion = "3.10.1";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default"));
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// node_modules/@opennextjs/aws/dist/utils/error.js
function isOpenNextError(e) {
  try {
    return "__openNextInternal" in e;
  } catch {
    return false;
  }
}
var init_error = __esm({
  "node_modules/@opennextjs/aws/dist/utils/error.js"() {
  }
});

// node_modules/@opennextjs/aws/dist/adapters/logger.js
function debug(...args) {
  if (globalThis.openNextDebug) {
    console.log(...args);
  }
}
function warn(...args) {
  console.warn(...args);
}
function error(...args) {
  if (args.some((arg) => isDownplayedErrorLog(arg))) {
    return debug(...args);
  }
  if (args.some((arg) => isOpenNextError(arg))) {
    const error2 = args.find((arg) => isOpenNextError(arg));
    if (error2.logLevel < getOpenNextErrorLogLevel()) {
      return;
    }
    if (error2.logLevel === 0) {
      return console.log(...args.map((arg) => isOpenNextError(arg) ? `${arg.name}: ${arg.message}` : arg));
    }
    if (error2.logLevel === 1) {
      return warn(...args.map((arg) => isOpenNextError(arg) ? `${arg.name}: ${arg.message}` : arg));
    }
    return console.error(...args);
  }
  console.error(...args);
}
function getOpenNextErrorLogLevel() {
  const strLevel = process.env.OPEN_NEXT_ERROR_LOG_LEVEL ?? "1";
  switch (strLevel.toLowerCase()) {
    case "debug":
    case "0":
      return 0;
    case "error":
    case "2":
      return 2;
    default:
      return 1;
  }
}
var DOWNPLAYED_ERROR_LOGS, isDownplayedErrorLog;
var init_logger = __esm({
  "node_modules/@opennextjs/aws/dist/adapters/logger.js"() {
    init_error();
    DOWNPLAYED_ERROR_LOGS = [
      {
        clientName: "S3Client",
        commandName: "GetObjectCommand",
        errorName: "NoSuchKey"
      }
    ];
    isDownplayedErrorLog = (errorLog) => DOWNPLAYED_ERROR_LOGS.some((downplayedInput) => downplayedInput.clientName === errorLog?.clientName && downplayedInput.commandName === errorLog?.commandName && (downplayedInput.errorName === errorLog?.error?.name || downplayedInput.errorName === errorLog?.error?.Code));
  }
});

// node_modules/@opennextjs/aws/node_modules/cookie/dist/index.js
var require_dist = __commonJS({
  "node_modules/@opennextjs/aws/node_modules/cookie/dist/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.parseCookie = parseCookie;
    exports.parse = parseCookie;
    exports.stringifyCookie = stringifyCookie;
    exports.stringifySetCookie = stringifySetCookie;
    exports.serialize = stringifySetCookie;
    exports.parseSetCookie = parseSetCookie;
    exports.stringifySetCookie = stringifySetCookie;
    exports.serialize = stringifySetCookie;
    var cookieNameRegExp = /^[\u0021-\u003A\u003C\u003E-\u007E]+$/;
    var cookieValueRegExp = /^[\u0021-\u003A\u003C-\u007E]*$/;
    var domainValueRegExp = /^([.]?[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
    var pathValueRegExp = /^[\u0020-\u003A\u003D-\u007E]*$/;
    var maxAgeRegExp = /^-?\d+$/;
    var __toString = Object.prototype.toString;
    var NullObject = /* @__PURE__ */ (() => {
      const C = function() {
      };
      C.prototype = /* @__PURE__ */ Object.create(null);
      return C;
    })();
    function parseCookie(str, options) {
      const obj = new NullObject();
      const len = str.length;
      if (len < 2)
        return obj;
      const dec = options?.decode || decode;
      let index = 0;
      do {
        const eqIdx = eqIndex(str, index, len);
        if (eqIdx === -1)
          break;
        const endIdx = endIndex(str, index, len);
        if (eqIdx > endIdx) {
          index = str.lastIndexOf(";", eqIdx - 1) + 1;
          continue;
        }
        const key = valueSlice(str, index, eqIdx);
        if (obj[key] === void 0) {
          obj[key] = dec(valueSlice(str, eqIdx + 1, endIdx));
        }
        index = endIdx + 1;
      } while (index < len);
      return obj;
    }
    function stringifyCookie(cookie, options) {
      const enc = options?.encode || encodeURIComponent;
      const cookieStrings = [];
      for (const name of Object.keys(cookie)) {
        const val = cookie[name];
        if (val === void 0)
          continue;
        if (!cookieNameRegExp.test(name)) {
          throw new TypeError(`cookie name is invalid: ${name}`);
        }
        const value = enc(val);
        if (!cookieValueRegExp.test(value)) {
          throw new TypeError(`cookie val is invalid: ${val}`);
        }
        cookieStrings.push(`${name}=${value}`);
      }
      return cookieStrings.join("; ");
    }
    function stringifySetCookie(_name, _val, _opts) {
      const cookie = typeof _name === "object" ? _name : { ..._opts, name: _name, value: String(_val) };
      const options = typeof _val === "object" ? _val : _opts;
      const enc = options?.encode || encodeURIComponent;
      if (!cookieNameRegExp.test(cookie.name)) {
        throw new TypeError(`argument name is invalid: ${cookie.name}`);
      }
      const value = cookie.value ? enc(cookie.value) : "";
      if (!cookieValueRegExp.test(value)) {
        throw new TypeError(`argument val is invalid: ${cookie.value}`);
      }
      let str = cookie.name + "=" + value;
      if (cookie.maxAge !== void 0) {
        if (!Number.isInteger(cookie.maxAge)) {
          throw new TypeError(`option maxAge is invalid: ${cookie.maxAge}`);
        }
        str += "; Max-Age=" + cookie.maxAge;
      }
      if (cookie.domain) {
        if (!domainValueRegExp.test(cookie.domain)) {
          throw new TypeError(`option domain is invalid: ${cookie.domain}`);
        }
        str += "; Domain=" + cookie.domain;
      }
      if (cookie.path) {
        if (!pathValueRegExp.test(cookie.path)) {
          throw new TypeError(`option path is invalid: ${cookie.path}`);
        }
        str += "; Path=" + cookie.path;
      }
      if (cookie.expires) {
        if (!isDate(cookie.expires) || !Number.isFinite(cookie.expires.valueOf())) {
          throw new TypeError(`option expires is invalid: ${cookie.expires}`);
        }
        str += "; Expires=" + cookie.expires.toUTCString();
      }
      if (cookie.httpOnly) {
        str += "; HttpOnly";
      }
      if (cookie.secure) {
        str += "; Secure";
      }
      if (cookie.partitioned) {
        str += "; Partitioned";
      }
      if (cookie.priority) {
        const priority = typeof cookie.priority === "string" ? cookie.priority.toLowerCase() : void 0;
        switch (priority) {
          case "low":
            str += "; Priority=Low";
            break;
          case "medium":
            str += "; Priority=Medium";
            break;
          case "high":
            str += "; Priority=High";
            break;
          default:
            throw new TypeError(`option priority is invalid: ${cookie.priority}`);
        }
      }
      if (cookie.sameSite) {
        const sameSite = typeof cookie.sameSite === "string" ? cookie.sameSite.toLowerCase() : cookie.sameSite;
        switch (sameSite) {
          case true:
          case "strict":
            str += "; SameSite=Strict";
            break;
          case "lax":
            str += "; SameSite=Lax";
            break;
          case "none":
            str += "; SameSite=None";
            break;
          default:
            throw new TypeError(`option sameSite is invalid: ${cookie.sameSite}`);
        }
      }
      return str;
    }
    function parseSetCookie(str, options) {
      const dec = options?.decode || decode;
      const len = str.length;
      const endIdx = endIndex(str, 0, len);
      const eqIdx = eqIndex(str, 0, endIdx);
      const setCookie = eqIdx === -1 ? { name: "", value: dec(valueSlice(str, 0, endIdx)) } : {
        name: valueSlice(str, 0, eqIdx),
        value: dec(valueSlice(str, eqIdx + 1, endIdx))
      };
      let index = endIdx + 1;
      while (index < len) {
        const endIdx2 = endIndex(str, index, len);
        const eqIdx2 = eqIndex(str, index, endIdx2);
        const attr = eqIdx2 === -1 ? valueSlice(str, index, endIdx2) : valueSlice(str, index, eqIdx2);
        const val = eqIdx2 === -1 ? void 0 : valueSlice(str, eqIdx2 + 1, endIdx2);
        switch (attr.toLowerCase()) {
          case "httponly":
            setCookie.httpOnly = true;
            break;
          case "secure":
            setCookie.secure = true;
            break;
          case "partitioned":
            setCookie.partitioned = true;
            break;
          case "domain":
            setCookie.domain = val;
            break;
          case "path":
            setCookie.path = val;
            break;
          case "max-age":
            if (val && maxAgeRegExp.test(val))
              setCookie.maxAge = Number(val);
            break;
          case "expires":
            if (!val)
              break;
            const date = new Date(val);
            if (Number.isFinite(date.valueOf()))
              setCookie.expires = date;
            break;
          case "priority":
            if (!val)
              break;
            const priority = val.toLowerCase();
            if (priority === "low" || priority === "medium" || priority === "high") {
              setCookie.priority = priority;
            }
            break;
          case "samesite":
            if (!val)
              break;
            const sameSite = val.toLowerCase();
            if (sameSite === "lax" || sameSite === "strict" || sameSite === "none") {
              setCookie.sameSite = sameSite;
            }
            break;
        }
        index = endIdx2 + 1;
      }
      return setCookie;
    }
    function endIndex(str, min, len) {
      const index = str.indexOf(";", min);
      return index === -1 ? len : index;
    }
    function eqIndex(str, min, max) {
      const index = str.indexOf("=", min);
      return index < max ? index : -1;
    }
    function valueSlice(str, min, max) {
      let start = min;
      let end = max;
      do {
        const code = str.charCodeAt(start);
        if (code !== 32 && code !== 9)
          break;
      } while (++start < end);
      while (end > start) {
        const code = str.charCodeAt(end - 1);
        if (code !== 32 && code !== 9)
          break;
        end--;
      }
      return str.slice(start, end);
    }
    function decode(str) {
      if (str.indexOf("%") === -1)
        return str;
      try {
        return decodeURIComponent(str);
      } catch (e) {
        return str;
      }
    }
    function isDate(val) {
      return __toString.call(val) === "[object Date]";
    }
  }
});

// node_modules/@opennextjs/aws/dist/http/util.js
function parseSetCookieHeader(cookies) {
  if (!cookies) {
    return [];
  }
  if (typeof cookies === "string") {
    return cookies.split(/(?<!Expires=\w+),/i).map((c) => c.trim());
  }
  return cookies;
}
function getQueryFromIterator(it) {
  const query = {};
  for (const [key, value] of it) {
    if (key in query) {
      if (Array.isArray(query[key])) {
        query[key].push(value);
      } else {
        query[key] = [query[key], value];
      }
    } else {
      query[key] = value;
    }
  }
  return query;
}
var init_util = __esm({
  "node_modules/@opennextjs/aws/dist/http/util.js"() {
    init_logger();
  }
});

// node_modules/@opennextjs/aws/dist/overrides/converters/utils.js
function getQueryFromSearchParams(searchParams) {
  return getQueryFromIterator(searchParams.entries());
}
var init_utils = __esm({
  "node_modules/@opennextjs/aws/dist/overrides/converters/utils.js"() {
    init_util();
  }
});

// node_modules/@opennextjs/aws/dist/overrides/converters/edge.js
var edge_exports = {};
__export(edge_exports, {
  default: () => edge_default
});
import { Buffer as Buffer2 } from "node:buffer";
var import_cookie, NULL_BODY_STATUSES, converter, edge_default;
var init_edge = __esm({
  "node_modules/@opennextjs/aws/dist/overrides/converters/edge.js"() {
    import_cookie = __toESM(require_dist(), 1);
    init_util();
    init_utils();
    NULL_BODY_STATUSES = /* @__PURE__ */ new Set([101, 103, 204, 205, 304]);
    converter = {
      convertFrom: async (event) => {
        const url = new URL(event.url);
        const searchParams = url.searchParams;
        const query = getQueryFromSearchParams(searchParams);
        const headers = {};
        event.headers.forEach((value, key) => {
          headers[key] = value;
        });
        const rawPath = url.pathname;
        const method = event.method;
        const shouldHaveBody = method !== "GET" && method !== "HEAD";
        const body = shouldHaveBody ? Buffer2.from(await event.arrayBuffer()) : void 0;
        const cookieHeader = event.headers.get("cookie");
        const cookies = cookieHeader ? import_cookie.default.parse(cookieHeader) : {};
        return {
          type: "core",
          method,
          rawPath,
          url: event.url,
          body,
          headers,
          remoteAddress: event.headers.get("x-forwarded-for") ?? "::1",
          query,
          cookies
        };
      },
      convertTo: async (result) => {
        if ("internalEvent" in result) {
          const request = new Request(result.internalEvent.url, {
            body: result.internalEvent.body,
            method: result.internalEvent.method,
            headers: {
              ...result.internalEvent.headers,
              "x-forwarded-host": result.internalEvent.headers.host
            }
          });
          if (globalThis.__dangerous_ON_edge_converter_returns_request === true) {
            return request;
          }
          const cfCache = (result.isISR || result.internalEvent.rawPath.startsWith("/_next/image")) && process.env.DISABLE_CACHE !== "true" ? { cacheEverything: true } : {};
          return fetch(request, {
            // This is a hack to make sure that the response is cached by Cloudflare
            // See https://developers.cloudflare.com/workers/examples/cache-using-fetch/#caching-html-resources
            // @ts-expect-error - This is a Cloudflare specific option
            cf: cfCache
          });
        }
        const headers = new Headers();
        for (const [key, value] of Object.entries(result.headers)) {
          if (key === "set-cookie" && typeof value === "string") {
            const cookies = parseSetCookieHeader(value);
            for (const cookie of cookies) {
              headers.append(key, cookie);
            }
            continue;
          }
          if (Array.isArray(value)) {
            for (const v of value) {
              headers.append(key, v);
            }
          } else {
            headers.set(key, value);
          }
        }
        const body = NULL_BODY_STATUSES.has(result.statusCode) ? null : result.body;
        return new Response(body, {
          status: result.statusCode,
          headers
        });
      },
      name: "edge"
    };
    edge_default = converter;
  }
});

// node_modules/@opennextjs/aws/dist/overrides/wrappers/cloudflare-edge.js
var cloudflare_edge_exports = {};
__export(cloudflare_edge_exports, {
  default: () => cloudflare_edge_default
});
var cfPropNameMapping, handler, cloudflare_edge_default;
var init_cloudflare_edge = __esm({
  "node_modules/@opennextjs/aws/dist/overrides/wrappers/cloudflare-edge.js"() {
    cfPropNameMapping = {
      // The city name is percent-encoded.
      // See https://github.com/vercel/vercel/blob/4cb6143/packages/functions/src/headers.ts#L94C19-L94C37
      city: [encodeURIComponent, "x-open-next-city"],
      country: "x-open-next-country",
      regionCode: "x-open-next-region",
      latitude: "x-open-next-latitude",
      longitude: "x-open-next-longitude"
    };
    handler = async (handler3, converter2) => async (request, env, ctx) => {
      globalThis.process = process;
      for (const [key, value] of Object.entries(env)) {
        if (typeof value === "string") {
          process.env[key] = value;
        }
      }
      const internalEvent = await converter2.convertFrom(request);
      const cfProperties = request.cf;
      for (const [propName, mapping] of Object.entries(cfPropNameMapping)) {
        const propValue = cfProperties?.[propName];
        if (propValue != null) {
          const [encode, headerName] = Array.isArray(mapping) ? mapping : [null, mapping];
          internalEvent.headers[headerName] = encode ? encode(propValue) : propValue;
        }
      }
      const response = await handler3(internalEvent, {
        waitUntil: ctx.waitUntil.bind(ctx)
      });
      const result = await converter2.convertTo(response);
      return result;
    };
    cloudflare_edge_default = {
      wrapper: handler,
      name: "cloudflare-edge",
      supportStreaming: true,
      edgeRuntime: true
    };
  }
});

// node_modules/@opennextjs/aws/dist/overrides/originResolver/pattern-env.js
var pattern_env_exports = {};
__export(pattern_env_exports, {
  default: () => pattern_env_default
});
function initializeOnce() {
  if (initialized)
    return;
  cachedOrigins = JSON.parse(process.env.OPEN_NEXT_ORIGIN ?? "{}");
  const functions = globalThis.openNextConfig.functions ?? {};
  for (const key in functions) {
    if (key !== "default") {
      const value = functions[key];
      const regexes = [];
      for (const pattern of value.patterns) {
        const regexPattern = `/${pattern.replace(/\*\*/g, "(.*)").replace(/\*/g, "([^/]*)").replace(/\//g, "\\/").replace(/\?/g, ".")}`;
        regexes.push(new RegExp(regexPattern));
      }
      cachedPatterns.push({
        key,
        patterns: value.patterns,
        regexes
      });
    }
  }
  initialized = true;
}
var cachedOrigins, cachedPatterns, initialized, envLoader, pattern_env_default;
var init_pattern_env = __esm({
  "node_modules/@opennextjs/aws/dist/overrides/originResolver/pattern-env.js"() {
    init_logger();
    cachedPatterns = [];
    initialized = false;
    envLoader = {
      name: "env",
      resolve: async (_path) => {
        try {
          initializeOnce();
          for (const { key, patterns, regexes } of cachedPatterns) {
            for (const regex of regexes) {
              if (regex.test(_path)) {
                debug("Using origin", key, patterns);
                return cachedOrigins[key];
              }
            }
          }
          if (_path.startsWith("/_next/image") && cachedOrigins.imageOptimizer) {
            debug("Using origin", "imageOptimizer", _path);
            return cachedOrigins.imageOptimizer;
          }
          if (cachedOrigins.default) {
            debug("Using default origin", cachedOrigins.default, _path);
            return cachedOrigins.default;
          }
          return false;
        } catch (e) {
          error("Error while resolving origin", e);
          return false;
        }
      }
    };
    pattern_env_default = envLoader;
  }
});

// node_modules/@opennextjs/aws/dist/overrides/assetResolver/dummy.js
var dummy_exports = {};
__export(dummy_exports, {
  default: () => dummy_default
});
var resolver, dummy_default;
var init_dummy = __esm({
  "node_modules/@opennextjs/aws/dist/overrides/assetResolver/dummy.js"() {
    resolver = {
      name: "dummy"
    };
    dummy_default = resolver;
  }
});

// node_modules/@opennextjs/aws/dist/utils/stream.js
import { ReadableStream } from "node:stream/web";
function toReadableStream(value, isBase64) {
  return new ReadableStream({
    pull(controller) {
      controller.enqueue(Buffer.from(value, isBase64 ? "base64" : "utf8"));
      controller.close();
    }
  }, { highWaterMark: 0 });
}
function emptyReadableStream() {
  if (process.env.OPEN_NEXT_FORCE_NON_EMPTY_RESPONSE === "true") {
    return new ReadableStream({
      pull(controller) {
        maybeSomethingBuffer ??= Buffer.from("SOMETHING");
        controller.enqueue(maybeSomethingBuffer);
        controller.close();
      }
    }, { highWaterMark: 0 });
  }
  return new ReadableStream({
    start(controller) {
      controller.close();
    }
  });
}
var maybeSomethingBuffer;
var init_stream = __esm({
  "node_modules/@opennextjs/aws/dist/utils/stream.js"() {
  }
});

// node_modules/@opennextjs/aws/dist/overrides/proxyExternalRequest/fetch.js
var fetch_exports = {};
__export(fetch_exports, {
  default: () => fetch_default
});
var fetchProxy, fetch_default;
var init_fetch = __esm({
  "node_modules/@opennextjs/aws/dist/overrides/proxyExternalRequest/fetch.js"() {
    init_stream();
    fetchProxy = {
      name: "fetch-proxy",
      // @ts-ignore
      proxy: async (internalEvent) => {
        const { url, headers: eventHeaders, method, body } = internalEvent;
        const headers = Object.fromEntries(Object.entries(eventHeaders).filter(([key]) => key.toLowerCase() !== "cf-connecting-ip"));
        const response = await fetch(url, {
          method,
          headers,
          body
        });
        const responseHeaders = {};
        response.headers.forEach((value, key) => {
          const cur = responseHeaders[key];
          if (cur === void 0) {
            responseHeaders[key] = value;
          } else if (Array.isArray(cur)) {
            cur.push(value);
          } else {
            responseHeaders[key] = [cur, value];
          }
        });
        return {
          type: "core",
          headers: responseHeaders,
          statusCode: response.status,
          isBase64Encoded: true,
          body: response.body ?? emptyReadableStream()
        };
      }
    };
    fetch_default = fetchProxy;
  }
});

// .next/server/edge-runtime-webpack.js
var require_edge_runtime_webpack = __commonJS({
  ".next/server/edge-runtime-webpack.js"() {
    "use strict";
    (() => {
      "use strict";
      var e = {}, r = {};
      function t(o) {
        var n = r[o];
        if (void 0 !== n) return n.exports;
        var i = r[o] = { exports: {} }, a = true;
        try {
          e[o](i, i.exports, t), a = false;
        } finally {
          a && delete r[o];
        }
        return i.exports;
      }
      t.m = e, t.amdO = {}, (() => {
        var e2 = [];
        t.O = (r2, o, n, i) => {
          if (o) {
            i = i || 0;
            for (var a = e2.length; a > 0 && e2[a - 1][2] > i; a--) e2[a] = e2[a - 1];
            e2[a] = [o, n, i];
            return;
          }
          for (var l = 1 / 0, a = 0; a < e2.length; a++) {
            for (var [o, n, i] = e2[a], u = true, f = 0; f < o.length; f++) (false & i || l >= i) && Object.keys(t.O).every((e3) => t.O[e3](o[f])) ? o.splice(f--, 1) : (u = false, i < l && (l = i));
            if (u) {
              e2.splice(a--, 1);
              var s = n();
              void 0 !== s && (r2 = s);
            }
          }
          return r2;
        };
      })(), t.n = (e2) => {
        var r2 = e2 && e2.__esModule ? () => e2.default : () => e2;
        return t.d(r2, { a: r2 }), r2;
      }, t.d = (e2, r2) => {
        for (var o in r2) t.o(r2, o) && !t.o(e2, o) && Object.defineProperty(e2, o, { enumerable: true, get: r2[o] });
      }, t.g = function() {
        if ("object" == typeof globalThis) return globalThis;
        try {
          return this || Function("return this")();
        } catch (e2) {
          if ("object" == typeof window) return window;
        }
      }(), t.o = (e2, r2) => Object.prototype.hasOwnProperty.call(e2, r2), t.r = (e2) => {
        "undefined" != typeof Symbol && Symbol.toStringTag && Object.defineProperty(e2, Symbol.toStringTag, { value: "Module" }), Object.defineProperty(e2, "__esModule", { value: true });
      }, (() => {
        var e2 = { 149: 0 };
        t.O.j = (r3) => 0 === e2[r3];
        var r2 = (r3, o2) => {
          var n, i, [a, l, u] = o2, f = 0;
          if (a.some((r4) => 0 !== e2[r4])) {
            for (n in l) t.o(l, n) && (t.m[n] = l[n]);
            if (u) var s = u(t);
          }
          for (r3 && r3(o2); f < a.length; f++) i = a[f], t.o(e2, i) && e2[i] && e2[i][0](), e2[i] = 0;
          return t.O(s);
        }, o = self.webpackChunk_N_E = self.webpackChunk_N_E || [];
        o.forEach(r2.bind(null, 0)), o.push = r2.bind(null, o.push.bind(o));
      })();
    })();
  }
});

// node-built-in-modules:node:buffer
var node_buffer_exports = {};
import * as node_buffer_star from "node:buffer";
var init_node_buffer = __esm({
  "node-built-in-modules:node:buffer"() {
    __reExport(node_buffer_exports, node_buffer_star);
  }
});

// node-built-in-modules:node:async_hooks
var node_async_hooks_exports = {};
import * as node_async_hooks_star from "node:async_hooks";
var init_node_async_hooks = __esm({
  "node-built-in-modules:node:async_hooks"() {
    __reExport(node_async_hooks_exports, node_async_hooks_star);
  }
});

// .next/server/middleware.js
var require_middleware = __commonJS({
  ".next/server/middleware.js"() {
    "use strict";
    (self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([[751], { 35: (e, t) => {
      "use strict";
      var r = Array.isArray, n = Symbol.for("react.transitional.element"), i = Symbol.for("react.portal"), a = (Symbol.for("react.fragment"), Symbol.for("react.strict_mode"), Symbol.for("react.profiler"), Symbol.for("react.forward_ref"), Symbol.for("react.suspense"), Symbol.for("react.memo"), Symbol.for("react.lazy")), o = Symbol.iterator;
      Object.prototype.hasOwnProperty, Object.assign;
      var s = /\/+/g;
      function l(e2, t2) {
        var r2, n2;
        return "object" == typeof e2 && null !== e2 && null != e2.key ? (r2 = "" + e2.key, n2 = { "=": "=0", ":": "=2" }, "$" + r2.replace(/[=:]/g, function(e3) {
          return n2[e3];
        })) : t2.toString(36);
      }
      function u() {
      }
    }, 201: (e, t, r) => {
      "use strict";
      Object.defineProperty(t, "__esModule", { value: true }), !function(e2, t2) {
        for (var r2 in t2) Object.defineProperty(e2, r2, { enumerable: true, get: t2[r2] });
      }(t, { getTestReqInfo: function() {
        return o;
      }, withRequest: function() {
        return a;
      } });
      let n = new (r(521)).AsyncLocalStorage();
      function i(e2, t2) {
        let r2 = t2.header(e2, "next-test-proxy-port");
        if (!r2) return;
        let n2 = t2.url(e2);
        return { url: n2, proxyPort: Number(r2), testData: t2.header(e2, "next-test-data") || "" };
      }
      function a(e2, t2, r2) {
        let a2 = i(e2, t2);
        return a2 ? n.run(a2, r2) : r2();
      }
      function o(e2, t2) {
        let r2 = n.getStore();
        return r2 || (e2 && t2 ? i(e2, t2) : void 0);
      }
    }, 280: (e, t, r) => {
      var n;
      (() => {
        var i = { 226: function(i2, a2) {
          !function(o2, s) {
            "use strict";
            var l = "function", u = "undefined", c = "object", d = "string", p = "major", h = "model", g = "name", f = "type", b = "vendor", v = "version", m = "architecture", _ = "console", w = "mobile", y = "tablet", x = "smarttv", E = "wearable", S = "embedded", O = "Amazon", R = "Apple", C = "ASUS", P = "BlackBerry", T = "Browser", N = "Chrome", I = "Firefox", A = "Google", M = "Huawei", k = "Microsoft", j = "Motorola", L = "Opera", D = "Samsung", q = "Sharp", U = "Sony", B = "Xiaomi", V = "Zebra", $ = "Facebook", z = "Chromium OS", H = "Mac OS", G = function(e2, t2) {
              var r2 = {};
              for (var n2 in e2) t2[n2] && t2[n2].length % 2 == 0 ? r2[n2] = t2[n2].concat(e2[n2]) : r2[n2] = e2[n2];
              return r2;
            }, X = function(e2) {
              for (var t2 = {}, r2 = 0; r2 < e2.length; r2++) t2[e2[r2].toUpperCase()] = e2[r2];
              return t2;
            }, W = function(e2, t2) {
              return typeof e2 === d && -1 !== F(t2).indexOf(F(e2));
            }, F = function(e2) {
              return e2.toLowerCase();
            }, K = function(e2, t2) {
              if (typeof e2 === d) return e2 = e2.replace(/^\s\s*/, ""), typeof t2 === u ? e2 : e2.substring(0, 350);
            }, Q = function(e2, t2) {
              for (var r2, n2, i3, a3, o3, u2, d2 = 0; d2 < t2.length && !o3; ) {
                var p2 = t2[d2], h2 = t2[d2 + 1];
                for (r2 = n2 = 0; r2 < p2.length && !o3 && p2[r2]; ) if (o3 = p2[r2++].exec(e2)) for (i3 = 0; i3 < h2.length; i3++) u2 = o3[++n2], typeof (a3 = h2[i3]) === c && a3.length > 0 ? 2 === a3.length ? typeof a3[1] == l ? this[a3[0]] = a3[1].call(this, u2) : this[a3[0]] = a3[1] : 3 === a3.length ? typeof a3[1] !== l || a3[1].exec && a3[1].test ? this[a3[0]] = u2 ? u2.replace(a3[1], a3[2]) : void 0 : this[a3[0]] = u2 ? a3[1].call(this, u2, a3[2]) : void 0 : 4 === a3.length && (this[a3[0]] = u2 ? a3[3].call(this, u2.replace(a3[1], a3[2])) : s) : this[a3] = u2 || s;
                d2 += 2;
              }
            }, J = function(e2, t2) {
              for (var r2 in t2) if (typeof t2[r2] === c && t2[r2].length > 0) {
                for (var n2 = 0; n2 < t2[r2].length; n2++) if (W(t2[r2][n2], e2)) return "?" === r2 ? s : r2;
              } else if (W(t2[r2], e2)) return "?" === r2 ? s : r2;
              return e2;
            }, Y = { ME: "4.90", "NT 3.11": "NT3.51", "NT 4.0": "NT4.0", 2e3: "NT 5.0", XP: ["NT 5.1", "NT 5.2"], Vista: "NT 6.0", 7: "NT 6.1", 8: "NT 6.2", 8.1: "NT 6.3", 10: ["NT 6.4", "NT 10.0"], RT: "ARM" }, Z = { browser: [[/\b(?:crmo|crios)\/([\w\.]+)/i], [v, [g, "Chrome"]], [/edg(?:e|ios|a)?\/([\w\.]+)/i], [v, [g, "Edge"]], [/(opera mini)\/([-\w\.]+)/i, /(opera [mobiletab]{3,6})\b.+version\/([-\w\.]+)/i, /(opera)(?:.+version\/|[\/ ]+)([\w\.]+)/i], [g, v], [/opios[\/ ]+([\w\.]+)/i], [v, [g, L + " Mini"]], [/\bopr\/([\w\.]+)/i], [v, [g, L]], [/(kindle)\/([\w\.]+)/i, /(lunascape|maxthon|netfront|jasmine|blazer)[\/ ]?([\w\.]*)/i, /(avant |iemobile|slim)(?:browser)?[\/ ]?([\w\.]*)/i, /(ba?idubrowser)[\/ ]?([\w\.]+)/i, /(?:ms|\()(ie) ([\w\.]+)/i, /(flock|rockmelt|midori|epiphany|silk|skyfire|bolt|iron|vivaldi|iridium|phantomjs|bowser|quark|qupzilla|falkon|rekonq|puffin|brave|whale(?!.+naver)|qqbrowserlite|qq|duckduckgo)\/([-\w\.]+)/i, /(heytap|ovi)browser\/([\d\.]+)/i, /(weibo)__([\d\.]+)/i], [g, v], [/(?:\buc? ?browser|(?:juc.+)ucweb)[\/ ]?([\w\.]+)/i], [v, [g, "UC" + T]], [/microm.+\bqbcore\/([\w\.]+)/i, /\bqbcore\/([\w\.]+).+microm/i], [v, [g, "WeChat(Win) Desktop"]], [/micromessenger\/([\w\.]+)/i], [v, [g, "WeChat"]], [/konqueror\/([\w\.]+)/i], [v, [g, "Konqueror"]], [/trident.+rv[: ]([\w\.]{1,9})\b.+like gecko/i], [v, [g, "IE"]], [/ya(?:search)?browser\/([\w\.]+)/i], [v, [g, "Yandex"]], [/(avast|avg)\/([\w\.]+)/i], [[g, /(.+)/, "$1 Secure " + T], v], [/\bfocus\/([\w\.]+)/i], [v, [g, I + " Focus"]], [/\bopt\/([\w\.]+)/i], [v, [g, L + " Touch"]], [/coc_coc\w+\/([\w\.]+)/i], [v, [g, "Coc Coc"]], [/dolfin\/([\w\.]+)/i], [v, [g, "Dolphin"]], [/coast\/([\w\.]+)/i], [v, [g, L + " Coast"]], [/miuibrowser\/([\w\.]+)/i], [v, [g, "MIUI " + T]], [/fxios\/([-\w\.]+)/i], [v, [g, I]], [/\bqihu|(qi?ho?o?|360)browser/i], [[g, "360 " + T]], [/(oculus|samsung|sailfish|huawei)browser\/([\w\.]+)/i], [[g, /(.+)/, "$1 " + T], v], [/(comodo_dragon)\/([\w\.]+)/i], [[g, /_/g, " "], v], [/(electron)\/([\w\.]+) safari/i, /(tesla)(?: qtcarbrowser|\/(20\d\d\.[-\w\.]+))/i, /m?(qqbrowser|baiduboxapp|2345Explorer)[\/ ]?([\w\.]+)/i], [g, v], [/(metasr)[\/ ]?([\w\.]+)/i, /(lbbrowser)/i, /\[(linkedin)app\]/i], [g], [/((?:fban\/fbios|fb_iab\/fb4a)(?!.+fbav)|;fbav\/([\w\.]+);)/i], [[g, $], v], [/(kakao(?:talk|story))[\/ ]([\w\.]+)/i, /(naver)\(.*?(\d+\.[\w\.]+).*\)/i, /safari (line)\/([\w\.]+)/i, /\b(line)\/([\w\.]+)\/iab/i, /(chromium|instagram)[\/ ]([-\w\.]+)/i], [g, v], [/\bgsa\/([\w\.]+) .*safari\//i], [v, [g, "GSA"]], [/musical_ly(?:.+app_?version\/|_)([\w\.]+)/i], [v, [g, "TikTok"]], [/headlesschrome(?:\/([\w\.]+)| )/i], [v, [g, N + " Headless"]], [/ wv\).+(chrome)\/([\w\.]+)/i], [[g, N + " WebView"], v], [/droid.+ version\/([\w\.]+)\b.+(?:mobile safari|safari)/i], [v, [g, "Android " + T]], [/(chrome|omniweb|arora|[tizenoka]{5} ?browser)\/v?([\w\.]+)/i], [g, v], [/version\/([\w\.\,]+) .*mobile\/\w+ (safari)/i], [v, [g, "Mobile Safari"]], [/version\/([\w(\.|\,)]+) .*(mobile ?safari|safari)/i], [v, g], [/webkit.+?(mobile ?safari|safari)(\/[\w\.]+)/i], [g, [v, J, { "1.0": "/8", 1.2: "/1", 1.3: "/3", "2.0": "/412", "2.0.2": "/416", "2.0.3": "/417", "2.0.4": "/419", "?": "/" }]], [/(webkit|khtml)\/([\w\.]+)/i], [g, v], [/(navigator|netscape\d?)\/([-\w\.]+)/i], [[g, "Netscape"], v], [/mobile vr; rv:([\w\.]+)\).+firefox/i], [v, [g, I + " Reality"]], [/ekiohf.+(flow)\/([\w\.]+)/i, /(swiftfox)/i, /(icedragon|iceweasel|camino|chimera|fennec|maemo browser|minimo|conkeror|klar)[\/ ]?([\w\.\+]+)/i, /(seamonkey|k-meleon|icecat|iceape|firebird|phoenix|palemoon|basilisk|waterfox)\/([-\w\.]+)$/i, /(firefox)\/([\w\.]+)/i, /(mozilla)\/([\w\.]+) .+rv\:.+gecko\/\d+/i, /(polaris|lynx|dillo|icab|doris|amaya|w3m|netsurf|sleipnir|obigo|mosaic|(?:go|ice|up)[\. ]?browser)[-\/ ]?v?([\w\.]+)/i, /(links) \(([\w\.]+)/i, /panasonic;(viera)/i], [g, v], [/(cobalt)\/([\w\.]+)/i], [g, [v, /master.|lts./, ""]]], cpu: [[/(?:(amd|x(?:(?:86|64)[-_])?|wow|win)64)[;\)]/i], [[m, "amd64"]], [/(ia32(?=;))/i], [[m, F]], [/((?:i[346]|x)86)[;\)]/i], [[m, "ia32"]], [/\b(aarch64|arm(v?8e?l?|_?64))\b/i], [[m, "arm64"]], [/\b(arm(?:v[67])?ht?n?[fl]p?)\b/i], [[m, "armhf"]], [/windows (ce|mobile); ppc;/i], [[m, "arm"]], [/((?:ppc|powerpc)(?:64)?)(?: mac|;|\))/i], [[m, /ower/, "", F]], [/(sun4\w)[;\)]/i], [[m, "sparc"]], [/((?:avr32|ia64(?=;))|68k(?=\))|\barm(?=v(?:[1-7]|[5-7]1)l?|;|eabi)|(?=atmel )avr|(?:irix|mips|sparc)(?:64)?\b|pa-risc)/i], [[m, F]]], device: [[/\b(sch-i[89]0\d|shw-m380s|sm-[ptx]\w{2,4}|gt-[pn]\d{2,4}|sgh-t8[56]9|nexus 10)/i], [h, [b, D], [f, y]], [/\b((?:s[cgp]h|gt|sm)-\w+|sc[g-]?[\d]+a?|galaxy nexus)/i, /samsung[- ]([-\w]+)/i, /sec-(sgh\w+)/i], [h, [b, D], [f, w]], [/(?:\/|\()(ip(?:hone|od)[\w, ]*)(?:\/|;)/i], [h, [b, R], [f, w]], [/\((ipad);[-\w\),; ]+apple/i, /applecoremedia\/[\w\.]+ \((ipad)/i, /\b(ipad)\d\d?,\d\d?[;\]].+ios/i], [h, [b, R], [f, y]], [/(macintosh);/i], [h, [b, R]], [/\b(sh-?[altvz]?\d\d[a-ekm]?)/i], [h, [b, q], [f, w]], [/\b((?:ag[rs][23]?|bah2?|sht?|btv)-a?[lw]\d{2})\b(?!.+d\/s)/i], [h, [b, M], [f, y]], [/(?:huawei|honor)([-\w ]+)[;\)]/i, /\b(nexus 6p|\w{2,4}e?-[atu]?[ln][\dx][012359c][adn]?)\b(?!.+d\/s)/i], [h, [b, M], [f, w]], [/\b(poco[\w ]+)(?: bui|\))/i, /\b; (\w+) build\/hm\1/i, /\b(hm[-_ ]?note?[_ ]?(?:\d\w)?) bui/i, /\b(redmi[\-_ ]?(?:note|k)?[\w_ ]+)(?: bui|\))/i, /\b(mi[-_ ]?(?:a\d|one|one[_ ]plus|note lte|max|cc)?[_ ]?(?:\d?\w?)[_ ]?(?:plus|se|lite)?)(?: bui|\))/i], [[h, /_/g, " "], [b, B], [f, w]], [/\b(mi[-_ ]?(?:pad)(?:[\w_ ]+))(?: bui|\))/i], [[h, /_/g, " "], [b, B], [f, y]], [/; (\w+) bui.+ oppo/i, /\b(cph[12]\d{3}|p(?:af|c[al]|d\w|e[ar])[mt]\d0|x9007|a101op)\b/i], [h, [b, "OPPO"], [f, w]], [/vivo (\w+)(?: bui|\))/i, /\b(v[12]\d{3}\w?[at])(?: bui|;)/i], [h, [b, "Vivo"], [f, w]], [/\b(rmx[12]\d{3})(?: bui|;|\))/i], [h, [b, "Realme"], [f, w]], [/\b(milestone|droid(?:[2-4x]| (?:bionic|x2|pro|razr))?:?( 4g)?)\b[\w ]+build\//i, /\bmot(?:orola)?[- ](\w*)/i, /((?:moto[\w\(\) ]+|xt\d{3,4}|nexus 6)(?= bui|\)))/i], [h, [b, j], [f, w]], [/\b(mz60\d|xoom[2 ]{0,2}) build\//i], [h, [b, j], [f, y]], [/((?=lg)?[vl]k\-?\d{3}) bui| 3\.[-\w; ]{10}lg?-([06cv9]{3,4})/i], [h, [b, "LG"], [f, y]], [/(lm(?:-?f100[nv]?|-[\w\.]+)(?= bui|\))|nexus [45])/i, /\blg[-e;\/ ]+((?!browser|netcast|android tv)\w+)/i, /\blg-?([\d\w]+) bui/i], [h, [b, "LG"], [f, w]], [/(ideatab[-\w ]+)/i, /lenovo ?(s[56]000[-\w]+|tab(?:[\w ]+)|yt[-\d\w]{6}|tb[-\d\w]{6})/i], [h, [b, "Lenovo"], [f, y]], [/(?:maemo|nokia).*(n900|lumia \d+)/i, /nokia[-_ ]?([-\w\.]*)/i], [[h, /_/g, " "], [b, "Nokia"], [f, w]], [/(pixel c)\b/i], [h, [b, A], [f, y]], [/droid.+; (pixel[\daxl ]{0,6})(?: bui|\))/i], [h, [b, A], [f, w]], [/droid.+ (a?\d[0-2]{2}so|[c-g]\d{4}|so[-gl]\w+|xq-a\w[4-7][12])(?= bui|\).+chrome\/(?![1-6]{0,1}\d\.))/i], [h, [b, U], [f, w]], [/sony tablet [ps]/i, /\b(?:sony)?sgp\w+(?: bui|\))/i], [[h, "Xperia Tablet"], [b, U], [f, y]], [/ (kb2005|in20[12]5|be20[12][59])\b/i, /(?:one)?(?:plus)? (a\d0\d\d)(?: b|\))/i], [h, [b, "OnePlus"], [f, w]], [/(alexa)webm/i, /(kf[a-z]{2}wi|aeo[c-r]{2})( bui|\))/i, /(kf[a-z]+)( bui|\)).+silk\//i], [h, [b, O], [f, y]], [/((?:sd|kf)[0349hijorstuw]+)( bui|\)).+silk\//i], [[h, /(.+)/g, "Fire Phone $1"], [b, O], [f, w]], [/(playbook);[-\w\),; ]+(rim)/i], [h, b, [f, y]], [/\b((?:bb[a-f]|st[hv])100-\d)/i, /\(bb10; (\w+)/i], [h, [b, P], [f, w]], [/(?:\b|asus_)(transfo[prime ]{4,10} \w+|eeepc|slider \w+|nexus 7|padfone|p00[cj])/i], [h, [b, C], [f, y]], [/ (z[bes]6[027][012][km][ls]|zenfone \d\w?)\b/i], [h, [b, C], [f, w]], [/(nexus 9)/i], [h, [b, "HTC"], [f, y]], [/(htc)[-;_ ]{1,2}([\w ]+(?=\)| bui)|\w+)/i, /(zte)[- ]([\w ]+?)(?: bui|\/|\))/i, /(alcatel|geeksphone|nexian|panasonic(?!(?:;|\.))|sony(?!-bra))[-_ ]?([-\w]*)/i], [b, [h, /_/g, " "], [f, w]], [/droid.+; ([ab][1-7]-?[0178a]\d\d?)/i], [h, [b, "Acer"], [f, y]], [/droid.+; (m[1-5] note) bui/i, /\bmz-([-\w]{2,})/i], [h, [b, "Meizu"], [f, w]], [/(blackberry|benq|palm(?=\-)|sonyericsson|acer|asus|dell|meizu|motorola|polytron)[-_ ]?([-\w]*)/i, /(hp) ([\w ]+\w)/i, /(asus)-?(\w+)/i, /(microsoft); (lumia[\w ]+)/i, /(lenovo)[-_ ]?([-\w]+)/i, /(jolla)/i, /(oppo) ?([\w ]+) bui/i], [b, h, [f, w]], [/(kobo)\s(ereader|touch)/i, /(archos) (gamepad2?)/i, /(hp).+(touchpad(?!.+tablet)|tablet)/i, /(kindle)\/([\w\.]+)/i, /(nook)[\w ]+build\/(\w+)/i, /(dell) (strea[kpr\d ]*[\dko])/i, /(le[- ]+pan)[- ]+(\w{1,9}) bui/i, /(trinity)[- ]*(t\d{3}) bui/i, /(gigaset)[- ]+(q\w{1,9}) bui/i, /(vodafone) ([\w ]+)(?:\)| bui)/i], [b, h, [f, y]], [/(surface duo)/i], [h, [b, k], [f, y]], [/droid [\d\.]+; (fp\du?)(?: b|\))/i], [h, [b, "Fairphone"], [f, w]], [/(u304aa)/i], [h, [b, "AT&T"], [f, w]], [/\bsie-(\w*)/i], [h, [b, "Siemens"], [f, w]], [/\b(rct\w+) b/i], [h, [b, "RCA"], [f, y]], [/\b(venue[\d ]{2,7}) b/i], [h, [b, "Dell"], [f, y]], [/\b(q(?:mv|ta)\w+) b/i], [h, [b, "Verizon"], [f, y]], [/\b(?:barnes[& ]+noble |bn[rt])([\w\+ ]*) b/i], [h, [b, "Barnes & Noble"], [f, y]], [/\b(tm\d{3}\w+) b/i], [h, [b, "NuVision"], [f, y]], [/\b(k88) b/i], [h, [b, "ZTE"], [f, y]], [/\b(nx\d{3}j) b/i], [h, [b, "ZTE"], [f, w]], [/\b(gen\d{3}) b.+49h/i], [h, [b, "Swiss"], [f, w]], [/\b(zur\d{3}) b/i], [h, [b, "Swiss"], [f, y]], [/\b((zeki)?tb.*\b) b/i], [h, [b, "Zeki"], [f, y]], [/\b([yr]\d{2}) b/i, /\b(dragon[- ]+touch |dt)(\w{5}) b/i], [[b, "Dragon Touch"], h, [f, y]], [/\b(ns-?\w{0,9}) b/i], [h, [b, "Insignia"], [f, y]], [/\b((nxa|next)-?\w{0,9}) b/i], [h, [b, "NextBook"], [f, y]], [/\b(xtreme\_)?(v(1[045]|2[015]|[3469]0|7[05])) b/i], [[b, "Voice"], h, [f, w]], [/\b(lvtel\-)?(v1[12]) b/i], [[b, "LvTel"], h, [f, w]], [/\b(ph-1) /i], [h, [b, "Essential"], [f, w]], [/\b(v(100md|700na|7011|917g).*\b) b/i], [h, [b, "Envizen"], [f, y]], [/\b(trio[-\w\. ]+) b/i], [h, [b, "MachSpeed"], [f, y]], [/\btu_(1491) b/i], [h, [b, "Rotor"], [f, y]], [/(shield[\w ]+) b/i], [h, [b, "Nvidia"], [f, y]], [/(sprint) (\w+)/i], [b, h, [f, w]], [/(kin\.[onetw]{3})/i], [[h, /\./g, " "], [b, k], [f, w]], [/droid.+; (cc6666?|et5[16]|mc[239][23]x?|vc8[03]x?)\)/i], [h, [b, V], [f, y]], [/droid.+; (ec30|ps20|tc[2-8]\d[kx])\)/i], [h, [b, V], [f, w]], [/smart-tv.+(samsung)/i], [b, [f, x]], [/hbbtv.+maple;(\d+)/i], [[h, /^/, "SmartTV"], [b, D], [f, x]], [/(nux; netcast.+smarttv|lg (netcast\.tv-201\d|android tv))/i], [[b, "LG"], [f, x]], [/(apple) ?tv/i], [b, [h, R + " TV"], [f, x]], [/crkey/i], [[h, N + "cast"], [b, A], [f, x]], [/droid.+aft(\w)( bui|\))/i], [h, [b, O], [f, x]], [/\(dtv[\);].+(aquos)/i, /(aquos-tv[\w ]+)\)/i], [h, [b, q], [f, x]], [/(bravia[\w ]+)( bui|\))/i], [h, [b, U], [f, x]], [/(mitv-\w{5}) bui/i], [h, [b, B], [f, x]], [/Hbbtv.*(technisat) (.*);/i], [b, h, [f, x]], [/\b(roku)[\dx]*[\)\/]((?:dvp-)?[\d\.]*)/i, /hbbtv\/\d+\.\d+\.\d+ +\([\w\+ ]*; *([\w\d][^;]*);([^;]*)/i], [[b, K], [h, K], [f, x]], [/\b(android tv|smart[- ]?tv|opera tv|tv; rv:)\b/i], [[f, x]], [/(ouya)/i, /(nintendo) ([wids3utch]+)/i], [b, h, [f, _]], [/droid.+; (shield) bui/i], [h, [b, "Nvidia"], [f, _]], [/(playstation [345portablevi]+)/i], [h, [b, U], [f, _]], [/\b(xbox(?: one)?(?!; xbox))[\); ]/i], [h, [b, k], [f, _]], [/((pebble))app/i], [b, h, [f, E]], [/(watch)(?: ?os[,\/]|\d,\d\/)[\d\.]+/i], [h, [b, R], [f, E]], [/droid.+; (glass) \d/i], [h, [b, A], [f, E]], [/droid.+; (wt63?0{2,3})\)/i], [h, [b, V], [f, E]], [/(quest( 2| pro)?)/i], [h, [b, $], [f, E]], [/(tesla)(?: qtcarbrowser|\/[-\w\.]+)/i], [b, [f, S]], [/(aeobc)\b/i], [h, [b, O], [f, S]], [/droid .+?; ([^;]+?)(?: bui|\) applew).+? mobile safari/i], [h, [f, w]], [/droid .+?; ([^;]+?)(?: bui|\) applew).+?(?! mobile) safari/i], [h, [f, y]], [/\b((tablet|tab)[;\/]|focus\/\d(?!.+mobile))/i], [[f, y]], [/(phone|mobile(?:[;\/]| [ \w\/\.]*safari)|pda(?=.+windows ce))/i], [[f, w]], [/(android[-\w\. ]{0,9});.+buil/i], [h, [b, "Generic"]]], engine: [[/windows.+ edge\/([\w\.]+)/i], [v, [g, "EdgeHTML"]], [/webkit\/537\.36.+chrome\/(?!27)([\w\.]+)/i], [v, [g, "Blink"]], [/(presto)\/([\w\.]+)/i, /(webkit|trident|netfront|netsurf|amaya|lynx|w3m|goanna)\/([\w\.]+)/i, /ekioh(flow)\/([\w\.]+)/i, /(khtml|tasman|links)[\/ ]\(?([\w\.]+)/i, /(icab)[\/ ]([23]\.[\d\.]+)/i, /\b(libweb)/i], [g, v], [/rv\:([\w\.]{1,9})\b.+(gecko)/i], [v, g]], os: [[/microsoft (windows) (vista|xp)/i], [g, v], [/(windows) nt 6\.2; (arm)/i, /(windows (?:phone(?: os)?|mobile))[\/ ]?([\d\.\w ]*)/i, /(windows)[\/ ]?([ntce\d\. ]+\w)(?!.+xbox)/i], [g, [v, J, Y]], [/(win(?=3|9|n)|win 9x )([nt\d\.]+)/i], [[g, "Windows"], [v, J, Y]], [/ip[honead]{2,4}\b(?:.*os ([\w]+) like mac|; opera)/i, /ios;fbsv\/([\d\.]+)/i, /cfnetwork\/.+darwin/i], [[v, /_/g, "."], [g, "iOS"]], [/(mac os x) ?([\w\. ]*)/i, /(macintosh|mac_powerpc\b)(?!.+haiku)/i], [[g, H], [v, /_/g, "."]], [/droid ([\w\.]+)\b.+(android[- ]x86|harmonyos)/i], [v, g], [/(android|webos|qnx|bada|rim tablet os|maemo|meego|sailfish)[-\/ ]?([\w\.]*)/i, /(blackberry)\w*\/([\w\.]*)/i, /(tizen|kaios)[\/ ]([\w\.]+)/i, /\((series40);/i], [g, v], [/\(bb(10);/i], [v, [g, P]], [/(?:symbian ?os|symbos|s60(?=;)|series60)[-\/ ]?([\w\.]*)/i], [v, [g, "Symbian"]], [/mozilla\/[\d\.]+ \((?:mobile|tablet|tv|mobile; [\w ]+); rv:.+ gecko\/([\w\.]+)/i], [v, [g, I + " OS"]], [/web0s;.+rt(tv)/i, /\b(?:hp)?wos(?:browser)?\/([\w\.]+)/i], [v, [g, "webOS"]], [/watch(?: ?os[,\/]|\d,\d\/)([\d\.]+)/i], [v, [g, "watchOS"]], [/crkey\/([\d\.]+)/i], [v, [g, N + "cast"]], [/(cros) [\w]+(?:\)| ([\w\.]+)\b)/i], [[g, z], v], [/panasonic;(viera)/i, /(netrange)mmh/i, /(nettv)\/(\d+\.[\w\.]+)/i, /(nintendo|playstation) ([wids345portablevuch]+)/i, /(xbox); +xbox ([^\);]+)/i, /\b(joli|palm)\b ?(?:os)?\/?([\w\.]*)/i, /(mint)[\/\(\) ]?(\w*)/i, /(mageia|vectorlinux)[; ]/i, /([kxln]?ubuntu|debian|suse|opensuse|gentoo|arch(?= linux)|slackware|fedora|mandriva|centos|pclinuxos|red ?hat|zenwalk|linpus|raspbian|plan 9|minix|risc os|contiki|deepin|manjaro|elementary os|sabayon|linspire)(?: gnu\/linux)?(?: enterprise)?(?:[- ]linux)?(?:-gnu)?[-\/ ]?(?!chrom|package)([-\w\.]*)/i, /(hurd|linux) ?([\w\.]*)/i, /(gnu) ?([\w\.]*)/i, /\b([-frentopcghs]{0,5}bsd|dragonfly)[\/ ]?(?!amd|[ix346]{1,2}86)([\w\.]*)/i, /(haiku) (\w+)/i], [g, v], [/(sunos) ?([\w\.\d]*)/i], [[g, "Solaris"], v], [/((?:open)?solaris)[-\/ ]?([\w\.]*)/i, /(aix) ((\d)(?=\.|\)| )[\w\.])*/i, /\b(beos|os\/2|amigaos|morphos|openvms|fuchsia|hp-ux|serenityos)/i, /(unix) ?([\w\.]*)/i], [g, v]] }, ee = function(e2, t2) {
              if (typeof e2 === c && (t2 = e2, e2 = s), !(this instanceof ee)) return new ee(e2, t2).getResult();
              var r2 = typeof o2 !== u && o2.navigator ? o2.navigator : s, n2 = e2 || (r2 && r2.userAgent ? r2.userAgent : ""), i3 = r2 && r2.userAgentData ? r2.userAgentData : s, a3 = t2 ? G(Z, t2) : Z, _2 = r2 && r2.userAgent == n2;
              return this.getBrowser = function() {
                var e3, t3 = {};
                return t3[g] = s, t3[v] = s, Q.call(t3, n2, a3.browser), t3[p] = typeof (e3 = t3[v]) === d ? e3.replace(/[^\d\.]/g, "").split(".")[0] : s, _2 && r2 && r2.brave && typeof r2.brave.isBrave == l && (t3[g] = "Brave"), t3;
              }, this.getCPU = function() {
                var e3 = {};
                return e3[m] = s, Q.call(e3, n2, a3.cpu), e3;
              }, this.getDevice = function() {
                var e3 = {};
                return e3[b] = s, e3[h] = s, e3[f] = s, Q.call(e3, n2, a3.device), _2 && !e3[f] && i3 && i3.mobile && (e3[f] = w), _2 && "Macintosh" == e3[h] && r2 && typeof r2.standalone !== u && r2.maxTouchPoints && r2.maxTouchPoints > 2 && (e3[h] = "iPad", e3[f] = y), e3;
              }, this.getEngine = function() {
                var e3 = {};
                return e3[g] = s, e3[v] = s, Q.call(e3, n2, a3.engine), e3;
              }, this.getOS = function() {
                var e3 = {};
                return e3[g] = s, e3[v] = s, Q.call(e3, n2, a3.os), _2 && !e3[g] && i3 && "Unknown" != i3.platform && (e3[g] = i3.platform.replace(/chrome os/i, z).replace(/macos/i, H)), e3;
              }, this.getResult = function() {
                return { ua: this.getUA(), browser: this.getBrowser(), engine: this.getEngine(), os: this.getOS(), device: this.getDevice(), cpu: this.getCPU() };
              }, this.getUA = function() {
                return n2;
              }, this.setUA = function(e3) {
                return n2 = typeof e3 === d && e3.length > 350 ? K(e3, 350) : e3, this;
              }, this.setUA(n2), this;
            };
            ee.VERSION = "1.0.35", ee.BROWSER = X([g, v, p]), ee.CPU = X([m]), ee.DEVICE = X([h, b, f, _, w, x, y, E, S]), ee.ENGINE = ee.OS = X([g, v]), typeof a2 !== u ? (i2.exports && (a2 = i2.exports = ee), a2.UAParser = ee) : r.amdO ? void 0 === (n = function() {
              return ee;
            }.call(t, r, t, e)) || (e.exports = n) : typeof o2 !== u && (o2.UAParser = ee);
            var et = typeof o2 !== u && (o2.jQuery || o2.Zepto);
            if (et && !et.ua) {
              var er = new ee();
              et.ua = er.getResult(), et.ua.get = function() {
                return er.getUA();
              }, et.ua.set = function(e2) {
                er.setUA(e2);
                var t2 = er.getResult();
                for (var r2 in t2) et.ua[r2] = t2[r2];
              };
            }
          }("object" == typeof window ? window : this);
        } }, a = {};
        function o(e2) {
          var t2 = a[e2];
          if (void 0 !== t2) return t2.exports;
          var r2 = a[e2] = { exports: {} }, n2 = true;
          try {
            i[e2].call(r2.exports, r2, r2.exports, o), n2 = false;
          } finally {
            n2 && delete a[e2];
          }
          return r2.exports;
        }
        o.ab = "//", e.exports = o(226);
      })();
    }, 356: (e) => {
      "use strict";
      e.exports = (init_node_buffer(), __toCommonJS(node_buffer_exports));
    }, 461: (e, t, r) => {
      "use strict";
      let n;
      r.r(t), r.d(t, { default: () => tf });
      var i = {};
      async function a() {
        return "_ENTRIES" in globalThis && _ENTRIES.middleware_instrumentation && await _ENTRIES.middleware_instrumentation;
      }
      r.r(i), r.d(i, { config: () => td, middleware: () => tc });
      let o = null;
      async function s() {
        if ("phase-production-build" === process.env.NEXT_PHASE) return;
        o || (o = a());
        let e10 = await o;
        if (null == e10 ? void 0 : e10.register) try {
          await e10.register();
        } catch (e11) {
          throw e11.message = `An error occurred while loading instrumentation hook: ${e11.message}`, e11;
        }
      }
      async function l(...e10) {
        let t2 = await a();
        try {
          var r2;
          await (null == t2 || null == (r2 = t2.onRequestError) ? void 0 : r2.call(t2, ...e10));
        } catch (e11) {
          console.error("Error in instrumentation.onRequestError:", e11);
        }
      }
      let u = null;
      function c() {
        return u || (u = s()), u;
      }
      function d(e10) {
        return `The edge runtime does not support Node.js '${e10}' module.
Learn More: https://nextjs.org/docs/messages/node-module-in-edge-runtime`;
      }
      process !== r.g.process && (process.env = r.g.process.env, r.g.process = process), Object.defineProperty(globalThis, "__import_unsupported", { value: function(e10) {
        let t2 = new Proxy(function() {
        }, { get(t3, r2) {
          if ("then" === r2) return {};
          throw Object.defineProperty(Error(d(e10)), "__NEXT_ERROR_CODE", { value: "E394", enumerable: false, configurable: true });
        }, construct() {
          throw Object.defineProperty(Error(d(e10)), "__NEXT_ERROR_CODE", { value: "E394", enumerable: false, configurable: true });
        }, apply(r2, n2, i2) {
          if ("function" == typeof i2[0]) return i2[0](t2);
          throw Object.defineProperty(Error(d(e10)), "__NEXT_ERROR_CODE", { value: "E394", enumerable: false, configurable: true });
        } });
        return new Proxy({}, { get: () => t2 });
      }, enumerable: false, configurable: false }), c();
      class p extends Error {
        constructor({ page: e10 }) {
          super(`The middleware "${e10}" accepts an async API directly with the form:
  
  export function middleware(request, event) {
    return NextResponse.redirect('/new-location')
  }
  
  Read more: https://nextjs.org/docs/messages/middleware-new-signature
  `);
        }
      }
      class h extends Error {
        constructor() {
          super(`The request.page has been deprecated in favour of \`URLPattern\`.
  Read more: https://nextjs.org/docs/messages/middleware-request-page
  `);
        }
      }
      class g extends Error {
        constructor() {
          super(`The request.ua has been removed in favour of \`userAgent\` function.
  Read more: https://nextjs.org/docs/messages/middleware-parse-user-agent
  `);
        }
      }
      let f = "_N_T_", b = { shared: "shared", reactServerComponents: "rsc", serverSideRendering: "ssr", actionBrowser: "action-browser", apiNode: "api-node", apiEdge: "api-edge", middleware: "middleware", instrument: "instrument", edgeAsset: "edge-asset", appPagesBrowser: "app-pages-browser", pagesDirBrowser: "pages-dir-browser", pagesDirEdge: "pages-dir-edge", pagesDirNode: "pages-dir-node" };
      function v(e10) {
        var t2, r2, n2, i2, a2, o2 = [], s2 = 0;
        function l2() {
          for (; s2 < e10.length && /\s/.test(e10.charAt(s2)); ) s2 += 1;
          return s2 < e10.length;
        }
        for (; s2 < e10.length; ) {
          for (t2 = s2, a2 = false; l2(); ) if ("," === (r2 = e10.charAt(s2))) {
            for (n2 = s2, s2 += 1, l2(), i2 = s2; s2 < e10.length && "=" !== (r2 = e10.charAt(s2)) && ";" !== r2 && "," !== r2; ) s2 += 1;
            s2 < e10.length && "=" === e10.charAt(s2) ? (a2 = true, s2 = i2, o2.push(e10.substring(t2, n2)), t2 = s2) : s2 = n2 + 1;
          } else s2 += 1;
          (!a2 || s2 >= e10.length) && o2.push(e10.substring(t2, e10.length));
        }
        return o2;
      }
      function m(e10) {
        let t2 = {}, r2 = [];
        if (e10) for (let [n2, i2] of e10.entries()) "set-cookie" === n2.toLowerCase() ? (r2.push(...v(i2)), t2[n2] = 1 === r2.length ? r2[0] : r2) : t2[n2] = i2;
        return t2;
      }
      function _(e10) {
        try {
          return String(new URL(String(e10)));
        } catch (t2) {
          throw Object.defineProperty(Error(`URL is malformed "${String(e10)}". Please use only absolute URLs - https://nextjs.org/docs/messages/middleware-relative-urls`, { cause: t2 }), "__NEXT_ERROR_CODE", { value: "E61", enumerable: false, configurable: true });
        }
      }
      ({ ...b, GROUP: { builtinReact: [b.reactServerComponents, b.actionBrowser], serverOnly: [b.reactServerComponents, b.actionBrowser, b.instrument, b.middleware], neutralTarget: [b.apiNode, b.apiEdge], clientOnly: [b.serverSideRendering, b.appPagesBrowser], bundled: [b.reactServerComponents, b.actionBrowser, b.serverSideRendering, b.appPagesBrowser, b.shared, b.instrument, b.middleware], appPages: [b.reactServerComponents, b.serverSideRendering, b.appPagesBrowser, b.actionBrowser] } });
      let w = Symbol("response"), y = Symbol("passThrough"), x = Symbol("waitUntil");
      class E {
        constructor(e10, t2) {
          this[y] = false, this[x] = t2 ? { kind: "external", function: t2 } : { kind: "internal", promises: [] };
        }
        respondWith(e10) {
          this[w] || (this[w] = Promise.resolve(e10));
        }
        passThroughOnException() {
          this[y] = true;
        }
        waitUntil(e10) {
          if ("external" === this[x].kind) return (0, this[x].function)(e10);
          this[x].promises.push(e10);
        }
      }
      class S extends E {
        constructor(e10) {
          var t2;
          super(e10.request, null == (t2 = e10.context) ? void 0 : t2.waitUntil), this.sourcePage = e10.page;
        }
        get request() {
          throw Object.defineProperty(new p({ page: this.sourcePage }), "__NEXT_ERROR_CODE", { value: "E394", enumerable: false, configurable: true });
        }
        respondWith() {
          throw Object.defineProperty(new p({ page: this.sourcePage }), "__NEXT_ERROR_CODE", { value: "E394", enumerable: false, configurable: true });
        }
      }
      function O(e10) {
        return e10.replace(/\/$/, "") || "/";
      }
      function R(e10) {
        let t2 = e10.indexOf("#"), r2 = e10.indexOf("?"), n2 = r2 > -1 && (t2 < 0 || r2 < t2);
        return n2 || t2 > -1 ? { pathname: e10.substring(0, n2 ? r2 : t2), query: n2 ? e10.substring(r2, t2 > -1 ? t2 : void 0) : "", hash: t2 > -1 ? e10.slice(t2) : "" } : { pathname: e10, query: "", hash: "" };
      }
      function C(e10, t2) {
        if (!e10.startsWith("/") || !t2) return e10;
        let { pathname: r2, query: n2, hash: i2 } = R(e10);
        return "" + t2 + r2 + n2 + i2;
      }
      function P(e10, t2) {
        if (!e10.startsWith("/") || !t2) return e10;
        let { pathname: r2, query: n2, hash: i2 } = R(e10);
        return "" + r2 + t2 + n2 + i2;
      }
      function T(e10, t2) {
        if ("string" != typeof e10) return false;
        let { pathname: r2 } = R(e10);
        return r2 === t2 || r2.startsWith(t2 + "/");
      }
      let N = /* @__PURE__ */ new WeakMap();
      function I(e10, t2) {
        let r2;
        if (!t2) return { pathname: e10 };
        let n2 = N.get(t2);
        n2 || (n2 = t2.map((e11) => e11.toLowerCase()), N.set(t2, n2));
        let i2 = e10.split("/", 2);
        if (!i2[1]) return { pathname: e10 };
        let a2 = i2[1].toLowerCase(), o2 = n2.indexOf(a2);
        return o2 < 0 ? { pathname: e10 } : (r2 = t2[o2], { pathname: e10 = e10.slice(r2.length + 1) || "/", detectedLocale: r2 });
      }
      let A = /(?!^https?:\/\/)(127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}|\[::1\]|localhost)/;
      function M(e10, t2) {
        return new URL(String(e10).replace(A, "localhost"), t2 && String(t2).replace(A, "localhost"));
      }
      let k = Symbol("NextURLInternal");
      class j {
        constructor(e10, t2, r2) {
          let n2, i2;
          "object" == typeof t2 && "pathname" in t2 || "string" == typeof t2 ? (n2 = t2, i2 = r2 || {}) : i2 = r2 || t2 || {}, this[k] = { url: M(e10, n2 ?? i2.base), options: i2, basePath: "" }, this.analyze();
        }
        analyze() {
          var e10, t2, r2, n2, i2;
          let a2 = function(e11, t3) {
            var r3, n3;
            let { basePath: i3, i18n: a3, trailingSlash: o3 } = null != (r3 = t3.nextConfig) ? r3 : {}, s3 = { pathname: e11, trailingSlash: "/" !== e11 ? e11.endsWith("/") : o3 };
            i3 && T(s3.pathname, i3) && (s3.pathname = function(e12, t4) {
              if (!T(e12, t4)) return e12;
              let r4 = e12.slice(t4.length);
              return r4.startsWith("/") ? r4 : "/" + r4;
            }(s3.pathname, i3), s3.basePath = i3);
            let l2 = s3.pathname;
            if (s3.pathname.startsWith("/_next/data/") && s3.pathname.endsWith(".json")) {
              let e12 = s3.pathname.replace(/^\/_next\/data\//, "").replace(/\.json$/, "").split("/");
              s3.buildId = e12[0], l2 = "index" !== e12[1] ? "/" + e12.slice(1).join("/") : "/", true === t3.parseData && (s3.pathname = l2);
            }
            if (a3) {
              let e12 = t3.i18nProvider ? t3.i18nProvider.analyze(s3.pathname) : I(s3.pathname, a3.locales);
              s3.locale = e12.detectedLocale, s3.pathname = null != (n3 = e12.pathname) ? n3 : s3.pathname, !e12.detectedLocale && s3.buildId && (e12 = t3.i18nProvider ? t3.i18nProvider.analyze(l2) : I(l2, a3.locales)).detectedLocale && (s3.locale = e12.detectedLocale);
            }
            return s3;
          }(this[k].url.pathname, { nextConfig: this[k].options.nextConfig, parseData: true, i18nProvider: this[k].options.i18nProvider }), o2 = function(e11, t3) {
            let r3;
            if ((null == t3 ? void 0 : t3.host) && !Array.isArray(t3.host)) r3 = t3.host.toString().split(":", 1)[0];
            else {
              if (!e11.hostname) return;
              r3 = e11.hostname;
            }
            return r3.toLowerCase();
          }(this[k].url, this[k].options.headers);
          this[k].domainLocale = this[k].options.i18nProvider ? this[k].options.i18nProvider.detectDomainLocale(o2) : function(e11, t3, r3) {
            if (e11) for (let a3 of (r3 && (r3 = r3.toLowerCase()), e11)) {
              var n3, i3;
              if (t3 === (null == (n3 = a3.domain) ? void 0 : n3.split(":", 1)[0].toLowerCase()) || r3 === a3.defaultLocale.toLowerCase() || (null == (i3 = a3.locales) ? void 0 : i3.some((e12) => e12.toLowerCase() === r3))) return a3;
            }
          }(null == (t2 = this[k].options.nextConfig) || null == (e10 = t2.i18n) ? void 0 : e10.domains, o2);
          let s2 = (null == (r2 = this[k].domainLocale) ? void 0 : r2.defaultLocale) || (null == (i2 = this[k].options.nextConfig) || null == (n2 = i2.i18n) ? void 0 : n2.defaultLocale);
          this[k].url.pathname = a2.pathname, this[k].defaultLocale = s2, this[k].basePath = a2.basePath ?? "", this[k].buildId = a2.buildId, this[k].locale = a2.locale ?? s2, this[k].trailingSlash = a2.trailingSlash;
        }
        formatPathname() {
          var e10;
          let t2;
          return t2 = function(e11, t3, r2, n2) {
            if (!t3 || t3 === r2) return e11;
            let i2 = e11.toLowerCase();
            return !n2 && (T(i2, "/api") || T(i2, "/" + t3.toLowerCase())) ? e11 : C(e11, "/" + t3);
          }((e10 = { basePath: this[k].basePath, buildId: this[k].buildId, defaultLocale: this[k].options.forceLocale ? void 0 : this[k].defaultLocale, locale: this[k].locale, pathname: this[k].url.pathname, trailingSlash: this[k].trailingSlash }).pathname, e10.locale, e10.buildId ? void 0 : e10.defaultLocale, e10.ignorePrefix), (e10.buildId || !e10.trailingSlash) && (t2 = O(t2)), e10.buildId && (t2 = P(C(t2, "/_next/data/" + e10.buildId), "/" === e10.pathname ? "index.json" : ".json")), t2 = C(t2, e10.basePath), !e10.buildId && e10.trailingSlash ? t2.endsWith("/") ? t2 : P(t2, "/") : O(t2);
        }
        formatSearch() {
          return this[k].url.search;
        }
        get buildId() {
          return this[k].buildId;
        }
        set buildId(e10) {
          this[k].buildId = e10;
        }
        get locale() {
          return this[k].locale ?? "";
        }
        set locale(e10) {
          var t2, r2;
          if (!this[k].locale || !(null == (r2 = this[k].options.nextConfig) || null == (t2 = r2.i18n) ? void 0 : t2.locales.includes(e10))) throw Object.defineProperty(TypeError(`The NextURL configuration includes no locale "${e10}"`), "__NEXT_ERROR_CODE", { value: "E597", enumerable: false, configurable: true });
          this[k].locale = e10;
        }
        get defaultLocale() {
          return this[k].defaultLocale;
        }
        get domainLocale() {
          return this[k].domainLocale;
        }
        get searchParams() {
          return this[k].url.searchParams;
        }
        get host() {
          return this[k].url.host;
        }
        set host(e10) {
          this[k].url.host = e10;
        }
        get hostname() {
          return this[k].url.hostname;
        }
        set hostname(e10) {
          this[k].url.hostname = e10;
        }
        get port() {
          return this[k].url.port;
        }
        set port(e10) {
          this[k].url.port = e10;
        }
        get protocol() {
          return this[k].url.protocol;
        }
        set protocol(e10) {
          this[k].url.protocol = e10;
        }
        get href() {
          let e10 = this.formatPathname(), t2 = this.formatSearch();
          return `${this.protocol}//${this.host}${e10}${t2}${this.hash}`;
        }
        set href(e10) {
          this[k].url = M(e10), this.analyze();
        }
        get origin() {
          return this[k].url.origin;
        }
        get pathname() {
          return this[k].url.pathname;
        }
        set pathname(e10) {
          this[k].url.pathname = e10;
        }
        get hash() {
          return this[k].url.hash;
        }
        set hash(e10) {
          this[k].url.hash = e10;
        }
        get search() {
          return this[k].url.search;
        }
        set search(e10) {
          this[k].url.search = e10;
        }
        get password() {
          return this[k].url.password;
        }
        set password(e10) {
          this[k].url.password = e10;
        }
        get username() {
          return this[k].url.username;
        }
        set username(e10) {
          this[k].url.username = e10;
        }
        get basePath() {
          return this[k].basePath;
        }
        set basePath(e10) {
          this[k].basePath = e10.startsWith("/") ? e10 : `/${e10}`;
        }
        toString() {
          return this.href;
        }
        toJSON() {
          return this.href;
        }
        [Symbol.for("edge-runtime.inspect.custom")]() {
          return { href: this.href, origin: this.origin, protocol: this.protocol, username: this.username, password: this.password, host: this.host, hostname: this.hostname, port: this.port, pathname: this.pathname, search: this.search, searchParams: this.searchParams, hash: this.hash };
        }
        clone() {
          return new j(String(this), this[k].options);
        }
      }
      var L = r(724);
      let D = Symbol("internal request");
      class q extends Request {
        constructor(e10, t2 = {}) {
          let r2 = "string" != typeof e10 && "url" in e10 ? e10.url : String(e10);
          _(r2), e10 instanceof Request ? super(e10, t2) : super(r2, t2);
          let n2 = new j(r2, { headers: m(this.headers), nextConfig: t2.nextConfig });
          this[D] = { cookies: new L.RequestCookies(this.headers), nextUrl: n2, url: n2.toString() };
        }
        [Symbol.for("edge-runtime.inspect.custom")]() {
          return { cookies: this.cookies, nextUrl: this.nextUrl, url: this.url, bodyUsed: this.bodyUsed, cache: this.cache, credentials: this.credentials, destination: this.destination, headers: Object.fromEntries(this.headers), integrity: this.integrity, keepalive: this.keepalive, method: this.method, mode: this.mode, redirect: this.redirect, referrer: this.referrer, referrerPolicy: this.referrerPolicy, signal: this.signal };
        }
        get cookies() {
          return this[D].cookies;
        }
        get nextUrl() {
          return this[D].nextUrl;
        }
        get page() {
          throw new h();
        }
        get ua() {
          throw new g();
        }
        get url() {
          return this[D].url;
        }
      }
      class U {
        static get(e10, t2, r2) {
          let n2 = Reflect.get(e10, t2, r2);
          return "function" == typeof n2 ? n2.bind(e10) : n2;
        }
        static set(e10, t2, r2, n2) {
          return Reflect.set(e10, t2, r2, n2);
        }
        static has(e10, t2) {
          return Reflect.has(e10, t2);
        }
        static deleteProperty(e10, t2) {
          return Reflect.deleteProperty(e10, t2);
        }
      }
      let B = Symbol("internal response"), V = /* @__PURE__ */ new Set([301, 302, 303, 307, 308]);
      function $(e10, t2) {
        var r2;
        if (null == e10 || null == (r2 = e10.request) ? void 0 : r2.headers) {
          if (!(e10.request.headers instanceof Headers)) throw Object.defineProperty(Error("request.headers must be an instance of Headers"), "__NEXT_ERROR_CODE", { value: "E119", enumerable: false, configurable: true });
          let r3 = [];
          for (let [n2, i2] of e10.request.headers) t2.set("x-middleware-request-" + n2, i2), r3.push(n2);
          t2.set("x-middleware-override-headers", r3.join(","));
        }
      }
      class z extends Response {
        constructor(e10, t2 = {}) {
          super(e10, t2);
          let r2 = this.headers, n2 = new Proxy(new L.ResponseCookies(r2), { get(e11, n3, i2) {
            switch (n3) {
              case "delete":
              case "set":
                return (...i3) => {
                  let a2 = Reflect.apply(e11[n3], e11, i3), o2 = new Headers(r2);
                  return a2 instanceof L.ResponseCookies && r2.set("x-middleware-set-cookie", a2.getAll().map((e12) => (0, L.stringifyCookie)(e12)).join(",")), $(t2, o2), a2;
                };
              default:
                return U.get(e11, n3, i2);
            }
          } });
          this[B] = { cookies: n2, url: t2.url ? new j(t2.url, { headers: m(r2), nextConfig: t2.nextConfig }) : void 0 };
        }
        [Symbol.for("edge-runtime.inspect.custom")]() {
          return { cookies: this.cookies, url: this.url, body: this.body, bodyUsed: this.bodyUsed, headers: Object.fromEntries(this.headers), ok: this.ok, redirected: this.redirected, status: this.status, statusText: this.statusText, type: this.type };
        }
        get cookies() {
          return this[B].cookies;
        }
        static json(e10, t2) {
          let r2 = Response.json(e10, t2);
          return new z(r2.body, r2);
        }
        static redirect(e10, t2) {
          let r2 = "number" == typeof t2 ? t2 : (null == t2 ? void 0 : t2.status) ?? 307;
          if (!V.has(r2)) throw Object.defineProperty(RangeError('Failed to execute "redirect" on "response": Invalid status code'), "__NEXT_ERROR_CODE", { value: "E529", enumerable: false, configurable: true });
          let n2 = "object" == typeof t2 ? t2 : {}, i2 = new Headers(null == n2 ? void 0 : n2.headers);
          return i2.set("Location", _(e10)), new z(null, { ...n2, headers: i2, status: r2 });
        }
        static rewrite(e10, t2) {
          let r2 = new Headers(null == t2 ? void 0 : t2.headers);
          return r2.set("x-middleware-rewrite", _(e10)), $(t2, r2), new z(null, { ...t2, headers: r2 });
        }
        static next(e10) {
          let t2 = new Headers(null == e10 ? void 0 : e10.headers);
          return t2.set("x-middleware-next", "1"), $(e10, t2), new z(null, { ...e10, headers: t2 });
        }
      }
      function H(e10, t2) {
        let r2 = "string" == typeof t2 ? new URL(t2) : t2, n2 = new URL(e10, t2), i2 = n2.origin === r2.origin;
        return { url: i2 ? n2.toString().slice(r2.origin.length) : n2.toString(), isRelative: i2 };
      }
      let G = "Next-Router-Prefetch", X = ["RSC", "Next-Router-State-Tree", G, "Next-HMR-Refresh", "Next-Router-Segment-Prefetch"], W = "_rsc";
      class F extends Error {
        constructor() {
          super("Headers cannot be modified. Read more: https://nextjs.org/docs/app/api-reference/functions/headers");
        }
        static callable() {
          throw new F();
        }
      }
      class K extends Headers {
        constructor(e10) {
          super(), this.headers = new Proxy(e10, { get(t2, r2, n2) {
            if ("symbol" == typeof r2) return U.get(t2, r2, n2);
            let i2 = r2.toLowerCase(), a2 = Object.keys(e10).find((e11) => e11.toLowerCase() === i2);
            if (void 0 !== a2) return U.get(t2, a2, n2);
          }, set(t2, r2, n2, i2) {
            if ("symbol" == typeof r2) return U.set(t2, r2, n2, i2);
            let a2 = r2.toLowerCase(), o2 = Object.keys(e10).find((e11) => e11.toLowerCase() === a2);
            return U.set(t2, o2 ?? r2, n2, i2);
          }, has(t2, r2) {
            if ("symbol" == typeof r2) return U.has(t2, r2);
            let n2 = r2.toLowerCase(), i2 = Object.keys(e10).find((e11) => e11.toLowerCase() === n2);
            return void 0 !== i2 && U.has(t2, i2);
          }, deleteProperty(t2, r2) {
            if ("symbol" == typeof r2) return U.deleteProperty(t2, r2);
            let n2 = r2.toLowerCase(), i2 = Object.keys(e10).find((e11) => e11.toLowerCase() === n2);
            return void 0 === i2 || U.deleteProperty(t2, i2);
          } });
        }
        static seal(e10) {
          return new Proxy(e10, { get(e11, t2, r2) {
            switch (t2) {
              case "append":
              case "delete":
              case "set":
                return F.callable;
              default:
                return U.get(e11, t2, r2);
            }
          } });
        }
        merge(e10) {
          return Array.isArray(e10) ? e10.join(", ") : e10;
        }
        static from(e10) {
          return e10 instanceof Headers ? e10 : new K(e10);
        }
        append(e10, t2) {
          let r2 = this.headers[e10];
          "string" == typeof r2 ? this.headers[e10] = [r2, t2] : Array.isArray(r2) ? r2.push(t2) : this.headers[e10] = t2;
        }
        delete(e10) {
          delete this.headers[e10];
        }
        get(e10) {
          let t2 = this.headers[e10];
          return void 0 !== t2 ? this.merge(t2) : null;
        }
        has(e10) {
          return void 0 !== this.headers[e10];
        }
        set(e10, t2) {
          this.headers[e10] = t2;
        }
        forEach(e10, t2) {
          for (let [r2, n2] of this.entries()) e10.call(t2, n2, r2, this);
        }
        *entries() {
          for (let e10 of Object.keys(this.headers)) {
            let t2 = e10.toLowerCase(), r2 = this.get(t2);
            yield [t2, r2];
          }
        }
        *keys() {
          for (let e10 of Object.keys(this.headers)) {
            let t2 = e10.toLowerCase();
            yield t2;
          }
        }
        *values() {
          for (let e10 of Object.keys(this.headers)) {
            let t2 = this.get(e10);
            yield t2;
          }
        }
        [Symbol.iterator]() {
          return this.entries();
        }
      }
      let Q = Object.defineProperty(Error("Invariant: AsyncLocalStorage accessed in runtime where it is not available"), "__NEXT_ERROR_CODE", { value: "E504", enumerable: false, configurable: true });
      class J {
        disable() {
          throw Q;
        }
        getStore() {
        }
        run() {
          throw Q;
        }
        exit() {
          throw Q;
        }
        enterWith() {
          throw Q;
        }
        static bind(e10) {
          return e10;
        }
      }
      let Y = "undefined" != typeof globalThis && globalThis.AsyncLocalStorage;
      function Z() {
        return Y ? new Y() : new J();
      }
      let ee = Z(), et = Z();
      class er extends Error {
        constructor() {
          super("Cookies can only be modified in a Server Action or Route Handler. Read more: https://nextjs.org/docs/app/api-reference/functions/cookies#options");
        }
        static callable() {
          throw new er();
        }
      }
      class en {
        static seal(e10) {
          return new Proxy(e10, { get(e11, t2, r2) {
            switch (t2) {
              case "clear":
              case "delete":
              case "set":
                return er.callable;
              default:
                return U.get(e11, t2, r2);
            }
          } });
        }
      }
      let ei = Symbol.for("next.mutated.cookies");
      class ea {
        static wrap(e10, t2) {
          let r2 = new L.ResponseCookies(new Headers());
          for (let t3 of e10.getAll()) r2.set(t3);
          let n2 = [], i2 = /* @__PURE__ */ new Set(), a2 = () => {
            let e11 = ee.getStore();
            if (e11 && (e11.pathWasRevalidated = true), n2 = r2.getAll().filter((e12) => i2.has(e12.name)), t2) {
              let e12 = [];
              for (let t3 of n2) {
                let r3 = new L.ResponseCookies(new Headers());
                r3.set(t3), e12.push(r3.toString());
              }
              t2(e12);
            }
          }, o2 = new Proxy(r2, { get(e11, t3, r3) {
            switch (t3) {
              case ei:
                return n2;
              case "delete":
                return function(...t4) {
                  i2.add("string" == typeof t4[0] ? t4[0] : t4[0].name);
                  try {
                    return e11.delete(...t4), o2;
                  } finally {
                    a2();
                  }
                };
              case "set":
                return function(...t4) {
                  i2.add("string" == typeof t4[0] ? t4[0] : t4[0].name);
                  try {
                    return e11.set(...t4), o2;
                  } finally {
                    a2();
                  }
                };
              default:
                return U.get(e11, t3, r3);
            }
          } });
          return o2;
        }
      }
      function eo(e10) {
        if ("action" !== function(e11) {
          let t2 = et.getStore();
          switch (!t2 && function(e12) {
            throw Object.defineProperty(Error(`\`${e12}\` was called outside a request scope. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context`), "__NEXT_ERROR_CODE", { value: "E251", enumerable: false, configurable: true });
          }(e11), t2.type) {
            case "request":
            default:
              return t2;
            case "prerender":
            case "prerender-ppr":
            case "prerender-legacy":
              throw Object.defineProperty(Error(`\`${e11}\` cannot be called inside a prerender. This is a bug in Next.js.`), "__NEXT_ERROR_CODE", { value: "E401", enumerable: false, configurable: true });
            case "cache":
              throw Object.defineProperty(Error(`\`${e11}\` cannot be called inside "use cache". Call it outside and pass an argument instead. Read more: https://nextjs.org/docs/messages/next-request-in-use-cache`), "__NEXT_ERROR_CODE", { value: "E37", enumerable: false, configurable: true });
            case "unstable-cache":
              throw Object.defineProperty(Error(`\`${e11}\` cannot be called inside unstable_cache. Call it outside and pass an argument instead. Read more: https://nextjs.org/docs/app/api-reference/functions/unstable_cache`), "__NEXT_ERROR_CODE", { value: "E69", enumerable: false, configurable: true });
          }
        }(e10).phase) throw new er();
      }
      var es = function(e10) {
        return e10.handleRequest = "BaseServer.handleRequest", e10.run = "BaseServer.run", e10.pipe = "BaseServer.pipe", e10.getStaticHTML = "BaseServer.getStaticHTML", e10.render = "BaseServer.render", e10.renderToResponseWithComponents = "BaseServer.renderToResponseWithComponents", e10.renderToResponse = "BaseServer.renderToResponse", e10.renderToHTML = "BaseServer.renderToHTML", e10.renderError = "BaseServer.renderError", e10.renderErrorToResponse = "BaseServer.renderErrorToResponse", e10.renderErrorToHTML = "BaseServer.renderErrorToHTML", e10.render404 = "BaseServer.render404", e10;
      }(es || {}), el = function(e10) {
        return e10.loadDefaultErrorComponents = "LoadComponents.loadDefaultErrorComponents", e10.loadComponents = "LoadComponents.loadComponents", e10;
      }(el || {}), eu = function(e10) {
        return e10.getRequestHandler = "NextServer.getRequestHandler", e10.getServer = "NextServer.getServer", e10.getServerRequestHandler = "NextServer.getServerRequestHandler", e10.createServer = "createServer.createServer", e10;
      }(eu || {}), ec = function(e10) {
        return e10.compression = "NextNodeServer.compression", e10.getBuildId = "NextNodeServer.getBuildId", e10.createComponentTree = "NextNodeServer.createComponentTree", e10.clientComponentLoading = "NextNodeServer.clientComponentLoading", e10.getLayoutOrPageModule = "NextNodeServer.getLayoutOrPageModule", e10.generateStaticRoutes = "NextNodeServer.generateStaticRoutes", e10.generateFsStaticRoutes = "NextNodeServer.generateFsStaticRoutes", e10.generatePublicRoutes = "NextNodeServer.generatePublicRoutes", e10.generateImageRoutes = "NextNodeServer.generateImageRoutes.route", e10.sendRenderResult = "NextNodeServer.sendRenderResult", e10.proxyRequest = "NextNodeServer.proxyRequest", e10.runApi = "NextNodeServer.runApi", e10.render = "NextNodeServer.render", e10.renderHTML = "NextNodeServer.renderHTML", e10.imageOptimizer = "NextNodeServer.imageOptimizer", e10.getPagePath = "NextNodeServer.getPagePath", e10.getRoutesManifest = "NextNodeServer.getRoutesManifest", e10.findPageComponents = "NextNodeServer.findPageComponents", e10.getFontManifest = "NextNodeServer.getFontManifest", e10.getServerComponentManifest = "NextNodeServer.getServerComponentManifest", e10.getRequestHandler = "NextNodeServer.getRequestHandler", e10.renderToHTML = "NextNodeServer.renderToHTML", e10.renderError = "NextNodeServer.renderError", e10.renderErrorToHTML = "NextNodeServer.renderErrorToHTML", e10.render404 = "NextNodeServer.render404", e10.startResponse = "NextNodeServer.startResponse", e10.route = "route", e10.onProxyReq = "onProxyReq", e10.apiResolver = "apiResolver", e10.internalFetch = "internalFetch", e10;
      }(ec || {}), ed = function(e10) {
        return e10.startServer = "startServer.startServer", e10;
      }(ed || {}), ep = function(e10) {
        return e10.getServerSideProps = "Render.getServerSideProps", e10.getStaticProps = "Render.getStaticProps", e10.renderToString = "Render.renderToString", e10.renderDocument = "Render.renderDocument", e10.createBodyResult = "Render.createBodyResult", e10;
      }(ep || {}), eh = function(e10) {
        return e10.renderToString = "AppRender.renderToString", e10.renderToReadableStream = "AppRender.renderToReadableStream", e10.getBodyResult = "AppRender.getBodyResult", e10.fetch = "AppRender.fetch", e10;
      }(eh || {}), eg = function(e10) {
        return e10.executeRoute = "Router.executeRoute", e10;
      }(eg || {}), ef = function(e10) {
        return e10.runHandler = "Node.runHandler", e10;
      }(ef || {}), eb = function(e10) {
        return e10.runHandler = "AppRouteRouteHandlers.runHandler", e10;
      }(eb || {}), ev = function(e10) {
        return e10.generateMetadata = "ResolveMetadata.generateMetadata", e10.generateViewport = "ResolveMetadata.generateViewport", e10;
      }(ev || {}), em = function(e10) {
        return e10.execute = "Middleware.execute", e10;
      }(em || {});
      let e_ = ["Middleware.execute", "BaseServer.handleRequest", "Render.getServerSideProps", "Render.getStaticProps", "AppRender.fetch", "AppRender.getBodyResult", "Render.renderDocument", "Node.runHandler", "AppRouteRouteHandlers.runHandler", "ResolveMetadata.generateMetadata", "ResolveMetadata.generateViewport", "NextNodeServer.createComponentTree", "NextNodeServer.findPageComponents", "NextNodeServer.getLayoutOrPageModule", "NextNodeServer.startResponse", "NextNodeServer.clientComponentLoading"], ew = ["NextNodeServer.findPageComponents", "NextNodeServer.createComponentTree", "NextNodeServer.clientComponentLoading"];
      function ey(e10) {
        return null !== e10 && "object" == typeof e10 && "then" in e10 && "function" == typeof e10.then;
      }
      let { context: ex, propagation: eE, trace: eS, SpanStatusCode: eO, SpanKind: eR, ROOT_CONTEXT: eC } = n = r(956);
      class eP extends Error {
        constructor(e10, t2) {
          super(), this.bubble = e10, this.result = t2;
        }
      }
      let eT = (e10, t2) => {
        (function(e11) {
          return "object" == typeof e11 && null !== e11 && e11 instanceof eP;
        })(t2) && t2.bubble ? e10.setAttribute("next.bubble", true) : (t2 && e10.recordException(t2), e10.setStatus({ code: eO.ERROR, message: null == t2 ? void 0 : t2.message })), e10.end();
      }, eN = /* @__PURE__ */ new Map(), eI = n.createContextKey("next.rootSpanId"), eA = 0, eM = () => eA++, ek = { set(e10, t2, r2) {
        e10.push({ key: t2, value: r2 });
      } };
      class ej {
        getTracerInstance() {
          return eS.getTracer("next.js", "0.0.1");
        }
        getContext() {
          return ex;
        }
        getTracePropagationData() {
          let e10 = ex.active(), t2 = [];
          return eE.inject(e10, t2, ek), t2;
        }
        getActiveScopeSpan() {
          return eS.getSpan(null == ex ? void 0 : ex.active());
        }
        withPropagatedContext(e10, t2, r2) {
          let n2 = ex.active();
          if (eS.getSpanContext(n2)) return t2();
          let i2 = eE.extract(n2, e10, r2);
          return ex.with(i2, t2);
        }
        trace(...e10) {
          var t2;
          let [r2, n2, i2] = e10, { fn: a2, options: o2 } = "function" == typeof n2 ? { fn: n2, options: {} } : { fn: i2, options: { ...n2 } }, s2 = o2.spanName ?? r2;
          if (!e_.includes(r2) && "1" !== process.env.NEXT_OTEL_VERBOSE || o2.hideSpan) return a2();
          let l2 = this.getSpanContext((null == o2 ? void 0 : o2.parentSpan) ?? this.getActiveScopeSpan()), u2 = false;
          l2 ? (null == (t2 = eS.getSpanContext(l2)) ? void 0 : t2.isRemote) && (u2 = true) : (l2 = (null == ex ? void 0 : ex.active()) ?? eC, u2 = true);
          let c2 = eM();
          return o2.attributes = { "next.span_name": s2, "next.span_type": r2, ...o2.attributes }, ex.with(l2.setValue(eI, c2), () => this.getTracerInstance().startActiveSpan(s2, o2, (e11) => {
            let t3 = "performance" in globalThis && "measure" in performance ? globalThis.performance.now() : void 0, n3 = () => {
              eN.delete(c2), t3 && process.env.NEXT_OTEL_PERFORMANCE_PREFIX && ew.includes(r2 || "") && performance.measure(`${process.env.NEXT_OTEL_PERFORMANCE_PREFIX}:next-${(r2.split(".").pop() || "").replace(/[A-Z]/g, (e12) => "-" + e12.toLowerCase())}`, { start: t3, end: performance.now() });
            };
            u2 && eN.set(c2, new Map(Object.entries(o2.attributes ?? {})));
            try {
              if (a2.length > 1) return a2(e11, (t5) => eT(e11, t5));
              let t4 = a2(e11);
              if (ey(t4)) return t4.then((t5) => (e11.end(), t5)).catch((t5) => {
                throw eT(e11, t5), t5;
              }).finally(n3);
              return e11.end(), n3(), t4;
            } catch (t4) {
              throw eT(e11, t4), n3(), t4;
            }
          }));
        }
        wrap(...e10) {
          let t2 = this, [r2, n2, i2] = 3 === e10.length ? e10 : [e10[0], {}, e10[1]];
          return e_.includes(r2) || "1" === process.env.NEXT_OTEL_VERBOSE ? function() {
            let e11 = n2;
            "function" == typeof e11 && "function" == typeof i2 && (e11 = e11.apply(this, arguments));
            let a2 = arguments.length - 1, o2 = arguments[a2];
            if ("function" != typeof o2) return t2.trace(r2, e11, () => i2.apply(this, arguments));
            {
              let n3 = t2.getContext().bind(ex.active(), o2);
              return t2.trace(r2, e11, (e12, t3) => (arguments[a2] = function(e13) {
                return null == t3 || t3(e13), n3.apply(this, arguments);
              }, i2.apply(this, arguments)));
            }
          } : i2;
        }
        startSpan(...e10) {
          let [t2, r2] = e10, n2 = this.getSpanContext((null == r2 ? void 0 : r2.parentSpan) ?? this.getActiveScopeSpan());
          return this.getTracerInstance().startSpan(t2, r2, n2);
        }
        getSpanContext(e10) {
          return e10 ? eS.setSpan(ex.active(), e10) : void 0;
        }
        getRootSpanAttributes() {
          let e10 = ex.active().getValue(eI);
          return eN.get(e10);
        }
        setRootSpanAttribute(e10, t2) {
          let r2 = ex.active().getValue(eI), n2 = eN.get(r2);
          n2 && n2.set(e10, t2);
        }
      }
      let eL = (() => {
        let e10 = new ej();
        return () => e10;
      })(), eD = "__prerender_bypass";
      Symbol("__next_preview_data"), Symbol(eD);
      class eq {
        constructor(e10, t2, r2, n2) {
          var i2;
          let a2 = e10 && function(e11, t3) {
            let r3 = K.from(e11.headers);
            return { isOnDemandRevalidate: r3.get("x-prerender-revalidate") === t3.previewModeId, revalidateOnlyGenerated: r3.has("x-prerender-revalidate-if-generated") };
          }(t2, e10).isOnDemandRevalidate, o2 = null == (i2 = r2.get(eD)) ? void 0 : i2.value;
          this._isEnabled = !!(!a2 && o2 && e10 && o2 === e10.previewModeId), this._previewModeId = null == e10 ? void 0 : e10.previewModeId, this._mutableCookies = n2;
        }
        get isEnabled() {
          return this._isEnabled;
        }
        enable() {
          if (!this._previewModeId) throw Object.defineProperty(Error("Invariant: previewProps missing previewModeId this should never happen"), "__NEXT_ERROR_CODE", { value: "E93", enumerable: false, configurable: true });
          this._mutableCookies.set({ name: eD, value: this._previewModeId, httpOnly: true, sameSite: "none", secure: true, path: "/" }), this._isEnabled = true;
        }
        disable() {
          this._mutableCookies.set({ name: eD, value: "", httpOnly: true, sameSite: "none", secure: true, path: "/", expires: /* @__PURE__ */ new Date(0) }), this._isEnabled = false;
        }
      }
      function eU(e10, t2) {
        if ("x-middleware-set-cookie" in e10.headers && "string" == typeof e10.headers["x-middleware-set-cookie"]) {
          let r2 = e10.headers["x-middleware-set-cookie"], n2 = new Headers();
          for (let e11 of v(r2)) n2.append("set-cookie", e11);
          for (let e11 of new L.ResponseCookies(n2).getAll()) t2.set(e11);
        }
      }
      var eB = r(802), eV = r.n(eB);
      class e$ extends Error {
        constructor(e10, t2) {
          super("Invariant: " + (e10.endsWith(".") ? e10 : e10 + ".") + " This is a bug in Next.js.", t2), this.name = "InvariantError";
        }
      }
      class ez {
        constructor(e10, t2) {
          this.cache = /* @__PURE__ */ new Map(), this.sizes = /* @__PURE__ */ new Map(), this.totalSize = 0, this.maxSize = e10, this.calculateSize = t2 || (() => 1);
        }
        set(e10, t2) {
          if (!e10 || !t2) return;
          let r2 = this.calculateSize(t2);
          if (r2 > this.maxSize) return void console.warn("Single item size exceeds maxSize");
          this.cache.has(e10) && (this.totalSize -= this.sizes.get(e10) || 0), this.cache.set(e10, t2), this.sizes.set(e10, r2), this.totalSize += r2, this.touch(e10);
        }
        has(e10) {
          return !!e10 && (this.touch(e10), !!this.cache.get(e10));
        }
        get(e10) {
          if (!e10) return;
          let t2 = this.cache.get(e10);
          if (void 0 !== t2) return this.touch(e10), t2;
        }
        touch(e10) {
          let t2 = this.cache.get(e10);
          void 0 !== t2 && (this.cache.delete(e10), this.cache.set(e10, t2), this.evictIfNecessary());
        }
        evictIfNecessary() {
          for (; this.totalSize > this.maxSize && this.cache.size > 0; ) this.evictLeastRecentlyUsed();
        }
        evictLeastRecentlyUsed() {
          let e10 = this.cache.keys().next().value;
          if (void 0 !== e10) {
            let t2 = this.sizes.get(e10) || 0;
            this.totalSize -= t2, this.cache.delete(e10), this.sizes.delete(e10);
          }
        }
        reset() {
          this.cache.clear(), this.sizes.clear(), this.totalSize = 0;
        }
        keys() {
          return [...this.cache.keys()];
        }
        remove(e10) {
          this.cache.has(e10) && (this.totalSize -= this.sizes.get(e10) || 0, this.cache.delete(e10), this.sizes.delete(e10));
        }
        clear() {
          this.cache.clear(), this.sizes.clear(), this.totalSize = 0;
        }
        get size() {
          return this.cache.size;
        }
        get currentSize() {
          return this.totalSize;
        }
      }
      r(356).Buffer, new ez(52428800, (e10) => e10.size), process.env.NEXT_PRIVATE_DEBUG_CACHE && console.debug.bind(console, "DefaultCacheHandler:"), process.env.NEXT_PRIVATE_DEBUG_CACHE, Symbol.for("@next/cache-handlers");
      let eH = Symbol.for("@next/cache-handlers-map"), eG = Symbol.for("@next/cache-handlers-set"), eX = globalThis;
      function eW() {
        if (eX[eH]) return eX[eH].entries();
      }
      async function eF(e10, t2) {
        if (!e10) return t2();
        let r2 = eK(e10);
        try {
          return await t2();
        } finally {
          let t3 = function(e11, t4) {
            let r3 = new Set(e11.pendingRevalidatedTags), n2 = new Set(e11.pendingRevalidateWrites);
            return { pendingRevalidatedTags: t4.pendingRevalidatedTags.filter((e12) => !r3.has(e12)), pendingRevalidates: Object.fromEntries(Object.entries(t4.pendingRevalidates).filter(([t5]) => !(t5 in e11.pendingRevalidates))), pendingRevalidateWrites: t4.pendingRevalidateWrites.filter((e12) => !n2.has(e12)) };
          }(r2, eK(e10));
          await eJ(e10, t3);
        }
      }
      function eK(e10) {
        return { pendingRevalidatedTags: e10.pendingRevalidatedTags ? [...e10.pendingRevalidatedTags] : [], pendingRevalidates: { ...e10.pendingRevalidates }, pendingRevalidateWrites: e10.pendingRevalidateWrites ? [...e10.pendingRevalidateWrites] : [] };
      }
      async function eQ(e10, t2) {
        if (0 === e10.length) return;
        let r2 = [];
        t2 && r2.push(t2.revalidateTag(e10));
        let n2 = function() {
          if (eX[eG]) return eX[eG].values();
        }();
        if (n2) for (let t3 of n2) r2.push(t3.expireTags(...e10));
        await Promise.all(r2);
      }
      async function eJ(e10, t2) {
        let r2 = (null == t2 ? void 0 : t2.pendingRevalidatedTags) ?? e10.pendingRevalidatedTags ?? [], n2 = (null == t2 ? void 0 : t2.pendingRevalidates) ?? e10.pendingRevalidates ?? {}, i2 = (null == t2 ? void 0 : t2.pendingRevalidateWrites) ?? e10.pendingRevalidateWrites ?? [];
        return Promise.all([eQ(r2, e10.incrementalCache), ...Object.values(n2), ...i2]);
      }
      let eY = Object.defineProperty(Error("Invariant: AsyncLocalStorage accessed in runtime where it is not available"), "__NEXT_ERROR_CODE", { value: "E504", enumerable: false, configurable: true });
      class eZ {
        disable() {
          throw eY;
        }
        getStore() {
        }
        run() {
          throw eY;
        }
        exit() {
          throw eY;
        }
        enterWith() {
          throw eY;
        }
        static bind(e10) {
          return e10;
        }
      }
      let e0 = "undefined" != typeof globalThis && globalThis.AsyncLocalStorage, e1 = e0 ? new e0() : new eZ();
      class e2 {
        constructor({ waitUntil: e10, onClose: t2, onTaskError: r2 }) {
          this.workUnitStores = /* @__PURE__ */ new Set(), this.waitUntil = e10, this.onClose = t2, this.onTaskError = r2, this.callbackQueue = new (eV())(), this.callbackQueue.pause();
        }
        after(e10) {
          if (ey(e10)) this.waitUntil || e3(), this.waitUntil(e10.catch((e11) => this.reportTaskError("promise", e11)));
          else if ("function" == typeof e10) this.addCallback(e10);
          else throw Object.defineProperty(Error("`after()`: Argument must be a promise or a function"), "__NEXT_ERROR_CODE", { value: "E50", enumerable: false, configurable: true });
        }
        addCallback(e10) {
          var t2;
          this.waitUntil || e3();
          let r2 = et.getStore();
          r2 && this.workUnitStores.add(r2);
          let n2 = e1.getStore(), i2 = n2 ? n2.rootTaskSpawnPhase : null == r2 ? void 0 : r2.phase;
          this.runCallbacksOnClosePromise || (this.runCallbacksOnClosePromise = this.runCallbacksOnClose(), this.waitUntil(this.runCallbacksOnClosePromise));
          let a2 = (t2 = async () => {
            try {
              await e1.run({ rootTaskSpawnPhase: i2 }, () => e10());
            } catch (e11) {
              this.reportTaskError("function", e11);
            }
          }, e0 ? e0.bind(t2) : eZ.bind(t2));
          this.callbackQueue.add(a2);
        }
        async runCallbacksOnClose() {
          return await new Promise((e10) => this.onClose(e10)), this.runCallbacks();
        }
        async runCallbacks() {
          if (0 === this.callbackQueue.size) return;
          for (let e11 of this.workUnitStores) e11.phase = "after";
          let e10 = ee.getStore();
          if (!e10) throw Object.defineProperty(new e$("Missing workStore in AfterContext.runCallbacks"), "__NEXT_ERROR_CODE", { value: "E547", enumerable: false, configurable: true });
          return eF(e10, () => (this.callbackQueue.start(), this.callbackQueue.onIdle()));
        }
        reportTaskError(e10, t2) {
          if (console.error("promise" === e10 ? "A promise passed to `after()` rejected:" : "An error occurred in a function passed to `after()`:", t2), this.onTaskError) try {
            null == this.onTaskError || this.onTaskError.call(this, t2);
          } catch (e11) {
            console.error(Object.defineProperty(new e$("`onTaskError` threw while handling an error thrown from an `after` task", { cause: e11 }), "__NEXT_ERROR_CODE", { value: "E569", enumerable: false, configurable: true }));
          }
        }
      }
      function e3() {
        throw Object.defineProperty(Error("`after()` will not work correctly, because `waitUntil` is not available in the current environment."), "__NEXT_ERROR_CODE", { value: "E91", enumerable: false, configurable: true });
      }
      function e4(e10) {
        let t2, r2 = { then: (n2, i2) => (t2 || (t2 = e10()), t2.then((e11) => {
          r2.value = e11;
        }).catch(() => {
        }), t2.then(n2, i2)) };
        return r2;
      }
      class e9 {
        onClose(e10) {
          if (this.isClosed) throw Object.defineProperty(Error("Cannot subscribe to a closed CloseController"), "__NEXT_ERROR_CODE", { value: "E365", enumerable: false, configurable: true });
          this.target.addEventListener("close", e10), this.listeners++;
        }
        dispatchClose() {
          if (this.isClosed) throw Object.defineProperty(Error("Cannot close a CloseController multiple times"), "__NEXT_ERROR_CODE", { value: "E229", enumerable: false, configurable: true });
          this.listeners > 0 && this.target.dispatchEvent(new Event("close")), this.isClosed = true;
        }
        constructor() {
          this.target = new EventTarget(), this.listeners = 0, this.isClosed = false;
        }
      }
      function e6() {
        return { previewModeId: process.env.__NEXT_PREVIEW_MODE_ID, previewModeSigningKey: process.env.__NEXT_PREVIEW_MODE_SIGNING_KEY || "", previewModeEncryptionKey: process.env.__NEXT_PREVIEW_MODE_ENCRYPTION_KEY || "" };
      }
      let e5 = Symbol.for("@next/request-context"), e7 = (e10) => {
        let t2 = ["/layout"];
        if (e10.startsWith("/")) {
          let r2 = e10.split("/");
          for (let e11 = 1; e11 < r2.length + 1; e11++) {
            let n2 = r2.slice(0, e11).join("/");
            n2 && (n2.endsWith("/page") || n2.endsWith("/route") || (n2 = `${n2}${!n2.endsWith("/") ? "/" : ""}layout`), t2.push(n2));
          }
        }
        return t2;
      };
      async function e8(e10, t2, r2) {
        let n2 = [], i2 = r2 && r2.size > 0;
        for (let t3 of e7(e10)) t3 = `${f}${t3}`, n2.push(t3);
        if (t2.pathname && !i2) {
          let e11 = `${f}${t2.pathname}`;
          n2.push(e11);
        }
        return { tags: n2, expirationsByCacheKind: function(e11) {
          let t3 = /* @__PURE__ */ new Map(), r3 = eW();
          if (r3) for (let [n3, i3] of r3) "getExpiration" in i3 && t3.set(n3, e4(async () => i3.getExpiration(...e11)));
          return t3;
        }(n2) };
      }
      class te extends q {
        constructor(e10) {
          super(e10.input, e10.init), this.sourcePage = e10.page;
        }
        get request() {
          throw Object.defineProperty(new p({ page: this.sourcePage }), "__NEXT_ERROR_CODE", { value: "E394", enumerable: false, configurable: true });
        }
        respondWith() {
          throw Object.defineProperty(new p({ page: this.sourcePage }), "__NEXT_ERROR_CODE", { value: "E394", enumerable: false, configurable: true });
        }
        waitUntil() {
          throw Object.defineProperty(new p({ page: this.sourcePage }), "__NEXT_ERROR_CODE", { value: "E394", enumerable: false, configurable: true });
        }
      }
      let tt = { keys: (e10) => Array.from(e10.keys()), get: (e10, t2) => e10.get(t2) ?? void 0 }, tr = (e10, t2) => eL().withPropagatedContext(e10.headers, t2, tt), tn = false;
      async function ti(e10) {
        var t2;
        let n2, i2;
        if (!tn && (tn = true, "true" === process.env.NEXT_PRIVATE_TEST_PROXY)) {
          let { interceptTestApis: e11, wrapRequestHandler: t3 } = r(905);
          e11(), tr = t3(tr);
        }
        await c();
        let a2 = void 0 !== globalThis.__BUILD_MANIFEST;
        e10.request.url = e10.request.url.replace(/\.rsc($|\?)/, "$1");
        let o2 = new j(e10.request.url, { headers: e10.request.headers, nextConfig: e10.request.nextConfig });
        for (let e11 of [...o2.searchParams.keys()]) {
          let t3 = o2.searchParams.getAll(e11), r2 = function(e12) {
            for (let t4 of ["nxtP", "nxtI"]) if (e12 !== t4 && e12.startsWith(t4)) return e12.substring(t4.length);
            return null;
          }(e11);
          if (r2) {
            for (let e12 of (o2.searchParams.delete(r2), t3)) o2.searchParams.append(r2, e12);
            o2.searchParams.delete(e11);
          }
        }
        let s2 = o2.buildId;
        o2.buildId = "";
        let l2 = function(e11) {
          let t3 = new Headers();
          for (let [r2, n3] of Object.entries(e11)) for (let e12 of Array.isArray(n3) ? n3 : [n3]) void 0 !== e12 && ("number" == typeof e12 && (e12 = e12.toString()), t3.append(r2, e12));
          return t3;
        }(e10.request.headers), u2 = l2.has("x-nextjs-data"), d2 = "1" === l2.get("RSC");
        u2 && "/index" === o2.pathname && (o2.pathname = "/");
        let p2 = /* @__PURE__ */ new Map();
        if (!a2) for (let e11 of X) {
          let t3 = e11.toLowerCase(), r2 = l2.get(t3);
          null !== r2 && (p2.set(t3, r2), l2.delete(t3));
        }
        let h2 = new te({ page: e10.page, input: function(e11) {
          let t3 = "string" == typeof e11, r2 = t3 ? new URL(e11) : e11;
          return r2.searchParams.delete(W), t3 ? r2.toString() : r2;
        }(o2).toString(), init: { body: e10.request.body, headers: l2, method: e10.request.method, nextConfig: e10.request.nextConfig, signal: e10.request.signal } });
        u2 && Object.defineProperty(h2, "__isData", { enumerable: false, value: true }), !globalThis.__incrementalCache && e10.IncrementalCache && (globalThis.__incrementalCache = new e10.IncrementalCache({ appDir: true, fetchCache: true, minimalMode: true, fetchCacheKeyPrefix: "", dev: false, requestHeaders: e10.request.headers, requestProtocol: "https", getPrerenderManifest: () => ({ version: -1, routes: {}, dynamicRoutes: {}, notFoundRoutes: [], preview: e6() }) }));
        let g2 = e10.request.waitUntil ?? (null == (t2 = function() {
          let e11 = globalThis[e5];
          return null == e11 ? void 0 : e11.get();
        }()) ? void 0 : t2.waitUntil), f2 = new S({ request: h2, page: e10.page, context: g2 ? { waitUntil: g2 } : void 0 });
        if ((n2 = await tr(h2, () => {
          if ("/middleware" === e10.page || "/src/middleware" === e10.page) {
            let t3 = f2.waitUntil.bind(f2), r2 = new e9();
            return eL().trace(em.execute, { spanName: `middleware ${h2.method} ${h2.nextUrl.pathname}`, attributes: { "http.target": h2.nextUrl.pathname, "http.method": h2.method } }, async () => {
              try {
                var n3, a3, o3, l3, u3, c2;
                let d3 = e6(), p3 = await e8("/", h2.nextUrl, null), g3 = (u3 = h2.nextUrl, c2 = (e11) => {
                  i2 = e11;
                }, function(e11, t4, r3, n4, i3, a4, o4, s3, l4, u4, c3) {
                  function d4(e12) {
                    r3 && r3.setHeader("Set-Cookie", e12);
                  }
                  let p4 = {};
                  return { type: "request", phase: e11, implicitTags: a4, url: { pathname: n4.pathname, search: n4.search ?? "" }, rootParams: i3, get headers() {
                    return p4.headers || (p4.headers = function(e12) {
                      let t5 = K.from(e12);
                      for (let e13 of X) t5.delete(e13.toLowerCase());
                      return K.seal(t5);
                    }(t4.headers)), p4.headers;
                  }, get cookies() {
                    if (!p4.cookies) {
                      let e12 = new L.RequestCookies(K.from(t4.headers));
                      eU(t4, e12), p4.cookies = en.seal(e12);
                    }
                    return p4.cookies;
                  }, set cookies(value) {
                    p4.cookies = value;
                  }, get mutableCookies() {
                    if (!p4.mutableCookies) {
                      let e12 = function(e13, t5) {
                        let r4 = new L.RequestCookies(K.from(e13));
                        return ea.wrap(r4, t5);
                      }(t4.headers, o4 || (r3 ? d4 : void 0));
                      eU(t4, e12), p4.mutableCookies = e12;
                    }
                    return p4.mutableCookies;
                  }, get userspaceMutableCookies() {
                    return p4.userspaceMutableCookies || (p4.userspaceMutableCookies = function(e12) {
                      let t5 = new Proxy(e12, { get(e13, r4, n5) {
                        switch (r4) {
                          case "delete":
                            return function(...r5) {
                              return eo("cookies().delete"), e13.delete(...r5), t5;
                            };
                          case "set":
                            return function(...r5) {
                              return eo("cookies().set"), e13.set(...r5), t5;
                            };
                          default:
                            return U.get(e13, r4, n5);
                        }
                      } });
                      return t5;
                    }(this.mutableCookies)), p4.userspaceMutableCookies;
                  }, get draftMode() {
                    return p4.draftMode || (p4.draftMode = new eq(l4, t4, this.cookies, this.mutableCookies)), p4.draftMode;
                  }, renderResumeDataCache: s3 ?? null, isHmrRefresh: u4, serverComponentsHmrCache: c3 || globalThis.__serverComponentsHmrCache };
                }("action", h2, void 0, u3, {}, p3, c2, void 0, d3, false, void 0)), b3 = function({ page: e11, fallbackRouteParams: t4, renderOpts: r3, requestEndedState: n4, isPrefetchRequest: i3, buildId: a4, previouslyRevalidatedTags: o4 }) {
                  var s3;
                  let l4 = { isStaticGeneration: !r3.shouldWaitOnAllReady && !r3.supportsDynamicResponse && !r3.isDraftMode && !r3.isPossibleServerAction, page: e11, fallbackRouteParams: t4, route: (s3 = e11.split("/").reduce((e12, t5, r4, n5) => t5 ? "(" === t5[0] && t5.endsWith(")") || "@" === t5[0] || ("page" === t5 || "route" === t5) && r4 === n5.length - 1 ? e12 : e12 + "/" + t5 : e12, "")).startsWith("/") ? s3 : "/" + s3, incrementalCache: r3.incrementalCache || globalThis.__incrementalCache, cacheLifeProfiles: r3.cacheLifeProfiles, isRevalidate: r3.isRevalidate, isPrerendering: r3.nextExport, fetchCache: r3.fetchCache, isOnDemandRevalidate: r3.isOnDemandRevalidate, isDraftMode: r3.isDraftMode, requestEndedState: n4, isPrefetchRequest: i3, buildId: a4, reactLoadableManifest: (null == r3 ? void 0 : r3.reactLoadableManifest) || {}, assetPrefix: (null == r3 ? void 0 : r3.assetPrefix) || "", afterContext: function(e12) {
                    let { waitUntil: t5, onClose: r4, onAfterTaskError: n5 } = e12;
                    return new e2({ waitUntil: t5, onClose: r4, onTaskError: n5 });
                  }(r3), dynamicIOEnabled: r3.experimental.dynamicIO, dev: r3.dev ?? false, previouslyRevalidatedTags: o4, refreshTagsByCacheKind: function() {
                    let e12 = /* @__PURE__ */ new Map(), t5 = eW();
                    if (t5) for (let [r4, n5] of t5) "refreshTags" in n5 && e12.set(r4, e4(async () => n5.refreshTags()));
                    return e12;
                  }() };
                  return r3.store = l4, l4;
                }({ page: "/", fallbackRouteParams: null, renderOpts: { cacheLifeProfiles: null == (a3 = e10.request.nextConfig) || null == (n3 = a3.experimental) ? void 0 : n3.cacheLife, experimental: { isRoutePPREnabled: false, dynamicIO: false, authInterrupts: !!(null == (l3 = e10.request.nextConfig) || null == (o3 = l3.experimental) ? void 0 : o3.authInterrupts) }, supportsDynamicResponse: true, waitUntil: t3, onClose: r2.onClose.bind(r2), onAfterTaskError: void 0 }, requestEndedState: { ended: false }, isPrefetchRequest: h2.headers.has(G), buildId: s2 ?? "", previouslyRevalidatedTags: [] });
                return await ee.run(b3, () => et.run(g3, e10.handler, h2, f2));
              } finally {
                setTimeout(() => {
                  r2.dispatchClose();
                }, 0);
              }
            });
          }
          return e10.handler(h2, f2);
        })) && !(n2 instanceof Response)) throw Object.defineProperty(TypeError("Expected an instance of Response to be returned"), "__NEXT_ERROR_CODE", { value: "E567", enumerable: false, configurable: true });
        n2 && i2 && n2.headers.set("set-cookie", i2);
        let b2 = null == n2 ? void 0 : n2.headers.get("x-middleware-rewrite");
        if (n2 && b2 && (d2 || !a2)) {
          let t3 = new j(b2, { forceLocale: true, headers: e10.request.headers, nextConfig: e10.request.nextConfig });
          a2 || t3.host !== h2.nextUrl.host || (t3.buildId = s2 || t3.buildId, n2.headers.set("x-middleware-rewrite", String(t3)));
          let { url: r2, isRelative: i3 } = H(t3.toString(), o2.toString());
          !a2 && u2 && n2.headers.set("x-nextjs-rewrite", r2), d2 && i3 && (o2.pathname !== t3.pathname && n2.headers.set("x-nextjs-rewritten-path", t3.pathname), o2.search !== t3.search && n2.headers.set("x-nextjs-rewritten-query", t3.search.slice(1)));
        }
        let v2 = null == n2 ? void 0 : n2.headers.get("Location");
        if (n2 && v2 && !a2) {
          let t3 = new j(v2, { forceLocale: false, headers: e10.request.headers, nextConfig: e10.request.nextConfig });
          n2 = new Response(n2.body, n2), t3.host === o2.host && (t3.buildId = s2 || t3.buildId, n2.headers.set("Location", t3.toString())), u2 && (n2.headers.delete("Location"), n2.headers.set("x-nextjs-redirect", H(t3.toString(), o2.toString()).url));
        }
        let m2 = n2 || z.next(), _2 = m2.headers.get("x-middleware-override-headers"), w2 = [];
        if (_2) {
          for (let [e11, t3] of p2) m2.headers.set(`x-middleware-request-${e11}`, t3), w2.push(e11);
          w2.length > 0 && m2.headers.set("x-middleware-override-headers", _2 + "," + w2.join(","));
        }
        return { response: m2, waitUntil: ("internal" === f2[x].kind ? Promise.all(f2[x].promises).then(() => {
        }) : void 0) ?? Promise.resolve(), fetchMetrics: h2.fetchMetrics };
      }
      r(280), "undefined" == typeof URLPattern || URLPattern;
      var ta = r(815);
      /* @__PURE__ */ new WeakMap();
      let to = "function" == typeof ta.unstable_postpone;
      function ts(e10, t2) {
        return `Route ${e10} needs to bail out of prerendering at this point because it used ${t2}. React throws this special object to indicate where. It should not be caught by your own try/catch. Learn more: https://nextjs.org/docs/messages/ppr-caught-error`;
      }
      if (false === function(e10) {
        return e10.includes("needs to bail out of prerendering at this point because it used") && e10.includes("Learn more: https://nextjs.org/docs/messages/ppr-caught-error");
      }(ts("%%%", "^^^"))) throw Object.defineProperty(Error("Invariant: isDynamicPostpone misidentified a postpone reason. This is a bug in Next.js"), "__NEXT_ERROR_CODE", { value: "E296", enumerable: false, configurable: true });
      async function tl(e10) {
        let t2 = `${e10}/cdn-cgi/access/certs`, r2 = await fetch(t2);
        if (!r2.ok) throw Error(`Failed to fetch JWKS: ${r2.status}`);
        return (await r2.json()).keys[0];
      }
      async function tu(e10, t2, r2) {
        let [n2, i2, a2] = e10.split(".");
        JSON.parse(atob(n2.replace(/-/g, "+").replace(/_/g, "/")));
        let o2 = JSON.parse(atob(i2.replace(/-/g, "+").replace(/_/g, "/")));
        if (o2.exp && 1e3 * o2.exp < Date.now()) throw Error("Token expired");
        let s2 = await tl(t2);
        s2.alg = "RS256";
        let l2 = await crypto.subtle.importKey("jwk", s2, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]), u2 = Uint8Array.from(atob(a2.replace(/-/g, "+").replace(/_/g, "/")), (e11) => e11.charCodeAt(0)), c2 = new TextEncoder().encode(`${n2}.${i2}`);
        if (!await crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, l2, u2, c2)) throw Error("Invalid signature");
        if (o2.iss !== t2) throw Error("Invalid issuer");
        if (!(Array.isArray(o2.aud) ? o2.aud : [o2.aud]).includes(r2)) throw Error("Invalid audience");
        return o2;
      }
      async function tc(e10) {
        if (!e10.nextUrl.pathname.startsWith("/admin")) return z.next();
        let t2 = e10.headers.get("cf-access-jwt-assertion");
        if (!t2) return new z("Unauthorized", { status: 403 });
        try {
          let r2 = process.env.TEAM_DOMAIN, n2 = process.env.POLICY_AUD;
          if (!r2 || !n2) return new z("Unauthorized", { status: 403 });
          let i2 = await tu(t2, r2, n2), a2 = new Headers(e10.headers);
          return i2.email && a2.set("x-user-email", i2.email), i2.name && a2.set("x-user-name", i2.name), z.next({ request: { headers: a2 } });
        } catch (e11) {
          return console.error("JWT verification failed:", e11), new z("Unauthorized", { status: 403 });
        }
      }
      RegExp(`\\n\\s+at __next_metadata_boundary__[\\n\\s]`), RegExp(`\\n\\s+at __next_viewport_boundary__[\\n\\s]`), RegExp(`\\n\\s+at __next_outlet_boundary__[\\n\\s]`), /* @__PURE__ */ new WeakMap();
      let td = { matcher: ["/admin/:path*"] }, tp = (Object.values({ NOT_FOUND: 404, FORBIDDEN: 403, UNAUTHORIZED: 401 }), { ...i }), th = tp.middleware || tp.default, tg = "/middleware";
      if ("function" != typeof th) throw Object.defineProperty(Error(`The Middleware "${tg}" must export a \`middleware\` or a \`default\` function`), "__NEXT_ERROR_CODE", { value: "E120", enumerable: false, configurable: true });
      function tf(e10) {
        return ti({ ...e10, page: tg, handler: async (...e11) => {
          try {
            return await th(...e11);
          } catch (i2) {
            let t2 = e11[0], r2 = new URL(t2.url), n2 = r2.pathname + r2.search;
            throw await l(i2, { path: n2, method: t2.method, headers: Object.fromEntries(t2.headers.entries()) }, { routerKind: "Pages Router", routePath: "/middleware", routeType: "middleware", revalidateReason: void 0 }), i2;
          }
        } });
      }
    }, 521: (e) => {
      "use strict";
      e.exports = (init_node_async_hooks(), __toCommonJS(node_async_hooks_exports));
    }, 552: (e, t, r) => {
      "use strict";
      var n = r(356).Buffer;
      Object.defineProperty(t, "__esModule", { value: true }), !function(e2, t2) {
        for (var r2 in t2) Object.defineProperty(e2, r2, { enumerable: true, get: t2[r2] });
      }(t, { handleFetch: function() {
        return s;
      }, interceptFetch: function() {
        return l;
      }, reader: function() {
        return a;
      } });
      let i = r(201), a = { url: (e2) => e2.url, header: (e2, t2) => e2.headers.get(t2) };
      async function o(e2, t2) {
        let { url: r2, method: i2, headers: a2, body: o2, cache: s2, credentials: l2, integrity: u, mode: c, redirect: d, referrer: p, referrerPolicy: h } = t2;
        return { testData: e2, api: "fetch", request: { url: r2, method: i2, headers: [...Array.from(a2), ["next-test-stack", function() {
          let e3 = (Error().stack ?? "").split("\n");
          for (let t3 = 1; t3 < e3.length; t3++) if (e3[t3].length > 0) {
            e3 = e3.slice(t3);
            break;
          }
          return (e3 = (e3 = (e3 = e3.filter((e4) => !e4.includes("/next/dist/"))).slice(0, 5)).map((e4) => e4.replace("webpack-internal:///(rsc)/", "").trim())).join("    ");
        }()]], body: o2 ? n.from(await t2.arrayBuffer()).toString("base64") : null, cache: s2, credentials: l2, integrity: u, mode: c, redirect: d, referrer: p, referrerPolicy: h } };
      }
      async function s(e2, t2) {
        let r2 = (0, i.getTestReqInfo)(t2, a);
        if (!r2) return e2(t2);
        let { testData: s2, proxyPort: l2 } = r2, u = await o(s2, t2), c = await e2(`http://localhost:${l2}`, { method: "POST", body: JSON.stringify(u), next: { internal: true } });
        if (!c.ok) throw Object.defineProperty(Error(`Proxy request failed: ${c.status}`), "__NEXT_ERROR_CODE", { value: "E146", enumerable: false, configurable: true });
        let d = await c.json(), { api: p } = d;
        switch (p) {
          case "continue":
            return e2(t2);
          case "abort":
          case "unhandled":
            throw Object.defineProperty(Error(`Proxy request aborted [${t2.method} ${t2.url}]`), "__NEXT_ERROR_CODE", { value: "E145", enumerable: false, configurable: true });
        }
        let { status: h, headers: g, body: f } = d.response;
        return new Response(f ? n.from(f, "base64") : null, { status: h, headers: new Headers(g) });
      }
      function l(e2) {
        return r.g.fetch = function(t2, r2) {
          var n2;
          return (null == r2 || null == (n2 = r2.next) ? void 0 : n2.internal) ? e2(t2, r2) : s(e2, new Request(t2, r2));
        }, () => {
          r.g.fetch = e2;
        };
      }
    }, 724: (e) => {
      "use strict";
      var t = Object.defineProperty, r = Object.getOwnPropertyDescriptor, n = Object.getOwnPropertyNames, i = Object.prototype.hasOwnProperty, a = {};
      function o(e2) {
        var t2;
        let r2 = ["path" in e2 && e2.path && `Path=${e2.path}`, "expires" in e2 && (e2.expires || 0 === e2.expires) && `Expires=${("number" == typeof e2.expires ? new Date(e2.expires) : e2.expires).toUTCString()}`, "maxAge" in e2 && "number" == typeof e2.maxAge && `Max-Age=${e2.maxAge}`, "domain" in e2 && e2.domain && `Domain=${e2.domain}`, "secure" in e2 && e2.secure && "Secure", "httpOnly" in e2 && e2.httpOnly && "HttpOnly", "sameSite" in e2 && e2.sameSite && `SameSite=${e2.sameSite}`, "partitioned" in e2 && e2.partitioned && "Partitioned", "priority" in e2 && e2.priority && `Priority=${e2.priority}`].filter(Boolean), n2 = `${e2.name}=${encodeURIComponent(null != (t2 = e2.value) ? t2 : "")}`;
        return 0 === r2.length ? n2 : `${n2}; ${r2.join("; ")}`;
      }
      function s(e2) {
        let t2 = /* @__PURE__ */ new Map();
        for (let r2 of e2.split(/; */)) {
          if (!r2) continue;
          let e3 = r2.indexOf("=");
          if (-1 === e3) {
            t2.set(r2, "true");
            continue;
          }
          let [n2, i2] = [r2.slice(0, e3), r2.slice(e3 + 1)];
          try {
            t2.set(n2, decodeURIComponent(null != i2 ? i2 : "true"));
          } catch {
          }
        }
        return t2;
      }
      function l(e2) {
        if (!e2) return;
        let [[t2, r2], ...n2] = s(e2), { domain: i2, expires: a2, httponly: o2, maxage: l2, path: d2, samesite: p2, secure: h, partitioned: g, priority: f } = Object.fromEntries(n2.map(([e3, t3]) => [e3.toLowerCase().replace(/-/g, ""), t3]));
        {
          var b, v, m = { name: t2, value: decodeURIComponent(r2), domain: i2, ...a2 && { expires: new Date(a2) }, ...o2 && { httpOnly: true }, ..."string" == typeof l2 && { maxAge: Number(l2) }, path: d2, ...p2 && { sameSite: u.includes(b = (b = p2).toLowerCase()) ? b : void 0 }, ...h && { secure: true }, ...f && { priority: c.includes(v = (v = f).toLowerCase()) ? v : void 0 }, ...g && { partitioned: true } };
          let e3 = {};
          for (let t3 in m) m[t3] && (e3[t3] = m[t3]);
          return e3;
        }
      }
      ((e2, r2) => {
        for (var n2 in r2) t(e2, n2, { get: r2[n2], enumerable: true });
      })(a, { RequestCookies: () => d, ResponseCookies: () => p, parseCookie: () => s, parseSetCookie: () => l, stringifyCookie: () => o }), e.exports = ((e2, a2, o2, s2) => {
        if (a2 && "object" == typeof a2 || "function" == typeof a2) for (let l2 of n(a2)) i.call(e2, l2) || l2 === o2 || t(e2, l2, { get: () => a2[l2], enumerable: !(s2 = r(a2, l2)) || s2.enumerable });
        return e2;
      })(t({}, "__esModule", { value: true }), a);
      var u = ["strict", "lax", "none"], c = ["low", "medium", "high"], d = class {
        constructor(e2) {
          this._parsed = /* @__PURE__ */ new Map(), this._headers = e2;
          let t2 = e2.get("cookie");
          if (t2) for (let [e3, r2] of s(t2)) this._parsed.set(e3, { name: e3, value: r2 });
        }
        [Symbol.iterator]() {
          return this._parsed[Symbol.iterator]();
        }
        get size() {
          return this._parsed.size;
        }
        get(...e2) {
          let t2 = "string" == typeof e2[0] ? e2[0] : e2[0].name;
          return this._parsed.get(t2);
        }
        getAll(...e2) {
          var t2;
          let r2 = Array.from(this._parsed);
          if (!e2.length) return r2.map(([e3, t3]) => t3);
          let n2 = "string" == typeof e2[0] ? e2[0] : null == (t2 = e2[0]) ? void 0 : t2.name;
          return r2.filter(([e3]) => e3 === n2).map(([e3, t3]) => t3);
        }
        has(e2) {
          return this._parsed.has(e2);
        }
        set(...e2) {
          let [t2, r2] = 1 === e2.length ? [e2[0].name, e2[0].value] : e2, n2 = this._parsed;
          return n2.set(t2, { name: t2, value: r2 }), this._headers.set("cookie", Array.from(n2).map(([e3, t3]) => o(t3)).join("; ")), this;
        }
        delete(e2) {
          let t2 = this._parsed, r2 = Array.isArray(e2) ? e2.map((e3) => t2.delete(e3)) : t2.delete(e2);
          return this._headers.set("cookie", Array.from(t2).map(([e3, t3]) => o(t3)).join("; ")), r2;
        }
        clear() {
          return this.delete(Array.from(this._parsed.keys())), this;
        }
        [Symbol.for("edge-runtime.inspect.custom")]() {
          return `RequestCookies ${JSON.stringify(Object.fromEntries(this._parsed))}`;
        }
        toString() {
          return [...this._parsed.values()].map((e2) => `${e2.name}=${encodeURIComponent(e2.value)}`).join("; ");
        }
      }, p = class {
        constructor(e2) {
          var t2, r2, n2;
          this._parsed = /* @__PURE__ */ new Map(), this._headers = e2;
          let i2 = null != (n2 = null != (r2 = null == (t2 = e2.getSetCookie) ? void 0 : t2.call(e2)) ? r2 : e2.get("set-cookie")) ? n2 : [];
          for (let e3 of Array.isArray(i2) ? i2 : function(e4) {
            if (!e4) return [];
            var t3, r3, n3, i3, a2, o2 = [], s2 = 0;
            function l2() {
              for (; s2 < e4.length && /\s/.test(e4.charAt(s2)); ) s2 += 1;
              return s2 < e4.length;
            }
            for (; s2 < e4.length; ) {
              for (t3 = s2, a2 = false; l2(); ) if ("," === (r3 = e4.charAt(s2))) {
                for (n3 = s2, s2 += 1, l2(), i3 = s2; s2 < e4.length && "=" !== (r3 = e4.charAt(s2)) && ";" !== r3 && "," !== r3; ) s2 += 1;
                s2 < e4.length && "=" === e4.charAt(s2) ? (a2 = true, s2 = i3, o2.push(e4.substring(t3, n3)), t3 = s2) : s2 = n3 + 1;
              } else s2 += 1;
              (!a2 || s2 >= e4.length) && o2.push(e4.substring(t3, e4.length));
            }
            return o2;
          }(i2)) {
            let t3 = l(e3);
            t3 && this._parsed.set(t3.name, t3);
          }
        }
        get(...e2) {
          let t2 = "string" == typeof e2[0] ? e2[0] : e2[0].name;
          return this._parsed.get(t2);
        }
        getAll(...e2) {
          var t2;
          let r2 = Array.from(this._parsed.values());
          if (!e2.length) return r2;
          let n2 = "string" == typeof e2[0] ? e2[0] : null == (t2 = e2[0]) ? void 0 : t2.name;
          return r2.filter((e3) => e3.name === n2);
        }
        has(e2) {
          return this._parsed.has(e2);
        }
        set(...e2) {
          let [t2, r2, n2] = 1 === e2.length ? [e2[0].name, e2[0].value, e2[0]] : e2, i2 = this._parsed;
          return i2.set(t2, function(e3 = { name: "", value: "" }) {
            return "number" == typeof e3.expires && (e3.expires = new Date(e3.expires)), e3.maxAge && (e3.expires = new Date(Date.now() + 1e3 * e3.maxAge)), (null === e3.path || void 0 === e3.path) && (e3.path = "/"), e3;
          }({ name: t2, value: r2, ...n2 })), function(e3, t3) {
            for (let [, r3] of (t3.delete("set-cookie"), e3)) {
              let e4 = o(r3);
              t3.append("set-cookie", e4);
            }
          }(i2, this._headers), this;
        }
        delete(...e2) {
          let [t2, r2] = "string" == typeof e2[0] ? [e2[0]] : [e2[0].name, e2[0]];
          return this.set({ ...r2, name: t2, value: "", expires: /* @__PURE__ */ new Date(0) });
        }
        [Symbol.for("edge-runtime.inspect.custom")]() {
          return `ResponseCookies ${JSON.stringify(Object.fromEntries(this._parsed))}`;
        }
        toString() {
          return [...this._parsed.values()].map(o).join("; ");
        }
      };
    }, 802: (e) => {
      (() => {
        "use strict";
        var t = { 993: (e2) => {
          var t2 = Object.prototype.hasOwnProperty, r2 = "~";
          function n2() {
          }
          function i2(e3, t3, r3) {
            this.fn = e3, this.context = t3, this.once = r3 || false;
          }
          function a(e3, t3, n3, a2, o2) {
            if ("function" != typeof n3) throw TypeError("The listener must be a function");
            var s2 = new i2(n3, a2 || e3, o2), l = r2 ? r2 + t3 : t3;
            return e3._events[l] ? e3._events[l].fn ? e3._events[l] = [e3._events[l], s2] : e3._events[l].push(s2) : (e3._events[l] = s2, e3._eventsCount++), e3;
          }
          function o(e3, t3) {
            0 == --e3._eventsCount ? e3._events = new n2() : delete e3._events[t3];
          }
          function s() {
            this._events = new n2(), this._eventsCount = 0;
          }
          Object.create && (n2.prototype = /* @__PURE__ */ Object.create(null), new n2().__proto__ || (r2 = false)), s.prototype.eventNames = function() {
            var e3, n3, i3 = [];
            if (0 === this._eventsCount) return i3;
            for (n3 in e3 = this._events) t2.call(e3, n3) && i3.push(r2 ? n3.slice(1) : n3);
            return Object.getOwnPropertySymbols ? i3.concat(Object.getOwnPropertySymbols(e3)) : i3;
          }, s.prototype.listeners = function(e3) {
            var t3 = r2 ? r2 + e3 : e3, n3 = this._events[t3];
            if (!n3) return [];
            if (n3.fn) return [n3.fn];
            for (var i3 = 0, a2 = n3.length, o2 = Array(a2); i3 < a2; i3++) o2[i3] = n3[i3].fn;
            return o2;
          }, s.prototype.listenerCount = function(e3) {
            var t3 = r2 ? r2 + e3 : e3, n3 = this._events[t3];
            return n3 ? n3.fn ? 1 : n3.length : 0;
          }, s.prototype.emit = function(e3, t3, n3, i3, a2, o2) {
            var s2 = r2 ? r2 + e3 : e3;
            if (!this._events[s2]) return false;
            var l, u, c = this._events[s2], d = arguments.length;
            if (c.fn) {
              switch (c.once && this.removeListener(e3, c.fn, void 0, true), d) {
                case 1:
                  return c.fn.call(c.context), true;
                case 2:
                  return c.fn.call(c.context, t3), true;
                case 3:
                  return c.fn.call(c.context, t3, n3), true;
                case 4:
                  return c.fn.call(c.context, t3, n3, i3), true;
                case 5:
                  return c.fn.call(c.context, t3, n3, i3, a2), true;
                case 6:
                  return c.fn.call(c.context, t3, n3, i3, a2, o2), true;
              }
              for (u = 1, l = Array(d - 1); u < d; u++) l[u - 1] = arguments[u];
              c.fn.apply(c.context, l);
            } else {
              var p, h = c.length;
              for (u = 0; u < h; u++) switch (c[u].once && this.removeListener(e3, c[u].fn, void 0, true), d) {
                case 1:
                  c[u].fn.call(c[u].context);
                  break;
                case 2:
                  c[u].fn.call(c[u].context, t3);
                  break;
                case 3:
                  c[u].fn.call(c[u].context, t3, n3);
                  break;
                case 4:
                  c[u].fn.call(c[u].context, t3, n3, i3);
                  break;
                default:
                  if (!l) for (p = 1, l = Array(d - 1); p < d; p++) l[p - 1] = arguments[p];
                  c[u].fn.apply(c[u].context, l);
              }
            }
            return true;
          }, s.prototype.on = function(e3, t3, r3) {
            return a(this, e3, t3, r3, false);
          }, s.prototype.once = function(e3, t3, r3) {
            return a(this, e3, t3, r3, true);
          }, s.prototype.removeListener = function(e3, t3, n3, i3) {
            var a2 = r2 ? r2 + e3 : e3;
            if (!this._events[a2]) return this;
            if (!t3) return o(this, a2), this;
            var s2 = this._events[a2];
            if (s2.fn) s2.fn !== t3 || i3 && !s2.once || n3 && s2.context !== n3 || o(this, a2);
            else {
              for (var l = 0, u = [], c = s2.length; l < c; l++) (s2[l].fn !== t3 || i3 && !s2[l].once || n3 && s2[l].context !== n3) && u.push(s2[l]);
              u.length ? this._events[a2] = 1 === u.length ? u[0] : u : o(this, a2);
            }
            return this;
          }, s.prototype.removeAllListeners = function(e3) {
            var t3;
            return e3 ? (t3 = r2 ? r2 + e3 : e3, this._events[t3] && o(this, t3)) : (this._events = new n2(), this._eventsCount = 0), this;
          }, s.prototype.off = s.prototype.removeListener, s.prototype.addListener = s.prototype.on, s.prefixed = r2, s.EventEmitter = s, e2.exports = s;
        }, 213: (e2) => {
          e2.exports = (e3, t2) => (t2 = t2 || (() => {
          }), e3.then((e4) => new Promise((e5) => {
            e5(t2());
          }).then(() => e4), (e4) => new Promise((e5) => {
            e5(t2());
          }).then(() => {
            throw e4;
          })));
        }, 574: (e2, t2) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.default = function(e3, t3, r2) {
            let n2 = 0, i2 = e3.length;
            for (; i2 > 0; ) {
              let a = i2 / 2 | 0, o = n2 + a;
              0 >= r2(e3[o], t3) ? (n2 = ++o, i2 -= a + 1) : i2 = a;
            }
            return n2;
          };
        }, 821: (e2, t2, r2) => {
          Object.defineProperty(t2, "__esModule", { value: true });
          let n2 = r2(574);
          class i2 {
            constructor() {
              this._queue = [];
            }
            enqueue(e3, t3) {
              let r3 = { priority: (t3 = Object.assign({ priority: 0 }, t3)).priority, run: e3 };
              if (this.size && this._queue[this.size - 1].priority >= t3.priority) return void this._queue.push(r3);
              let i3 = n2.default(this._queue, r3, (e4, t4) => t4.priority - e4.priority);
              this._queue.splice(i3, 0, r3);
            }
            dequeue() {
              let e3 = this._queue.shift();
              return null == e3 ? void 0 : e3.run;
            }
            filter(e3) {
              return this._queue.filter((t3) => t3.priority === e3.priority).map((e4) => e4.run);
            }
            get size() {
              return this._queue.length;
            }
          }
          t2.default = i2;
        }, 816: (e2, t2, r2) => {
          let n2 = r2(213);
          class i2 extends Error {
            constructor(e3) {
              super(e3), this.name = "TimeoutError";
            }
          }
          let a = (e3, t3, r3) => new Promise((a2, o) => {
            if ("number" != typeof t3 || t3 < 0) throw TypeError("Expected `milliseconds` to be a positive number");
            if (t3 === 1 / 0) return void a2(e3);
            let s = setTimeout(() => {
              if ("function" == typeof r3) {
                try {
                  a2(r3());
                } catch (e4) {
                  o(e4);
                }
                return;
              }
              let n3 = "string" == typeof r3 ? r3 : `Promise timed out after ${t3} milliseconds`, s2 = r3 instanceof Error ? r3 : new i2(n3);
              "function" == typeof e3.cancel && e3.cancel(), o(s2);
            }, t3);
            n2(e3.then(a2, o), () => {
              clearTimeout(s);
            });
          });
          e2.exports = a, e2.exports.default = a, e2.exports.TimeoutError = i2;
        } }, r = {};
        function n(e2) {
          var i2 = r[e2];
          if (void 0 !== i2) return i2.exports;
          var a = r[e2] = { exports: {} }, o = true;
          try {
            t[e2](a, a.exports, n), o = false;
          } finally {
            o && delete r[e2];
          }
          return a.exports;
        }
        n.ab = "//";
        var i = {};
        (() => {
          Object.defineProperty(i, "__esModule", { value: true });
          let e2 = n(993), t2 = n(816), r2 = n(821), a = () => {
          }, o = new t2.TimeoutError();
          class s extends e2 {
            constructor(e3) {
              var t3, n2, i2, o2;
              if (super(), this._intervalCount = 0, this._intervalEnd = 0, this._pendingCount = 0, this._resolveEmpty = a, this._resolveIdle = a, !("number" == typeof (e3 = Object.assign({ carryoverConcurrencyCount: false, intervalCap: 1 / 0, interval: 0, concurrency: 1 / 0, autoStart: true, queueClass: r2.default }, e3)).intervalCap && e3.intervalCap >= 1)) throw TypeError(`Expected \`intervalCap\` to be a number from 1 and up, got \`${null != (n2 = null == (t3 = e3.intervalCap) ? void 0 : t3.toString()) ? n2 : ""}\` (${typeof e3.intervalCap})`);
              if (void 0 === e3.interval || !(Number.isFinite(e3.interval) && e3.interval >= 0)) throw TypeError(`Expected \`interval\` to be a finite number >= 0, got \`${null != (o2 = null == (i2 = e3.interval) ? void 0 : i2.toString()) ? o2 : ""}\` (${typeof e3.interval})`);
              this._carryoverConcurrencyCount = e3.carryoverConcurrencyCount, this._isIntervalIgnored = e3.intervalCap === 1 / 0 || 0 === e3.interval, this._intervalCap = e3.intervalCap, this._interval = e3.interval, this._queue = new e3.queueClass(), this._queueClass = e3.queueClass, this.concurrency = e3.concurrency, this._timeout = e3.timeout, this._throwOnTimeout = true === e3.throwOnTimeout, this._isPaused = false === e3.autoStart;
            }
            get _doesIntervalAllowAnother() {
              return this._isIntervalIgnored || this._intervalCount < this._intervalCap;
            }
            get _doesConcurrentAllowAnother() {
              return this._pendingCount < this._concurrency;
            }
            _next() {
              this._pendingCount--, this._tryToStartAnother(), this.emit("next");
            }
            _resolvePromises() {
              this._resolveEmpty(), this._resolveEmpty = a, 0 === this._pendingCount && (this._resolveIdle(), this._resolveIdle = a, this.emit("idle"));
            }
            _onResumeInterval() {
              this._onInterval(), this._initializeIntervalIfNeeded(), this._timeoutId = void 0;
            }
            _isIntervalPaused() {
              let e3 = Date.now();
              if (void 0 === this._intervalId) {
                let t3 = this._intervalEnd - e3;
                if (!(t3 < 0)) return void 0 === this._timeoutId && (this._timeoutId = setTimeout(() => {
                  this._onResumeInterval();
                }, t3)), true;
                this._intervalCount = this._carryoverConcurrencyCount ? this._pendingCount : 0;
              }
              return false;
            }
            _tryToStartAnother() {
              if (0 === this._queue.size) return this._intervalId && clearInterval(this._intervalId), this._intervalId = void 0, this._resolvePromises(), false;
              if (!this._isPaused) {
                let e3 = !this._isIntervalPaused();
                if (this._doesIntervalAllowAnother && this._doesConcurrentAllowAnother) {
                  let t3 = this._queue.dequeue();
                  return !!t3 && (this.emit("active"), t3(), e3 && this._initializeIntervalIfNeeded(), true);
                }
              }
              return false;
            }
            _initializeIntervalIfNeeded() {
              this._isIntervalIgnored || void 0 !== this._intervalId || (this._intervalId = setInterval(() => {
                this._onInterval();
              }, this._interval), this._intervalEnd = Date.now() + this._interval);
            }
            _onInterval() {
              0 === this._intervalCount && 0 === this._pendingCount && this._intervalId && (clearInterval(this._intervalId), this._intervalId = void 0), this._intervalCount = this._carryoverConcurrencyCount ? this._pendingCount : 0, this._processQueue();
            }
            _processQueue() {
              for (; this._tryToStartAnother(); ) ;
            }
            get concurrency() {
              return this._concurrency;
            }
            set concurrency(e3) {
              if (!("number" == typeof e3 && e3 >= 1)) throw TypeError(`Expected \`concurrency\` to be a number from 1 and up, got \`${e3}\` (${typeof e3})`);
              this._concurrency = e3, this._processQueue();
            }
            async add(e3, r3 = {}) {
              return new Promise((n2, i2) => {
                let a2 = async () => {
                  this._pendingCount++, this._intervalCount++;
                  try {
                    let a3 = void 0 === this._timeout && void 0 === r3.timeout ? e3() : t2.default(Promise.resolve(e3()), void 0 === r3.timeout ? this._timeout : r3.timeout, () => {
                      (void 0 === r3.throwOnTimeout ? this._throwOnTimeout : r3.throwOnTimeout) && i2(o);
                    });
                    n2(await a3);
                  } catch (e4) {
                    i2(e4);
                  }
                  this._next();
                };
                this._queue.enqueue(a2, r3), this._tryToStartAnother(), this.emit("add");
              });
            }
            async addAll(e3, t3) {
              return Promise.all(e3.map(async (e4) => this.add(e4, t3)));
            }
            start() {
              return this._isPaused && (this._isPaused = false, this._processQueue()), this;
            }
            pause() {
              this._isPaused = true;
            }
            clear() {
              this._queue = new this._queueClass();
            }
            async onEmpty() {
              if (0 !== this._queue.size) return new Promise((e3) => {
                let t3 = this._resolveEmpty;
                this._resolveEmpty = () => {
                  t3(), e3();
                };
              });
            }
            async onIdle() {
              if (0 !== this._pendingCount || 0 !== this._queue.size) return new Promise((e3) => {
                let t3 = this._resolveIdle;
                this._resolveIdle = () => {
                  t3(), e3();
                };
              });
            }
            get size() {
              return this._queue.size;
            }
            sizeBy(e3) {
              return this._queue.filter(e3).length;
            }
            get pending() {
              return this._pendingCount;
            }
            get isPaused() {
              return this._isPaused;
            }
            get timeout() {
              return this._timeout;
            }
            set timeout(e3) {
              this._timeout = e3;
            }
          }
          i.default = s;
        })(), e.exports = i;
      })();
    }, 815: (e, t, r) => {
      "use strict";
      e.exports = r(35);
    }, 890: (e) => {
      (() => {
        "use strict";
        "undefined" != typeof __nccwpck_require__ && (__nccwpck_require__.ab = "//");
        var t = {};
        (() => {
          t.parse = function(t2, r2) {
            if ("string" != typeof t2) throw TypeError("argument str must be a string");
            for (var i2 = {}, a = t2.split(n), o = (r2 || {}).decode || e2, s = 0; s < a.length; s++) {
              var l = a[s], u = l.indexOf("=");
              if (!(u < 0)) {
                var c = l.substr(0, u).trim(), d = l.substr(++u, l.length).trim();
                '"' == d[0] && (d = d.slice(1, -1)), void 0 == i2[c] && (i2[c] = function(e3, t3) {
                  try {
                    return t3(e3);
                  } catch (t4) {
                    return e3;
                  }
                }(d, o));
              }
            }
            return i2;
          }, t.serialize = function(e3, t2, n2) {
            var a = n2 || {}, o = a.encode || r;
            if ("function" != typeof o) throw TypeError("option encode is invalid");
            if (!i.test(e3)) throw TypeError("argument name is invalid");
            var s = o(t2);
            if (s && !i.test(s)) throw TypeError("argument val is invalid");
            var l = e3 + "=" + s;
            if (null != a.maxAge) {
              var u = a.maxAge - 0;
              if (isNaN(u) || !isFinite(u)) throw TypeError("option maxAge is invalid");
              l += "; Max-Age=" + Math.floor(u);
            }
            if (a.domain) {
              if (!i.test(a.domain)) throw TypeError("option domain is invalid");
              l += "; Domain=" + a.domain;
            }
            if (a.path) {
              if (!i.test(a.path)) throw TypeError("option path is invalid");
              l += "; Path=" + a.path;
            }
            if (a.expires) {
              if ("function" != typeof a.expires.toUTCString) throw TypeError("option expires is invalid");
              l += "; Expires=" + a.expires.toUTCString();
            }
            if (a.httpOnly && (l += "; HttpOnly"), a.secure && (l += "; Secure"), a.sameSite) switch ("string" == typeof a.sameSite ? a.sameSite.toLowerCase() : a.sameSite) {
              case true:
              case "strict":
                l += "; SameSite=Strict";
                break;
              case "lax":
                l += "; SameSite=Lax";
                break;
              case "none":
                l += "; SameSite=None";
                break;
              default:
                throw TypeError("option sameSite is invalid");
            }
            return l;
          };
          var e2 = decodeURIComponent, r = encodeURIComponent, n = /; */, i = /^[\u0009\u0020-\u007e\u0080-\u00ff]+$/;
        })(), e.exports = t;
      })();
    }, 905: (e, t, r) => {
      "use strict";
      Object.defineProperty(t, "__esModule", { value: true }), !function(e2, t2) {
        for (var r2 in t2) Object.defineProperty(e2, r2, { enumerable: true, get: t2[r2] });
      }(t, { interceptTestApis: function() {
        return a;
      }, wrapRequestHandler: function() {
        return o;
      } });
      let n = r(201), i = r(552);
      function a() {
        return (0, i.interceptFetch)(r.g.fetch);
      }
      function o(e2) {
        return (t2, r2) => (0, n.withRequest)(t2, i.reader, () => e2(t2, r2));
      }
    }, 956: (e, t, r) => {
      (() => {
        "use strict";
        var t2 = { 491: (e2, t3, r2) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.ContextAPI = void 0;
          let n2 = r2(223), i2 = r2(172), a2 = r2(930), o = "context", s = new n2.NoopContextManager();
          class l {
            constructor() {
            }
            static getInstance() {
              return this._instance || (this._instance = new l()), this._instance;
            }
            setGlobalContextManager(e3) {
              return (0, i2.registerGlobal)(o, e3, a2.DiagAPI.instance());
            }
            active() {
              return this._getContextManager().active();
            }
            with(e3, t4, r3, ...n3) {
              return this._getContextManager().with(e3, t4, r3, ...n3);
            }
            bind(e3, t4) {
              return this._getContextManager().bind(e3, t4);
            }
            _getContextManager() {
              return (0, i2.getGlobal)(o) || s;
            }
            disable() {
              this._getContextManager().disable(), (0, i2.unregisterGlobal)(o, a2.DiagAPI.instance());
            }
          }
          t3.ContextAPI = l;
        }, 930: (e2, t3, r2) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.DiagAPI = void 0;
          let n2 = r2(56), i2 = r2(912), a2 = r2(957), o = r2(172);
          class s {
            constructor() {
              function e3(e4) {
                return function(...t5) {
                  let r3 = (0, o.getGlobal)("diag");
                  if (r3) return r3[e4](...t5);
                };
              }
              let t4 = this;
              t4.setLogger = (e4, r3 = { logLevel: a2.DiagLogLevel.INFO }) => {
                var n3, s2, l;
                if (e4 === t4) {
                  let e5 = Error("Cannot use diag as the logger for itself. Please use a DiagLogger implementation like ConsoleDiagLogger or a custom implementation");
                  return t4.error(null != (n3 = e5.stack) ? n3 : e5.message), false;
                }
                "number" == typeof r3 && (r3 = { logLevel: r3 });
                let u = (0, o.getGlobal)("diag"), c = (0, i2.createLogLevelDiagLogger)(null != (s2 = r3.logLevel) ? s2 : a2.DiagLogLevel.INFO, e4);
                if (u && !r3.suppressOverrideMessage) {
                  let e5 = null != (l = Error().stack) ? l : "<failed to generate stacktrace>";
                  u.warn(`Current logger will be overwritten from ${e5}`), c.warn(`Current logger will overwrite one already registered from ${e5}`);
                }
                return (0, o.registerGlobal)("diag", c, t4, true);
              }, t4.disable = () => {
                (0, o.unregisterGlobal)("diag", t4);
              }, t4.createComponentLogger = (e4) => new n2.DiagComponentLogger(e4), t4.verbose = e3("verbose"), t4.debug = e3("debug"), t4.info = e3("info"), t4.warn = e3("warn"), t4.error = e3("error");
            }
            static instance() {
              return this._instance || (this._instance = new s()), this._instance;
            }
          }
          t3.DiagAPI = s;
        }, 653: (e2, t3, r2) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.MetricsAPI = void 0;
          let n2 = r2(660), i2 = r2(172), a2 = r2(930), o = "metrics";
          class s {
            constructor() {
            }
            static getInstance() {
              return this._instance || (this._instance = new s()), this._instance;
            }
            setGlobalMeterProvider(e3) {
              return (0, i2.registerGlobal)(o, e3, a2.DiagAPI.instance());
            }
            getMeterProvider() {
              return (0, i2.getGlobal)(o) || n2.NOOP_METER_PROVIDER;
            }
            getMeter(e3, t4, r3) {
              return this.getMeterProvider().getMeter(e3, t4, r3);
            }
            disable() {
              (0, i2.unregisterGlobal)(o, a2.DiagAPI.instance());
            }
          }
          t3.MetricsAPI = s;
        }, 181: (e2, t3, r2) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.PropagationAPI = void 0;
          let n2 = r2(172), i2 = r2(874), a2 = r2(194), o = r2(277), s = r2(369), l = r2(930), u = "propagation", c = new i2.NoopTextMapPropagator();
          class d {
            constructor() {
              this.createBaggage = s.createBaggage, this.getBaggage = o.getBaggage, this.getActiveBaggage = o.getActiveBaggage, this.setBaggage = o.setBaggage, this.deleteBaggage = o.deleteBaggage;
            }
            static getInstance() {
              return this._instance || (this._instance = new d()), this._instance;
            }
            setGlobalPropagator(e3) {
              return (0, n2.registerGlobal)(u, e3, l.DiagAPI.instance());
            }
            inject(e3, t4, r3 = a2.defaultTextMapSetter) {
              return this._getGlobalPropagator().inject(e3, t4, r3);
            }
            extract(e3, t4, r3 = a2.defaultTextMapGetter) {
              return this._getGlobalPropagator().extract(e3, t4, r3);
            }
            fields() {
              return this._getGlobalPropagator().fields();
            }
            disable() {
              (0, n2.unregisterGlobal)(u, l.DiagAPI.instance());
            }
            _getGlobalPropagator() {
              return (0, n2.getGlobal)(u) || c;
            }
          }
          t3.PropagationAPI = d;
        }, 997: (e2, t3, r2) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.TraceAPI = void 0;
          let n2 = r2(172), i2 = r2(846), a2 = r2(139), o = r2(607), s = r2(930), l = "trace";
          class u {
            constructor() {
              this._proxyTracerProvider = new i2.ProxyTracerProvider(), this.wrapSpanContext = a2.wrapSpanContext, this.isSpanContextValid = a2.isSpanContextValid, this.deleteSpan = o.deleteSpan, this.getSpan = o.getSpan, this.getActiveSpan = o.getActiveSpan, this.getSpanContext = o.getSpanContext, this.setSpan = o.setSpan, this.setSpanContext = o.setSpanContext;
            }
            static getInstance() {
              return this._instance || (this._instance = new u()), this._instance;
            }
            setGlobalTracerProvider(e3) {
              let t4 = (0, n2.registerGlobal)(l, this._proxyTracerProvider, s.DiagAPI.instance());
              return t4 && this._proxyTracerProvider.setDelegate(e3), t4;
            }
            getTracerProvider() {
              return (0, n2.getGlobal)(l) || this._proxyTracerProvider;
            }
            getTracer(e3, t4) {
              return this.getTracerProvider().getTracer(e3, t4);
            }
            disable() {
              (0, n2.unregisterGlobal)(l, s.DiagAPI.instance()), this._proxyTracerProvider = new i2.ProxyTracerProvider();
            }
          }
          t3.TraceAPI = u;
        }, 277: (e2, t3, r2) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.deleteBaggage = t3.setBaggage = t3.getActiveBaggage = t3.getBaggage = void 0;
          let n2 = r2(491), i2 = (0, r2(780).createContextKey)("OpenTelemetry Baggage Key");
          function a2(e3) {
            return e3.getValue(i2) || void 0;
          }
          t3.getBaggage = a2, t3.getActiveBaggage = function() {
            return a2(n2.ContextAPI.getInstance().active());
          }, t3.setBaggage = function(e3, t4) {
            return e3.setValue(i2, t4);
          }, t3.deleteBaggage = function(e3) {
            return e3.deleteValue(i2);
          };
        }, 993: (e2, t3) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.BaggageImpl = void 0;
          class r2 {
            constructor(e3) {
              this._entries = e3 ? new Map(e3) : /* @__PURE__ */ new Map();
            }
            getEntry(e3) {
              let t4 = this._entries.get(e3);
              if (t4) return Object.assign({}, t4);
            }
            getAllEntries() {
              return Array.from(this._entries.entries()).map(([e3, t4]) => [e3, t4]);
            }
            setEntry(e3, t4) {
              let n2 = new r2(this._entries);
              return n2._entries.set(e3, t4), n2;
            }
            removeEntry(e3) {
              let t4 = new r2(this._entries);
              return t4._entries.delete(e3), t4;
            }
            removeEntries(...e3) {
              let t4 = new r2(this._entries);
              for (let r3 of e3) t4._entries.delete(r3);
              return t4;
            }
            clear() {
              return new r2();
            }
          }
          t3.BaggageImpl = r2;
        }, 830: (e2, t3) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.baggageEntryMetadataSymbol = void 0, t3.baggageEntryMetadataSymbol = Symbol("BaggageEntryMetadata");
        }, 369: (e2, t3, r2) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.baggageEntryMetadataFromString = t3.createBaggage = void 0;
          let n2 = r2(930), i2 = r2(993), a2 = r2(830), o = n2.DiagAPI.instance();
          t3.createBaggage = function(e3 = {}) {
            return new i2.BaggageImpl(new Map(Object.entries(e3)));
          }, t3.baggageEntryMetadataFromString = function(e3) {
            return "string" != typeof e3 && (o.error(`Cannot create baggage metadata from unknown type: ${typeof e3}`), e3 = ""), { __TYPE__: a2.baggageEntryMetadataSymbol, toString: () => e3 };
          };
        }, 67: (e2, t3, r2) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.context = void 0, t3.context = r2(491).ContextAPI.getInstance();
        }, 223: (e2, t3, r2) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.NoopContextManager = void 0;
          let n2 = r2(780);
          class i2 {
            active() {
              return n2.ROOT_CONTEXT;
            }
            with(e3, t4, r3, ...n3) {
              return t4.call(r3, ...n3);
            }
            bind(e3, t4) {
              return t4;
            }
            enable() {
              return this;
            }
            disable() {
              return this;
            }
          }
          t3.NoopContextManager = i2;
        }, 780: (e2, t3) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.ROOT_CONTEXT = t3.createContextKey = void 0, t3.createContextKey = function(e3) {
            return Symbol.for(e3);
          };
          class r2 {
            constructor(e3) {
              let t4 = this;
              t4._currentContext = e3 ? new Map(e3) : /* @__PURE__ */ new Map(), t4.getValue = (e4) => t4._currentContext.get(e4), t4.setValue = (e4, n2) => {
                let i2 = new r2(t4._currentContext);
                return i2._currentContext.set(e4, n2), i2;
              }, t4.deleteValue = (e4) => {
                let n2 = new r2(t4._currentContext);
                return n2._currentContext.delete(e4), n2;
              };
            }
          }
          t3.ROOT_CONTEXT = new r2();
        }, 506: (e2, t3, r2) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.diag = void 0, t3.diag = r2(930).DiagAPI.instance();
        }, 56: (e2, t3, r2) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.DiagComponentLogger = void 0;
          let n2 = r2(172);
          class i2 {
            constructor(e3) {
              this._namespace = e3.namespace || "DiagComponentLogger";
            }
            debug(...e3) {
              return a2("debug", this._namespace, e3);
            }
            error(...e3) {
              return a2("error", this._namespace, e3);
            }
            info(...e3) {
              return a2("info", this._namespace, e3);
            }
            warn(...e3) {
              return a2("warn", this._namespace, e3);
            }
            verbose(...e3) {
              return a2("verbose", this._namespace, e3);
            }
          }
          function a2(e3, t4, r3) {
            let i3 = (0, n2.getGlobal)("diag");
            if (i3) return r3.unshift(t4), i3[e3](...r3);
          }
          t3.DiagComponentLogger = i2;
        }, 972: (e2, t3) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.DiagConsoleLogger = void 0;
          let r2 = [{ n: "error", c: "error" }, { n: "warn", c: "warn" }, { n: "info", c: "info" }, { n: "debug", c: "debug" }, { n: "verbose", c: "trace" }];
          class n2 {
            constructor() {
              for (let e3 = 0; e3 < r2.length; e3++) this[r2[e3].n] = /* @__PURE__ */ function(e4) {
                return function(...t4) {
                  if (console) {
                    let r3 = console[e4];
                    if ("function" != typeof r3 && (r3 = console.log), "function" == typeof r3) return r3.apply(console, t4);
                  }
                };
              }(r2[e3].c);
            }
          }
          t3.DiagConsoleLogger = n2;
        }, 912: (e2, t3, r2) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.createLogLevelDiagLogger = void 0;
          let n2 = r2(957);
          t3.createLogLevelDiagLogger = function(e3, t4) {
            function r3(r4, n3) {
              let i2 = t4[r4];
              return "function" == typeof i2 && e3 >= n3 ? i2.bind(t4) : function() {
              };
            }
            return e3 < n2.DiagLogLevel.NONE ? e3 = n2.DiagLogLevel.NONE : e3 > n2.DiagLogLevel.ALL && (e3 = n2.DiagLogLevel.ALL), t4 = t4 || {}, { error: r3("error", n2.DiagLogLevel.ERROR), warn: r3("warn", n2.DiagLogLevel.WARN), info: r3("info", n2.DiagLogLevel.INFO), debug: r3("debug", n2.DiagLogLevel.DEBUG), verbose: r3("verbose", n2.DiagLogLevel.VERBOSE) };
          };
        }, 957: (e2, t3) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.DiagLogLevel = void 0, function(e3) {
            e3[e3.NONE = 0] = "NONE", e3[e3.ERROR = 30] = "ERROR", e3[e3.WARN = 50] = "WARN", e3[e3.INFO = 60] = "INFO", e3[e3.DEBUG = 70] = "DEBUG", e3[e3.VERBOSE = 80] = "VERBOSE", e3[e3.ALL = 9999] = "ALL";
          }(t3.DiagLogLevel || (t3.DiagLogLevel = {}));
        }, 172: (e2, t3, r2) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.unregisterGlobal = t3.getGlobal = t3.registerGlobal = void 0;
          let n2 = r2(200), i2 = r2(521), a2 = r2(130), o = i2.VERSION.split(".")[0], s = Symbol.for(`opentelemetry.js.api.${o}`), l = n2._globalThis;
          t3.registerGlobal = function(e3, t4, r3, n3 = false) {
            var a3;
            let o2 = l[s] = null != (a3 = l[s]) ? a3 : { version: i2.VERSION };
            if (!n3 && o2[e3]) {
              let t5 = Error(`@opentelemetry/api: Attempted duplicate registration of API: ${e3}`);
              return r3.error(t5.stack || t5.message), false;
            }
            if (o2.version !== i2.VERSION) {
              let t5 = Error(`@opentelemetry/api: Registration of version v${o2.version} for ${e3} does not match previously registered API v${i2.VERSION}`);
              return r3.error(t5.stack || t5.message), false;
            }
            return o2[e3] = t4, r3.debug(`@opentelemetry/api: Registered a global for ${e3} v${i2.VERSION}.`), true;
          }, t3.getGlobal = function(e3) {
            var t4, r3;
            let n3 = null == (t4 = l[s]) ? void 0 : t4.version;
            if (n3 && (0, a2.isCompatible)(n3)) return null == (r3 = l[s]) ? void 0 : r3[e3];
          }, t3.unregisterGlobal = function(e3, t4) {
            t4.debug(`@opentelemetry/api: Unregistering a global for ${e3} v${i2.VERSION}.`);
            let r3 = l[s];
            r3 && delete r3[e3];
          };
        }, 130: (e2, t3, r2) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.isCompatible = t3._makeCompatibilityCheck = void 0;
          let n2 = r2(521), i2 = /^(\d+)\.(\d+)\.(\d+)(-(.+))?$/;
          function a2(e3) {
            let t4 = /* @__PURE__ */ new Set([e3]), r3 = /* @__PURE__ */ new Set(), n3 = e3.match(i2);
            if (!n3) return () => false;
            let a3 = { major: +n3[1], minor: +n3[2], patch: +n3[3], prerelease: n3[4] };
            if (null != a3.prerelease) return function(t5) {
              return t5 === e3;
            };
            function o(e4) {
              return r3.add(e4), false;
            }
            return function(e4) {
              if (t4.has(e4)) return true;
              if (r3.has(e4)) return false;
              let n4 = e4.match(i2);
              if (!n4) return o(e4);
              let s = { major: +n4[1], minor: +n4[2], patch: +n4[3], prerelease: n4[4] };
              if (null != s.prerelease || a3.major !== s.major) return o(e4);
              if (0 === a3.major) return a3.minor === s.minor && a3.patch <= s.patch ? (t4.add(e4), true) : o(e4);
              return a3.minor <= s.minor ? (t4.add(e4), true) : o(e4);
            };
          }
          t3._makeCompatibilityCheck = a2, t3.isCompatible = a2(n2.VERSION);
        }, 886: (e2, t3, r2) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.metrics = void 0, t3.metrics = r2(653).MetricsAPI.getInstance();
        }, 901: (e2, t3) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.ValueType = void 0, function(e3) {
            e3[e3.INT = 0] = "INT", e3[e3.DOUBLE = 1] = "DOUBLE";
          }(t3.ValueType || (t3.ValueType = {}));
        }, 102: (e2, t3) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.createNoopMeter = t3.NOOP_OBSERVABLE_UP_DOWN_COUNTER_METRIC = t3.NOOP_OBSERVABLE_GAUGE_METRIC = t3.NOOP_OBSERVABLE_COUNTER_METRIC = t3.NOOP_UP_DOWN_COUNTER_METRIC = t3.NOOP_HISTOGRAM_METRIC = t3.NOOP_COUNTER_METRIC = t3.NOOP_METER = t3.NoopObservableUpDownCounterMetric = t3.NoopObservableGaugeMetric = t3.NoopObservableCounterMetric = t3.NoopObservableMetric = t3.NoopHistogramMetric = t3.NoopUpDownCounterMetric = t3.NoopCounterMetric = t3.NoopMetric = t3.NoopMeter = void 0;
          class r2 {
            constructor() {
            }
            createHistogram(e3, r3) {
              return t3.NOOP_HISTOGRAM_METRIC;
            }
            createCounter(e3, r3) {
              return t3.NOOP_COUNTER_METRIC;
            }
            createUpDownCounter(e3, r3) {
              return t3.NOOP_UP_DOWN_COUNTER_METRIC;
            }
            createObservableGauge(e3, r3) {
              return t3.NOOP_OBSERVABLE_GAUGE_METRIC;
            }
            createObservableCounter(e3, r3) {
              return t3.NOOP_OBSERVABLE_COUNTER_METRIC;
            }
            createObservableUpDownCounter(e3, r3) {
              return t3.NOOP_OBSERVABLE_UP_DOWN_COUNTER_METRIC;
            }
            addBatchObservableCallback(e3, t4) {
            }
            removeBatchObservableCallback(e3) {
            }
          }
          t3.NoopMeter = r2;
          class n2 {
          }
          t3.NoopMetric = n2;
          class i2 extends n2 {
            add(e3, t4) {
            }
          }
          t3.NoopCounterMetric = i2;
          class a2 extends n2 {
            add(e3, t4) {
            }
          }
          t3.NoopUpDownCounterMetric = a2;
          class o extends n2 {
            record(e3, t4) {
            }
          }
          t3.NoopHistogramMetric = o;
          class s {
            addCallback(e3) {
            }
            removeCallback(e3) {
            }
          }
          t3.NoopObservableMetric = s;
          class l extends s {
          }
          t3.NoopObservableCounterMetric = l;
          class u extends s {
          }
          t3.NoopObservableGaugeMetric = u;
          class c extends s {
          }
          t3.NoopObservableUpDownCounterMetric = c, t3.NOOP_METER = new r2(), t3.NOOP_COUNTER_METRIC = new i2(), t3.NOOP_HISTOGRAM_METRIC = new o(), t3.NOOP_UP_DOWN_COUNTER_METRIC = new a2(), t3.NOOP_OBSERVABLE_COUNTER_METRIC = new l(), t3.NOOP_OBSERVABLE_GAUGE_METRIC = new u(), t3.NOOP_OBSERVABLE_UP_DOWN_COUNTER_METRIC = new c(), t3.createNoopMeter = function() {
            return t3.NOOP_METER;
          };
        }, 660: (e2, t3, r2) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.NOOP_METER_PROVIDER = t3.NoopMeterProvider = void 0;
          let n2 = r2(102);
          class i2 {
            getMeter(e3, t4, r3) {
              return n2.NOOP_METER;
            }
          }
          t3.NoopMeterProvider = i2, t3.NOOP_METER_PROVIDER = new i2();
        }, 200: function(e2, t3, r2) {
          var n2 = this && this.__createBinding || (Object.create ? function(e3, t4, r3, n3) {
            void 0 === n3 && (n3 = r3), Object.defineProperty(e3, n3, { enumerable: true, get: function() {
              return t4[r3];
            } });
          } : function(e3, t4, r3, n3) {
            void 0 === n3 && (n3 = r3), e3[n3] = t4[r3];
          }), i2 = this && this.__exportStar || function(e3, t4) {
            for (var r3 in e3) "default" === r3 || Object.prototype.hasOwnProperty.call(t4, r3) || n2(t4, e3, r3);
          };
          Object.defineProperty(t3, "__esModule", { value: true }), i2(r2(46), t3);
        }, 651: (e2, t3) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3._globalThis = void 0, t3._globalThis = "object" == typeof globalThis ? globalThis : r.g;
        }, 46: function(e2, t3, r2) {
          var n2 = this && this.__createBinding || (Object.create ? function(e3, t4, r3, n3) {
            void 0 === n3 && (n3 = r3), Object.defineProperty(e3, n3, { enumerable: true, get: function() {
              return t4[r3];
            } });
          } : function(e3, t4, r3, n3) {
            void 0 === n3 && (n3 = r3), e3[n3] = t4[r3];
          }), i2 = this && this.__exportStar || function(e3, t4) {
            for (var r3 in e3) "default" === r3 || Object.prototype.hasOwnProperty.call(t4, r3) || n2(t4, e3, r3);
          };
          Object.defineProperty(t3, "__esModule", { value: true }), i2(r2(651), t3);
        }, 939: (e2, t3, r2) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.propagation = void 0, t3.propagation = r2(181).PropagationAPI.getInstance();
        }, 874: (e2, t3) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.NoopTextMapPropagator = void 0;
          class r2 {
            inject(e3, t4) {
            }
            extract(e3, t4) {
              return e3;
            }
            fields() {
              return [];
            }
          }
          t3.NoopTextMapPropagator = r2;
        }, 194: (e2, t3) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.defaultTextMapSetter = t3.defaultTextMapGetter = void 0, t3.defaultTextMapGetter = { get(e3, t4) {
            if (null != e3) return e3[t4];
          }, keys: (e3) => null == e3 ? [] : Object.keys(e3) }, t3.defaultTextMapSetter = { set(e3, t4, r2) {
            null != e3 && (e3[t4] = r2);
          } };
        }, 845: (e2, t3, r2) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.trace = void 0, t3.trace = r2(997).TraceAPI.getInstance();
        }, 403: (e2, t3, r2) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.NonRecordingSpan = void 0;
          let n2 = r2(476);
          class i2 {
            constructor(e3 = n2.INVALID_SPAN_CONTEXT) {
              this._spanContext = e3;
            }
            spanContext() {
              return this._spanContext;
            }
            setAttribute(e3, t4) {
              return this;
            }
            setAttributes(e3) {
              return this;
            }
            addEvent(e3, t4) {
              return this;
            }
            setStatus(e3) {
              return this;
            }
            updateName(e3) {
              return this;
            }
            end(e3) {
            }
            isRecording() {
              return false;
            }
            recordException(e3, t4) {
            }
          }
          t3.NonRecordingSpan = i2;
        }, 614: (e2, t3, r2) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.NoopTracer = void 0;
          let n2 = r2(491), i2 = r2(607), a2 = r2(403), o = r2(139), s = n2.ContextAPI.getInstance();
          class l {
            startSpan(e3, t4, r3 = s.active()) {
              var n3;
              if (null == t4 ? void 0 : t4.root) return new a2.NonRecordingSpan();
              let l2 = r3 && (0, i2.getSpanContext)(r3);
              return "object" == typeof (n3 = l2) && "string" == typeof n3.spanId && "string" == typeof n3.traceId && "number" == typeof n3.traceFlags && (0, o.isSpanContextValid)(l2) ? new a2.NonRecordingSpan(l2) : new a2.NonRecordingSpan();
            }
            startActiveSpan(e3, t4, r3, n3) {
              let a3, o2, l2;
              if (arguments.length < 2) return;
              2 == arguments.length ? l2 = t4 : 3 == arguments.length ? (a3 = t4, l2 = r3) : (a3 = t4, o2 = r3, l2 = n3);
              let u = null != o2 ? o2 : s.active(), c = this.startSpan(e3, a3, u), d = (0, i2.setSpan)(u, c);
              return s.with(d, l2, void 0, c);
            }
          }
          t3.NoopTracer = l;
        }, 124: (e2, t3, r2) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.NoopTracerProvider = void 0;
          let n2 = r2(614);
          class i2 {
            getTracer(e3, t4, r3) {
              return new n2.NoopTracer();
            }
          }
          t3.NoopTracerProvider = i2;
        }, 125: (e2, t3, r2) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.ProxyTracer = void 0;
          let n2 = new (r2(614)).NoopTracer();
          class i2 {
            constructor(e3, t4, r3, n3) {
              this._provider = e3, this.name = t4, this.version = r3, this.options = n3;
            }
            startSpan(e3, t4, r3) {
              return this._getTracer().startSpan(e3, t4, r3);
            }
            startActiveSpan(e3, t4, r3, n3) {
              let i3 = this._getTracer();
              return Reflect.apply(i3.startActiveSpan, i3, arguments);
            }
            _getTracer() {
              if (this._delegate) return this._delegate;
              let e3 = this._provider.getDelegateTracer(this.name, this.version, this.options);
              return e3 ? (this._delegate = e3, this._delegate) : n2;
            }
          }
          t3.ProxyTracer = i2;
        }, 846: (e2, t3, r2) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.ProxyTracerProvider = void 0;
          let n2 = r2(125), i2 = new (r2(124)).NoopTracerProvider();
          class a2 {
            getTracer(e3, t4, r3) {
              var i3;
              return null != (i3 = this.getDelegateTracer(e3, t4, r3)) ? i3 : new n2.ProxyTracer(this, e3, t4, r3);
            }
            getDelegate() {
              var e3;
              return null != (e3 = this._delegate) ? e3 : i2;
            }
            setDelegate(e3) {
              this._delegate = e3;
            }
            getDelegateTracer(e3, t4, r3) {
              var n3;
              return null == (n3 = this._delegate) ? void 0 : n3.getTracer(e3, t4, r3);
            }
          }
          t3.ProxyTracerProvider = a2;
        }, 996: (e2, t3) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.SamplingDecision = void 0, function(e3) {
            e3[e3.NOT_RECORD = 0] = "NOT_RECORD", e3[e3.RECORD = 1] = "RECORD", e3[e3.RECORD_AND_SAMPLED = 2] = "RECORD_AND_SAMPLED";
          }(t3.SamplingDecision || (t3.SamplingDecision = {}));
        }, 607: (e2, t3, r2) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.getSpanContext = t3.setSpanContext = t3.deleteSpan = t3.setSpan = t3.getActiveSpan = t3.getSpan = void 0;
          let n2 = r2(780), i2 = r2(403), a2 = r2(491), o = (0, n2.createContextKey)("OpenTelemetry Context Key SPAN");
          function s(e3) {
            return e3.getValue(o) || void 0;
          }
          function l(e3, t4) {
            return e3.setValue(o, t4);
          }
          t3.getSpan = s, t3.getActiveSpan = function() {
            return s(a2.ContextAPI.getInstance().active());
          }, t3.setSpan = l, t3.deleteSpan = function(e3) {
            return e3.deleteValue(o);
          }, t3.setSpanContext = function(e3, t4) {
            return l(e3, new i2.NonRecordingSpan(t4));
          }, t3.getSpanContext = function(e3) {
            var t4;
            return null == (t4 = s(e3)) ? void 0 : t4.spanContext();
          };
        }, 325: (e2, t3, r2) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.TraceStateImpl = void 0;
          let n2 = r2(564);
          class i2 {
            constructor(e3) {
              this._internalState = /* @__PURE__ */ new Map(), e3 && this._parse(e3);
            }
            set(e3, t4) {
              let r3 = this._clone();
              return r3._internalState.has(e3) && r3._internalState.delete(e3), r3._internalState.set(e3, t4), r3;
            }
            unset(e3) {
              let t4 = this._clone();
              return t4._internalState.delete(e3), t4;
            }
            get(e3) {
              return this._internalState.get(e3);
            }
            serialize() {
              return this._keys().reduce((e3, t4) => (e3.push(t4 + "=" + this.get(t4)), e3), []).join(",");
            }
            _parse(e3) {
              !(e3.length > 512) && (this._internalState = e3.split(",").reverse().reduce((e4, t4) => {
                let r3 = t4.trim(), i3 = r3.indexOf("=");
                if (-1 !== i3) {
                  let a2 = r3.slice(0, i3), o = r3.slice(i3 + 1, t4.length);
                  (0, n2.validateKey)(a2) && (0, n2.validateValue)(o) && e4.set(a2, o);
                }
                return e4;
              }, /* @__PURE__ */ new Map()), this._internalState.size > 32 && (this._internalState = new Map(Array.from(this._internalState.entries()).reverse().slice(0, 32))));
            }
            _keys() {
              return Array.from(this._internalState.keys()).reverse();
            }
            _clone() {
              let e3 = new i2();
              return e3._internalState = new Map(this._internalState), e3;
            }
          }
          t3.TraceStateImpl = i2;
        }, 564: (e2, t3) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.validateValue = t3.validateKey = void 0;
          let r2 = "[_0-9a-z-*/]", n2 = `[a-z]${r2}{0,255}`, i2 = `[a-z0-9]${r2}{0,240}@[a-z]${r2}{0,13}`, a2 = RegExp(`^(?:${n2}|${i2})$`), o = /^[ -~]{0,255}[!-~]$/, s = /,|=/;
          t3.validateKey = function(e3) {
            return a2.test(e3);
          }, t3.validateValue = function(e3) {
            return o.test(e3) && !s.test(e3);
          };
        }, 98: (e2, t3, r2) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.createTraceState = void 0;
          let n2 = r2(325);
          t3.createTraceState = function(e3) {
            return new n2.TraceStateImpl(e3);
          };
        }, 476: (e2, t3, r2) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.INVALID_SPAN_CONTEXT = t3.INVALID_TRACEID = t3.INVALID_SPANID = void 0;
          let n2 = r2(475);
          t3.INVALID_SPANID = "0000000000000000", t3.INVALID_TRACEID = "00000000000000000000000000000000", t3.INVALID_SPAN_CONTEXT = { traceId: t3.INVALID_TRACEID, spanId: t3.INVALID_SPANID, traceFlags: n2.TraceFlags.NONE };
        }, 357: (e2, t3) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.SpanKind = void 0, function(e3) {
            e3[e3.INTERNAL = 0] = "INTERNAL", e3[e3.SERVER = 1] = "SERVER", e3[e3.CLIENT = 2] = "CLIENT", e3[e3.PRODUCER = 3] = "PRODUCER", e3[e3.CONSUMER = 4] = "CONSUMER";
          }(t3.SpanKind || (t3.SpanKind = {}));
        }, 139: (e2, t3, r2) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.wrapSpanContext = t3.isSpanContextValid = t3.isValidSpanId = t3.isValidTraceId = void 0;
          let n2 = r2(476), i2 = r2(403), a2 = /^([0-9a-f]{32})$/i, o = /^[0-9a-f]{16}$/i;
          function s(e3) {
            return a2.test(e3) && e3 !== n2.INVALID_TRACEID;
          }
          function l(e3) {
            return o.test(e3) && e3 !== n2.INVALID_SPANID;
          }
          t3.isValidTraceId = s, t3.isValidSpanId = l, t3.isSpanContextValid = function(e3) {
            return s(e3.traceId) && l(e3.spanId);
          }, t3.wrapSpanContext = function(e3) {
            return new i2.NonRecordingSpan(e3);
          };
        }, 847: (e2, t3) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.SpanStatusCode = void 0, function(e3) {
            e3[e3.UNSET = 0] = "UNSET", e3[e3.OK = 1] = "OK", e3[e3.ERROR = 2] = "ERROR";
          }(t3.SpanStatusCode || (t3.SpanStatusCode = {}));
        }, 475: (e2, t3) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.TraceFlags = void 0, function(e3) {
            e3[e3.NONE = 0] = "NONE", e3[e3.SAMPLED = 1] = "SAMPLED";
          }(t3.TraceFlags || (t3.TraceFlags = {}));
        }, 521: (e2, t3) => {
          Object.defineProperty(t3, "__esModule", { value: true }), t3.VERSION = void 0, t3.VERSION = "1.6.0";
        } }, n = {};
        function i(e2) {
          var r2 = n[e2];
          if (void 0 !== r2) return r2.exports;
          var a2 = n[e2] = { exports: {} }, o = true;
          try {
            t2[e2].call(a2.exports, a2, a2.exports, i), o = false;
          } finally {
            o && delete n[e2];
          }
          return a2.exports;
        }
        i.ab = "//";
        var a = {};
        (() => {
          Object.defineProperty(a, "__esModule", { value: true }), a.trace = a.propagation = a.metrics = a.diag = a.context = a.INVALID_SPAN_CONTEXT = a.INVALID_TRACEID = a.INVALID_SPANID = a.isValidSpanId = a.isValidTraceId = a.isSpanContextValid = a.createTraceState = a.TraceFlags = a.SpanStatusCode = a.SpanKind = a.SamplingDecision = a.ProxyTracerProvider = a.ProxyTracer = a.defaultTextMapSetter = a.defaultTextMapGetter = a.ValueType = a.createNoopMeter = a.DiagLogLevel = a.DiagConsoleLogger = a.ROOT_CONTEXT = a.createContextKey = a.baggageEntryMetadataFromString = void 0;
          var e2 = i(369);
          Object.defineProperty(a, "baggageEntryMetadataFromString", { enumerable: true, get: function() {
            return e2.baggageEntryMetadataFromString;
          } });
          var t3 = i(780);
          Object.defineProperty(a, "createContextKey", { enumerable: true, get: function() {
            return t3.createContextKey;
          } }), Object.defineProperty(a, "ROOT_CONTEXT", { enumerable: true, get: function() {
            return t3.ROOT_CONTEXT;
          } });
          var r2 = i(972);
          Object.defineProperty(a, "DiagConsoleLogger", { enumerable: true, get: function() {
            return r2.DiagConsoleLogger;
          } });
          var n2 = i(957);
          Object.defineProperty(a, "DiagLogLevel", { enumerable: true, get: function() {
            return n2.DiagLogLevel;
          } });
          var o = i(102);
          Object.defineProperty(a, "createNoopMeter", { enumerable: true, get: function() {
            return o.createNoopMeter;
          } });
          var s = i(901);
          Object.defineProperty(a, "ValueType", { enumerable: true, get: function() {
            return s.ValueType;
          } });
          var l = i(194);
          Object.defineProperty(a, "defaultTextMapGetter", { enumerable: true, get: function() {
            return l.defaultTextMapGetter;
          } }), Object.defineProperty(a, "defaultTextMapSetter", { enumerable: true, get: function() {
            return l.defaultTextMapSetter;
          } });
          var u = i(125);
          Object.defineProperty(a, "ProxyTracer", { enumerable: true, get: function() {
            return u.ProxyTracer;
          } });
          var c = i(846);
          Object.defineProperty(a, "ProxyTracerProvider", { enumerable: true, get: function() {
            return c.ProxyTracerProvider;
          } });
          var d = i(996);
          Object.defineProperty(a, "SamplingDecision", { enumerable: true, get: function() {
            return d.SamplingDecision;
          } });
          var p = i(357);
          Object.defineProperty(a, "SpanKind", { enumerable: true, get: function() {
            return p.SpanKind;
          } });
          var h = i(847);
          Object.defineProperty(a, "SpanStatusCode", { enumerable: true, get: function() {
            return h.SpanStatusCode;
          } });
          var g = i(475);
          Object.defineProperty(a, "TraceFlags", { enumerable: true, get: function() {
            return g.TraceFlags;
          } });
          var f = i(98);
          Object.defineProperty(a, "createTraceState", { enumerable: true, get: function() {
            return f.createTraceState;
          } });
          var b = i(139);
          Object.defineProperty(a, "isSpanContextValid", { enumerable: true, get: function() {
            return b.isSpanContextValid;
          } }), Object.defineProperty(a, "isValidTraceId", { enumerable: true, get: function() {
            return b.isValidTraceId;
          } }), Object.defineProperty(a, "isValidSpanId", { enumerable: true, get: function() {
            return b.isValidSpanId;
          } });
          var v = i(476);
          Object.defineProperty(a, "INVALID_SPANID", { enumerable: true, get: function() {
            return v.INVALID_SPANID;
          } }), Object.defineProperty(a, "INVALID_TRACEID", { enumerable: true, get: function() {
            return v.INVALID_TRACEID;
          } }), Object.defineProperty(a, "INVALID_SPAN_CONTEXT", { enumerable: true, get: function() {
            return v.INVALID_SPAN_CONTEXT;
          } });
          let m = i(67);
          Object.defineProperty(a, "context", { enumerable: true, get: function() {
            return m.context;
          } });
          let _ = i(506);
          Object.defineProperty(a, "diag", { enumerable: true, get: function() {
            return _.diag;
          } });
          let w = i(886);
          Object.defineProperty(a, "metrics", { enumerable: true, get: function() {
            return w.metrics;
          } });
          let y = i(939);
          Object.defineProperty(a, "propagation", { enumerable: true, get: function() {
            return y.propagation;
          } });
          let x = i(845);
          Object.defineProperty(a, "trace", { enumerable: true, get: function() {
            return x.trace;
          } }), a.default = { context: m.context, diag: _.diag, metrics: w.metrics, propagation: y.propagation, trace: x.trace };
        })(), e.exports = a;
      })();
    } }, (e) => {
      var t = e(e.s = 461);
      (_ENTRIES = "undefined" == typeof _ENTRIES ? {} : _ENTRIES).middleware_middleware = t;
    }]);
  }
});

// node_modules/@opennextjs/aws/dist/core/edgeFunctionHandler.js
var edgeFunctionHandler_exports = {};
__export(edgeFunctionHandler_exports, {
  default: () => edgeFunctionHandler
});
async function edgeFunctionHandler(request) {
  const path3 = new URL(request.url).pathname;
  const routes = globalThis._ROUTES;
  const correspondingRoute = routes.find((route) => route.regex.some((r) => new RegExp(r).test(path3)));
  if (!correspondingRoute) {
    throw new Error(`No route found for ${request.url}`);
  }
  const entry = await self._ENTRIES[`middleware_${correspondingRoute.name}`];
  const result = await entry.default({
    page: correspondingRoute.page,
    request: {
      ...request,
      page: {
        name: correspondingRoute.name
      }
    }
  });
  globalThis.__openNextAls.getStore()?.pendingPromiseRunner.add(result.waitUntil);
  const response = result.response;
  return response;
}
var init_edgeFunctionHandler = __esm({
  "node_modules/@opennextjs/aws/dist/core/edgeFunctionHandler.js"() {
    globalThis._ENTRIES = {};
    globalThis.self = globalThis;
    globalThis._ROUTES = [{ "name": "middleware", "page": "/", "regex": ["^(?:\\/(_next\\/data\\/[^/]{1,}))?\\/admin(?:\\/((?:[^\\/#\\?]+?)(?:\\/(?:[^\\/#\\?]+?))*))?(\\.json)?[\\/#\\?]?$"] }];
    require_edge_runtime_webpack();
    require_middleware();
  }
});

// node_modules/@opennextjs/aws/dist/utils/promise.js
init_logger();

// node_modules/@opennextjs/aws/dist/utils/requestCache.js
var RequestCache = class {
  _caches = /* @__PURE__ */ new Map();
  /**
   * Returns the Map registered under `key`.
   * If no Map exists yet for that key, a new empty Map is created, stored, and returned.
   * Repeated calls with the same key always return the **same** Map instance.
   */
  getOrCreate(key) {
    let cache = this._caches.get(key);
    if (!cache) {
      cache = /* @__PURE__ */ new Map();
      this._caches.set(key, cache);
    }
    return cache;
  }
};

// node_modules/@opennextjs/aws/dist/utils/promise.js
var DetachedPromise = class {
  resolve;
  reject;
  promise;
  constructor() {
    let resolve;
    let reject;
    this.promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    this.resolve = resolve;
    this.reject = reject;
  }
};
var DetachedPromiseRunner = class {
  promises = [];
  withResolvers() {
    const detachedPromise = new DetachedPromise();
    this.promises.push(detachedPromise);
    return detachedPromise;
  }
  add(promise) {
    const detachedPromise = new DetachedPromise();
    this.promises.push(detachedPromise);
    promise.then(detachedPromise.resolve, detachedPromise.reject);
  }
  async await() {
    debug(`Awaiting ${this.promises.length} detached promises`);
    const results = await Promise.allSettled(this.promises.map((p) => p.promise));
    const rejectedPromises = results.filter((r) => r.status === "rejected");
    rejectedPromises.forEach((r) => {
      error(r.reason);
    });
  }
};
async function awaitAllDetachedPromise() {
  const store = globalThis.__openNextAls.getStore();
  const promisesToAwait = store?.pendingPromiseRunner.await() ?? Promise.resolve();
  if (store?.waitUntil) {
    store.waitUntil(promisesToAwait);
    return;
  }
  await promisesToAwait;
}
function provideNextAfterProvider() {
  const NEXT_REQUEST_CONTEXT_SYMBOL = Symbol.for("@next/request-context");
  const VERCEL_REQUEST_CONTEXT_SYMBOL = Symbol.for("@vercel/request-context");
  const store = globalThis.__openNextAls.getStore();
  const waitUntil = store?.waitUntil ?? ((promise) => store?.pendingPromiseRunner.add(promise));
  const nextAfterContext = {
    get: () => ({
      waitUntil
    })
  };
  globalThis[NEXT_REQUEST_CONTEXT_SYMBOL] = nextAfterContext;
  if (process.env.EMULATE_VERCEL_REQUEST_CONTEXT) {
    globalThis[VERCEL_REQUEST_CONTEXT_SYMBOL] = nextAfterContext;
  }
}
function runWithOpenNextRequestContext({ isISRRevalidation, waitUntil, requestId = Math.random().toString(36) }, fn) {
  return globalThis.__openNextAls.run({
    requestId,
    pendingPromiseRunner: new DetachedPromiseRunner(),
    isISRRevalidation,
    waitUntil,
    writtenTags: /* @__PURE__ */ new Set(),
    requestCache: new RequestCache()
  }, async () => {
    provideNextAfterProvider();
    let result;
    try {
      result = await fn();
    } finally {
      await awaitAllDetachedPromise();
    }
    return result;
  });
}

// node_modules/@opennextjs/aws/dist/adapters/middleware.js
init_logger();

// node_modules/@opennextjs/aws/dist/core/createGenericHandler.js
init_logger();

// node_modules/@opennextjs/aws/dist/core/resolve.js
async function resolveConverter(converter2) {
  if (typeof converter2 === "function") {
    return converter2();
  }
  const m_1 = await Promise.resolve().then(() => (init_edge(), edge_exports));
  return m_1.default;
}
async function resolveWrapper(wrapper) {
  if (typeof wrapper === "function") {
    return wrapper();
  }
  const m_1 = await Promise.resolve().then(() => (init_cloudflare_edge(), cloudflare_edge_exports));
  return m_1.default;
}
async function resolveOriginResolver(originResolver) {
  if (typeof originResolver === "function") {
    return originResolver();
  }
  const m_1 = await Promise.resolve().then(() => (init_pattern_env(), pattern_env_exports));
  return m_1.default;
}
async function resolveAssetResolver(assetResolver) {
  if (typeof assetResolver === "function") {
    return assetResolver();
  }
  const m_1 = await Promise.resolve().then(() => (init_dummy(), dummy_exports));
  return m_1.default;
}
async function resolveProxyRequest(proxyRequest) {
  if (typeof proxyRequest === "function") {
    return proxyRequest();
  }
  const m_1 = await Promise.resolve().then(() => (init_fetch(), fetch_exports));
  return m_1.default;
}

// node_modules/@opennextjs/aws/dist/core/createGenericHandler.js
async function createGenericHandler(handler3) {
  const config = await import("./open-next.config.mjs").then((m) => m.default);
  globalThis.openNextConfig = config;
  const handlerConfig = config[handler3.type];
  const override = handlerConfig && "override" in handlerConfig ? handlerConfig.override : void 0;
  const converter2 = await resolveConverter(override?.converter);
  const { name, wrapper } = await resolveWrapper(override?.wrapper);
  debug("Using wrapper", name);
  return wrapper(handler3.handler, converter2);
}

// node_modules/@opennextjs/aws/dist/core/routing/util.js
import crypto2 from "node:crypto";
import { parse as parseQs, stringify as stringifyQs } from "node:querystring";

// node_modules/@opennextjs/aws/dist/adapters/config/index.js
init_logger();
import path from "node:path";
globalThis.__dirname ??= "";
var NEXT_DIR = path.join(__dirname, ".next");
var OPEN_NEXT_DIR = path.join(__dirname, ".open-next");
debug({ NEXT_DIR, OPEN_NEXT_DIR });
var NextConfig = { "env": {}, "webpack": null, "eslint": { "ignoreDuringBuilds": false }, "typescript": { "ignoreBuildErrors": false, "tsconfigPath": "tsconfig.json" }, "distDir": ".next", "cleanDistDir": true, "assetPrefix": "", "cacheMaxMemorySize": 52428800, "configOrigin": "next.config.js", "useFileSystemPublicRoutes": true, "generateEtags": true, "pageExtensions": ["tsx", "ts", "jsx", "js"], "poweredByHeader": true, "compress": true, "images": { "deviceSizes": [640, 750, 828, 1080, 1200, 1920, 2048, 3840], "imageSizes": [16, 32, 48, 64, 96, 128, 256, 384], "path": "/_next/image", "loader": "default", "loaderFile": "", "domains": [], "disableStaticImages": false, "minimumCacheTTL": 60, "formats": ["image/webp"], "dangerouslyAllowSVG": false, "contentSecurityPolicy": "script-src 'none'; frame-src 'none'; sandbox;", "contentDispositionType": "attachment", "remotePatterns": [{ "protocol": "https", "hostname": "**.cloudflare.com" }, { "protocol": "https", "hostname": "**.r2.cloudflarestorage.com" }], "unoptimized": false }, "devIndicators": { "position": "bottom-left" }, "onDemandEntries": { "maxInactiveAge": 6e4, "pagesBufferLength": 5 }, "amp": { "canonicalBase": "" }, "basePath": "", "sassOptions": {}, "trailingSlash": false, "i18n": null, "productionBrowserSourceMaps": false, "excludeDefaultMomentLocales": true, "serverRuntimeConfig": {}, "publicRuntimeConfig": {}, "reactProductionProfiling": false, "reactStrictMode": null, "reactMaxHeadersLength": 6e3, "httpAgentOptions": { "keepAlive": true }, "logging": {}, "expireTime": 31536e3, "staticPageGenerationTimeout": 60, "output": "standalone", "modularizeImports": { "@mui/icons-material": { "transform": "@mui/icons-material/{{member}}" }, "lodash": { "transform": "lodash/{{member}}" } }, "outputFileTracingRoot": "/home/krsz/Projects/cf-blog", "experimental": { "nodeMiddleware": false, "cacheLife": { "default": { "stale": 300, "revalidate": 900, "expire": 4294967294 }, "seconds": { "stale": 0, "revalidate": 1, "expire": 60 }, "minutes": { "stale": 300, "revalidate": 60, "expire": 3600 }, "hours": { "stale": 300, "revalidate": 3600, "expire": 86400 }, "days": { "stale": 300, "revalidate": 86400, "expire": 604800 }, "weeks": { "stale": 300, "revalidate": 604800, "expire": 2592e3 }, "max": { "stale": 300, "revalidate": 2592e3, "expire": 4294967294 } }, "cacheHandlers": {}, "cssChunking": true, "multiZoneDraftMode": false, "appNavFailHandling": false, "prerenderEarlyExit": true, "serverMinification": true, "serverSourceMaps": false, "linkNoTouchStart": false, "caseSensitiveRoutes": false, "clientSegmentCache": false, "dynamicOnHover": false, "preloadEntriesOnStart": true, "clientRouterFilter": true, "clientRouterFilterRedirects": false, "fetchCacheKeyPrefix": "", "middlewarePrefetch": "flexible", "optimisticClientCache": true, "manualClientBasePath": false, "cpus": 3, "memoryBasedWorkersCount": false, "imgOptConcurrency": null, "imgOptTimeoutInSeconds": 7, "imgOptMaxInputPixels": 268402689, "imgOptSequentialRead": null, "isrFlushToDisk": true, "workerThreads": false, "optimizeCss": false, "nextScriptWorkers": false, "scrollRestoration": false, "externalDir": false, "disableOptimizedLoading": false, "gzipSize": true, "craCompat": false, "esmExternals": true, "fullySpecified": false, "swcTraceProfiling": false, "forceSwcTransforms": false, "largePageDataBytes": 128e3, "typedRoutes": false, "typedEnv": false, "parallelServerCompiles": false, "parallelServerBuildTraces": false, "ppr": false, "authInterrupts": false, "webpackMemoryOptimizations": false, "optimizeServerReact": true, "useEarlyImport": false, "viewTransition": false, "routerBFCache": false, "staleTimes": { "dynamic": 0, "static": 300 }, "serverComponentsHmrCache": true, "staticGenerationMaxConcurrency": 8, "staticGenerationMinPagesPerWorker": 25, "dynamicIO": false, "inlineCss": false, "useCache": false, "optimizePackageImports": ["lucide-react", "date-fns", "lodash-es", "ramda", "antd", "react-bootstrap", "ahooks", "@ant-design/icons", "@headlessui/react", "@headlessui-float/react", "@heroicons/react/20/solid", "@heroicons/react/24/solid", "@heroicons/react/24/outline", "@visx/visx", "@tremor/react", "rxjs", "@mui/material", "@mui/icons-material", "recharts", "react-use", "effect", "@effect/schema", "@effect/platform", "@effect/platform-node", "@effect/platform-browser", "@effect/platform-bun", "@effect/sql", "@effect/sql-mssql", "@effect/sql-mysql2", "@effect/sql-pg", "@effect/sql-squlite-node", "@effect/sql-squlite-bun", "@effect/sql-squlite-wasm", "@effect/sql-squlite-react-native", "@effect/rpc", "@effect/rpc-http", "@effect/typeclass", "@effect/experimental", "@effect/opentelemetry", "@material-ui/core", "@material-ui/icons", "@tabler/icons-react", "mui-core", "react-icons/ai", "react-icons/bi", "react-icons/bs", "react-icons/cg", "react-icons/ci", "react-icons/di", "react-icons/fa", "react-icons/fa6", "react-icons/fc", "react-icons/fi", "react-icons/gi", "react-icons/go", "react-icons/gr", "react-icons/hi", "react-icons/hi2", "react-icons/im", "react-icons/io", "react-icons/io5", "react-icons/lia", "react-icons/lib", "react-icons/lu", "react-icons/md", "react-icons/pi", "react-icons/ri", "react-icons/rx", "react-icons/si", "react-icons/sl", "react-icons/tb", "react-icons/tfi", "react-icons/ti", "react-icons/vsc", "react-icons/wi"], "trustHostHeader": false, "isExperimentalCompile": false }, "htmlLimitedBots": "Mediapartners-Google|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti", "bundlePagesRouterDependencies": false, "configFileName": "next.config.js", "turbopack": { "root": "/home/krsz/Projects/cf-blog" } };
var BuildId = "BKI-iLpEulRiY92xZ1VZf";
var RoutesManifest = { "basePath": "", "rewrites": { "beforeFiles": [], "afterFiles": [], "fallback": [] }, "redirects": [{ "source": "/:path+/", "destination": "/:path+", "internal": true, "statusCode": 308, "regex": "^(?:/((?:[^/]+?)(?:/(?:[^/]+?))*))/$" }], "routes": { "static": [{ "page": "/", "regex": "^/(?:/)?$", "routeKeys": {}, "namedRegex": "^/(?:/)?$" }, { "page": "/_not-found", "regex": "^/_not\\-found(?:/)?$", "routeKeys": {}, "namedRegex": "^/_not\\-found(?:/)?$" }, { "page": "/about", "regex": "^/about(?:/)?$", "routeKeys": {}, "namedRegex": "^/about(?:/)?$" }, { "page": "/admin", "regex": "^/admin(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin(?:/)?$" }, { "page": "/admin/editor/new", "regex": "^/admin/editor/new(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/editor/new(?:/)?$" }, { "page": "/blog", "regex": "^/blog(?:/)?$", "routeKeys": {}, "namedRegex": "^/blog(?:/)?$" }], "dynamic": [{ "page": "/admin/editor/[slug]", "regex": "^/admin/editor/([^/]+?)(?:/)?$", "routeKeys": { "nxtPslug": "nxtPslug" }, "namedRegex": "^/admin/editor/(?<nxtPslug>[^/]+?)(?:/)?$" }, { "page": "/api/posts/[slug]", "regex": "^/api/posts/([^/]+?)(?:/)?$", "routeKeys": { "nxtPslug": "nxtPslug" }, "namedRegex": "^/api/posts/(?<nxtPslug>[^/]+?)(?:/)?$" }, { "page": "/blog/[slug]", "regex": "^/blog/([^/]+?)(?:/)?$", "routeKeys": { "nxtPslug": "nxtPslug" }, "namedRegex": "^/blog/(?<nxtPslug>[^/]+?)(?:/)?$" }], "data": { "static": [], "dynamic": [] } }, "locales": [] };
var ConfigHeaders = [];
var PrerenderManifest = { "version": 4, "routes": { "/blog": { "experimentalBypassFor": [{ "type": "header", "key": "Next-Action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/blog", "dataRoute": "/blog.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/about": { "experimentalBypassFor": [{ "type": "header", "key": "Next-Action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/about", "dataRoute": "/about.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/admin/editor/new": { "experimentalBypassFor": [{ "type": "header", "key": "Next-Action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/admin/editor/new", "dataRoute": "/admin/editor/new.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/admin": { "experimentalBypassFor": [{ "type": "header", "key": "Next-Action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/admin", "dataRoute": "/admin.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] } }, "dynamicRoutes": {}, "notFoundRoutes": [], "preview": { "previewModeId": "0821aa2552f80b89572a654cd82f3831", "previewModeSigningKey": "858c9b86177b6441b73a121c0036b83378bdde64829482436a83cd9dfd0b2e7c", "previewModeEncryptionKey": "a2187ea133e20eba814f5045d7bdc8d4d6c45ada42e7b39ca25957199614e2ba" } };
var MiddlewareManifest = { "version": 3, "middleware": { "/": { "files": ["server/edge-runtime-webpack.js", "server/middleware.js"], "name": "middleware", "page": "/", "matchers": [{ "regexp": "^(?:\\/(_next\\/data\\/[^/]{1,}))?\\/admin(?:\\/((?:[^\\/#\\?]+?)(?:\\/(?:[^\\/#\\?]+?))*))?(\\.json)?[\\/#\\?]?$", "originalSource": "/admin/:path*" }], "wasm": [], "assets": [], "env": { "__NEXT_BUILD_ID": "BKI-iLpEulRiY92xZ1VZf", "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY": "DmMz7jQ2MbdZgRjFSqv0hNjyiYeiuLJDife3lOdQ4gI=", "__NEXT_PREVIEW_MODE_ID": "0821aa2552f80b89572a654cd82f3831", "__NEXT_PREVIEW_MODE_ENCRYPTION_KEY": "a2187ea133e20eba814f5045d7bdc8d4d6c45ada42e7b39ca25957199614e2ba", "__NEXT_PREVIEW_MODE_SIGNING_KEY": "858c9b86177b6441b73a121c0036b83378bdde64829482436a83cd9dfd0b2e7c" } } }, "functions": {}, "sortedMiddleware": ["/"] };
var AppPathRoutesManifest = { "/_not-found/page": "/_not-found", "/api/posts/[slug]/route": "/api/posts/[slug]", "/api/posts/route": "/api/posts", "/blog/page": "/blog", "/about/page": "/about", "/blog/[slug]/page": "/blog/[slug]", "/page": "/", "/admin/editor/[slug]/page": "/admin/editor/[slug]", "/admin/editor/new/page": "/admin/editor/new", "/admin/page": "/admin" };
var FunctionsConfigManifest = { "version": 1, "functions": {} };
var PagesManifest = { "/_app": "pages/_app.js", "/_error": "pages/_error.js", "/_document": "pages/_document.js", "/404": "pages/404.html" };
process.env.NEXT_BUILD_ID = BuildId;
process.env.NEXT_PREVIEW_MODE_ID = PrerenderManifest?.preview?.previewModeId;

// node_modules/@opennextjs/aws/dist/http/openNextResponse.js
init_logger();
init_util();
import { Transform } from "node:stream";

// node_modules/@opennextjs/aws/dist/core/routing/util.js
init_util();
init_logger();
import { ReadableStream as ReadableStream2 } from "node:stream/web";

// node_modules/@opennextjs/aws/dist/utils/binary.js
var commonBinaryMimeTypes = /* @__PURE__ */ new Set([
  "application/octet-stream",
  // Docs
  "application/epub+zip",
  "application/msword",
  "application/pdf",
  "application/rtf",
  "application/vnd.amazon.ebook",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  // Fonts
  "font/otf",
  "font/woff",
  "font/woff2",
  // Images
  "image/bmp",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/vnd.microsoft.icon",
  "image/webp",
  // Audio
  "audio/3gpp",
  "audio/aac",
  "audio/basic",
  "audio/flac",
  "audio/mpeg",
  "audio/ogg",
  "audio/wavaudio/webm",
  "audio/x-aiff",
  "audio/x-midi",
  "audio/x-wav",
  // Video
  "video/3gpp",
  "video/mp2t",
  "video/mpeg",
  "video/ogg",
  "video/quicktime",
  "video/webm",
  "video/x-msvideo",
  // Archives
  "application/java-archive",
  "application/vnd.apple.installer+xml",
  "application/x-7z-compressed",
  "application/x-apple-diskimage",
  "application/x-bzip",
  "application/x-bzip2",
  "application/x-gzip",
  "application/x-java-archive",
  "application/x-rar-compressed",
  "application/x-tar",
  "application/x-zip",
  "application/zip",
  // Serialized data
  "application/x-protobuf"
]);
function isBinaryContentType(contentType) {
  if (!contentType)
    return false;
  const value = contentType.split(";")[0];
  return commonBinaryMimeTypes.has(value);
}

// node_modules/@opennextjs/aws/dist/core/routing/i18n/index.js
init_stream();
init_logger();

// node_modules/@opennextjs/aws/dist/core/routing/i18n/accept-header.js
function parse(raw, preferences, options) {
  const lowers = /* @__PURE__ */ new Map();
  const header = raw.replace(/[ \t]/g, "");
  if (preferences) {
    let pos = 0;
    for (const preference of preferences) {
      const lower = preference.toLowerCase();
      lowers.set(lower, { orig: preference, pos: pos++ });
      if (options.prefixMatch) {
        const parts2 = lower.split("-");
        while (parts2.pop(), parts2.length > 0) {
          const joined = parts2.join("-");
          if (!lowers.has(joined)) {
            lowers.set(joined, { orig: preference, pos: pos++ });
          }
        }
      }
    }
  }
  const parts = header.split(",");
  const selections = [];
  const map = /* @__PURE__ */ new Set();
  for (let i = 0; i < parts.length; ++i) {
    const part = parts[i];
    if (!part) {
      continue;
    }
    const params = part.split(";");
    if (params.length > 2) {
      throw new Error(`Invalid ${options.type} header`);
    }
    const token = params[0].toLowerCase();
    if (!token) {
      throw new Error(`Invalid ${options.type} header`);
    }
    const selection = { token, pos: i, q: 1 };
    if (preferences && lowers.has(token)) {
      selection.pref = lowers.get(token).pos;
    }
    map.add(selection.token);
    if (params.length === 2) {
      const q = params[1];
      const [key, value] = q.split("=");
      if (!value || key !== "q" && key !== "Q") {
        throw new Error(`Invalid ${options.type} header`);
      }
      const score = Number.parseFloat(value);
      if (score === 0) {
        continue;
      }
      if (Number.isFinite(score) && score <= 1 && score >= 1e-3) {
        selection.q = score;
      }
    }
    selections.push(selection);
  }
  selections.sort((a, b) => {
    if (b.q !== a.q) {
      return b.q - a.q;
    }
    if (b.pref !== a.pref) {
      if (a.pref === void 0) {
        return 1;
      }
      if (b.pref === void 0) {
        return -1;
      }
      return a.pref - b.pref;
    }
    return a.pos - b.pos;
  });
  const values = selections.map((selection) => selection.token);
  if (!preferences || !preferences.length) {
    return values;
  }
  const preferred = [];
  for (const selection of values) {
    if (selection === "*") {
      for (const [preference, value] of lowers) {
        if (!map.has(preference)) {
          preferred.push(value.orig);
        }
      }
    } else {
      const lower = selection.toLowerCase();
      if (lowers.has(lower)) {
        preferred.push(lowers.get(lower).orig);
      }
    }
  }
  return preferred;
}
function acceptLanguage(header = "", preferences) {
  return parse(header, preferences, {
    type: "accept-language",
    prefixMatch: true
  })[0] || void 0;
}

// node_modules/@opennextjs/aws/dist/core/routing/i18n/index.js
function isLocalizedPath(path3) {
  return NextConfig.i18n?.locales.includes(path3.split("/")[1].toLowerCase()) ?? false;
}
function getLocaleFromCookie(cookies) {
  const i18n = NextConfig.i18n;
  const nextLocale = cookies.NEXT_LOCALE?.toLowerCase();
  return nextLocale ? i18n?.locales.find((locale) => nextLocale === locale.toLowerCase()) : void 0;
}
function detectDomainLocale({ hostname, detectedLocale }) {
  const i18n = NextConfig.i18n;
  const domains = i18n?.domains;
  if (!domains) {
    return;
  }
  const lowercasedLocale = detectedLocale?.toLowerCase();
  for (const domain of domains) {
    const domainHostname = domain.domain.split(":", 1)[0].toLowerCase();
    if (hostname === domainHostname || lowercasedLocale === domain.defaultLocale.toLowerCase() || domain.locales?.some((locale) => lowercasedLocale === locale.toLowerCase())) {
      return domain;
    }
  }
}
function detectLocale(internalEvent, i18n) {
  const domainLocale = detectDomainLocale({
    hostname: internalEvent.headers.host
  });
  if (i18n.localeDetection === false) {
    return domainLocale?.defaultLocale ?? i18n.defaultLocale;
  }
  const cookiesLocale = getLocaleFromCookie(internalEvent.cookies);
  const preferredLocale = acceptLanguage(internalEvent.headers["accept-language"], i18n?.locales);
  debug({
    cookiesLocale,
    preferredLocale,
    defaultLocale: i18n.defaultLocale,
    domainLocale
  });
  return domainLocale?.defaultLocale ?? cookiesLocale ?? preferredLocale ?? i18n.defaultLocale;
}
function localizePath(internalEvent) {
  const i18n = NextConfig.i18n;
  if (!i18n) {
    return internalEvent.rawPath;
  }
  if (isLocalizedPath(internalEvent.rawPath)) {
    return internalEvent.rawPath;
  }
  const detectedLocale = detectLocale(internalEvent, i18n);
  return `/${detectedLocale}${internalEvent.rawPath}`;
}
function handleLocaleRedirect(internalEvent) {
  const i18n = NextConfig.i18n;
  if (!i18n || i18n.localeDetection === false || internalEvent.rawPath !== "/") {
    return false;
  }
  const preferredLocale = acceptLanguage(internalEvent.headers["accept-language"], i18n?.locales);
  const detectedLocale = detectLocale(internalEvent, i18n);
  const domainLocale = detectDomainLocale({
    hostname: internalEvent.headers.host
  });
  const preferredDomain = detectDomainLocale({
    detectedLocale: preferredLocale
  });
  if (domainLocale && preferredDomain) {
    const isPDomain = preferredDomain.domain === domainLocale.domain;
    const isPLocale = preferredDomain.defaultLocale === preferredLocale;
    if (!isPDomain || !isPLocale) {
      const scheme = `http${preferredDomain.http ? "" : "s"}`;
      const rlocale = isPLocale ? "" : preferredLocale;
      return {
        type: "core",
        statusCode: 307,
        headers: {
          Location: `${scheme}://${preferredDomain.domain}/${rlocale}`
        },
        body: emptyReadableStream(),
        isBase64Encoded: false
      };
    }
  }
  const defaultLocale = domainLocale?.defaultLocale ?? i18n.defaultLocale;
  if (detectedLocale.toLowerCase() !== defaultLocale.toLowerCase()) {
    const nextUrl = constructNextUrl(internalEvent.url, `/${detectedLocale}${NextConfig.trailingSlash ? "/" : ""}`);
    const queryString = convertToQueryString(internalEvent.query);
    return {
      type: "core",
      statusCode: 307,
      headers: {
        Location: `${nextUrl}${queryString}`
      },
      body: emptyReadableStream(),
      isBase64Encoded: false
    };
  }
  return false;
}

// node_modules/@opennextjs/aws/dist/core/routing/queue.js
function generateShardId(rawPath, maxConcurrency, prefix) {
  let a = cyrb128(rawPath);
  let t = a += 1831565813;
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  const randomFloat = ((t ^ t >>> 14) >>> 0) / 4294967296;
  const randomInt = Math.floor(randomFloat * maxConcurrency);
  return `${prefix}-${randomInt}`;
}
function generateMessageGroupId(rawPath) {
  const maxConcurrency = Number.parseInt(process.env.MAX_REVALIDATE_CONCURRENCY ?? "10");
  return generateShardId(rawPath, maxConcurrency, "revalidate");
}
function cyrb128(str) {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ h1 >>> 18, 597399067);
  h2 = Math.imul(h4 ^ h2 >>> 22, 2869860233);
  h3 = Math.imul(h1 ^ h3 >>> 17, 951274213);
  h4 = Math.imul(h2 ^ h4 >>> 19, 2716044179);
  h1 ^= h2 ^ h3 ^ h4, h2 ^= h1, h3 ^= h1, h4 ^= h1;
  return h1 >>> 0;
}

// node_modules/@opennextjs/aws/dist/core/routing/util.js
function isExternal(url, host) {
  if (!url)
    return false;
  const pattern = /^https?:\/\//;
  if (!pattern.test(url))
    return false;
  if (host) {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.host !== host;
    } catch {
      return !url.includes(host);
    }
  }
  return true;
}
function convertFromQueryString(query) {
  if (query === "")
    return {};
  const queryParts = query.split("&");
  return getQueryFromIterator(queryParts.map((p) => {
    const [key, value] = p.split("=");
    return [key, value];
  }));
}
function getUrlParts(url, isExternal2) {
  if (!isExternal2) {
    const regex2 = /\/([^?]*)\??(.*)/;
    const match3 = url.match(regex2);
    return {
      hostname: "",
      pathname: match3?.[1] ? `/${match3[1]}` : url,
      protocol: "",
      queryString: match3?.[2] ?? ""
    };
  }
  const regex = /^(https?:)\/\/?([^\/\s]+)(\/[^?]*)?(\?.*)?/;
  const match2 = url.match(regex);
  if (!match2) {
    throw new Error(`Invalid external URL: ${url}`);
  }
  return {
    protocol: match2[1] ?? "https:",
    hostname: match2[2],
    pathname: match2[3] ?? "",
    queryString: match2[4]?.slice(1) ?? ""
  };
}
function constructNextUrl(baseUrl, path3) {
  const nextBasePath = NextConfig.basePath ?? "";
  const url = new URL(`${nextBasePath}${path3}`, baseUrl);
  return url.href;
}
function convertToQueryString(query) {
  const queryStrings = [];
  Object.entries(query).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => queryStrings.push(`${key}=${entry}`));
    } else {
      queryStrings.push(`${key}=${value}`);
    }
  });
  return queryStrings.length > 0 ? `?${queryStrings.join("&")}` : "";
}
function getMiddlewareMatch(middlewareManifest2, functionsManifest) {
  if (functionsManifest?.functions?.["/_middleware"]) {
    return functionsManifest.functions["/_middleware"].matchers?.map(({ regexp }) => new RegExp(regexp)) ?? [/.*/];
  }
  const rootMiddleware = middlewareManifest2.middleware["/"];
  if (!rootMiddleware?.matchers)
    return [];
  return rootMiddleware.matchers.map(({ regexp }) => new RegExp(regexp));
}
function escapeRegex(str, { isPath } = {}) {
  const result = str.replaceAll("(.)", "_\xB51_").replaceAll("(..)", "_\xB52_").replaceAll("(...)", "_\xB53_");
  return isPath ? result : result.replaceAll("+", "_\xB54_");
}
function unescapeRegex(str) {
  return str.replaceAll("_\xB51_", "(.)").replaceAll("_\xB52_", "(..)").replaceAll("_\xB53_", "(...)").replaceAll("_\xB54_", "+");
}
function convertBodyToReadableStream(method, body) {
  if (method === "GET" || method === "HEAD")
    return void 0;
  if (!body)
    return void 0;
  return new ReadableStream2({
    start(controller) {
      controller.enqueue(body);
      controller.close();
    }
  });
}
var CommonHeaders;
(function(CommonHeaders2) {
  CommonHeaders2["CACHE_CONTROL"] = "cache-control";
  CommonHeaders2["NEXT_CACHE"] = "x-nextjs-cache";
})(CommonHeaders || (CommonHeaders = {}));
function normalizeLocationHeader(location, baseUrl, encodeQuery = false) {
  if (!URL.canParse(location)) {
    return location;
  }
  const locationURL = new URL(location);
  const origin = new URL(baseUrl).origin;
  let search = locationURL.search;
  if (encodeQuery && search) {
    search = `?${stringifyQs(parseQs(search.slice(1)))}`;
  }
  const href = `${locationURL.origin}${locationURL.pathname}${search}${locationURL.hash}`;
  if (locationURL.origin === origin) {
    return href.slice(origin.length);
  }
  return href;
}

// node_modules/@opennextjs/aws/dist/core/routingHandler.js
init_logger();

// node_modules/@opennextjs/aws/dist/core/routing/cacheInterceptor.js
import { createHash } from "node:crypto";
init_stream();

// node_modules/@opennextjs/aws/dist/utils/cache.js
init_logger();
async function hasBeenRevalidated(key, tags, cacheEntry) {
  if (globalThis.openNextConfig.dangerous?.disableTagCache) {
    return false;
  }
  const value = cacheEntry.value;
  if (!value) {
    return true;
  }
  if ("type" in cacheEntry && cacheEntry.type === "page") {
    return false;
  }
  const lastModified = cacheEntry.lastModified ?? Date.now();
  if (globalThis.tagCache.mode === "nextMode") {
    return tags.length === 0 ? false : await globalThis.tagCache.hasBeenRevalidated(tags, lastModified);
  }
  const _lastModified = await globalThis.tagCache.getLastModified(key, lastModified);
  return _lastModified === -1;
}
function getTagsFromValue(value) {
  if (!value) {
    return [];
  }
  try {
    const cacheTags = value.meta?.headers?.["x-next-cache-tags"]?.split(",") ?? [];
    delete value.meta?.headers?.["x-next-cache-tags"];
    return cacheTags;
  } catch (e) {
    return [];
  }
}

// node_modules/@opennextjs/aws/dist/core/routing/cacheInterceptor.js
init_logger();
var CACHE_ONE_YEAR = 60 * 60 * 24 * 365;
var CACHE_ONE_MONTH = 60 * 60 * 24 * 30;
var VARY_HEADER = "RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Router-Segment-Prefetch, Next-Url";
var NEXT_SEGMENT_PREFETCH_HEADER = "next-router-segment-prefetch";
var NEXT_PRERENDER_HEADER = "x-nextjs-prerender";
var NEXT_POSTPONED_HEADER = "x-nextjs-postponed";
async function computeCacheControl(path3, body, host, revalidate, lastModified) {
  let finalRevalidate = CACHE_ONE_YEAR;
  const existingRoute = Object.entries(PrerenderManifest?.routes ?? {}).find((p) => p[0] === path3)?.[1];
  if (revalidate === void 0 && existingRoute) {
    finalRevalidate = existingRoute.initialRevalidateSeconds === false ? CACHE_ONE_YEAR : existingRoute.initialRevalidateSeconds;
  } else if (revalidate !== void 0) {
    finalRevalidate = revalidate === false ? CACHE_ONE_YEAR : revalidate;
  }
  const age = Math.round((Date.now() - (lastModified ?? 0)) / 1e3);
  const hash = (str) => createHash("md5").update(str).digest("hex");
  const etag = hash(body);
  if (revalidate === 0) {
    return {
      "cache-control": "private, no-cache, no-store, max-age=0, must-revalidate",
      "x-opennext-cache": "ERROR",
      etag
    };
  }
  if (finalRevalidate !== CACHE_ONE_YEAR) {
    const sMaxAge = Math.max(finalRevalidate - age, 1);
    debug("sMaxAge", {
      finalRevalidate,
      age,
      lastModified,
      revalidate
    });
    const isStale = sMaxAge === 1;
    if (isStale) {
      let url = NextConfig.trailingSlash ? `${path3}/` : path3;
      if (NextConfig.basePath) {
        url = `${NextConfig.basePath}${url}`;
      }
      await globalThis.queue.send({
        MessageBody: {
          host,
          url,
          eTag: etag,
          lastModified: lastModified ?? Date.now()
        },
        MessageDeduplicationId: hash(`${path3}-${lastModified}-${etag}`),
        MessageGroupId: generateMessageGroupId(path3)
      });
    }
    return {
      "cache-control": `s-maxage=${sMaxAge}, stale-while-revalidate=${CACHE_ONE_MONTH}`,
      "x-opennext-cache": isStale ? "STALE" : "HIT",
      etag
    };
  }
  return {
    "cache-control": `s-maxage=${CACHE_ONE_YEAR}, stale-while-revalidate=${CACHE_ONE_MONTH}`,
    "x-opennext-cache": "HIT",
    etag
  };
}
function getBodyForAppRouter(event, cachedValue) {
  if (cachedValue.type !== "app") {
    throw new Error("getBodyForAppRouter called with non-app cache value");
  }
  try {
    const segmentHeader = `${event.headers[NEXT_SEGMENT_PREFETCH_HEADER]}`;
    const isSegmentResponse = Boolean(segmentHeader) && segmentHeader in (cachedValue.segmentData || {}) && !NextConfig.experimental?.prefetchInlining;
    const body = isSegmentResponse ? cachedValue.segmentData[segmentHeader] : cachedValue.rsc;
    return {
      body,
      additionalHeaders: isSegmentResponse ? { [NEXT_PRERENDER_HEADER]: "1", [NEXT_POSTPONED_HEADER]: "2" } : {}
    };
  } catch (e) {
    error("Error while getting body for app router from cache:", e);
    return { body: cachedValue.rsc, additionalHeaders: {} };
  }
}
async function generateResult(event, localizedPath, cachedValue, lastModified) {
  debug("Returning result from experimental cache");
  let body = "";
  let type = "application/octet-stream";
  let isDataRequest = false;
  let additionalHeaders = {};
  if (cachedValue.type === "app") {
    isDataRequest = Boolean(event.headers.rsc);
    if (isDataRequest) {
      const { body: appRouterBody, additionalHeaders: appHeaders } = getBodyForAppRouter(event, cachedValue);
      body = appRouterBody;
      additionalHeaders = appHeaders;
    } else {
      body = cachedValue.html;
    }
    type = isDataRequest ? "text/x-component" : "text/html; charset=utf-8";
  } else if (cachedValue.type === "page") {
    isDataRequest = Boolean(event.query.__nextDataReq);
    body = isDataRequest ? JSON.stringify(cachedValue.json) : cachedValue.html;
    type = isDataRequest ? "application/json" : "text/html; charset=utf-8";
  } else {
    throw new Error("generateResult called with unsupported cache value type, only 'app' and 'page' are supported");
  }
  const cacheControl = await computeCacheControl(localizedPath, body, event.headers.host, cachedValue.revalidate, lastModified);
  return {
    type: "core",
    // Sometimes other status codes can be cached, like 404. For these cases, we should return the correct status code
    // Also set the status code to the rewriteStatusCode if defined
    // This can happen in handleMiddleware in routingHandler.
    // `NextResponse.rewrite(url, { status: xxx})
    // The rewrite status code should take precedence over the cached one
    statusCode: event.rewriteStatusCode ?? cachedValue.meta?.status ?? 200,
    body: toReadableStream(body, false),
    isBase64Encoded: false,
    headers: {
      ...cacheControl,
      "content-type": type,
      ...cachedValue.meta?.headers,
      vary: VARY_HEADER,
      ...additionalHeaders
    }
  };
}
function escapePathDelimiters(segment, escapeEncoded) {
  return segment.replace(new RegExp(`([/#?]${escapeEncoded ? "|%(2f|23|3f|5c)" : ""})`, "gi"), (char) => encodeURIComponent(char));
}
function decodePathParams(pathname) {
  return pathname.split("/").map((segment) => {
    try {
      return escapePathDelimiters(decodeURIComponent(segment), true);
    } catch (e) {
      return segment;
    }
  }).join("/");
}
async function cacheInterceptor(event) {
  if (Boolean(event.headers["next-action"]) || Boolean(event.headers["x-prerender-revalidate"]))
    return event;
  const cookies = event.headers.cookie || "";
  const hasPreviewData = cookies.includes("__prerender_bypass") || cookies.includes("__next_preview_data");
  if (hasPreviewData) {
    debug("Preview mode detected, passing through to handler");
    return event;
  }
  let localizedPath = localizePath(event);
  if (NextConfig.basePath) {
    localizedPath = localizedPath.replace(NextConfig.basePath, "");
  }
  localizedPath = localizedPath.replace(/\/$/, "");
  localizedPath = decodePathParams(localizedPath);
  debug("Checking cache for", localizedPath, PrerenderManifest);
  const isISR = Object.keys(PrerenderManifest?.routes ?? {}).includes(localizedPath ?? "/") || Object.values(PrerenderManifest?.dynamicRoutes ?? {}).some((dr) => new RegExp(dr.routeRegex).test(localizedPath));
  debug("isISR", isISR);
  if (isISR) {
    try {
      const cachedData = await globalThis.incrementalCache.get(localizedPath ?? "/index");
      debug("cached data in interceptor", cachedData);
      if (!cachedData?.value) {
        return event;
      }
      if (cachedData.value?.type === "app" || cachedData.value?.type === "route") {
        const tags = getTagsFromValue(cachedData.value);
        const _hasBeenRevalidated = cachedData.shouldBypassTagCache ? false : await hasBeenRevalidated(localizedPath, tags, cachedData);
        if (_hasBeenRevalidated) {
          return event;
        }
      }
      const host = event.headers.host;
      switch (cachedData?.value?.type) {
        case "app":
        case "page":
          return generateResult(event, localizedPath, cachedData.value, cachedData.lastModified);
        case "redirect": {
          const cacheControl = await computeCacheControl(localizedPath, "", host, cachedData.value.revalidate, cachedData.lastModified);
          return {
            type: "core",
            statusCode: cachedData.value.meta?.status ?? 307,
            body: emptyReadableStream(),
            headers: {
              ...cachedData.value.meta?.headers ?? {},
              ...cacheControl
            },
            isBase64Encoded: false
          };
        }
        case "route": {
          const cacheControl = await computeCacheControl(localizedPath, cachedData.value.body, host, cachedData.value.revalidate, cachedData.lastModified);
          const isBinary = isBinaryContentType(String(cachedData.value.meta?.headers?.["content-type"]));
          return {
            type: "core",
            statusCode: event.rewriteStatusCode ?? cachedData.value.meta?.status ?? 200,
            body: toReadableStream(cachedData.value.body, isBinary),
            headers: {
              ...cacheControl,
              ...cachedData.value.meta?.headers,
              vary: VARY_HEADER
            },
            isBase64Encoded: isBinary
          };
        }
        default:
          return event;
      }
    } catch (e) {
      debug("Error while fetching cache", e);
      return event;
    }
  }
  return event;
}

// node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
function parse2(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path3 = "";
  var tryConsume = function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  };
  var mustConsume = function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  };
  var consumeText = function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  };
  var isSafe = function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  };
  var safePattern = function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  };
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path3 += prefix;
        prefix = "";
      }
      if (path3) {
        result.push(path3);
        path3 = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path3 += value;
      continue;
    }
    if (path3) {
      result.push(path3);
      path3 = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
function compile(str, options) {
  return tokensToFunction(parse2(str, options), options);
}
function tokensToFunction(tokens, options) {
  if (options === void 0) {
    options = {};
  }
  var reFlags = flags(options);
  var _a = options.encode, encode = _a === void 0 ? function(x) {
    return x;
  } : _a, _b = options.validate, validate = _b === void 0 ? true : _b;
  var matches = tokens.map(function(token) {
    if (typeof token === "object") {
      return new RegExp("^(?:".concat(token.pattern, ")$"), reFlags);
    }
  });
  return function(data) {
    var path3 = "";
    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      if (typeof token === "string") {
        path3 += token;
        continue;
      }
      var value = data ? data[token.name] : void 0;
      var optional = token.modifier === "?" || token.modifier === "*";
      var repeat = token.modifier === "*" || token.modifier === "+";
      if (Array.isArray(value)) {
        if (!repeat) {
          throw new TypeError('Expected "'.concat(token.name, '" to not repeat, but got an array'));
        }
        if (value.length === 0) {
          if (optional)
            continue;
          throw new TypeError('Expected "'.concat(token.name, '" to not be empty'));
        }
        for (var j = 0; j < value.length; j++) {
          var segment = encode(value[j], token);
          if (validate && !matches[i].test(segment)) {
            throw new TypeError('Expected all "'.concat(token.name, '" to match "').concat(token.pattern, '", but got "').concat(segment, '"'));
          }
          path3 += token.prefix + segment + token.suffix;
        }
        continue;
      }
      if (typeof value === "string" || typeof value === "number") {
        var segment = encode(String(value), token);
        if (validate && !matches[i].test(segment)) {
          throw new TypeError('Expected "'.concat(token.name, '" to match "').concat(token.pattern, '", but got "').concat(segment, '"'));
        }
        path3 += token.prefix + segment + token.suffix;
        continue;
      }
      if (optional)
        continue;
      var typeOfMessage = repeat ? "an array" : "a string";
      throw new TypeError('Expected "'.concat(token.name, '" to be ').concat(typeOfMessage));
    }
    return path3;
  };
}
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path3 = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    };
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path: path3, index, params };
  };
}
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
function regexpToRegexp(path3, keys) {
  if (!keys)
    return path3;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path3.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path3.source);
  }
  return path3;
}
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path3) {
    return pathToRegexp(path3, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
function stringToRegexp(path3, keys, options) {
  return tokensToRegexp(parse2(path3, options), keys, options);
}
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
function pathToRegexp(path3, keys, options) {
  if (path3 instanceof RegExp)
    return regexpToRegexp(path3, keys);
  if (Array.isArray(path3))
    return arrayToRegexp(path3, keys, options);
  return stringToRegexp(path3, keys, options);
}

// node_modules/@opennextjs/aws/dist/utils/normalize-path.js
import path2 from "node:path";
function normalizeRepeatedSlashes(url) {
  const urlNoQuery = url.host + url.pathname;
  return `${url.protocol}//${urlNoQuery.replace(/\\/g, "/").replace(/\/\/+/g, "/")}${url.search}`;
}

// node_modules/@opennextjs/aws/dist/core/routing/matcher.js
init_stream();
init_logger();

// node_modules/@opennextjs/aws/dist/core/routing/routeMatcher.js
var optionalLocalePrefixRegex = `^/(?:${RoutesManifest.locales.map((locale) => `${locale}/?`).join("|")})?`;
var optionalBasepathPrefixRegex = RoutesManifest.basePath ? `^${RoutesManifest.basePath}/?` : "^/";
var optionalPrefix = optionalLocalePrefixRegex.replace("^/", optionalBasepathPrefixRegex);
function routeMatcher(routeDefinitions) {
  const regexp = routeDefinitions.map((route) => ({
    page: route.page,
    regexp: new RegExp(route.regex.replace("^/", optionalPrefix))
  }));
  const appPathsSet = /* @__PURE__ */ new Set();
  const routePathsSet = /* @__PURE__ */ new Set();
  for (const [k, v] of Object.entries(AppPathRoutesManifest)) {
    if (k.endsWith("page")) {
      appPathsSet.add(v);
    } else if (k.endsWith("route")) {
      routePathsSet.add(v);
    }
  }
  return function matchRoute(path3) {
    const foundRoutes = regexp.filter((route) => route.regexp.test(path3));
    return foundRoutes.map((foundRoute) => {
      let routeType = "page";
      if (appPathsSet.has(foundRoute.page)) {
        routeType = "app";
      } else if (routePathsSet.has(foundRoute.page)) {
        routeType = "route";
      }
      return {
        route: foundRoute.page,
        type: routeType
      };
    });
  };
}
var staticRouteMatcher = routeMatcher([
  ...RoutesManifest.routes.static,
  ...getStaticAPIRoutes()
]);
var dynamicRouteMatcher = routeMatcher(RoutesManifest.routes.dynamic);
function getStaticAPIRoutes() {
  const createRouteDefinition = (route) => ({
    page: route,
    regex: `^${route}(?:/)?$`
  });
  const dynamicRoutePages = new Set(RoutesManifest.routes.dynamic.map(({ page }) => page));
  const pagesStaticAPIRoutes = Object.keys(PagesManifest).filter((route) => route.startsWith("/api/") && !dynamicRoutePages.has(route)).map(createRouteDefinition);
  const appPathsStaticAPIRoutes = Object.values(AppPathRoutesManifest).filter((route) => (route.startsWith("/api/") || route === "/api") && !dynamicRoutePages.has(route)).map(createRouteDefinition);
  return [...pagesStaticAPIRoutes, ...appPathsStaticAPIRoutes];
}

// node_modules/@opennextjs/aws/dist/core/routing/matcher.js
var routeHasMatcher = (headers, cookies, query) => (redirect) => {
  switch (redirect.type) {
    case "header":
      return !!headers?.[redirect.key.toLowerCase()] && new RegExp(redirect.value ?? "").test(headers[redirect.key.toLowerCase()] ?? "");
    case "cookie":
      return !!cookies?.[redirect.key] && new RegExp(redirect.value ?? "").test(cookies[redirect.key] ?? "");
    case "query":
      return query[redirect.key] && Array.isArray(redirect.value) ? redirect.value.reduce((prev, current) => prev || new RegExp(current).test(query[redirect.key]), false) : new RegExp(redirect.value ?? "").test(query[redirect.key] ?? "");
    case "host":
      return headers?.host !== "" && new RegExp(redirect.value ?? "").test(headers.host);
    default:
      return false;
  }
};
function checkHas(matcher, has, inverted = false) {
  return has ? has.reduce((acc, cur) => {
    if (acc === false)
      return false;
    return inverted ? !matcher(cur) : matcher(cur);
  }, true) : true;
}
var getParamsFromSource = (source) => (value) => {
  debug("value", value);
  const _match = source(value);
  return _match ? _match.params : {};
};
var computeParamHas = (headers, cookies, query) => (has) => {
  if (!has.value)
    return {};
  const matcher = new RegExp(`^${has.value}$`);
  const fromSource = (value) => {
    const matches = value.match(matcher);
    return matches?.groups ?? {};
  };
  switch (has.type) {
    case "header":
      return fromSource(headers[has.key.toLowerCase()] ?? "");
    case "cookie":
      return fromSource(cookies[has.key] ?? "");
    case "query":
      return Array.isArray(query[has.key]) ? fromSource(query[has.key].join(",")) : fromSource(query[has.key] ?? "");
    case "host":
      return fromSource(headers.host ?? "");
  }
};
function convertMatch(match2, toDestination, destination) {
  if (!match2) {
    return destination;
  }
  const { params } = match2;
  const isUsingParams = Object.keys(params).length > 0;
  return isUsingParams ? toDestination(params) : destination;
}
function getNextConfigHeaders(event, configHeaders) {
  if (!configHeaders) {
    return {};
  }
  const matcher = routeHasMatcher(event.headers, event.cookies, event.query);
  const requestHeaders = {};
  const localizedRawPath = localizePath(event);
  for (const { headers, has, missing, regex, source, locale } of configHeaders) {
    const path3 = locale === false ? event.rawPath : localizedRawPath;
    if (new RegExp(regex).test(path3) && checkHas(matcher, has) && checkHas(matcher, missing, true)) {
      const fromSource = match(source);
      const _match = fromSource(path3);
      headers.forEach((h) => {
        try {
          const key = convertMatch(_match, compile(h.key), h.key);
          const value = convertMatch(_match, compile(h.value), h.value);
          requestHeaders[key] = value;
        } catch {
          debug(`Error matching header ${h.key} with value ${h.value}`);
          requestHeaders[h.key] = h.value;
        }
      });
    }
  }
  return requestHeaders;
}
function handleRewrites(event, rewrites) {
  const { rawPath, headers, query, cookies, url } = event;
  const localizedRawPath = localizePath(event);
  const matcher = routeHasMatcher(headers, cookies, query);
  const computeHas = computeParamHas(headers, cookies, query);
  const rewrite = rewrites.find((route) => {
    const path3 = route.locale === false ? rawPath : localizedRawPath;
    return new RegExp(route.regex).test(path3) && checkHas(matcher, route.has) && checkHas(matcher, route.missing, true);
  });
  let finalQuery = query;
  let rewrittenUrl = url;
  const isExternalRewrite = isExternal(rewrite?.destination);
  debug("isExternalRewrite", isExternalRewrite);
  if (rewrite) {
    const { pathname, protocol, hostname, queryString } = getUrlParts(rewrite.destination, isExternalRewrite);
    const pathToUse = rewrite.locale === false ? rawPath : localizedRawPath;
    debug("urlParts", { pathname, protocol, hostname, queryString });
    const toDestinationPath = compile(escapeRegex(pathname, { isPath: true }));
    const toDestinationHost = compile(escapeRegex(hostname));
    const toDestinationQuery = compile(escapeRegex(queryString));
    const params = {
      // params for the source
      ...getParamsFromSource(match(escapeRegex(rewrite.source, { isPath: true })))(pathToUse),
      // params for the has
      ...rewrite.has?.reduce((acc, cur) => {
        return Object.assign(acc, computeHas(cur));
      }, {}),
      // params for the missing
      ...rewrite.missing?.reduce((acc, cur) => {
        return Object.assign(acc, computeHas(cur));
      }, {})
    };
    const isUsingParams = Object.keys(params).length > 0;
    let rewrittenQuery = queryString;
    let rewrittenHost = hostname;
    let rewrittenPath = pathname;
    if (isUsingParams) {
      rewrittenPath = unescapeRegex(toDestinationPath(params));
      rewrittenHost = unescapeRegex(toDestinationHost(params));
      rewrittenQuery = unescapeRegex(toDestinationQuery(params));
    }
    if (NextConfig.i18n && !isExternalRewrite) {
      const strippedPathLocale = rewrittenPath.replace(new RegExp(`^/(${NextConfig.i18n.locales.join("|")})`), "");
      if (strippedPathLocale.startsWith("/api/")) {
        rewrittenPath = strippedPathLocale;
      }
    }
    rewrittenUrl = isExternalRewrite ? `${protocol}//${rewrittenHost}${rewrittenPath}` : new URL(rewrittenPath, event.url).href;
    finalQuery = {
      ...query,
      ...convertFromQueryString(rewrittenQuery)
    };
    rewrittenUrl += convertToQueryString(finalQuery);
    debug("rewrittenUrl", { rewrittenUrl, finalQuery, isUsingParams });
  }
  return {
    internalEvent: {
      ...event,
      query: finalQuery,
      rawPath: new URL(rewrittenUrl).pathname,
      url: rewrittenUrl
    },
    __rewrite: rewrite,
    isExternalRewrite
  };
}
function handleRepeatedSlashRedirect(event) {
  if (event.rawPath.match(/(\\|\/\/)/)) {
    return {
      type: event.type,
      statusCode: 308,
      headers: {
        Location: normalizeRepeatedSlashes(new URL(event.url))
      },
      body: emptyReadableStream(),
      isBase64Encoded: false
    };
  }
  return false;
}
function handleTrailingSlashRedirect(event) {
  const url = new URL(event.rawPath, "http://localhost");
  if (
    // Someone is trying to redirect to a different origin, let's not do that
    url.host !== "localhost" || NextConfig.skipTrailingSlashRedirect || // We should not apply trailing slash redirect to API routes
    event.rawPath.startsWith("/api/")
  ) {
    return false;
  }
  const emptyBody = emptyReadableStream();
  if (NextConfig.trailingSlash && !event.headers["x-nextjs-data"] && !event.rawPath.endsWith("/") && !event.rawPath.match(/[\w-]+\.[\w]+$/g)) {
    const headersLocation = event.url.split("?");
    return {
      type: event.type,
      statusCode: 308,
      headers: {
        Location: `${headersLocation[0]}/${headersLocation[1] ? `?${headersLocation[1]}` : ""}`
      },
      body: emptyBody,
      isBase64Encoded: false
    };
  }
  if (!NextConfig.trailingSlash && event.rawPath.endsWith("/") && event.rawPath !== "/") {
    const headersLocation = event.url.split("?");
    return {
      type: event.type,
      statusCode: 308,
      headers: {
        Location: `${headersLocation[0].replace(/\/$/, "")}${headersLocation[1] ? `?${headersLocation[1]}` : ""}`
      },
      body: emptyBody,
      isBase64Encoded: false
    };
  }
  return false;
}
function handleRedirects(event, redirects) {
  const repeatedSlashRedirect = handleRepeatedSlashRedirect(event);
  if (repeatedSlashRedirect)
    return repeatedSlashRedirect;
  const trailingSlashRedirect = handleTrailingSlashRedirect(event);
  if (trailingSlashRedirect)
    return trailingSlashRedirect;
  const localeRedirect = handleLocaleRedirect(event);
  if (localeRedirect)
    return localeRedirect;
  const { internalEvent, __rewrite } = handleRewrites(event, redirects.filter((r) => !r.internal));
  if (__rewrite && !__rewrite.internal) {
    return {
      type: event.type,
      statusCode: __rewrite.statusCode ?? 308,
      headers: {
        Location: internalEvent.url
      },
      body: emptyReadableStream(),
      isBase64Encoded: false
    };
  }
}
function fixDataPage(internalEvent, buildId) {
  const { rawPath, query } = internalEvent;
  const basePath = NextConfig.basePath ?? "";
  const dataPattern = `${basePath}/_next/data/${buildId}`;
  if (rawPath.startsWith("/_next/data") && !rawPath.startsWith(dataPattern)) {
    return {
      type: internalEvent.type,
      statusCode: 404,
      body: toReadableStream("{}"),
      headers: {
        "Content-Type": "application/json"
      },
      isBase64Encoded: false
    };
  }
  if (rawPath.startsWith(dataPattern) && rawPath.endsWith(".json")) {
    const newPath = `${basePath}${rawPath.slice(dataPattern.length, -".json".length).replace(/^\/index$/, "/")}`;
    query.__nextDataReq = "1";
    return {
      ...internalEvent,
      rawPath: newPath,
      query,
      url: new URL(`${newPath}${convertToQueryString(query)}`, internalEvent.url).href
    };
  }
  return internalEvent;
}
function handleFallbackFalse(internalEvent, prerenderManifest) {
  const { rawPath } = internalEvent;
  const { dynamicRoutes = {}, routes = {} } = prerenderManifest ?? {};
  const prerenderedFallbackRoutes = Object.entries(dynamicRoutes).filter(([, { fallback }]) => fallback === false);
  const routeFallback = prerenderedFallbackRoutes.some(([, { routeRegex }]) => {
    const routeRegexExp = new RegExp(routeRegex);
    return routeRegexExp.test(rawPath);
  });
  const locales = NextConfig.i18n?.locales;
  const routesAlreadyHaveLocale = locales?.includes(rawPath.split("/")[1]) || // If we don't use locales, we don't need to add the default locale
  locales === void 0;
  let localizedPath = routesAlreadyHaveLocale ? rawPath : `/${NextConfig.i18n?.defaultLocale}${rawPath}`;
  if (
    // Not if localizedPath is "/" tho, because that would not make it find `isPregenerated` below since it would be try to match an empty string.
    localizedPath !== "/" && NextConfig.trailingSlash && localizedPath.endsWith("/")
  ) {
    localizedPath = localizedPath.slice(0, -1);
  }
  const matchedStaticRoute = staticRouteMatcher(localizedPath);
  const prerenderedFallbackRoutesName = prerenderedFallbackRoutes.map(([name]) => name);
  const matchedDynamicRoute = dynamicRouteMatcher(localizedPath).filter(({ route }) => !prerenderedFallbackRoutesName.includes(route));
  const isPregenerated = Object.keys(routes).includes(localizedPath);
  if (routeFallback && !isPregenerated && matchedStaticRoute.length === 0 && matchedDynamicRoute.length === 0) {
    return {
      event: {
        ...internalEvent,
        rawPath: "/404",
        url: constructNextUrl(internalEvent.url, "/404"),
        headers: {
          ...internalEvent.headers,
          "x-invoke-status": "404"
        }
      },
      isISR: false
    };
  }
  return {
    event: internalEvent,
    isISR: routeFallback || isPregenerated
  };
}

// node_modules/@opennextjs/aws/dist/core/routing/middleware.js
init_stream();
init_utils();
var middlewareManifest = MiddlewareManifest;
var functionsConfigManifest = FunctionsConfigManifest;
var middleMatch = getMiddlewareMatch(middlewareManifest, functionsConfigManifest);
var REDIRECTS = /* @__PURE__ */ new Set([301, 302, 303, 307, 308]);
function defaultMiddlewareLoader() {
  return Promise.resolve().then(() => (init_edgeFunctionHandler(), edgeFunctionHandler_exports));
}
async function handleMiddleware(internalEvent, initialSearch, middlewareLoader = defaultMiddlewareLoader) {
  const headers = internalEvent.headers;
  if (headers["x-isr"] && headers["x-prerender-revalidate"] === PrerenderManifest?.preview?.previewModeId)
    return internalEvent;
  const normalizedPath = localizePath(internalEvent);
  const hasMatch = middleMatch.some((r) => r.test(normalizedPath));
  if (!hasMatch)
    return internalEvent;
  const initialUrl = new URL(normalizedPath, internalEvent.url);
  initialUrl.search = initialSearch;
  const url = initialUrl.href;
  const middleware = await middlewareLoader();
  const result = await middleware.default({
    // `geo` is pre Next 15.
    geo: {
      // The city name is percent-encoded.
      // See https://github.com/vercel/vercel/blob/4cb6143/packages/functions/src/headers.ts#L94C19-L94C37
      city: decodeURIComponent(headers["x-open-next-city"]),
      country: headers["x-open-next-country"],
      region: headers["x-open-next-region"],
      latitude: headers["x-open-next-latitude"],
      longitude: headers["x-open-next-longitude"]
    },
    headers,
    method: internalEvent.method || "GET",
    nextConfig: {
      basePath: NextConfig.basePath,
      i18n: NextConfig.i18n,
      trailingSlash: NextConfig.trailingSlash
    },
    url,
    body: convertBodyToReadableStream(internalEvent.method, internalEvent.body)
  });
  const statusCode = result.status;
  const responseHeaders = result.headers;
  const reqHeaders = {};
  const resHeaders = {};
  const filteredHeaders = [
    "x-middleware-override-headers",
    "x-middleware-next",
    "x-middleware-rewrite",
    // We need to drop `content-encoding` because it will be decoded
    "content-encoding"
  ];
  const xMiddlewareKey = "x-middleware-request-";
  responseHeaders.forEach((value, key) => {
    if (key.startsWith(xMiddlewareKey)) {
      const k = key.substring(xMiddlewareKey.length);
      reqHeaders[k] = value;
    } else {
      if (filteredHeaders.includes(key.toLowerCase()))
        return;
      if (key.toLowerCase() === "set-cookie") {
        resHeaders[key] = resHeaders[key] ? [...resHeaders[key], value] : [value];
      } else if (REDIRECTS.has(statusCode) && key.toLowerCase() === "location") {
        resHeaders[key] = normalizeLocationHeader(value, internalEvent.url);
      } else {
        resHeaders[key] = value;
      }
    }
  });
  const rewriteUrl = responseHeaders.get("x-middleware-rewrite");
  let isExternalRewrite = false;
  let middlewareQuery = internalEvent.query;
  let newUrl = internalEvent.url;
  if (rewriteUrl) {
    newUrl = rewriteUrl;
    if (isExternal(newUrl, internalEvent.headers.host)) {
      isExternalRewrite = true;
    } else {
      const rewriteUrlObject = new URL(rewriteUrl);
      middlewareQuery = getQueryFromSearchParams(rewriteUrlObject.searchParams);
      if ("__nextDataReq" in internalEvent.query) {
        middlewareQuery.__nextDataReq = internalEvent.query.__nextDataReq;
      }
    }
  }
  if (!rewriteUrl && !responseHeaders.get("x-middleware-next")) {
    const body = result.body ?? emptyReadableStream();
    return {
      type: internalEvent.type,
      statusCode,
      headers: resHeaders,
      body,
      isBase64Encoded: false
    };
  }
  return {
    responseHeaders: resHeaders,
    url: newUrl,
    rawPath: new URL(newUrl).pathname,
    type: internalEvent.type,
    headers: { ...internalEvent.headers, ...reqHeaders },
    body: internalEvent.body,
    method: internalEvent.method,
    query: middlewareQuery,
    cookies: internalEvent.cookies,
    remoteAddress: internalEvent.remoteAddress,
    isExternalRewrite,
    rewriteStatusCode: rewriteUrl && !isExternalRewrite ? statusCode : void 0
  };
}

// node_modules/@opennextjs/aws/dist/core/routingHandler.js
var MIDDLEWARE_HEADER_PREFIX = "x-middleware-response-";
var MIDDLEWARE_HEADER_PREFIX_LEN = MIDDLEWARE_HEADER_PREFIX.length;
var INTERNAL_HEADER_PREFIX = "x-opennext-";
var INTERNAL_HEADER_INITIAL_URL = `${INTERNAL_HEADER_PREFIX}initial-url`;
var INTERNAL_HEADER_LOCALE = `${INTERNAL_HEADER_PREFIX}locale`;
var INTERNAL_HEADER_RESOLVED_ROUTES = `${INTERNAL_HEADER_PREFIX}resolved-routes`;
var INTERNAL_HEADER_REWRITE_STATUS_CODE = `${INTERNAL_HEADER_PREFIX}rewrite-status-code`;
var INTERNAL_EVENT_REQUEST_ID = `${INTERNAL_HEADER_PREFIX}request-id`;
var geoHeaderToNextHeader = {
  "x-open-next-city": "x-vercel-ip-city",
  "x-open-next-country": "x-vercel-ip-country",
  "x-open-next-region": "x-vercel-ip-country-region",
  "x-open-next-latitude": "x-vercel-ip-latitude",
  "x-open-next-longitude": "x-vercel-ip-longitude"
};
function applyMiddlewareHeaders(eventOrResult, middlewareHeaders) {
  const isResult = isInternalResult(eventOrResult);
  const headers = eventOrResult.headers;
  const keyPrefix = isResult ? "" : MIDDLEWARE_HEADER_PREFIX;
  Object.entries(middlewareHeaders).forEach(([key, value]) => {
    if (value) {
      headers[keyPrefix + key] = Array.isArray(value) ? value.join(",") : value;
    }
  });
}
async function routingHandler(event, { assetResolver }) {
  try {
    for (const [openNextGeoName, nextGeoName] of Object.entries(geoHeaderToNextHeader)) {
      const value = event.headers[openNextGeoName];
      if (value) {
        event.headers[nextGeoName] = value;
      }
    }
    for (const key of Object.keys(event.headers)) {
      if (key.startsWith(INTERNAL_HEADER_PREFIX) || key.startsWith(MIDDLEWARE_HEADER_PREFIX)) {
        delete event.headers[key];
      }
    }
    let headers = getNextConfigHeaders(event, ConfigHeaders);
    let eventOrResult = fixDataPage(event, BuildId);
    if (isInternalResult(eventOrResult)) {
      return eventOrResult;
    }
    const redirect = handleRedirects(eventOrResult, RoutesManifest.redirects);
    if (redirect) {
      redirect.headers.Location = normalizeLocationHeader(redirect.headers.Location, event.url, true);
      debug("redirect", redirect);
      return redirect;
    }
    const middlewareEventOrResult = await handleMiddleware(
      eventOrResult,
      // We need to pass the initial search without any decoding
      // TODO: we'd need to refactor InternalEvent to include the initial querystring directly
      // Should be done in another PR because it is a breaking change
      new URL(event.url).search
    );
    if (isInternalResult(middlewareEventOrResult)) {
      return middlewareEventOrResult;
    }
    const middlewareHeadersPrioritized = globalThis.openNextConfig.dangerous?.middlewareHeadersOverrideNextConfigHeaders ?? false;
    if (middlewareHeadersPrioritized) {
      headers = {
        ...headers,
        ...middlewareEventOrResult.responseHeaders
      };
    } else {
      headers = {
        ...middlewareEventOrResult.responseHeaders,
        ...headers
      };
    }
    let isExternalRewrite = middlewareEventOrResult.isExternalRewrite ?? false;
    eventOrResult = middlewareEventOrResult;
    if (!isExternalRewrite) {
      const beforeRewrite = handleRewrites(eventOrResult, RoutesManifest.rewrites.beforeFiles);
      eventOrResult = beforeRewrite.internalEvent;
      isExternalRewrite = beforeRewrite.isExternalRewrite;
      if (!isExternalRewrite) {
        const assetResult = await assetResolver?.maybeGetAssetResult?.(eventOrResult);
        if (assetResult) {
          applyMiddlewareHeaders(assetResult, headers);
          return assetResult;
        }
      }
    }
    const foundStaticRoute = staticRouteMatcher(eventOrResult.rawPath);
    const isStaticRoute = !isExternalRewrite && foundStaticRoute.length > 0;
    if (!(isStaticRoute || isExternalRewrite)) {
      const afterRewrite = handleRewrites(eventOrResult, RoutesManifest.rewrites.afterFiles);
      eventOrResult = afterRewrite.internalEvent;
      isExternalRewrite = afterRewrite.isExternalRewrite;
    }
    let isISR = false;
    if (!isExternalRewrite) {
      const fallbackResult = handleFallbackFalse(eventOrResult, PrerenderManifest);
      eventOrResult = fallbackResult.event;
      isISR = fallbackResult.isISR;
    }
    const foundDynamicRoute = dynamicRouteMatcher(eventOrResult.rawPath);
    const isDynamicRoute = !isExternalRewrite && foundDynamicRoute.length > 0;
    if (!(isDynamicRoute || isStaticRoute || isExternalRewrite)) {
      const fallbackRewrites = handleRewrites(eventOrResult, RoutesManifest.rewrites.fallback);
      eventOrResult = fallbackRewrites.internalEvent;
      isExternalRewrite = fallbackRewrites.isExternalRewrite;
    }
    const isNextImageRoute = eventOrResult.rawPath.startsWith("/_next/image");
    const isRouteFoundBeforeAllRewrites = isStaticRoute || isDynamicRoute || isExternalRewrite;
    if (!(isRouteFoundBeforeAllRewrites || isNextImageRoute || // We need to check again once all rewrites have been applied
    staticRouteMatcher(eventOrResult.rawPath).length > 0 || dynamicRouteMatcher(eventOrResult.rawPath).length > 0)) {
      eventOrResult = {
        ...eventOrResult,
        rawPath: "/404",
        url: constructNextUrl(eventOrResult.url, "/404"),
        headers: {
          ...eventOrResult.headers,
          "x-middleware-response-cache-control": "private, no-cache, no-store, max-age=0, must-revalidate"
        }
      };
    }
    if (globalThis.openNextConfig.dangerous?.enableCacheInterception && !isInternalResult(eventOrResult)) {
      debug("Cache interception enabled");
      eventOrResult = await cacheInterceptor(eventOrResult);
      if (isInternalResult(eventOrResult)) {
        applyMiddlewareHeaders(eventOrResult, headers);
        return eventOrResult;
      }
    }
    applyMiddlewareHeaders(eventOrResult, headers);
    const resolvedRoutes = [
      ...foundStaticRoute,
      ...foundDynamicRoute
    ];
    debug("resolvedRoutes", resolvedRoutes);
    return {
      internalEvent: eventOrResult,
      isExternalRewrite,
      origin: false,
      isISR,
      resolvedRoutes,
      initialURL: event.url,
      locale: NextConfig.i18n ? detectLocale(eventOrResult, NextConfig.i18n) : void 0,
      rewriteStatusCode: middlewareEventOrResult.rewriteStatusCode
    };
  } catch (e) {
    error("Error in routingHandler", e);
    return {
      internalEvent: {
        type: "core",
        method: "GET",
        rawPath: "/500",
        url: constructNextUrl(event.url, "/500"),
        headers: {
          ...event.headers
        },
        query: event.query,
        cookies: event.cookies,
        remoteAddress: event.remoteAddress
      },
      isExternalRewrite: false,
      origin: false,
      isISR: false,
      resolvedRoutes: [],
      initialURL: event.url,
      locale: NextConfig.i18n ? detectLocale(event, NextConfig.i18n) : void 0
    };
  }
}
function isInternalResult(eventOrResult) {
  return eventOrResult != null && "statusCode" in eventOrResult;
}

// node_modules/@opennextjs/aws/dist/adapters/middleware.js
globalThis.internalFetch = fetch;
globalThis.__openNextAls = new AsyncLocalStorage();
var defaultHandler = async (internalEvent, options) => {
  const middlewareConfig = globalThis.openNextConfig.middleware;
  const originResolver = await resolveOriginResolver(middlewareConfig?.originResolver);
  const externalRequestProxy = await resolveProxyRequest(middlewareConfig?.override?.proxyExternalRequest);
  const assetResolver = await resolveAssetResolver(middlewareConfig?.assetResolver);
  const requestId = Math.random().toString(36);
  return runWithOpenNextRequestContext({
    isISRRevalidation: internalEvent.headers["x-isr"] === "1",
    waitUntil: options?.waitUntil,
    requestId
  }, async () => {
    const result = await routingHandler(internalEvent, { assetResolver });
    if ("internalEvent" in result) {
      debug("Middleware intercepted event", internalEvent);
      if (!result.isExternalRewrite) {
        const origin = await originResolver.resolve(result.internalEvent.rawPath);
        return {
          type: "middleware",
          internalEvent: {
            ...result.internalEvent,
            headers: {
              ...result.internalEvent.headers,
              [INTERNAL_HEADER_INITIAL_URL]: internalEvent.url,
              [INTERNAL_HEADER_RESOLVED_ROUTES]: JSON.stringify(result.resolvedRoutes),
              [INTERNAL_EVENT_REQUEST_ID]: requestId,
              [INTERNAL_HEADER_REWRITE_STATUS_CODE]: String(result.rewriteStatusCode)
            }
          },
          isExternalRewrite: result.isExternalRewrite,
          origin,
          isISR: result.isISR,
          initialURL: result.initialURL,
          resolvedRoutes: result.resolvedRoutes
        };
      }
      try {
        return externalRequestProxy.proxy(result.internalEvent);
      } catch (e) {
        error("External request failed.", e);
        return {
          type: "middleware",
          internalEvent: {
            ...result.internalEvent,
            headers: {
              ...result.internalEvent.headers,
              [INTERNAL_EVENT_REQUEST_ID]: requestId
            },
            rawPath: "/500",
            url: constructNextUrl(result.internalEvent.url, "/500"),
            method: "GET"
          },
          // On error we need to rewrite to the 500 page which is an internal rewrite
          isExternalRewrite: false,
          origin: false,
          isISR: result.isISR,
          initialURL: result.internalEvent.url,
          resolvedRoutes: [{ route: "/500", type: "page" }]
        };
      }
    }
    if (process.env.OPEN_NEXT_REQUEST_ID_HEADER || globalThis.openNextDebug) {
      result.headers[INTERNAL_EVENT_REQUEST_ID] = requestId;
    }
    debug("Middleware response", result);
    return result;
  });
};
var handler2 = await createGenericHandler({
  handler: defaultHandler,
  type: "middleware"
});
var middleware_default = {
  fetch: handler2
};
export {
  middleware_default as default,
  handler2 as handler
};
