import { fileURLToPath as __eveFileURLToPath } from "node:url";
import { dirname as __eveDirname } from "node:path";
const __filename = __eveFileURLToPath(import.meta.url);
__eveDirname(__filename);
import { r as __require, t as __commonJSMin } from "../_runtime.mjs";
//#region node_modules/eve/node_modules/undici/lib/core/symbols.js
var require_symbols = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = {
		kClose: Symbol("close"),
		kDestroy: Symbol("destroy"),
		kDispatch: Symbol("dispatch"),
		kUrl: Symbol("url"),
		kWriting: Symbol("writing"),
		kResuming: Symbol("resuming"),
		kQueue: Symbol("queue"),
		kConnect: Symbol("connect"),
		kConnecting: Symbol("connecting"),
		kKeepAliveDefaultTimeout: Symbol("default keep alive timeout"),
		kKeepAliveMaxTimeout: Symbol("max keep alive timeout"),
		kKeepAliveTimeoutThreshold: Symbol("keep alive timeout threshold"),
		kKeepAliveTimeoutValue: Symbol("keep alive timeout"),
		kKeepAlive: Symbol("keep alive"),
		kHeadersTimeout: Symbol("headers timeout"),
		kBodyTimeout: Symbol("body timeout"),
		kServerName: Symbol("server name"),
		kLocalAddress: Symbol("local address"),
		kHost: Symbol("host"),
		kNoRef: Symbol("no ref"),
		kBodyUsed: Symbol("used"),
		kBody: Symbol("abstracted request body"),
		kRunning: Symbol("running"),
		kBlocking: Symbol("blocking"),
		kPending: Symbol("pending"),
		kSize: Symbol("size"),
		kBusy: Symbol("busy"),
		kQueued: Symbol("queued"),
		kFree: Symbol("free"),
		kConnected: Symbol("connected"),
		kClosed: Symbol("closed"),
		kNeedDrain: Symbol("need drain"),
		kReset: Symbol("reset"),
		kDestroyed: Symbol.for("nodejs.stream.destroyed"),
		kResume: Symbol("resume"),
		kOnError: Symbol("on error"),
		kMaxHeadersSize: Symbol("max headers size"),
		kRunningIdx: Symbol("running index"),
		kPendingIdx: Symbol("pending index"),
		kError: Symbol("error"),
		kClients: Symbol("clients"),
		kClient: Symbol("client"),
		kParser: Symbol("parser"),
		kOnDestroyed: Symbol("destroy callbacks"),
		kPipelining: Symbol("pipelining"),
		kSocket: Symbol("socket"),
		kHostHeader: Symbol("host header"),
		kConnector: Symbol("connector"),
		kStrictContentLength: Symbol("strict content length"),
		kMaxRedirections: Symbol("maxRedirections"),
		kMaxRequests: Symbol("maxRequestsPerClient"),
		kProxy: Symbol("proxy agent options"),
		kCounter: Symbol("socket request counter"),
		kMaxResponseSize: Symbol("max response size"),
		kHTTP2Session: Symbol("http2Session"),
		kHTTP2SessionState: Symbol("http2Session state"),
		kRetryHandlerDefaultRetry: Symbol("retry agent default retry"),
		kConstruct: Symbol("constructable"),
		kListeners: Symbol("listeners"),
		kHTTPContext: Symbol("http context"),
		kMaxConcurrentStreams: Symbol("max concurrent streams"),
		kHostAuthority: Symbol("host authority"),
		kHTTP2InitialWindowSize: Symbol("http2 initial window size"),
		kHTTP2ConnectionWindowSize: Symbol("http2 connection window size"),
		kEnableConnectProtocol: Symbol("http2session connect protocol"),
		kRemoteSettings: Symbol("http2session remote settings"),
		kHTTP2Stream: Symbol("http2session client stream"),
		kPingInterval: Symbol("ping interval"),
		kNoProxyAgent: Symbol("no proxy agent"),
		kHttpProxyAgent: Symbol("http proxy agent"),
		kHttpsProxyAgent: Symbol("https proxy agent"),
		kSocks5ProxyAgent: Symbol("socks5 proxy agent")
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/util/timers.js
var require_timers = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	/**
	* This module offers an optimized timer implementation designed for scenarios
	* where high precision is not critical.
	*
	* The timer achieves faster performance by using a low-resolution approach,
	* with an accuracy target of within 500ms. This makes it particularly useful
	* for timers with delays of 1 second or more, where exact timing is less
	* crucial.
	*
	* It's important to note that Node.js timers are inherently imprecise, as
	* delays can occur due to the event loop being blocked by other operations.
	* Consequently, timers may trigger later than their scheduled time.
	*/
	/**
	* The fastNow variable contains the internal fast timer clock value.
	*
	* @type {number}
	*/
	let fastNow = 0;
	/**
	* RESOLUTION_MS represents the target resolution time in milliseconds.
	*
	* @type {number}
	* @default 1000
	*/
	const RESOLUTION_MS = 1e3;
	/**
	* TICK_MS defines the desired interval in milliseconds between each tick.
	* The target value is set to half the resolution time, minus 1 ms, to account
	* for potential event loop overhead.
	*
	* @type {number}
	* @default 499
	*/
	const TICK_MS = 499;
	/**
	* fastNowTimeout is a Node.js timer used to manage and process
	* the FastTimers stored in the `fastTimers` array.
	*
	* @type {NodeJS.Timeout}
	*/
	let fastNowTimeout;
	/**
	* The kFastTimer symbol is used to identify FastTimer instances.
	*
	* @type {Symbol}
	*/
	const kFastTimer = Symbol("kFastTimer");
	/**
	* The fastTimers array contains all active FastTimers.
	*
	* @type {FastTimer[]}
	*/
	const fastTimers = [];
	/**
	* These constants represent the various states of a FastTimer.
	*/
	/**
	* The `NOT_IN_LIST` constant indicates that the FastTimer is not included
	* in the `fastTimers` array. Timers with this status will not be processed
	* during the next tick by the `onTick` function.
	*
	* A FastTimer can be re-added to the `fastTimers` array by invoking the
	* `refresh` method on the FastTimer instance.
	*
	* @type {-2}
	*/
	const NOT_IN_LIST = -2;
	/**
	* The `TO_BE_CLEARED` constant indicates that the FastTimer is scheduled
	* for removal from the `fastTimers` array. A FastTimer in this state will
	* be removed in the next tick by the `onTick` function and will no longer
	* be processed.
	*
	* This status is also set when the `clear` method is called on the FastTimer instance.
	*
	* @type {-1}
	*/
	const TO_BE_CLEARED = -1;
	/**
	* The `PENDING` constant signifies that the FastTimer is awaiting processing
	* in the next tick by the `onTick` function. Timers with this status will have
	* their `_idleStart` value set and their status updated to `ACTIVE` in the next tick.
	*
	* @type {0}
	*/
	const PENDING = 0;
	/**
	* The `ACTIVE` constant indicates that the FastTimer is active and waiting
	* for its timer to expire. During the next tick, the `onTick` function will
	* check if the timer has expired, and if so, it will execute the associated callback.
	*
	* @type {1}
	*/
	const ACTIVE = 1;
	/**
	* The onTick function processes the fastTimers array.
	*
	* @returns {void}
	*/
	function onTick() {
		/**
		* Increment the fastNow value by the TICK_MS value, despite the actual time
		* that has passed since the last tick. This approach ensures independence
		* from the system clock and delays caused by a blocked event loop.
		*
		* @type {number}
		*/
		fastNow += TICK_MS;
		/**
		* The `idx` variable is used to iterate over the `fastTimers` array.
		* Expired timers are removed by replacing them with the last element in the array.
		* Consequently, `idx` is only incremented when the current element is not removed.
		*
		* @type {number}
		*/
		let idx = 0;
		/**
		* The len variable will contain the length of the fastTimers array
		* and will be decremented when a FastTimer should be removed from the
		* fastTimers array.
		*
		* @type {number}
		*/
		let len = fastTimers.length;
		while (idx < len) {
			/**
			* @type {FastTimer}
			*/
			const timer = fastTimers[idx];
			if (timer._state === PENDING) {
				timer._idleStart = fastNow - TICK_MS;
				timer._state = ACTIVE;
			} else if (timer._state === ACTIVE && fastNow >= timer._idleStart + timer._idleTimeout) {
				timer._state = TO_BE_CLEARED;
				timer._idleStart = -1;
				timer._onTimeout(timer._timerArg);
			}
			if (timer._state === TO_BE_CLEARED) {
				timer._state = NOT_IN_LIST;
				if (--len !== 0) fastTimers[idx] = fastTimers[len];
			} else ++idx;
		}
		fastTimers.length = len;
		if (fastTimers.length !== 0) refreshTimeout();
	}
	function refreshTimeout() {
		if (fastNowTimeout?.refresh) fastNowTimeout.refresh();
		else {
			clearTimeout(fastNowTimeout);
			fastNowTimeout = setTimeout(onTick, TICK_MS);
			fastNowTimeout?.unref();
		}
	}
	/**
	* The `FastTimer` class is a data structure designed to store and manage
	* timer information.
	*/
	var FastTimer = class {
		[kFastTimer] = true;
		/**
		* The state of the timer, which can be one of the following:
		* - NOT_IN_LIST (-2)
		* - TO_BE_CLEARED (-1)
		* - PENDING (0)
		* - ACTIVE (1)
		*
		* @type {-2|-1|0|1}
		* @private
		*/
		_state = NOT_IN_LIST;
		/**
		* The number of milliseconds to wait before calling the callback.
		*
		* @type {number}
		* @private
		*/
		_idleTimeout = -1;
		/**
		* The time in milliseconds when the timer was started. This value is used to
		* calculate when the timer should expire.
		*
		* @type {number}
		* @default -1
		* @private
		*/
		_idleStart = -1;
		/**
		* The function to be executed when the timer expires.
		* @type {Function}
		* @private
		*/
		_onTimeout;
		/**
		* The argument to be passed to the callback when the timer expires.
		*
		* @type {*}
		* @private
		*/
		_timerArg;
		/**
		* @constructor
		* @param {Function} callback A function to be executed after the timer
		* expires.
		* @param {number} delay The time, in milliseconds that the timer should wait
		* before the specified function or code is executed.
		* @param {*} arg
		*/
		constructor(callback, delay, arg) {
			this._onTimeout = callback;
			this._idleTimeout = delay;
			this._timerArg = arg;
			this.refresh();
		}
		/**
		* Sets the timer's start time to the current time, and reschedules the timer
		* to call its callback at the previously specified duration adjusted to the
		* current time.
		* Using this on a timer that has already called its callback will reactivate
		* the timer.
		*
		* @returns {void}
		*/
		refresh() {
			if (this._state === NOT_IN_LIST) fastTimers.push(this);
			if (!fastNowTimeout || fastTimers.length === 1) refreshTimeout();
			this._state = PENDING;
		}
		/**
		* The `clear` method cancels the timer, preventing it from executing.
		*
		* @returns {void}
		* @private
		*/
		clear() {
			this._state = TO_BE_CLEARED;
			this._idleStart = -1;
		}
	};
	/**
	* This module exports a setTimeout and clearTimeout function that can be
	* used as a drop-in replacement for the native functions.
	*/
	module.exports = {
		/**
		* The setTimeout() method sets a timer which executes a function once the
		* timer expires.
		* @param {Function} callback A function to be executed after the timer
		* expires.
		* @param {number} delay The time, in milliseconds that the timer should
		* wait before the specified function or code is executed.
		* @param {*} [arg] An optional argument to be passed to the callback function
		* when the timer expires.
		* @returns {NodeJS.Timeout|FastTimer}
		*/
		setTimeout(callback, delay, arg) {
			return delay <= RESOLUTION_MS ? setTimeout(callback, delay, arg) : new FastTimer(callback, delay, arg);
		},
		/**
		* The clearTimeout method cancels an instantiated Timer previously created
		* by calling setTimeout.
		*
		* @param {NodeJS.Timeout|FastTimer} timeout
		*/
		clearTimeout(timeout) {
			if (timeout[kFastTimer])
 /**
			* @type {FastTimer}
			*/
			timeout.clear();
			else clearTimeout(timeout);
		},
		/**
		* The setFastTimeout() method sets a fastTimer which executes a function once
		* the timer expires.
		* @param {Function} callback A function to be executed after the timer
		* expires.
		* @param {number} delay The time, in milliseconds that the timer should
		* wait before the specified function or code is executed.
		* @param {*} [arg] An optional argument to be passed to the callback function
		* when the timer expires.
		* @returns {FastTimer}
		*/
		setFastTimeout(callback, delay, arg) {
			return new FastTimer(callback, delay, arg);
		},
		/**
		* The clearTimeout method cancels an instantiated FastTimer previously
		* created by calling setFastTimeout.
		*
		* @param {FastTimer} timeout
		*/
		clearFastTimeout(timeout) {
			timeout.clear();
		},
		/**
		* The now method returns the value of the internal fast timer clock.
		*
		* @returns {number}
		*/
		now() {
			return fastNow;
		},
		/**
		* Trigger the onTick function to process the fastTimers array.
		* Exported for testing purposes only.
		* Marking as deprecated to discourage any use outside of testing.
		* @deprecated
		* @param {number} [delay=0] The delay in milliseconds to add to the now value.
		*/
		tick(delay = 0) {
			fastNow += delay - RESOLUTION_MS + 1;
			onTick();
			onTick();
		},
		/**
		* Reset FastTimers.
		* Exported for testing purposes only.
		* Marking as deprecated to discourage any use outside of testing.
		* @deprecated
		*/
		reset() {
			fastNow = 0;
			fastTimers.length = 0;
			clearTimeout(fastNowTimeout);
			fastNowTimeout = null;
		},
		/**
		* Exporting for testing purposes only.
		* Marking as deprecated to discourage any use outside of testing.
		* @deprecated
		*/
		kFastTimer
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/core/errors.js
var require_errors = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const kUndiciError = Symbol.for("undici.error.UND_ERR");
	var UndiciError = class extends Error {
		constructor(message, options) {
			super(message, options);
			this.name = "UndiciError";
			this.code = "UND_ERR";
		}
		static [Symbol.hasInstance](instance) {
			return instance && instance[kUndiciError] === true;
		}
		get [kUndiciError]() {
			return true;
		}
	};
	const kConnectTimeoutError = Symbol.for("undici.error.UND_ERR_CONNECT_TIMEOUT");
	var ConnectTimeoutError = class extends UndiciError {
		constructor(message) {
			super(message);
			this.name = "ConnectTimeoutError";
			this.message = message || "Connect Timeout Error";
			this.code = "UND_ERR_CONNECT_TIMEOUT";
		}
		static [Symbol.hasInstance](instance) {
			return instance && instance[kConnectTimeoutError] === true;
		}
		get [kConnectTimeoutError]() {
			return true;
		}
	};
	const kHeadersTimeoutError = Symbol.for("undici.error.UND_ERR_HEADERS_TIMEOUT");
	var HeadersTimeoutError = class extends UndiciError {
		constructor(message) {
			super(message);
			this.name = "HeadersTimeoutError";
			this.message = message || "Headers Timeout Error";
			this.code = "UND_ERR_HEADERS_TIMEOUT";
		}
		static [Symbol.hasInstance](instance) {
			return instance && instance[kHeadersTimeoutError] === true;
		}
		get [kHeadersTimeoutError]() {
			return true;
		}
	};
	const kHeadersOverflowError = Symbol.for("undici.error.UND_ERR_HEADERS_OVERFLOW");
	var HeadersOverflowError = class extends UndiciError {
		constructor(message) {
			super(message);
			this.name = "HeadersOverflowError";
			this.message = message || "Headers Overflow Error";
			this.code = "UND_ERR_HEADERS_OVERFLOW";
		}
		static [Symbol.hasInstance](instance) {
			return instance && instance[kHeadersOverflowError] === true;
		}
		get [kHeadersOverflowError]() {
			return true;
		}
	};
	const kBodyTimeoutError = Symbol.for("undici.error.UND_ERR_BODY_TIMEOUT");
	var BodyTimeoutError = class extends UndiciError {
		constructor(message) {
			super(message);
			this.name = "BodyTimeoutError";
			this.message = message || "Body Timeout Error";
			this.code = "UND_ERR_BODY_TIMEOUT";
		}
		static [Symbol.hasInstance](instance) {
			return instance && instance[kBodyTimeoutError] === true;
		}
		get [kBodyTimeoutError]() {
			return true;
		}
	};
	const kInvalidArgumentError = Symbol.for("undici.error.UND_ERR_INVALID_ARG");
	var InvalidArgumentError = class extends UndiciError {
		constructor(message) {
			super(message);
			this.name = "InvalidArgumentError";
			this.message = message || "Invalid Argument Error";
			this.code = "UND_ERR_INVALID_ARG";
		}
		static [Symbol.hasInstance](instance) {
			return instance && instance[kInvalidArgumentError] === true;
		}
		get [kInvalidArgumentError]() {
			return true;
		}
	};
	const kInvalidReturnValueError = Symbol.for("undici.error.UND_ERR_INVALID_RETURN_VALUE");
	var InvalidReturnValueError = class extends UndiciError {
		constructor(message) {
			super(message);
			this.name = "InvalidReturnValueError";
			this.message = message || "Invalid Return Value Error";
			this.code = "UND_ERR_INVALID_RETURN_VALUE";
		}
		static [Symbol.hasInstance](instance) {
			return instance && instance[kInvalidReturnValueError] === true;
		}
		get [kInvalidReturnValueError]() {
			return true;
		}
	};
	const kAbortError = Symbol.for("undici.error.UND_ERR_ABORT");
	var AbortError = class extends UndiciError {
		constructor(message) {
			super(message);
			this.name = "AbortError";
			this.message = message || "The operation was aborted";
			this.code = "UND_ERR_ABORT";
		}
		static [Symbol.hasInstance](instance) {
			return instance && instance[kAbortError] === true;
		}
		get [kAbortError]() {
			return true;
		}
	};
	const kRequestAbortedError = Symbol.for("undici.error.UND_ERR_ABORTED");
	var RequestAbortedError = class extends AbortError {
		constructor(message) {
			super(message);
			this.name = "AbortError";
			this.message = message || "Request aborted";
			this.code = "UND_ERR_ABORTED";
		}
		static [Symbol.hasInstance](instance) {
			return instance && instance[kRequestAbortedError] === true;
		}
		get [kRequestAbortedError]() {
			return true;
		}
	};
	const kInformationalError = Symbol.for("undici.error.UND_ERR_INFO");
	var InformationalError = class extends UndiciError {
		constructor(message, options) {
			super(message, options);
			this.name = "InformationalError";
			this.message = message || "Request information";
			this.code = "UND_ERR_INFO";
		}
		static [Symbol.hasInstance](instance) {
			return instance && instance[kInformationalError] === true;
		}
		get [kInformationalError]() {
			return true;
		}
	};
	const kRequestContentLengthMismatchError = Symbol.for("undici.error.UND_ERR_REQ_CONTENT_LENGTH_MISMATCH");
	var RequestContentLengthMismatchError = class extends UndiciError {
		constructor(message) {
			super(message);
			this.name = "RequestContentLengthMismatchError";
			this.message = message || "Request body length does not match content-length header";
			this.code = "UND_ERR_REQ_CONTENT_LENGTH_MISMATCH";
		}
		static [Symbol.hasInstance](instance) {
			return instance && instance[kRequestContentLengthMismatchError] === true;
		}
		get [kRequestContentLengthMismatchError]() {
			return true;
		}
	};
	const kResponseContentLengthMismatchError = Symbol.for("undici.error.UND_ERR_RES_CONTENT_LENGTH_MISMATCH");
	var ResponseContentLengthMismatchError = class extends UndiciError {
		constructor(message) {
			super(message);
			this.name = "ResponseContentLengthMismatchError";
			this.message = message || "Response body length does not match content-length header";
			this.code = "UND_ERR_RES_CONTENT_LENGTH_MISMATCH";
		}
		static [Symbol.hasInstance](instance) {
			return instance && instance[kResponseContentLengthMismatchError] === true;
		}
		get [kResponseContentLengthMismatchError]() {
			return true;
		}
	};
	const kClientDestroyedError = Symbol.for("undici.error.UND_ERR_DESTROYED");
	var ClientDestroyedError = class extends UndiciError {
		constructor(message) {
			super(message);
			this.name = "ClientDestroyedError";
			this.message = message || "The client is destroyed";
			this.code = "UND_ERR_DESTROYED";
		}
		static [Symbol.hasInstance](instance) {
			return instance && instance[kClientDestroyedError] === true;
		}
		get [kClientDestroyedError]() {
			return true;
		}
	};
	const kClientClosedError = Symbol.for("undici.error.UND_ERR_CLOSED");
	var ClientClosedError = class extends UndiciError {
		constructor(message) {
			super(message);
			this.name = "ClientClosedError";
			this.message = message || "The client is closed";
			this.code = "UND_ERR_CLOSED";
		}
		static [Symbol.hasInstance](instance) {
			return instance && instance[kClientClosedError] === true;
		}
		get [kClientClosedError]() {
			return true;
		}
	};
	const kSocketError = Symbol.for("undici.error.UND_ERR_SOCKET");
	var SocketError = class extends UndiciError {
		constructor(message, socket) {
			super(message);
			this.name = "SocketError";
			this.message = message || "Socket error";
			this.code = "UND_ERR_SOCKET";
			this.socket = socket;
		}
		static [Symbol.hasInstance](instance) {
			return instance && instance[kSocketError] === true;
		}
		get [kSocketError]() {
			return true;
		}
	};
	const kNotSupportedError = Symbol.for("undici.error.UND_ERR_NOT_SUPPORTED");
	var NotSupportedError = class extends UndiciError {
		constructor(message) {
			super(message);
			this.name = "NotSupportedError";
			this.message = message || "Not supported error";
			this.code = "UND_ERR_NOT_SUPPORTED";
		}
		static [Symbol.hasInstance](instance) {
			return instance && instance[kNotSupportedError] === true;
		}
		get [kNotSupportedError]() {
			return true;
		}
	};
	const kBalancedPoolMissingUpstreamError = Symbol.for("undici.error.UND_ERR_BPL_MISSING_UPSTREAM");
	var BalancedPoolMissingUpstreamError = class extends UndiciError {
		constructor(message) {
			super(message);
			this.name = "MissingUpstreamError";
			this.message = message || "No upstream has been added to the BalancedPool";
			this.code = "UND_ERR_BPL_MISSING_UPSTREAM";
		}
		static [Symbol.hasInstance](instance) {
			return instance && instance[kBalancedPoolMissingUpstreamError] === true;
		}
		get [kBalancedPoolMissingUpstreamError]() {
			return true;
		}
	};
	const kHTTPParserError = Symbol.for("undici.error.UND_ERR_HTTP_PARSER");
	var HTTPParserError = class extends Error {
		constructor(message, code, data) {
			super(message);
			this.name = "HTTPParserError";
			this.code = code ? `HPE_${code}` : void 0;
			this.data = data ? data.toString() : void 0;
		}
		static [Symbol.hasInstance](instance) {
			return instance && instance[kHTTPParserError] === true;
		}
		get [kHTTPParserError]() {
			return true;
		}
	};
	const kResponseExceededMaxSizeError = Symbol.for("undici.error.UND_ERR_RES_EXCEEDED_MAX_SIZE");
	var ResponseExceededMaxSizeError = class extends UndiciError {
		constructor(message) {
			super(message);
			this.name = "ResponseExceededMaxSizeError";
			this.message = message || "Response content exceeded max size";
			this.code = "UND_ERR_RES_EXCEEDED_MAX_SIZE";
		}
		static [Symbol.hasInstance](instance) {
			return instance && instance[kResponseExceededMaxSizeError] === true;
		}
		get [kResponseExceededMaxSizeError]() {
			return true;
		}
	};
	const kRequestRetryError = Symbol.for("undici.error.UND_ERR_REQ_RETRY");
	var RequestRetryError = class extends UndiciError {
		constructor(message, code, { headers, data }) {
			super(message);
			this.name = "RequestRetryError";
			this.message = message || "Request retry error";
			this.code = "UND_ERR_REQ_RETRY";
			this.statusCode = code;
			this.data = data;
			this.headers = headers;
		}
		static [Symbol.hasInstance](instance) {
			return instance && instance[kRequestRetryError] === true;
		}
		get [kRequestRetryError]() {
			return true;
		}
	};
	const kResponseError = Symbol.for("undici.error.UND_ERR_RESPONSE");
	var ResponseError = class extends UndiciError {
		constructor(message, code, { headers, body }) {
			super(message);
			this.name = "ResponseError";
			this.message = message || "Response error";
			this.code = "UND_ERR_RESPONSE";
			this.statusCode = code;
			this.body = body;
			this.headers = headers;
		}
		static [Symbol.hasInstance](instance) {
			return instance && instance[kResponseError] === true;
		}
		get [kResponseError]() {
			return true;
		}
	};
	const kSecureProxyConnectionError = Symbol.for("undici.error.UND_ERR_PRX_TLS");
	var SecureProxyConnectionError = class extends UndiciError {
		constructor(cause, message, options = {}) {
			super(message, {
				cause,
				...options
			});
			this.name = "SecureProxyConnectionError";
			this.message = message || "Secure Proxy Connection failed";
			this.code = "UND_ERR_PRX_TLS";
			this.cause = cause;
		}
		static [Symbol.hasInstance](instance) {
			return instance && instance[kSecureProxyConnectionError] === true;
		}
		get [kSecureProxyConnectionError]() {
			return true;
		}
	};
	const kProxyConnectionError = Symbol.for("undici.error.UND_ERR_PRX_CONN");
	var ProxyConnectionError = class extends UndiciError {
		constructor(cause, message, options = {}) {
			super(message, {
				cause,
				...options
			});
			this.name = "ProxyConnectionError";
			this.message = message || "Proxy Connection failed";
			this.code = "UND_ERR_PRX_CONN";
			this.cause = cause;
		}
		static [Symbol.hasInstance](instance) {
			return instance && instance[kProxyConnectionError] === true;
		}
		get [kProxyConnectionError]() {
			return true;
		}
	};
	const kMaxOriginsReachedError = Symbol.for("undici.error.UND_ERR_MAX_ORIGINS_REACHED");
	var MaxOriginsReachedError = class extends UndiciError {
		constructor(message) {
			super(message);
			this.name = "MaxOriginsReachedError";
			this.message = message || "Maximum allowed origins reached";
			this.code = "UND_ERR_MAX_ORIGINS_REACHED";
		}
		static [Symbol.hasInstance](instance) {
			return instance && instance[kMaxOriginsReachedError] === true;
		}
		get [kMaxOriginsReachedError]() {
			return true;
		}
	};
	var Socks5ProxyError = class extends UndiciError {
		constructor(message, code) {
			super(message);
			this.name = "Socks5ProxyError";
			this.message = message || "SOCKS5 proxy error";
			this.code = code || "UND_ERR_SOCKS5";
		}
	};
	const kMessageSizeExceededError = Symbol.for("undici.error.UND_ERR_WS_MESSAGE_SIZE_EXCEEDED");
	var MessageSizeExceededError = class extends UndiciError {
		constructor(message) {
			super(message);
			this.name = "MessageSizeExceededError";
			this.message = message || "Max decompressed message size exceeded";
			this.code = "UND_ERR_WS_MESSAGE_SIZE_EXCEEDED";
		}
		static [Symbol.hasInstance](instance) {
			return instance && instance[kMessageSizeExceededError] === true;
		}
		get [kMessageSizeExceededError]() {
			return true;
		}
	};
	module.exports = {
		AbortError,
		HTTPParserError,
		UndiciError,
		HeadersTimeoutError,
		HeadersOverflowError,
		BodyTimeoutError,
		RequestContentLengthMismatchError,
		ConnectTimeoutError,
		InvalidArgumentError,
		InvalidReturnValueError,
		RequestAbortedError,
		ClientDestroyedError,
		ClientClosedError,
		InformationalError,
		SocketError,
		NotSupportedError,
		ResponseContentLengthMismatchError,
		BalancedPoolMissingUpstreamError,
		ResponseExceededMaxSizeError,
		RequestRetryError,
		ResponseError,
		SecureProxyConnectionError,
		ProxyConnectionError,
		MaxOriginsReachedError,
		Socks5ProxyError,
		MessageSizeExceededError
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/core/constants.js
var require_constants$4 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	/**
	* @see https://developer.mozilla.org/docs/Web/HTTP/Headers
	*/
	const wellknownHeaderNames = [
		"Accept",
		"Accept-Encoding",
		"Accept-Language",
		"Accept-Ranges",
		"Access-Control-Allow-Credentials",
		"Access-Control-Allow-Headers",
		"Access-Control-Allow-Methods",
		"Access-Control-Allow-Origin",
		"Access-Control-Expose-Headers",
		"Access-Control-Max-Age",
		"Access-Control-Request-Headers",
		"Access-Control-Request-Method",
		"Age",
		"Allow",
		"Alt-Svc",
		"Alt-Used",
		"Authorization",
		"Cache-Control",
		"Clear-Site-Data",
		"Connection",
		"Content-Disposition",
		"Content-Encoding",
		"Content-Language",
		"Content-Length",
		"Content-Location",
		"Content-Range",
		"Content-Security-Policy",
		"Content-Security-Policy-Report-Only",
		"Content-Type",
		"Cookie",
		"Cross-Origin-Embedder-Policy",
		"Cross-Origin-Opener-Policy",
		"Cross-Origin-Resource-Policy",
		"Date",
		"Device-Memory",
		"Downlink",
		"ECT",
		"ETag",
		"Expect",
		"Expect-CT",
		"Expires",
		"Forwarded",
		"From",
		"Host",
		"If-Match",
		"If-Modified-Since",
		"If-None-Match",
		"If-Range",
		"If-Unmodified-Since",
		"Keep-Alive",
		"Last-Modified",
		"Link",
		"Location",
		"Max-Forwards",
		"Origin",
		"Permissions-Policy",
		"Pragma",
		"Proxy-Authenticate",
		"Proxy-Authorization",
		"RTT",
		"Range",
		"Referer",
		"Referrer-Policy",
		"Refresh",
		"Retry-After",
		"Sec-WebSocket-Accept",
		"Sec-WebSocket-Extensions",
		"Sec-WebSocket-Key",
		"Sec-WebSocket-Protocol",
		"Sec-WebSocket-Version",
		"Server",
		"Server-Timing",
		"Service-Worker-Allowed",
		"Service-Worker-Navigation-Preload",
		"Set-Cookie",
		"SourceMap",
		"Strict-Transport-Security",
		"Supports-Loading-Mode",
		"TE",
		"Timing-Allow-Origin",
		"Trailer",
		"Transfer-Encoding",
		"Upgrade",
		"Upgrade-Insecure-Requests",
		"User-Agent",
		"Vary",
		"Via",
		"WWW-Authenticate",
		"X-Content-Type-Options",
		"X-DNS-Prefetch-Control",
		"X-Frame-Options",
		"X-Permitted-Cross-Domain-Policies",
		"X-Powered-By",
		"X-Requested-With",
		"X-XSS-Protection"
	];
	/** @type {Record<typeof wellknownHeaderNames[number]|Lowercase<typeof wellknownHeaderNames[number]>, string>} */
	const headerNameLowerCasedRecord = {};
	Object.setPrototypeOf(headerNameLowerCasedRecord, null);
	for (let i = 0; i < wellknownHeaderNames.length; ++i) {
		const key = wellknownHeaderNames[i];
		const lowerCasedKey = key.toLowerCase();
		headerNameLowerCasedRecord[key] = headerNameLowerCasedRecord[lowerCasedKey] = lowerCasedKey;
	}
	module.exports = {
		wellknownHeaderNames,
		headerNameLowerCasedRecord
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/core/tree.js
var require_tree = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { wellknownHeaderNames, headerNameLowerCasedRecord } = require_constants$4();
	var TstNode = class TstNode {
		/** @type {any} */
		value = null;
		/** @type {null | TstNode} */
		left = null;
		/** @type {null | TstNode} */
		middle = null;
		/** @type {null | TstNode} */
		right = null;
		/** @type {number} */
		code;
		/**
		* @param {string} key
		* @param {any} value
		* @param {number} index
		*/
		constructor(key, value, index) {
			if (index === void 0 || index >= key.length) throw new TypeError("Unreachable");
			if ((this.code = key.charCodeAt(index)) > 127) throw new TypeError("key must be ascii string");
			if (key.length !== ++index) this.middle = new TstNode(key, value, index);
			else this.value = value;
		}
		/**
		* @param {string} key
		* @param {any} value
		* @returns {void}
		*/
		add(key, value) {
			const length = key.length;
			if (length === 0) throw new TypeError("Unreachable");
			let index = 0;
			/**
			* @type {TstNode}
			*/
			let node = this;
			while (true) {
				const code = key.charCodeAt(index);
				if (code > 127) throw new TypeError("key must be ascii string");
				if (node.code === code) {
					if (length === ++index) {
						node.value = value;
						break;
					} else if (node.middle !== null) node = node.middle;
					else {
						node.middle = new TstNode(key, value, index);
						break;
					}
				} else if (node.code < code) {
					if (node.left !== null) node = node.left;
					else {
						node.left = new TstNode(key, value, index);
						break;
					}
				} else if (node.right !== null) node = node.right;
				else {
					node.right = new TstNode(key, value, index);
					break;
				}
			}
		}
		/**
		* @param {Uint8Array} key
		* @returns {TstNode | null}
		*/
		search(key) {
			const keylength = key.length;
			let index = 0;
			/**
			* @type {TstNode|null}
			*/
			let node = this;
			while (node !== null && index < keylength) {
				let code = key[index];
				if (code <= 90 && code >= 65) code |= 32;
				while (node !== null) {
					if (code === node.code) {
						if (keylength === ++index) return node;
						node = node.middle;
						break;
					}
					node = node.code < code ? node.left : node.right;
				}
			}
			return null;
		}
	};
	var TernarySearchTree = class {
		/** @type {TstNode | null} */
		node = null;
		/**
		* @param {string} key
		* @param {any} value
		* @returns {void}
		* */
		insert(key, value) {
			if (this.node === null) this.node = new TstNode(key, value, 0);
			else this.node.add(key, value);
		}
		/**
		* @param {Uint8Array} key
		* @returns {any}
		*/
		lookup(key) {
			return this.node?.search(key)?.value ?? null;
		}
	};
	const tree = new TernarySearchTree();
	for (let i = 0; i < wellknownHeaderNames.length; ++i) {
		const key = headerNameLowerCasedRecord[wellknownHeaderNames[i]];
		tree.insert(key, key);
	}
	module.exports = {
		TernarySearchTree,
		tree
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/core/util.js
var require_util$5 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const assert$32 = __require("node:assert");
	const { kDestroyed, kBodyUsed, kListeners, kBody } = require_symbols();
	const { IncomingMessage } = __require("node:http");
	const stream = __require("node:stream");
	const net$3 = __require("node:net");
	const { stringify } = __require("node:querystring");
	const { EventEmitter: EE$1, addAbortListener: addAbortListenerNative } = __require("node:events");
	const timers = require_timers();
	const { InvalidArgumentError, ConnectTimeoutError } = require_errors();
	const { headerNameLowerCasedRecord } = require_constants$4();
	const { tree } = require_tree();
	var BodyAsyncIterable = class {
		constructor(body) {
			this[kBody] = body;
			this[kBodyUsed] = false;
		}
		async *[Symbol.asyncIterator]() {
			assert$32(!this[kBodyUsed], "disturbed");
			this[kBodyUsed] = true;
			yield* this[kBody];
		}
	};
	function noop() {}
	/**
	* @param {*} body
	* @returns {*}
	*/
	function wrapRequestBody(body) {
		if (isStream(body)) {
			if (bodyLength(body) === 0) body.on("data", function() {
				assert$32(false);
			});
			if (typeof body.readableDidRead !== "boolean") {
				body[kBodyUsed] = false;
				EE$1.prototype.on.call(body, "data", function() {
					this[kBodyUsed] = true;
				});
			}
			return body;
		} else if (body && typeof body.pipeTo === "function") return new BodyAsyncIterable(body);
		else if (body && isFormDataLike(body)) return body;
		else if (body && typeof body !== "string" && !ArrayBuffer.isView(body) && isIterable(body)) return new BodyAsyncIterable(body);
		else return body;
	}
	/**
	* @param {*} obj
	* @returns {obj is import('node:stream').Stream}
	*/
	function isStream(obj) {
		return obj && typeof obj === "object" && typeof obj.pipe === "function" && typeof obj.on === "function";
	}
	/**
	* @param {*} object
	* @returns {object is Blob}
	*/
	function isBlobLike(object) {
		return object instanceof Blob;
	}
	/**
	* @param {string} url The path to check for query strings or fragments.
	* @returns {boolean} Returns true if the path contains a query string or fragment.
	*/
	function pathHasQueryOrFragment(url) {
		return url.includes("?") || url.includes("#");
	}
	/**
	* @param {string} url The URL to add the query params to
	* @param {import('node:querystring').ParsedUrlQueryInput} queryParams The object to serialize into a URL query string
	* @returns {string} The URL with the query params added
	*/
	function serializePathWithQuery(url, queryParams) {
		if (pathHasQueryOrFragment(url)) throw new Error("Query params cannot be passed when url already contains \"?\" or \"#\".");
		const stringified = stringify(queryParams);
		if (stringified) url += "?" + stringified;
		return url;
	}
	/**
	* @param {number|string|undefined} port
	* @returns {boolean}
	*/
	function isValidPort(port) {
		const value = parseInt(port, 10);
		return value === Number(port) && value >= 0 && value <= 65535;
	}
	/**
	* Check if the value is a valid http or https prefixed string.
	*
	* @param {string} value
	* @returns {boolean}
	*/
	function isHttpOrHttpsPrefixed(value) {
		return value != null && value[0] === "h" && value[1] === "t" && value[2] === "t" && value[3] === "p" && (value[4] === ":" || value[4] === "s" && value[5] === ":");
	}
	/**
	* @param {string|URL|Record<string,string>} url
	* @returns {URL}
	*/
	function parseURL(url) {
		if (typeof url === "string") {
			/**
			* @type {URL}
			*/
			url = new URL(url);
			if (!isHttpOrHttpsPrefixed(url.origin || url.protocol)) throw new InvalidArgumentError("Invalid URL protocol: the URL must start with `http:` or `https:`.");
			return url;
		}
		if (!url || typeof url !== "object") throw new InvalidArgumentError("Invalid URL: The URL argument must be a non-null object.");
		if (!(url instanceof URL)) {
			if (url.port != null && url.port !== "" && isValidPort(url.port) === false) throw new InvalidArgumentError("Invalid URL: port must be a valid integer or a string representation of an integer.");
			if (url.path != null && typeof url.path !== "string") throw new InvalidArgumentError("Invalid URL path: the path must be a string or null/undefined.");
			if (url.pathname != null && typeof url.pathname !== "string") throw new InvalidArgumentError("Invalid URL pathname: the pathname must be a string or null/undefined.");
			if (url.hostname != null && typeof url.hostname !== "string") throw new InvalidArgumentError("Invalid URL hostname: the hostname must be a string or null/undefined.");
			if (url.origin != null && typeof url.origin !== "string") throw new InvalidArgumentError("Invalid URL origin: the origin must be a string or null/undefined.");
			if (!isHttpOrHttpsPrefixed(url.origin || url.protocol)) throw new InvalidArgumentError("Invalid URL protocol: the URL must start with `http:` or `https:`.");
			const port = url.port != null ? url.port : url.protocol === "https:" ? 443 : 80;
			let origin = url.origin != null ? url.origin : `${url.protocol || ""}//${url.hostname || ""}:${port}`;
			let path = url.path != null ? url.path : `${url.pathname || ""}${url.search || ""}`;
			if (origin[origin.length - 1] === "/") origin = origin.slice(0, origin.length - 1);
			if (path && path[0] !== "/") path = `/${path}`;
			return new URL(`${origin}${path}`);
		}
		if (!isHttpOrHttpsPrefixed(url.origin || url.protocol)) throw new InvalidArgumentError("Invalid URL protocol: the URL must start with `http:` or `https:`.");
		return url;
	}
	/**
	* @param {string|URL|Record<string, string>} url
	* @returns {URL}
	*/
	function parseOrigin(url) {
		url = parseURL(url);
		if (url.pathname !== "/" || url.search || url.hash) throw new InvalidArgumentError("invalid url");
		return url;
	}
	/**
	* @param {string} host
	* @returns {string}
	*/
	function getHostname(host) {
		if (host[0] === "[") {
			const idx = host.indexOf("]");
			assert$32(idx !== -1);
			return host.substring(1, idx);
		}
		const idx = host.indexOf(":");
		if (idx === -1) return host;
		return host.substring(0, idx);
	}
	/**
	* IP addresses are not valid server names per RFC6066
	* Currently, the only server names supported are DNS hostnames
	* @param {string|null} host
	* @returns {string|null}
	*/
	function getServerName(host) {
		if (!host) return null;
		assert$32(typeof host === "string");
		const servername = getHostname(host);
		if (net$3.isIP(servername)) return "";
		return servername;
	}
	/**
	* @function
	* @template T
	* @param {T} obj
	* @returns {T}
	*/
	function deepClone(obj) {
		return JSON.parse(JSON.stringify(obj));
	}
	/**
	* @param {*} obj
	* @returns {obj is AsyncIterable}
	*/
	function isAsyncIterable(obj) {
		return !!(obj != null && typeof obj[Symbol.asyncIterator] === "function");
	}
	/**
	* @param {*} obj
	* @returns {obj is Iterable}
	*/
	function isIterable(obj) {
		return !!(obj != null && (typeof obj[Symbol.iterator] === "function" || typeof obj[Symbol.asyncIterator] === "function"));
	}
	/**
	* Checks whether an object has a safe Symbol.iterator — i.e. one that is
	* either own or inherited from a non-Object.prototype chain.  This prevents
	* prototype-pollution attacks from injecting a fake iterator on
	* Object.prototype.
	* @param {object} obj
	* @returns {boolean}
	*/
	function hasSafeIterator(obj) {
		const prototype = Object.getPrototypeOf(obj);
		return Object.hasOwn(obj, Symbol.iterator) || prototype != null && prototype !== Object.prototype && typeof obj[Symbol.iterator] === "function";
	}
	/**
	* @param {Blob|Buffer|import ('stream').Stream} body
	* @returns {number|null}
	*/
	function bodyLength(body) {
		if (body == null) return 0;
		else if (isStream(body)) {
			const state = body._readableState;
			return state && state.objectMode === false && state.ended === true && Number.isFinite(state.length) ? state.length : null;
		} else if (isBlobLike(body)) return body.size != null ? body.size : null;
		else if (isBuffer(body)) return body.byteLength;
		return null;
	}
	/**
	* @param {import ('stream').Stream} body
	* @returns {boolean}
	*/
	function isDestroyed(body) {
		return body && !!(body.destroyed || body[kDestroyed] || stream.isDestroyed?.(body));
	}
	/**
	* @param {import ('stream').Stream} stream
	* @param {Error} [err]
	* @returns {void}
	*/
	function destroy(stream, err) {
		if (stream == null || !isStream(stream) || isDestroyed(stream)) return;
		if (typeof stream.destroy === "function") {
			if (Object.getPrototypeOf(stream).constructor === IncomingMessage) stream.socket = null;
			try {
				stream.destroy(err);
			} catch {}
		} else if (err) queueMicrotask(() => {
			stream.emit("error", err);
		});
		if (stream.destroyed !== true) stream[kDestroyed] = true;
	}
	const KEEPALIVE_TIMEOUT_EXPR = /timeout=(\d+)/;
	/**
	* @param {string} val
	* @returns {number | null}
	*/
	function parseKeepAliveTimeout(val) {
		const m = val.match(KEEPALIVE_TIMEOUT_EXPR);
		return m ? parseInt(m[1], 10) * 1e3 : null;
	}
	/**
	* Retrieves a header name and returns its lowercase value.
	* @param {string | Buffer} value Header name
	* @returns {string}
	*/
	function headerNameToString(value) {
		return typeof value === "string" ? headerNameLowerCasedRecord[value] ?? value.toLowerCase() : tree.lookup(value) ?? value.toString("latin1").toLowerCase();
	}
	/**
	* Receive the buffer as a string and return its lowercase value.
	* @param {Buffer} value Header name
	* @returns {string}
	*/
	function bufferToLowerCasedHeaderName(value) {
		return tree.lookup(value) ?? value.toString("latin1").toLowerCase();
	}
	/**
	* @param {(Buffer | string)[]} headers
	* @param {Record<string, string | string[]>} [obj]
	* @returns {Record<string, string | string[]>}
	*/
	function parseHeaders(headers, obj) {
		if (obj === void 0) obj = {};
		for (let i = 0; i < headers.length; i += 2) {
			const key = headerNameToString(headers[i]);
			let val = obj[key];
			if (val !== void 0) {
				if (!Object.hasOwn(obj, key)) {
					const headersValue = typeof headers[i + 1] === "string" ? headers[i + 1] : Array.isArray(headers[i + 1]) ? headers[i + 1].map((x) => x.toString("latin1")) : headers[i + 1].toString("latin1");
					if (key === "__proto__") Object.defineProperty(obj, key, {
						value: headersValue,
						enumerable: true,
						configurable: true,
						writable: true
					});
					else obj[key] = headersValue;
				} else {
					if (typeof val === "string") {
						val = [val];
						obj[key] = val;
					}
					val.push(headers[i + 1].toString("latin1"));
				}
			} else {
				const headersValue = typeof headers[i + 1] === "string" ? headers[i + 1] : Array.isArray(headers[i + 1]) ? headers[i + 1].map((x) => x.toString("latin1")) : headers[i + 1].toString("latin1");
				obj[key] = headersValue;
			}
		}
		return obj;
	}
	/**
	* @param {Buffer[] | string[] | Record<string, string | string[]> | null | undefined} headers
	* @returns {string[]}
	*/
	function parseRawHeaders(headers) {
		if (headers == null) return [];
		if (!Array.isArray(headers)) {
			const rawHeaders = [];
			for (const [name, value] of Object.entries(headers)) if (Array.isArray(value)) for (const entry of value) rawHeaders.push(name, `${entry}`);
			else rawHeaders.push(name, `${value}`);
			return rawHeaders;
		}
		const headersLength = headers.length;
		/**
		* @type {string[]}
		*/
		const ret = new Array(headersLength);
		let key;
		let val;
		for (let n = 0; n < headersLength; n += 2) {
			key = headers[n];
			val = headers[n + 1];
			typeof key !== "string" && (key = key.toString());
			typeof val !== "string" && (val = val.toString("latin1"));
			ret[n] = key;
			ret[n + 1] = val;
		}
		return ret;
	}
	/**
	* @param {Record<string, string | string[]>} headers
	* @returns {Buffer[]}
	*/
	function toRawHeaders(headers) {
		const rawHeaders = [];
		for (const [name, value] of Object.entries(headers)) if (Array.isArray(value)) for (const entry of value) rawHeaders.push(Buffer.from(name, "latin1"), Buffer.from(`${entry}`, "latin1"));
		else rawHeaders.push(Buffer.from(name, "latin1"), Buffer.from(`${value}`, "latin1"));
		return rawHeaders;
	}
	/**
	* @param {string[]} headers
	* @param {Buffer[]} headers
	*/
	function encodeRawHeaders(headers) {
		if (!Array.isArray(headers)) throw new TypeError("expected headers to be an array");
		return headers.map((x) => Buffer.from(x));
	}
	/**
	* @param {*} buffer
	* @returns {buffer is Buffer}
	*/
	function isBuffer(buffer) {
		return buffer instanceof Uint8Array || Buffer.isBuffer(buffer);
	}
	/**
	* Asserts that the handler object is a request handler.
	*
	* @param {object} handler
	* @param {string} method
	* @param {string} [upgrade]
	* @returns {asserts handler is import('../api/api-request').RequestHandler}
	*/
	function assertRequestHandler(handler, method, upgrade) {
		if (!handler || typeof handler !== "object") throw new InvalidArgumentError("handler must be an object");
		if (typeof handler.onRequestStart !== "function") throw new InvalidArgumentError("invalid onRequestStart method");
		if (typeof handler.onResponseError !== "function") throw new InvalidArgumentError("invalid onResponseError method");
		if (typeof handler.onBodySent !== "function" && handler.onBodySent !== void 0) throw new InvalidArgumentError("invalid onBodySent method");
		if (typeof handler.onRequestSent !== "function" && handler.onRequestSent !== void 0) throw new InvalidArgumentError("invalid onRequestSent method");
		if (upgrade || method === "CONNECT") {
			if (typeof handler.onRequestUpgrade !== "function") throw new InvalidArgumentError("invalid onRequestUpgrade method");
		} else {
			if (typeof handler.onResponseStart !== "function") throw new InvalidArgumentError("invalid onResponseStart method");
			if (typeof handler.onResponseData !== "function") throw new InvalidArgumentError("invalid onResponseData method");
			if (typeof handler.onResponseEnd !== "function") throw new InvalidArgumentError("invalid onResponseEnd method");
		}
	}
	/**
	* A body is disturbed if it has been read from and it cannot be re-used without
	* losing state or data.
	* @param {import('node:stream').Readable} body
	* @returns {boolean}
	*/
	function isDisturbed(body) {
		return !!(body && (stream.isDisturbed(body) || body[kBodyUsed]));
	}
	/**
	* @typedef {object} SocketInfo
	* @property {string} [localAddress]
	* @property {number} [localPort]
	* @property {string} [remoteAddress]
	* @property {number} [remotePort]
	* @property {string} [remoteFamily]
	* @property {number} [timeout]
	* @property {number} bytesWritten
	* @property {number} bytesRead
	*/
	/**
	* @param {import('net').Socket} socket
	* @returns {SocketInfo}
	*/
	function getSocketInfo(socket) {
		return {
			localAddress: socket.localAddress,
			localPort: socket.localPort,
			remoteAddress: socket.remoteAddress,
			remotePort: socket.remotePort,
			remoteFamily: socket.remoteFamily,
			timeout: socket.timeout,
			bytesWritten: socket.bytesWritten,
			bytesRead: socket.bytesRead
		};
	}
	/**
	* @param {Iterable} iterable
	* @returns {ReadableStream}
	*/
	function ReadableStreamFrom(iterable) {
		let iterator;
		return new ReadableStream({
			start() {
				iterator = iterable[Symbol.asyncIterator]();
			},
			pull(controller) {
				return iterator.next().then(({ done, value }) => {
					if (done) return queueMicrotask(() => {
						controller.close();
						controller.byobRequest?.respond(0);
					});
					else {
						const buf = Buffer.isBuffer(value) ? value : Buffer.from(value);
						if (buf.byteLength) return controller.enqueue(new Uint8Array(buf));
						else return this.pull(controller);
					}
				});
			},
			cancel() {
				return iterator.return();
			},
			type: "bytes"
		});
	}
	/**
	* The object should be a FormData instance and contains all the required
	* methods.
	* @param {*} object
	* @returns {object is FormData}
	*/
	function isFormDataLike(object) {
		return object && typeof object === "object" && typeof object.append === "function" && typeof object.delete === "function" && typeof object.get === "function" && typeof object.getAll === "function" && typeof object.has === "function" && typeof object.set === "function" && object[Symbol.toStringTag] === "FormData";
	}
	function addAbortListener(signal, listener) {
		if (!signal || "aborted" in signal) return addAbortListenerNative(signal, listener)[Symbol.dispose];
		if (typeof signal.addEventListener === "function") {
			signal.addEventListener("abort", listener, { once: true });
			return () => signal.removeEventListener("abort", listener);
		}
		signal.once("abort", listener);
		return () => signal.removeListener("abort", listener);
	}
	const validTokenChars = new Uint8Array([
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		1,
		0,
		1,
		1,
		1,
		1,
		1,
		0,
		0,
		1,
		1,
		0,
		1,
		1,
		0,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		0,
		0,
		0,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		0,
		1,
		0,
		1,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0
	]);
	/**
	* @see https://tools.ietf.org/html/rfc7230#section-3.2.6
	* @param {number} c
	* @returns {boolean}
	*/
	function isTokenCharCode(c) {
		return validTokenChars[c] === 1;
	}
	const tokenRegExp = /^[\^_`a-zA-Z\-0-9!#$%&'*+.|~]+$/;
	/**
	* @param {string} characters
	* @returns {boolean}
	*/
	function isValidHTTPToken(characters) {
		if (characters.length >= 12) return tokenRegExp.test(characters);
		if (characters.length === 0) return false;
		for (let i = 0; i < characters.length; i++) if (validTokenChars[characters.charCodeAt(i)] !== 1) return false;
		return true;
	}
	/**
	* Matches if val contains an invalid field-vchar
	*  field-value    = *( field-content / obs-fold )
	*  field-content  = field-vchar [ 1*( SP / HTAB ) field-vchar ]
	*  field-vchar    = VCHAR / obs-text
	*/
	const headerCharRegex = /[^\t\x20-\x7e\x80-\xff]/;
	/**
	* @param {string} characters
	* @returns {boolean}
	*/
	function isValidHeaderValue(characters) {
		return !headerCharRegex.test(characters);
	}
	const rangeHeaderRegex = /^bytes (\d+)-(\d+)\/(\d+|\*)?$/;
	/**
	* @typedef {object} RangeHeader
	* @property {number} start
	* @property {number | null} end
	* @property {number | null} size
	*/
	/**
	* Parse accordingly to RFC 9110
	* @see https://www.rfc-editor.org/rfc/rfc9110#field.content-range
	* @param {string} [range]
	* @returns {RangeHeader|null}
	*/
	function parseRangeHeader(range) {
		if (range == null || range === "") return {
			start: 0,
			end: null,
			size: null
		};
		if (!range) return null;
		const m = rangeHeaderRegex.exec(range);
		return m ? {
			start: parseInt(m[1]),
			end: m[2] ? parseInt(m[2]) : null,
			size: m[3] && m[3] !== "*" ? parseInt(m[3]) : null
		} : null;
	}
	/**
	* @template {import("events").EventEmitter} T
	* @param {T} obj
	* @param {string} name
	* @param {(...args: any[]) => void} listener
	* @returns {T}
	*/
	function addListener(obj, name, listener) {
		(obj[kListeners] ??= []).push([name, listener]);
		obj.on(name, listener);
		return obj;
	}
	/**
	* @template {import("events").EventEmitter} T
	* @param {T} obj
	* @returns {T}
	*/
	function removeAllListeners(obj) {
		if (obj[kListeners] != null) {
			for (const [name, listener] of obj[kListeners]) obj.removeListener(name, listener);
			obj[kListeners] = null;
		}
		return obj;
	}
	/**
	* @param {import ('../dispatcher/client')} client
	* @param {import ('../core/request')} request
	* @param {Error} err
	*/
	function errorRequest(client, request, err) {
		try {
			request.onResponseError(err);
			assert$32(request.aborted);
		} catch (err) {
			client.emit("error", err);
		}
	}
	/**
	* @param {WeakRef<net.Socket>} socketWeakRef
	* @param {object} opts
	* @param {number} opts.timeout
	* @param {string} opts.hostname
	* @param {number} opts.port
	* @returns {() => void}
	*/
	const setupConnectTimeout = process.platform === "win32" ? (socketWeakRef, opts) => {
		if (!opts.timeout) return noop;
		let s1 = null;
		let s2 = null;
		const fastTimer = timers.setFastTimeout(() => {
			s1 = setImmediate(() => {
				s2 = setImmediate(() => onConnectTimeout(socketWeakRef.deref(), opts));
			});
		}, opts.timeout);
		return () => {
			timers.clearFastTimeout(fastTimer);
			clearImmediate(s1);
			clearImmediate(s2);
		};
	} : (socketWeakRef, opts) => {
		if (!opts.timeout) return noop;
		let s1 = null;
		const fastTimer = timers.setFastTimeout(() => {
			s1 = setImmediate(() => {
				onConnectTimeout(socketWeakRef.deref(), opts);
			});
		}, opts.timeout);
		return () => {
			timers.clearFastTimeout(fastTimer);
			clearImmediate(s1);
		};
	};
	/**
	* @param {net.Socket} socket
	* @param {object} opts
	* @param {number} opts.timeout
	* @param {string} opts.hostname
	* @param {number} opts.port
	*/
	function onConnectTimeout(socket, opts) {
		if (socket == null) return;
		let message = "Connect Timeout Error";
		if (Array.isArray(socket.autoSelectFamilyAttemptedAddresses)) message += ` (attempted addresses: ${socket.autoSelectFamilyAttemptedAddresses.join(", ")},`;
		else message += ` (attempted address: ${opts.hostname}:${opts.port},`;
		message += ` timeout: ${opts.timeout}ms)`;
		destroy(socket, new ConnectTimeoutError(message));
	}
	let lastUrlString = null;
	let lastProtocol = null;
	/**
	* @param {string} urlString
	* @returns {string}
	*/
	function getProtocolFromUrlString(urlString) {
		if (urlString === lastUrlString) return lastProtocol;
		const protocol = getProtocolFromUrlStringSlow(urlString);
		lastUrlString = urlString;
		lastProtocol = protocol;
		return protocol;
	}
	/**
	* @param {string} urlString
	* @returns {string}
	*/
	function getProtocolFromUrlStringSlow(urlString) {
		if (urlString[0] === "h" && urlString[1] === "t" && urlString[2] === "t" && urlString[3] === "p") switch (urlString[4]) {
			case ":": return "http:";
			case "s": if (urlString[5] === ":") return "https:";
		}
		return urlString.slice(0, urlString.indexOf(":") + 1);
	}
	const kEnumerableProperty = {
		__proto__: null,
		enumerable: true
	};
	const normalizedMethodRecordsBase = {
		delete: "DELETE",
		DELETE: "DELETE",
		get: "GET",
		GET: "GET",
		head: "HEAD",
		HEAD: "HEAD",
		options: "OPTIONS",
		OPTIONS: "OPTIONS",
		post: "POST",
		POST: "POST",
		put: "PUT",
		PUT: "PUT",
		query: "QUERY",
		QUERY: "QUERY"
	};
	const normalizedMethodRecords = {
		...normalizedMethodRecordsBase,
		patch: "patch",
		PATCH: "PATCH"
	};
	Object.setPrototypeOf(normalizedMethodRecordsBase, null);
	Object.setPrototypeOf(normalizedMethodRecords, null);
	module.exports = {
		kEnumerableProperty,
		isDisturbed,
		isBlobLike,
		parseOrigin,
		parseURL,
		getServerName,
		isStream,
		isIterable,
		hasSafeIterator,
		isAsyncIterable,
		isDestroyed,
		headerNameToString,
		bufferToLowerCasedHeaderName,
		addListener,
		removeAllListeners,
		errorRequest,
		parseRawHeaders,
		toRawHeaders,
		encodeRawHeaders,
		parseHeaders,
		parseKeepAliveTimeout,
		destroy,
		bodyLength,
		deepClone,
		ReadableStreamFrom,
		isBuffer,
		assertRequestHandler,
		getSocketInfo,
		isFormDataLike,
		pathHasQueryOrFragment,
		serializePathWithQuery,
		addAbortListener,
		isValidHTTPToken,
		isValidHeaderValue,
		isTokenCharCode,
		parseRangeHeader,
		normalizedMethodRecordsBase,
		normalizedMethodRecords,
		isValidPort,
		isHttpOrHttpsPrefixed,
		safeHTTPMethods: Object.freeze([
			"GET",
			"HEAD",
			"OPTIONS",
			"TRACE"
		]),
		wrapRequestBody,
		setupConnectTimeout,
		getProtocolFromUrlString
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/util/stats.js
var require_stats = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { kConnected, kPending, kRunning, kSize, kFree, kQueued } = require_symbols();
	var ClientStats = class {
		constructor(client) {
			this.connected = client[kConnected];
			this.pending = client[kPending];
			this.running = client[kRunning];
			this.size = client[kSize];
		}
	};
	var PoolStats = class {
		constructor(pool) {
			this.connected = pool[kConnected];
			this.free = pool[kFree];
			this.pending = pool[kPending];
			this.queued = pool[kQueued];
			this.running = pool[kRunning];
			this.size = pool[kSize];
		}
	};
	module.exports = {
		ClientStats,
		PoolStats
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/core/diagnostics.js
var require_diagnostics = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const diagnosticsChannel$1 = __require("node:diagnostics_channel");
	const util$1 = __require("node:util");
	const undiciDebugLog = util$1.debuglog("undici");
	const fetchDebuglog = util$1.debuglog("fetch");
	const websocketDebuglog = util$1.debuglog("websocket");
	const channels = {
		beforeConnect: diagnosticsChannel$1.channel("undici:client:beforeConnect"),
		connected: diagnosticsChannel$1.channel("undici:client:connected"),
		connectError: diagnosticsChannel$1.channel("undici:client:connectError"),
		sendHeaders: diagnosticsChannel$1.channel("undici:client:sendHeaders"),
		create: diagnosticsChannel$1.channel("undici:request:create"),
		bodySent: diagnosticsChannel$1.channel("undici:request:bodySent"),
		bodyChunkSent: diagnosticsChannel$1.channel("undici:request:bodyChunkSent"),
		bodyChunkReceived: diagnosticsChannel$1.channel("undici:request:bodyChunkReceived"),
		headers: diagnosticsChannel$1.channel("undici:request:headers"),
		trailers: diagnosticsChannel$1.channel("undici:request:trailers"),
		error: diagnosticsChannel$1.channel("undici:request:error"),
		open: diagnosticsChannel$1.channel("undici:websocket:open"),
		close: diagnosticsChannel$1.channel("undici:websocket:close"),
		socketError: diagnosticsChannel$1.channel("undici:websocket:socket_error"),
		ping: diagnosticsChannel$1.channel("undici:websocket:ping"),
		pong: diagnosticsChannel$1.channel("undici:websocket:pong"),
		proxyConnected: diagnosticsChannel$1.channel("undici:proxy:connected")
	};
	let isTrackingClientEvents = false;
	function trackClientEvents(debugLog = undiciDebugLog) {
		if (isTrackingClientEvents) return;
		if (channels.beforeConnect.hasSubscribers || channels.connected.hasSubscribers || channels.connectError.hasSubscribers || channels.sendHeaders.hasSubscribers) {
			isTrackingClientEvents = true;
			return;
		}
		isTrackingClientEvents = true;
		diagnosticsChannel$1.subscribe("undici:client:beforeConnect", (evt) => {
			const { connectParams: { version, protocol, port, host } } = evt;
			debugLog("connecting to %s%s using %s%s", host, port ? `:${port}` : "", protocol, version);
		});
		diagnosticsChannel$1.subscribe("undici:client:connected", (evt) => {
			const { connectParams: { version, protocol, port, host } } = evt;
			debugLog("connected to %s%s using %s%s", host, port ? `:${port}` : "", protocol, version);
		});
		diagnosticsChannel$1.subscribe("undici:client:connectError", (evt) => {
			const { connectParams: { version, protocol, port, host }, error } = evt;
			debugLog("connection to %s%s using %s%s errored - %s", host, port ? `:${port}` : "", protocol, version, error.message);
		});
		diagnosticsChannel$1.subscribe("undici:client:sendHeaders", (evt) => {
			const { request: { method, path, origin } } = evt;
			debugLog("sending request to %s %s%s", method, origin, path);
		});
	}
	let isTrackingRequestEvents = false;
	function trackRequestEvents(debugLog = undiciDebugLog) {
		if (isTrackingRequestEvents) return;
		if (channels.headers.hasSubscribers || channels.trailers.hasSubscribers || channels.error.hasSubscribers) {
			isTrackingRequestEvents = true;
			return;
		}
		isTrackingRequestEvents = true;
		diagnosticsChannel$1.subscribe("undici:request:headers", (evt) => {
			const { request: { method, path, origin }, response: { statusCode } } = evt;
			debugLog("received response to %s %s%s - HTTP %d", method, origin, path, statusCode);
		});
		diagnosticsChannel$1.subscribe("undici:request:trailers", (evt) => {
			const { request: { method, path, origin } } = evt;
			debugLog("trailers received from %s %s%s", method, origin, path);
		});
		diagnosticsChannel$1.subscribe("undici:request:error", (evt) => {
			const { request: { method, path, origin }, error } = evt;
			debugLog("request to %s %s%s errored - %s", method, origin, path, error.message);
		});
	}
	let isTrackingWebSocketEvents = false;
	function trackWebSocketEvents(debugLog = websocketDebuglog) {
		if (isTrackingWebSocketEvents) return;
		if (channels.open.hasSubscribers || channels.close.hasSubscribers || channels.socketError.hasSubscribers || channels.ping.hasSubscribers || channels.pong.hasSubscribers) {
			isTrackingWebSocketEvents = true;
			return;
		}
		isTrackingWebSocketEvents = true;
		diagnosticsChannel$1.subscribe("undici:websocket:open", (evt) => {
			if (evt.address != null) {
				const { address, port } = evt.address;
				debugLog("connection opened %s%s", address, port ? `:${port}` : "");
			} else debugLog("connection opened");
		});
		diagnosticsChannel$1.subscribe("undici:websocket:close", (evt) => {
			const { websocket, code, reason } = evt;
			debugLog("closed connection to %s - %s %s", websocket.url, code, reason);
		});
		diagnosticsChannel$1.subscribe("undici:websocket:socket_error", (err) => {
			debugLog("connection errored - %s", err.message);
		});
		diagnosticsChannel$1.subscribe("undici:websocket:ping", (evt) => {
			debugLog("ping received");
		});
		diagnosticsChannel$1.subscribe("undici:websocket:pong", (evt) => {
			debugLog("pong received");
		});
	}
	if (undiciDebugLog.enabled || fetchDebuglog.enabled) {
		trackClientEvents(fetchDebuglog.enabled ? fetchDebuglog : undiciDebugLog);
		trackRequestEvents(fetchDebuglog.enabled ? fetchDebuglog : undiciDebugLog);
	}
	if (websocketDebuglog.enabled) {
		trackClientEvents(undiciDebugLog.enabled ? undiciDebugLog : websocketDebuglog);
		trackWebSocketEvents(websocketDebuglog);
	}
	module.exports = { channels };
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/core/request.js
var require_request$1 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { InvalidArgumentError, NotSupportedError } = require_errors();
	const assert$31 = __require("node:assert");
	const { isValidHTTPToken, isValidHeaderValue, isStream, destroy, isBuffer, isFormDataLike, isIterable, hasSafeIterator, isBlobLike, serializePathWithQuery, parseHeaders, assertRequestHandler, getServerName, normalizedMethodRecords, getProtocolFromUrlString } = require_util$5();
	const { channels } = require_diagnostics();
	const { headerNameLowerCasedRecord } = require_constants$4();
	const invalidPathRegex = /[^\u0021-\u00ff]/;
	function isValidContentLengthHeaderValue(val) {
		if (typeof val !== "string" || val.length === 0) return false;
		for (let i = 0; i < val.length; i++) {
			const charCode = val.charCodeAt(i);
			if (charCode < 48 || charCode > 57) return false;
		}
		return true;
	}
	const kHandler = Symbol("handler");
	const kController = Symbol("controller");
	const kResume = Symbol("resume");
	var RequestController = class {
		#paused = false;
		#reason = null;
		#aborted = false;
		#abort;
		[kResume] = null;
		rawHeaders = null;
		rawTrailers = null;
		constructor(abort) {
			this.#abort = abort;
		}
		pause() {
			this.#paused = true;
		}
		resume() {
			if (this.#paused) {
				this.#paused = false;
				this[kResume]?.();
			}
		}
		abort(reason) {
			if (!this.#aborted) {
				this.#aborted = true;
				this.#reason = reason;
				this.#abort(reason);
			}
		}
		get aborted() {
			return this.#aborted;
		}
		get reason() {
			return this.#reason;
		}
		get paused() {
			return this.#paused;
		}
	};
	var Request = class {
		constructor(origin, { path, method, body, headers, query, idempotent, blocking, upgrade, headersTimeout, bodyTimeout, reset, expectContinue, servername, throwOnError, maxRedirections, typeOfService }, handler) {
			if (typeof path !== "string") throw new InvalidArgumentError("path must be a string");
			else if (path[0] !== "/" && !(path.startsWith("http://") || path.startsWith("https://")) && method !== "CONNECT") throw new InvalidArgumentError("path must be an absolute URL or start with a slash");
			else if (invalidPathRegex.test(path)) throw new InvalidArgumentError("invalid request path");
			if (typeof method !== "string") throw new InvalidArgumentError("method must be a string");
			else if (normalizedMethodRecords[method] === void 0 && !isValidHTTPToken(method)) throw new InvalidArgumentError("invalid request method");
			if (upgrade && typeof upgrade !== "string") throw new InvalidArgumentError("upgrade must be a string");
			if (upgrade && !isValidHeaderValue(upgrade)) throw new InvalidArgumentError("invalid upgrade header");
			if (headersTimeout != null && (!Number.isFinite(headersTimeout) || headersTimeout < 0)) throw new InvalidArgumentError("invalid headersTimeout");
			if (bodyTimeout != null && (!Number.isFinite(bodyTimeout) || bodyTimeout < 0)) throw new InvalidArgumentError("invalid bodyTimeout");
			if (reset != null && typeof reset !== "boolean") throw new InvalidArgumentError("invalid reset");
			if (expectContinue != null && typeof expectContinue !== "boolean") throw new InvalidArgumentError("invalid expectContinue");
			if (throwOnError != null) throw new InvalidArgumentError("invalid throwOnError");
			if (maxRedirections != null && maxRedirections !== 0) throw new InvalidArgumentError("maxRedirections is not supported, use the redirect interceptor");
			if (typeOfService != null && (!Number.isInteger(typeOfService) || typeOfService < 0 || typeOfService > 255)) throw new InvalidArgumentError("typeOfService must be an integer between 0 and 255");
			this.headersTimeout = headersTimeout;
			this.bodyTimeout = bodyTimeout;
			this.method = method;
			this.typeOfService = typeOfService;
			this.abort = null;
			if (body == null) this.body = null;
			else if (isStream(body)) {
				this.body = body;
				const rState = this.body._readableState;
				if (!rState || !rState.autoDestroy) {
					this.endHandler = function autoDestroy() {
						destroy(this);
					};
					this.body.on("end", this.endHandler);
				}
				this.errorHandler = (err) => {
					if (this.abort) this.abort(err);
					else this.error = err;
				};
				this.body.on("error", this.errorHandler);
			} else if (isBuffer(body)) this.body = body.byteLength ? body : null;
			else if (ArrayBuffer.isView(body)) this.body = body.buffer.byteLength ? Buffer.from(body.buffer, body.byteOffset, body.byteLength) : null;
			else if (body instanceof ArrayBuffer) this.body = body.byteLength ? Buffer.from(body) : null;
			else if (typeof body === "string") this.body = body.length ? Buffer.from(body) : null;
			else if (isFormDataLike(body) || isIterable(body) || isBlobLike(body)) this.body = body;
			else throw new InvalidArgumentError("body must be a string, a Buffer, a Readable stream, an iterable, or an async iterable");
			this.completed = false;
			this.aborted = false;
			this.upgrade = upgrade || null;
			this.path = query ? serializePathWithQuery(path, query) : path;
			this.origin = origin;
			this.protocol = getProtocolFromUrlString(origin);
			this.idempotent = idempotent == null ? method === "HEAD" || method === "GET" || method === "QUERY" : idempotent;
			this.blocking = blocking ?? this.method !== "HEAD";
			this.reset = reset == null ? null : reset;
			this.host = null;
			this.contentLength = null;
			this.contentType = null;
			this.headers = [];
			this.expectContinue = expectContinue != null ? expectContinue : false;
			if (Array.isArray(headers)) {
				if (headers.length % 2 !== 0) throw new InvalidArgumentError("headers array must be even");
				for (let i = 0; i < headers.length; i += 2) processHeader(this, headers[i], headers[i + 1]);
			} else if (headers && typeof headers === "object") {
				if (hasSafeIterator(headers)) for (const header of headers) {
					if (!Array.isArray(header) || header.length !== 2) throw new InvalidArgumentError("headers must be in key-value pair format");
					processHeader(this, header[0], header[1]);
				}
				else {
					const keys = Object.keys(headers);
					for (let i = 0; i < keys.length; ++i) processHeader(this, keys[i], headers[keys[i]]);
				}
			} else if (headers != null) throw new InvalidArgumentError("headers must be an object or an array");
			assertRequestHandler(handler, method, upgrade);
			this.servername = servername || getServerName(this.host) || null;
			this[kHandler] = handler;
			if (channels.create.hasSubscribers) channels.create.publish({ request: this });
		}
		onBodySent(chunk) {
			if (channels.bodyChunkSent.hasSubscribers) channels.bodyChunkSent.publish({
				request: this,
				chunk
			});
			if (this[kHandler].onBodySent) try {
				return this[kHandler].onBodySent(chunk);
			} catch (err) {
				this.abort(err);
			}
		}
		onRequestSent() {
			if (channels.bodySent.hasSubscribers) channels.bodySent.publish({ request: this });
			if (this[kHandler].onRequestSent) try {
				return this[kHandler].onRequestSent();
			} catch (err) {
				this.abort(err);
			}
		}
		onRequestStart(abort, context) {
			assert$31(!this.aborted);
			assert$31(!this.completed);
			this[kController] = new RequestController(abort);
			if (this.error) {
				this[kController].abort(this.error);
				return;
			}
			this.abort = abort;
			return this[kHandler].onRequestStart(this[kController], context);
		}
		onResponseStarted() {
			return this[kHandler].onResponseStarted?.();
		}
		onResponseStart(statusCode, headers, resume, statusText) {
			assert$31(!this.aborted);
			assert$31(!this.completed);
			if (channels.headers.hasSubscribers) channels.headers.publish({
				request: this,
				response: {
					statusCode,
					headers,
					statusText
				}
			});
			const controller = this[kController];
			if (controller) {
				controller[kResume] = resume;
				controller.rawHeaders = headers;
			}
			const parsedHeaders = Array.isArray(headers) ? parseHeaders(headers) : headers;
			try {
				this[kHandler].onResponseStart?.(controller, statusCode, parsedHeaders, statusText);
				return !controller?.paused;
			} catch (err) {
				this.abort(err);
				return false;
			}
		}
		onResponseData(chunk) {
			assert$31(!this.aborted);
			assert$31(!this.completed);
			if (channels.bodyChunkReceived.hasSubscribers) channels.bodyChunkReceived.publish({
				request: this,
				chunk
			});
			const controller = this[kController];
			try {
				this[kHandler].onResponseData?.(controller, chunk);
				return !controller?.paused;
			} catch (err) {
				this.abort(err);
				return false;
			}
		}
		onRequestUpgrade(statusCode, headers, socket) {
			assert$31(!this.aborted);
			assert$31(!this.completed);
			const controller = this[kController];
			if (controller) controller.rawHeaders = headers;
			const parsedHeaders = Array.isArray(headers) ? parseHeaders(headers) : headers;
			return this[kHandler].onRequestUpgrade?.(controller, statusCode, parsedHeaders, socket);
		}
		onResponseEnd(trailers) {
			this.onFinally();
			assert$31(!this.aborted);
			assert$31(!this.completed);
			this.completed = true;
			if (channels.trailers.hasSubscribers) channels.trailers.publish({
				request: this,
				trailers
			});
			const controller = this[kController];
			if (controller) controller.rawTrailers = trailers;
			const parsedTrailers = Array.isArray(trailers) ? parseHeaders(trailers) : trailers;
			try {
				return this[kHandler].onResponseEnd?.(controller, parsedTrailers);
			} catch (err) {
				this.onResponseError(err);
			}
		}
		onResponseError(error) {
			this.onFinally();
			if (channels.error.hasSubscribers) channels.error.publish({
				request: this,
				error
			});
			if (this.aborted) return;
			this.aborted = true;
			const controller = this[kController];
			return this[kHandler].onResponseError?.(controller, error);
		}
		onFinally() {
			if (this.errorHandler) {
				this.body.off("error", this.errorHandler);
				this.errorHandler = null;
			}
			if (this.endHandler) {
				this.body.off("end", this.endHandler);
				this.endHandler = null;
			}
		}
		addHeader(key, value) {
			processHeader(this, key, value);
			return this;
		}
	};
	function processHeader(request, key, val) {
		if (val && typeof val === "object" && !Array.isArray(val)) throw new InvalidArgumentError(`invalid ${key} header`);
		else if (val === void 0) return;
		let headerName = headerNameLowerCasedRecord[key];
		if (headerName === void 0) {
			headerName = key.toLowerCase();
			if (headerNameLowerCasedRecord[headerName] === void 0 && !isValidHTTPToken(headerName)) throw new InvalidArgumentError("invalid header key");
		}
		if (Array.isArray(val)) {
			const arr = [];
			for (let i = 0; i < val.length; i++) if (typeof val[i] === "string") {
				if (!isValidHeaderValue(val[i])) throw new InvalidArgumentError(`invalid ${key} header`);
				arr.push(val[i]);
			} else if (val[i] === null) arr.push("");
			else if (typeof val[i] === "object") throw new InvalidArgumentError(`invalid ${key} header`);
			else {
				const str = `${val[i]}`;
				if (!isValidHeaderValue(str)) throw new InvalidArgumentError(`invalid ${key} header`);
				arr.push(str);
			}
			val = arr;
		} else if (typeof val === "string") {
			if (!isValidHeaderValue(val)) throw new InvalidArgumentError(`invalid ${key} header`);
		} else if (val === null) val = "";
		else {
			val = `${val}`;
			if (!isValidHeaderValue(val)) throw new InvalidArgumentError(`invalid ${key} header`);
		}
		if (headerName === "host") {
			if (request.host !== null) throw new InvalidArgumentError("duplicate host header");
			if (typeof val !== "string") throw new InvalidArgumentError("invalid host header");
			request.host = val;
		} else if (headerName === "content-length") {
			if (request.contentLength !== null) throw new InvalidArgumentError("duplicate content-length header");
			if (!isValidContentLengthHeaderValue(val)) throw new InvalidArgumentError("invalid content-length header");
			request.contentLength = parseInt(val, 10);
		} else if (request.contentType === null && headerName === "content-type") {
			request.contentType = val;
			request.headers.push(key, val);
		} else if (headerName === "transfer-encoding" || headerName === "keep-alive" || headerName === "upgrade") throw new InvalidArgumentError(`invalid ${headerName} header`);
		else if (headerName === "connection") {
			const value = typeof val === "string" ? val : null;
			if (value === null) throw new InvalidArgumentError("invalid connection header");
			for (const token of value.toLowerCase().split(",")) {
				const trimmed = token.trim();
				if (!isValidHTTPToken(trimmed)) throw new InvalidArgumentError("invalid connection header");
				if (trimmed === "close") request.reset = true;
			}
		} else if (headerName === "expect") throw new NotSupportedError("expect header not supported");
		else request.headers.push(key, val);
	}
	module.exports = Request;
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/dispatcher/dispatcher.js
var require_dispatcher = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const EventEmitter$2 = __require("node:events");
	var Dispatcher = class extends EventEmitter$2 {
		dispatch() {
			throw new Error("not implemented");
		}
		close() {
			throw new Error("not implemented");
		}
		destroy() {
			throw new Error("not implemented");
		}
		compose(...args) {
			const interceptors = Array.isArray(args[0]) ? args[0] : args;
			let dispatch = this.dispatch.bind(this);
			for (const interceptor of interceptors) {
				if (interceptor == null) continue;
				if (typeof interceptor !== "function") throw new TypeError(`invalid interceptor, expected function received ${typeof interceptor}`);
				dispatch = interceptor(dispatch);
				if (dispatch == null || typeof dispatch !== "function" || dispatch.length !== 2) throw new TypeError("invalid interceptor");
			}
			return new Proxy(this, { get: (target, key) => key === "dispatch" ? dispatch : target[key] });
		}
	};
	module.exports = Dispatcher;
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/dispatcher/dispatcher-base.js
var require_dispatcher_base = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const Dispatcher = require_dispatcher();
	const { ClientDestroyedError, ClientClosedError, InvalidArgumentError } = require_errors();
	const { kDestroy, kClose, kClosed, kDestroyed, kDispatch } = require_symbols();
	const kOnDestroyed = Symbol("onDestroyed");
	const kOnClosed = Symbol("onClosed");
	const kWebSocketOptions = Symbol("webSocketOptions");
	var DispatcherBase = class extends Dispatcher {
		/** @type {boolean} */
		[kDestroyed] = false;
		/** @type {Array<Function|null} */
		[kOnDestroyed] = null;
		/** @type {boolean} */
		[kClosed] = false;
		/** @type {Array<Function>|null} */
		[kOnClosed] = null;
		/**
		* @param {import('../../types/dispatcher').DispatcherOptions} [opts]
		*/
		constructor(opts) {
			super();
			this[kWebSocketOptions] = opts?.webSocket ?? {};
		}
		/**
		* @returns {import('../../types/dispatcher').WebSocketOptions}
		*/
		get webSocketOptions() {
			return {
				maxFragments: this[kWebSocketOptions].maxFragments ?? 131072,
				maxPayloadSize: this[kWebSocketOptions].maxPayloadSize ?? 134217728
			};
		}
		/** @returns {boolean} */
		get destroyed() {
			return this[kDestroyed];
		}
		/** @returns {boolean} */
		get closed() {
			return this[kClosed];
		}
		close(callback) {
			if (callback === void 0) return new Promise((resolve, reject) => {
				this.close((err, data) => {
					return err ? reject(err) : resolve(data);
				});
			});
			if (typeof callback !== "function") throw new InvalidArgumentError("invalid callback");
			if (this[kDestroyed]) {
				const err = new ClientDestroyedError();
				queueMicrotask(() => callback(err, null));
				return;
			}
			if (this[kClosed]) {
				if (this[kOnClosed]) this[kOnClosed].push(callback);
				else queueMicrotask(() => callback(null, null));
				return;
			}
			this[kClosed] = true;
			this[kOnClosed] ??= [];
			this[kOnClosed].push(callback);
			const onClosed = () => {
				const callbacks = this[kOnClosed];
				this[kOnClosed] = null;
				for (let i = 0; i < callbacks.length; i++) callbacks[i](null, null);
			};
			this[kClose]().then(() => this.destroy()).then(() => queueMicrotask(onClosed));
		}
		destroy(err, callback) {
			if (typeof err === "function") {
				callback = err;
				err = null;
			}
			if (callback === void 0) return new Promise((resolve, reject) => {
				this.destroy(err, (err, data) => {
					return err ? reject(err) : resolve(data);
				});
			});
			if (typeof callback !== "function") throw new InvalidArgumentError("invalid callback");
			if (this[kDestroyed]) {
				if (this[kOnDestroyed]) this[kOnDestroyed].push(callback);
				else queueMicrotask(() => callback(null, null));
				return;
			}
			if (!err) err = new ClientDestroyedError();
			this[kDestroyed] = true;
			this[kOnDestroyed] ??= [];
			this[kOnDestroyed].push(callback);
			const onDestroyed = () => {
				const callbacks = this[kOnDestroyed];
				this[kOnDestroyed] = null;
				for (let i = 0; i < callbacks.length; i++) callbacks[i](null, null);
			};
			this[kDestroy](err).then(() => queueMicrotask(onDestroyed));
		}
		dispatch(opts, handler) {
			if (!handler || typeof handler !== "object") throw new InvalidArgumentError("handler must be an object");
			try {
				if (!opts || typeof opts !== "object") throw new InvalidArgumentError("opts must be an object.");
				if (opts.dispatcher) throw new InvalidArgumentError("opts.dispatcher is not supported by instance methods. Pass opts.dispatcher to the top-level undici functions or call the dispatcher instance method directly.");
				if (this[kDestroyed] || this[kOnDestroyed]) throw new ClientDestroyedError();
				if (this[kClosed]) throw new ClientClosedError();
				return this[kDispatch](opts, handler);
			} catch (err) {
				if (typeof handler.onResponseError !== "function") throw err;
				handler.onResponseError(null, err);
				return false;
			}
		}
	};
	module.exports = DispatcherBase;
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/core/connect.js
var require_connect = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const net$2 = __require("node:net");
	const assert$30 = __require("node:assert");
	const util = require_util$5();
	const { InvalidArgumentError, ConnectTimeoutError } = require_errors();
	let tls;
	const SessionCache = class WeakSessionCache {
		constructor(maxCachedSessions) {
			this._maxCachedSessions = maxCachedSessions;
			this._sessionCache = /* @__PURE__ */ new Map();
			this._sessionRegistry = new FinalizationRegistry((key) => {
				if (this._sessionCache.size < this._maxCachedSessions) return;
				const ref = this._sessionCache.get(key);
				if (ref !== void 0 && ref.deref() === void 0) this._sessionCache.delete(key);
			});
		}
		get(sessionKey) {
			const ref = this._sessionCache.get(sessionKey);
			return ref ? ref.deref() : null;
		}
		set(sessionKey, session) {
			if (this._maxCachedSessions === 0) return;
			if (this._sessionCache.has(sessionKey)) this._sessionCache.delete(sessionKey);
			else if (this._sessionCache.size >= this._maxCachedSessions) {
				for (const [key, ref] of this._sessionCache) if (ref.deref() === void 0) {
					this._sessionCache.delete(key);
					return;
				}
				const oldest = this._sessionCache.keys().next();
				if (!oldest.done) this._sessionCache.delete(oldest.value);
			}
			this._sessionCache.set(sessionKey, new WeakRef(session));
			this._sessionRegistry.register(session, sessionKey);
		}
	};
	function buildConnector({ allowH2, preferH2, useH2c, maxCachedSessions, socketPath, timeout, session: customSession, ...opts }) {
		if (maxCachedSessions != null && (!Number.isInteger(maxCachedSessions) || maxCachedSessions < 0)) throw new InvalidArgumentError("maxCachedSessions must be a positive integer or zero");
		const options = {
			path: socketPath,
			...opts
		};
		const sessionCache = new SessionCache(maxCachedSessions == null ? 100 : maxCachedSessions);
		timeout = timeout == null ? 1e4 : timeout;
		allowH2 = allowH2 != null ? allowH2 : true;
		return function connect({ hostname, host, protocol, port, servername, localAddress, httpSocket }, callback) {
			let socket;
			if (protocol === "https:") {
				if (!tls) tls = __require("node:tls");
				servername = servername || options.servername || util.getServerName(host) || null;
				const sessionKey = servername || hostname;
				assert$30(sessionKey);
				const session = customSession || sessionCache.get(sessionKey) || null;
				port = port || 443;
				socket = tls.connect({
					highWaterMark: 16384,
					...options,
					servername,
					session,
					localAddress,
					ALPNProtocols: allowH2 ? preferH2 ? ["h2", "http/1.1"] : ["http/1.1", "h2"] : ["http/1.1"],
					socket: httpSocket,
					port,
					host: hostname
				});
				socket.on("session", function(session) {
					sessionCache.set(sessionKey, session);
				});
			} else {
				assert$30(!httpSocket, "httpSocket can only be sent on TLS update");
				port = port || 80;
				socket = net$2.connect({
					highWaterMark: 65536,
					...options,
					localAddress,
					port,
					host: hostname
				});
				if (useH2c === true) socket.alpnProtocol = "h2";
			}
			if (options.keepAlive == null || options.keepAlive) {
				const keepAliveInitialDelay = options.keepAliveInitialDelay === void 0 ? 6e4 : options.keepAliveInitialDelay;
				socket.setKeepAlive(true, keepAliveInitialDelay);
			}
			const clearConnectTimeout = util.setupConnectTimeout(new WeakRef(socket), {
				timeout,
				hostname,
				port
			});
			socket.setNoDelay(true).once(protocol === "https:" ? "secureConnect" : "connect", function() {
				queueMicrotask(clearConnectTimeout);
				if (callback) {
					const cb = callback;
					callback = null;
					cb(null, this);
				}
			}).on("error", function(err) {
				queueMicrotask(clearConnectTimeout);
				if (callback) {
					const cb = callback;
					callback = null;
					cb(maybeNormalizeConnectError(err, this, {
						timeout,
						hostname,
						port
					}));
				}
			});
			return socket;
		};
	}
	function maybeNormalizeConnectError(err, socket, opts) {
		if (err instanceof AggregateError && (err.code === "ETIMEDOUT" || err.errors.some((e) => e != null && e.code === "ETIMEDOUT"))) {
			let message = "Connect Timeout Error";
			if (Array.isArray(socket.autoSelectFamilyAttemptedAddresses)) message += ` (attempted addresses: ${socket.autoSelectFamilyAttemptedAddresses.join(", ")},`;
			else message += ` (attempted address: ${opts.hostname}:${opts.port},`;
			message += ` timeout: ${opts.timeout}ms)`;
			const wrapped = new ConnectTimeoutError(message);
			wrapped.cause = err;
			return wrapped;
		}
		return err;
	}
	module.exports = buildConnector;
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/llhttp/utils.js
var require_utils = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.enumToMap = enumToMap;
	function enumToMap(obj, filter = [], exceptions = []) {
		const emptyFilter = (filter?.length ?? 0) === 0;
		const emptyExceptions = (exceptions?.length ?? 0) === 0;
		return Object.fromEntries(Object.entries(obj).filter(([, value]) => {
			return typeof value === "number" && (emptyFilter || filter.includes(value)) && (emptyExceptions || !exceptions.includes(value));
		}));
	}
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/llhttp/constants.js
var require_constants$3 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.SPECIAL_HEADERS = exports.MINOR = exports.MAJOR = exports.HTAB_SP_VCHAR_OBS_TEXT = exports.QUOTED_STRING = exports.CONNECTION_TOKEN_CHARS = exports.HEADER_CHARS = exports.TOKEN = exports.HEX = exports.URL_CHAR = exports.USERINFO_CHARS = exports.MARK = exports.ALPHANUM = exports.NUM = exports.HEX_MAP = exports.NUM_MAP = exports.ALPHA = exports.STATUSES_HTTP = exports.H_METHOD_MAP = exports.METHOD_MAP = exports.METHODS_RTSP = exports.METHODS_ICE = exports.METHODS_HTTP = exports.HEADER_STATE = exports.FINISH = exports.STATUSES = exports.METHODS = exports.LENIENT_FLAGS = exports.FLAGS = exports.TYPE = exports.ERROR = void 0;
	const utils_1 = require_utils();
	exports.ERROR = {
		OK: 0,
		INTERNAL: 1,
		STRICT: 2,
		CR_EXPECTED: 25,
		LF_EXPECTED: 3,
		UNEXPECTED_CONTENT_LENGTH: 4,
		UNEXPECTED_SPACE: 30,
		CLOSED_CONNECTION: 5,
		INVALID_METHOD: 6,
		INVALID_URL: 7,
		INVALID_CONSTANT: 8,
		INVALID_VERSION: 9,
		INVALID_HEADER_TOKEN: 10,
		INVALID_CONTENT_LENGTH: 11,
		INVALID_CHUNK_SIZE: 12,
		INVALID_STATUS: 13,
		INVALID_EOF_STATE: 14,
		INVALID_TRANSFER_ENCODING: 15,
		CB_MESSAGE_BEGIN: 16,
		CB_HEADERS_COMPLETE: 17,
		CB_MESSAGE_COMPLETE: 18,
		CB_CHUNK_HEADER: 19,
		CB_CHUNK_COMPLETE: 20,
		PAUSED: 21,
		PAUSED_UPGRADE: 22,
		PAUSED_H2_UPGRADE: 23,
		USER: 24,
		CB_URL_COMPLETE: 26,
		CB_STATUS_COMPLETE: 27,
		CB_METHOD_COMPLETE: 32,
		CB_VERSION_COMPLETE: 33,
		CB_HEADER_FIELD_COMPLETE: 28,
		CB_HEADER_VALUE_COMPLETE: 29,
		CB_CHUNK_EXTENSION_NAME_COMPLETE: 34,
		CB_CHUNK_EXTENSION_VALUE_COMPLETE: 35,
		CB_RESET: 31,
		CB_PROTOCOL_COMPLETE: 38
	};
	exports.TYPE = {
		BOTH: 0,
		REQUEST: 1,
		RESPONSE: 2
	};
	exports.FLAGS = {
		CONNECTION_KEEP_ALIVE: 1,
		CONNECTION_CLOSE: 2,
		CONNECTION_UPGRADE: 4,
		CHUNKED: 8,
		UPGRADE: 16,
		CONTENT_LENGTH: 32,
		SKIPBODY: 64,
		TRAILING: 128,
		TRANSFER_ENCODING: 512
	};
	exports.LENIENT_FLAGS = {
		HEADERS: 1,
		CHUNKED_LENGTH: 2,
		KEEP_ALIVE: 4,
		TRANSFER_ENCODING: 8,
		VERSION: 16,
		DATA_AFTER_CLOSE: 32,
		OPTIONAL_LF_AFTER_CR: 64,
		OPTIONAL_CRLF_AFTER_CHUNK: 128,
		OPTIONAL_CR_BEFORE_LF: 256,
		SPACES_AFTER_CHUNK_SIZE: 512
	};
	exports.METHODS = {
		"DELETE": 0,
		"GET": 1,
		"HEAD": 2,
		"POST": 3,
		"PUT": 4,
		"CONNECT": 5,
		"OPTIONS": 6,
		"TRACE": 7,
		"COPY": 8,
		"LOCK": 9,
		"MKCOL": 10,
		"MOVE": 11,
		"PROPFIND": 12,
		"PROPPATCH": 13,
		"SEARCH": 14,
		"UNLOCK": 15,
		"BIND": 16,
		"REBIND": 17,
		"UNBIND": 18,
		"ACL": 19,
		"REPORT": 20,
		"MKACTIVITY": 21,
		"CHECKOUT": 22,
		"MERGE": 23,
		"M-SEARCH": 24,
		"NOTIFY": 25,
		"SUBSCRIBE": 26,
		"UNSUBSCRIBE": 27,
		"PATCH": 28,
		"PURGE": 29,
		"MKCALENDAR": 30,
		"LINK": 31,
		"UNLINK": 32,
		"SOURCE": 33,
		"PRI": 34,
		"DESCRIBE": 35,
		"ANNOUNCE": 36,
		"SETUP": 37,
		"PLAY": 38,
		"PAUSE": 39,
		"TEARDOWN": 40,
		"GET_PARAMETER": 41,
		"SET_PARAMETER": 42,
		"REDIRECT": 43,
		"RECORD": 44,
		"FLUSH": 45,
		"QUERY": 46
	};
	exports.STATUSES = {
		CONTINUE: 100,
		SWITCHING_PROTOCOLS: 101,
		PROCESSING: 102,
		EARLY_HINTS: 103,
		RESPONSE_IS_STALE: 110,
		REVALIDATION_FAILED: 111,
		DISCONNECTED_OPERATION: 112,
		HEURISTIC_EXPIRATION: 113,
		MISCELLANEOUS_WARNING: 199,
		OK: 200,
		CREATED: 201,
		ACCEPTED: 202,
		NON_AUTHORITATIVE_INFORMATION: 203,
		NO_CONTENT: 204,
		RESET_CONTENT: 205,
		PARTIAL_CONTENT: 206,
		MULTI_STATUS: 207,
		ALREADY_REPORTED: 208,
		TRANSFORMATION_APPLIED: 214,
		IM_USED: 226,
		MISCELLANEOUS_PERSISTENT_WARNING: 299,
		MULTIPLE_CHOICES: 300,
		MOVED_PERMANENTLY: 301,
		FOUND: 302,
		SEE_OTHER: 303,
		NOT_MODIFIED: 304,
		USE_PROXY: 305,
		SWITCH_PROXY: 306,
		TEMPORARY_REDIRECT: 307,
		PERMANENT_REDIRECT: 308,
		BAD_REQUEST: 400,
		UNAUTHORIZED: 401,
		PAYMENT_REQUIRED: 402,
		FORBIDDEN: 403,
		NOT_FOUND: 404,
		METHOD_NOT_ALLOWED: 405,
		NOT_ACCEPTABLE: 406,
		PROXY_AUTHENTICATION_REQUIRED: 407,
		REQUEST_TIMEOUT: 408,
		CONFLICT: 409,
		GONE: 410,
		LENGTH_REQUIRED: 411,
		PRECONDITION_FAILED: 412,
		PAYLOAD_TOO_LARGE: 413,
		URI_TOO_LONG: 414,
		UNSUPPORTED_MEDIA_TYPE: 415,
		RANGE_NOT_SATISFIABLE: 416,
		EXPECTATION_FAILED: 417,
		IM_A_TEAPOT: 418,
		PAGE_EXPIRED: 419,
		ENHANCE_YOUR_CALM: 420,
		MISDIRECTED_REQUEST: 421,
		UNPROCESSABLE_ENTITY: 422,
		LOCKED: 423,
		FAILED_DEPENDENCY: 424,
		TOO_EARLY: 425,
		UPGRADE_REQUIRED: 426,
		PRECONDITION_REQUIRED: 428,
		TOO_MANY_REQUESTS: 429,
		REQUEST_HEADER_FIELDS_TOO_LARGE_UNOFFICIAL: 430,
		REQUEST_HEADER_FIELDS_TOO_LARGE: 431,
		LOGIN_TIMEOUT: 440,
		NO_RESPONSE: 444,
		RETRY_WITH: 449,
		BLOCKED_BY_PARENTAL_CONTROL: 450,
		UNAVAILABLE_FOR_LEGAL_REASONS: 451,
		CLIENT_CLOSED_LOAD_BALANCED_REQUEST: 460,
		INVALID_X_FORWARDED_FOR: 463,
		REQUEST_HEADER_TOO_LARGE: 494,
		SSL_CERTIFICATE_ERROR: 495,
		SSL_CERTIFICATE_REQUIRED: 496,
		HTTP_REQUEST_SENT_TO_HTTPS_PORT: 497,
		INVALID_TOKEN: 498,
		CLIENT_CLOSED_REQUEST: 499,
		INTERNAL_SERVER_ERROR: 500,
		NOT_IMPLEMENTED: 501,
		BAD_GATEWAY: 502,
		SERVICE_UNAVAILABLE: 503,
		GATEWAY_TIMEOUT: 504,
		HTTP_VERSION_NOT_SUPPORTED: 505,
		VARIANT_ALSO_NEGOTIATES: 506,
		INSUFFICIENT_STORAGE: 507,
		LOOP_DETECTED: 508,
		BANDWIDTH_LIMIT_EXCEEDED: 509,
		NOT_EXTENDED: 510,
		NETWORK_AUTHENTICATION_REQUIRED: 511,
		WEB_SERVER_UNKNOWN_ERROR: 520,
		WEB_SERVER_IS_DOWN: 521,
		CONNECTION_TIMEOUT: 522,
		ORIGIN_IS_UNREACHABLE: 523,
		TIMEOUT_OCCURED: 524,
		SSL_HANDSHAKE_FAILED: 525,
		INVALID_SSL_CERTIFICATE: 526,
		RAILGUN_ERROR: 527,
		SITE_IS_OVERLOADED: 529,
		SITE_IS_FROZEN: 530,
		IDENTITY_PROVIDER_AUTHENTICATION_ERROR: 561,
		NETWORK_READ_TIMEOUT: 598,
		NETWORK_CONNECT_TIMEOUT: 599
	};
	exports.FINISH = {
		SAFE: 0,
		SAFE_WITH_CB: 1,
		UNSAFE: 2
	};
	exports.HEADER_STATE = {
		GENERAL: 0,
		CONNECTION: 1,
		CONTENT_LENGTH: 2,
		TRANSFER_ENCODING: 3,
		UPGRADE: 4,
		CONNECTION_KEEP_ALIVE: 5,
		CONNECTION_CLOSE: 6,
		CONNECTION_UPGRADE: 7,
		TRANSFER_ENCODING_CHUNKED: 8
	};
	exports.METHODS_HTTP = [
		exports.METHODS.DELETE,
		exports.METHODS.GET,
		exports.METHODS.HEAD,
		exports.METHODS.POST,
		exports.METHODS.PUT,
		exports.METHODS.CONNECT,
		exports.METHODS.OPTIONS,
		exports.METHODS.TRACE,
		exports.METHODS.COPY,
		exports.METHODS.LOCK,
		exports.METHODS.MKCOL,
		exports.METHODS.MOVE,
		exports.METHODS.PROPFIND,
		exports.METHODS.PROPPATCH,
		exports.METHODS.SEARCH,
		exports.METHODS.UNLOCK,
		exports.METHODS.BIND,
		exports.METHODS.REBIND,
		exports.METHODS.UNBIND,
		exports.METHODS.ACL,
		exports.METHODS.REPORT,
		exports.METHODS.MKACTIVITY,
		exports.METHODS.CHECKOUT,
		exports.METHODS.MERGE,
		exports.METHODS["M-SEARCH"],
		exports.METHODS.NOTIFY,
		exports.METHODS.SUBSCRIBE,
		exports.METHODS.UNSUBSCRIBE,
		exports.METHODS.PATCH,
		exports.METHODS.PURGE,
		exports.METHODS.MKCALENDAR,
		exports.METHODS.LINK,
		exports.METHODS.UNLINK,
		exports.METHODS.PRI,
		exports.METHODS.SOURCE,
		exports.METHODS.QUERY
	];
	exports.METHODS_ICE = [exports.METHODS.SOURCE];
	exports.METHODS_RTSP = [
		exports.METHODS.OPTIONS,
		exports.METHODS.DESCRIBE,
		exports.METHODS.ANNOUNCE,
		exports.METHODS.SETUP,
		exports.METHODS.PLAY,
		exports.METHODS.PAUSE,
		exports.METHODS.TEARDOWN,
		exports.METHODS.GET_PARAMETER,
		exports.METHODS.SET_PARAMETER,
		exports.METHODS.REDIRECT,
		exports.METHODS.RECORD,
		exports.METHODS.FLUSH,
		exports.METHODS.GET,
		exports.METHODS.POST
	];
	exports.METHOD_MAP = (0, utils_1.enumToMap)(exports.METHODS);
	exports.H_METHOD_MAP = Object.fromEntries(Object.entries(exports.METHODS).filter(([k]) => k.startsWith("H")));
	exports.STATUSES_HTTP = [
		exports.STATUSES.CONTINUE,
		exports.STATUSES.SWITCHING_PROTOCOLS,
		exports.STATUSES.PROCESSING,
		exports.STATUSES.EARLY_HINTS,
		exports.STATUSES.RESPONSE_IS_STALE,
		exports.STATUSES.REVALIDATION_FAILED,
		exports.STATUSES.DISCONNECTED_OPERATION,
		exports.STATUSES.HEURISTIC_EXPIRATION,
		exports.STATUSES.MISCELLANEOUS_WARNING,
		exports.STATUSES.OK,
		exports.STATUSES.CREATED,
		exports.STATUSES.ACCEPTED,
		exports.STATUSES.NON_AUTHORITATIVE_INFORMATION,
		exports.STATUSES.NO_CONTENT,
		exports.STATUSES.RESET_CONTENT,
		exports.STATUSES.PARTIAL_CONTENT,
		exports.STATUSES.MULTI_STATUS,
		exports.STATUSES.ALREADY_REPORTED,
		exports.STATUSES.TRANSFORMATION_APPLIED,
		exports.STATUSES.IM_USED,
		exports.STATUSES.MISCELLANEOUS_PERSISTENT_WARNING,
		exports.STATUSES.MULTIPLE_CHOICES,
		exports.STATUSES.MOVED_PERMANENTLY,
		exports.STATUSES.FOUND,
		exports.STATUSES.SEE_OTHER,
		exports.STATUSES.NOT_MODIFIED,
		exports.STATUSES.USE_PROXY,
		exports.STATUSES.SWITCH_PROXY,
		exports.STATUSES.TEMPORARY_REDIRECT,
		exports.STATUSES.PERMANENT_REDIRECT,
		exports.STATUSES.BAD_REQUEST,
		exports.STATUSES.UNAUTHORIZED,
		exports.STATUSES.PAYMENT_REQUIRED,
		exports.STATUSES.FORBIDDEN,
		exports.STATUSES.NOT_FOUND,
		exports.STATUSES.METHOD_NOT_ALLOWED,
		exports.STATUSES.NOT_ACCEPTABLE,
		exports.STATUSES.PROXY_AUTHENTICATION_REQUIRED,
		exports.STATUSES.REQUEST_TIMEOUT,
		exports.STATUSES.CONFLICT,
		exports.STATUSES.GONE,
		exports.STATUSES.LENGTH_REQUIRED,
		exports.STATUSES.PRECONDITION_FAILED,
		exports.STATUSES.PAYLOAD_TOO_LARGE,
		exports.STATUSES.URI_TOO_LONG,
		exports.STATUSES.UNSUPPORTED_MEDIA_TYPE,
		exports.STATUSES.RANGE_NOT_SATISFIABLE,
		exports.STATUSES.EXPECTATION_FAILED,
		exports.STATUSES.IM_A_TEAPOT,
		exports.STATUSES.PAGE_EXPIRED,
		exports.STATUSES.ENHANCE_YOUR_CALM,
		exports.STATUSES.MISDIRECTED_REQUEST,
		exports.STATUSES.UNPROCESSABLE_ENTITY,
		exports.STATUSES.LOCKED,
		exports.STATUSES.FAILED_DEPENDENCY,
		exports.STATUSES.TOO_EARLY,
		exports.STATUSES.UPGRADE_REQUIRED,
		exports.STATUSES.PRECONDITION_REQUIRED,
		exports.STATUSES.TOO_MANY_REQUESTS,
		exports.STATUSES.REQUEST_HEADER_FIELDS_TOO_LARGE_UNOFFICIAL,
		exports.STATUSES.REQUEST_HEADER_FIELDS_TOO_LARGE,
		exports.STATUSES.LOGIN_TIMEOUT,
		exports.STATUSES.NO_RESPONSE,
		exports.STATUSES.RETRY_WITH,
		exports.STATUSES.BLOCKED_BY_PARENTAL_CONTROL,
		exports.STATUSES.UNAVAILABLE_FOR_LEGAL_REASONS,
		exports.STATUSES.CLIENT_CLOSED_LOAD_BALANCED_REQUEST,
		exports.STATUSES.INVALID_X_FORWARDED_FOR,
		exports.STATUSES.REQUEST_HEADER_TOO_LARGE,
		exports.STATUSES.SSL_CERTIFICATE_ERROR,
		exports.STATUSES.SSL_CERTIFICATE_REQUIRED,
		exports.STATUSES.HTTP_REQUEST_SENT_TO_HTTPS_PORT,
		exports.STATUSES.INVALID_TOKEN,
		exports.STATUSES.CLIENT_CLOSED_REQUEST,
		exports.STATUSES.INTERNAL_SERVER_ERROR,
		exports.STATUSES.NOT_IMPLEMENTED,
		exports.STATUSES.BAD_GATEWAY,
		exports.STATUSES.SERVICE_UNAVAILABLE,
		exports.STATUSES.GATEWAY_TIMEOUT,
		exports.STATUSES.HTTP_VERSION_NOT_SUPPORTED,
		exports.STATUSES.VARIANT_ALSO_NEGOTIATES,
		exports.STATUSES.INSUFFICIENT_STORAGE,
		exports.STATUSES.LOOP_DETECTED,
		exports.STATUSES.BANDWIDTH_LIMIT_EXCEEDED,
		exports.STATUSES.NOT_EXTENDED,
		exports.STATUSES.NETWORK_AUTHENTICATION_REQUIRED,
		exports.STATUSES.WEB_SERVER_UNKNOWN_ERROR,
		exports.STATUSES.WEB_SERVER_IS_DOWN,
		exports.STATUSES.CONNECTION_TIMEOUT,
		exports.STATUSES.ORIGIN_IS_UNREACHABLE,
		exports.STATUSES.TIMEOUT_OCCURED,
		exports.STATUSES.SSL_HANDSHAKE_FAILED,
		exports.STATUSES.INVALID_SSL_CERTIFICATE,
		exports.STATUSES.RAILGUN_ERROR,
		exports.STATUSES.SITE_IS_OVERLOADED,
		exports.STATUSES.SITE_IS_FROZEN,
		exports.STATUSES.IDENTITY_PROVIDER_AUTHENTICATION_ERROR,
		exports.STATUSES.NETWORK_READ_TIMEOUT,
		exports.STATUSES.NETWORK_CONNECT_TIMEOUT
	];
	exports.ALPHA = [];
	for (let i = "A".charCodeAt(0); i <= "Z".charCodeAt(0); i++) {
		exports.ALPHA.push(String.fromCharCode(i));
		exports.ALPHA.push(String.fromCharCode(i + 32));
	}
	exports.NUM_MAP = {
		0: 0,
		1: 1,
		2: 2,
		3: 3,
		4: 4,
		5: 5,
		6: 6,
		7: 7,
		8: 8,
		9: 9
	};
	exports.HEX_MAP = {
		0: 0,
		1: 1,
		2: 2,
		3: 3,
		4: 4,
		5: 5,
		6: 6,
		7: 7,
		8: 8,
		9: 9,
		A: 10,
		B: 11,
		C: 12,
		D: 13,
		E: 14,
		F: 15,
		a: 10,
		b: 11,
		c: 12,
		d: 13,
		e: 14,
		f: 15
	};
	exports.NUM = [
		"0",
		"1",
		"2",
		"3",
		"4",
		"5",
		"6",
		"7",
		"8",
		"9"
	];
	exports.ALPHANUM = exports.ALPHA.concat(exports.NUM);
	exports.MARK = [
		"-",
		"_",
		".",
		"!",
		"~",
		"*",
		"'",
		"(",
		")"
	];
	exports.USERINFO_CHARS = exports.ALPHANUM.concat(exports.MARK).concat([
		"%",
		";",
		":",
		"&",
		"=",
		"+",
		"$",
		","
	]);
	exports.URL_CHAR = [
		"!",
		"\"",
		"$",
		"%",
		"&",
		"'",
		"(",
		")",
		"*",
		"+",
		",",
		"-",
		".",
		"/",
		":",
		";",
		"<",
		"=",
		">",
		"@",
		"[",
		"\\",
		"]",
		"^",
		"_",
		"`",
		"{",
		"|",
		"}",
		"~"
	].concat(exports.ALPHANUM);
	exports.HEX = exports.NUM.concat([
		"a",
		"b",
		"c",
		"d",
		"e",
		"f",
		"A",
		"B",
		"C",
		"D",
		"E",
		"F"
	]);
	exports.TOKEN = [
		"!",
		"#",
		"$",
		"%",
		"&",
		"'",
		"*",
		"+",
		"-",
		".",
		"^",
		"_",
		"`",
		"|",
		"~"
	].concat(exports.ALPHANUM);
	exports.HEADER_CHARS = ["	"];
	for (let i = 32; i <= 255; i++) if (i !== 127) exports.HEADER_CHARS.push(i);
	exports.CONNECTION_TOKEN_CHARS = exports.HEADER_CHARS.filter((c) => c !== 44);
	exports.QUOTED_STRING = ["	", " "];
	for (let i = 33; i <= 255; i++) if (i !== 34 && i !== 92) exports.QUOTED_STRING.push(i);
	exports.HTAB_SP_VCHAR_OBS_TEXT = ["	", " "];
	for (let i = 33; i <= 126; i++) exports.HTAB_SP_VCHAR_OBS_TEXT.push(i);
	for (let i = 128; i <= 255; i++) exports.HTAB_SP_VCHAR_OBS_TEXT.push(i);
	exports.MAJOR = exports.NUM_MAP;
	exports.MINOR = exports.MAJOR;
	exports.SPECIAL_HEADERS = {
		"connection": exports.HEADER_STATE.CONNECTION,
		"content-length": exports.HEADER_STATE.CONTENT_LENGTH,
		"proxy-connection": exports.HEADER_STATE.CONNECTION,
		"transfer-encoding": exports.HEADER_STATE.TRANSFER_ENCODING,
		"upgrade": exports.HEADER_STATE.UPGRADE
	};
	exports.default = {
		ERROR: exports.ERROR,
		TYPE: exports.TYPE,
		FLAGS: exports.FLAGS,
		LENIENT_FLAGS: exports.LENIENT_FLAGS,
		METHODS: exports.METHODS,
		STATUSES: exports.STATUSES,
		FINISH: exports.FINISH,
		HEADER_STATE: exports.HEADER_STATE,
		ALPHA: exports.ALPHA,
		NUM_MAP: exports.NUM_MAP,
		HEX_MAP: exports.HEX_MAP,
		NUM: exports.NUM,
		ALPHANUM: exports.ALPHANUM,
		MARK: exports.MARK,
		USERINFO_CHARS: exports.USERINFO_CHARS,
		URL_CHAR: exports.URL_CHAR,
		HEX: exports.HEX,
		TOKEN: exports.TOKEN,
		HEADER_CHARS: exports.HEADER_CHARS,
		CONNECTION_TOKEN_CHARS: exports.CONNECTION_TOKEN_CHARS,
		QUOTED_STRING: exports.QUOTED_STRING,
		HTAB_SP_VCHAR_OBS_TEXT: exports.HTAB_SP_VCHAR_OBS_TEXT,
		MAJOR: exports.MAJOR,
		MINOR: exports.MINOR,
		SPECIAL_HEADERS: exports.SPECIAL_HEADERS,
		METHODS_HTTP: exports.METHODS_HTTP,
		METHODS_ICE: exports.METHODS_ICE,
		METHODS_RTSP: exports.METHODS_RTSP,
		METHOD_MAP: exports.METHOD_MAP,
		H_METHOD_MAP: exports.H_METHOD_MAP,
		STATUSES_HTTP: exports.STATUSES_HTTP
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/llhttp/llhttp-wasm.js
var require_llhttp_wasm = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { Buffer: Buffer$4 } = __require("node:buffer");
	const wasmBase64 = "AGFzbQEAAAABJwdgAX8Bf2ADf39/AX9gAn9/AGABfwBgBH9/f38Bf2AAAGADf39/AALLAQgDZW52GHdhc21fb25faGVhZGVyc19jb21wbGV0ZQAEA2VudhV3YXNtX29uX21lc3NhZ2VfYmVnaW4AAANlbnYLd2FzbV9vbl91cmwAAQNlbnYOd2FzbV9vbl9zdGF0dXMAAQNlbnYUd2FzbV9vbl9oZWFkZXJfZmllbGQAAQNlbnYUd2FzbV9vbl9oZWFkZXJfdmFsdWUAAQNlbnYMd2FzbV9vbl9ib2R5AAEDZW52GHdhc21fb25fbWVzc2FnZV9jb21wbGV0ZQAAAzU0BQYAAAMAAAAAAAADAQMAAwMDAAACAAAAAAICAgICAgICAgIBAQEBAQEBAQEBAwAAAwAAAAQFAXABExMFAwEAAgYIAX8BQcDZBAsHxQcoBm1lbW9yeQIAC19pbml0aWFsaXplAAgZX19pbmRpcmVjdF9mdW5jdGlvbl90YWJsZQEAC2xsaHR0cF9pbml0AAkYbGxodHRwX3Nob3VsZF9rZWVwX2FsaXZlADcMbGxodHRwX2FsbG9jAAsGbWFsbG9jADkLbGxodHRwX2ZyZWUADARmcmVlAAwPbGxodHRwX2dldF90eXBlAA0VbGxodHRwX2dldF9odHRwX21ham9yAA4VbGxodHRwX2dldF9odHRwX21pbm9yAA8RbGxodHRwX2dldF9tZXRob2QAEBZsbGh0dHBfZ2V0X3N0YXR1c19jb2RlABESbGxodHRwX2dldF91cGdyYWRlABIMbGxodHRwX3Jlc2V0ABMObGxodHRwX2V4ZWN1dGUAFBRsbGh0dHBfc2V0dGluZ3NfaW5pdAAVDWxsaHR0cF9maW5pc2gAFgxsbGh0dHBfcGF1c2UAFw1sbGh0dHBfcmVzdW1lABgbbGxodHRwX3Jlc3VtZV9hZnRlcl91cGdyYWRlABkQbGxodHRwX2dldF9lcnJubwAaF2xsaHR0cF9nZXRfZXJyb3JfcmVhc29uABsXbGxodHRwX3NldF9lcnJvcl9yZWFzb24AHBRsbGh0dHBfZ2V0X2Vycm9yX3BvcwAdEWxsaHR0cF9lcnJub19uYW1lAB4SbGxodHRwX21ldGhvZF9uYW1lAB8SbGxodHRwX3N0YXR1c19uYW1lACAabGxodHRw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AXRrQT5qIQILIAEgAjYCHCABQgA3AhAgAkECdEH01wBqIQACQEHI1QAoAgAiA0EBIAJ0IgdxRQRAIAAgATYCAEHI1QAgAyAHcjYCACABIAA2AhggASABNgIIIAEgATYCDAwBCyAEQRkgAkEBdmtBACACQR9HG3QhAiAAKAIAIQACQANAIAAiAygCBEF4cSAERg0BIAJBHXYhACACQQF0IQIgAyAAQQRxakEQaiIHKAIAIgANAAsgByABNgIAIAEgAzYCGCABIAE2AgwgASABNgIIDAELIAMoAggiACABNgIMIAMgATYCCCABQQA2AhggASADNgIMIAEgADYCCAtB5NUAQeTVACgCAEEBayIAQX8gABs2AgALCwcAIAAtACgLBwAgAC0AKgsHACAALQArCwcAIAAtACkLBwAgAC8BNAsHACAALQAwC0ABBH8gACgCGCEBIAAvAS4hAiAALQAoIQMgACgCOCEEIAAQOCAAIAQ2AjggACADOgAoIAAgAjsBLiAAIAE2AhgL5YUCAgd/A34gASACaiEEAkAgACIDKAIMIgANACADKAIEBEAgAyABNgIECyMAQRBrIgkkAAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAn8CQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkAC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C0HjAQwHC0HXAQwGC0HYAQwFC0HZAQwEC0HaAQwDC0HbAQwCC0HdAQwBC0HcAQshAgNAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQCADAn8CQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAn8CQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAn8CQAJAAkACQAJAAkACQAJ/AkACQAJAAn8CQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAIAMCfwJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACfwJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkAg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ogKiAqICogKiAqICogKiAqICogKiAqICogIAogILIAQgAUEBaiIBRw0AC0HJACECDOwCCyABQQFqIQEgA0Evai0AAEEBcQ2lAiADQQA2AhwgAyABNgIUIANBlxA2AhAgA0EKNgIMQQAhAgzrAgsgASAERwRAA0AgAS0AAEEgRw0VIAQgAUEBaiIBRw0AC0H4ACECDOsCC0H4ACECDOoCCyADQQI6ACgMOAtBACECIANBADYCHCADQb8LNgIQIANBAjYCDCADIAFBAWo2AhQM6AILQQAhAgzOAgtBDSECDM0CC0ETIQIMzAILQRUhAgzLAgtBFiECDMoCC0EYIQIMyQILQRkhAgzIAgtBGiECDMcCC0EbIQIMxgILQRwhAgzFAgtBHSECDMQCC0EeIQIMwwILQR8hAgzCAgtBICECDMECC0EiIQIMwAILQSMhAgy/AgtBJSECDL4CC0HlACECDL0CCyADQT02AhwgAyABNgIUIAMgADYCDEEAIQIM1QILIANBGzYCHCADIAE2AhQgA0GkHDYCECADQRU2AgxBACECDNQCCyADQSA2AhwgAyABNgIUIANBmBo2AhAgA0EVNgIMQQAhAgzTAgsgA0ETNgIcIAMgATYCFCADQZgaNgIQIANBFTYCDEEAIQIM0gILIANBCzYCHCADIAE2AhQgA0GYGjYCECADQRU2AgxBACECDNECCyADQRA2AhwgAyABNgIUIANBmBo2AhAgA0EVNgIMQQAhAgzQAgsgA0EgNgIcIAMgATYCFCADQaQcNgIQIANBFTYCDEEAIQIMzwILIANBCzYCHCADIAE2AhQgA0GkHDYCECADQRU2AgxBACECDM4CCyADQQw2AhwgAyABNgIUIANBpBw2AhAgA0EVNgIMQQAhAgzNAgtBACECIANBADYCHCADIAE2AhQgA0HdDjYCECADQRI2AgwMzAILAkADQAJAIAEtAABBCmsOBAACAgACCyAEIAFBAWoiAUcNAAtB/QEhAgzMAgsCQAJAIAMtADZBAUcNAEEAIQACQCADKAI4IgJFDQAgAigCYCICRQ0AIAMgAhEAACEACyAARQ0AIABBFUcNASADQfwBNgIcIAMgATYCFCADQdwZNgIQIANBFTYCDEEAIQIMzQILQdwBIQIMswILIANBADYCHCADIAE2AhQgA0H5CzYCECADQR82AgxBACECDMsCCwJAAkAgAy0AKEEBaw4CBAEAC0HbASECDLICC0HUASECDLECCyADQQI6ADFBACEAAkAgAygCOCICRQ0AIAIoAgAiAkUNACADIAIRAAAhAAsgAEUEQEHdASECDLECCyAAQRVHBEAgA0EANgIcIAMgATYCFCADQbQMNgIQIANBEDYCDEEAIQIMygILIANB+wE2AhwgAyABNgIUIANBgRo2AhAgA0EVNgIMQQAhAgzJAgsgASAERgRAQfoBIQIMyQILIAEtAABByABGDQEgA0EBOgAoC0HAASECDK4CC0HaASECDK0CCyABIARHBEAgA0EMNgIIIAMgATYCBEHZASECDK0CC0H5ASECDMUCCyABIARGBEBB+AEhAgzFAgsgAS0AAEHIAEcNBCABQQFqIQFB2AEhAgyrAgsgASAERgRAQfcBIQIMxAILAkACQCABLQAAQcUAaw4QAAUFBQUFBQUFBQUFBQUFAQULIAFBAWohAUHWASECDKsCCyABQQFqIQFB1wEhAgyqAgtB9gEhAiABIARGDcICIAMoAgAiACAEIAFraiEFIAEgAGtBAmohBgJAA0AgAS0AACAAQbrVAGotAABHDQMgAEECRg0BIABBAWohACAEIAFBAWoiAUcNAAsgAyAFNgIADMMCCyADKAIEIQAgA0IANwMAIAMgACAGQQFqIgEQLiIARQRAQeMBIQIMqgILIANB9QE2AhwgAyABNgIUIAMgADYCDEEAIQIMwgILQfQBIQIgASAERg3BAiADKAIAIgAgBCABa2ohBSABIABrQQFqIQYCQANAIAEtAAAgAEG41QBqLQAARw0CIABBAUYNASAAQQFqIQAgBCABQQFqIgFHDQALIAMgBTYCAAzCAgsgA0GBBDsBKCADKAIEIQAgA0IANwMAIAMgACAGQQFqIgEQLiIADQMMAgsgA0EANgIAC0EAIQIgA0EANgIcIAMgATYCFCADQeUfNgIQIANBCDYCDAy/AgtB1QEhAgylAgsgA0HzATYCHCADIAE2AhQgAyAANgIMQQAhAgy9AgtBACEAAkAgAygCOCICRQ0AIAIoAkAiAkUNACADIAIRAAAhAAsgAEUNbiAAQRVHBEAgA0EANgIcIAMgATYCFCADQYIPNgIQIANBIDYCDEEAIQIMvQILIANBjwE2AhwgAyABNgIUIANB7Bs2AhAgA0EVNgIMQQAhAgy8AgsgASAERwRAIANBDTYCCCADIAE2AgRB0wEhAgyjAgtB8gEhAgy7AgsgASAERgRAQfEBIQIMuwILAkACQAJAIAEtAABByABrDgsAAQgICAgICAgIAggLIAFBAWohAUHQASECDKMCCyABQQFqIQFB0QEhAgyiAgsgAUEBaiEBQdIBIQIMoQILQfABIQIgASAERg25AiADKAIAIgAgBCABa2ohBiABIABrQQJqIQUDQCABLQAAIABBtdUAai0AAEcNBCAAQQJGDQMgAEEBaiEAIAQgAUEBaiIBRw0ACyADIAY2AgAMuQILQe8BIQIgASAERg24AiADKAIAIgAgBCABa2ohBiABIABrQQFqIQUDQCABLQAAIABBs9UAai0AAEcNAyAAQQFGDQIgAEEBaiEAIAQgAUEBaiIBRw0ACyADIAY2AgAMuAILQe4BIQIgASAERg23AiADKAIAIgAgBCABa2ohBiABIABrQQJqIQUDQCABLQAAIABBsNUAai0AAEcNAiAAQQJGDQEgAEEBaiEAIAQgAUEBaiIBRw0ACyADIAY2AgAMtwILIAMoAgQhACADQgA3AwAgAyAAIAVBAWoiARArIgBFDQIgA0HsATYCHCADIAE2AhQgAyAANgIMQQAhAgy2AgsgA0EANgIACyADKAIEIQAgA0EANgIEIAMgACABECsiAEUNnAIgA0HtATYCHCADIAE2AhQgAyAANgIMQQAhAgy0AgtBzwEhAgyaAgtBACEAAkAgAygCOCICRQ0AIAIoAjQiAkUNACADIAIRAAAhAAsCQCAABEAgAEEVRg0BIANBADYCHCADIAE2AhQgA0HqDTYCECADQSY2AgxBACECDLQCC0HOASECDJoCCyADQesBNgIcIAMgATYCFCADQYAbNgIQIANBFTYCDEEAIQIMsgILIAEgBEYEQEHrASECDLICCyABLQAAQS9GBEAgAUEBaiEBDAELIANBADYCHCADIAE2AhQgA0GyODYCECADQQg2AgxBACECDLECC0HNASECDJcCCyABIARHBEAgA0EONgIIIAMgATYCBEHMASECDJcCC0HqASECDK8CCyABIARGBEBB6QEhAgyvAgsgAS0AAEEwayIAQf8BcUEKSQRAIAMgADoAKiABQQFqIQFBywEhAgyWAgsgAygCBCEAIANBADYCBCADIAAgARAvIgBFDZcCIANB6AE2AhwgAyABNgIUIAMgADYCDEEAIQIMrgILIAEgBEYEQEHnASECDK4CCwJAIAEtAABBLkYEQCABQQFqIQEMAQsgAygCBCEAIANBADYCBCADIAAgARAvIgBFDZgCIANB5gE2AhwgAyABNgIUIAMgADYCDEEAIQIMrgILQcoBIQIMlAILIAEgBEYEQEHlASECDK0CC0EAIQBBASEFQQEhB0EAIQICQAJAAkACQAJAAn8CQAJAAkACQAJAAkACQCABLQAAQTBrDgoKCQABAgMEBQYICwtBAgwGC0EDDAULQQQMBAtBBQwDC0EGDAILQQcMAQtBCAshAkEAIQVBACEHDAILQQkhAkEBIQBBACEFQQAhBwwBC0EAIQVBASECCyADIAI6ACsgAUEBaiEBAkACQCADLQAuQRBxDQACQAJAAkAgAy0AKg4DAQACBAsgB0UNAwwCCyAADQEMAgsgBUUNAQsgAygCBCEAIANBADYCBCADIAAgARAvIgBFDQIgA0HiATYCHCADIAE2AhQgAyAANgIMQQAhAgyvAgsgAygCBCEAIANBADYCBCADIAAgARAvIgBFDZoCIANB4wE2AhwgAyABNgIUIAMgADYCDEEAIQIMrgILIAMoAgQhACADQQA2AgQgAyAAIAEQLyIARQ2YAiADQeQBNgIcIAMgATYCFCADIAA2AgwMrQILQckBIQIMkwILQQAhAAJAIAMoAjgiAkUNACACKAJEIgJFDQAgAyACEQAAIQALAkAgAARAIABBFUYNASADQQA2AhwgAyABNgIUIANBpA02AhAgA0EhNgIMQQAhAgytAgtByAEhAgyTAgsgA0HhATYCHCADIAE2AhQgA0HQGjYCECADQRU2AgxBACECDKsCCyABIARGBEBB4QEhAgyrAgsCQCABLQAAQSBGBEAgA0EAOwE0IAFBAWohAQwBCyADQQA2AhwgAyABNgIUIANBmRE2AhAgA0EJNgIMQQAhAgyrAgtBxwEhAgyRAgsgASAERgRAQeABIQIMqgILAkAgAS0AAEEwa0H/AXEiAkEKSQRAIAFBAWohAQJAIAMvATQiAEGZM0sNACADIABBCmwiADsBNCAAQf7/A3EgAkH//wNzSw0AIAMgACACajsBNAwCC0EAIQIgA0EANgIcIAMgATYCFCADQZUeNgIQIANBDTYCDAyrAgsgA0EANgIcIAMgATYCFCADQZUeNgIQIANBDTYCDEEAIQIMqgILQcYBIQIMkAILIAEgBEYEQEHfASECDKkCCwJAIAEtAABBMGtB/wFxIgJBCkkEQCABQQFqIQECQCADLwE0IgBBmTNLDQAgAyAAQQpsIgA7ATQgAEH+/wNxIAJB//8Dc0sNACADIAAgAmo7ATQMAgtBACECIANBADYCHCADIAE2AhQgA0GVHjYCECADQQ02AgwMqgILIANBADYCHCADIAE2AhQgA0GVHjYCECADQQ02AgxBACECDKkCC0HFASECDI8CCyABIARGBEBB3gEhAgyoAgsCQCABLQAAQTBrQf8BcSICQQpJBEAgAUEBaiEBAkAgAy8BNCIAQZkzSw0AIAMgAEEKbCIAOwE0IABB/v8DcSACQf//A3NLDQAgAyAAIAJqOwE0DAILQQAhAiADQQA2AhwgAyABNgIUIANBlR42AhAgA0ENNgIMDKkCCyADQQA2AhwgAyABNgIUIANBlR42AhAgA0ENNgIMQQAhAgyoAgtBxAEhAgyOAgsgASAERgRAQd0BIQIMpwILAkACQAJAAkAgAS0AAEEKaw4XAgMDAAMDAwMDAwMDAwMDAwMDAwMDAwEDCyABQQFqDAULIAFBAWohAUHDASECDI8CCyABQQFqIQEgA0Evai0AAEEBcQ0IIANBADYCHCADIAE2AhQgA0GNCzYCECADQQ02AgxBACECDKcCCyADQQA2AhwgAyABNgIUIANBjQs2AhAgA0ENNgIMQQAhAgymAgsgASAERwRAIANBDzYCCCADIAE2AgRBASECDI0CC0HcASECDKUCCwJAAkADQAJAIAEtAABBCmsOBAIAAAMACyAEIAFBAWoiAUcNAAtB2wEhAgymAgsgAygCBCEAIANBADYCBCADIAAgARAtIgBFBEAgAUEBaiEBDAQLIANB2gE2AhwgAyAANgIMIAMgAUEBajYCFEEAIQIMpQILIAMoAgQhACADQQA2AgQgAyAAIAEQLSIADQEgAUEBagshAUHBASECDIoCCyADQdkBNgIcIAMgADYCDCADIAFBAWo2AhRBACECDKICC0HCASECDIgCCyADQS9qLQAAQQFxDQEgA0EANgIcIAMgATYCFCADQeQcNgIQIANBGTYCDEEAIQIMoAILIAEgBEYEQEHZASEC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IAFBAWohAUGeASECDOQBCyABQQFqIQFBnwEhAgzjAQtBtwEhAiABIARGDfsBIAMoAgAiACAEIAFraiEFIAEgAGtBA2ohBgJAA0AgAS0AACAAQezUAGotAABHDSggAEEDRg0BIABBAWohACAEIAFBAWoiAUcNAAsgAyAFNgIADPwBCyADQQA2AgAgBkEBaiEBQQ0MKAtBtgEhAiABIARGDfoBIAMoAgAiACAEIAFraiEFIAEgAGtBAmohBgJAA0AgAS0AACAAQaHVAGotAABHDScgAEECRg0BIABBAWohACAEIAFBAWoiAUcNAAsgAyAFNgIADPsBCyADQQA2AgAgBkEBaiEBQQwMJwtBtQEhAiABIARGDfkBIAMoAgAiACAEIAFraiEFIAEgAGtBAWohBgJAA0AgAS0AACAAQerUAGotAABHDSYgAEEBRg0BIABBAWohACAEIAFBAWoiAUcNAAsgAyAFNgIADPoBCyADQQA2AgAgBkEBaiEBQQMMJgtBtAEhAiABIARGDfgBIAMoAgAiACAEIAFraiEFIAEgAGtBAWohBgJAA0AgAS0AACAAQejUAGotAABHDSUgAEEBRg0BIABBAWohACAEIAFBAWoiAUcNAAsgAyAFNgIADPkBCyADQQA2AgAgBkEBaiEBQSYMJQsgASAERgRAQbMBIQIM+AELAkACQCABLQAAQdQAaw4CAAEnCyABQQFqIQFBmQEhAgzfAQsgAUEBaiEBQZoBIQIM3gELQbIBIQIgASAERg32ASADKAIAIgAgBCABa2ohBSABIABrQQFqIQYCQANAIAEtAAAgAEHm1ABqLQAARw0jIABBAUYNASAAQQFqIQAgBCABQQFqIgFHDQALIAMgBTYCAAz3AQsgA0EANgIAIAZBAWohAUEnDCMLQbEBIQIgASAERg31ASADKAIAIgAgBCABa2ohBSABIABrQQFqIQYCQANAIAEtAAAgAEHk1ABqLQAARw0iIABBAUYNASAAQQFqIQAgBCABQQFqIgFHDQALIAMgBTYCAAz2AQsgA0EANgIAIAZBAWohAUEcDCILQbABIQIgASAERg30ASADKAIAIgAgBCABa2ohBSABIABrQQVqIQYCQANAIAEtAAAgAEHe1ABqLQAARw0hIABBBUYNASAAQQFqIQAgBCABQQFqIgFHDQALIAMgBTYCAAz1AQsgA0EANgIAIAZBAWohAUEGDCELQa8BIQIgASAERg3zASADKAIAIgAgBCABa2ohBSABIABrQQRqIQYCQANAIAEtAAAgAEHZ1ABqLQAARw0gIABBBEYNASAAQQFqIQAgBCABQQFqIgFHDQALIAMgBTYCAAz0AQsgA0EANgIAIAZBAWohAUEZDCALIAEgBEYEQEGuASECDPMBCwJAAkACQAJAIAEtAABBLWsOIwAkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJAEkJCQkJAIkJCQDJAsgAUEBaiEBQY4BIQIM3AELIAFBAWohAUGPASECDNsBCyABQQFqIQFBlAEhAgzaAQsgAUEBaiEBQZUBIQIM2QELQa0BIQIgASAERg3xASADKAIAIgAgBCABa2ohBSABIABrQQFqIQYCQANAIAEtAAAgAEHX1ABqLQAARw0eIABBAUYNASAAQQFqIQAgBCABQQFqIgFHDQALIAMgBTYCAAzyAQsgA0EANgIAIAZBAWohAUELDB4LIAEgBEYEQEGsASECDPEBCwJAAkAgAS0AAEHBAGsOAwAgASALIAFBAWohAUGQASECDNgBCyABQQFqIQFBkwEhAgzXAQsgASAERgRAQasBIQIM8AELAkACQCABLQAAQcEAaw4PAB8fHx8fHx8fHx8fHx8BHwsgAUEBaiEBQZEBIQIM1wELIAFBAWohAUGSASECDNYBCyABIARGBEBBqgEhAgzvAQsgAS0AAEHMAEcNHCABQQFqIQFBCgwbC0GpASECIAEgBEYN7QEgAygCACIAIAQgAWtqIQUgASAAa0EFaiEGAkADQCABLQAAIABB0dQAai0AAEcNGiAAQQVGDQEgAEEBaiEAIAQgAUEBaiIBRw0ACyADIAU2AgAM7gELIANBADYCACAGQQFqIQFBHgwaC0GoASECIAEgBEYN7AEgAygCACIAIAQgAWtqIQUgASAAa0EGaiEGAkADQCABLQAAIABBytQAai0AAEcNGSAAQQZGDQEgAEEBaiEAIAQgAUEBaiIBRw0ACyADIAU2AgAM7QELIANBADYCACAGQQFqIQFBFQwZC0GnASECIAEgBEYN6wEgAygCACIAIAQgAWtqIQUgASAAa0ECaiEGAkADQCABLQAAIABBx9QAai0AAEcNGCAAQQJGDQEgAEEBaiEAIAQgAUEBaiIBRw0ACyADIAU2AgAM7AELIANBADYCACAGQQFqIQFBFwwYC0GmASECIAEgBEYN6gEgAygCACIAIAQgAWtqIQUgASAAa0EFaiEGAkADQCABLQAAIABBwdQAai0AAEcNFyAAQQVGDQEgAEEBaiEAIAQgAUEBaiIBRw0ACyADIAU2AgAM6wELIANBADYCACAGQQFqIQFBGAwXCyABIARGBEBBpQEhAgzqAQsCQAJAIAEtAABByQBrDgcAGRkZGRkBGQsgAUEBaiEBQYsBIQIM0QELIAFBAWohAUGMASECDNABC0GkASECIAEgBEYN6AEgAygCACIAIAQgAWtqIQUgASAAa0EBaiEGAkADQCABLQAAIABBptUAai0AAEcNFSAAQQFGDQEgAEEBaiEAIAQgAUEBaiIBRw0ACyADIAU2AgAM6QELIANBADYCACAGQQFqIQFBCQwVC0GjASECIAEgBEYN5wEgAygCACIAIAQgAWtqIQUgASAAa0EBaiEGAkADQCABLQAAIABBpNUAai0AAEcNFCAAQQFGDQEgAEEBaiEAIAQgAUEBaiIBRw0ACyADIAU2AgAM6AELIANBADYCACAGQQFqIQFBHwwUC0GiASECIAEgBEYN5gEgAygCACIAIAQgAWtqIQUgASAAa0ECaiEGAkADQCABLQAAIABBvtQAai0AAEcNEyAAQQJGDQEgAEEBaiEAIAQgAUEBaiIBRw0ACyADIAU2AgAM5wELIANBADYCACAGQQFqIQFBAgwTC0GhASECIAEgBEYN5QEgAygCACIAIAQgAWtqIQUgASAAa0EBaiEGA0AgAS0AACAAQbzUAGotAABHDREgAEEBRg0CIABBAWohACAEIAFBAWoiAUcNAAsgAyAFNgIADOUBCyABIARGBEBBoAEhAgzlAQtBASABLQAAQd8ARw0RGiABQQFqIQFBhwEhAgzLAQsgA0EANgIAIAZBAWohAUGIASECDMoBC0GfASECIAEgBEYN4gEgAygCACIAIAQgAWtqIQUgASAAa0EIaiEGAkADQCABLQAAIABBhNUAai0AAEcNDyAAQQhGDQEgAEEBaiEAIAQgAUEBaiIBRw0ACyADIAU2AgAM4wELIANBADYCACAGQQFqIQFBKQwPC0GeASECIAEgBEYN4QEgAygCACIAIAQgAWtqIQUgASAAa0EDaiEGAkADQCABLQAAIABBuNQAai0AAEcNDiAAQQNGDQEgAEEBaiEAIAQgAUEBaiIBRw0ACyADIAU2AgAM4gELIANBADYCACAGQQFqIQFBLQwOCyABIARGBEBBnQEhAgzhAQsgAS0AAEHFAEcNDiABQQFqIQFBhAEhAgzHAQsgASAERgRAQZwBIQIM4AELAkACQCABLQAAQcwAaw4IAA8PDw8PDwEPCyABQQFqIQFBggEhAgzHAQsgAUEBaiEBQYMBIQIMxgELQZsBIQIgASAERg3eASADKAIAIgAgBCABa2ohBSABIABrQQRqIQYCQANAIAEtAAAgAEGz1ABqLQAARw0LIABBBEYNASAAQQFqIQAgBCABQQFqIgFHDQALIAMgBTYCAAzfAQsgA0EANgIAIAZBAWohAUEjDAsLQZoBIQIgASAERg3dASADKAIAIgAgBCABa2ohBSABIABrQQJqIQYCQANAIAEtAAAgAEGw1ABqLQAARw0KIABBAkYNASAAQQFqIQAgBCABQQFqIgFHDQALIAMgBTYCAAzeAQsgA0EANgIAIAZBAWohAUEADAoLIAEgBEYEQEGZASECDN0BCwJAAkAgAS0AAEHIAGsOCAAMDAwMDAwBDAsgAUEBaiEBQf0AIQIMxAELIAFBAWohAUGAASECDMMBCyABIARGBEBBmAEhAgzcAQsCQAJAIAEtAABBzgBrDgMACwELCyABQQFqIQFB/gAhAgzDAQsgAUEBaiEBQf8AIQIMwgELIAEgBEYEQEGXASECDNsBCyABLQAAQdkARw0IIAFBAWohAUEIDAcLQZYBIQIgASAERg3ZASADKAIAIgAgBCABa2ohBSABIABrQQNqIQYCQANAIAEtAAAgAEGs1ABqLQAARw0GIABBA0YNASAAQQFqIQAgBCABQQFqIgFHDQALIAMgBTYCAAzaAQsgA0EANgIAIAZBAWohAUEFDAYLQZUBIQIgASAERg3YASADKAIAIgAgBCABa2ohBSABIABrQQVqIQYCQANAIAEtAAAgAEGm1ABqLQAARw0FIABBBUYNASAAQQFqIQAgBCABQQFqIgFHDQALIAMgBTYCAAzZAQsgA0EANgIAIAZBAWohAUEWDAULQZQBIQIgASAERg3XASADKAIAIgAgBCABa2ohBSABIABrQQJqIQYCQANAIAEtAAAgAEGh1QBqLQAARw0EIABBAkYNASAAQQFqIQAgBCABQQFqIgFHDQALIAMgBTYCAAzYAQsgA0EANgIAIAZBAWohAUEQDAQLIAEgBEYEQEGTASECDNcBCwJAAkAgAS0AAEHDAGsODAAGBgYGBgYGBgYGAQYLIAFBAWohAUH5ACECDL4BCyABQQFqIQFB+gAhAgy9AQtBkgEhAiABIARGDdUBIAMoAgAiACAEIAFraiEFIAEgAGtBBWohBgJAA0AgAS0AACAAQaDUAGotAABHDQIgAEEFRg0BIABBAWohACAEIAFBAWoiAUcNAAsgAyAFNgIADNYBCyADQQA2AgAgBkEBaiEBQSQMAgsgA0EANgIADAILIAEgBEYEQEGRASECDNQBCyABLQAAQcwARw0BIAFBAWohAUETCzoAKSADKAIEIQAgA0EANgIEIAMgACABEC4iAA0CDAELQQAhAiADQQA2AhwgAyABNgIUIANB/h82AhAgA0EGNgIMDNEBC0H4ACECDLcBCyADQZABNgIcIAMgATYCFCADIAA2AgxBACECDM8BC0EAIQACQCADKAI4IgJFDQAgAigCQCICRQ0AIAMgAhEAACEACyAARQ0AIABBFUYNASADQQA2AhwgAyABNgIUIANBgg82AhAgA0EgNgIMQQAhAgzOAQtB9wAhAgy0AQsgA0GPATYCHCADIAE2AhQgA0HsGzYCECADQRU2AgxBACECDMwBCyABIARGBEBBjwEhAgzMAQsCQCABLQAAQSBGBEAgAUEBaiEBDAELIANBADYCHCADIAE2AhQgA0GbHzYCECADQQY2AgxBACECDMwBC0ECIQIMsgELA0AgAS0AAEEgRw0CIAQgAUEBaiIBRw0AC0GOASECDMoBCyABIARGBEBBjQEhAgzKAQsCQCABLQAAQQlrDgRKAABKAAtB9QAhAgywAQsgAy0AKUEFRgRAQfYAIQIMsAELQfQAIQIMrwELIAEgBEYEQEGMASECDMgBCyADQRA2AgggAyABNgIEDAoLIAEgBEYEQEGLASECDMcBCwJAIAEtAABBCWsOBEcAAEcAC0HzACECDK0BCyABIARHBEAgA0EQNgIIIAMgATYCBEHxACECDK0BC0GKASECDMUBCwJAIAEgBEcEQANAIAEtAABBoNAAai0AACIAQQNHBEACQCAAQQFrDgJJAAQLQfAAIQIMrwELIAQgAUEBaiIBRw0AC0GIASEC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BCABQQFqIgFHDQALQfsAIQIMpwELIAMoAgQhACADQQA2AgQgAyAAIAEQLCIARQ0DIANB2wA2AhwgAyABNgIUIAMgADYCDEEAIQIMpgELIAMoAgQhACADQQA2AgQgAyAAIAEQLCIARQ0DIANB3QA2AhwgAyABNgIUIAMgADYCDEEAIQIMpQELIAMoAgQhACADQQA2AgQgAyAAIAEQLCIARQ0DIANB+gA2AhwgAyABNgIUIAMgADYCDEEAIQIMpAELIANBADYCHCADIAE2AhQgA0G8CjYCECADQQc2AgxBACECDKMBC0HPACECDIkBC0HRACECDIgBC0HnACECDIcBCyABIARGBEBB+gAhAgygAQsCQCABLQAAQQlrDgQgAAAgAAsgAUEBaiEBQeYAIQIMhgELIAEgBEYEQEH5ACECDJ8BCwJAIAEtAABBCWsOBB8AAB8AC0EAIQACQCADKAI4IgJFDQAgAigCOCICRQ0AIAMgAhEAACEACyAARQRAQeIBIQIMhgELIABBFUcEQCADQQA2AhwgAyABNgIUIANByQ02AhAgA0EaNgIMQQAhAgyfAQsgA0H4ADYCHCADIAE2AhQgA0HqGjYCECADQRU2AgxBACECDJ4BCyABIARHBEAgA0ENNgIIIAMgATYCBEHkACECDIUBC0H3ACECDJ0BCyABIARGBEBB9gAhAgydAQsCQAJAAkAgAS0AAEHIAGsOCwABCwsLCwsLCwsCCwsgAUEBaiEBQd0AIQIMhQELIAFBAWohAUHgACECDIQBCyABQQFqIQFB4wAhAgyDAQtB9QAhAiABIARGDZsBIAMoAgAiACAEIAFraiEFIAEgAGtBAmohBgJAA0AgAS0AACAAQbXVAGotAABHDQggAEECRg0BIABBAWohACAEIAFBAWoiAUcNAAsgAyAFNgIADJwBCyADKAIEIQAgA0IANwMAIAMgACAGQQFqIgEQKyIABEAgA0H0ADYCHCADIAE2AhQgAyAANgIMQQAhAgycAQtB4gAhAgyCAQtBACEAAkAgAygCOCICRQ0AIAIoAjQiAkUNACADIAIRAAAhAAsCQCAABEAgAEEVRg0BIANBADYCHCADIAE2AhQgA0HqDTYCECADQSY2AgxBACECDJwBC0HhACECDIIBCyADQfMANgIcIAMgATYCFCADQYAbNgIQIANBFTYCDEEAIQIMmgELIAMtACkiAEEja0ELSQ0JAkAgAEEGSw0AQQEgAHRBygBxRQ0ADAoLQQAhAiADQQA2AhwgAyABNgIUIANB7Qk2AhAgA0EINgIMDJkBC0HyACECIAEgBEYNmAEgAygCACIAIAQgAWtqIQUgASAAa0EBaiEGAkADQCABLQAAIABBs9UAai0AAEcNBSAAQQFGDQEgAEEBaiEAIAQgAUEBaiIBRw0ACyADIAU2AgAMmQELIAMoAgQhACADQgA3AwAgAyAAIAZBAWoiARArIgAEQCADQfEANgIcIAMgATYCFCADIAA2AgxBACECDJkBC0HfACECDH8LQQAhAAJAIAMoAjgiAkUNACACKAI0IgJFDQAgAyACEQAAIQALAkAgAARAIABBFUYNASADQQA2AhwgAyABNgIUIANB6g02AhAgA0EmNgIMQQAhAgyZAQtB3gAhAgx/CyADQfAANgIcIAMgATYCFCADQYAbNgIQIANBFTYCDEEAIQIMlwELIAMtAClBIUYNBiADQQA2AhwgAyABNgIUIANBkQo2AhAgA0EINgIMQQAhAgyWAQtB7wAhAiABIARGDZUBIAMoAgAiACAEIAFraiEFIAEgAGtBAmohBgJAA0AgAS0AACAAQbDVAGotAABHDQIgAEECRg0BIABBAWohACAEIAFBAWoiAUcNAAsgAyAFNgIADJYBCyADKAIEIQAgA0IANwMAIAMgACAGQQFqIgEQKyIARQ0CIANB7QA2AhwgAyABNgIUIAMgADYCDEEAIQIMlQELIANBADYCAAsgAygCBCEAIANBADYCBCADIAAgARArIgBFDYABIANB7gA2AhwgAyABNgIUIAMgADYCDEEAIQIMkwELQdwAIQIMeQtBACEAAkAgAygCOCICRQ0AIAIoAjQiAkUNACADIAIRAAAhAAsCQCAABEAgAEEVRg0BIANBADYCHCADIAE2AhQgA0HqDTYCECADQSY2AgxBACECDJMBC0HbACECDHkLIANB7AA2AhwgAyABNgIUIANBgBs2AhAgA0EVNgIMQQAhAgyRAQsgAy0AKSIAQSNJDQAgAEEuRg0AIANBADYCHCADIAE2AhQgA0HJCTYCECADQQg2AgxBACECDJABC0HaACECDHYLIAEgBEYEQEHrACECDI8BCwJAIAEtAABBL0YEQCABQQFqIQEMAQsgA0EANgIcIAMgATYCFCADQbI4NgIQIANBCDYCDEEAIQIMjwELQdkAIQIMdQsgASAERwRAIANBDjYCCCADIAE2AgRB2AAhAgx1C0HqACECDI0BCyABIARGBEBB6QAhAgyNAQsgAS0AAEEwayIAQf8BcUEKSQRAIAMgADoAKiABQQFqIQFB1wAhAgx0CyADKAIEIQAgA0EANgIEIAMgACABEC8iAEUNeiADQegANgIcIAMgATYCFCADIAA2AgxBACECDIwBCyABIARGBEBB5wAhAgyMAQsCQCABLQAAQS5GBEAgAUEBaiEBDAELIAMoAgQhACADQQA2AgQgAyAAIAEQLyIARQ17IANB5gA2AhwgAyABNgIUIAMgADYCDEEAIQIMjAELQdYAIQIMcgsgASAERgRAQeUAIQIMiwELQQAhAEEBIQVBASEHQQAhAgJAAkACQAJAAkACfwJAAkACQAJAAkACQAJAIAEtAABBMGsOCgoJAAECAwQFBggLC0ECDAYLQQMMBQtBBAwEC0EFDAMLQQYMAgtBBwwBC0EICyECQQAhBUEAIQcMAgtBCSECQQEhAEEAIQVBACEHDAELQQAhBUEBIQILIAMgAjoAKyABQQFqIQECQAJAIAMtAC5BEHENAAJAAkACQCADLQAqDgMBAAIECyAHRQ0DDAILIAANAQwCCyAFRQ0BCyADKAIEIQAgA0EANgIEIAMgACABEC8iAEUNAiADQeIANgIcIAMgATYCFCADIAA2AgxBACECDI0BCyADKAIEIQAgA0EANgIEIAMgACABEC8iAEUNfSADQeMANgIcIAMgATYCFCADIAA2AgxBACECDIwBCyADKAIEIQAgA0EANgIEIAMgACABEC8iAEUNeyADQeQANgIcIAMgATYCFCADIAA2AgwMiwELQdQAIQIMcQsgAy0AKUEiRg2GAUHTACECDHALQQAhAAJAIAMoAjgiAkUNACACKAJEIgJFDQAgAyACEQAAIQALIABFBEBB1QAhAgxwCyAAQRVHBEAgA0EANgIcIAMgATYCFCADQaQNNgIQIANBITYCDEEAIQIMiQELIANB4QA2AhwgAyABNgIUIANB0Bo2AhAgA0EVNgIMQQAhAgyIAQsgASAERgRAQeAAIQIMiAELAkACQAJAAkACQCABLQAAQQprDgQBBAQABAsgAUEBaiEBDAELIAFBAWohASADQS9qLQAAQQFxRQ0BC0HSACECDHALIANBADYCHCADIAE2AhQgA0G2ETYCECADQQk2AgxBACECDIgBCyADQQA2AhwgAyABNgIUIANBthE2AhAgA0EJNgIMQQAhAgyHAQsgASAERgRAQd8AIQIMhwELIAEtAABBCkYEQCABQQFqIQEMCQsgAy0ALkHAAHENCCADQQA2AhwgAyABNgIUIANBthE2AhAgA0ECNgIMQQAhAgyGAQsgASAERgRAQd0AIQIMhgELIAEtAAAiAkENRgRAIAFBAWohAUHQACECDG0LIAEhACACQQlrDgQFAQEFAQsgBCABIgBGBEBB3AAhAgyFAQsgAC0AAEEKRw0AIABBAWoMAgtBACECIANBADYCHCADIAA2AhQgA0HKLTYCECADQQc2AgwMgwELIAEgBEYEQEHbACECDIMBCwJAIAEtAABBCWsOBAMAAAMACyABQQFqCyEBQc4AIQIMaAsgASAERgRAQdoAIQIMgQELIAEtAABBCWsOBAABAQABC0EAIQIgA0EANgIcIANBmhI2AhAgA0EHNgIMIAMgAUEBajYCFAx/CyADQYASOwEqQQAhAAJAIAMoAjgiAkUNACACKAI4IgJFDQAgAyACEQAAIQALIABFDQAgAEEVRw0BIANB2QA2AhwgAyABNgIUIANB6ho2AhAgA0EVNgIMQQAhAgx+C0HNACECDGQLIANBADYCHCADIAE2AhQgA0HJDTYCECADQRo2AgxBACECDHwLIAEgBEYEQEHZACECDHwLIAEtAABBIEcNPSABQQFqIQEgAy0ALkEBcQ09IANBADYCHCADIAE2AhQgA0HCHDYCECADQR42AgxBACECDHsLIAEgBEYEQEHYACECDHsLAkACQAJAAkACQCABLQAAIgBBCmsOBAIDAwABCyABQQFqIQFBLCECDGULIABBOkcNASADQQA2AhwgAyABNgIUIANB5xE2AhAgA0EKNgIMQQAhAgx9CyABQQFqIQEgA0Evai0AAEEBcUUNcyADLQAyQYABcUUEQCADQTJqIQIgAxA1QQAhAAJAIAMoAjgiBkUNACAGKAIoIgZFDQAgAyAGEQAAIQALAkACQCAADhZNTEsBAQEBAQEBAQEBAQEBAQEBAQEAAQsgA0EpNgIcIAMgATYCFCADQawZNgIQIANBFTYCDEEAIQIMfgsg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c3BvbnNlIHN0YXR1cwBFeHBlY3RlZCBMRiBhZnRlciBoZWFkZXJzAEludmFsaWQgY2hhcmFjdGVyIGluIGNodW5rIGV4dGVuc2lvbnMAVXNlciBjYWxsYmFjayBlcnJvcgBgb25fcmVzZXRgIGNhbGxiYWNrIGVycm9yAGBvbl9jaHVua19oZWFkZXJgIGNhbGxiYWNrIGVycm9yAGBvbl9tZXNzYWdlX2JlZ2luYCBjYWxsYmFjayBlcnJvcgBgb25fY2h1bmtfZXh0ZW5zaW9uX3ZhbHVlYCBjYWxsYmFjayBlcnJvcgBgb25fc3RhdHVzX2NvbXBsZXRlYCBjYWxsYmFjayBlcnJvcgBgb25fdmVyc2lvbl9jb21wbGV0ZWAgY2FsbGJhY2sgZXJyb3IAYG9uX3VybF9jb21wbGV0ZWAgY2FsbGJhY2sgZXJyb3IAYG9uX3Byb3RvY29sX2NvbXBsZXRlYCBjYWxsYmFjayBlcnJvcgBgb25fY2h1bmtfY29tcGxldGVgIGNhbGxiYWNrIGVycm9yAGBvbl9oZWFkZXJfdmFsdWVfY29tcGxldGVgIGNhbGxiYWNrIGVycm9yAGBvbl9tZXNzYWdlX2NvbXBsZXRlYCBjYWxsYmFjayBlcnJvcgBgb25fbWV0aG9kX2NvbXBsZXRlYCBjYWxsYmFjayBlcnJvcgBgb25faGVhZGVyX2ZpZWxkX2NvbXBsZXRlYCBjYWxsYmFjayBlcnJvcgBgb25fY2h1bmtfZXh0ZW5zaW9uX25hbWVgIGNhbGxiYWNrIGVycm9yAFVuZXhwZWN0ZWQgY2hhciBpbiB1cmwgc2VydmVyAEludmFsaWQgaGVhZGVyIHZhbHVlIGNoYXIASW52YWxpZCBoZWFkZXIgZmllbGQgY2hhcgBTcGFuIGNhbGxiYWNrIGVycm9yIGluIG9uX3ZlcnNpb24ASW52YWxpZCBtaW5vciB2ZXJzaW9uAEludmFsaWQgbWFqb3IgdmVyc2lvbgBFeHBlY3RlZCBzcGFjZSBhZnRlciB2ZXJzaW9uAEV4cGVjdGVkIENSTEYgYWZ0ZXIgdmVyc2lvbgBJbnZhbGlkIEhUVFAgdmVyc2lvbgBJbnZhbGlkIGhlYWRlciB0b2tlbgBTcGFuIGNhbGxiYWNrIGVycm9yIGluIG9uX3VybABJbnZhbGlkIGNoYXJhY3RlcnMgaW4gdXJsAFVuZXhwZWN0ZWQgc3RhcnQgY2hhciBpbiB1cmwARG91YmxlIEAgaW4gdXJsAFNwYW4gY2FsbGJhY2sgZXJyb3IgaW4gb25fcHJvdG9jb2wARW1wdHkgQ29udGVudC1MZW5ndGgASW52YWxpZCBjaGFyYWN0ZXIgaW4gQ29udGVudC1MZW5ndGgAVHJhbnNmZXItRW5jb2RpbmcgY2FuJ3QgYmUgcHJlc2VudCB3aXRoIENvbnRlbnQtTGVuZ3RoAER1cGxpY2F0ZSBDb250ZW50LUxlbmd0aABJbnZhbGlkIGNoYXIgaW4gdXJsIHBhdGgAQ29udGVudC1MZW5ndGggY2FuJ3QgYmUgcHJlc2VudCB3aXRoIFRyYW5zZmVyLUVuY29kaW5nAE1pc3NpbmcgZXhwZWN0ZWQgQ1IgYWZ0ZXIgY2h1bmsgc2l6ZQBFeHBlY3RlZCBMRiBhZnRlciBjaHVuayBzaXplAEludmFsaWQgY2hhcmFjdGVyIGluIGNodW5rIHNpemUAU3BhbiBjYWxsYmFjayBlcnJvciBpbiBvbl9oZWFkZXJfdmFsdWUAU3BhbiBjYWxsYmFjayBlcnJvciBpbiBvbl9jaHVua19leHRlbnNpb25fdmFsdWUASW52YWxpZCBjaGFyYWN0ZXIgaW4gY2h1bmsgZXh0ZW5zaW9ucyB2YWx1ZQBVbmV4cGVjdGVkIHdoaXRlc3BhY2UgYWZ0ZXIgaGVhZGVyIHZhbHVlAE1pc3NpbmcgZXhwZWN0ZWQgQ1IgYWZ0ZXIgaGVhZGVyIHZhbHVlAE1pc3NpbmcgZXhwZWN0ZWQgTEYgYWZ0ZXIgaGVhZGVyIHZhbHVlAEludmFsaWQgYFRyYW5zZmVyLUVuY29kaW5nYCBoZWFkZXIgdmFsdWUATWlzc2luZyBleHBlY3RlZCBDUiBhZnRlciBjaHVuayBleHRlbnNpb24gdmFsdWUASW52YWxpZCBjaGFyYWN0ZXIgaW4gY2h1bmsgZXh0ZW5zaW9ucyBxdW90ZSB2YWx1ZQBJbnZhbGlkIHF1b3RlZC1wYWlyIGluIGNodW5rIGV4dGVuc2lvbnMgcXVvdGVkIHZhbHVlAEludmFsaWQgY2hhcmFjdGVyIGluIGNodW5rIGV4dGVuc2lvbnMgcXVvdGVkIHZhbHVlAFBhdXNlZCBieSBvbl9oZWFkZXJzX2NvbXBsZXRlAEludmFsaWQgRU9GIHN0YXRlAG9uX3Jlc2V0IHBhdXNlAG9uX2NodW5rX2hlYWRlciBwYXVzZQBvbl9tZXNzYWdlX2JlZ2luIHBhdXNlAG9uX2NodW5rX2V4dGVuc2lvbl92YWx1ZSBwYXVzZQBvbl9zdGF0dXNfY29tcGxldGUgcGF1c2UAb25fdmVyc2lvbl9jb21wbGV0ZSBwYXVzZQBvbl91cmxfY29tcGxldGUgcGF1c2UAb25fcHJvdG9jb2xfY29tcGxldGUgcGF1c2UAb25fY2h1bmtfY29tcGxldGUgcGF1c2UAb25faGVhZGVyX3ZhbHVlX2NvbXBsZXRlIHBhdXNlAG9uX21lc3NhZ2VfY29tcGxldGUgcGF1c2UAb25fbWV0aG9kX2NvbXBsZXRlIHBhdXNlAG9uX2hlYWRlcl9maWVsZF9jb21wbGV0ZSBwYXVzZQBvbl9jaHVua19leHRlbnNpb25fbmFtZSBwYXVzZQBVbmV4cGVjdGVkIHNwYWNlIGFmdGVyIHN0YXJ0IGxpbmUATWlzc2luZyBleHBlY3RlZCBDUiBhZnRlciByZXNwb25zZSBsaW5lAFNwYW4gY2FsbGJhY2sgZXJyb3IgaW4gb25fY2h1bmtfZXh0ZW5zaW9uX25hbWUASW52YWxpZCBjaGFyYWN0ZXIgaW4gY2h1bmsgZXh0ZW5zaW9ucyBuYW1lAE1pc3NpbmcgZXhwZWN0ZWQgQ1IgYWZ0ZXIgY2h1bmsgZXh0ZW5zaW9uIG5hbWUASW52YWxpZCBzdGF0dXMgY29kZQBQYXVzZSBvbiBDT05ORUNUL1VwZ3JhZGUAUGF1c2Ugb24gUFJJL1VwZ3JhZGUARXhwZWN0ZWQgSFRUUC8yIENvbm5lY3Rpb24gUHJlZmFjZQBTcGFuIGNhbGxiYWNrIGVycm9yIGluIG9uX21ldGhvZABFeHBlY3RlZCBzcGFjZSBhZnRlciBtZXRob2QAU3BhbiBjYWxsYmFjayBlcnJvciBpbiBvbl9oZWFkZXJfZmllbGQAUGF1c2VkAEludmFsaWQgd29yZCBlbmNvdW50ZXJlZABJbnZhbGlkIG1ldGhvZCBlbmNvdW50ZXJlZABNaXNzaW5nIGV4cGVjdGVkIENSIGFmdGVyIGNodW5rIGRhdGEARXhwZWN0ZWQgTEYgYWZ0ZXIgY2h1bmsgZGF0YQBVbmV4cGVjdGVkIGNoYXIgaW4gdXJsIHNjaGVtYQBSZXF1ZXN0IGhhcyBpbnZhbGlkIGBUcmFuc2Zlci1FbmNvZGluZ2AARGF0YSBhZnRlciBgQ29ubmVjdGlvbjogY2xvc2VgAFNXSVRDSF9QUk9YWQBVU0VfUFJPWFkATUtBQ1RJVklUWQBVTlBST0NFU1NBQkxFX0VOVElUWQBRVUVSWQBDT1BZAE1PVkVEX1BFUk1BTkVOVExZAFRPT19FQVJMWQBOT1RJRlkARkFJTEVEX0RFUEVOREVOQ1kAQkFEX0dBVEVXQVkAUExBWQBQVVQAQ0hFQ0tPVVQAR0FURVdBWV9USU1FT1VUAFJFUVVFU1RfVElNRU9VVABORVRXT1JLX0NPTk5FQ1RfVElNRU9VVABDT05ORUNUSU9OX1RJTUVPVVQATE9HSU5fVElNRU9VVABORVRXT1JLX1JFQURfVElNRU9VVABQT1NUAE1JU0RJUkVDVEVEX1JFUVVFU1QAQ0xJRU5UX0NMT1NFRF9SRVFVRVNUAENMSUVOVF9DTE9TRURfTE9BRF9CQUxBTkNFRF9SRVFVRVNUAEJBRF9SRVFVRVNUAEhUVFBfUkVRVUVTVF9TRU5UX1RPX0hUVFBTX1BPUlQAUkVQT1JUAElNX0FfVEVBUE9UAFJFU0VUX0NPTlRFTlQATk9fQ09OVEVOVABQQVJUSUFMX0NPTlRFTlQASFBFX0lOVkFMSURfQ09OU1RBTlQASFBFX0NCX1JFU0VUAEdFVABIUEVfU1RSSUNUAENPTkZMSUNUAFRFTVBPUkFSWV9SRURJUkVDVABQRVJNQU5FTlRfUkVESVJFQ1QAQ09OTkVDVABNVUxUSV9TVEFUVVMASFBFX0lOVkFMSURfU1RBVFVTAFRPT19NQU5ZX1JFUVVFU1RTAEVBUkxZX0hJTlRTAFVOQVZBSUxBQkxFX0ZPUl9MRUdBTF9SRUFTT05TAE9QVElPTlMAU1dJVENISU5HX1BST1RPQ09MUwBWQVJJQU5UX0FMU09fTkVHT1RJQVRFUwBNVUxUSVBMRV9DSE9JQ0VTAElOVEVSTkFMX1NFUlZFUl9FUlJPUgBXRUJfU0VSVkVSX1VOS05PV05fRVJST1IAUkFJTEdVTl9FUlJPUgBJREVOVElUWV9QUk9WSURFUl9BVVRIRU5USUNBVElPTl9FUlJPUgBTU0xfQ0VSVElGSUNBVEVfRVJST1IASU5WQUxJRF9YX0ZPUldBUkRFRF9GT1IAU0VUX1BBUkFNRVRFUgBHRVRfUEFSQU1FVEVSAEhQRV9VU0VSAFNFRV9PVEhFUgBIUEVfQ0JfQ0hVTktfSEVBREVSAEV4cGVjdGVkIExGIGFmdGVyIENSAE1LQ0FMRU5EQVIAU0VUVVAAV0VCX1NFUlZFUl9JU19ET1dOAFRFQVJET1dOAEhQRV9DTE9TRURfQ09OTkVDVElPTgBIRVVSSVNUSUNfRVhQSVJBVElPTgBESVNDT05ORUNURURfT1BFUkFUSU9OAE5PTl9BVVRIT1JJVEFUSVZFX0lORk9STUFUSU9OAEhQRV9JTlZBTElEX1ZFUlNJT04ASFBFX0NCX01FU1NBR0VfQkVHSU4AU0lURV9JU19GUk9aRU4ASFBFX0lOVkFMSURfSEVBREVSX1RPS0VOAElOVkFMSURfVE9LRU4ARk9SQklEREVOAEVOSEFOQ0VfWU9VUl9DQUxNAEhQRV9JTlZBTElEX1VSTABCTE9DS0VEX0JZX1BBUkVOVEFMX0NPTlRST0wATUtDT0wAQUNMAEhQRV9JTlRFUk5BTABSRVFVRVNUX0hFQURFUl9GSUVMRFNfVE9PX0xBUkdFX1VOT0ZGSUNJQUwASFBFX09LAFVOTElOSwBVTkxPQ0sAUFJJAFJFVFJZX1dJVEgASFBFX0lOVkFMSURfQ09OVEVOVF9MRU5HVEgASFBFX1VORVhQRUNURURfQ09OVEVOVF9MRU5HVEgARkxVU0gAUFJPUFBBVENIAE0tU0VBUkNIAFVSSV9UT09fTE9ORwBQUk9DRVNTSU5HAE1JU0NFTExBTkVPVVNfUEVSU0lTVEVOVF9XQVJOSU5HAE1JU0NFTExBTkVPVVNfV0FSTklORwBIUEVfSU5WQUxJRF9UUkFOU0ZFUl9FTkNPRElORwBFeHBlY3RlZCBDUkxGAEhQRV9JTlZBTElEX0NIVU5LX1NJWkUATU9WRQBDT05USU5VRQBIUEVfQ0JfU1RBVFVTX0NPTVBMRVRFAEhQRV9DQl9IRUFERVJTX0NPTVBMRVRFAEhQRV9DQl9WRVJTSU9OX0NPTVBMRVRFAEhQRV9DQl9VUkxfQ09NUExFVEUASFBFX0NCX1BST1RPQ09MX0NPTVBMRVRFAEhQRV9DQl9DSFVOS19DT01QTEVURQBIUEVfQ0JfSEVBREVSX1ZBTFVFX0NPTVBMRVRFAEhQRV9DQl9DSFVOS19FWFRFTlNJT05fVkFMVUVfQ09NUExFVEUASFBFX0NCX0NIVU5LX0VYVEVOU0lPTl9OQU1FX0NPTVBMRVRFAEhQRV9DQl9NRVNTQUdFX0NPTVBMRVRFAEhQRV9DQl9NRVRIT0RfQ09NUExFVEUASFBFX0NCX0hFQURFUl9GSUVMRF9DT01QTEVURQBERUxFVEUASFBFX0lOVkFMSURfRU9GX1NUQVRFAElOVkFMSURfU1NMX0NFUlRJRklDQVRFAFBBVVNFAE5PX1JFU1BPTlNFAFVOU1VQUE9SVEVEX01FRElBX1RZUEUAR09ORQBOT1RfQUNDRVBUQUJMRQBTRVJWSUNFX1VOQVZBSUxBQkxFAFJBTkdFX05PVF9TQVRJU0ZJQUJMRQBPUklHSU5fSVNfVU5SRUFDSEFCTEUAUkVTUE9OU0VfSVNfU1RBTEUAUFVSR0UATUVSR0UAUkVRVUVTVF9IRUFERVJfRklFTERTX1RPT19MQVJHRQBSRVFVRVNUX0hFQURFUl9UT09fTEFSR0UAUEFZTE9BRF9UT09fTEFSR0UASU5TVUZGSUNJRU5UX1NUT1JBR0UASFBFX1BBVVNFRF9VUEdSQURFAEhQRV9QQVVTRURfSDJfVVBHUkFERQBTT1VSQ0UAQU5OT1VOQ0UAVFJBQ0UASFBFX1VORVhQRUNURURfU1BBQ0UAREVTQ1JJQkUAVU5TVUJTQ1JJQkUAUkVDT1JEAEhQRV9JTlZBTElEX01FVEhPRABOT1RfRk9VTkQAUFJPUEZJTkQAVU5CSU5EAFJFQklORABVTkFVVEhPUklaRUQATUVUSE9EX05PVF9BTExPV0VEAEhUVFBfVkVSU0lPTl9OT1RfU1VQUE9SVEVEAEFMUkVBRFlfUkVQT1JURUQAQUNDRVBURUQATk9UX0lNUExFTUVOVEVEAExPT1BfREVURUNURUQASFBFX0NSX0VYUEVDVEVEAEhQRV9MRl9FWFBFQ1RFRABDUkVBVEVEAElNX1VTRUQASFBFX1BBVVNFRABUSU1FT1VUX09DQ1VSRUQAUEFZTUVOVF9SRVFVSVJFRABQUkVDT05ESVRJT05fUkVRVUlSRUQAUFJPWFlfQVVUSEVOVElDQVRJT05fUkVRVUlSRUQATkVUV09SS19BVVRIRU5USUNBVElPTl9SRVFVSVJFRABMRU5HVEhfUkVRVUlSRUQAU1NMX0NFUlRJRklDQVRFX1JFUVVJUkVEAFVQR1JBREVfUkVRVUlSRUQAUEFHRV9FWFBJUkVEAFBSRUNPTkRJVElPTl9GQUlMRUQARVhQRUNUQVRJT05fRkFJTEVEAFJFVkFMSURBVElPTl9GQUlMRUQAU1NMX0hBTkRTSEFLRV9GQUlMRUQATE9DS0VEAFRSQU5TRk9STUFUSU9OX0FQUExJRUQATk9UX01PRElGSUVEAE5PVF9FWFRFTkRFRABCQU5EV0lEVEhfTElNSVRfRVhDRUVERUQAU0lURV9JU19PVkVSTE9BREVEAEhFQUQARXhwZWN0ZWQgSFRUUC8sIFJUU1AvIG9yIElDRS8A5xUAAK8VAACkEgAAkhoAACYWAACeFAAA2xkAAHkVAAB+EgAA/hQAADYVAAALFgAA2BYAAPMSAABCGAAArBYAABIVAAAUFwAA7xcAAEgUAABxFwAAshoAAGsZAAB+GQAANRQAAIIaAABEFwAA/RYAAB4YAACHFwAAqhkAAJMSAAAHGAAALBcAAMoXAACkFwAA5xUAAOcVAABYFwAAOxgAAKASAAAtHAAAwxEAAEgRAADeEgAAQhMAAKQZAAD9EAAA9xUAAKUVAADvFgAA+BkAAEoWAABWFgAA9RUAAAoaAAAIGgAAARoAAKsVAABCEgAA1xAAAEwRAAAFGQAAVBYAAB4RAADKGQAAyBkAAE4WAAD/GAAAcRQAAPAVAADuFQAAlBkAAPwVAAC/GQAAmxkAAHwUAABDEQAAcBgAAJUUAAAnFAAAGRQAANUSAADUGQAARBYAAPcQAEG5OwsBAQBB0DsL4AEBAQIBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQBBuj0LBAEAAAIAQdE9C14DBAMDAwMDAAADAwADAwADAwMDAwMDAwMDAAUAAAAAAAMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAAAAAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMAAwADAEG6PwsEAQAAAgBB0T8LXgMAAwMDAwMAAAMDAAMDAAMDAwMDAwMDAwMABAAFAAAAAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMAAAADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwADAAMAQbDBAAsNbG9zZWVlcC1hbGl2ZQBBycEACwEBAEHgwQAL4AEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQBBycMACwEBAEHgwwAL5wEBAQEBAQEBAQEBAQECAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAWNodW5rZWQAQfHFAAteAQABAQEBAQAAAQEAAQEAAQEBAQEBAQEBAQAAAAAAAAABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQAAAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAEAAQBB0McACyFlY3Rpb25lbnQtbGVuZ3Rob25yb3h5LWNvbm5lY3Rpb24AQYDIAAsgcmFuc2Zlci1lbmNvZGluZ3BncmFkZQ0KDQpTTQ0KDQoAQanIAAsFAQIAAQMAQcDIAAtfBAUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUAQanKAAsFAQIAAQMAQcDKAAtfBAUFBgUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUAQanMAAsEAQAAAQBBwcwAC14CAgACAgICAgICAgICAgICAgICAgICAgICAgICAgIAAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAEGpzgALBQECAAEDAEHAzgALXwQFAAAFBQUFBQUFBQUFBQYFBQUFBQUFBQUFBQUABQAHCAUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQAFAAUABQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUAAAAFAEGp0AALBQEBAAEBAEHA0AALAQEAQdrQAAtBAgAAAAAAAAMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAAAAAAAAAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMAQanSAAsFAQEAAQEAQcDSAAsBAQBBytIACwYCAAAAAAIAQeHSAAs6AwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMAAAAAAAADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwBBoNQAC50BTk9VTkNFRUNLT1VUTkVDVEVURUNSSUJFTFVTSEVURUFEU0VBUkNIUkdFQ1RJVklUWUxFTkRBUlZFT1RJRllQVElPTlNDSFNFQVlTVEFUQ0hHRVVFUllPUkRJUkVDVE9SVFJDSFBBUkFNRVRFUlVSQ0VCU0NSSUJFQVJET1dOQUNFSU5ETktDS1VCU0NSSUJFVFRQQ0VUU1BBRFRQLw==";
	let wasmBuffer;
	Object.defineProperty(module, "exports", { get: () => {
		return wasmBuffer ? wasmBuffer : wasmBuffer = Buffer$4.from(wasmBase64, "base64");
	} });
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/llhttp/llhttp_simd-wasm.js
var require_llhttp_simd_wasm = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { Buffer: Buffer$3 } = __require("node:buffer");
	const wasmBase64 = "AGFzbQEAAAABJwdgAX8Bf2ADf39/AX9gAn9/AGABfwBgBH9/f38Bf2AAAGADf39/AALLAQgDZW52GHdhc21fb25faGVhZGVyc19jb21wbGV0ZQAEA2VudhV3YXNtX29uX21lc3NhZ2VfYmVnaW4AAANlbnYLd2FzbV9vbl91cmwAAQNlbnYOd2FzbV9vbl9zdGF0dXMAAQNlbnYUd2FzbV9vbl9oZWFkZXJfZmllbGQAAQNlbnYUd2FzbV9vbl9oZWFkZXJfdmFsdWUAAQNlbnYMd2FzbV9vbl9ib2R5AAEDZW52GHdhc21fb25fbWVzc2FnZV9jb21wbGV0ZQAAAzU0BQYAAAMAAAAAAAADAQMAAwMDAAACAAAAAAICAgICAgICAgIBAQEBAQEBAQEBAwAAAwAAAAQFAXABExMFAwEAAgYIAX8BQcDZBAsHxQcoBm1lbW9yeQIAC19pbml0aWFsaXplAAgZX19pbmRpcmVjdF9mdW5jdGlvbl90YWJsZQEAC2xsaHR0cF9pbml0AAkYbGxodHRwX3Nob3VsZF9rZWVwX2FsaXZlADcMbGxodHRwX2FsbG9jAAsGbWFsbG9jADkLbGxodHRwX2ZyZWUADARmcmVlAAwPbGxodHRwX2dldF90eXBlAA0VbGxodHRwX2dldF9odHRwX21ham9yAA4VbGxodHRwX2dldF9odHRwX21pbm9yAA8RbGxodHRwX2dldF9tZXRob2QAEBZsbGh0dHBfZ2V0X3N0YXR1c19jb2RlABESbGxodHRwX2dldF91cGdyYWRlABIMbGxodHRwX3Jlc2V0ABMObGxodHRwX2V4ZWN1dGUAFBRsbGh0dHBfc2V0dGluZ3NfaW5pdAAVDWxsaHR0cF9maW5pc2gAFgxsbGh0dHBfcGF1c2UAFw1sbGh0dHBfcmVzdW1lABgbbGxodHRwX3Jlc3VtZV9hZnRlcl91cGdyYWRlABkQbGxodHRwX2dldF9lcnJubwAaF2xsaHR0cF9nZXRfZXJyb3JfcmVhc29uABsXbGxodHRwX3NldF9lcnJvcl9yZWFzb24AHBRsbGh0dHBfZ2V0X2Vycm9yX3BvcwAdEWxsaHR0cF9lcnJub19uYW1lAB4SbGxodHRwX21ldGhvZF9uYW1lAB8SbGxodHRwX3N0YXR1c19uYW1lACAabGxodHRw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AXRrQT5qIQILIAEgAjYCHCABQgA3AhAgAkECdEH01wBqIQACQEHI1QAoAgAiA0EBIAJ0IgdxRQRAIAAgATYCAEHI1QAgAyAHcjYCACABIAA2AhggASABNgIIIAEgATYCDAwBCyAEQRkgAkEBdmtBACACQR9HG3QhAiAAKAIAIQACQANAIAAiAygCBEF4cSAERg0BIAJBHXYhACACQQF0IQIgAyAAQQRxakEQaiIHKAIAIgANAAsgByABNgIAIAEgAzYCGCABIAE2AgwgASABNgIIDAELIAMoAggiACABNgIMIAMgATYCCCABQQA2AhggASADNgIMIAEgADYCCAtB5NUAQeTVACgCAEEBayIAQX8gABs2AgALCwcAIAAtACgLBwAgAC0AKgsHACAALQArCwcAIAAtACkLBwAgAC8BNAsHACAALQAwC0ABBH8gACgCGCEBIAAvAS4hAiAALQAoIQMgACgCOCEEIAAQOCAAIAQ2AjggACADOgAoIAAgAjsBLiAAIAE2AhgLhocCAwd/A34BeyABIAJqIQQCQCAAIgMoAgwiAA0AIAMoAgQEQCADIAE2AgQLIwBBEGsiCSQAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACfwJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkAC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DAgLQeMBDAcLQdcBDAYLQdgBDAULQdkBDAQLQdoBDAMLQdsBDAILQd0BDAELQdwBCyECA0ACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAIAMCfwJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACfwJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACfwJAAkACQAJAAkACQAJAAn8CQAJAAkACfwJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkAgAwJ/AkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJ/AkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQCACDuMBAAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISMkJScoKZ4DmwOaA5EDigODA4AD/QL7AvgC8gLxAu8C7QLoAucC5gLlAuQC3ALbAtoC2QLYAtcC1gLVAs8CzgLMAssCygLJAsgCxwLGAsQCwwK+ArwCugK5ArgCtwK2ArUCtAKzArICsQKwAq4CrQKpAqgCpwKmAqUCpAKjAqICoQKgAp8CmAKQAowCiwKKAoEC/gH9AfwB+wH6AfkB+AH3AfUB8wHwAesB6QHoAecB5gHlAeQB4wHiAeEB4AHfAd4B3QHcAdoB2QHYAdcB1gHVAdQB0wHSAdEB0AHPAc4BzQHMAcsBygHJAcgBxwHGAcUBxAHDAcIBwQHAAb8BvgG9AbwBuwG6AbkBuAG3AbYBtQG0AbMBsgGxAbABrwGuAa0BrAGrAaoBqQGoAacBpgGlAaQBowGiAZ8BngGZAZgBlwGWAZUBlAGTAZIBkQGQAY8BjQGMAYcBhgGFAYQBgwGCAX18e3p5dnV0UFFSU1RVCyABIARHDXJB/QEhAgy+AwsgASAERw2YAUHbASECDL0DCyABIARHDfEBQY4BIQIMvAMLIAEgBEcN/AFBhAEhAgy7AwsgASAERw2KAkH/ACECDLoDCyABIARHDZECQf0AIQIMuQMLIAEgBEcNlAJB+wAhAgy4AwsgASAERw0eQR4hAgy3AwsgASAERw0ZQRghAgy2AwsgASAERw3KAkHNACECDLUDCyABIARHDdUCQcYAIQIMtAMLIAEgBEcN1gJBwwAhAgyzAwsgASAERw3cAkE4IQIMsgMLIAMtADBBAUYNrQMMiQMLQQAhAAJAAkACQCADLQAqRQ0AIAMtACtFDQAgAy8BMiICQQJxRQ0BDAILIAMvATIiAkEBcUUNAQtBASEAIAMtAChBAUYNACADLwE0IgZB5ABrQeQASQ0AIAZBzAFGDQAgBkGwAkYNACACQcAAcQ0AQQAhACACQYgEcUGABEYNACACQShxQQBHIQALIANBADsBMiADQQA6ADECQCAARQRAIANBADoAMSADLQAuQQRxDQEMsQMLIANCADcDIAsgA0EAOgAxIANBAToANgxIC0EAIQACQCADKAI4IgJFDQAgAigCMCICRQ0AIAMgAhEAACEACyAARQ1IIABBFUcNYiADQQQ2AhwgAyABNgIUIANB0hs2AhAgA0EVNgIMQQAhAgyvAwsgASAERgRAQQYhAgyvAwsgAS0AAEEKRw0ZIAFBAWohAQwaCyADQgA3AyBBEiECDJQDCyABIARHDYoDQSMhAgysAwsgASAERgRAQQchAgysAwsCQAJAIAEtAABBCmsOBAEYGAAYCyABQQFqIQFBECECDJMDCyABQQFqIQEgA0Evai0AAEEBcQ0XQQAhAiADQQA2AhwgAyABNgIUIANBmSA2AhAgA0EZNgIMDKsDCyADIAMpAyAiDCAEIAFrrSIKfSILQgAgCyAMWBs3AyAgCiAMWg0YQQghAgyqAwsgASAERwRAIANBCTYCCCADIAE2AgRBFCECDJEDC0EJIQIMqQMLIAMpAyBQDa4CDEMLIAEgBEYEQEELIQIMqAMLIAEtAABBCkcNFiABQQFqIQEMFwsgA0Evai0AAEEBcUUNGQwmC0EAIQACQCADKAI4IgJFDQAgAigCUCICRQ0AIAMgAhEAACEACyAADRkMQgtBACEAAkAgAygCOCICRQ0AIAIoAlAiAkUNACADIAIRAAAhAAsgAA0aDCQLQQAhAAJAIAMoAjgiAkUNACACKAJQIgJFDQAgAyACEQAAIQALIAANGwwyCyADQS9qLQAAQQFxRQ0cDCILQQAhAAJAIAMoAjgiAkUNACACKAJUIgJFDQAgAyACEQAAIQALIAANHAxCC0EAIQACQCADKAI4IgJFDQAgAigCVCICRQ0AIAMgAhEAACEACyAADR0MIAsgASAERgRAQRMhAgygAwsCQCABLQAAIgBBCmsOBB8jIwAiCyABQQFqIQEMHwtBACEAAkAgAygCOCICRQ0AIAIoAlQiAkUNACADIAIRAAAhAAsgAA0iDEILIAEgBEYEQEEWIQIMngMLIAEtAABBwMEAai0AAEEBRw0jDIMDCwJAA0AgAS0AAEGwO2otAAAiAEEBRwRAAkAgAEECaw4CAwAnCyABQQFqIQFBISECDIYDCyAEIAFBAWoiAUcNAAtBGCECDJ0DCyADKAIEIQBBACECIANBADYCBCADIAAgAUEBaiIBEDQiAA0hDEELQQAhAAJAIAMoAjgiAkUNACACKAJUIgJFDQAgAyACEQAAIQALIAANIwwqCyABIARGBEBBHCECDJsDCyADQQo2AgggAyABNgIEQQAhAAJAIAMoAjgiAkUNACACKAJQIgJFDQAgAyACEQAAIQALIAANJUEkIQIMgQMLIAEgBEcEQANAIAEtAABBsD1qLQAAIgBBA0cEQCAAQQFrDgUYGiaCAyUmCyAEIAFBAWoiAUcNAAtBGyECDJoDC0EbIQIMmQMLA0AgAS0AAEGwP2otAAAiAEEDRwRAIABBAWsOBQ8RJxMmJwsgBCABQQFqIgFHDQALQR4hAgyYAwsgASAERwRAIANBCzYCCCADIAE2AgRBByECDP8CC0EfIQIMlwMLIAEgBEYEQEEgIQIMlwMLAkAgAS0AAEENaw4ULj8/Pz8/Pz8/Pz8/Pz8/Pz8/PwA/C0EAIQIgA0EANgIcIANBvws2AhAgA0ECNgIMIAMgAUEBajYCFAyWAwsgA0EvaiECA0AgASAERgRAQSEhAgyXAwsCQAJAAkAgAS0AACIAQQlrDhgCACkpASkpKSkpKSkpKSkpKSkpKSkpKQInCyABQQFqIQEgA0Evai0AAEEBcUUNCgwYCyABQQFqIQEMFwsgAUEBaiEBIAItAABBAnENAAtBACECIANBADYCHCADIAE2AhQgA0GfFTYCECADQQw2AgwMlQMLIAMtAC5BgAFxRQ0BC0EAIQACQCADKAI4IgJFDQAgAigCXCICRQ0AIAMgAhEAACEACyAARQ3mAiAAQRVGBEAgA0EkNgIcIAMgATYCFCADQZsbNgIQIANBFTYCDEEAIQIMlAMLQQAhAiADQQA2AhwgAyABNgIUIANBkA42AhAgA0EUNgIMDJMDC0EAIQIgA0EANgIcIAMgATYCFCADQb4gNgIQIANBAjYCDAySAwsgAygCBCEAQQAhAiADQQA2AgQgAyAAIAEgDKdqIgEQMiIARQ0rIANBBzYCHCADIAE2AhQgAyAANgIMDJEDCyADLQAuQcAAcUUNAQtBACEAAkAgAygCOCICRQ0AIAIoAlgiAkUNACADIAIRAAAhAAsgAEUNKyAAQRVGBEAgA0EKNgIcIAMgATYCFCADQesZNgIQIANBFTYCDEEAIQIMkAMLQQAhAiADQQA2AhwgAyABNgIUIANBkww2AhAgA0ETNgIMDI8DC0EAIQIgA0EANgIcIAMgATYCFCADQYIVNgIQIANBAjYCDAyOAwtBACECIANBADYCHCADIAE2AhQgA0HdFDYCECADQRk2AgwMjQMLQQAhAiADQQA2AhwgAyABNgIUIANB5h02AhAgA0EZNgIMDIwDCyAAQRVGDT1BACECIANBADYCHCADIAE2AhQgA0HQDzYCECADQSI2AgwMiwMLIAMoAgQhAEEAIQIgA0EANgIEIAMgACABEDMiAEUNKCADQQ02AhwgAyABNgIUIAMgADYCDAyKAwsgAEEVRg06QQAhAiADQQA2AhwgAyABNgIUIANB0A82AhAgA0EiNgIMDIkDCyADKAIEIQBBACECIANBADYCBCADIAAgARAzIgBFBEAgAUEBaiEBDCgLIANBDjYCHCADIAA2AgwgAyABQQFqNgIUDIgDCyAAQRVGDTdBACECIANBADYCHCADIAE2AhQgA0HQDzYCECADQSI2AgwMhwMLIAMoAgQhAEEAIQIgA0EANgIEIAMgACABEDMiAEUEQCABQQFqIQEMJwsgA0EPNgIcIAMgADYCDCADIAFBAWo2AhQMhgMLQQAhAiADQQA2AhwgAyABNgIUIANB4hc2AhAgA0EZNgIMDIUDCyAAQRVGDTNBACECIANBADYCHCADIAE2AhQgA0HWDDYCECADQSM2AgwMhAMLIAMoAgQhAEEAIQIgA0EANgIEIAMgACABEDQiAEUNJSADQRE2AhwgAyABNgIUIAMgADYCDAyDAwsgAEEVRg0wQQAhAiADQQA2AhwgAyABNgIUIANB1gw2AhAgA0EjNgIMDIIDCyADKAIEIQBBACECIANBADYCBCADIAAgARA0IgBFBEAgAUEBaiEBDCULIANBEjYCHCADIAA2AgwgAyABQQFqNgIUDIEDCyADQS9qLQAAQQFxRQ0BC0EXIQIM5gILQQAhAiADQQA2AhwgAyABNgIUIANB4hc2AhAgA0EZNgIMDP4CCyAAQTtHDQAgAUEBaiEBDAwLQQAhAiADQQA2AhwgAyABNgIUIANBkhg2AhAgA0ECNgIMDPwCCyAAQRVGDShBACECIANBADYCHCADIAE2AhQgA0HWDDYCECADQSM2AgwM+wILIANBFDYCHCADIAE2AhQgAyAANgIMDPoCCyADKAIEIQBBACECIANBADYCBCADIAAgARA0IgBFBEAgAUEBaiEBDPUCCyADQRU2AhwgAyAANgIMIAMgAUEBajYCFAz5AgsgAygCBCEAQQAhAiADQQA2AgQgAyAAIAEQNCIARQRAIAFBAWohAQzzAgsgA0EXNgIcIAMgADYCDCADIAFBAWo2AhQM+AILIABBFUYNI0EAIQIgA0EANgIcIAMgATYCFCADQdYMNgIQIANBIzYCDAz3AgsgAygCBCEAQQAhAiADQQA2AgQgAyAAIAEQNCIARQRAIAFBAWohAQwdCyADQRk2AhwgAyAANgIMIAMgAUEBajYCFAz2AgsgAygCBCEAQQAhAiADQQA2AgQgAyAAIAEQNCIARQRAIAFBAWohAQzvAgsgA0EaNgIcIAMgADYCDCADIAFBAWo2AhQM9QILIABBFUYNH0EAIQIgA0EANgIcIAMgATYCFCADQdAPNgIQIANBIjYCDAz0AgsgAygCBCEAIANBADYCBCADIAAgARAzIgBFBEAgAUEBaiEBDBsLIANBHDYCHCADIAA2AgwgAyABQQFqNgIUQQAhAgzzAgsgAygCBCEAIANBADYCBCADIAAgARAzIgBFBEAgAUEBaiEBDOsCCyADQR02AhwgAyAANgIMIAMgAUEBajYCFEEAIQIM8gILIABBO0cNASABQQFqIQELQSYhAgzXAgtBACECIANBADYCHCADIAE2AhQgA0GfFTYCECADQQw2AgwM7wILIAEgBEcEQANAIAEtAABBIEcNhAIgBCABQQFqIgFHDQALQSwhAgzvAgtBLCECDO4CCyABIARGBEBBNCECDO4CCwJAAkADQAJAIAEtAABBCmsOBAIAAAMACyAEIAFBAWoiAUcNAAtBNCECDO8CCyADKAIEIQAgA0EANgIEIAMgACABEDEiAEUNnwIgA0EyNgIcIAMgATYCFCADIAA2AgxBACECDO4CCyADKAIEIQAgA0EANgIEIAMgACABEDEiAEUEQCABQQFqIQEMnwILIANBMjYCHCADIAA2AgwgAyABQQFqNgIUQQAhAgztAgsgASAERwRAAkADQCABLQAAQTBrIgBB/wFxQQpPBEBBOiECDNcCCyADKQMgIgtCmbPmzJmz5swZVg0BIAMgC0IKfiIKNwMgIAogAK1C/wGDIgtCf4VWDQEgAyAKIAt8NwMgIAQgAUEBaiIBRw0AC0HAACECDO4CCyADKAIEIQAgA0EANgIEIAMgACABQQFqIgEQMSIADRcM4gILQcAAIQIM7AILIAEgBEYEQEHJACECDOwCCwJAA0ACQCABLQAAQQlrDhgAAqICogKpAqICogKiAqICogKiAqICogKiAqICogKiAqICogKiAqICogKiAgCiAgsgBCABQQFqIgFHDQALQckAIQIM7AILIAFBAWohASADQS9qLQAAQQFxDaUCIANBADYCHCADIAE2AhQgA0GXEDYCECADQQo2AgxBACECDOsCCyABIARHBEADQCABLQAAQSBHDRUgBCABQQFqIgFHDQALQfgAIQIM6wILQfgAIQIM6gILIANBAjoAKAw4C0EAIQIgA0EANgIcIANBvws2AhAgA0ECNgIMIAMgAUEBajYCFAzoAgtBACECDM4CC0ENIQIMzQILQRMhAgzMAgtBFSECDMsCC0EWIQIMygILQRghAgzJAgtBGSECDMgCC0EaIQIMxwILQRshAgzGAgtBHCECDMUCC0EdIQIMxAILQR4hAgzDAgtBHyECDMICC0EgIQIMwQILQSIhAgzAAgtBIyECDL8CC0ElIQIMvgILQeUAIQIMvQILIANBPTYCHCADIAE2AhQgAyAANgIMQQAhAgzVAgsgA0EbNgIcIAMgATYCFCADQaQcNgIQIANBFTYCDEEAIQIM1AILIANBIDYCHCADIAE2AhQgA0GYGjYCECADQRU2AgxBACECDNMCCyADQRM2AhwgAyABNgIUIANBmBo2AhAgA0EVNgIMQQAhAgzSAgsgA0ELNgIcIAMgATYCFCADQZgaNgIQIANBFTYCDEEAIQIM0QILIANBEDYCHCADIAE2AhQgA0GYGjYCECADQRU2AgxBACECDNACCyADQSA2AhwgAyABNgIUIANBpBw2AhAgA0EVNgIMQQAhAgzPAgsgA0ELNgIcIAMgATYCFCADQaQcNgIQIANBFTYCDEEAIQIMzgILIANBDDYCHCADIAE2AhQgA0GkHDYCECADQRU2AgxBACECDM0CC0EAIQIgA0EANgIcIAMgATYCFCADQd0ONgIQIANBEjYCDAzMAgsCQANAAkAgAS0AAEEKaw4EAAICAAILIAQgAUEBaiIBRw0AC0H9ASECDMwCCwJAAkAgAy0ANkEBRw0AQQAhAAJAIAMoAjgiAkUNACACKAJgIgJFDQAgAyACEQAAIQALIABFDQAgAEEVRw0BIANB/AE2AhwgAyABNgIUIANB3Bk2AhAgA0EVNgIMQQAhAgzNAgtB3AEhAgyzAgsgA0EANgIcIAMgATYCFCADQfkLNgIQIANBHzYCDEEAIQIMywILAkACQCADLQAoQQFrDgIEAQALQdsBIQIMsgILQdQBIQIMsQILIANBAjoAMUEAIQACQCADKAI4IgJFDQAgAigCACICRQ0AIAMgAhEAACEACyAARQRAQd0BIQIMsQILIABBFUcEQCADQQA2AhwgAyABNgIUIANBtAw2AhAgA0EQNgIMQQAhAgzKAgsgA0H7ATYCHCADIAE2AhQgA0GBGjYCECADQRU2AgxBACECDMkCCyABIARGBEBB+gEhAgzJAgsgAS0AAEHIAEYNASADQQE6ACgLQcABIQIMrgILQdoBIQIMrQILIAEgBEcEQCADQQw2AgggAyABNgIEQdkBIQIMrQILQfkBIQIMxQILIAEgBEYEQEH4ASECDMUCCyABLQAAQcgARw0EIAFBAWohAUHYASECDKsCCyABIARGBEBB9wEhAgzEAgsCQAJAIAEtAABBxQBrDhAABQUFBQUFBQUFBQUFBQUBBQsgAUEBaiEBQdYBIQIMqwILIAFBAWohAUHXASECDKoCC0H2ASECIAEgBEYNwgIgAygCACIAIAQgAWtqIQUgASAAa0ECaiEGAkADQCABLQAAIABButUAai0AAEcNAyAAQQJGDQEgAEEBaiEAIAQgAUEBaiIBRw0ACyADIAU2AgAMwwILIAMoAgQhACADQgA3AwAgAyAAIAZBAWoiARAuIgBFBEBB4wEhAgyqAgsgA0H1ATYCHCADIAE2AhQgAyAANgIMQQAhAgzCAgtB9AEhAiABIARGDcECIAMoAgAiACAEIAFraiEFIAEgAGtBAWohBgJAA0AgAS0AACAAQbjVAGotAABHDQIgAEEBRg0BIABBAWohACAEIAFBAWoiAUcNAAsgAyAFNgIADMICCyADQYEEOwEoIAMoAgQhACADQgA3AwAgAyAAIAZBAWoiARAuIgANAwwCCyADQQA2AgALQQAhAiADQQA2AhwgAyABNgIUIANB5R82AhAgA0EINgIMDL8CC0HVASECDKUCCyADQfMBNgIcIAMgATYCFCADIAA2AgxBACECDL0CC0EAIQACQCADKAI4IgJFDQAgAigCQCICRQ0AIAMgAhEAACEACyAARQ1uIABBFUcEQCADQQA2AhwgAyABNgIUIANBgg82AhAgA0EgNgIMQQAhAgy9AgsgA0GPATYCHCADIAE2AhQgA0HsGzYCECADQRU2AgxBACECDLwCCyABIARHBEAgA0ENNgIIIAMgATYCBEHTASECDKMCC0HyASECDLsCCyABIARGBEBB8QEhAgy7AgsCQAJAAkAgAS0AAEHIAGsOCwABCAgICAgICAgCCAsgAUEBaiEBQdABIQIMowILIAFBAWohAUHRASECDKICCyABQQFqIQFB0gEhAgyhAgtB8AEhAiABIARGDbkCIAMoAgAiACAEIAFraiEGIAEgAGtBAmohBQNAIAEtAAAgAEG11QBqLQAARw0EIABBAkYNAyAAQQFqIQAgBCABQQFqIgFHDQALIAMgBjYCAAy5AgtB7wEhAiABIARGDbgCIAMoAgAiACAEIAFraiEGIAEgAGtBAWohBQNAIAEtAAAgAEGz1QBqLQAARw0DIABBAUYNAiAAQQFqIQAgBCABQQFqIgFHDQALIAMgBjYCAAy4AgtB7gEhAiABIARGDbcCIAMoAgAiACAEIAFraiEGIAEgAGtBAmohBQNAIAEtAAAgAEGw1QBqLQAARw0CIABBAkYNASAAQQFqIQAgBCABQQFqIgFHDQALIAMgBjYCAAy3AgsgAygCBCEAIANCADcDACADIAAgBUEBaiIBECsiAEUNAiADQewBNgIcIAMgATYCFCADIAA2AgxBACECDLYCCyADQQA2AgALIAMoAgQhACADQQA2AgQgAyAAIAEQKyIARQ2cAiADQe0BNgIcIAMgATYCFCADIAA2AgxBACECDLQCC0HPASECDJoCC0EAIQACQCADKAI4IgJFDQAgAigCNCICRQ0AIAMgAhEAACEACwJAIAAEQCAAQRVGDQEgA0EANgIcIAMgATYCFCADQeoNNgIQIANBJjYCDEEAIQIMtAILQc4BIQIMmgILIANB6wE2AhwgAyABNgIUIANBgBs2AhAgA0EVNgIMQQAhAgyyAgsgASAERgRAQesBIQIMsgILIAEtAABBL0YEQCABQQFqIQEMAQsgA0EANgIcIAMgATYCFCADQbI4NgIQIANBCDYCDEEAIQIMsQILQc0BIQIMlwILIAEgBEcEQCADQQ42AgggAyABNgIEQcwBIQIMlwILQeoBIQIMrwILIAEgBEYEQEHpASECDK8CCyABLQAAQTBrIgBB/wFxQQpJBEAgAyAAOgAqIAFBAWohAUHLASECDJYCCyADKAIEIQAgA0EANgIEIAMgACABEC8iAEUNlwIgA0HoATYCHCADIAE2AhQgAyAANgIMQQAhAgyuAgsgASAERgRAQecBIQIMrgILAkAgAS0AAEEuRgRAIAFBAWohAQwBCyADKAIEIQAgA0EANgIEIAMgACABEC8iAEUNmAIgA0HmATYCHCADIAE2AhQgAyAANgIMQQAhAgyuAgtBygEhAgyUAgsgASAERgRAQeUBIQIMrQILQQAhAEEBIQVBASEHQQAhAgJAAkACQAJAAkACfwJAAkACQAJAAkACQAJAIAEtAABBMGsOCgoJAAECAwQFBggLC0ECDAYLQQMMBQtBBAwEC0EFDAMLQQYMAgtBBwwBC0EICyECQQAhBUEAIQcMAgtBCSECQQEhAEEAIQVBACEHDAELQQAhBUEBIQILIAMgAjoAKyABQQFqIQECQAJAIAMtAC5BEHENAAJAAkACQCADLQAqDgMBAAIECyAHRQ0DDAILIAANAQwCCyAFRQ0BCyADKAIEIQAgA0EANgIEIAMgACABEC8iAEUNAiADQeIBNgIcIAMgATYCFCADIAA2AgxBACECDK8CCyADKAIEIQAgA0EANgIEIAMgACABEC8iAEUNmgIgA0HjATYCHCADIAE2AhQgAyAANgIMQQAhAgyuAgsgAygCBCEAIANBADYCBCADIAAgARAvIgBFDZgCIANB5AE2AhwgAyABNgIUIAMgADYCDAytAgtByQEhAgyTAgtBACEAAkAgAygCOCICRQ0AIAIoAkQiAkUNACADIAIRAAAhAAsCQCAABEAgAEEVRg0BIANBADYCHCADIAE2AhQgA0GkDTYCECADQSE2AgxBACECDK0CC0HIASECDJMCCyADQeEBNgIcIAMgATYCFCADQdAaNgIQIANBFTYCDEEAIQIMqwILIAEgBEYEQEHhASECDKsCCwJAIAEtAABBIEYEQCADQQA7ATQgAUEBaiEBDAELIANBADYCHCADIAE2AhQgA0GZETYCECADQQk2AgxBACECDKsCC0HHASECDJECCyABIARGBEBB4AEhAgyqAgsCQCABLQAAQTBrQf8BcSICQQpJBEAgAUEBaiEBAkAgAy8BNCIAQZkzSw0AIAMgAEEKbCIAOwE0IABB/v8DcSACQf//A3NLDQAgAyAAIAJqOwE0DAILQQAhAiADQQA2AhwgAyABNgIUIANBlR42AhAgA0ENNgIMDKsCCyADQQA2AhwgAyABNgIUIANBlR42AhAgA0ENNgIMQQAhAgyqAgtBxgEhAgyQAgsgASAERgRAQd8BIQIMqQILAkAgAS0AAEEwa0H/AXEiAkEKSQRAIAFBAWohAQJAIAMvATQiAEGZM0sNACADIABBCmwiADsBNCAAQf7/A3EgAkH//wNzSw0AIAMgACACajsBNAwCC0EAIQIgA0EANgIcIAMgATYCFCADQZUeNgIQIANBDTYCDAyqAgsgA0EANgIcIAMgATYCFCADQZUeNgIQIANBDTYCDEEAIQIMqQILQcUBIQIMjwILIAEgBEYEQEHeASECDKgCCwJAIAEtAABBMGtB/wFxIgJBCkkEQCABQQFqIQECQCADLwE0IgBBmTNLDQAgAyAAQQpsIgA7ATQgAEH+/wNxIAJB//8Dc0sNACADIAAgAmo7ATQMAgtBACECIANBADYCHCADIAE2AhQgA0GVHjYCECADQQ02AgwMqQILIANBADYCHCADIAE2AhQgA0GVHjYCECADQQ02AgxBACECDKgCC0HEASECDI4CCyABIARGBEBB3QEhAgynAgsCQAJAAkACQCABLQAAQQprDhcCAwMAAwMDAwMDAwMDAwMDAwMDAwMDAQMLIAFBAWoMBQsgAUEBaiEBQcMBIQIMjwILIAFBAWohASADQS9qLQAAQQFxDQggA0EANgIcIAMgATYCFCADQY0LNgIQIANBDTYCDEEAIQIMpwILIANBADYCHCADIAE2AhQgA0GNCzYCECADQQ02AgxBACECDKYCCyABIARHBEAgA0EPNgIIIAMgATYCBEEBIQIMjQILQdwBIQIMpQILAkACQANAAkAgAS0AAEEKaw4EAgAAAwALIAQgAUEBaiIBRw0AC0HbASECDKYCCyADKAIEIQAgA0EANgIEIAMgACABEC0iAEUEQCABQQFqIQEMBAsgA0HaATYCHCADIAA2AgwgAyABQQFqNgIUQQAhAgylAgsgAygCBCEAIANBADYCBCADIAAgARAtIgANASABQQFqCyEBQcEBIQIMigILIANB2QE2AhwgAyAANgIMIAMgAUEBajYCFEEAIQIMogILQcIBIQIMiAILIANBL2otAABBAXENASADQQA2AhwgAyABNgIUIANB5Bw2AhAgA0EZNgIMQQAhAgygAgsgASAERgRAQdkB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CyADIAU2AgAMkAILIANBADYCACAGQQFqIQFBGgw8C0HKASECIAEgBEYNjgIgAygCACIAIAQgAWtqIQUgASAAa0EDaiEGAkADQCABLQAAIABBjdUAai0AAEcNOyAAQQNGDQEgAEEBaiEAIAQgAUEBaiIBRw0ACyADIAU2AgAMjwILIANBADYCACAGQQFqIQFBIQw7CyABIARGBEBByQEhAgyOAgsCQAJAIAEtAABBwQBrDhQAPT09PT09PT09PT09PT09PT09AT0LIAFBAWohAUGtASECDPUBCyABQQFqIQFBsAEhAgz0AQsgASAERgRAQcgBIQIMjQILAkACQCABLQAAQdUAaw4LADw8PDw8PDw8PAE8CyABQQFqIQFBrgEhAgz0AQsgAUEBaiEBQa8BIQIM8wELQccBIQIgASAERg2LAiADKAIAIgAgBCABa2ohBSABIABrQQhqIQYCQANAIAEtAAAgAEGE1QBqLQAARw04IABBCEYNASAAQQFqIQAgBCABQQFqIgFHDQALIAMgBTYCAAyMAgsgA0EANgIAIAZBAWohAUEqDDgLIAEgBEYEQEHGASECDIsCCyABLQAAQdAARw04IAFBAWohAUElDDcLQcUBIQIgASAERg2JAiADKAIAIgAgBCABa2ohBSABIABrQQJqIQYCQANAIAEtAAAgAEGB1QBqLQAARw02IABBAkYNASAAQQFqIQAgBCABQQFqIgFHDQALIAMgBTYCAAyKAgsgA0EANgIAIAZBAWohAUEODDYLIAEgBEYEQEHEASECDIkCCyABLQAAQcUARw02IAFBAWohAUGrASECDO8BCyABIARGBEBBwwEhAgyIAgsCQAJAAkACQCABLQAAQcIAaw4PAAECOTk5OTk5OTk5OTkDOQsgAUEBaiEBQacBIQIM8QELIAFBAWohAUGoASECDPABCyABQQFqIQFBqQEhAgzvAQsgAUEBaiEBQaoBIQIM7gELQcIBIQIgASAERg2GAiADKAIAIgAgBCABa2ohBSABIABrQQJqIQYCQANAIAEtAAAgAEH+1ABqLQAARw0zIABBAkYNASAAQQFqIQAgBCABQQFqIgFHDQALIAMgBTYCAAyHAgsgA0EANgIAIAZBAWohAUEUDDMLQcEBIQIgASAERg2FAiADKAIAIgAgBCABa2ohBSABIABrQQRqIQYCQANA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BTYCAAzsAQsgA0EANgIAIAZBAWohAUEXDBgLQaYBIQIgASAERg3qASADKAIAIgAgBCABa2ohBSABIABrQQVqIQYCQANAIAEtAAAgAEHB1ABqLQAARw0XIABBBUYNASAAQQFqIQAgBCABQQFqIgFHDQALIAMgBTYCAAzrAQsgA0EANgIAIAZBAWohAUEYDBcLIAEgBEYEQEGlASECDOoBCwJAAkAgAS0AAEHJAGsOBwAZGRkZGQEZCyABQQFqIQFBiwEhAgzRAQsgAUEBaiEBQYwBIQIM0AELQaQBIQIgASAERg3oASADKAIAIgAgBCABa2ohBSABIABrQQFqIQYCQANAIAEtAAAgAEGm1QBqLQAARw0VIABBAUYNASAAQQFqIQAgBCABQQFqIgFHDQALIAMgBTYCAAzpAQsgA0EANgIAIAZBAWohAUEJDBULQaMBIQIgASAERg3nASADKAIAIgAgBCABa2ohBSABIABrQQFqIQYCQANAIAEtAAAgAEGk1QBqLQAARw0UIABBAUYNASAAQQFqIQAgBCABQQFqIgFHDQALIAMgBTYCAAzoAQsgA0EANgIAIAZBAWohAUEfDBQLQaIBIQIgASAERg3mASADKAIAIgAgBCABa2ohBSABIABrQQJqIQYCQANAIAEtAAAgAEG+1ABqLQAARw0TIABBAkYNASAAQQFqIQAgBCABQQFqIgFHDQALIAMgBTYCAAznAQsgA0EANgIAIAZBAWohAUECDBMLQaEBIQIgASAERg3lASADKAIAIgAgBCABa2ohBSABIABrQQFqIQYDQCABLQAAIABBvNQAai0AAEcNESAAQQFGDQIgAEEBaiEAIAQgAUEBaiIBRw0ACyADIAU2AgAM5QELIAEgBEYEQEGgASECDOUBC0EBIAEtAABB3wBHDREaIAFBAWohAUGHASECDMsBCyADQQA2AgAgBkEBaiEBQYgBIQIMygELQZ8BIQIgASAERg3iASADKAIAIgAgBCABa2ohBSABIABrQQhqIQYCQANAIAEtAAAgAEGE1QBqLQAARw0PIABBCEYNASAAQQFqIQAgBCABQQFqIgFHDQALIAMgBTYCAAzjAQsgA0EANgIAIAZBAWohAUEpDA8LQZ4BIQIgASAERg3hASADKAIAIgAgBCABa2ohBSABIABrQQNqIQYCQANAIAEtAAAgAEG41ABqLQAARw0OIABBA0YNASAAQQFqIQAgBCABQQFqIgFHDQALIAMgBTYCAAziAQsgA0EANgIAIAZBAWohAUEtDA4LIAEgBEYEQEGdASECDOEBCyABLQAAQcUARw0OIAFBAWohAUGEASECDMcBCyABIARGBEBBnAEhAgzgAQsCQAJAIAEtAABBzABrDggADw8PDw8PAQ8LIAFBAWohAUGCASECDMcBCyABQQFqIQFBgwEhAgzGAQtBmwEhAiABIARGDd4BIAMoAgAiACAEIAFraiEFIAEgAGtBBGohBgJAA0AgAS0AACAAQbPUAGotAABHDQsgAEEERg0BIABBAWohACAEIAFBAWoiAUcNAAsgAyAFNgIADN8BCyADQQA2AgAgBkEBaiEBQSMMCwtBmgEhAiABIARGDd0BIAMoAgAiACAEIAFraiEFIAEgAGtBAmohBgJAA0AgAS0AACAAQbDUAGotAABHDQogAEECRg0BIABBAWohACAEIAFBAWoiAUcNAAsgAyAFNgIADN4BCyADQQA2AgAgBkEBaiEBQQAMCgsgASAERgRAQZkBIQIM3QELAkACQCABLQAAQcgAaw4IAAwMDAwMDAEMCyABQQFqIQFB/QAhAgzEAQsgAUEBaiEBQYABIQIMwwELIAEgBEYEQEGYASECDNwBCwJAAkAgAS0AAEHOAGsOAwALAQsLIAFBAWohAUH+ACECDMMBCyABQQFqIQFB/wAhAgzCAQsgASAERgRAQZcBIQIM2wELIAEtAABB2QBHDQggAUEBaiEBQQgMBwtBlgEhAiABIARGDdkBIAMoAgAiACAEIAFraiEFIAEgAGtBA2ohBgJAA0AgAS0AACAAQazUAGotAABHDQYgAEEDRg0BIABBAWohACAEIAFBAWoiAUcNAAsgAyAFNgIADNoBCyADQQA2AgAgBkEBaiEBQQUMBgtBlQEhAiABIARGDdgBIAMoAgAiACAEIAFraiEFIAEgAGtBBWohBgJAA0AgAS0AACAAQabUAGotAABHDQUgAEEFRg0BIABBAWohACAEIAFBAWoiAUcNAAsgAyAFNgIADNkBCyADQQA2AgAgBkEBaiEBQRYMBQtBlAEhAiABIARGDdcBIAMoAgAiACAEIAFraiEFIAEgAGtBAmohBgJAA0AgAS0AACAAQaHVAGotAABHDQQgAEECRg0BIABBAWohACAEIAFBAWoiAUcNAAsgAyAFNgIADNgBCyADQQA2AgAgBkEBaiEBQRAMBAsgASAERgRAQZMBIQIM1wELAkACQCABLQAAQcMAaw4MAAYGBgYGBgYGBgYBBgsgAUEBaiEBQfkAIQIMvgELIAFBAWohAUH6ACECDL0BC0GSASECIAEgBEYN1QEgAygCACIAIAQgAWtqIQUgASAAa0EFaiEGAkADQCABLQAAIABBoNQAai0AAEcNAiAAQQVGDQEgAEEBaiEAIAQgAUEBaiIBRw0ACyADIAU2AgAM1gELIANBADYCACAGQQFqIQFBJAwCCyADQQA2AgAMAgsgASAERgRAQZEBIQIM1AELIAEtAABBzABHDQEgAUEBaiEBQRMLOgApIAMoAgQhACADQQA2AgQgAyAAIAEQLiIADQIMAQtBACECIANBADYCHCADIAE2AhQgA0H+HzYCECADQQY2AgwM0QELQfgAIQIMtwELIANBkAE2AhwgAyABNgIUIAMgADYCDEEAIQIMzwELQQAhAAJAIAMoAjgiAkUNACACKAJAIgJFDQAgAyACEQAAIQALIABFDQAgAEEVRg0BIANBADYCHCADIAE2AhQgA0GCDzYCECADQSA2AgxBACECDM4BC0H3ACECDLQBCyADQY8BNgIcIAMgATYCFCADQewbNgIQIANBFTYCDEEAIQIMzAELIAEgBEYEQEGPASECDMwBCwJAIAEtAABBIEYEQCABQQFqIQEMAQsgA0EANgIcIAMgATYCFCADQZsfNgIQIANBBjYCDEEAIQIMzAELQQIhAgyyAQsDQCABLQAAQSBHDQIgBCABQQFqIgFHDQALQY4BIQIMygELIAEgBEYEQEGNASECDMoBCwJAIAEtAABBCWsOBEoAAEoAC0H1ACECDLABCyADLQApQQVGBEBB9gAhAgywAQtB9AAhAgyvAQsgASAERgRAQYwBIQIMyAELIANBEDYCCCADIAE2AgQMCgsgASAERgRAQYsBIQIMxwELAkAgAS0AAEEJaw4ERwAARwALQfMAIQIMrQELIAEgBEcEQCADQRA2AgggAyABNgIEQfEAIQIMrQELQYoBIQIMxQELAkAgASAERwRAA0AgAS0AAEGg0ABqLQAAIgBBA0cEQAJAIABBAWsOAkkABAtB8AAhAgyvAQsgBCABQQFqIgFHDQALQYgBIQIMxgELQYgBIQIMxQELIANBADYCHCADIAE2AhQgA0HbIDYCECADQQc2AgxBACECDMQBCyABIARGBEBBiQEhAgzEAQsCQAJAAkAgAS0AAEGg0gBqLQAAQQFrDgNGAgABC0HyACECDKwBCyADQQA2AhwgAyABNgIUIANBtBI2AhAgA0EHNgIMQQAhAgzEAQtB6gAhAgyqAQsgASAERwRAIAFBAWohAUHvACECDKoBC0GHASECDMIBCyAEIAEiAEYEQEGGASECDMIBCyAALQAAIgFBL0YEQCAAQQFqIQFB7gAhAgypAQsgAUEJayICQRdLDQEgACEBQQEgAnRBm4CABHENQQwBCyAEIAEiAEYEQEGFASECDMEBCyAALQAAQS9HDQAgAEEBaiEBDAMLQQAhAiADQQA2AhwgAyAANgIUIANB2yA2AhAgA0EHNgIMDL8BCwJAAkACQAJAAkADQCABLQAAQaDOAGotAAAiAEEFRwRAAkACQCAAQQFrDghHBQYHCAAEAQgLQesAIQIMrQELIAFBAWohAUHtACECDKwBCyAEIAFBAWoiAUcNAAtBhAEhAgzDAQsgAUEBagwUCyADKAIEIQAgA0EANgIEIAMgACABECwiAEUNHiADQdsANgIcIAMgATYCFCADIAA2AgxBACECDMEBCyADKAIEIQAgA0EANgIEIAMgACABECwiAEUNHiADQd0ANgIcIAMgATYCFCADIAA2AgxBACECDMABCyADKAIEIQAgA0EANgIEIAMgACABECwiAEUNHiADQfoANgIcIAMgATYCFCADIAA2AgxBACECDL8BCyADQQA2AhwgAyABNgIUIANB+Q82AhAgA0EHNgIMQQAhAgy+AQsgASAERgRAQYMBIQIMvgELAkAgAS0AAEGgzgBqLQAAQQFrDgg+BAUGAAgCAwcLIAFBAWohAQtBAyECDKMBCyABQQFqDA0LQQAhAiADQQA2AhwgA0HREjYCECADQQc2AgwgAyABQQFqNgIUDLoBCyADKAIEIQAgA0EANgIEIAMgACABECwiAEUNFiADQdsANgIcIAMgATYCFCADIAA2AgxBACECDLkBCyADKAIEIQAgA0EANgIEIAMgACABECwiAEUNFiADQd0ANgIcIAMgATYCFCADIAA2AgxBACECDLgBCyADKAIEIQAgA0EANgIEIAMgACABECwiAEUNFiADQfoANgIcIAMgATYCFCADIAA2AgxBACECDLcBCyADQQA2AhwgAyABNgIUIANB+Q82AhAgA0EHNgIMQQAhAgy2AQtB7AAhAgycAQsgASAERgRAQYIBIQIMtQELIAFBAWoMAgsgASAERgRAQYEBIQIMtAELIAFBAWoMAQsgASAERg0BIAFBAWoLIQFBBCECDJgBC0GAASECDLABCwNAIAEtAABBoMwAai0AACIAQQJHBEAgAEEBRwRAQekAIQIMmQELDDELIAQgAUEBaiIBRw0AC0H/ACECDK8BCyABIARGBEBB/gAhAgyvAQsCQCABLQAAQQlrDjcvAwYvBAYGBgYGBgYGBgYGBgYGBgYGBgUGBgIGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYABgsgAUEBagshAUEFIQIMlAELIAFBAWoMBgsgAygCBCEAIANBADYCBCADIAAgARAsIgBFDQggA0HbADYCHCADIAE2AhQgAyAANgIMQQAhAgyrAQsgAygCBCEAIANBADYCBCADIAAgARAsIgBFDQggA0HdADYCHCADIAE2AhQgAyAANgIMQQAhAgyqAQsgAygCBCEAIANBADYCBCADIAAgARAsIgBFDQggA0H6ADYCHCADIAE2AhQgAyAANgIMQQAhAgypAQsgA0EANgIcIAMgATYCFCADQY0UNgIQIANBBzYCDEEAIQIMqAELAkACQAJAAkADQCABLQAAQaDKAGotAAAiAEEFRwRAAkAgAEEBaw4GLgMEBQYABgtB6AAhAgyUAQsgBCABQQFqIgFHDQALQf0AIQIMqwELIAMoAgQhACADQQA2AgQgAyAAIAEQLCIARQ0HIANB2wA2AhwgAyABNgIUIAMgADYCDEEAIQIMqgELIAMoAgQhACADQQA2AgQgAyAAIAEQLCIARQ0HIANB3QA2AhwgAyABNgIUIAMgADYCDEEAIQIMqQELIAMoAgQhACADQQA2AgQgAyAAIAEQLCIARQ0HIANB+gA2AhwgAyABNgIUIAMgADYCDEEAIQIMqAELIANBADYCHCADIAE2AhQgA0HkCDYCECADQQc2AgxBACECDKcBCyABIARGDQEgAUEBagshAUEGIQIMjAELQfwAIQIMpAELAkACQAJAAkADQCABLQAAQaDIAGotAAAiAEEFRwRAIABBAWsOBCkCAwQFCyAEIAFBAWoiAUcNAAtB+wAhAgynAQsgAygCBCEAIANBADYCBCADIAAgARAsIgBFDQMgA0HbADYCHCADIAE2AhQgAyAANgIMQQAhAgymAQsgAygCBCEAIANBADYCBCADIAAgARAsIgBFDQMgA0HdADYCHCADIAE2AhQgAyAANgIMQQAhAgylAQsgAygCBCEAIANBADYCBCADIAAgARAsIgBFDQMgA0H6ADYCHCADIAE2AhQgAyAANgIMQQAhAgykAQsgA0EANgIcIAMgATYCFCADQbwKNgIQIANBBzYCDEEAIQIMowELQc8AIQIMiQELQdEAIQIMiAELQecAIQIMhwELIAEgBEYEQEH6ACECDKABCwJAIAEtAABBCWsOBCAAACAACyABQQFqIQFB5gAhAgyGAQsgASAERgRAQfkAIQIMnwELAkAgAS0AAEEJaw4EHwAAHwALQQAhAAJAIAMoAjgiAkUNACACKAI4IgJFDQAgAyACEQAAIQALIABFBEBB4gEhAgyGAQsgAEEVRwRAIANBADYCHCADIAE2AhQgA0HJDTYCECADQRo2AgxBACECDJ8BCyADQfgANgIcIAMgATYCFCADQeoaNgIQIANBFTYCDEEAIQIMngELIAEgBEcEQCADQQ02AgggAyABNgIEQeQAIQIMhQELQfcAIQIMnQELIAEgBEYEQEH2ACECDJ0BCwJAAkACQCABLQAAQcgAaw4LAAELCwsLCwsLCwILCyABQQFqIQFB3QAhAgyFAQsgAUEBaiEBQeAAIQIMhAELIAFBAWohAUHjACECDIMBC0H1ACECIAEgBEYNmwEgAygCACIAIAQgAWtqIQUgASAAa0ECaiEGAkADQCABLQAAIABBtdUAai0AAEcNCCAAQQJGDQEgAEEBaiEAIAQgAUEBaiIBRw0ACyADIAU2AgAMnAELIAMoAgQhACADQgA3AwAgAyAAIAZBAWoiARArIgAEQCADQfQANgIcIAMgATYCFCADIAA2AgxBACECDJwBC0HiACECDIIBC0EAIQACQCADKAI4IgJFDQAgAigCNCICRQ0AIAMgAhEAACEACwJAIAAEQCAAQRVGDQEgA0EANgIcIAMgATYCFCADQeoNNgIQIANBJjYCDEEAIQIMnAELQeEAIQIMggELIANB8wA2AhwgAyABNgIUIANBgBs2AhAgA0EVNgIMQQAhAgyaAQsgAy0AKSIAQSNrQQtJDQkCQCAAQQZLDQBBASAAdEHKAHFFDQAMCgtBACECIANBADYCHCADIAE2AhQgA0HtCTYCECADQQg2AgwMmQELQfIAIQIgASAERg2YASADKAIAIgAgBCABa2ohBSABIABrQQFqIQYCQANAIAEtAAAgAEGz1QBqLQAARw0FIABBAUYNASAAQQFqIQAgBCABQQFqIgFHDQALIAMgBTYCAAyZAQsgAygCBCEAIANCADcDACADIAAgBkEBaiIBECsiAARAIANB8QA2AhwgAyABNgIUIAMgADYCDEEAIQIMmQELQd8AIQIMfwtBACEAAkAgAygCOCICRQ0AIAIoAjQiAkUNACADIAIRAAAhAAsCQCAABEAgAEEVRg0BIANBADYCHCADIAE2AhQgA0HqDTYCECADQSY2AgxBACECDJkBC0HeACECDH8LIANB8AA2AhwgAyABNgIUIANBgBs2AhAgA0EVNgIMQQAhAgyXAQsgAy0AKUEhRg0GIANBADYCHCADIAE2AhQgA0GRCjYCECADQQg2AgxBACECDJYBC0HvACECIAEgBEYNlQEgAygCACIAIAQgAWtqIQUgASAAa0ECaiEGAkADQCABLQAAIABBsNUAai0AAEcNAiAAQQJGDQEgAEEBaiEAIAQgAUEBaiIBRw0ACyADIAU2AgAMlgELIAMoAgQhACADQgA3AwAgAyAAIAZBAWoiARArIgBFDQIgA0HtADYCHCADIAE2AhQgAyAANgIMQQAhAgyVAQsgA0EANgIACyADKAIEIQAgA0EANgIEIAMgACABECsiAEUNgAEgA0HuADYCHCADIAE2AhQgAyAANgIMQQAhAgyTAQtB3AAhAgx5C0EAIQACQCADKAI4IgJFDQAgAigCNCICRQ0AIAMgAhEAACEACwJAIAAEQCAAQRVGDQEgA0EANgIcIAMgATYCFCADQeoNNgIQIANBJjYCDEEAIQIMkwELQdsAIQIMeQsgA0HsADYCHCADIAE2AhQgA0GAGzYCECADQRU2AgxBACECDJEBCyADLQApIgBBI0kNACAAQS5GDQAgA0EANgIcIAMgATYCFCADQckJNgIQIANBCDYCDEEAIQIMkAELQdoAIQIMdgsgASAERgRAQesAIQIMjwELAkAgAS0AAEEvRgRAIAFBAWohAQwBCyAD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ciBIVFRQL3gueCByZXF1ZXN0AEludmFsaWQgbWV0aG9kIGZvciBSVFNQL3gueCByZXF1ZXN0AEV4cGVjdGVkIFNPVVJDRSBtZXRob2QgZm9yIElDRS94LnggcmVxdWVzdABJbnZhbGlkIGNoYXIgaW4gdXJsIGZyYWdtZW50IHN0YXJ0AEV4cGVjdGVkIGRvdABTcGFuIGNhbGxiYWNrIGVycm9yIGluIG9uX3N0YXR1cwBJbnZhbGlkIHJlc3BvbnNlIHN0YXR1cwBFeHBlY3RlZCBMRiBhZnRlciBoZWFkZXJzAEludmFsaWQgY2hhcmFjdGVyIGluIGNodW5rIGV4dGVuc2lvbnMAVXNlciBjYWxsYmFjayBlcnJvcgBgb25fcmVzZXRgIGNhbGxiYWNrIGVycm9yAGBvbl9jaHVua19oZWFkZXJgIGNhbGxiYWNrIGVycm9yAGBvbl9tZXNzYWdlX2JlZ2luYCBjYWxsYmFjayBlcnJvcgBgb25fY2h1bmtfZXh0ZW5zaW9uX3ZhbHVlYCBjYWxsYmFjayBlcnJvcgBgb25fc3RhdHVzX2NvbXBsZXRlYCBjYWxsYmFjayBlcnJvcgBgb25fdmVyc2lvbl9jb21wbGV0ZWAgY2FsbGJhY2sgZXJyb3IAYG9uX3VybF9jb21wbGV0ZWAgY2FsbGJhY2sgZXJyb3IAYG9uX3Byb3RvY29sX2NvbXBsZXRlYCBjYWxsYmFjayBlcnJvcgBgb25fY2h1bmtfY29tcGxldGVgIGNhbGxiYWNrIGVycm9yAGBvbl9oZWFkZXJfdmFsdWVfY29tcGxldGVgIGNhbGxiYWNrIGVycm9yAGBvbl9tZXNzYWdlX2NvbXBsZXRlYCBjYWxsYmFjayBlcnJvcgBgb25fbWV0aG9kX2NvbXBsZXRlYCBjYWxsYmFjayBlcnJvcgBgb25faGVhZGVyX2ZpZWxkX2NvbXBsZXRlYCBjYWxsYmFjayBlcnJvcgBgb25fY2h1bmtfZXh0ZW5zaW9uX25hbWVgIGNhbGxiYWNrIGVycm9yAFVuZXhwZWN0ZWQgY2hhciBpbiB1cmwgc2VydmVyAEludmFsaWQgaGVhZGVyIHZhbHVlIGNoYXIASW52YWxpZCBoZWFkZXIgZmllbGQgY2hhcgBTcGFuIGNhbGxiYWNrIGVycm9yIGluIG9uX3ZlcnNpb24ASW52YWxpZCBtaW5vciB2ZXJzaW9uAEludmFsaWQgbWFqb3IgdmVyc2lvbgBFeHBlY3RlZCBzcGFjZSBhZnRlciB2ZXJzaW9uAEV4cGVjdGVkIENSTEYgYWZ0ZXIgdmVyc2lvbgBJbnZhbGlkIEhUVFAgdmVyc2lvbgBJbnZhbGlkIGhlYWRlciB0b2tlbgBTcGFuIGNhbGxiYWNrIGVycm9yIGluIG9uX3VybABJbnZhbGlkIGNoYXJhY3RlcnMgaW4gdXJsAFVuZXhwZWN0ZWQgc3RhcnQgY2hhciBpbiB1cmwARG91YmxlIEAgaW4gdXJsAFNwYW4gY2FsbGJhY2sgZXJyb3IgaW4gb25fcHJvdG9jb2wARW1wdHkgQ29udGVudC1MZW5ndGgASW52YWxpZCBjaGFyYWN0ZXIgaW4gQ29udGVudC1MZW5ndGgAVHJhbnNmZXItRW5jb2RpbmcgY2FuJ3QgYmUgcHJlc2VudCB3aXRoIENvbnRlbnQtTGVuZ3RoAER1cGxpY2F0ZSBDb250ZW50LUxlbmd0aABJbnZhbGlkIGNoYXIgaW4gdXJsIHBhdGgAQ29udGVudC1MZW5ndGggY2FuJ3QgYmUgcHJlc2VudCB3aXRoIFRyYW5zZmVyLUVuY29kaW5nAE1pc3NpbmcgZXhwZWN0ZWQgQ1IgYWZ0ZXIgY2h1bmsgc2l6ZQBFeHBlY3RlZCBMRiBhZnRlciBjaHVuayBzaXplAEludmFsaWQgY2hhcmFjdGVyIGluIGNodW5rIHNpemUAU3BhbiBjYWxsYmFjayBlcnJvciBpbiBvbl9oZWFkZXJfdmFsdWUAU3BhbiBjYWxsYmFjayBlcnJvciBpbiBvbl9jaHVua19leHRlbnNpb25fdmFsdWUASW52YWxpZCBjaGFyYWN0ZXIgaW4gY2h1bmsgZXh0ZW5zaW9ucyB2YWx1ZQBVbmV4cGVjdGVkIHdoaXRlc3BhY2UgYWZ0ZXIgaGVhZGVyIHZhbHVlAE1pc3NpbmcgZXhwZWN0ZWQgQ1IgYWZ0ZXIgaGVhZGVyIHZhbHVlAE1pc3NpbmcgZXhwZWN0ZWQgTEYgYWZ0ZXIgaGVhZGVyIHZhbHVlAEludmFsaWQgYFRyYW5zZmVyLUVuY29kaW5nYCBoZWFkZXIgdmFsdWUATWlzc2luZyBleHBlY3RlZCBDUiBhZnRlciBjaHVuayBleHRlbnNpb24gdmFsdWUASW52YWxpZCBjaGFyYWN0ZXIgaW4gY2h1bmsgZXh0ZW5zaW9ucyBxdW90ZSB2YWx1ZQBJbnZhbGlkIHF1b3RlZC1wYWlyIGluIGNodW5rIGV4dGVuc2lvbnMgcXVvdGVkIHZhbHVlAEludmFsaWQgY2hhcmFjdGVyIGluIGNodW5rIGV4dGVuc2lvbnMgcXVvdGVkIHZhbHVlAFBhdXNlZCBieSBvbl9oZWFkZXJzX2NvbXBsZXRlAEludmFsaWQgRU9GIHN0YXRlAG9uX3Jlc2V0IHBhdXNlAG9uX2NodW5rX2hlYWRlciBwYXVzZQBvbl9tZXNzYWdlX2JlZ2luIHBhdXNlAG9uX2NodW5rX2V4dGVuc2lvbl92YWx1ZSBwYXVzZQBvbl9zdGF0dXNfY29tcGxldGUgcGF1c2UAb25fdmVyc2lvbl9jb21wbGV0ZSBwYXVzZQBvbl91cmxfY29tcGxldGUgcGF1c2UAb25fcHJvdG9jb2xfY29tcGxldGUgcGF1c2UAb25fY2h1bmtfY29tcGxldGUgcGF1c2UAb25faGVhZGVyX3ZhbHVlX2NvbXBsZXRlIHBhdXNlAG9uX21lc3NhZ2VfY29tcGxldGUgcGF1c2UAb25fbWV0aG9kX2NvbXBsZXRlIHBhdXNlAG9uX2hlYWRlcl9maWVsZF9jb21wbGV0ZSBwYXVzZQBvbl9jaHVua19leHRlbnNpb25fbmFtZSBwYXVzZQBVbmV4cGVjdGVkIHNwYWNlIGFmdGVyIHN0YXJ0IGxpbmUATWlzc2luZyBleHBlY3RlZCBDUiBhZnRlciByZXNwb25zZSBsaW5lAFNwYW4gY2FsbGJhY2sgZXJyb3IgaW4gb25fY2h1bmtfZXh0ZW5zaW9uX25hbWUASW52YWxpZCBjaGFyYWN0ZXIgaW4gY2h1bmsgZXh0ZW5zaW9ucyBuYW1lAE1pc3NpbmcgZXhwZWN0ZWQgQ1IgYWZ0ZXIgY2h1bmsgZXh0ZW5zaW9uIG5hbWUASW52YWxpZCBzdGF0dXMgY29kZQBQYXVzZSBvbiBDT05ORUNUL1VwZ3JhZGUAUGF1c2Ugb24gUFJJL1VwZ3JhZGUARXhwZWN0ZWQgSFRUUC8yIENvbm5lY3Rpb24gUHJlZmFjZQBTcGFuIGNhbGxiYWNrIGVycm9yIGluIG9uX21ldGhvZABFeHBlY3RlZCBzcGFjZSBhZnRlciBtZXRob2QAU3BhbiBjYWxsYmFjayBlcnJvciBpbiBvbl9oZWFkZXJfZmllbGQAUGF1c2VkAEludmFsaWQgd29yZCBlbmNvdW50ZXJlZABJbnZhbGlkIG1ldGhvZCBlbmNvdW50ZXJlZABNaXNzaW5nIGV4cGVjdGVkIENSIGFmdGVyIGNodW5rIGRhdGEARXhwZWN0ZWQgTEYgYWZ0ZXIgY2h1bmsgZGF0YQBVbmV4cGVjdGVkIGNoYXIgaW4gdXJsIHNjaGVtYQBSZXF1ZXN0IGhhcyBpbnZhbGlkIGBUcmFuc2Zlci1FbmNvZGluZ2AARGF0YSBhZnRlciBgQ29ubmVjdGlvbjogY2xvc2VgAFNXSVRDSF9QUk9YWQBVU0VfUFJPWFkATUtBQ1RJVklUWQBVTlBST0NFU1NBQkxFX0VOVElUWQBRVUVSWQBDT1BZAE1PVkVEX1BFUk1BTkVOVExZAFRPT19FQVJMWQBOT1RJRlkARkFJTEVEX0RFUEVOREVOQ1kAQkFEX0dBVEVXQVkAUExBWQBQVVQAQ0hFQ0tPVVQAR0FURVdBWV9USU1FT1VUAFJFUVVFU1RfVElNRU9VVABORVRXT1JLX0NPTk5FQ1RfVElNRU9VVABDT05ORUNUSU9OX1RJTUVPVVQATE9HSU5fVElNRU9VVABORVRXT1JLX1JFQURfVElNRU9VVABQT1NUAE1JU0RJUkVDVEVEX1JFUVVFU1QAQ0xJRU5UX0NMT1NFRF9SRVFVRVNUAENMSUVOVF9DTE9TRURfTE9BRF9CQUxBTkNFRF9SRVFVRVNUAEJBRF9SRVFVRVNUAEhUVFBfUkVRVUVTVF9TRU5UX1RPX0hUVFBTX1BPUlQAUkVQT1JUAElNX0FfVEVBUE9UAFJFU0VUX0NPTlRFTlQATk9fQ09OVEVOVABQQVJUSUFMX0NPTlRFTlQASFBFX0lOVkFMSURfQ09OU1RBTlQASFBFX0NCX1JFU0VUAEdFVABIUEVfU1RSSUNUAENPTkZMSUNUAFRFTVBPUkFSWV9SRURJUkVDVABQRVJNQU5FTlRfUkVESVJFQ1QAQ09OTkVDVABNVUxUSV9TVEFUVVMASFBFX0lOVkFMSURfU1RBVFVTAFRPT19NQU5ZX1JFUVVFU1RTAEVBUkxZX0hJTlRTAFVOQVZBSUxBQkxFX0ZPUl9MRUdBTF9SRUFTT05TAE9QVElPTlMAU1dJVENISU5HX1BST1RPQ09MUwBWQVJJQU5UX0FMU09fTkVHT1RJQVRFUwBNVUxUSVBMRV9DSE9JQ0VTAElOVEVSTkFMX1NFUlZFUl9FUlJPUgBXRUJfU0VSVkVSX1VOS05PV05fRVJST1IAUkFJTEdVTl9FUlJPUgBJREVOVElUWV9QUk9WSURFUl9BVVRIRU5USUNBVElPTl9FUlJPUgBTU0xfQ0VSVElGSUNBVEVfRVJST1IASU5WQUxJRF9YX0ZPUldBUkRFRF9GT1IAU0VUX1BBUkFNRVRFUgBHRVRfUEFSQU1FVEVSAEhQRV9VU0VSAFNFRV9PVEhFUgBIUEVfQ0JfQ0hVTktfSEVBREVSAEV4cGVjdGVkIExGIGFmdGVyIENSAE1LQ0FMRU5EQVIAU0VUVVAAV0VCX1NFUlZFUl9JU19ET1dOAFRFQVJET1dOAEhQRV9DTE9TRURfQ09OTkVDVElPTgBIRVVSSVNUSUNfRVhQSVJBVElPTgBESVNDT05ORUNURURfT1BFUkFUSU9OAE5PTl9BVVRIT1JJVEFUSVZFX0lORk9STUFUSU9OAEhQRV9JTlZBTElEX1ZFUlNJT04ASFBFX0NCX01FU1NBR0VfQkVHSU4AU0lURV9JU19GUk9aRU4ASFBFX0lOVkFMSURfSEVBREVSX1RPS0VOAElOVkFMSURfVE9LRU4ARk9SQklEREVOAEVOSEFOQ0VfWU9VUl9DQUxNAEhQRV9JTlZBTElEX1VSTABCTE9DS0VEX0JZX1BBUkVOVEFMX0NPTlRST0wATUtDT0wAQUNMAEhQRV9JTlRFUk5BTABSRVFVRVNUX0hFQURFUl9GSUVMRFNfVE9PX0xBUkdFX1VOT0ZGSUNJQUwASFBFX09LAFVOTElOSwBVTkxPQ0sAUFJJAFJFVFJZX1dJVEgASFBFX0lOVkFMSURfQ09OVEVOVF9MRU5HVEgASFBFX1VORVhQRUNURURfQ09OVEVOVF9MRU5HVEgARkxVU0gAUFJPUFBBVENIAE0tU0VBUkNIAFVSSV9UT09fTE9ORwBQUk9DRVNTSU5HAE1JU0NFTExBTkVPVVNfUEVSU0lTVEVOVF9XQVJOSU5HAE1JU0NFTExBTkVPVVNfV0FSTklORwBIUEVfSU5WQUxJRF9UUkFOU0ZFUl9FTkNPRElORwBFeHBlY3RlZCBDUkxGAEhQRV9JTlZBTElEX0NIVU5LX1NJWkUATU9WRQBDT05USU5VRQBIUEVfQ0JfU1RBVFVTX0NPTVBMRVRFAEhQRV9DQl9IRUFERVJTX0NPTVBMRVRFAEhQRV9DQl9WRVJTSU9OX0NPTVBMRVRFAEhQRV9DQl9VUkxfQ09NUExFVEUASFBFX0NCX1BST1RPQ09MX0NPTVBMRVRFAEhQRV9DQl9DSFVOS19DT01QTEVURQBIUEVfQ0JfSEVBREVSX1ZBTFVFX0NPTVBMRVRFAEhQRV9DQl9DSFVOS19FWFRFTlNJT05fVkFMVUVfQ09NUExFVEUASFBFX0NCX0NIVU5LX0VYVEVOU0lPTl9OQU1FX0NPTVBMRVRFAEhQRV9DQl9NRVNTQUdFX0NPTVBMRVRFAEhQRV9DQl9NRVRIT0RfQ09NUExFVEUASFBFX0NCX0hFQURFUl9GSUVMRF9DT01QTEVURQBERUxFVEUASFBFX0lOVkFMSURfRU9GX1NUQVRFAElOVkFMSURfU1NMX0NFUlRJRklDQVRFAFBBVVNFAE5PX1JFU1BPTlNFAFVOU1VQUE9SVEVEX01FRElBX1RZUEUAR09ORQBOT1RfQUNDRVBUQUJMRQBTRVJWSUNFX1VOQVZBSUxBQkxFAFJBTkdFX05PVF9TQVRJU0ZJQUJMRQBPUklHSU5fSVNfVU5SRUFDSEFCTEUAUkVTUE9OU0VfSVNfU1RBTEUAUFVSR0UATUVSR0UAUkVRVUVTVF9IRUFERVJfRklFTERTX1RPT19MQVJHRQBSRVFVRVNUX0hFQURFUl9UT09fTEFSR0UAUEFZTE9BRF9UT09fTEFSR0UASU5TVUZGSUNJRU5UX1NUT1JBR0UASFBFX1BBVVNFRF9VUEdSQURFAEhQRV9QQVVTRURfSDJfVVBHUkFERQBTT1VSQ0UAQU5OT1VOQ0UAVFJBQ0UASFBFX1VORVhQRUNURURfU1BBQ0UAREVTQ1JJQkUAVU5TVUJTQ1JJQkUAUkVDT1JEAEhQRV9JTlZBTElEX01FVEhPRABOT1RfRk9VTkQAUFJPUEZJTkQAVU5CSU5EAFJFQklORABVTkFVVEhPUklaRUQATUVUSE9EX05PVF9BTExPV0VEAEhUVFBfVkVSU0lPTl9OT1RfU1VQUE9SVEVEAEFMUkVBRFlfUkVQT1JURUQAQUNDRVBURUQATk9UX0lNUExFTUVOVEVEAExPT1BfREVURUNURUQASFBFX0NSX0VYUEVDVEVEAEhQRV9MRl9FWFBFQ1RFRABDUkVBVEVEAElNX1VTRUQASFBFX1BBVVNFRABUSU1FT1VUX09DQ1VSRUQAUEFZTUVOVF9SRVFVSVJFRABQUkVDT05ESVRJT05fUkVRVUlSRUQAUFJPWFlfQVVUSEVOVElDQVRJT05fUkVRVUlSRUQATkVUV09SS19BVVRIRU5USUNBVElPTl9SRVFVSVJFRABMRU5HVEhfUkVRVUlSRUQAU1NMX0NFUlRJRklDQVRFX1JFUVVJUkVEAFVQR1JBREVfUkVRVUlSRUQAUEFHRV9FWFBJUkVEAFBSRUNPTkRJVElPTl9GQUlMRUQARVhQRUNUQVRJT05fRkFJTEVEAFJFVkFMSURBVElPTl9GQUlMRUQAU1NMX0hBTkRTSEFLRV9GQUlMRUQATE9DS0VEAFRSQU5TRk9STUFUSU9OX0FQUExJRUQATk9UX01PRElGSUVEAE5PVF9FWFRFTkRFRABCQU5EV0lEVEhfTElNSVRfRVhDRUVERUQAU0lURV9JU19PVkVSTE9BREVEAEhFQUQARXhwZWN0ZWQgSFRUUC8sIFJUU1AvIG9yIElDRS8A5xUAAK8VAACkEgAAkhoAACYWAACeFAAA2xkAAHkVAAB+EgAA/hQAADYVAAALFgAA2BYAAPMSAABCGAAArBYAABIVAAAUFwAA7xcAAEgUAABxFwAAshoAAGsZAAB+GQAANRQAAIIaAABEFwAA/RYAAB4YAACHFwAAqhkAAJMSAAAHGAAALBcAAMoXAACkFwAA5xUAAOcVAABYFwAAOxgAAKASAAAtHAAAwxEAAEgRAADeEgAAQhMAAKQZAAD9EAAA9xUAAKUVAADvFgAA+BkAAEoWAABWFgAA9RUAAAoaAAAIGgAAARoAAKsVAABCEgAA1xAAAEwRAAAFGQAAVBYAAB4RAADKGQAAyBkAAE4WAAD/GAAAcRQAAPAVAADuFQAAlBkAAPwVAAC/GQAAmxkAAHwUAABDEQAAcBgAAJUUAAAnFAAAGRQAANUSAADUGQAARBYAAPcQAEG5OwsBAQBB0DsL4AEBAQIBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQBBuj0LBAEAAAIAQdE9C14DBAMDAwMDAAADAwADAwADAwMDAwMDAwMDAAUAAAAAAAMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAAAAAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMAAwADAEG6PwsEAQAAAgBB0T8LXgMAAwMDAwMAAAMDAAMDAAMDAwMDAwMDAwMABAAFAAAAAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMAAAADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwADAAMAQbDBAAsNbG9zZWVlcC1hbGl2ZQBBycEACwEBAEHgwQAL4AEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQBBycMACwEBAEHgwwAL5wEBAQEBAQEBAQEBAQECAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAWNodW5rZWQAQfHFAAteAQABAQEBAQAAAQEAAQEAAQEBAQEBAQEBAQAAAAAAAAABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQAAAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAEAAQBB0McACyFlY3Rpb25lbnQtbGVuZ3Rob25yb3h5LWNvbm5lY3Rpb24AQYDIAAsgcmFuc2Zlci1lbmNvZGluZ3BncmFkZQ0KDQpTTQ0KDQoAQanIAAsFAQIAAQMAQcDIAAtfBAUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUAQanKAAsFAQIAAQMAQcDKAAtfBAUFBgUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUAQanMAAsEAQAAAQBBwcwAC14CAgACAgICAgICAgICAgICAgICAgICAgICAgICAgIAAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAEGpzgALBQECAAEDAEHAzgALXwQFAAAFBQUFBQUFBQUFBQYFBQUFBQUFBQUFBQUABQAHCAUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQAFAAUABQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUAAAAFAEGp0AALBQEBAAEBAEHA0AALAQEAQdrQAAtBAgAAAAAAAAMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAAAAAAAAAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMAQanSAAsFAQEAAQEAQcDSAAsBAQBBytIACwYCAAAAAAIAQeHSAAs6AwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMAAAAAAAADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwBBoNQAC50BTk9VTkNFRUNLT1VUTkVDVEVURUNSSUJFTFVTSEVURUFEU0VBUkNIUkdFQ1RJVklUWUxFTkRBUlZFT1RJRllQVElPTlNDSFNFQVlTVEFUQ0hHRVVFUllPUkRJUkVDVE9SVFJDSFBBUkFNRVRFUlVSQ0VCU0NSSUJFQVJET1dOQUNFSU5ETktDS1VCU0NSSUJFVFRQQ0VUU1BBRFRQLw==";
	let wasmBuffer;
	Object.defineProperty(module, "exports", { get: () => {
		return wasmBuffer ? wasmBuffer : wasmBuffer = Buffer$3.from(wasmBase64, "base64");
	} });
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/web/fetch/constants.js
var require_constants$2 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const corsSafeListedMethods = [
		"GET",
		"HEAD",
		"POST"
	];
	const corsSafeListedMethodsSet = new Set(corsSafeListedMethods);
	const nullBodyStatus = [
		101,
		204,
		205,
		304
	];
	const redirectStatus = [
		301,
		302,
		303,
		307,
		308
	];
	const redirectStatusSet = new Set(redirectStatus);
	/**
	* @see https://fetch.spec.whatwg.org/#block-bad-port
	*/
	const badPorts = [
		"1",
		"7",
		"9",
		"11",
		"13",
		"15",
		"17",
		"19",
		"20",
		"21",
		"22",
		"23",
		"25",
		"37",
		"42",
		"43",
		"53",
		"69",
		"77",
		"79",
		"87",
		"95",
		"101",
		"102",
		"103",
		"104",
		"109",
		"110",
		"111",
		"113",
		"115",
		"117",
		"119",
		"123",
		"135",
		"137",
		"139",
		"143",
		"161",
		"179",
		"389",
		"427",
		"465",
		"512",
		"513",
		"514",
		"515",
		"526",
		"530",
		"531",
		"532",
		"540",
		"548",
		"554",
		"556",
		"563",
		"587",
		"601",
		"636",
		"989",
		"990",
		"993",
		"995",
		"1719",
		"1720",
		"1723",
		"2049",
		"3659",
		"4045",
		"4190",
		"5060",
		"5061",
		"6000",
		"6566",
		"6665",
		"6666",
		"6667",
		"6668",
		"6669",
		"6679",
		"6697",
		"10080"
	];
	const badPortsSet = new Set(badPorts);
	/**
	* @see https://w3c.github.io/webappsec-referrer-policy/#referrer-policy-header
	*/
	const referrerPolicyTokens = [
		"no-referrer",
		"no-referrer-when-downgrade",
		"same-origin",
		"origin",
		"strict-origin",
		"origin-when-cross-origin",
		"strict-origin-when-cross-origin",
		"unsafe-url"
	];
	/**
	* @see https://w3c.github.io/webappsec-referrer-policy/#referrer-policies
	*/
	const referrerPolicy = ["", ...referrerPolicyTokens];
	const referrerPolicyTokensSet = new Set(referrerPolicyTokens);
	const requestRedirect = [
		"follow",
		"manual",
		"error"
	];
	const safeMethods = [
		"GET",
		"HEAD",
		"OPTIONS",
		"TRACE",
		"QUERY"
	];
	const safeMethodsSet = new Set(safeMethods);
	const requestMode = [
		"navigate",
		"same-origin",
		"no-cors",
		"cors"
	];
	const requestCredentials = [
		"omit",
		"same-origin",
		"include"
	];
	const requestCache = [
		"default",
		"no-store",
		"reload",
		"no-cache",
		"force-cache",
		"only-if-cached"
	];
	/**
	* @see https://fetch.spec.whatwg.org/#request-body-header-name
	*/
	const requestBodyHeader = [
		"content-encoding",
		"content-language",
		"content-location",
		"content-type",
		"content-length"
	];
	/**
	* @see https://fetch.spec.whatwg.org/#enumdef-requestduplex
	*/
	const requestDuplex = ["half"];
	/**
	* @see http://fetch.spec.whatwg.org/#forbidden-method
	*/
	const forbiddenMethods = [
		"CONNECT",
		"TRACE",
		"TRACK"
	];
	const forbiddenMethodsSet = new Set(forbiddenMethods);
	const subresource = [
		"audio",
		"audioworklet",
		"font",
		"image",
		"manifest",
		"paintworklet",
		"script",
		"style",
		"track",
		"video",
		"xslt",
		""
	];
	module.exports = {
		subresource,
		forbiddenMethods,
		requestBodyHeader,
		referrerPolicy,
		requestRedirect,
		requestMode,
		requestCredentials,
		requestCache,
		redirectStatus,
		corsSafeListedMethods,
		nullBodyStatus,
		safeMethods,
		badPorts,
		requestDuplex,
		subresourceSet: new Set(subresource),
		badPortsSet,
		redirectStatusSet,
		corsSafeListedMethodsSet,
		safeMethodsSet,
		forbiddenMethodsSet,
		referrerPolicyTokens: referrerPolicyTokensSet
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/web/fetch/global.js
var require_global$1 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const globalOrigin = Symbol.for("undici.globalOrigin.1");
	function getGlobalOrigin() {
		return globalThis[globalOrigin];
	}
	function setGlobalOrigin(newOrigin) {
		if (newOrigin === void 0) {
			Object.defineProperty(globalThis, globalOrigin, {
				value: void 0,
				writable: true,
				enumerable: false,
				configurable: false
			});
			return;
		}
		const parsedURL = new URL(newOrigin);
		if (parsedURL.protocol !== "http:" && parsedURL.protocol !== "https:") throw new TypeError(`Only http & https urls are allowed, received ${parsedURL.protocol}`);
		Object.defineProperty(globalThis, globalOrigin, {
			value: parsedURL,
			writable: true,
			enumerable: false,
			configurable: false
		});
	}
	module.exports = {
		getGlobalOrigin,
		setGlobalOrigin
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/encoding/index.js
var require_encoding = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const textDecoder = new TextDecoder();
	/**
	* @see https://encoding.spec.whatwg.org/#utf-8-decode
	* @param {Uint8Array} buffer
	*/
	function utf8DecodeBytes(buffer) {
		if (buffer.length === 0) return "";
		if (buffer[0] === 239 && buffer[1] === 187 && buffer[2] === 191) buffer = buffer.subarray(3);
		return textDecoder.decode(buffer);
	}
	module.exports = { utf8DecodeBytes };
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/web/infra/index.js
var require_infra = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const assert$29 = __require("node:assert");
	const { utf8DecodeBytes } = require_encoding();
	/**
	* @param {(char: string) => boolean} condition
	* @param {string} input
	* @param {{ position: number }} position
	* @returns {string}
	*
	* @see https://infra.spec.whatwg.org/#collect-a-sequence-of-code-points
	*/
	function collectASequenceOfCodePoints(condition, input, position) {
		let result = "";
		while (position.position < input.length && condition(input[position.position])) {
			result += input[position.position];
			position.position++;
		}
		return result;
	}
	/**
	* A faster collectASequenceOfCodePoints that only works when comparing a single character.
	* @param {string} char
	* @param {string} input
	* @param {{ position: number }} position
	* @returns {string}
	*
	* @see https://infra.spec.whatwg.org/#collect-a-sequence-of-code-points
	*/
	function collectASequenceOfCodePointsFast(char, input, position) {
		const idx = input.indexOf(char, position.position);
		const start = position.position;
		if (idx === -1) {
			position.position = input.length;
			return input.slice(start);
		}
		position.position = idx;
		return input.slice(start, position.position);
	}
	const ASCII_WHITESPACE_REPLACE_REGEX = /[\u0009\u000A\u000C\u000D\u0020]/g;
	/**
	* @param {string} data
	* @returns {Uint8Array | 'failure'}
	*
	* @see https://infra.spec.whatwg.org/#forgiving-base64-decode
	*/
	function forgivingBase64(data) {
		data = data.replace(ASCII_WHITESPACE_REPLACE_REGEX, "");
		let dataLength = data.length;
		if (dataLength % 4 === 0) {
			if (data.charCodeAt(dataLength - 1) === 61) {
				--dataLength;
				if (data.charCodeAt(dataLength - 1) === 61) --dataLength;
			}
		}
		if (dataLength % 4 === 1) return "failure";
		if (/[^+/0-9A-Za-z]/.test(data.length === dataLength ? data : data.substring(0, dataLength))) return "failure";
		const buffer = Buffer.from(data, "base64");
		return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
	}
	/**
	* @param {number} char
	* @returns {boolean}
	*
	* @see https://infra.spec.whatwg.org/#ascii-whitespace
	*/
	function isASCIIWhitespace(char) {
		return char === 9 || char === 10 || char === 12 || char === 13 || char === 32;
	}
	/**
	* @param {Uint8Array} input
	* @returns {string}
	*
	* @see https://infra.spec.whatwg.org/#isomorphic-decode
	*/
	function isomorphicDecode(input) {
		const length = input.length;
		if (65535 > length) return String.fromCharCode.apply(null, input);
		let result = "";
		let i = 0;
		let addition = 65535;
		while (i < length) {
			if (i + addition > length) addition = length - i;
			result += String.fromCharCode.apply(null, input.subarray(i, i += addition));
		}
		return result;
	}
	const invalidIsomorphicEncodeValueRegex = /[^\x00-\xFF]/;
	/**
	* @param {string} input
	* @returns {string}
	*
	* @see https://infra.spec.whatwg.org/#isomorphic-encode
	*/
	function isomorphicEncode(input) {
		assert$29(!invalidIsomorphicEncodeValueRegex.test(input));
		return input;
	}
	/**
	* @see https://infra.spec.whatwg.org/#parse-json-bytes-to-a-javascript-value
	* @param {Uint8Array} bytes
	*/
	function parseJSONFromBytes(bytes) {
		return JSON.parse(utf8DecodeBytes(bytes));
	}
	/**
	* @param {string} str
	* @param {boolean} [leading=true]
	* @param {boolean} [trailing=true]
	* @returns {string}
	*
	* @see https://infra.spec.whatwg.org/#strip-leading-and-trailing-ascii-whitespace
	*/
	function removeASCIIWhitespace(str, leading = true, trailing = true) {
		return removeChars(str, leading, trailing, isASCIIWhitespace);
	}
	/**
	* @param {string} str
	* @param {boolean} leading
	* @param {boolean} trailing
	* @param {(charCode: number) => boolean} predicate
	* @returns {string}
	*/
	function removeChars(str, leading, trailing, predicate) {
		let lead = 0;
		let trail = str.length - 1;
		if (leading) while (lead < str.length && predicate(str.charCodeAt(lead))) lead++;
		if (trailing) while (trail > 0 && predicate(str.charCodeAt(trail))) trail--;
		return lead === 0 && trail === str.length - 1 ? str : str.slice(lead, trail + 1);
	}
	function serializeJavascriptValueToJSONString(value) {
		const result = JSON.stringify(value);
		if (result === void 0) throw new TypeError("Value is not JSON serializable");
		assert$29(typeof result === "string");
		return result;
	}
	module.exports = {
		collectASequenceOfCodePoints,
		collectASequenceOfCodePointsFast,
		forgivingBase64,
		isASCIIWhitespace,
		isomorphicDecode,
		isomorphicEncode,
		parseJSONFromBytes,
		removeASCIIWhitespace,
		removeChars,
		serializeJavascriptValueToJSONString
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/web/fetch/data-url.js
var require_data_url = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const assert$28 = __require("node:assert");
	const { forgivingBase64, collectASequenceOfCodePoints, collectASequenceOfCodePointsFast, isomorphicDecode, removeASCIIWhitespace, removeChars } = require_infra();
	const encoder = new TextEncoder();
	/**
	* @see https://mimesniff.spec.whatwg.org/#http-token-code-point
	*/
	const HTTP_TOKEN_CODEPOINTS = /^[-!#$%&'*+.^_|~A-Za-z0-9]+$/u;
	const HTTP_WHITESPACE_REGEX = /[\u000A\u000D\u0009\u0020]/u;
	/**
	* @see https://mimesniff.spec.whatwg.org/#http-quoted-string-token-code-point
	*/
	const HTTP_QUOTED_STRING_TOKENS = /^[\u0009\u0020-\u007E\u0080-\u00FF]+$/u;
	/** @param {URL} dataURL */
	function dataURLProcessor(dataURL) {
		assert$28(dataURL.protocol === "data:");
		let input = URLSerializer(dataURL, true);
		input = input.slice(5);
		const position = { position: 0 };
		let mimeType = collectASequenceOfCodePointsFast(",", input, position);
		const mimeTypeLength = mimeType.length;
		mimeType = removeASCIIWhitespace(mimeType, true, true);
		if (position.position >= input.length) return "failure";
		position.position++;
		let body = stringPercentDecode(input.slice(mimeTypeLength + 1));
		if (/;(?:\u0020*)base64$/iu.test(mimeType)) {
			const stringBody = isomorphicDecode(body);
			body = forgivingBase64(stringBody);
			if (body === "failure") return "failure";
			mimeType = mimeType.slice(0, -6);
			mimeType = mimeType.replace(/(\u0020+)$/u, "");
			mimeType = mimeType.slice(0, -1);
		}
		if (mimeType.startsWith(";")) mimeType = "text/plain" + mimeType;
		let mimeTypeRecord = parseMIMEType(mimeType);
		if (mimeTypeRecord === "failure") mimeTypeRecord = parseMIMEType("text/plain;charset=US-ASCII");
		return {
			mimeType: mimeTypeRecord,
			body
		};
	}
	/**
	* @param {URL} url
	* @param {boolean} excludeFragment
	*/
	function URLSerializer(url, excludeFragment = false) {
		if (!excludeFragment) return url.href;
		const href = url.href;
		const hashLength = url.hash.length;
		const serialized = hashLength === 0 ? href : href.substring(0, href.length - hashLength);
		if (!hashLength && href.endsWith("#")) return serialized.slice(0, -1);
		return serialized;
	}
	/** @param {string} input */
	function stringPercentDecode(input) {
		return percentDecode(encoder.encode(input));
	}
	/**
	* @param {number} byte
	*/
	function isHexCharByte(byte) {
		return byte >= 48 && byte <= 57 || byte >= 65 && byte <= 70 || byte >= 97 && byte <= 102;
	}
	/**
	* @param {number} byte
	*/
	function hexByteToNumber(byte) {
		return byte >= 48 && byte <= 57 ? byte - 48 : (byte & 223) - 55;
	}
	/** @param {Uint8Array} input */
	function percentDecode(input) {
		const length = input.length;
		/** @type {Uint8Array} */
		const output = new Uint8Array(length);
		let j = 0;
		let i = 0;
		while (i < length) {
			const byte = input[i];
			if (byte !== 37) output[j++] = byte;
			else if (byte === 37 && !(isHexCharByte(input[i + 1]) && isHexCharByte(input[i + 2]))) output[j++] = 37;
			else {
				output[j++] = hexByteToNumber(input[i + 1]) << 4 | hexByteToNumber(input[i + 2]);
				i += 2;
			}
			++i;
		}
		return length === j ? output : output.subarray(0, j);
	}
	/** @param {string} input */
	function parseMIMEType(input) {
		input = removeHTTPWhitespace(input, true, true);
		const position = { position: 0 };
		const type = collectASequenceOfCodePointsFast("/", input, position);
		if (type.length === 0 || !HTTP_TOKEN_CODEPOINTS.test(type)) return "failure";
		if (position.position >= input.length) return "failure";
		position.position++;
		let subtype = collectASequenceOfCodePointsFast(";", input, position);
		subtype = removeHTTPWhitespace(subtype, false, true);
		if (subtype.length === 0 || !HTTP_TOKEN_CODEPOINTS.test(subtype)) return "failure";
		const typeLowercase = type.toLowerCase();
		const subtypeLowercase = subtype.toLowerCase();
		const mimeType = {
			type: typeLowercase,
			subtype: subtypeLowercase,
			/** @type {Map<string, string>} */
			parameters: /* @__PURE__ */ new Map(),
			essence: `${typeLowercase}/${subtypeLowercase}`
		};
		while (position.position < input.length) {
			position.position++;
			collectASequenceOfCodePoints((char) => HTTP_WHITESPACE_REGEX.test(char), input, position);
			let parameterName = collectASequenceOfCodePoints((char) => char !== ";" && char !== "=", input, position);
			parameterName = parameterName.toLowerCase();
			if (position.position < input.length) {
				if (input[position.position] === ";") continue;
				position.position++;
			}
			if (position.position >= input.length) break;
			let parameterValue = null;
			if (input[position.position] === "\"") {
				parameterValue = collectAnHTTPQuotedString(input, position, true);
				collectASequenceOfCodePointsFast(";", input, position);
			} else {
				parameterValue = collectASequenceOfCodePointsFast(";", input, position);
				parameterValue = removeHTTPWhitespace(parameterValue, false, true);
				if (parameterValue.length === 0) continue;
			}
			if (parameterName.length !== 0 && HTTP_TOKEN_CODEPOINTS.test(parameterName) && (parameterValue.length === 0 || HTTP_QUOTED_STRING_TOKENS.test(parameterValue)) && !mimeType.parameters.has(parameterName)) mimeType.parameters.set(parameterName, parameterValue);
		}
		return mimeType;
	}
	/**
	* @param {string} input
	* @param {{ position: number }} position
	* @param {boolean} [extractValue=false]
	*/
	function collectAnHTTPQuotedString(input, position, extractValue = false) {
		const positionStart = position.position;
		let value = "";
		assert$28(input[position.position] === "\"");
		position.position++;
		while (true) {
			value += collectASequenceOfCodePoints((char) => char !== "\"" && char !== "\\", input, position);
			if (position.position >= input.length) break;
			const quoteOrBackslash = input[position.position];
			position.position++;
			if (quoteOrBackslash === "\\") {
				if (position.position >= input.length) {
					value += "\\";
					break;
				}
				value += input[position.position];
				position.position++;
			} else {
				assert$28(quoteOrBackslash === "\"");
				break;
			}
		}
		if (extractValue) return value;
		return input.slice(positionStart, position.position);
	}
	/**
	* @see https://mimesniff.spec.whatwg.org/#serialize-a-mime-type
	*/
	function serializeAMimeType(mimeType) {
		assert$28(mimeType !== "failure");
		const { parameters, essence } = mimeType;
		let serialization = essence;
		for (let [name, value] of parameters.entries()) {
			serialization += ";";
			serialization += name;
			serialization += "=";
			if (!HTTP_TOKEN_CODEPOINTS.test(value)) {
				value = value.replace(/[\\"]/gu, "\\$&");
				value = "\"" + value;
				value += "\"";
			}
			serialization += value;
		}
		return serialization;
	}
	/**
	* @see https://fetch.spec.whatwg.org/#http-whitespace
	* @param {number} char
	*/
	function isHTTPWhiteSpace(char) {
		return char === 13 || char === 10 || char === 9 || char === 32;
	}
	/**
	* @see https://fetch.spec.whatwg.org/#http-whitespace
	* @param {string} str
	* @param {boolean} [leading=true]
	* @param {boolean} [trailing=true]
	*/
	function removeHTTPWhitespace(str, leading = true, trailing = true) {
		return removeChars(str, leading, trailing, isHTTPWhiteSpace);
	}
	/**
	* @see https://mimesniff.spec.whatwg.org/#minimize-a-supported-mime-type
	* @param {Exclude<ReturnType<typeof parseMIMEType>, 'failure'>} mimeType
	*/
	function minimizeSupportedMimeType(mimeType) {
		switch (mimeType.essence) {
			case "application/ecmascript":
			case "application/javascript":
			case "application/x-ecmascript":
			case "application/x-javascript":
			case "text/ecmascript":
			case "text/javascript":
			case "text/javascript1.0":
			case "text/javascript1.1":
			case "text/javascript1.2":
			case "text/javascript1.3":
			case "text/javascript1.4":
			case "text/javascript1.5":
			case "text/jscript":
			case "text/livescript":
			case "text/x-ecmascript":
			case "text/x-javascript": return "text/javascript";
			case "application/json":
			case "text/json": return "application/json";
			case "image/svg+xml": return "image/svg+xml";
			case "text/xml":
			case "application/xml": return "application/xml";
		}
		if (mimeType.subtype.endsWith("+json")) return "application/json";
		if (mimeType.subtype.endsWith("+xml")) return "application/xml";
		return "";
	}
	module.exports = {
		dataURLProcessor,
		URLSerializer,
		stringPercentDecode,
		parseMIMEType,
		collectAnHTTPQuotedString,
		serializeAMimeType,
		removeHTTPWhitespace,
		minimizeSupportedMimeType,
		HTTP_TOKEN_CODEPOINTS
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/web/webidl/index.js
var require_webidl = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const assert$27 = __require("node:assert");
	const { types, inspect } = __require("node:util");
	const { markAsUncloneable } = __require("node:worker_threads");
	const UNDEFINED = 1;
	const BOOLEAN = 2;
	const STRING = 3;
	const SYMBOL = 4;
	const NUMBER = 5;
	const BIGINT = 6;
	const NULL = 7;
	const OBJECT = 8;
	const FunctionPrototypeSymbolHasInstance = Function.call.bind(Function.prototype[Symbol.hasInstance]);
	/** @type {import('../../../types/webidl').Webidl} */
	const webidl = {
		converters: {},
		util: {},
		errors: {},
		is: {}
	};
	/**
	* @description Instantiate an error.
	*
	* @param {Object} opts
	* @param {string} opts.header
	* @param {string} opts.message
	* @returns {TypeError}
	*/
	webidl.errors.exception = function(message) {
		return /* @__PURE__ */ new TypeError(`${message.header}: ${message.message}`);
	};
	/**
	* @description Instantiate an error when conversion from one type to another has failed.
	*
	* @param {Object} opts
	* @param {string} opts.prefix
	* @param {string} opts.argument
	* @param {string[]} opts.types
	* @returns {TypeError}
	*/
	webidl.errors.conversionFailed = function(opts) {
		const plural = opts.types.length === 1 ? "" : " one of";
		const message = `${opts.argument} could not be converted to${plural}: ${opts.types.join(", ")}.`;
		return webidl.errors.exception({
			header: opts.prefix,
			message
		});
	};
	/**
	* @description Instantiate an error when an invalid argument is provided
	*
	* @param {Object} context
	* @param {string} context.prefix
	* @param {string} context.value
	* @param {string} context.type
	* @returns {TypeError}
	*/
	webidl.errors.invalidArgument = function(context) {
		return webidl.errors.exception({
			header: context.prefix,
			message: `"${context.value}" is an invalid ${context.type}.`
		});
	};
	webidl.brandCheck = function(V, I) {
		if (!FunctionPrototypeSymbolHasInstance(I, V)) {
			const err = /* @__PURE__ */ new TypeError("Illegal invocation");
			err.code = "ERR_INVALID_THIS";
			throw err;
		}
	};
	webidl.brandCheckMultiple = function(List) {
		const prototypes = List.map((c) => webidl.util.MakeTypeAssertion(c));
		return (V) => {
			if (prototypes.every((typeCheck) => !typeCheck(V))) {
				const err = /* @__PURE__ */ new TypeError("Illegal invocation");
				err.code = "ERR_INVALID_THIS";
				throw err;
			}
		};
	};
	webidl.argumentLengthCheck = function({ length }, min, ctx) {
		if (length < min) throw webidl.errors.exception({
			message: `${min} argument${min !== 1 ? "s" : ""} required, but${length ? " only" : ""} ${length} found.`,
			header: ctx
		});
	};
	webidl.illegalConstructor = function() {
		throw webidl.errors.exception({
			header: "TypeError",
			message: "Illegal constructor"
		});
	};
	webidl.util.MakeTypeAssertion = function(I) {
		return (O) => FunctionPrototypeSymbolHasInstance(I, O);
	};
	webidl.util.Type = function(V) {
		switch (typeof V) {
			case "undefined": return UNDEFINED;
			case "boolean": return BOOLEAN;
			case "string": return STRING;
			case "symbol": return SYMBOL;
			case "number": return NUMBER;
			case "bigint": return BIGINT;
			case "function":
			case "object":
				if (V === null) return NULL;
				return OBJECT;
		}
	};
	webidl.util.Types = {
		UNDEFINED,
		BOOLEAN,
		STRING,
		SYMBOL,
		NUMBER,
		BIGINT,
		NULL,
		OBJECT
	};
	webidl.util.TypeValueToString = function(o) {
		switch (webidl.util.Type(o)) {
			case UNDEFINED: return "Undefined";
			case BOOLEAN: return "Boolean";
			case STRING: return "String";
			case SYMBOL: return "Symbol";
			case NUMBER: return "Number";
			case BIGINT: return "BigInt";
			case NULL: return "Null";
			case OBJECT: return "Object";
		}
	};
	webidl.util.markAsUncloneable = markAsUncloneable;
	webidl.util.ConvertToInt = function(V, bitLength, signedness, flags) {
		let upperBound;
		let lowerBound;
		if (bitLength === 64) {
			upperBound = Math.pow(2, 53) - 1;
			if (signedness === "unsigned") lowerBound = 0;
			else lowerBound = Math.pow(-2, 53) + 1;
		} else if (signedness === "unsigned") {
			lowerBound = 0;
			upperBound = Math.pow(2, bitLength) - 1;
		} else {
			lowerBound = -Math.pow(2, bitLength - 1);
			upperBound = Math.pow(2, bitLength - 1) - 1;
		}
		let x = Number(V);
		if (x === 0) x = 0;
		if (webidl.util.HasFlag(flags, webidl.attributes.EnforceRange)) {
			if (Number.isNaN(x) || x === Number.POSITIVE_INFINITY || x === Number.NEGATIVE_INFINITY) throw webidl.errors.exception({
				header: "Integer conversion",
				message: `Could not convert ${webidl.util.Stringify(V)} to an integer.`
			});
			x = webidl.util.IntegerPart(x);
			if (x < lowerBound || x > upperBound) throw webidl.errors.exception({
				header: "Integer conversion",
				message: `Value must be between ${lowerBound}-${upperBound}, got ${x}.`
			});
			return x;
		}
		if (!Number.isNaN(x) && webidl.util.HasFlag(flags, webidl.attributes.Clamp)) {
			x = Math.min(Math.max(x, lowerBound), upperBound);
			if (Math.floor(x) % 2 === 0) x = Math.floor(x);
			else x = Math.ceil(x);
			return x;
		}
		if (Number.isNaN(x) || x === 0 && Object.is(0, x) || x === Number.POSITIVE_INFINITY || x === Number.NEGATIVE_INFINITY) return 0;
		x = webidl.util.IntegerPart(x);
		x = x % Math.pow(2, bitLength);
		if (signedness === "signed" && x >= Math.pow(2, bitLength - 1)) return x - Math.pow(2, bitLength);
		return x;
	};
	webidl.util.IntegerPart = function(n) {
		const r = Math.floor(Math.abs(n));
		if (n < 0) return -1 * r;
		return r;
	};
	webidl.util.Stringify = function(V) {
		switch (webidl.util.Type(V)) {
			case SYMBOL: return `Symbol(${V.description})`;
			case OBJECT: return inspect(V);
			case STRING: return `"${V}"`;
			case BIGINT: return `${V}n`;
			default: return `${V}`;
		}
	};
	webidl.util.IsResizableArrayBuffer = function(V) {
		if (types.isArrayBuffer(V)) return V.resizable;
		if (types.isSharedArrayBuffer(V)) return V.growable;
		throw webidl.errors.exception({
			header: "IsResizableArrayBuffer",
			message: `"${webidl.util.Stringify(V)}" is not an array buffer.`
		});
	};
	webidl.util.HasFlag = function(flags, attributes) {
		return typeof flags === "number" && (flags & attributes) === attributes;
	};
	webidl.sequenceConverter = function(converter) {
		return (V, prefix, argument, Iterable) => {
			if (webidl.util.Type(V) !== OBJECT) throw webidl.errors.exception({
				header: prefix,
				message: `${argument} (${webidl.util.Stringify(V)}) is not iterable.`
			});
			/** @type {Generator} */
			const method = typeof Iterable === "function" ? Iterable() : V?.[Symbol.iterator]?.();
			const seq = [];
			let index = 0;
			if (method === void 0 || typeof method.next !== "function") throw webidl.errors.exception({
				header: prefix,
				message: `${argument} is not iterable.`
			});
			while (true) {
				const { done, value } = method.next();
				if (done) break;
				seq.push(converter(value, prefix, `${argument}[${index++}]`));
			}
			return seq;
		};
	};
	webidl.recordConverter = function(keyConverter, valueConverter) {
		return (O, prefix, argument) => {
			if (webidl.util.Type(O) !== OBJECT) throw webidl.errors.exception({
				header: prefix,
				message: `${argument} ("${webidl.util.TypeValueToString(O)}") is not an Object.`
			});
			const result = {};
			if (!types.isProxy(O)) {
				const keys = [...Object.getOwnPropertyNames(O), ...Object.getOwnPropertySymbols(O)];
				for (const key of keys) {
					const keyName = webidl.util.Stringify(key);
					const typedKey = keyConverter(key, prefix, `Key ${keyName} in ${argument}`);
					result[typedKey] = valueConverter(O[key], prefix, `${argument}[${keyName}]`);
				}
				return result;
			}
			const keys = Reflect.ownKeys(O);
			for (const key of keys) if (Reflect.getOwnPropertyDescriptor(O, key)?.enumerable) {
				const typedKey = keyConverter(key, prefix, argument);
				result[typedKey] = valueConverter(O[key], prefix, argument);
			}
			return result;
		};
	};
	webidl.interfaceConverter = function(TypeCheck, name) {
		return (V, prefix, argument) => {
			if (!TypeCheck(V)) throw webidl.errors.exception({
				header: prefix,
				message: `Expected ${argument} ("${webidl.util.Stringify(V)}") to be an instance of ${name}.`
			});
			return V;
		};
	};
	webidl.dictionaryConverter = function(converters) {
		converters.sort((a, b) => (a.key > b.key) - (a.key < b.key));
		return (dictionary, prefix, argument) => {
			const dict = {};
			if (dictionary != null && webidl.util.Type(dictionary) !== OBJECT) throw webidl.errors.exception({
				header: prefix,
				message: `Expected ${dictionary} to be one of: Null, Undefined, Object.`
			});
			for (const options of converters) {
				const { key, defaultValue, required, converter } = options;
				if (required === true) {
					if (dictionary == null || !Object.hasOwn(dictionary, key)) throw webidl.errors.exception({
						header: prefix,
						message: `Missing required key "${key}".`
					});
				}
				let value = dictionary?.[key];
				const hasDefault = defaultValue !== void 0;
				if (hasDefault && value === void 0) value = defaultValue();
				if (required || hasDefault || value !== void 0) {
					value = converter(value, prefix, `${argument}.${key}`);
					if (options.allowedValues && !options.allowedValues.includes(value)) throw webidl.errors.exception({
						header: prefix,
						message: `${value} is not an accepted type. Expected one of ${options.allowedValues.join(", ")}.`
					});
					dict[key] = value;
				}
			}
			return dict;
		};
	};
	webidl.nullableConverter = function(converter) {
		return (V, prefix, argument) => {
			if (V === null) return V;
			return converter(V, prefix, argument);
		};
	};
	/**
	* @param {*} value
	* @returns {boolean}
	*/
	webidl.is.USVString = function(value) {
		return typeof value === "string" && value.isWellFormed();
	};
	webidl.is.ReadableStream = webidl.util.MakeTypeAssertion(ReadableStream);
	webidl.is.Blob = webidl.util.MakeTypeAssertion(Blob);
	webidl.is.URLSearchParams = webidl.util.MakeTypeAssertion(URLSearchParams);
	webidl.is.File = webidl.util.MakeTypeAssertion(File);
	webidl.is.URL = webidl.util.MakeTypeAssertion(URL);
	webidl.is.AbortSignal = webidl.util.MakeTypeAssertion(AbortSignal);
	webidl.is.MessagePort = webidl.util.MakeTypeAssertion(MessagePort);
	webidl.is.BufferSource = function(V) {
		return types.isArrayBuffer(V) || ArrayBuffer.isView(V) && types.isArrayBuffer(V.buffer);
	};
	webidl.util.getCopyOfBytesHeldByBufferSource = function(bufferSource) {
		const jsBufferSource = bufferSource;
		let jsArrayBuffer = jsBufferSource;
		let offset = 0;
		let length = 0;
		if (types.isTypedArray(jsBufferSource) || types.isDataView(jsBufferSource)) {
			jsArrayBuffer = jsBufferSource.buffer;
			offset = jsBufferSource.byteOffset;
			length = jsBufferSource.byteLength;
		} else {
			assert$27(types.isAnyArrayBuffer(jsBufferSource));
			length = jsBufferSource.byteLength;
		}
		if (jsArrayBuffer.detached) return /* @__PURE__ */ new Uint8Array(0);
		const bytes = new Uint8Array(length);
		const view = new Uint8Array(jsArrayBuffer, offset, length);
		bytes.set(view);
		return bytes;
	};
	webidl.converters.DOMString = function(V, prefix, argument, flags) {
		if (V === null && webidl.util.HasFlag(flags, webidl.attributes.LegacyNullToEmptyString)) return "";
		if (typeof V === "symbol") throw webidl.errors.exception({
			header: prefix,
			message: `${argument} is a symbol, which cannot be converted to a DOMString.`
		});
		return String(V);
	};
	webidl.converters.ByteString = function(V, prefix, argument) {
		if (typeof V === "symbol") throw webidl.errors.exception({
			header: prefix,
			message: `${argument} is a symbol, which cannot be converted to a ByteString.`
		});
		const x = String(V);
		for (let index = 0; index < x.length; index++) if (x.charCodeAt(index) > 255) throw new TypeError(`Cannot convert argument to a ByteString because the character at index ${index} has a value of ${x.charCodeAt(index)} which is greater than 255.`);
		return x;
	};
	/**
	* @param {unknown} value
	* @returns {string}
	* @see https://webidl.spec.whatwg.org/#es-USVString
	*/
	webidl.converters.USVString = function(value) {
		if (typeof value === "string") return value.toWellFormed();
		return `${value}`.toWellFormed();
	};
	webidl.converters.boolean = function(V) {
		return Boolean(V);
	};
	webidl.converters.any = function(V) {
		return V;
	};
	webidl.converters["long long"] = function(V, prefix, argument) {
		return webidl.util.ConvertToInt(V, 64, "signed", 0, prefix, argument);
	};
	webidl.converters["unsigned long long"] = function(V, prefix, argument) {
		return webidl.util.ConvertToInt(V, 64, "unsigned", 0, prefix, argument);
	};
	webidl.converters["unsigned long"] = function(V, prefix, argument) {
		return webidl.util.ConvertToInt(V, 32, "unsigned", 0, prefix, argument);
	};
	webidl.converters["unsigned short"] = function(V, prefix, argument, flags) {
		return webidl.util.ConvertToInt(V, 16, "unsigned", flags, prefix, argument);
	};
	webidl.converters.ArrayBuffer = function(V, prefix, argument, flags) {
		if (webidl.util.Type(V) !== OBJECT || !types.isArrayBuffer(V)) throw webidl.errors.conversionFailed({
			prefix,
			argument: `${argument} ("${webidl.util.Stringify(V)}")`,
			types: ["ArrayBuffer"]
		});
		if (!webidl.util.HasFlag(flags, webidl.attributes.AllowResizable) && webidl.util.IsResizableArrayBuffer(V)) throw webidl.errors.exception({
			header: prefix,
			message: `${argument} cannot be a resizable ArrayBuffer.`
		});
		return V;
	};
	webidl.converters.SharedArrayBuffer = function(V, prefix, argument, flags) {
		if (webidl.util.Type(V) !== OBJECT || !types.isSharedArrayBuffer(V)) throw webidl.errors.conversionFailed({
			prefix,
			argument: `${argument} ("${webidl.util.Stringify(V)}")`,
			types: ["SharedArrayBuffer"]
		});
		if (!webidl.util.HasFlag(flags, webidl.attributes.AllowResizable) && webidl.util.IsResizableArrayBuffer(V)) throw webidl.errors.exception({
			header: prefix,
			message: `${argument} cannot be a resizable SharedArrayBuffer.`
		});
		return V;
	};
	webidl.converters.TypedArray = function(V, T, prefix, argument, flags) {
		if (webidl.util.Type(V) !== OBJECT || !types.isTypedArray(V) || V.constructor.name !== T.name) throw webidl.errors.conversionFailed({
			prefix,
			argument: `${argument} ("${webidl.util.Stringify(V)}")`,
			types: [T.name]
		});
		if (!webidl.util.HasFlag(flags, webidl.attributes.AllowShared) && types.isSharedArrayBuffer(V.buffer)) throw webidl.errors.exception({
			header: prefix,
			message: `${argument} cannot be a view on a shared array buffer.`
		});
		if (!webidl.util.HasFlag(flags, webidl.attributes.AllowResizable) && webidl.util.IsResizableArrayBuffer(V.buffer)) throw webidl.errors.exception({
			header: prefix,
			message: `${argument} cannot be a view on a resizable array buffer.`
		});
		return V;
	};
	webidl.converters.DataView = function(V, prefix, argument, flags) {
		if (webidl.util.Type(V) !== OBJECT || !types.isDataView(V)) throw webidl.errors.conversionFailed({
			prefix,
			argument: `${argument} ("${webidl.util.Stringify(V)}")`,
			types: ["DataView"]
		});
		if (!webidl.util.HasFlag(flags, webidl.attributes.AllowShared) && types.isSharedArrayBuffer(V.buffer)) throw webidl.errors.exception({
			header: prefix,
			message: `${argument} cannot be a view on a shared array buffer.`
		});
		if (!webidl.util.HasFlag(flags, webidl.attributes.AllowResizable) && webidl.util.IsResizableArrayBuffer(V.buffer)) throw webidl.errors.exception({
			header: prefix,
			message: `${argument} cannot be a view on a resizable array buffer.`
		});
		return V;
	};
	webidl.converters.ArrayBufferView = function(V, prefix, argument, flags) {
		if (webidl.util.Type(V) !== OBJECT || !types.isArrayBufferView(V)) throw webidl.errors.conversionFailed({
			prefix,
			argument: `${argument} ("${webidl.util.Stringify(V)}")`,
			types: ["ArrayBufferView"]
		});
		if (!webidl.util.HasFlag(flags, webidl.attributes.AllowShared) && types.isSharedArrayBuffer(V.buffer)) throw webidl.errors.exception({
			header: prefix,
			message: `${argument} cannot be a view on a shared array buffer.`
		});
		if (!webidl.util.HasFlag(flags, webidl.attributes.AllowResizable) && webidl.util.IsResizableArrayBuffer(V.buffer)) throw webidl.errors.exception({
			header: prefix,
			message: `${argument} cannot be a view on a resizable array buffer.`
		});
		return V;
	};
	webidl.converters.BufferSource = function(V, prefix, argument, flags) {
		if (types.isArrayBuffer(V)) return webidl.converters.ArrayBuffer(V, prefix, argument, flags);
		if (types.isArrayBufferView(V)) {
			flags &= ~webidl.attributes.AllowShared;
			return webidl.converters.ArrayBufferView(V, prefix, argument, flags);
		}
		if (types.isSharedArrayBuffer(V)) throw webidl.errors.exception({
			header: prefix,
			message: `${argument} cannot be a SharedArrayBuffer.`
		});
		throw webidl.errors.conversionFailed({
			prefix,
			argument: `${argument} ("${webidl.util.Stringify(V)}")`,
			types: ["ArrayBuffer", "ArrayBufferView"]
		});
	};
	webidl.converters.AllowSharedBufferSource = function(V, prefix, argument, flags) {
		if (types.isArrayBuffer(V)) return webidl.converters.ArrayBuffer(V, prefix, argument, flags);
		if (types.isSharedArrayBuffer(V)) return webidl.converters.SharedArrayBuffer(V, prefix, argument, flags);
		if (types.isArrayBufferView(V)) {
			flags |= webidl.attributes.AllowShared;
			return webidl.converters.ArrayBufferView(V, prefix, argument, flags);
		}
		throw webidl.errors.conversionFailed({
			prefix,
			argument: `${argument} ("${webidl.util.Stringify(V)}")`,
			types: [
				"ArrayBuffer",
				"SharedArrayBuffer",
				"ArrayBufferView"
			]
		});
	};
	webidl.converters["sequence<ByteString>"] = webidl.sequenceConverter(webidl.converters.ByteString);
	webidl.converters["sequence<sequence<ByteString>>"] = webidl.sequenceConverter(webidl.converters["sequence<ByteString>"]);
	webidl.converters["record<ByteString, ByteString>"] = webidl.recordConverter(webidl.converters.ByteString, webidl.converters.ByteString);
	webidl.converters.Blob = webidl.interfaceConverter(webidl.is.Blob, "Blob");
	webidl.converters.AbortSignal = webidl.interfaceConverter(webidl.is.AbortSignal, "AbortSignal");
	/**
	* [LegacyTreatNonObjectAsNull]
	* callback EventHandlerNonNull = any (Event event);
	* typedef EventHandlerNonNull? EventHandler;
	* @param {*} V
	*/
	webidl.converters.EventHandlerNonNull = function(V) {
		if (webidl.util.Type(V) !== OBJECT) return null;
		if (typeof V === "function") return V;
		return () => {};
	};
	webidl.attributes = {
		Clamp: 1,
		EnforceRange: 2,
		AllowShared: 4,
		AllowResizable: 8,
		LegacyNullToEmptyString: 16
	};
	module.exports = { webidl };
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/web/fetch/util.js
var require_util$4 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { Transform: Transform$2 } = __require("node:stream");
	const zlib$1 = __require("node:zlib");
	const { redirectStatusSet, referrerPolicyTokens, badPortsSet } = require_constants$2();
	const { getGlobalOrigin } = require_global$1();
	const { collectAnHTTPQuotedString, parseMIMEType } = require_data_url();
	const { performance: performance$1 } = __require("node:perf_hooks");
	const { ReadableStreamFrom, isValidHTTPToken, normalizedMethodRecordsBase } = require_util$5();
	const assert$26 = __require("node:assert");
	const { isUint8Array: isUint8Array$1 } = __require("node:util/types");
	const { webidl } = require_webidl();
	const { isomorphicEncode, collectASequenceOfCodePoints, removeChars } = require_infra();
	function responseURL(response) {
		const urlList = response.urlList;
		const length = urlList.length;
		return length === 0 ? null : urlList[length - 1].toString();
	}
	function responseLocationURL(response, requestFragment) {
		if (!redirectStatusSet.has(response.status)) return null;
		let location = response.headersList.get("location", true);
		if (location !== null && isValidHeaderValue(location)) {
			if (!isValidEncodedURL(location)) location = normalizeBinaryStringToUtf8(location);
			location = new URL(location, responseURL(response));
		}
		if (location && !location.hash) location.hash = requestFragment;
		return location;
	}
	/**
	* @see https://www.rfc-editor.org/rfc/rfc1738#section-2.2
	* @param {string} url
	* @returns {boolean}
	*/
	function isValidEncodedURL(url) {
		for (let i = 0; i < url.length; ++i) {
			const code = url.charCodeAt(i);
			if (code > 126 || code < 32) return false;
		}
		return true;
	}
	/**
	* If string contains non-ASCII characters, assumes it's UTF-8 encoded and decodes it.
	* Since UTF-8 is a superset of ASCII, this will work for ASCII strings as well.
	* @param {string} value
	* @returns {string}
	*/
	function normalizeBinaryStringToUtf8(value) {
		return Buffer.from(value, "binary").toString("utf8");
	}
	/** @returns {URL} */
	function requestCurrentURL(request) {
		return request.urlList[request.urlList.length - 1];
	}
	function requestBadPort(request) {
		const url = requestCurrentURL(request);
		if (urlIsHttpHttpsScheme(url) && badPortsSet.has(url.port)) return "blocked";
		return "allowed";
	}
	function isErrorLike(object) {
		return object instanceof Error || object?.constructor?.name === "Error" || object?.constructor?.name === "DOMException";
	}
	function isValidReasonPhrase(statusText) {
		for (let i = 0; i < statusText.length; ++i) {
			const c = statusText.charCodeAt(i);
			if (!(c === 9 || c >= 32 && c <= 126 || c >= 128 && c <= 255)) return false;
		}
		return true;
	}
	/**
	* @see https://fetch.spec.whatwg.org/#header-name
	* @param {string} potentialValue
	*/
	const isValidHeaderName = isValidHTTPToken;
	/**
	* @see https://fetch.spec.whatwg.org/#header-value
	* @param {string} potentialValue
	*/
	function isValidHeaderValue(potentialValue) {
		return (potentialValue[0] === "	" || potentialValue[0] === " " || potentialValue[potentialValue.length - 1] === "	" || potentialValue[potentialValue.length - 1] === " " || potentialValue.includes("\n") || potentialValue.includes("\r") || potentialValue.includes("\0")) === false;
	}
	/**
	* Parse a referrer policy from a Referrer-Policy header
	* @see https://w3c.github.io/webappsec-referrer-policy/#parse-referrer-policy-from-header
	*/
	function parseReferrerPolicy(actualResponse) {
		const policyHeader = (actualResponse.headersList.get("referrer-policy", true) ?? "").split(",");
		let policy = "";
		if (policyHeader.length) for (let i = policyHeader.length; i !== 0; i--) {
			const token = policyHeader[i - 1].trim();
			if (referrerPolicyTokens.has(token)) {
				policy = token;
				break;
			}
		}
		return policy;
	}
	/**
	* Given a request request and a response actualResponse, this algorithm
	* updates request’s referrer policy according to the Referrer-Policy
	* header (if any) in actualResponse.
	* @see https://w3c.github.io/webappsec-referrer-policy/#set-requests-referrer-policy-on-redirect
	* @param {import('./request').Request} request
	* @param {import('./response').Response} actualResponse
	*/
	function setRequestReferrerPolicyOnRedirect(request, actualResponse) {
		const policy = parseReferrerPolicy(actualResponse);
		if (policy !== "") request.referrerPolicy = policy;
	}
	function crossOriginResourcePolicyCheck() {
		return "allowed";
	}
	function corsCheck() {
		return "success";
	}
	function TAOCheck() {
		return "success";
	}
	function appendFetchMetadata(httpRequest) {
		let header = null;
		header = httpRequest.mode;
		httpRequest.headersList.set("sec-fetch-mode", header, true);
	}
	function appendRequestOriginHeader(request) {
		let serializedOrigin = request.origin;
		if (serializedOrigin === "client" || serializedOrigin === void 0) return;
		if (request.responseTainting === "cors" || request.mode === "websocket") request.headersList.append("origin", serializedOrigin, true);
		else if (request.method !== "GET" && request.method !== "HEAD") {
			switch (request.referrerPolicy) {
				case "no-referrer":
					serializedOrigin = null;
					break;
				case "no-referrer-when-downgrade":
				case "strict-origin":
				case "strict-origin-when-cross-origin":
					if (request.origin && urlHasHttpsScheme(request.origin) && !urlHasHttpsScheme(requestCurrentURL(request))) serializedOrigin = null;
					break;
				case "same-origin": if (!sameOrigin(request, requestCurrentURL(request))) serializedOrigin = null;
			}
			request.headersList.append("origin", serializedOrigin, true);
		}
	}
	function coarsenTime(timestamp, crossOriginIsolatedCapability) {
		return timestamp;
	}
	function clampAndCoarsenConnectionTimingInfo(connectionTimingInfo, defaultStartTime, crossOriginIsolatedCapability) {
		if (!connectionTimingInfo?.startTime || connectionTimingInfo.startTime < defaultStartTime) return {
			domainLookupStartTime: defaultStartTime,
			domainLookupEndTime: defaultStartTime,
			connectionStartTime: defaultStartTime,
			connectionEndTime: defaultStartTime,
			secureConnectionStartTime: defaultStartTime,
			ALPNNegotiatedProtocol: connectionTimingInfo?.ALPNNegotiatedProtocol
		};
		return {
			domainLookupStartTime: coarsenTime(connectionTimingInfo.domainLookupStartTime, crossOriginIsolatedCapability),
			domainLookupEndTime: coarsenTime(connectionTimingInfo.domainLookupEndTime, crossOriginIsolatedCapability),
			connectionStartTime: coarsenTime(connectionTimingInfo.connectionStartTime, crossOriginIsolatedCapability),
			connectionEndTime: coarsenTime(connectionTimingInfo.connectionEndTime, crossOriginIsolatedCapability),
			secureConnectionStartTime: coarsenTime(connectionTimingInfo.secureConnectionStartTime, crossOriginIsolatedCapability),
			ALPNNegotiatedProtocol: connectionTimingInfo.ALPNNegotiatedProtocol
		};
	}
	function coarsenedSharedCurrentTime(crossOriginIsolatedCapability) {
		return coarsenTime(performance$1.now(), crossOriginIsolatedCapability);
	}
	function createOpaqueTimingInfo(timingInfo) {
		return {
			startTime: timingInfo.startTime ?? 0,
			redirectStartTime: 0,
			redirectEndTime: 0,
			postRedirectStartTime: timingInfo.startTime ?? 0,
			finalServiceWorkerStartTime: 0,
			finalNetworkResponseStartTime: 0,
			finalNetworkRequestStartTime: 0,
			endTime: 0,
			encodedBodySize: 0,
			decodedBodySize: 0,
			finalConnectionTimingInfo: null
		};
	}
	function makePolicyContainer() {
		return { referrerPolicy: "strict-origin-when-cross-origin" };
	}
	function clonePolicyContainer(policyContainer) {
		return { referrerPolicy: policyContainer.referrerPolicy };
	}
	/**
	* Determine request’s Referrer
	*
	* @see https://w3c.github.io/webappsec-referrer-policy/#determine-requests-referrer
	*/
	function determineRequestsReferrer(request) {
		const policy = request.referrerPolicy;
		assert$26(policy);
		let referrerSource = null;
		if (request.referrer === "client") {
			const globalOrigin = getGlobalOrigin();
			if (!globalOrigin || globalOrigin.origin === "null") return "no-referrer";
			referrerSource = new URL(globalOrigin);
		} else if (webidl.is.URL(request.referrer)) referrerSource = request.referrer;
		let referrerURL = stripURLForReferrer(referrerSource);
		const referrerOrigin = stripURLForReferrer(referrerSource, true);
		if (referrerURL.toString().length > 4096) referrerURL = referrerOrigin;
		switch (policy) {
			case "no-referrer": return "no-referrer";
			case "origin":
				if (referrerOrigin != null) return referrerOrigin;
				return stripURLForReferrer(referrerSource, true);
			case "unsafe-url": return referrerURL;
			case "strict-origin": {
				const currentURL = requestCurrentURL(request);
				if (isURLPotentiallyTrustworthy(referrerURL) && !isURLPotentiallyTrustworthy(currentURL)) return "no-referrer";
				return referrerOrigin;
			}
			case "strict-origin-when-cross-origin": {
				const currentURL = requestCurrentURL(request);
				if (sameOrigin(referrerURL, currentURL)) return referrerURL;
				if (isURLPotentiallyTrustworthy(referrerURL) && !isURLPotentiallyTrustworthy(currentURL)) return "no-referrer";
				return referrerOrigin;
			}
			case "same-origin":
				if (sameOrigin(request, referrerURL)) return referrerURL;
				return "no-referrer";
			case "origin-when-cross-origin":
				if (sameOrigin(request, referrerURL)) return referrerURL;
				return referrerOrigin;
			case "no-referrer-when-downgrade": {
				const currentURL = requestCurrentURL(request);
				if (isURLPotentiallyTrustworthy(referrerURL) && !isURLPotentiallyTrustworthy(currentURL)) return "no-referrer";
				return referrerURL;
			}
		}
	}
	/**
	* Certain portions of URLs must not be included when sending a URL as the
	* value of a `Referer` header: a URLs fragment, username, and password
	* components must be stripped from the URL before it’s sent out. This
	* algorithm accepts a origin-only flag, which defaults to false. If set to
	* true, the algorithm will additionally remove the URL’s path and query
	* components, leaving only the scheme, host, and port.
	*
	* @see https://w3c.github.io/webappsec-referrer-policy/#strip-url
	* @param {URL} url
	* @param {boolean} [originOnly=false]
	*/
	function stripURLForReferrer(url, originOnly = false) {
		assert$26(webidl.is.URL(url));
		url = new URL(url);
		if (urlIsLocal(url)) return "no-referrer";
		url.username = "";
		url.password = "";
		url.hash = "";
		if (originOnly === true) {
			url.pathname = "";
			url.search = "";
		}
		return url;
	}
	const isPotentialleTrustworthyIPv4 = RegExp.prototype.test.bind(/^127\.(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)\.){2}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)$/);
	const isPotentiallyTrustworthyIPv6 = RegExp.prototype.test.bind(/^(?:(?:0{1,4}:){7}|(?:0{1,4}:){1,6}:|::)0{0,3}1$/);
	/**
	* Check if host matches one of the CIDR notations 127.0.0.0/8 or ::1/128.
	*
	* @param {string} origin
	* @returns {boolean}
	*/
	function isOriginIPPotentiallyTrustworthy(origin) {
		if (origin.includes(":")) {
			if (origin[0] === "[" && origin[origin.length - 1] === "]") origin = origin.slice(1, -1);
			return isPotentiallyTrustworthyIPv6(origin);
		}
		return isPotentialleTrustworthyIPv4(origin);
	}
	/**
	* A potentially trustworthy origin is one which a user agent can generally
	* trust as delivering data securely.
	*
	* Return value `true` means `Potentially Trustworthy`.
	* Return value `false` means `Not Trustworthy`.
	*
	* @see https://w3c.github.io/webappsec-secure-contexts/#is-origin-trustworthy
	* @param {string} origin
	* @returns {boolean}
	*/
	function isOriginPotentiallyTrustworthy(origin) {
		if (origin == null || origin === "null") return false;
		origin = new URL(origin);
		if (origin.protocol === "https:" || origin.protocol === "wss:") return true;
		if (isOriginIPPotentiallyTrustworthy(origin.hostname)) return true;
		if (origin.hostname === "localhost" || origin.hostname === "localhost.") return true;
		if (origin.hostname.endsWith(".localhost") || origin.hostname.endsWith(".localhost.")) return true;
		if (origin.protocol === "file:") return true;
		return false;
	}
	/**
	* A potentially trustworthy URL is one which either inherits context from its
	* creator (about:blank, about:srcdoc, data) or one whose origin is a
	* potentially trustworthy origin.
	*
	* Return value `true` means `Potentially Trustworthy`.
	* Return value `false` means `Not Trustworthy`.
	*
	* @see https://www.w3.org/TR/secure-contexts/#is-url-trustworthy
	* @param {URL} url
	* @returns {boolean}
	*/
	function isURLPotentiallyTrustworthy(url) {
		if (!webidl.is.URL(url)) return false;
		if (url.href === "about:blank" || url.href === "about:srcdoc") return true;
		if (url.protocol === "data:") return true;
		if (url.protocol === "blob:") return true;
		return isOriginPotentiallyTrustworthy(url.origin);
	}
	function tryUpgradeRequestToAPotentiallyTrustworthyURL(request) {}
	/**
	* @link {https://html.spec.whatwg.org/multipage/origin.html#same-origin}
	* @param {URL} A
	* @param {URL} B
	*/
	function sameOrigin(A, B) {
		if (A.origin === B.origin && A.origin === "null") return true;
		if (A.protocol === B.protocol && A.hostname === B.hostname && A.port === B.port) return true;
		return false;
	}
	function isAborted(fetchParams) {
		return fetchParams.controller.state === "aborted";
	}
	function isCancelled(fetchParams) {
		return fetchParams.controller.state === "aborted" || fetchParams.controller.state === "terminated";
	}
	/**
	* @see https://fetch.spec.whatwg.org/#concept-method-normalize
	* @param {string} method
	*/
	function normalizeMethod(method) {
		return normalizedMethodRecordsBase[method.toLowerCase()] ?? method;
	}
	const esIteratorPrototype = Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]()));
	/**
	* @see https://webidl.spec.whatwg.org/#dfn-iterator-prototype-object
	* @param {string} name name of the instance
	* @param {((target: any) => any)} kInternalIterator
	* @param {string | number} [keyIndex]
	* @param {string | number} [valueIndex]
	*/
	function createIterator(name, kInternalIterator, keyIndex = 0, valueIndex = 1) {
		class FastIterableIterator {
			/** @type {any} */
			#target;
			/** @type {'key' | 'value' | 'key+value'} */
			#kind;
			/** @type {number} */
			#index;
			/**
			* @see https://webidl.spec.whatwg.org/#dfn-default-iterator-object
			* @param {unknown} target
			* @param {'key' | 'value' | 'key+value'} kind
			*/
			constructor(target, kind) {
				this.#target = target;
				this.#kind = kind;
				this.#index = 0;
			}
			next() {
				if (typeof this !== "object" || this === null || !(#target in this)) throw new TypeError(`'next' called on an object that does not implement interface ${name} Iterator.`);
				const index = this.#index;
				const values = kInternalIterator(this.#target);
				if (index >= values.length) return {
					value: void 0,
					done: true
				};
				const { [keyIndex]: key, [valueIndex]: value } = values[index];
				this.#index = index + 1;
				let result;
				switch (this.#kind) {
					case "key":
						result = key;
						break;
					case "value":
						result = value;
						break;
					case "key+value": result = [key, value];
				}
				return {
					value: result,
					done: false
				};
			}
		}
		delete FastIterableIterator.prototype.constructor;
		Object.setPrototypeOf(FastIterableIterator.prototype, esIteratorPrototype);
		Object.defineProperties(FastIterableIterator.prototype, {
			[Symbol.toStringTag]: {
				writable: false,
				enumerable: false,
				configurable: true,
				value: `${name} Iterator`
			},
			next: {
				writable: true,
				enumerable: true,
				configurable: true
			}
		});
		/**
		* @param {unknown} target
		* @param {'key' | 'value' | 'key+value'} kind
		* @returns {IterableIterator<any>}
		*/
		return function(target, kind) {
			return new FastIterableIterator(target, kind);
		};
	}
	/**
	* @see https://webidl.spec.whatwg.org/#dfn-iterator-prototype-object
	* @param {string} name name of the instance
	* @param {any} object class
	* @param {(target: any) => any} kInternalIterator
	* @param {string | number} [keyIndex]
	* @param {string | number} [valueIndex]
	*/
	function iteratorMixin(name, object, kInternalIterator, keyIndex = 0, valueIndex = 1) {
		const makeIterator = createIterator(name, kInternalIterator, keyIndex, valueIndex);
		const properties = {
			keys: {
				writable: true,
				enumerable: true,
				configurable: true,
				value: function keys() {
					webidl.brandCheck(this, object);
					return makeIterator(this, "key");
				}
			},
			values: {
				writable: true,
				enumerable: true,
				configurable: true,
				value: function values() {
					webidl.brandCheck(this, object);
					return makeIterator(this, "value");
				}
			},
			entries: {
				writable: true,
				enumerable: true,
				configurable: true,
				value: function entries() {
					webidl.brandCheck(this, object);
					return makeIterator(this, "key+value");
				}
			},
			forEach: {
				writable: true,
				enumerable: true,
				configurable: true,
				value: function forEach(callbackfn, thisArg = globalThis) {
					webidl.brandCheck(this, object);
					webidl.argumentLengthCheck(arguments, 1, `${name}.forEach`);
					if (typeof callbackfn !== "function") throw new TypeError(`Failed to execute 'forEach' on '${name}': parameter 1 is not of type 'Function'.`);
					for (const { 0: key, 1: value } of makeIterator(this, "key+value")) callbackfn.call(thisArg, value, key, this);
				}
			}
		};
		return Object.defineProperties(object.prototype, {
			...properties,
			[Symbol.iterator]: {
				writable: true,
				enumerable: false,
				configurable: true,
				value: properties.entries.value
			}
		});
	}
	/**
	* @param {import('./body').ExtractBodyResult} body
	* @param {(bytes: Uint8Array) => void} processBody
	* @param {(error: Error) => void} processBodyError
	* @returns {void}
	*
	* @see https://fetch.spec.whatwg.org/#body-fully-read
	*/
	function fullyReadBody(body, processBody, processBodyError) {
		const successSteps = processBody;
		const errorSteps = processBodyError;
		try {
			readAllBytes(body.stream.getReader(), successSteps, errorSteps);
		} catch (e) {
			errorSteps(e);
		}
	}
	/**
	* @param {ReadableStreamController<Uint8Array>} controller
	*/
	function readableStreamClose(controller) {
		try {
			controller.close();
			controller.byobRequest?.respond(0);
		} catch (err) {
			if (!err.message.includes("Controller is already closed") && !err.message.includes("ReadableStream is already closed")) throw err;
		}
	}
	/**
	* @see https://streams.spec.whatwg.org/#readablestreamdefaultreader-read-all-bytes
	* @see https://streams.spec.whatwg.org/#read-loop
	* @param {ReadableStream<Uint8Array<ArrayBuffer>>} reader
	* @param {(bytes: Uint8Array) => void} successSteps
	* @param {(error: Error) => void} failureSteps
	* @returns {Promise<void>}
	*/
	async function readAllBytes(reader, successSteps, failureSteps) {
		try {
			const bytes = [];
			let byteLength = 0;
			do {
				const { done, value: chunk } = await reader.read();
				if (done) {
					successSteps(Buffer.concat(bytes, byteLength));
					return;
				}
				if (!isUint8Array$1(chunk)) {
					failureSteps(/* @__PURE__ */ new TypeError("Received non-Uint8Array chunk"));
					return;
				}
				bytes.push(chunk);
				byteLength += chunk.length;
			} while (true);
		} catch (e) {
			failureSteps(e);
		}
	}
	/**
	* @see https://fetch.spec.whatwg.org/#is-local
	* @param {URL} url
	* @returns {boolean}
	*/
	function urlIsLocal(url) {
		assert$26("protocol" in url);
		const protocol = url.protocol;
		return protocol === "about:" || protocol === "blob:" || protocol === "data:";
	}
	/**
	* @param {string|URL} url
	* @returns {boolean}
	*/
	function urlHasHttpsScheme(url) {
		return typeof url === "string" && url[5] === ":" && url[0] === "h" && url[1] === "t" && url[2] === "t" && url[3] === "p" && url[4] === "s" || url.protocol === "https:";
	}
	/**
	* @see https://fetch.spec.whatwg.org/#http-scheme
	* @param {URL} url
	*/
	function urlIsHttpHttpsScheme(url) {
		assert$26("protocol" in url);
		const protocol = url.protocol;
		return protocol === "http:" || protocol === "https:";
	}
	/**
	* @typedef {Object} RangeHeaderValue
	* @property {number|null} rangeStartValue
	* @property {number|null} rangeEndValue
	*/
	/**
	* @see https://fetch.spec.whatwg.org/#simple-range-header-value
	* @param {string} value
	* @param {boolean} allowWhitespace
	* @return {RangeHeaderValue|'failure'}
	*/
	function simpleRangeHeaderValue(value, allowWhitespace) {
		const data = value;
		if (!data.startsWith("bytes")) return "failure";
		const position = { position: 5 };
		if (allowWhitespace) collectASequenceOfCodePoints((char) => char === "	" || char === " ", data, position);
		if (data.charCodeAt(position.position) !== 61) return "failure";
		position.position++;
		if (allowWhitespace) collectASequenceOfCodePoints((char) => char === "	" || char === " ", data, position);
		const rangeStart = collectASequenceOfCodePoints((char) => {
			const code = char.charCodeAt(0);
			return code >= 48 && code <= 57;
		}, data, position);
		const rangeStartValue = rangeStart.length ? Number(rangeStart) : null;
		if (allowWhitespace) collectASequenceOfCodePoints((char) => char === "	" || char === " ", data, position);
		if (data.charCodeAt(position.position) !== 45) return "failure";
		position.position++;
		if (allowWhitespace) collectASequenceOfCodePoints((char) => char === "	" || char === " ", data, position);
		const rangeEnd = collectASequenceOfCodePoints((char) => {
			const code = char.charCodeAt(0);
			return code >= 48 && code <= 57;
		}, data, position);
		const rangeEndValue = rangeEnd.length ? Number(rangeEnd) : null;
		if (position.position < data.length) return "failure";
		if (rangeEndValue === null && rangeStartValue === null) return "failure";
		if (rangeStartValue !== null && rangeEndValue !== null && rangeStartValue > rangeEndValue) return "failure";
		return {
			rangeStartValue,
			rangeEndValue
		};
	}
	/**
	* @see https://fetch.spec.whatwg.org/#build-a-content-range
	* @param {number} rangeStart
	* @param {number} rangeEnd
	* @param {number} fullLength
	*/
	function buildContentRange(rangeStart, rangeEnd, fullLength) {
		let contentRange = "bytes ";
		contentRange += isomorphicEncode(`${rangeStart}`);
		contentRange += "-";
		contentRange += isomorphicEncode(`${rangeEnd}`);
		contentRange += "/";
		contentRange += isomorphicEncode(`${fullLength}`);
		return contentRange;
	}
	var InflateStream = class extends Transform$2 {
		#zlibOptions;
		/** @param {zlib.ZlibOptions} [zlibOptions] */
		constructor(zlibOptions) {
			super();
			this.#zlibOptions = zlibOptions;
		}
		_transform(chunk, encoding, callback) {
			if (!this._inflateStream) {
				if (chunk.length === 0) {
					callback();
					return;
				}
				this._inflateStream = (chunk[0] & 15) === 8 ? zlib$1.createInflate(this.#zlibOptions) : zlib$1.createInflateRaw(this.#zlibOptions);
				this._inflateStream.on("data", this.push.bind(this));
				this._inflateStream.on("end", () => this.push(null));
				this._inflateStream.on("error", (err) => this.destroy(err));
			}
			this._inflateStream.write(chunk, encoding, callback);
		}
		_final(callback) {
			if (this._inflateStream) {
				this._inflateStream.end();
				this._inflateStream = null;
			}
			callback();
		}
	};
	/**
	* @param {zlib.ZlibOptions} [zlibOptions]
	* @returns {InflateStream}
	*/
	function createInflate(zlibOptions) {
		return new InflateStream(zlibOptions);
	}
	/**
	* @see https://fetch.spec.whatwg.org/#concept-header-extract-mime-type
	* @param {import('./headers').HeadersList} headers
	*/
	function extractMimeType(headers) {
		let charset = null;
		let essence = null;
		let mimeType = null;
		const values = getDecodeSplit("content-type", headers);
		if (values === null) return "failure";
		for (const value of values) {
			const temporaryMimeType = parseMIMEType(value);
			if (temporaryMimeType === "failure" || temporaryMimeType.essence === "*/*") continue;
			mimeType = temporaryMimeType;
			if (mimeType.essence !== essence) {
				charset = null;
				if (mimeType.parameters.has("charset")) charset = mimeType.parameters.get("charset");
				essence = mimeType.essence;
			} else if (!mimeType.parameters.has("charset") && charset !== null) mimeType.parameters.set("charset", charset);
		}
		if (mimeType == null) return "failure";
		return mimeType;
	}
	/**
	* @see https://fetch.spec.whatwg.org/#header-value-get-decode-and-split
	* @param {string|null} value
	*/
	function gettingDecodingSplitting(value) {
		const input = value;
		const position = { position: 0 };
		const values = [];
		let temporaryValue = "";
		while (position.position < input.length) {
			temporaryValue += collectASequenceOfCodePoints((char) => char !== "\"" && char !== ",", input, position);
			if (position.position < input.length) {
				if (input.charCodeAt(position.position) === 34) {
					temporaryValue += collectAnHTTPQuotedString(input, position);
					if (position.position < input.length) continue;
				} else {
					assert$26(input.charCodeAt(position.position) === 44);
					position.position++;
				}
			}
			temporaryValue = removeChars(temporaryValue, true, true, (char) => char === 9 || char === 32);
			values.push(temporaryValue);
			temporaryValue = "";
		}
		return values;
	}
	/**
	* @see https://fetch.spec.whatwg.org/#concept-header-list-get-decode-split
	* @param {string} name lowercase header name
	* @param {import('./headers').HeadersList} list
	*/
	function getDecodeSplit(name, list) {
		const value = list.get(name, true);
		if (value === null) return null;
		return gettingDecodingSplitting(value);
	}
	function hasAuthenticationEntry(request) {
		return false;
	}
	/**
	* @see https://url.spec.whatwg.org/#include-credentials
	* @param {URL} url
	*/
	function includesCredentials(url) {
		return !!(url.username || url.password);
	}
	/**
	* @see https://html.spec.whatwg.org/multipage/document-sequences.html#traversable-navigable
	* @param {object|string} navigable
	*/
	function isTraversableNavigable(navigable) {
		return navigable != null && navigable !== "client" && navigable !== "no-traversable";
	}
	var EnvironmentSettingsObjectBase = class {
		get baseUrl() {
			return getGlobalOrigin();
		}
		get origin() {
			return this.baseUrl?.origin;
		}
		policyContainer = makePolicyContainer();
	};
	var EnvironmentSettingsObject = class {
		settingsObject = new EnvironmentSettingsObjectBase();
	};
	module.exports = {
		isAborted,
		isCancelled,
		isValidEncodedURL,
		ReadableStreamFrom,
		tryUpgradeRequestToAPotentiallyTrustworthyURL,
		clampAndCoarsenConnectionTimingInfo,
		coarsenedSharedCurrentTime,
		determineRequestsReferrer,
		makePolicyContainer,
		clonePolicyContainer,
		appendFetchMetadata,
		appendRequestOriginHeader,
		TAOCheck,
		corsCheck,
		crossOriginResourcePolicyCheck,
		createOpaqueTimingInfo,
		setRequestReferrerPolicyOnRedirect,
		isValidHTTPToken,
		requestBadPort,
		requestCurrentURL,
		responseURL,
		responseLocationURL,
		isURLPotentiallyTrustworthy,
		isValidReasonPhrase,
		sameOrigin,
		normalizeMethod,
		iteratorMixin,
		createIterator,
		isValidHeaderName,
		isValidHeaderValue,
		isErrorLike,
		fullyReadBody,
		readableStreamClose,
		urlIsLocal,
		urlHasHttpsScheme,
		urlIsHttpHttpsScheme,
		readAllBytes,
		simpleRangeHeaderValue,
		buildContentRange,
		createInflate,
		extractMimeType,
		getDecodeSplit,
		environmentSettingsObject: new EnvironmentSettingsObject(),
		isOriginIPPotentiallyTrustworthy,
		hasAuthenticationEntry,
		includesCredentials,
		isTraversableNavigable
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/util/runtime-features.js
var require_runtime_features = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	/** @typedef {`node:${string}`} NodeModuleName */
	/** @type {Record<NodeModuleName, () => any>} */
	const lazyLoaders = {
		__proto__: null,
		"node:crypto": () => __require("node:crypto"),
		"node:sqlite": () => __require("node:sqlite")
	};
	/**
	* @param {NodeModuleName} moduleName
	* @returns {boolean}
	*/
	function detectRuntimeFeatureByNodeModule(moduleName) {
		try {
			lazyLoaders[moduleName]();
			return true;
		} catch (err) {
			if (err.code !== "ERR_UNKNOWN_BUILTIN_MODULE" && err.code !== "ERR_NO_CRYPTO") throw err;
			return false;
		}
	}
	const runtimeFeaturesAsNodeModule = ["crypto", "sqlite"];
	/** @typedef {typeof runtimeFeaturesAsNodeModule[number]} RuntimeFeatureByNodeModule */
	/** @typedef {RuntimeFeatureByNodeModule} Feature */
	/**
	* @param {Feature} feature
	* @returns {boolean}
	*/
	function detectRuntimeFeature(feature) {
		if (runtimeFeaturesAsNodeModule.includes(feature)) return detectRuntimeFeatureByNodeModule(`node:${feature}`);
		throw new TypeError(`unknown feature: ${feature}`);
	}
	/**
	* @class
	* @name RuntimeFeatures
	*/
	var RuntimeFeatures = class {
		/** @type {Map<Feature, boolean>} */
		#map = /* @__PURE__ */ new Map();
		/**
		* Clears all cached feature detections.
		*/
		clear() {
			this.#map.clear();
		}
		/**
		* @param {Feature} feature
		* @returns {boolean}
		*/
		has(feature) {
			return this.#map.get(feature) ?? this.#detectRuntimeFeature(feature);
		}
		/**
		* @param {Feature} feature
		* @param {boolean} value
		*/
		set(feature, value) {
			if (runtimeFeaturesAsNodeModule.includes(feature) === false) throw new TypeError(`unknown feature: ${feature}`);
			this.#map.set(feature, value);
		}
		/**
		* @param {Feature} feature
		* @returns {boolean}
		*/
		#detectRuntimeFeature(feature) {
			const result = detectRuntimeFeature(feature);
			this.#map.set(feature, result);
			return result;
		}
	};
	const instance = new RuntimeFeatures();
	module.exports.runtimeFeatures = instance;
	module.exports.default = instance;
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/web/fetch/formdata.js
var require_formdata = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { iteratorMixin } = require_util$4();
	const { kEnumerableProperty } = require_util$5();
	const { webidl } = require_webidl();
	const nodeUtil$2 = __require("node:util");
	const { runtimeFeatures } = require_runtime_features();
	const random = runtimeFeatures.has("crypto") ? __require("node:crypto").randomInt : (max) => Math.floor(Math.random() * max);
	var FormData = class FormData {
		#state = [];
		#boundary = null;
		constructor(form = void 0) {
			webidl.util.markAsUncloneable(this);
			if (form !== void 0) throw webidl.errors.conversionFailed({
				prefix: "FormData constructor",
				argument: "Argument 1",
				types: ["undefined"]
			});
		}
		append(name, value, filename = void 0) {
			webidl.brandCheck(this, FormData);
			const prefix = "FormData.append";
			webidl.argumentLengthCheck(arguments, 2, prefix);
			name = webidl.converters.USVString(name);
			if (arguments.length === 3 || webidl.is.Blob(value)) {
				value = webidl.converters.Blob(value, prefix, "value");
				if (filename !== void 0) filename = webidl.converters.USVString(filename);
			} else value = webidl.converters.USVString(value);
			const entry = makeEntry(name, value, filename);
			this.#state.push(entry);
		}
		delete(name) {
			webidl.brandCheck(this, FormData);
			webidl.argumentLengthCheck(arguments, 1, "FormData.delete");
			name = webidl.converters.USVString(name);
			this.#state = this.#state.filter((entry) => entry.name !== name);
		}
		get(name) {
			webidl.brandCheck(this, FormData);
			webidl.argumentLengthCheck(arguments, 1, "FormData.get");
			name = webidl.converters.USVString(name);
			const idx = this.#state.findIndex((entry) => entry.name === name);
			if (idx === -1) return null;
			return this.#state[idx].value;
		}
		getAll(name) {
			webidl.brandCheck(this, FormData);
			webidl.argumentLengthCheck(arguments, 1, "FormData.getAll");
			name = webidl.converters.USVString(name);
			return this.#state.filter((entry) => entry.name === name).map((entry) => entry.value);
		}
		has(name) {
			webidl.brandCheck(this, FormData);
			webidl.argumentLengthCheck(arguments, 1, "FormData.has");
			name = webidl.converters.USVString(name);
			return this.#state.findIndex((entry) => entry.name === name) !== -1;
		}
		set(name, value, filename = void 0) {
			webidl.brandCheck(this, FormData);
			const prefix = "FormData.set";
			webidl.argumentLengthCheck(arguments, 2, prefix);
			name = webidl.converters.USVString(name);
			if (arguments.length === 3 || webidl.is.Blob(value)) {
				value = webidl.converters.Blob(value, prefix, "value");
				if (filename !== void 0) filename = webidl.converters.USVString(filename);
			} else value = webidl.converters.USVString(value);
			const entry = makeEntry(name, value, filename);
			const idx = this.#state.findIndex((entry) => entry.name === name);
			if (idx !== -1) this.#state = [
				...this.#state.slice(0, idx),
				entry,
				...this.#state.slice(idx + 1).filter((entry) => entry.name !== name)
			];
			else this.#state.push(entry);
		}
		[nodeUtil$2.inspect.custom](depth, options) {
			const state = this.#state.reduce((a, b) => {
				if (a[b.name]) {
					if (Array.isArray(a[b.name])) a[b.name].push(b.value);
					else a[b.name] = [a[b.name], b.value];
				} else a[b.name] = b.value;
				return a;
			}, { __proto__: null });
			options.depth ??= depth;
			options.colors ??= true;
			const output = nodeUtil$2.formatWithOptions(options, state);
			return `FormData ${output.slice(output.indexOf("]") + 2)}`;
		}
		/**
		* @param {FormData} formData
		*/
		static getFormDataState(formData) {
			return formData.#state;
		}
		/**
		* @param {FormData} formData
		* @param {any[]} newState
		*/
		static setFormDataState(formData, newState) {
			formData.#state = newState;
		}
		/**
		* @param {FormData} formData
		* @returns {string | null}
		*/
		static getFormDataBoundary(formData) {
			const boundary = formData.#boundary;
			if (boundary != null) return boundary;
			return formData.#boundary = `----formdata-undici-0${`${random(1e11)}`.padStart(11, "0")}`;
		}
	};
	const { getFormDataState, setFormDataState, getFormDataBoundary } = FormData;
	Reflect.deleteProperty(FormData, "getFormDataState");
	Reflect.deleteProperty(FormData, "setFormDataState");
	Reflect.deleteProperty(FormData, "getFormDataBoundary");
	iteratorMixin("FormData", FormData, getFormDataState, "name", "value");
	Object.defineProperties(FormData.prototype, {
		append: kEnumerableProperty,
		delete: kEnumerableProperty,
		get: kEnumerableProperty,
		getAll: kEnumerableProperty,
		has: kEnumerableProperty,
		set: kEnumerableProperty,
		[Symbol.toStringTag]: {
			value: "FormData",
			configurable: true
		}
	});
	/**
	* @see https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#create-an-entry
	* @param {string} name
	* @param {string|Blob} value
	* @param {?string} filename
	* @returns
	*/
	function makeEntry(name, value, filename) {
		if (typeof value === "string") {} else {
			if (!webidl.is.File(value)) value = new File([value], "blob", { type: value.type });
			if (filename !== void 0) {
				/** @type {FilePropertyBag} */
				const options = {
					type: value.type,
					lastModified: value.lastModified
				};
				value = new File([value], filename, options);
			}
		}
		return {
			name,
			value
		};
	}
	webidl.is.FormData = webidl.util.MakeTypeAssertion(FormData);
	module.exports = {
		FormData,
		makeEntry,
		setFormDataState,
		getFormDataBoundary
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/web/fetch/formdata-parser.js
var require_formdata_parser = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { bufferToLowerCasedHeaderName } = require_util$5();
	const { HTTP_TOKEN_CODEPOINTS } = require_data_url();
	const { makeEntry } = require_formdata();
	const { webidl } = require_webidl();
	const assert$25 = __require("node:assert");
	const { isomorphicDecode } = require_infra();
	const dd = Buffer.from("--");
	const decoder = new TextDecoder();
	const decoderIgnoreBOM = new TextDecoder("utf-8", { ignoreBOM: true });
	/**
	* @param {string} chars
	*/
	function isAsciiString(chars) {
		for (let i = 0; i < chars.length; ++i) if ((chars.charCodeAt(i) & -128) !== 0) return false;
		return true;
	}
	/**
	* @see https://andreubotella.github.io/multipart-form-data/#multipart-form-data-boundary
	* @param {string} boundary
	*/
	function validateBoundary(boundary) {
		const length = boundary.length;
		if (length < 27 || length > 70) return false;
		for (let i = 0; i < length; ++i) {
			const cp = boundary.charCodeAt(i);
			if (!(cp >= 48 && cp <= 57 || cp >= 65 && cp <= 90 || cp >= 97 && cp <= 122 || cp === 39 || cp === 45 || cp === 95)) return false;
		}
		return true;
	}
	/**
	* @see https://andreubotella.github.io/multipart-form-data/#multipart-form-data-parser
	* @param {Buffer} input
	* @param {ReturnType<import('./data-url')['parseMIMEType']>} mimeType
	*/
	function multipartFormDataParser(input, mimeType) {
		assert$25(mimeType !== "failure" && mimeType.essence === "multipart/form-data");
		const boundaryString = mimeType.parameters.get("boundary");
		if (boundaryString === void 0) throw parsingError("missing boundary in content-type header");
		const boundary = Buffer.from(`--${boundaryString}`, "utf8");
		const entryList = [];
		const position = { position: 0 };
		const firstBoundaryIndex = input.indexOf(boundary);
		if (firstBoundaryIndex === -1) throw parsingError("no boundary found in multipart body");
		position.position = firstBoundaryIndex;
		while (true) {
			if (input.subarray(position.position, position.position + boundary.length).equals(boundary)) position.position += boundary.length;
			else throw parsingError("expected a value starting with -- and the boundary");
			if (bufferStartsWith(input, dd, position)) return entryList;
			if (input[position.position] !== 13 || input[position.position + 1] !== 10) throw parsingError("expected CRLF");
			position.position += 2;
			let { name, filename, contentType, encoding } = parseMultipartFormDataHeaders(input, position);
			position.position += 2;
			let body;
			{
				const boundaryIndex = input.indexOf(boundary.subarray(2), position.position);
				if (boundaryIndex === -1) throw parsingError("expected boundary after body");
				body = input.subarray(position.position, boundaryIndex - 4);
				position.position += body.length;
				if (encoding === "base64") body = Buffer.from(body.toString(), "base64");
			}
			if (input[position.position] !== 13 || input[position.position + 1] !== 10) throw parsingError("expected CRLF");
			else position.position += 2;
			let value;
			if (filename !== null) {
				contentType ??= "text/plain";
				if (!isAsciiString(contentType)) contentType = "";
				value = new File([body], filename, { type: contentType });
			} else value = decoderIgnoreBOM.decode(Buffer.from(body));
			assert$25(webidl.is.USVString(name));
			assert$25(typeof value === "string" && webidl.is.USVString(value) || webidl.is.File(value));
			entryList.push(makeEntry(name, value, filename));
		}
	}
	/**
	* Parses content-disposition attributes (e.g., name="value" or filename*=utf-8''encoded)
	* @param {Buffer} input
	* @param {{ position: number }} position
	* @returns {{ name: string, value: string, extended: boolean } | null}
	*/
	function parseContentDispositionAttribute(input, position) {
		if (input[position.position] === 59) position.position++;
		collectASequenceOfBytes((char) => char === 32 || char === 9, input, position);
		const attributeName = collectASequenceOfBytes((char) => isToken(char) && char !== 61 && char !== 42, input, position);
		if (attributeName.length === 0) return null;
		const attrNameStr = attributeName.toString("ascii").toLowerCase();
		const isExtended = input[position.position] === 42;
		if (isExtended) position.position++;
		if (input[position.position] !== 61) return null;
		position.position++;
		collectASequenceOfBytes((char) => char === 32 || char === 9, input, position);
		let value;
		if (isExtended) {
			const headerValue = collectASequenceOfBytes((char) => char !== 32 && char !== 13 && char !== 10 && char !== 59, input, position);
			if (headerValue[0] !== 117 && headerValue[0] !== 85 || headerValue[1] !== 116 && headerValue[1] !== 84 || headerValue[2] !== 102 && headerValue[2] !== 70 || headerValue[3] !== 45 || headerValue[4] !== 56) throw parsingError("unknown encoding, expected utf-8''");
			value = decodeURIComponent(decoder.decode(headerValue.subarray(7)));
		} else if (input[position.position] === 34) {
			position.position++;
			const quotedValue = collectASequenceOfBytes((char) => char !== 10 && char !== 13 && char !== 34, input, position);
			if (input[position.position] !== 34) throw parsingError("Closing quote not found");
			position.position++;
			value = decoder.decode(quotedValue).replace(/%0A/gi, "\n").replace(/%0D/gi, "\r").replace(/%22/g, "\"");
		} else {
			const tokenValue = collectASequenceOfBytes((char) => isToken(char) && char !== 59, input, position);
			value = decoder.decode(tokenValue);
		}
		return {
			name: attrNameStr,
			value,
			extended: isExtended
		};
	}
	/**
	* @see https://andreubotella.github.io/multipart-form-data/#parse-multipart-form-data-headers
	* @param {Buffer} input
	* @param {{ position: number }} position
	*/
	function parseMultipartFormDataHeaders(input, position) {
		let name = null;
		let filename = null;
		let contentType = null;
		let encoding = null;
		while (true) {
			if (input[position.position] === 13 && input[position.position + 1] === 10) {
				if (name === null) throw parsingError("header name is null");
				return {
					name,
					filename,
					contentType,
					encoding
				};
			}
			let headerName = collectASequenceOfBytes((char) => char !== 10 && char !== 13 && char !== 58, input, position);
			headerName = removeChars(headerName, true, true, (char) => char === 9 || char === 32);
			if (!HTTP_TOKEN_CODEPOINTS.test(headerName.toString())) throw parsingError("header name does not match the field-name token production");
			if (input[position.position] !== 58) throw parsingError("expected :");
			position.position++;
			collectASequenceOfBytes((char) => char === 32 || char === 9, input, position);
			switch (bufferToLowerCasedHeaderName(headerName)) {
				case "content-disposition": {
					name = filename = null;
					let filenameIsExtended = false;
					if (collectASequenceOfBytes((char) => isToken(char), input, position).toString("ascii").toLowerCase() !== "form-data") throw parsingError("expected form-data for content-disposition header");
					while (position.position < input.length && (input[position.position] !== 13 || input[position.position + 1] !== 10)) {
						const attribute = parseContentDispositionAttribute(input, position);
						if (!attribute) break;
						if (attribute.name === "name") name = attribute.value;
						else if (attribute.name === "filename") {
							if (attribute.extended) {
								filename = attribute.value;
								filenameIsExtended = true;
							} else if (!filenameIsExtended) filename = attribute.value;
						}
					}
					if (name === null) throw parsingError("name attribute is required in content-disposition header");
					break;
				}
				case "content-type": {
					let headerValue = collectASequenceOfBytes((char) => char !== 10 && char !== 13, input, position);
					headerValue = removeChars(headerValue, false, true, (char) => char === 9 || char === 32);
					contentType = isomorphicDecode(headerValue);
					break;
				}
				case "content-transfer-encoding": {
					let headerValue = collectASequenceOfBytes((char) => char !== 10 && char !== 13, input, position);
					headerValue = removeChars(headerValue, false, true, (char) => char === 9 || char === 32);
					encoding = isomorphicDecode(headerValue);
					break;
				}
				default: collectASequenceOfBytes((char) => char !== 10 && char !== 13, input, position);
			}
			if (input[position.position] !== 13 || input[position.position + 1] !== 10) throw parsingError("expected CRLF");
			else position.position += 2;
		}
	}
	/**
	* @param {(char: number) => boolean} condition
	* @param {Buffer} input
	* @param {{ position: number }} position
	*/
	function collectASequenceOfBytes(condition, input, position) {
		let start = position.position;
		while (start < input.length && condition(input[start])) ++start;
		return input.subarray(position.position, position.position = start);
	}
	/**
	* @param {Buffer} buf
	* @param {boolean} leading
	* @param {boolean} trailing
	* @param {(charCode: number) => boolean} predicate
	* @returns {Buffer}
	*/
	function removeChars(buf, leading, trailing, predicate) {
		let lead = 0;
		let trail = buf.length - 1;
		if (leading) while (lead < buf.length && predicate(buf[lead])) lead++;
		if (trailing) while (trail > 0 && predicate(buf[trail])) trail--;
		return lead === 0 && trail === buf.length - 1 ? buf : buf.subarray(lead, trail + 1);
	}
	/**
	* Checks if {@param buffer} starts with {@param start}
	* @param {Buffer} buffer
	* @param {Buffer} start
	* @param {{ position: number }} position
	*/
	function bufferStartsWith(buffer, start, position) {
		if (buffer.length < start.length) return false;
		for (let i = 0; i < start.length; i++) if (start[i] !== buffer[position.position + i]) return false;
		return true;
	}
	function parsingError(cause) {
		return new TypeError("Failed to parse body as FormData.", { cause: new TypeError(cause) });
	}
	/**
	* CTL            = <any US-ASCII control character
	*                  (octets 0 - 31) and DEL (127)>
	* @param {number} char
	*/
	function isCTL(char) {
		return char <= 31 || char === 127;
	}
	/**
	* tspecials :=  "(" / ")" / "<" / ">" / "@" /
	*                "," / ";" / ":" / "\" / <">
	*                "/" / "[" / "]" / "?" / "="
	*                ; Must be in quoted-string,
	*                ; to use within parameter values
	* @param {number} char
	*/
	function isTSpecial(char) {
		return char === 40 || char === 41 || char === 60 || char === 62 || char === 64 || char === 44 || char === 59 || char === 58 || char === 92 || char === 34 || char === 47 || char === 91 || char === 93 || char === 63 || char === 61;
	}
	/**
	* token := 1*<any (US-ASCII) CHAR except SPACE, CTLs,
	*          or tspecials>
	* @param {number} char
	*/
	function isToken(char) {
		return char <= 127 && char !== 32 && char !== 9 && !isCTL(char) && !isTSpecial(char);
	}
	module.exports = {
		multipartFormDataParser,
		validateBoundary
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/web/fetch/body.js
var require_body = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const util = require_util$5();
	const { ReadableStreamFrom, readableStreamClose, fullyReadBody, extractMimeType } = require_util$4();
	const { FormData, setFormDataState, getFormDataBoundary } = require_formdata();
	const { webidl } = require_webidl();
	const assert$24 = __require("node:assert");
	const { isErrored: isErrored$1, isDisturbed } = __require("node:stream");
	const { isUint8Array } = __require("node:util/types");
	const { serializeAMimeType } = require_data_url();
	const { multipartFormDataParser } = require_formdata_parser();
	const { parseJSONFromBytes } = require_infra();
	const { utf8DecodeBytes } = require_encoding();
	const { ReadableStreamTee } = __require("node:stream/web");
	const textEncoder = new TextEncoder();
	function noop() {}
	const streamRegistry = new FinalizationRegistry((weakRef) => {
		const stream = weakRef.deref();
		if (stream && !stream.locked && !isDisturbed(stream) && !isErrored$1(stream)) stream.cancel("Response object has been garbage collected").catch(noop);
	});
	/**
	* Extract a body with type from a byte sequence or BodyInit object
	*
	* @param {import('../../../types').BodyInit} object - The BodyInit object to extract from
	* @param {boolean} [keepalive=false] - If true, indicates that the body
	* @returns {[{stream: ReadableStream, source: any, length: number | null}, string | null]} - Returns a tuple containing the body and its type
	*
	* @see https://fetch.spec.whatwg.org/#concept-bodyinit-extract
	*/
	function extractBody(object, keepalive = false) {
		let stream = null;
		let controller = null;
		if (webidl.is.ReadableStream(object)) stream = object;
		else if (webidl.is.Blob(object)) stream = object.stream();
		else stream = new ReadableStream({
			pull() {},
			start(c) {
				controller = c;
			},
			cancel() {},
			type: "bytes"
		});
		assert$24(webidl.is.ReadableStream(stream));
		let action = null;
		let source = null;
		let length = null;
		let type = null;
		if (typeof object === "string") {
			source = object;
			type = "text/plain;charset=UTF-8";
		} else if (webidl.is.URLSearchParams(object)) {
			source = object.toString();
			type = "application/x-www-form-urlencoded;charset=UTF-8";
		} else if (webidl.is.BufferSource(object)) source = webidl.util.getCopyOfBytesHeldByBufferSource(object);
		else if (webidl.is.FormData(object)) {
			const boundary = getFormDataBoundary(object);
			const prefix = `--${boundary}\r\nContent-Disposition: form-data`;
			/*! formdata-polyfill. MIT License. Jimmy Wärting <https://jimmy.warting.se/opensource> */
			const formdataEscape = (str) => str.replace(/\n/g, "%0A").replace(/\r/g, "%0D").replace(/"/g, "%22");
			const normalizeLinefeeds = (value) => value.replace(/\r?\n|\r/g, "\r\n");
			const blobParts = [];
			const rn = new Uint8Array([13, 10]);
			length = 0;
			let hasUnknownSizeValue = false;
			for (const [name, value] of object) if (typeof value === "string") {
				const chunk = textEncoder.encode(prefix + `; name="${formdataEscape(normalizeLinefeeds(name))}"\r\n\r\n${normalizeLinefeeds(value)}\r\n`);
				blobParts.push(chunk);
				length += chunk.byteLength;
			} else {
				const chunk = textEncoder.encode(`${prefix}; name="${formdataEscape(normalizeLinefeeds(name))}"` + (value.name ? `; filename="${formdataEscape(value.name)}"` : "") + `\r
Content-Type: ${value.type || "application/octet-stream"}\r\n\r\n`);
				blobParts.push(chunk, value, rn);
				if (typeof value.size === "number") length += chunk.byteLength + value.size + rn.byteLength;
				else hasUnknownSizeValue = true;
			}
			const chunk = textEncoder.encode(`--${boundary}--\r\n`);
			blobParts.push(chunk);
			length += chunk.byteLength;
			if (hasUnknownSizeValue) length = null;
			source = object;
			action = async function* () {
				for (const part of blobParts) if (part.stream) yield* part.stream();
				else yield part;
			};
			type = `multipart/form-data; boundary=${boundary}`;
		} else if (webidl.is.Blob(object)) {
			source = object;
			length = object.size;
			if (object.type) type = object.type;
		} else if (typeof object[Symbol.asyncIterator] === "function") {
			if (keepalive) throw new TypeError("keepalive");
			if (util.isDisturbed(object) || object.locked) throw new TypeError("Response body object should not be disturbed or locked");
			stream = webidl.is.ReadableStream(object) ? object : ReadableStreamFrom(object);
		}
		if (typeof source === "string" || isUint8Array(source)) action = () => {
			length = typeof source === "string" ? Buffer.byteLength(source) : source.length;
			return source;
		};
		if (action != null) (async () => {
			const result = action();
			const iterator = result?.[Symbol.asyncIterator]?.();
			if (iterator) for await (const bytes of iterator) {
				if (isErrored$1(stream)) break;
				if (bytes.length) controller.enqueue(new Uint8Array(bytes));
			}
			else if (result?.length && !isErrored$1(stream)) controller.enqueue(typeof result === "string" ? textEncoder.encode(result) : new Uint8Array(result));
			queueMicrotask(() => readableStreamClose(controller));
		})();
		return [{
			stream,
			source,
			length
		}, type];
	}
	/**
	* @typedef {object} ExtractBodyResult
	* @property {ReadableStream<Uint8Array<ArrayBuffer>>} stream - The ReadableStream containing the body data
	* @property {any} source - The original source of the body data
	* @property {number | null} length - The length of the body data, or null
	*/
	/**
	* Safely extract a body with type from a byte sequence or BodyInit object.
	*
	* @param {import('../../../types').BodyInit} object - The BodyInit object to extract from
	* @param {boolean} [keepalive=false] - If true, indicates that the body
	* @returns {[ExtractBodyResult, string | null]} - Returns a tuple containing the body and its type
	*
	* @see https://fetch.spec.whatwg.org/#bodyinit-safely-extract
	*/
	function safelyExtractBody(object, keepalive = false) {
		if (webidl.is.ReadableStream(object)) {
			assert$24(!util.isDisturbed(object), "The body has already been consumed.");
			assert$24(!object.locked, "The stream is locked.");
		}
		return extractBody(object, keepalive);
	}
	function cloneBody(body) {
		const { 0: out1, 1: out2 } = ReadableStreamTee?.(body.stream, true) ?? body.stream.tee();
		body.stream = out1;
		return {
			stream: out2,
			length: body.length,
			source: body.source
		};
	}
	function bodyMixinMethods(instance, getInternalState) {
		return {
			blob() {
				return consumeBody(this, (bytes) => {
					let mimeType = bodyMimeType(getInternalState(this));
					if (mimeType === null) mimeType = "";
					else if (mimeType) mimeType = serializeAMimeType(mimeType);
					return new Blob([bytes], { type: mimeType });
				}, instance, getInternalState);
			},
			arrayBuffer() {
				return consumeBody(this, (bytes) => {
					return new Uint8Array(bytes).buffer;
				}, instance, getInternalState);
			},
			text() {
				return consumeBody(this, utf8DecodeBytes, instance, getInternalState);
			},
			json() {
				return consumeBody(this, parseJSONFromBytes, instance, getInternalState);
			},
			formData() {
				return consumeBody(this, (value) => {
					const mimeType = bodyMimeType(getInternalState(this));
					if (mimeType !== null) switch (mimeType.essence) {
						case "multipart/form-data": {
							const parsed = multipartFormDataParser(value, mimeType);
							const fd = new FormData();
							setFormDataState(fd, parsed);
							return fd;
						}
						case "application/x-www-form-urlencoded": {
							const entries = new URLSearchParams(value.toString());
							const fd = new FormData();
							for (const [name, value] of entries) fd.append(name, value);
							return fd;
						}
					}
					throw new TypeError("Content-Type was not one of \"multipart/form-data\" or \"application/x-www-form-urlencoded\".");
				}, instance, getInternalState);
			},
			bytes() {
				return consumeBody(this, (bytes) => {
					return new Uint8Array(bytes);
				}, instance, getInternalState);
			},
			textStream() {
				const this_ = getInternalState(this);
				if (bodyUnusable(this_)) throw new TypeError("Body is unusable: Body has already been read");
				if (this_.body == null) {
					/** @type {ReadableStreamDefaultController<any>} */
					let controller;
					const emptyStream = new ReadableStream({
						start: (c) => {
							controller = c;
						},
						pull: () => Promise.resolve(),
						cancel: () => Promise.resolve()
					}, { size: () => 1 });
					controller.close();
					return emptyStream;
				}
				/** @type {ReadableStream} */
				const stream = this_.body.stream;
				const decoder = new TextDecoderStream("UTF-8");
				return stream.pipeThrough(decoder);
			}
		};
	}
	function mixinBody(prototype, getInternalState) {
		Object.assign(prototype.prototype, bodyMixinMethods(prototype, getInternalState));
	}
	/**
	* @see https://fetch.spec.whatwg.org/#concept-body-consume-body
	* @param {any} object internal state
	* @param {(value: unknown) => unknown} convertBytesToJSValue
	* @param {any} instance
	* @param {(target: any) => any} getInternalState
	*/
	function consumeBody(object, convertBytesToJSValue, instance, getInternalState) {
		try {
			webidl.brandCheck(object, instance);
		} catch (e) {
			return Promise.reject(e);
		}
		object = getInternalState(object);
		if (bodyUnusable(object)) return Promise.reject(/* @__PURE__ */ new TypeError("Body is unusable: Body has already been read"));
		const promise = Promise.withResolvers();
		const errorSteps = promise.reject;
		const successSteps = (data) => {
			try {
				promise.resolve(convertBytesToJSValue(data));
			} catch (e) {
				errorSteps(e);
			}
		};
		if (object.body == null) {
			successSteps(Buffer.allocUnsafe(0));
			return promise.promise;
		}
		fullyReadBody(object.body, successSteps, errorSteps);
		return promise.promise;
	}
	/**
	* @see https://fetch.spec.whatwg.org/#body-unusable
	* @param {any} object internal state
	*/
	function bodyUnusable(object) {
		const body = object.body;
		return body != null && (body.stream.locked || util.isDisturbed(body.stream));
	}
	/**
	* @see https://fetch.spec.whatwg.org/#concept-body-mime-type
	* @param {any} requestOrResponse internal state
	*/
	function bodyMimeType(requestOrResponse) {
		/** @type {import('./headers').HeadersList} */
		const headers = requestOrResponse.headersList;
		const mimeType = extractMimeType(headers);
		if (mimeType === "failure") return null;
		return mimeType;
	}
	module.exports = {
		extractBody,
		safelyExtractBody,
		cloneBody,
		mixinBody,
		streamRegistry,
		bodyUnusable
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/dispatcher/client-h1.js
var require_client_h1 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const assert$23 = __require("node:assert");
	const util = require_util$5();
	const { channels } = require_diagnostics();
	const timers = require_timers();
	const { RequestContentLengthMismatchError, ResponseContentLengthMismatchError, RequestAbortedError, InvalidArgumentError, HeadersTimeoutError, HeadersOverflowError, SocketError, InformationalError, BodyTimeoutError, HTTPParserError, ResponseExceededMaxSizeError } = require_errors();
	const { kUrl, kReset, kClient, kParser, kBlocking, kRunning, kPending, kSize, kWriting, kQueue, kNoRef, kKeepAliveDefaultTimeout, kHostHeader, kPendingIdx, kRunningIdx, kError, kPipelining, kSocket, kKeepAliveTimeoutValue, kMaxHeadersSize, kKeepAliveMaxTimeout, kKeepAliveTimeoutThreshold, kHeadersTimeout, kBodyTimeout, kStrictContentLength, kMaxRequests, kCounter, kMaxResponseSize, kOnError, kResume, kHTTPContext, kClosed } = require_symbols();
	const constants = require_constants$3();
	const EMPTY_BUF = Buffer.alloc(0);
	const FastBuffer = Buffer[Symbol.species];
	const removeAllListeners = util.removeAllListeners;
	const kIdleSocketValidation = Symbol("kIdleSocketValidation");
	const kIdleSocketValidationTimeout = Symbol("kIdleSocketValidationTimeout");
	const kSocketUsed = Symbol("kSocketUsed");
	const kTypeOfService = Symbol("kTypeOfService");
	let extractBody;
	function lazyllhttp() {
		const llhttpWasmData = process.env.JEST_WORKER_ID ? require_llhttp_wasm() : void 0;
		let mod;
		let useWasmSIMD = process.arch !== "ppc64";
		if (process.env.UNDICI_NO_WASM_SIMD === "1") useWasmSIMD = false;
		else if (process.env.UNDICI_NO_WASM_SIMD === "0") useWasmSIMD = true;
		if (useWasmSIMD) try {
			mod = new WebAssembly.Module(require_llhttp_simd_wasm());
		} catch {}
		if (!mod) mod = new WebAssembly.Module(llhttpWasmData || require_llhttp_wasm());
		return new WebAssembly.Instance(mod, { env: {
			/**
			* @param {number} p
			* @param {number} at
			* @param {number} len
			* @returns {number}
			*/
			wasm_on_url: (p, at, len) => {
				return 0;
			},
			/**
			* @param {number} p
			* @param {number} at
			* @param {number} len
			* @returns {number}
			*/
			wasm_on_status: (p, at, len) => {
				assert$23(currentParser.ptr === p);
				const start = at - currentBufferPtr + currentBufferRef.byteOffset;
				return currentParser.onStatus(new FastBuffer(currentBufferRef.buffer, start, len));
			},
			/**
			* @param {number} p
			* @returns {number}
			*/
			wasm_on_message_begin: (p) => {
				assert$23(currentParser.ptr === p);
				return currentParser.onMessageBegin();
			},
			/**
			* @param {number} p
			* @param {number} at
			* @param {number} len
			* @returns {number}
			*/
			wasm_on_header_field: (p, at, len) => {
				assert$23(currentParser.ptr === p);
				const start = at - currentBufferPtr + currentBufferRef.byteOffset;
				return currentParser.onHeaderField(new FastBuffer(currentBufferRef.buffer, start, len));
			},
			/**
			* @param {number} p
			* @param {number} at
			* @param {number} len
			* @returns {number}
			*/
			wasm_on_header_value: (p, at, len) => {
				assert$23(currentParser.ptr === p);
				const start = at - currentBufferPtr + currentBufferRef.byteOffset;
				return currentParser.onHeaderValue(new FastBuffer(currentBufferRef.buffer, start, len));
			},
			/**
			* @param {number} p
			* @param {number} statusCode
			* @param {0|1} upgrade
			* @param {0|1} shouldKeepAlive
			* @returns {number}
			*/
			wasm_on_headers_complete: (p, statusCode, upgrade, shouldKeepAlive) => {
				assert$23(currentParser.ptr === p);
				return currentParser.onHeadersComplete(statusCode, upgrade === 1, shouldKeepAlive === 1);
			},
			/**
			* @param {number} p
			* @param {number} at
			* @param {number} len
			* @returns {number}
			*/
			wasm_on_body: (p, at, len) => {
				assert$23(currentParser.ptr === p);
				const start = at - currentBufferPtr + currentBufferRef.byteOffset;
				return currentParser.onBody(new FastBuffer(currentBufferRef.buffer, start, len));
			},
			/**
			* @param {number} p
			* @returns {number}
			*/
			wasm_on_message_complete: (p) => {
				assert$23(currentParser.ptr === p);
				return currentParser.onMessageComplete();
			}
		} });
	}
	let llhttpInstance = null;
	/**
	* @type {Parser|null}
	*/
	let currentParser = null;
	let currentBufferRef = null;
	/**
	* @type {number}
	*/
	let currentBufferSize = 0;
	let currentBufferPtr = null;
	let currentBuffer = null;
	const USE_FAST_TIMER = 1;
	const TIMEOUT_HEADERS = 3;
	const TIMEOUT_BODY = 5;
	const TIMEOUT_KEEP_ALIVE = 8;
	var Parser = class {
		/**
		* @param {import('./client.js')} client
		* @param {import('net').Socket} socket
		* @param {*} llhttp
		*/
		constructor(client, socket, { exports: exports$1 }) {
			this.llhttp = exports$1;
			this.ptr = this.llhttp.llhttp_alloc(constants.TYPE.RESPONSE);
			this.client = client;
			/**
			* @type {import('net').Socket}
			*/
			this.socket = socket;
			this.timeout = null;
			this.timeoutWeakRef = new WeakRef(this);
			this.timeoutValue = null;
			this.timeoutType = null;
			this.statusCode = 0;
			this.statusText = "";
			this.upgrade = false;
			this.headers = [];
			this.headersSize = 0;
			this.headersMaxSize = client[kMaxHeadersSize];
			this.shouldKeepAlive = false;
			this.paused = false;
			this.resume = this.resume.bind(this);
			this.bytesRead = 0;
			this.keepAlive = "";
			this.contentLength = -1;
			this.connectionKeepAlive = false;
			this.maxResponseSize = client[kMaxResponseSize];
		}
		setTimeout(delay, type) {
			if (delay !== this.timeoutValue || type & USE_FAST_TIMER ^ this.timeoutType & USE_FAST_TIMER) {
				if (this.timeout) {
					timers.clearTimeout(this.timeout);
					this.timeout = null;
				}
				if (delay) {
					if (type & USE_FAST_TIMER) this.timeout = timers.setFastTimeout(onParserTimeout, delay, this.timeoutWeakRef);
					else {
						this.timeout = setTimeout(onParserTimeout, delay, this.timeoutWeakRef);
						this.timeout?.unref();
					}
				}
				this.timeoutValue = delay;
			} else if (this.timeout) {
				if (this.timeout.refresh) this.timeout.refresh();
			}
			this.timeoutType = type;
		}
		resume() {
			if (this.socket.destroyed || !this.paused) return;
			assert$23(this.ptr != null);
			assert$23(currentParser === null);
			this.llhttp.llhttp_resume(this.ptr);
			assert$23(this.timeoutType === TIMEOUT_BODY);
			if (this.timeout) {
				if (this.timeout.refresh) this.timeout.refresh();
			}
			this.paused = false;
			this.execute(this.socket.read() || EMPTY_BUF);
			this.readMore();
		}
		readMore() {
			while (!this.paused && this.ptr) {
				const chunk = this.socket.read();
				if (chunk === null) break;
				this.execute(chunk);
			}
		}
		/**
		* @param {Buffer} chunk
		*/
		execute(chunk) {
			assert$23(currentParser === null);
			assert$23(this.ptr != null);
			assert$23(!this.paused);
			const { socket, llhttp } = this;
			if (chunk.length > currentBufferSize) {
				if (currentBufferPtr) llhttp.free(currentBufferPtr);
				currentBufferSize = Math.ceil(chunk.length / 4096) * 4096;
				currentBufferPtr = llhttp.malloc(currentBufferSize);
			}
			if (currentBuffer === null || currentBuffer.buffer !== llhttp.memory.buffer || currentBuffer.byteOffset !== currentBufferPtr || currentBuffer.byteLength !== currentBufferSize) currentBuffer = new Uint8Array(llhttp.memory.buffer, currentBufferPtr, currentBufferSize);
			currentBuffer.set(chunk);
			try {
				let ret;
				try {
					currentBufferRef = chunk;
					currentParser = this;
					ret = llhttp.llhttp_execute(this.ptr, currentBufferPtr, chunk.length);
				} finally {
					currentParser = null;
					currentBufferRef = null;
				}
				if (ret !== constants.ERROR.OK) {
					const data = chunk.subarray(llhttp.llhttp_get_error_pos(this.ptr) - currentBufferPtr);
					if (ret === constants.ERROR.PAUSED_UPGRADE) this.onUpgrade(data);
					else if (ret === constants.ERROR.PAUSED) {
						this.paused = true;
						socket.unshift(data);
					} else throw this.createError(ret, data);
				}
			} catch (err) {
				util.destroy(socket, err);
			}
		}
		finish() {
			assert$23(currentParser === null);
			assert$23(this.ptr != null);
			const { llhttp } = this;
			if (this.paused) {
				let data;
				do {
					llhttp.llhttp_resume(this.ptr);
					this.paused = false;
					data = this.socket.read() || EMPTY_BUF;
					this.execute(data);
				} while (this.paused && data.length > 0);
				if (this.paused) {
					llhttp.llhttp_resume(this.ptr);
					this.paused = false;
				}
			}
			let ret;
			try {
				currentParser = this;
				ret = llhttp.llhttp_finish(this.ptr);
			} finally {
				currentParser = null;
			}
			if (ret === constants.ERROR.OK) return null;
			if (ret === constants.ERROR.PAUSED || ret === constants.ERROR.PAUSED_UPGRADE) {
				this.paused = true;
				return null;
			}
			return this.createError(ret, EMPTY_BUF);
		}
		createError(ret, data) {
			const { llhttp, contentLength, bytesRead } = this;
			if (contentLength !== -1 && bytesRead !== contentLength) return new ResponseContentLengthMismatchError();
			const ptr = llhttp.llhttp_get_error_reason(this.ptr);
			let message = "";
			if (ptr) {
				const len = new Uint8Array(llhttp.memory.buffer, ptr).indexOf(0);
				message = "Response does not match the HTTP/1.1 protocol (" + Buffer.from(llhttp.memory.buffer, ptr, len).toString() + ")";
			}
			return new HTTPParserError(message, constants.ERROR[ret], data);
		}
		destroy() {
			assert$23(currentParser === null);
			assert$23(this.ptr != null);
			this.llhttp.llhttp_free(this.ptr);
			this.ptr = null;
			this.timeout && timers.clearTimeout(this.timeout);
			this.timeout = null;
			this.timeoutValue = null;
			this.timeoutType = null;
			this.paused = false;
		}
		/**
		* @param {Buffer} buf
		* @returns {0}
		*/
		onStatus(buf) {
			this.statusText = buf.toString();
			return 0;
		}
		/**
		* @returns {0|-1}
		*/
		onMessageBegin() {
			const { socket, client } = this;
			if (socket.destroyed) return -1;
			if (client[kRunning] === 0) {
				util.destroy(socket, new SocketError("bad response", util.getSocketInfo(socket)));
				return -1;
			}
			const request = client[kQueue][client[kRunningIdx]];
			if (!request) return -1;
			request.onResponseStarted();
			return 0;
		}
		/**
		* @param {Buffer} buf
		* @returns {number}
		*/
		onHeaderField(buf) {
			const len = this.headers.length;
			if ((len & 1) === 0) this.headers.push(buf);
			else this.headers[len - 1] = Buffer.concat([this.headers[len - 1], buf]);
			this.trackHeader(buf.length);
			return 0;
		}
		/**
		* @param {Buffer} buf
		* @returns {number}
		*/
		onHeaderValue(buf) {
			let len = this.headers.length;
			if ((len & 1) === 1) {
				this.headers.push(buf);
				len += 1;
			} else this.headers[len - 1] = Buffer.concat([this.headers[len - 1], buf]);
			const key = this.headers[len - 2];
			if (key.length === 10) {
				const headerName = util.bufferToLowerCasedHeaderName(key);
				if (headerName === "keep-alive") this.keepAlive += buf.toString();
				else if (headerName === "connection") this.connectionKeepAlive = this.headers[len - 1].length === 10 && util.bufferToLowerCasedHeaderName(this.headers[len - 1]) === "keep-alive";
			} else if (key.length === 14 && util.bufferToLowerCasedHeaderName(key) === "content-length") {
				if (this.contentLength === -1) this.contentLength = 0;
				for (let i = 0; i < buf.length; i++) this.contentLength = this.contentLength * 10 + (buf[i] - 48);
			}
			this.trackHeader(buf.length);
			return 0;
		}
		/**
		* @param {number} len
		*/
		trackHeader(len) {
			this.headersSize += len;
			if (this.headersSize >= this.headersMaxSize) util.destroy(this.socket, new HeadersOverflowError());
		}
		/**
		* @param {Buffer} head
		*/
		onUpgrade(head) {
			const { upgrade, client, socket, headers, statusCode } = this;
			assert$23(upgrade);
			assert$23(client[kSocket] === socket);
			assert$23(!socket.destroyed);
			assert$23(!this.paused);
			assert$23((headers.length & 1) === 0);
			const request = client[kQueue][client[kRunningIdx]];
			assert$23(request);
			assert$23(request.upgrade || request.method === "CONNECT");
			this.statusCode = 0;
			this.statusText = "";
			this.shouldKeepAlive = false;
			this.headers = [];
			this.headersSize = 0;
			socket.unshift(head);
			socket[kParser].destroy();
			socket[kParser] = null;
			socket[kClient] = null;
			socket[kError] = null;
			removeAllListeners(socket);
			client[kSocket] = null;
			client[kHTTPContext] = null;
			client[kQueue][client[kRunningIdx]++] = null;
			client.emit("disconnect", client[kUrl], [client], new InformationalError("upgrade"));
			try {
				request.onRequestUpgrade(statusCode, headers, socket);
			} catch (err) {
				util.destroy(socket, err);
			}
			client[kResume]();
		}
		/**
		* @param {number} statusCode
		* @param {boolean} upgrade
		* @param {boolean} shouldKeepAlive
		* @returns {number}
		*/
		onHeadersComplete(statusCode, upgrade, shouldKeepAlive) {
			const { client, socket, headers, statusText } = this;
			if (socket.destroyed) return -1;
			if (client[kRunning] === 0) {
				util.destroy(socket, new SocketError("bad response", util.getSocketInfo(socket)));
				return -1;
			}
			const request = client[kQueue][client[kRunningIdx]];
			if (!request) return -1;
			assert$23(!this.upgrade);
			assert$23(this.statusCode < 200);
			if (statusCode === 100) {
				util.destroy(socket, new SocketError("bad response", util.getSocketInfo(socket)));
				return -1;
			}
			if (upgrade && !request.upgrade) {
				util.destroy(socket, new SocketError("bad upgrade", util.getSocketInfo(socket)));
				return -1;
			}
			assert$23(this.timeoutType === TIMEOUT_HEADERS);
			this.statusCode = statusCode;
			this.shouldKeepAlive = shouldKeepAlive || request.method === "HEAD" && !socket[kReset] && this.connectionKeepAlive;
			if (this.statusCode >= 200) {
				const bodyTimeout = request.bodyTimeout != null ? request.bodyTimeout : client[kBodyTimeout];
				this.setTimeout(bodyTimeout, TIMEOUT_BODY);
			} else if (this.timeout) {
				if (this.timeout.refresh) this.timeout.refresh();
			}
			if (request.method === "CONNECT") {
				assert$23(client[kRunning] === 1);
				this.upgrade = true;
				return 2;
			}
			if (upgrade) {
				assert$23(client[kRunning] === 1);
				this.upgrade = true;
				return 2;
			}
			assert$23((this.headers.length & 1) === 0);
			this.headers = [];
			this.headersSize = 0;
			if (this.shouldKeepAlive && client[kPipelining]) {
				const keepAliveTimeout = this.keepAlive ? util.parseKeepAliveTimeout(this.keepAlive) : null;
				if (keepAliveTimeout != null) {
					const timeout = Math.min(keepAliveTimeout - client[kKeepAliveTimeoutThreshold], client[kKeepAliveMaxTimeout]);
					if (timeout <= 0) socket[kReset] = true;
					else client[kKeepAliveTimeoutValue] = timeout;
				} else client[kKeepAliveTimeoutValue] = client[kKeepAliveDefaultTimeout];
			} else socket[kReset] = true;
			const pause = request.onResponseStart(statusCode, headers, this.resume, statusText) === false;
			if (request.aborted) return -1;
			if (request.method === "HEAD") return 1;
			if (statusCode < 200) return 1;
			if (socket[kBlocking]) {
				socket[kBlocking] = false;
				client[kResume]();
			}
			return pause ? constants.ERROR.PAUSED : 0;
		}
		/**
		* @param {Buffer} buf
		* @returns {number}
		*/
		onBody(buf) {
			const { client, socket, statusCode, maxResponseSize } = this;
			if (socket.destroyed) return -1;
			const request = client[kQueue][client[kRunningIdx]];
			assert$23(request);
			assert$23(this.timeoutType === TIMEOUT_BODY);
			if (this.timeout) {
				if (this.timeout.refresh) this.timeout.refresh();
			}
			assert$23(statusCode >= 200);
			if (maxResponseSize > -1 && this.bytesRead + buf.length > maxResponseSize) {
				util.destroy(socket, new ResponseExceededMaxSizeError());
				return -1;
			}
			this.bytesRead += buf.length;
			if (request.onResponseData(buf) === false) return constants.ERROR.PAUSED;
			return 0;
		}
		/**
		* @returns {number}
		*/
		onMessageComplete() {
			const { client, socket, statusCode, upgrade, headers, contentLength, bytesRead, shouldKeepAlive } = this;
			if (socket.destroyed && (!statusCode || shouldKeepAlive)) return -1;
			if (upgrade) return 0;
			assert$23(statusCode >= 100);
			assert$23((this.headers.length & 1) === 0);
			const request = client[kQueue][client[kRunningIdx]];
			assert$23(request);
			this.statusCode = 0;
			this.statusText = "";
			this.bytesRead = 0;
			this.contentLength = -1;
			this.keepAlive = "";
			this.connectionKeepAlive = false;
			this.headers = [];
			this.headersSize = 0;
			if (statusCode < 200) return 0;
			if (request.method !== "HEAD" && contentLength !== -1 && bytesRead !== contentLength) {
				util.destroy(socket, new ResponseContentLengthMismatchError());
				return -1;
			}
			request.onResponseEnd(headers);
			client[kQueue][client[kRunningIdx]++] = null;
			socket[kSocketUsed] = client[kPending] === 0;
			if (socket[kWriting]) {
				assert$23(client[kRunning] === 0);
				util.destroy(socket, new InformationalError("reset"));
				return constants.ERROR.PAUSED;
			} else if (!shouldKeepAlive) {
				util.destroy(socket, new InformationalError("reset"));
				return constants.ERROR.PAUSED;
			} else if (socket[kReset] && client[kRunning] === 0) {
				util.destroy(socket, new InformationalError("reset"));
				return constants.ERROR.PAUSED;
			} else if (client[kPipelining] == null || client[kPipelining] === 1) setImmediate(client[kResume]);
			else client[kResume]();
			return 0;
		}
	};
	function onParserTimeout(parserWeakRef) {
		const parser = parserWeakRef.deref();
		if (!parser) return;
		const { socket, timeoutType, client, paused } = parser;
		if (timeoutType === TIMEOUT_HEADERS) {
			if (!socket[kWriting] || socket.writableNeedDrain || client[kRunning] > 1) {
				assert$23(!paused, "cannot be paused while waiting for headers");
				util.destroy(socket, new HeadersTimeoutError());
			}
		} else if (timeoutType === TIMEOUT_BODY) {
			if (!paused) util.destroy(socket, new BodyTimeoutError());
		} else if (timeoutType === TIMEOUT_KEEP_ALIVE) {
			assert$23(client[kRunning] === 0 && client[kKeepAliveTimeoutValue]);
			util.destroy(socket, new InformationalError("socket idle timeout"));
		}
	}
	/**
	* @param {import ('./client.js')} client
	* @param {import('net').Socket} socket
	* @returns
	*/
	function connectH1(client, socket) {
		client[kSocket] = socket;
		if (!llhttpInstance) llhttpInstance = lazyllhttp();
		if (socket.errored) throw socket.errored;
		if (socket.destroyed) throw new SocketError("destroyed");
		socket[kNoRef] = false;
		socket[kWriting] = false;
		socket[kReset] = false;
		socket[kBlocking] = false;
		socket[kIdleSocketValidation] = 0;
		socket[kIdleSocketValidationTimeout] = null;
		socket[kSocketUsed] = false;
		socket[kParser] = new Parser(client, socket, llhttpInstance);
		util.addListener(socket, "error", onHttpSocketError);
		util.addListener(socket, "readable", onHttpSocketReadable);
		util.addListener(socket, "end", onHttpSocketEnd);
		util.addListener(socket, "close", onHttpSocketClose);
		socket[kClosed] = false;
		socket.on("close", onSocketClose);
		return {
			version: "h1",
			defaultPipelining: 1,
			write(request) {
				return writeH1(client, request);
			},
			resume() {
				resumeH1(client);
			},
			/**
			* @param {Error|undefined} err
			* @param {() => void} callback
			*/
			destroy(err, callback) {
				if (socket[kClosed]) queueMicrotask(callback);
				else {
					socket.on("close", callback);
					socket.destroy(err);
				}
			},
			/**
			* @returns {boolean}
			*/
			get destroyed() {
				return socket.destroyed;
			},
			/**
			* @param {import('../core/request.js')} request
			* @returns {boolean}
			*/
			busy(request) {
				if (socket[kWriting] || socket[kReset] || socket[kBlocking] || socket[kIdleSocketValidation] === 1) return true;
				if (request) {
					if (client[kRunning] > 0 && !request.idempotent) return true;
					if (client[kRunning] > 0 && (request.upgrade || request.method === "CONNECT")) return true;
					if (client[kRunning] > 0 && util.bodyLength(request.body) !== 0 && (util.isStream(request.body) || util.isAsyncIterable(request.body) || util.isFormDataLike(request.body))) return true;
				}
				return false;
			}
		};
	}
	function onHttpSocketError(err) {
		assert$23(err.code !== "ERR_TLS_CERT_ALTNAME_INVALID");
		const parser = this[kParser];
		if (err.code === "ECONNRESET" && parser.statusCode && !parser.shouldKeepAlive) {
			const parserErr = parser.finish();
			if (parserErr) {
				this[kError] = parserErr;
				this[kClient][kOnError](parserErr);
			}
			return;
		}
		this[kError] = err;
		this[kClient][kOnError](err);
	}
	function onHttpSocketReadable() {
		this[kParser]?.readMore();
	}
	function onHttpSocketEnd() {
		const parser = this[kParser];
		if (parser.statusCode && !parser.shouldKeepAlive) {
			const parserErr = parser.finish();
			if (parserErr) util.destroy(this, parserErr);
			return;
		}
		util.destroy(this, new SocketError("other side closed", util.getSocketInfo(this)));
	}
	function onHttpSocketClose() {
		const parser = this[kParser];
		clearIdleSocketValidation(this);
		if (parser) {
			if (!this[kError] && parser.statusCode && !parser.shouldKeepAlive) this[kError] = parser.finish() || this[kError];
			this[kParser].destroy();
			this[kParser] = null;
		}
		const err = this[kError] || new SocketError("closed", util.getSocketInfo(this));
		const client = this[kClient];
		client[kSocket] = null;
		client[kHTTPContext] = null;
		if (client.destroyed) {
			assert$23(client[kPending] === 0);
			const requests = client[kQueue].splice(client[kRunningIdx]);
			for (let i = 0; i < requests.length; i++) {
				const request = requests[i];
				util.errorRequest(client, request, err);
			}
		} else if (client[kRunning] > 0 && err.code !== "UND_ERR_INFO") {
			const request = client[kQueue][client[kRunningIdx]];
			client[kQueue][client[kRunningIdx]++] = null;
			util.errorRequest(client, request, err);
		}
		client[kPendingIdx] = client[kRunningIdx];
		assert$23(client[kRunning] === 0);
		client.emit("disconnect", client[kUrl], [client], err);
		client[kResume]();
	}
	function onSocketClose() {
		this[kClosed] = true;
	}
	function clearIdleSocketValidation(socket) {
		if (socket[kIdleSocketValidationTimeout]) {
			clearImmediate(socket[kIdleSocketValidationTimeout]);
			socket[kIdleSocketValidationTimeout] = null;
		}
		socket[kIdleSocketValidation] = 0;
	}
	function scheduleIdleSocketValidation(client, socket) {
		socket[kIdleSocketValidation] = 1;
		socket[kIdleSocketValidationTimeout] = setImmediate(() => {
			socket[kIdleSocketValidationTimeout] = null;
			socket[kIdleSocketValidation] = 2;
			if (client[kSocket] === socket && !socket.destroyed) client[kResume]();
		});
		socket[kIdleSocketValidationTimeout].unref?.();
	}
	/**
	* @param {import('./client.js')} client
	*/
	function resumeH1(client) {
		const socket = client[kSocket];
		if (socket && !socket.destroyed) {
			if (client[kSize] === 0) {
				if (!socket[kNoRef] && socket.unref) {
					socket.unref();
					socket[kNoRef] = true;
				}
			} else if (socket[kNoRef] && socket.ref) {
				socket.ref();
				socket[kNoRef] = false;
			}
			if (client[kRunning] === 0 && client[kPending] > 0 && socket[kSocketUsed]) {
				if (socket[kIdleSocketValidation] === 0) {
					scheduleIdleSocketValidation(client, socket);
					socket[kParser].readMore();
					if (socket.destroyed) return;
					return;
				}
				if (socket[kIdleSocketValidation] === 1) {
					socket[kParser].readMore();
					if (socket.destroyed) return;
					return;
				}
			}
			if (client[kRunning] === 0) {
				socket[kParser].readMore();
				if (socket.destroyed) return;
			}
			if (client[kSize] === 0) {
				if (socket[kParser].timeoutType !== TIMEOUT_KEEP_ALIVE) socket[kParser].setTimeout(client[kKeepAliveTimeoutValue], TIMEOUT_KEEP_ALIVE);
			} else if (client[kRunning] > 0 && socket[kParser].statusCode < 200) {
				if (socket[kParser].timeoutType !== TIMEOUT_HEADERS) {
					const request = client[kQueue][client[kRunningIdx]];
					const headersTimeout = request.headersTimeout != null ? request.headersTimeout : client[kHeadersTimeout];
					socket[kParser].setTimeout(headersTimeout, TIMEOUT_HEADERS);
				}
			}
		}
	}
	function shouldSendContentLength(method) {
		return method !== "GET" && method !== "HEAD" && method !== "OPTIONS" && method !== "TRACE" && method !== "CONNECT";
	}
	function setTypeOfService(socket, request) {
		if (typeof socket.setTypeOfService !== "function") return;
		const typeOfService = request.typeOfService;
		if (typeOfService === void 0) return;
		if (socket[kTypeOfService] === typeOfService) return;
		try {
			socket.setTypeOfService(typeOfService);
			socket[kTypeOfService] = typeOfService;
		} catch {}
	}
	/**
	* @param {import('./client.js')} client
	* @param {import('../core/request.js')} request
	* @returns
	*/
	function writeH1(client, request) {
		const { method, path, host, upgrade, blocking, reset } = request;
		let { body, headers, contentLength } = request;
		const expectsPayload = method === "PUT" || method === "POST" || method === "PATCH" || method === "QUERY" || method === "PROPFIND" || method === "PROPPATCH";
		if (util.isFormDataLike(body)) {
			if (!extractBody) extractBody = require_body().extractBody;
			const [bodyStream, contentType] = extractBody(body);
			if (request.contentType == null) headers.push("content-type", contentType);
			body = bodyStream.stream;
			contentLength = bodyStream.length;
		} else if (util.isBlobLike(body) && request.contentType == null) {
			const contentType = body.type;
			if (contentType) {
				const contentTypeValue = `${contentType}`;
				if (!util.isValidHeaderValue(contentTypeValue)) {
					util.errorRequest(client, request, new InvalidArgumentError("invalid content-type header"));
					return false;
				}
				headers.push("content-type", contentTypeValue);
			}
		}
		if (body && typeof body.read === "function") body.read(0);
		const bodyLength = util.bodyLength(body);
		contentLength = bodyLength ?? contentLength;
		if (contentLength === null) contentLength = request.contentLength;
		if (contentLength === 0 && !expectsPayload) contentLength = null;
		if (shouldSendContentLength(method) && contentLength > 0 && request.contentLength !== null && request.contentLength !== contentLength) {
			if (client[kStrictContentLength]) {
				util.errorRequest(client, request, new RequestContentLengthMismatchError());
				return false;
			}
			process.emitWarning(new RequestContentLengthMismatchError());
		}
		const socket = client[kSocket];
		clearIdleSocketValidation(socket);
		/**
		* @param {Error} [err]
		* @returns {void}
		*/
		const abort = (err) => {
			if (request.aborted || request.completed) return;
			util.errorRequest(client, request, err || new RequestAbortedError());
			util.destroy(body);
			util.destroy(socket, new InformationalError("aborted"));
		};
		try {
			request.onRequestStart(abort, null);
		} catch (err) {
			util.errorRequest(client, request, err);
		}
		if (request.aborted) return false;
		if (method === "HEAD") socket[kReset] = true;
		if (upgrade || method === "CONNECT") socket[kReset] = true;
		if (reset != null) socket[kReset] = reset;
		if (client[kMaxRequests] && ++socket[kCounter] >= client[kMaxRequests]) socket[kReset] = true;
		if (blocking) socket[kBlocking] = true;
		setTypeOfService(socket, request);
		let header = `${method} ${path} HTTP/1.1\r\n`;
		if (typeof host === "string") header += `host: ${host}\r\n`;
		else header += client[kHostHeader];
		if (upgrade) header += `connection: upgrade\r\nupgrade: ${upgrade}\r\n`;
		else if (client[kPipelining] && !socket[kReset]) header += "connection: keep-alive\r\n";
		else header += "connection: close\r\n";
		if (Array.isArray(headers)) for (let n = 0; n < headers.length; n += 2) {
			const key = headers[n + 0];
			const val = headers[n + 1];
			if (Array.isArray(val)) for (let i = 0; i < val.length; i++) header += `${key}: ${val[i]}\r\n`;
			else header += `${key}: ${val}\r\n`;
		}
		if (channels.sendHeaders.hasSubscribers) channels.sendHeaders.publish({
			request,
			headers: header,
			socket
		});
		if (!body || bodyLength === 0) writeBuffer(abort, null, client, request, socket, contentLength, header, expectsPayload);
		else if (util.isBuffer(body)) writeBuffer(abort, body, client, request, socket, contentLength, header, expectsPayload);
		else if (util.isBlobLike(body)) {
			if (typeof body.stream === "function") writeIterable(abort, body.stream(), client, request, socket, contentLength, header, expectsPayload);
			else writeBlob(abort, body, client, request, socket, contentLength, header, expectsPayload);
		} else if (util.isStream(body)) writeStream(abort, body, client, request, socket, contentLength, header, expectsPayload);
		else if (util.isIterable(body)) writeIterable(abort, body, client, request, socket, contentLength, header, expectsPayload);
		else assert$23(false);
		return true;
	}
	/**
	* @param {AbortCallback} abort
	* @param {import('stream').Stream} body
	* @param {import('./client.js')} client
	* @param {import('../core/request.js')} request
	* @param {import('net').Socket} socket
	* @param {number} contentLength
	* @param {string} header
	* @param {boolean} expectsPayload
	*/
	function writeStream(abort, body, client, request, socket, contentLength, header, expectsPayload) {
		assert$23(contentLength !== 0 || client[kRunning] === 0, "stream body cannot be pipelined");
		let finished = false;
		const writer = new AsyncWriter({
			abort,
			socket,
			request,
			contentLength,
			client,
			expectsPayload,
			header
		});
		/**
		* @param {Buffer} chunk
		* @returns {void}
		*/
		const onData = function(chunk) {
			if (finished) return;
			try {
				if (!writer.write(chunk) && this.pause) this.pause();
			} catch (err) {
				util.destroy(this, err);
			}
		};
		/**
		* @returns {void}
		*/
		const onDrain = function() {
			if (finished) return;
			if (body.resume) body.resume();
		};
		/**
		* @returns {void}
		*/
		const onClose = function() {
			queueMicrotask(() => {
				body.removeListener("error", onFinished);
			});
			if (!finished) {
				const err = new RequestAbortedError();
				queueMicrotask(() => onFinished(err));
			}
		};
		/**
		* @param {Error} [err]
		* @returns
		*/
		const onFinished = function(err) {
			if (finished) return;
			finished = true;
			assert$23(socket.destroyed || socket[kWriting] && client[kRunning] <= 1);
			socket.off("drain", onDrain).off("error", onFinished);
			body.removeListener("data", onData).removeListener("end", onFinished).removeListener("close", onClose);
			if (!err) try {
				writer.end();
			} catch (er) {
				err = er;
			}
			writer.destroy(err);
			if (err && (err.code !== "UND_ERR_INFO" || err.message !== "reset")) util.destroy(body, err);
			else util.destroy(body);
		};
		body.on("data", onData).on("end", onFinished).on("error", onFinished).on("close", onClose);
		if (body.resume) body.resume();
		socket.on("drain", onDrain).on("error", onFinished);
		if (body.errorEmitted ?? body.errored) setImmediate(onFinished, body.errored);
		else if (body.endEmitted ?? body.readableEnded) setImmediate(onFinished, null);
		if (body.closeEmitted ?? body.closed) setImmediate(onClose);
	}
	/**
	* @typedef AbortCallback
	* @type {Function}
	* @param {Error} [err]
	* @returns {void}
	*/
	/**
	* @param {AbortCallback} abort
	* @param {Uint8Array|null} body
	* @param {import('./client.js')} client
	* @param {import('../core/request.js')} request
	* @param {import('net').Socket} socket
	* @param {number} contentLength
	* @param {string} header
	* @param {boolean} expectsPayload
	* @returns {void}
	*/
	function writeBuffer(abort, body, client, request, socket, contentLength, header, expectsPayload) {
		try {
			if (!body) {
				if (contentLength === 0) socket.write(`${header}content-length: 0\r\n\r\n`, "latin1");
				else {
					assert$23(contentLength === null, "no body must not have content length");
					socket.write(`${header}\r\n`, "latin1");
				}
			} else if (util.isBuffer(body)) {
				assert$23(contentLength === body.byteLength, "buffer body must have content length");
				socket.cork();
				socket.write(`${header}content-length: ${contentLength}\r\n\r\n`, "latin1");
				socket.write(body);
				socket.uncork();
				request.onBodySent(body);
				if (!expectsPayload && request.reset !== false) socket[kReset] = true;
			}
			request.onRequestSent();
			client[kResume]();
		} catch (err) {
			abort(err);
		}
	}
	/**
	* @param {AbortCallback} abort
	* @param {Blob} body
	* @param {import('./client.js')} client
	* @param {import('../core/request.js')} request
	* @param {import('net').Socket} socket
	* @param {number} contentLength
	* @param {string} header
	* @param {boolean} expectsPayload
	* @returns {Promise<void>}
	*/
	async function writeBlob(abort, body, client, request, socket, contentLength, header, expectsPayload) {
		try {
			if (contentLength != null && contentLength !== body.size) throw new RequestContentLengthMismatchError();
			const buffer = Buffer.from(await body.arrayBuffer());
			socket.cork();
			socket.write(`${header}content-length: ${contentLength}\r\n\r\n`, "latin1");
			socket.write(buffer);
			socket.uncork();
			request.onBodySent(buffer);
			request.onRequestSent();
			if (!expectsPayload && request.reset !== false) socket[kReset] = true;
			client[kResume]();
		} catch (err) {
			abort(err);
		}
	}
	/**
	* @param {AbortCallback} abort
	* @param {Iterable} body
	* @param {import('./client.js')} client
	* @param {import('../core/request.js')} request
	* @param {import('net').Socket} socket
	* @param {number} contentLength
	* @param {string} header
	* @param {boolean} expectsPayload
	* @returns {Promise<void>}
	*/
	async function writeIterable(abort, body, client, request, socket, contentLength, header, expectsPayload) {
		assert$23(contentLength !== 0 || client[kRunning] === 0, "iterator body cannot be pipelined");
		let callback = null;
		function onDrain() {
			if (callback) {
				const cb = callback;
				callback = null;
				cb();
			}
		}
		const waitForDrain = () => new Promise((resolve, reject) => {
			assert$23(callback === null);
			if (socket[kError]) reject(socket[kError]);
			else callback = resolve;
		});
		socket.on("close", onDrain).on("drain", onDrain);
		const writer = new AsyncWriter({
			abort,
			socket,
			request,
			contentLength,
			client,
			expectsPayload,
			header
		});
		try {
			for await (const chunk of body) {
				if (socket[kError]) throw socket[kError];
				if (!writer.write(chunk)) await waitForDrain();
			}
			writer.end();
		} catch (err) {
			writer.destroy(err);
		} finally {
			socket.off("close", onDrain).off("drain", onDrain);
		}
	}
	var AsyncWriter = class {
		/**
		*
		* @param {object} arg
		* @param {AbortCallback} arg.abort
		* @param {import('net').Socket} arg.socket
		* @param {import('../core/request.js')} arg.request
		* @param {number} arg.contentLength
		* @param {import('./client.js')} arg.client
		* @param {boolean} arg.expectsPayload
		* @param {string} arg.header
		*/
		constructor({ abort, socket, request, contentLength, client, expectsPayload, header }) {
			this.socket = socket;
			this.request = request;
			this.contentLength = contentLength;
			this.client = client;
			this.bytesWritten = 0;
			this.expectsPayload = expectsPayload;
			this.header = header;
			this.abort = abort;
			socket[kWriting] = true;
		}
		/**
		* @param {string|Uint8Array} chunk
		* @returns
		*/
		write(chunk) {
			const { socket, request, contentLength, client, bytesWritten, expectsPayload, header } = this;
			if (socket[kError]) throw socket[kError];
			if (socket.destroyed) return false;
			const len = chunk instanceof Uint8Array ? chunk.byteLength : Buffer.byteLength(chunk);
			if (!len) return true;
			if (contentLength !== null && bytesWritten + len > contentLength) {
				if (client[kStrictContentLength]) throw new RequestContentLengthMismatchError();
				process.emitWarning(new RequestContentLengthMismatchError());
			}
			socket.cork();
			if (bytesWritten === 0) {
				if (!expectsPayload && request.reset !== false) socket[kReset] = true;
				if (contentLength === null) socket.write(`${header}transfer-encoding: chunked\r\n`, "latin1");
				else socket.write(`${header}content-length: ${contentLength}\r\n\r\n`, "latin1");
			}
			if (contentLength === null) socket.write(`\r\n${len.toString(16)}\r\n`, "latin1");
			this.bytesWritten += len;
			const ret = socket.write(chunk);
			socket.uncork();
			request.onBodySent(chunk);
			if (!ret) {
				if (socket[kParser].timeout && socket[kParser].timeoutType === TIMEOUT_HEADERS) {
					if (socket[kParser].timeout.refresh) socket[kParser].timeout.refresh();
				}
			}
			return ret;
		}
		/**
		* @returns {void}
		*/
		end() {
			const { socket, contentLength, client, bytesWritten, expectsPayload, header, request } = this;
			request.onRequestSent();
			socket[kWriting] = false;
			if (socket[kError]) throw socket[kError];
			if (socket.destroyed) return;
			if (bytesWritten === 0) {
				if (expectsPayload) socket.write(`${header}content-length: 0\r\n\r\n`, "latin1");
				else socket.write(`${header}\r\n`, "latin1");
			} else if (contentLength === null) socket.write("\r\n0\r\n\r\n", "latin1");
			if (contentLength !== null && bytesWritten !== contentLength) {
				if (client[kStrictContentLength]) throw new RequestContentLengthMismatchError();
				else process.emitWarning(new RequestContentLengthMismatchError());
			}
			if (socket[kParser].timeout && socket[kParser].timeoutType === TIMEOUT_HEADERS) {
				if (socket[kParser].timeout.refresh) socket[kParser].timeout.refresh();
			}
			client[kResume]();
		}
		/**
		* @param {Error} [err]
		* @returns {void}
		*/
		destroy(err) {
			const { socket, client, abort } = this;
			socket[kWriting] = false;
			if (err) {
				assert$23(client[kRunning] <= 1, "pipeline should only contain this request");
				abort(err);
			}
		}
	};
	module.exports = connectH1;
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/dispatcher/client-h2.js
var require_client_h2 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const assert$22 = __require("node:assert");
	const { pipeline: pipeline$3 } = __require("node:stream");
	const util = require_util$5();
	const { RequestContentLengthMismatchError, RequestAbortedError, SocketError, InformationalError, InvalidArgumentError, HeadersTimeoutError, BodyTimeoutError } = require_errors();
	const { kUrl, kReset, kClient, kRunning, kPending, kQueue, kPendingIdx, kRunningIdx, kError, kSocket, kStrictContentLength, kOnError, kMaxConcurrentStreams, kPingInterval, kHTTP2Session, kHTTP2InitialWindowSize, kHTTP2ConnectionWindowSize, kHostAuthority, kResume, kSize, kHTTPContext, kClosed, kKeepAliveDefaultTimeout, kHeadersTimeout, kBodyTimeout, kEnableConnectProtocol, kRemoteSettings, kHTTP2Stream, kHTTP2SessionState } = require_symbols();
	const { channels } = require_diagnostics();
	const kOpenStreams = Symbol("open streams");
	const kRequestStreamId = Symbol("request stream id");
	const kRequestStream = Symbol("request stream");
	const kRequestStreamCleanup = Symbol("request stream cleanup");
	const kRequestStreamState = Symbol("request stream state");
	const kReceivedGoAway = Symbol("received goaway");
	let extractBody;
	/** @type {import('http2')} */
	let http2;
	try {
		http2 = __require("node:http2");
	} catch {
		http2 = { constants: {} };
	}
	const { constants: { HTTP2_HEADER_AUTHORITY, HTTP2_HEADER_METHOD, HTTP2_HEADER_PATH, HTTP2_HEADER_SCHEME, HTTP2_HEADER_CONTENT_LENGTH, HTTP2_HEADER_EXPECT, HTTP2_HEADER_STATUS, HTTP2_HEADER_PROTOCOL, NGHTTP2_NO_ERROR, NGHTTP2_REFUSED_STREAM } } = http2;
	function getGoAwayError(session, errorCode) {
		return session[kError] || (errorCode === NGHTTP2_NO_ERROR ? new InformationalError(`HTTP/2: "GOAWAY" frame received with code ${errorCode}`) : new SocketError(`HTTP/2: "GOAWAY" frame received with code ${errorCode}`, util.getSocketInfo(session[kSocket])));
	}
	function resetHttp2Session(session, err) {
		const client = session[kClient];
		const socket = session[kSocket];
		if (client[kHTTP2Session] === session) {
			client[kSocket] = null;
			client[kHTTPContext] = null;
			client[kHTTP2Session] = null;
		}
		if (socket != null && socket[kError] == null) socket[kError] = err;
		if (!session.closed && !session.destroyed) try {
			session.destroy(err);
		} catch {}
		util.destroy(socket, err);
	}
	function getGoAwayPendingIdx(client, lastStreamID) {
		const maxAcceptedStreamID = Number.isInteger(lastStreamID) ? lastStreamID : Number.MAX_SAFE_INTEGER;
		for (let i = client[kRunningIdx]; i < client[kPendingIdx]; i++) {
			const request = client[kQueue][i];
			if (request == null) continue;
			if (typeof request[kRequestStreamId] !== "number" || request[kRequestStreamId] > maxAcceptedStreamID) return i;
		}
		return client[kPendingIdx];
	}
	function detachRequestFromStream(request) {
		request[kRequestStreamId] = null;
		request[kRequestStream] = null;
		request[kRequestStreamCleanup] = null;
	}
	function bindRequestToStream(request, stream, cleanup) {
		const previousCleanup = request[kRequestStreamCleanup];
		const previousStream = request[kRequestStream];
		detachRequestFromStream(request);
		previousCleanup?.(previousStream);
		request[kRequestStreamId] = stream.id;
		request[kRequestStream] = stream;
		request[kRequestStreamCleanup] = cleanup;
	}
	function clearRequestStream(request) {
		const cleanup = request[kRequestStreamCleanup];
		const stream = request[kRequestStream];
		detachRequestFromStream(request);
		cleanup?.(stream);
	}
	function requeueUnsentRequest(client, request) {
		client[kQueue].splice(client[kPendingIdx] + 1, 0, request);
	}
	function completeRequest(client, request, resetPendingIdx = false) {
		const queue = client[kQueue];
		const runningIdx = client[kRunningIdx];
		if (runningIdx < client[kPendingIdx] && queue[runningIdx] === request) {
			queue[runningIdx] = null;
			client[kRunningIdx] = runningIdx + 1;
			return;
		}
		const index = queue.indexOf(request, runningIdx);
		if (index === -1 || index >= client[kPendingIdx]) return;
		queue.splice(index, 1);
		client[kPendingIdx]--;
		if (resetPendingIdx && client[kPendingIdx] < client[kRunningIdx]) client[kPendingIdx] = client[kRunningIdx];
	}
	function canRetryRequestAfterGoAway(request) {
		const { body } = request;
		return body == null || util.isBuffer(body) || util.isBlobLike(body);
	}
	function closeStream(stream, code = NGHTTP2_REFUSED_STREAM) {
		if (stream != null && !stream.destroyed && !stream.closed) try {
			stream.close(code);
		} catch {}
	}
	function detachRequestStreamForClose(request) {
		const stream = request[kRequestStream];
		clearRequestStream(request);
		return stream;
	}
	function connectH2(client, socket) {
		client[kSocket] = socket;
		const http2InitialWindowSize = client[kHTTP2InitialWindowSize];
		const http2ConnectionWindowSize = client[kHTTP2ConnectionWindowSize];
		const session = http2.connect(client[kUrl], {
			createConnection: () => socket,
			peerMaxConcurrentStreams: client[kMaxConcurrentStreams],
			settings: {
				enablePush: false,
				...http2InitialWindowSize != null ? { initialWindowSize: http2InitialWindowSize } : null
			}
		});
		client[kSocket] = socket;
		session[kOpenStreams] = 0;
		session[kClient] = client;
		session[kSocket] = socket;
		session[kHTTP2SessionState] = {
			idleTimeout: null,
			refed: true,
			ping: { interval: client[kPingInterval] === 0 ? null : setInterval(onHttp2SendPing, client[kPingInterval], session).unref() }
		};
		session[kReceivedGoAway] = false;
		session[kEnableConnectProtocol] = false;
		session[kRemoteSettings] = false;
		if (http2ConnectionWindowSize) util.addListener(session, "connect", applyConnectionWindowSize.bind(session, http2ConnectionWindowSize));
		util.addListener(session, "error", onHttp2SessionError);
		util.addListener(session, "frameError", onHttp2FrameError);
		util.addListener(session, "goaway", onHttp2SessionGoAway);
		util.addListener(session, "close", onHttp2SessionClose);
		util.addListener(session, "remoteSettings", onHttp2RemoteSettings);
		unrefH2Session(session);
		client[kHTTP2Session] = session;
		socket[kHTTP2Session] = session;
		util.addListener(socket, "error", onHttp2SocketError);
		util.addListener(socket, "end", onHttp2SocketEnd);
		util.addListener(socket, "close", onHttp2SocketClose);
		socket[kClosed] = false;
		socket.on("close", onSocketClose);
		return {
			version: "h2",
			defaultPipelining: Infinity,
			/**
			* @param {import('../core/request.js')} request
			* @returns {boolean}
			*/
			write(request) {
				return writeH2(client, request);
			},
			/**
			* @returns {void}
			*/
			resume() {
				resumeH2(client);
			},
			/**
			* @param {Error | null} err
			* @param {() => void} callback
			*/
			destroy(err, callback) {
				if (socket[kClosed]) queueMicrotask(callback);
				else socket.destroy(err).on("close", callback);
			},
			/**
			* @type {boolean}
			*/
			get destroyed() {
				return socket.destroyed;
			},
			/**
			* @param {import('../core/request.js')} request
			* @returns {boolean}
			*/
			busy(request) {
				if (session[kRemoteSettings] === false && client[kRunning] > 0) return true;
				if (client[kRunning] >= client[kMaxConcurrentStreams]) return true;
				if (request != null) {
					if (client[kRunning] > 0) {
						if ((request.upgrade === "websocket" || request.method === "CONNECT") && session[kRemoteSettings] === false) return true;
					} else return (request.upgrade === "websocket" || request.method === "CONNECT") && session[kRemoteSettings] === false;
				}
				return false;
			}
		};
	}
	function refH2Session(session) {
		const state = session[kHTTP2SessionState];
		if (state.refed === false) {
			state.refed = true;
			session.ref();
		}
	}
	function unrefH2Session(session) {
		const state = session[kHTTP2SessionState];
		if (state.refed === true) {
			state.refed = false;
			session.unref();
		}
	}
	function resumeH2(client) {
		const socket = client[kSocket];
		const session = client[kHTTP2Session];
		if (socket?.destroyed === false) {
			if (client[kSize] === 0 || client[kMaxConcurrentStreams] === 0) unrefH2Session(session);
			else refH2Session(session);
			if (client[kSize] === 0 && session[kOpenStreams] === 0) setHttp2IdleTimeout(session);
			else clearHttp2IdleTimeout(session);
		}
	}
	function clearHttp2IdleTimeout(session) {
		const state = session[kHTTP2SessionState];
		if (state?.idleTimeout != null) {
			clearTimeout(state.idleTimeout);
			state.idleTimeout = null;
		}
	}
	function setHttp2IdleTimeout(session) {
		const client = session[kClient];
		if (client[kHTTP2Session] !== session || session.closed || session.destroyed) return;
		if (session[kOpenStreams] !== 0 || client[kSize] !== 0) {
			clearHttp2IdleTimeout(session);
			return;
		}
		const state = session[kHTTP2SessionState];
		if (state.idleTimeout == null) state.idleTimeout = setTimeout(onHttp2SessionIdleTimeout, client[kKeepAliveDefaultTimeout], session).unref();
	}
	function onHttp2SessionIdleTimeout(session) {
		const client = session[kClient];
		const socket = session[kSocket];
		const state = session[kHTTP2SessionState];
		state.idleTimeout = null;
		if (client[kHTTP2Session] !== session || session[kOpenStreams] !== 0 || client[kSize] !== 0 || session.closed || session.destroyed) return;
		const err = new InformationalError("socket idle timeout");
		socket[kError] = err;
		util.destroy(socket, err);
	}
	function applyConnectionWindowSize(connectionWindowSize) {
		try {
			if (typeof this.setLocalWindowSize === "function") this.setLocalWindowSize(connectionWindowSize);
		} catch {}
	}
	function onHttp2RemoteSettings(settings) {
		this[kClient][kMaxConcurrentStreams] = settings.maxConcurrentStreams ?? this[kClient][kMaxConcurrentStreams];
		/**
		* From RFC-8441
		* A sender MUST NOT send a SETTINGS_ENABLE_CONNECT_PROTOCOL parameter
		* with the value of 0 after previously sending a value of 1.
		*/
		if (this[kRemoteSettings] === true && this[kEnableConnectProtocol] === true && settings.enableConnectProtocol === false) {
			const err = new InformationalError("HTTP/2: Server disabled extended CONNECT protocol against RFC-8441");
			this[kSocket][kError] = err;
			this[kClient][kOnError](err);
			return;
		}
		this[kEnableConnectProtocol] = settings.enableConnectProtocol ?? this[kEnableConnectProtocol];
		this[kRemoteSettings] = true;
		this[kClient][kResume]();
	}
	function onHttp2SendPing(session) {
		const state = session[kHTTP2SessionState];
		if ((session.closed || session.destroyed) && state.ping.interval != null) {
			clearInterval(state.ping.interval);
			state.ping.interval = null;
			return;
		}
		session.ping(onPing.bind(session));
		function onPing(err, duration) {
			const client = this[kClient];
			const socket = this[kSocket];
			if (err != null) {
				const error = new InformationalError(`HTTP/2: "PING" errored - type ${err.message}`);
				socket[kError] = error;
				client[kOnError](error);
			} else client.emit("ping", duration);
		}
	}
	function onHttp2SessionError(err) {
		assert$22(err.code !== "ERR_TLS_CERT_ALTNAME_INVALID");
		this[kSocket][kError] = err;
		if (this[kReceivedGoAway]) return;
		this[kClient][kOnError](err);
	}
	function onHttp2FrameError(type, code, id) {
		if (id === 0) {
			if (this[kReceivedGoAway]) return;
			const err = new InformationalError(`HTTP/2: "frameError" received - type ${type}, code ${code}`);
			this[kSocket][kError] = err;
			this[kClient][kOnError](err);
		}
	}
	/**
	* This is the root cause of #3011
	* We need to handle GOAWAY frames properly, and trigger the session close
	* along with the socket right away
	*
	* @this {import('http2').ClientHttp2Session}
	* @param {number} errorCode
	* @param {number} lastStreamID
	*/
	function onHttp2SessionGoAway(errorCode, lastStreamID) {
		if (this[kReceivedGoAway]) return;
		this[kReceivedGoAway] = true;
		const err = getGoAwayError(this, errorCode);
		const client = this[kClient];
		const previousPendingIdx = client[kPendingIdx];
		const pendingIdx = getGoAwayPendingIdx(client, lastStreamID);
		const retriableRequests = [];
		const streamsToClose = [];
		for (let i = pendingIdx; i < previousPendingIdx; i++) {
			const request = client[kQueue][i];
			if (request != null) {
				streamsToClose.push(detachRequestStreamForClose(request));
				if (canRetryRequestAfterGoAway(request)) retriableRequests.push(request);
				else util.errorRequest(client, request, err);
			}
		}
		for (let i = 0; i < streamsToClose.length; i++) closeStream(streamsToClose[i]);
		if (pendingIdx !== previousPendingIdx) {
			const remainingPendingRequests = client[kQueue].slice(previousPendingIdx);
			client[kQueue].length = pendingIdx;
			client[kQueue].push(...retriableRequests, ...remainingPendingRequests);
		}
		if (client[kHTTP2Session] === this) {
			client[kSocket] = null;
			client[kHTTPContext] = null;
			client[kHTTP2Session] = null;
		}
		clearHttp2IdleTimeout(this);
		if (!this.closed && !this.destroyed) this.close();
		client[kPendingIdx] = pendingIdx;
		client.emit("disconnect", client[kUrl], [client], err);
		client[kResume]();
	}
	function onHttp2SessionClose() {
		const { [kClient]: client, [kHTTP2SessionState]: state, [kSocket]: socket } = this;
		const err = socket[kError] || this[kError] || new SocketError("closed", util.getSocketInfo(socket));
		if (client[kHTTP2Session] === this) {
			client[kSocket] = null;
			client[kHTTPContext] = null;
			client[kHTTP2Session] = null;
		}
		clearHttp2IdleTimeout(this);
		if (state.ping.interval != null) {
			clearInterval(state.ping.interval);
			state.ping.interval = null;
		}
		if (client.destroyed) {
			assert$22(client[kPending] === 0);
			const requests = client[kQueue].splice(client[kRunningIdx]);
			for (let i = 0; i < requests.length; i++) {
				const request = requests[i];
				if (request != null) util.errorRequest(client, request, err);
			}
		}
	}
	function onHttp2SocketClose() {
		const err = this[kError] || new SocketError("closed", util.getSocketInfo(this));
		const session = this[kHTTP2Session];
		const client = session[kClient];
		if (client[kSocket] !== this) {
			if (session[kReceivedGoAway] || client[kHTTP2Session] != null && client[kHTTP2Session] !== session) return;
		}
		client[kSocket] = null;
		client[kHTTPContext] = null;
		if (client[kHTTP2Session] === session) client[kHTTP2Session] = null;
		session.destroy(err);
		client[kPendingIdx] = client[kRunningIdx];
		assert$22(client[kRunning] === 0);
		client.emit("disconnect", client[kUrl], [client], err);
		client[kResume]();
	}
	function onHttp2SocketError(err) {
		assert$22(err.code !== "ERR_TLS_CERT_ALTNAME_INVALID");
		this[kError] = err;
		if (this[kHTTP2Session]?.[kReceivedGoAway]) return;
		this[kHTTP2Session]?.[kClient]?.[kOnError](err);
	}
	function onHttp2SocketEnd() {
		util.destroy(this, new SocketError("other side closed", util.getSocketInfo(this)));
	}
	function onSocketClose() {
		this[kClosed] = true;
	}
	function noop() {}
	function closeStreamSession(stream) {
		const session = stream[kHTTP2Session];
		stream[kHTTP2Session] = null;
		session[kOpenStreams] -= 1;
		if (session[kOpenStreams] === 0) {
			unrefH2Session(session);
			setHttp2IdleTimeout(session);
		}
	}
	function onUpgradeStreamClose() {
		this.off("error", noop);
		const state = this[kRequestStreamState];
		this[kRequestStreamState] = null;
		failUpgradeStream(state, new InformationalError("HTTP/2: stream closed before response headers"));
		closeStreamSession(this);
	}
	function completeRequestStream() {
		const state = this[kRequestStreamState];
		if (state == null) return;
		releaseRequestStream(this);
		if (state.pendingEnd && !state.request.aborted && !state.request.completed) state.request.onResponseEnd(state.trailers || {});
		finalizeRequest(state);
		closeStreamSession(this);
		this[kRequestStreamState] = null;
	}
	function shouldSendContentLength(method) {
		return method !== "GET" && method !== "HEAD" && method !== "OPTIONS" && method !== "TRACE" && method !== "CONNECT";
	}
	function buildRequestHeaders(reqHeaders) {
		const headers = {};
		for (let n = 0; n < reqHeaders.length; n += 2) {
			const key = reqHeaders[n + 0];
			const val = reqHeaders[n + 1];
			const current = headers[key];
			if (key === "cookie") {
				if (current != null) headers[key] = Array.isArray(current) ? (current.push(val), current) : [current, val];
				else headers[key] = val;
				continue;
			}
			if (typeof val === "string") {
				headers[key] = current ? `${current}, ${val}` : val;
				continue;
			}
			for (let i = 0; i < val.length; i++) headers[key] = headers[key] ? `${headers[key]}, ${val[i]}` : val[i];
		}
		return headers;
	}
	function removeUpgradeStreamListeners(stream) {
		stream.off("response", onUpgradeResponse);
		stream.off("error", onUpgradeStreamError);
		stream.off("end", onUpgradeStreamEnd);
		stream.off("timeout", onUpgradeStreamTimeout);
		stream.off("error", noop);
	}
	function releaseUpgradeStream(stream) {
		if (stream == null) return;
		const state = stream[kRequestStreamState];
		if (state == null) return;
		const { request } = state;
		if (request[kRequestStream] === stream) detachRequestFromStream(request);
		removeUpgradeStreamListeners(stream);
		if (!stream.destroyed && !stream.closed) stream.once("error", noop);
	}
	function failUpgradeStream(state, err) {
		if (state == null) return;
		const { request } = state;
		if (state.responseReceived || request.aborted || request.completed) return;
		releaseUpgradeStream(state.stream);
		state.abort(err, true);
	}
	function onUpgradeStreamError() {
		const state = this[kRequestStreamState];
		if (typeof this.rstCode === "number" && this.rstCode !== 0) failUpgradeStream(state, new InformationalError(`HTTP/2: "stream error" received - code ${this.rstCode}`));
		else failUpgradeStream(state, new InformationalError("HTTP/2: stream errored before response headers"));
	}
	function onUpgradeStreamEnd() {
		failUpgradeStream(this[kRequestStreamState], new InformationalError("HTTP/2: stream half-closed (remote)"));
	}
	function onUpgradeStreamTimeout() {
		const state = this[kRequestStreamState];
		failUpgradeStream(state, new InformationalError(`HTTP/2: "stream timeout after ${state.headersTimeout}"`));
	}
	function onUpgradeResponse(headers, _flags) {
		const stream = this;
		const state = stream[kRequestStreamState];
		const { request } = state;
		state.responseReceived = true;
		const statusCode = headers[HTTP2_HEADER_STATUS];
		delete headers[HTTP2_HEADER_STATUS];
		request.onRequestUpgrade(statusCode, headers, stream);
		if (request.aborted || request.completed) return;
		removeUpgradeStreamListeners(stream);
		detachRequestFromStream(request);
		finalizeRequest(state);
	}
	function setupUpgradeStream(stream, state) {
		const { request, headersTimeout, session } = state;
		stream[kHTTP2Stream] = true;
		stream[kHTTP2Session] = session;
		stream[kRequestStreamState] = state;
		state.stream = stream;
		bindRequestToStream(request, stream, releaseUpgradeStream);
		stream.once("response", onUpgradeResponse);
		stream.on("error", onUpgradeStreamError);
		stream.once("end", onUpgradeStreamEnd);
		stream.on("timeout", onUpgradeStreamTimeout);
		stream.once("close", onUpgradeStreamClose);
		clearHttp2IdleTimeout(session);
		++session[kOpenStreams];
		stream.setTimeout(headersTimeout);
	}
	function finalizeRequest(state, resetPendingIdx = false) {
		if (state.requestFinalized) return;
		state.requestFinalized = true;
		completeRequest(state.client, state.request, resetPendingIdx);
		state.client[kResume]();
	}
	function openStream(client, request, session, abort, headers, options) {
		try {
			return session.request(headers, options);
		} catch (err) {
			if (err?.code === "ERR_HTTP2_INVALID_SESSION" || err?.code === "ERR_HTTP2_GOAWAY_SESSION") {
				const wrappedErr = new SocketError(err.message, util.getSocketInfo(session[kSocket]));
				wrappedErr.cause = err;
				session[kError] = wrappedErr;
				resetHttp2Session(session, wrappedErr);
				requeueUnsentRequest(client, request);
				return null;
			}
			const wrappedErr = new InformationalError(err.message, { cause: err });
			session[kError] = wrappedErr;
			session[kSocket][kError] = wrappedErr;
			session.destroy(wrappedErr);
			util.destroy(session[kSocket], wrappedErr);
			abort(wrappedErr);
			return null;
		}
	}
	function writeH2(client, request) {
		const headersTimeout = request.headersTimeout ?? client[kHeadersTimeout];
		const bodyTimeout = request.bodyTimeout ?? client[kBodyTimeout];
		const session = client[kHTTP2Session];
		const { method, path, host, upgrade, expectContinue, signal, protocol, headers: reqHeaders } = request;
		if (upgrade != null && upgrade !== "websocket") {
			util.errorRequest(client, request, new InvalidArgumentError(`Custom upgrade "${upgrade}" not supported over HTTP/2`));
			return false;
		}
		const headers = buildRequestHeaders(reqHeaders);
		headers[HTTP2_HEADER_AUTHORITY] = host || client[kHostAuthority];
		headers[HTTP2_HEADER_METHOD] = method;
		const state = {
			abort: null,
			body: request.body,
			client,
			contentLength: null,
			expectsPayload: false,
			request,
			headersTimeout,
			bodyTimeout,
			requestFinalized: false,
			responseReceived: false,
			bodySent: false,
			pendingEnd: false,
			trailers: null,
			session,
			stream: null
		};
		const abort = (err, resetPendingIdx = false) => {
			if (request.aborted || request.completed) return;
			err = err || new RequestAbortedError();
			util.errorRequest(client, request, err);
			if (state.stream != null) {
				clearRequestStream(request);
				const stream = state.stream;
				stream.close();
				if (!stream.destroyed) util.destroy(stream);
				client[kOnError](err);
				finalizeRequest(state, resetPendingIdx);
			}
			util.destroy(state.body, err);
		};
		state.abort = abort;
		/** @type {import('node:http2').ClientHttp2Stream} */
		let stream = null;
		try {
			request.onRequestStart(abort, null);
		} catch (err) {
			util.errorRequest(client, request, err);
		}
		if (request.aborted) return false;
		if (upgrade || method === "CONNECT") {
			refH2Session(session);
			if (upgrade === "websocket") {
				if (session[kEnableConnectProtocol] === false) {
					util.errorRequest(client, request, new InformationalError("HTTP/2: Extended CONNECT protocol not supported by server"));
					unrefH2Session(session);
					return false;
				}
				headers[HTTP2_HEADER_METHOD] = "CONNECT";
				headers[HTTP2_HEADER_PROTOCOL] = "websocket";
				headers[HTTP2_HEADER_PATH] = path;
				if (protocol === "ws:" || protocol === "wss:") headers[HTTP2_HEADER_SCHEME] = protocol === "ws:" ? "http" : "https";
				else headers[HTTP2_HEADER_SCHEME] = protocol === "http:" ? "http" : "https";
				stream = openStream(client, request, session, abort, headers, {
					endStream: false,
					signal
				});
				if (stream == null) {
					unrefH2Session(session);
					return false;
				}
				setupUpgradeStream(stream, state);
				return true;
			}
			stream = openStream(client, request, session, abort, headers, {
				endStream: false,
				signal
			});
			if (stream == null) {
				unrefH2Session(session);
				return false;
			}
			setupUpgradeStream(stream, state);
			return true;
		}
		headers[HTTP2_HEADER_PATH] = path;
		headers[HTTP2_HEADER_SCHEME] = protocol === "http:" ? "http" : "https";
		const expectsPayload = method === "PUT" || method === "POST" || method === "PATCH" || method === "QUERY" || method === "PROPFIND" || method === "PROPPATCH";
		let body = state.body;
		if (body && typeof body.read === "function") body.read(0);
		let contentLength = util.bodyLength(body);
		if (util.isFormDataLike(body)) {
			extractBody ??= require_body().extractBody;
			const [bodyStream, contentType] = extractBody(body);
			headers["content-type"] = contentType;
			body = bodyStream.stream;
			contentLength = bodyStream.length;
		}
		if (contentLength == null) contentLength = request.contentLength;
		if (contentLength === 0 && !expectsPayload) contentLength = null;
		if (shouldSendContentLength(method) && contentLength > 0 && request.contentLength != null && request.contentLength !== contentLength) {
			if (client[kStrictContentLength]) {
				util.errorRequest(client, request, new RequestContentLengthMismatchError());
				return false;
			}
			process.emitWarning(new RequestContentLengthMismatchError());
		}
		if (contentLength != null) {
			assert$22(body || contentLength === 0, "no body must not have content length");
			headers[HTTP2_HEADER_CONTENT_LENGTH] = `${contentLength}`;
		}
		refH2Session(session);
		if (channels.sendHeaders.hasSubscribers) {
			let header = "";
			for (const key in headers) header += `${key}: ${headers[key]}\r\n`;
			channels.sendHeaders.publish({
				request,
				headers: header,
				socket: session[kSocket]
			});
		}
		const shouldEndStream = body === null || contentLength === 0;
		state.body = body;
		state.contentLength = contentLength;
		state.expectsPayload = expectsPayload;
		if (expectContinue) headers[HTTP2_HEADER_EXPECT] = "100-continue";
		stream = openStream(client, request, session, abort, headers, {
			endStream: shouldEndStream,
			signal
		});
		if (stream == null) return false;
		stream[kHTTP2Stream] = true;
		stream[kRequestStreamState] = state;
		state.stream = stream;
		clearHttp2IdleTimeout(session);
		++session[kOpenStreams];
		if (headersTimeout) stream.setTimeout(headersTimeout);
		stream[kHTTP2Session] = session;
		stream.on("close", completeRequestStream);
		bindRequestToStream(request, stream, releaseRequestStream);
		if (expectContinue) stream.once("continue", writeBodyH2);
		stream.on("response", onResponse);
		stream.on("end", onEnd);
		stream.on("error", onError);
		stream.on("frameError", onFrameError);
		stream.on("aborted", onAborted);
		if (headersTimeout || bodyTimeout) stream.on("timeout", onTimeout);
		stream.on("trailers", onTrailers);
		if (!expectContinue) writeBodyH2.call(stream);
		return true;
	}
	function removeRequestStreamListeners(stream) {
		stream.off("error", noop);
		stream.off("continue", writeBodyH2);
		stream.off("response", onResponse);
		stream.off("end", onEnd);
		stream.off("error", onError);
		stream.off("frameError", onFrameError);
		stream.off("aborted", onAborted);
		stream.off("timeout", onTimeout);
		stream.off("trailers", onTrailers);
		stream.off("data", onData);
	}
	function releaseRequestStream(stream) {
		if (stream == null) return;
		const state = stream[kRequestStreamState];
		if (state == null) return;
		const { request } = state;
		if (request[kRequestStream] === stream) detachRequestFromStream(request);
		if (!stream.destroyed && !stream.closed) {
			removeRequestStreamListeners(stream);
			stream.once("error", noop);
		}
	}
	function onData(chunk) {
		const stream = this;
		const state = stream[kRequestStreamState];
		if (state == null) return;
		const { request } = state;
		if (request.aborted || request.completed) return;
		if (request.onResponseData(chunk) === false) stream.pause();
	}
	function onResponse(headers) {
		const stream = this;
		const state = stream[kRequestStreamState];
		if (state == null) return;
		const { request } = state;
		stream.off("response", onResponse);
		if (state.body != null && !state.bodySent && !stream.writableEnded) {
			stream.removeListener("continue", writeBodyH2);
			stream.end();
		}
		const statusCode = headers[HTTP2_HEADER_STATUS];
		delete headers[HTTP2_HEADER_STATUS];
		request.onResponseStarted();
		state.responseReceived = true;
		if (state.headersTimeout || state.bodyTimeout) stream.setTimeout(state.bodyTimeout);
		if (request.aborted || request.completed) {
			releaseRequestStream(stream);
			return;
		}
		if (request.onResponseStart(Number(statusCode), headers, stream.resume.bind(stream), "") === false) stream.pause();
		stream.on("data", onData);
	}
	function onEnd() {
		const stream = this;
		const state = stream[kRequestStreamState];
		if (state == null) return;
		const { request } = state;
		stream.off("end", onEnd);
		if (state.responseReceived) {
			if (!request.aborted && !request.completed) {
				state.pendingEnd = true;
				completeRequestStream.call(stream);
			}
		} else state.abort(new InformationalError("HTTP/2: stream half-closed (remote)"), true);
	}
	function onError(err) {
		const stream = this;
		const state = stream[kRequestStreamState];
		if (state == null) return;
		stream.off("error", onError);
		state.abort(err);
	}
	function onFrameError(type, code) {
		const stream = this;
		const state = stream[kRequestStreamState];
		if (state == null) return;
		stream.off("frameError", onFrameError);
		state.abort(new InformationalError(`HTTP/2: "frameError" received - type ${type}, code ${code}`));
	}
	function onAborted() {
		this.off("data", onData);
	}
	function onTimeout() {
		const stream = this;
		const state = stream[kRequestStreamState];
		if (state == null) return;
		stream.off("timeout", onTimeout);
		const err = state.responseReceived ? new BodyTimeoutError(`HTTP/2: "stream timeout after ${state.bodyTimeout}"`) : new HeadersTimeoutError(`HTTP/2: "headers timeout after ${state.headersTimeout}"`);
		state.abort(err);
	}
	function onTrailers(trailers) {
		const stream = this;
		const state = stream[kRequestStreamState];
		if (state == null) return;
		const { request } = state;
		stream.off("trailers", onTrailers);
		stream.off("data", onData);
		if (request.aborted || request.completed) return;
		state.trailers = trailers;
	}
	function writeBodyH2() {
		const stream = this;
		const state = stream[kRequestStreamState];
		state.bodySent = true;
		const { abort, body, client, contentLength, expectsPayload, request } = state;
		if (!body || contentLength === 0) writeBuffer(abort, stream, null, client, request, client[kSocket], contentLength, expectsPayload);
		else if (util.isBuffer(body)) writeBuffer(abort, stream, body, client, request, client[kSocket], contentLength, expectsPayload);
		else if (util.isBlobLike(body)) {
			if (typeof body.stream === "function") writeIterable(abort, stream, body.stream(), client, request, client[kSocket], contentLength, expectsPayload);
			else writeBlob(abort, stream, body, client, request, client[kSocket], contentLength, expectsPayload);
		} else if (util.isStream(body)) writeStream(abort, client[kSocket], expectsPayload, stream, body, client, request, contentLength);
		else if (util.isIterable(body)) writeIterable(abort, stream, body, client, request, client[kSocket], contentLength, expectsPayload);
		else assert$22(false);
	}
	function writeBuffer(abort, h2stream, body, client, request, socket, contentLength, expectsPayload) {
		try {
			if (body != null && util.isBuffer(body)) {
				assert$22(contentLength === body.byteLength, "buffer body must have content length");
				h2stream.cork();
				h2stream.write(body);
				h2stream.uncork();
				h2stream.end();
				request.onBodySent(body);
			}
			if (!expectsPayload) socket[kReset] = true;
			request.onRequestSent();
			client[kResume]();
		} catch (error) {
			abort(error);
		}
	}
	function writeStream(abort, socket, expectsPayload, h2stream, body, client, request, contentLength) {
		assert$22(contentLength !== 0 || client[kRunning] === 0, "stream body cannot be pipelined");
		const pipe = pipeline$3(body, h2stream, (err) => {
			if (err) {
				util.destroy(pipe, err);
				abort(err);
			} else {
				util.removeAllListeners(pipe);
				request.onRequestSent();
				if (!expectsPayload) socket[kReset] = true;
				client[kResume]();
			}
		});
		util.addListener(pipe, "data", onPipeData);
		function onPipeData(chunk) {
			request.onBodySent(chunk);
		}
	}
	async function writeBlob(abort, h2stream, body, client, request, socket, contentLength, expectsPayload) {
		try {
			if (contentLength != null && contentLength !== body.size) throw new RequestContentLengthMismatchError();
			const buffer = Buffer.from(await body.arrayBuffer());
			h2stream.cork();
			h2stream.write(buffer);
			h2stream.uncork();
			h2stream.end();
			request.onBodySent(buffer);
			request.onRequestSent();
			if (!expectsPayload) socket[kReset] = true;
			client[kResume]();
		} catch (err) {
			abort(err);
		}
	}
	async function writeIterable(abort, h2stream, body, client, request, socket, contentLength, expectsPayload) {
		assert$22(contentLength !== 0 || client[kRunning] === 0, "iterator body cannot be pipelined");
		let callback = null;
		function onDrain() {
			if (callback) {
				const cb = callback;
				callback = null;
				cb();
			}
		}
		const waitForDrain = () => new Promise((resolve, reject) => {
			assert$22(callback === null);
			if (socket[kError]) reject(socket[kError]);
			else callback = resolve;
		});
		h2stream.on("close", onDrain).on("drain", onDrain);
		try {
			for await (const chunk of body) {
				if (socket[kError]) throw socket[kError];
				const res = h2stream.write(chunk);
				request.onBodySent(chunk);
				if (!res) await waitForDrain();
			}
			h2stream.end();
			request.onRequestSent();
			if (!expectsPayload) socket[kReset] = true;
			client[kResume]();
		} catch (err) {
			abort(err);
		} finally {
			h2stream.off("close", onDrain).off("drain", onDrain);
		}
	}
	module.exports = connectH2;
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/dispatcher/client.js
var require_client = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const assert$21 = __require("node:assert");
	const net$1 = __require("node:net");
	const http = __require("node:http");
	const util = require_util$5();
	const { ClientStats } = require_stats();
	const { channels } = require_diagnostics();
	const Request = require_request$1();
	const DispatcherBase = require_dispatcher_base();
	const { InvalidArgumentError, InformationalError, ClientDestroyedError } = require_errors();
	const buildConnector = require_connect();
	const { kUrl, kServerName, kClient, kBusy, kConnect, kResuming, kRunning, kPending, kSize, kQueue, kConnected, kConnecting, kNeedDrain, kKeepAliveDefaultTimeout, kHostHeader, kPendingIdx, kRunningIdx, kError, kPipelining, kKeepAliveTimeoutValue, kMaxHeadersSize, kKeepAliveMaxTimeout, kKeepAliveTimeoutThreshold, kHeadersTimeout, kBodyTimeout, kStrictContentLength, kConnector, kMaxRequests, kCounter, kClose, kDestroy, kDispatch, kLocalAddress, kMaxResponseSize, kOnError, kHTTPContext, kMaxConcurrentStreams, kHostAuthority, kHTTP2InitialWindowSize, kHTTP2ConnectionWindowSize, kResume, kPingInterval } = require_symbols();
	const connectH1 = require_client_h1();
	const connectH2 = require_client_h2();
	const kClosedResolve = Symbol("kClosedResolve");
	const getDefaultNodeMaxHeaderSize = http && http.maxHeaderSize && Number.isInteger(http.maxHeaderSize) && http.maxHeaderSize > 0 ? () => http.maxHeaderSize : () => {
		throw new InvalidArgumentError("http module not available or http.maxHeaderSize invalid");
	};
	const noop = () => {};
	function getPipelining(client) {
		return client[kPipelining] ?? client[kHTTPContext]?.defaultPipelining ?? 1;
	}
	function getMaxConcurrent(client) {
		if (client[kHTTPContext]?.version === "h2") return client[kMaxConcurrentStreams];
		return getPipelining(client);
	}
	/**
	* @type {import('../../types/client.js').default}
	*/
	var Client = class extends DispatcherBase {
		/**
		*
		* @param {string|URL} url
		* @param {import('../../types/client.js').Client.Options} options
		*/
		constructor(url, { maxHeaderSize, headersTimeout, socketTimeout, requestTimeout, connectTimeout, bodyTimeout, idleTimeout, keepAlive, keepAliveTimeout, maxKeepAliveTimeout, keepAliveMaxTimeout, keepAliveTimeoutThreshold, socketPath, pipelining, tls, strictContentLength, maxCachedSessions, connect, maxRequestsPerClient, localAddress, maxResponseSize, autoSelectFamily, autoSelectFamilyAttemptTimeout, maxConcurrentStreams, allowH2, useH2c, initialWindowSize, connectionWindowSize, pingInterval, webSocket } = {}) {
			if (keepAlive !== void 0) throw new InvalidArgumentError("unsupported keepAlive, use pipelining=0 instead");
			if (socketTimeout !== void 0) throw new InvalidArgumentError("unsupported socketTimeout, use headersTimeout & bodyTimeout instead");
			if (requestTimeout !== void 0) throw new InvalidArgumentError("unsupported requestTimeout, use headersTimeout & bodyTimeout instead");
			if (idleTimeout !== void 0) throw new InvalidArgumentError("unsupported idleTimeout, use keepAliveTimeout instead");
			if (maxKeepAliveTimeout !== void 0) throw new InvalidArgumentError("unsupported maxKeepAliveTimeout, use keepAliveMaxTimeout instead");
			if (maxHeaderSize != null) {
				if (!Number.isInteger(maxHeaderSize) || maxHeaderSize < 1) throw new InvalidArgumentError("invalid maxHeaderSize");
			} else maxHeaderSize = getDefaultNodeMaxHeaderSize();
			if (socketPath != null && typeof socketPath !== "string") throw new InvalidArgumentError("invalid socketPath");
			if (connectTimeout != null && (!Number.isFinite(connectTimeout) || connectTimeout < 0)) throw new InvalidArgumentError("invalid connectTimeout");
			if (keepAliveTimeout != null && (!Number.isFinite(keepAliveTimeout) || keepAliveTimeout <= 0)) throw new InvalidArgumentError("invalid keepAliveTimeout");
			if (keepAliveMaxTimeout != null && (!Number.isFinite(keepAliveMaxTimeout) || keepAliveMaxTimeout <= 0)) throw new InvalidArgumentError("invalid keepAliveMaxTimeout");
			if (keepAliveTimeoutThreshold != null && !Number.isFinite(keepAliveTimeoutThreshold)) throw new InvalidArgumentError("invalid keepAliveTimeoutThreshold");
			if (headersTimeout != null && (!Number.isInteger(headersTimeout) || headersTimeout < 0)) throw new InvalidArgumentError("headersTimeout must be a positive integer or zero");
			if (bodyTimeout != null && (!Number.isInteger(bodyTimeout) || bodyTimeout < 0)) throw new InvalidArgumentError("bodyTimeout must be a positive integer or zero");
			if (connect != null && typeof connect !== "function" && typeof connect !== "object") throw new InvalidArgumentError("connect must be a function or an object");
			if (maxRequestsPerClient != null && (!Number.isInteger(maxRequestsPerClient) || maxRequestsPerClient < 0)) throw new InvalidArgumentError("maxRequestsPerClient must be a positive number");
			if (localAddress != null && (typeof localAddress !== "string" || net$1.isIP(localAddress) === 0)) throw new InvalidArgumentError("localAddress must be valid string IP address");
			if (maxResponseSize != null && (!Number.isInteger(maxResponseSize) || maxResponseSize < -1)) throw new InvalidArgumentError("maxResponseSize must be a positive number");
			if (autoSelectFamilyAttemptTimeout != null && (!Number.isInteger(autoSelectFamilyAttemptTimeout) || autoSelectFamilyAttemptTimeout < -1)) throw new InvalidArgumentError("autoSelectFamilyAttemptTimeout must be a positive number");
			if (allowH2 != null && typeof allowH2 !== "boolean") throw new InvalidArgumentError("allowH2 must be a valid boolean value");
			if (maxConcurrentStreams != null && (typeof maxConcurrentStreams !== "number" || maxConcurrentStreams < 1)) throw new InvalidArgumentError("maxConcurrentStreams must be a positive integer, greater than 0");
			if (useH2c != null && typeof useH2c !== "boolean") throw new InvalidArgumentError("useH2c must be a valid boolean value");
			if (initialWindowSize != null && (!Number.isInteger(initialWindowSize) || initialWindowSize < 1)) throw new InvalidArgumentError("initialWindowSize must be a positive integer, greater than 0");
			if (connectionWindowSize != null && (!Number.isInteger(connectionWindowSize) || connectionWindowSize < 1)) throw new InvalidArgumentError("connectionWindowSize must be a positive integer, greater than 0");
			if (pingInterval != null && (typeof pingInterval !== "number" || !Number.isInteger(pingInterval) || pingInterval < 0)) throw new InvalidArgumentError("pingInterval must be a positive integer, greater or equal to 0");
			super({ webSocket });
			if (typeof connect !== "function") connect = buildConnector({
				...tls,
				maxCachedSessions,
				allowH2,
				useH2c,
				socketPath,
				timeout: connectTimeout,
				...typeof autoSelectFamily === "boolean" ? {
					autoSelectFamily,
					autoSelectFamilyAttemptTimeout
				} : void 0,
				...connect
			});
			else {
				const customConnect = connect;
				connect = (opts, callback) => customConnect({
					...opts,
					...socketPath != null ? { socketPath } : null,
					...allowH2 != null ? { allowH2 } : null
				}, callback);
			}
			this[kUrl] = util.parseOrigin(url);
			this[kHostAuthority] = `${this[kUrl].hostname}${this[kUrl].port ? `:${this[kUrl].port}` : ""}`;
			this[kConnector] = connect;
			this[kPipelining] = pipelining != null ? pipelining : 1;
			this[kMaxHeadersSize] = maxHeaderSize;
			this[kKeepAliveDefaultTimeout] = keepAliveTimeout == null ? 4e3 : keepAliveTimeout;
			this[kKeepAliveMaxTimeout] = keepAliveMaxTimeout == null ? 6e5 : keepAliveMaxTimeout;
			this[kKeepAliveTimeoutThreshold] = keepAliveTimeoutThreshold == null ? 2e3 : keepAliveTimeoutThreshold;
			this[kKeepAliveTimeoutValue] = this[kKeepAliveDefaultTimeout];
			this[kServerName] = null;
			this[kLocalAddress] = localAddress != null ? localAddress : null;
			this[kResuming] = 0;
			this[kNeedDrain] = 0;
			this[kHostHeader] = `host: ${this[kHostAuthority]}\r\n`;
			this[kBodyTimeout] = bodyTimeout != null ? bodyTimeout : 3e5;
			this[kHeadersTimeout] = headersTimeout != null ? headersTimeout : 3e5;
			this[kStrictContentLength] = strictContentLength == null ? true : strictContentLength;
			this[kMaxRequests] = maxRequestsPerClient;
			this[kClosedResolve] = null;
			this[kMaxResponseSize] = maxResponseSize > -1 ? maxResponseSize : -1;
			this[kHTTPContext] = null;
			this[kMaxConcurrentStreams] = maxConcurrentStreams != null ? maxConcurrentStreams : 100;
			this[kHTTP2InitialWindowSize] = initialWindowSize != null ? initialWindowSize : 262144;
			this[kHTTP2ConnectionWindowSize] = connectionWindowSize != null ? connectionWindowSize : 524288;
			this[kPingInterval] = pingInterval != null ? pingInterval : 6e4;
			this[kQueue] = [];
			this[kRunningIdx] = 0;
			this[kPendingIdx] = 0;
			this[kResume] = (sync) => resume(this, sync);
			this[kOnError] = (err) => onError(this, err);
		}
		get pipelining() {
			return this[kPipelining];
		}
		set pipelining(value) {
			this[kPipelining] = value;
			this[kResume](true);
		}
		get stats() {
			return new ClientStats(this);
		}
		get [kPending]() {
			return this[kQueue].length - this[kPendingIdx];
		}
		get [kRunning]() {
			return this[kPendingIdx] - this[kRunningIdx];
		}
		get [kSize]() {
			return this[kQueue].length - this[kRunningIdx];
		}
		get [kConnected]() {
			return !!this[kHTTPContext] && !this[kConnecting] && !this[kHTTPContext].destroyed;
		}
		get [kBusy]() {
			const allowsMux = this[kHTTPContext]?.version === "h2";
			return Boolean(this[kHTTPContext]?.busy(null) || this[kSize] >= (getMaxConcurrent(this) || 1) || this[kPending] > 0 && !allowsMux);
		}
		[kConnect](cb) {
			connect(this);
			this.once("connect", cb);
		}
		[kDispatch](opts, handler) {
			const request = new Request(this[kUrl].origin, opts, handler);
			this[kQueue].push(request);
			if (this[kResuming]) {} else if (util.bodyLength(request.body) == null && util.isIterable(request.body)) {
				this[kResuming] = 1;
				queueMicrotask(() => resume(this));
			} else this[kResume](true);
			if (this[kResuming] && this[kNeedDrain] !== 2 && this[kBusy]) this[kNeedDrain] = 2;
			return this[kNeedDrain] < 2;
		}
		[kClose]() {
			return new Promise((resolve) => {
				if (this[kSize]) this[kClosedResolve] = resolve;
				else resolve(null);
			});
		}
		[kDestroy](err) {
			return new Promise((resolve) => {
				const requests = this[kQueue].splice(this[kPendingIdx]);
				for (let i = 0; i < requests.length; i++) {
					const request = requests[i];
					if (request != null) util.errorRequest(this, request, err);
				}
				const callback = () => {
					if (this[kClosedResolve]) {
						this[kClosedResolve]();
						this[kClosedResolve] = null;
					}
					resolve(null);
				};
				if (this[kHTTPContext]) {
					this[kHTTPContext].destroy(err, callback);
					this[kHTTPContext] = null;
				} else queueMicrotask(callback);
				this[kResume]();
			});
		}
	};
	function onError(client, err) {
		if (client[kRunning] === 0 && err.code !== "UND_ERR_INFO" && err.code !== "UND_ERR_SOCKET") {
			assert$21(client[kPendingIdx] === client[kRunningIdx]);
			const requests = client[kQueue].splice(client[kRunningIdx]);
			for (let i = 0; i < requests.length; i++) {
				const request = requests[i];
				if (request != null) util.errorRequest(client, request, err);
			}
			assert$21(client[kSize] === 0);
		}
	}
	/**
	* @param {Client} client
	* @returns {void}
	*/
	function connect(client) {
		assert$21(!client[kConnecting]);
		assert$21(!client[kHTTPContext]);
		let { host, hostname, protocol, port } = client[kUrl];
		if (hostname[0] === "[") {
			const idx = hostname.indexOf("]");
			assert$21(idx !== -1);
			const ip = hostname.substring(1, idx);
			assert$21(net$1.isIPv6(ip));
			hostname = ip;
		}
		client[kConnecting] = true;
		if (channels.beforeConnect.hasSubscribers) channels.beforeConnect.publish({
			connectParams: {
				host,
				hostname,
				protocol,
				port,
				version: client[kHTTPContext]?.version,
				servername: client[kServerName],
				localAddress: client[kLocalAddress]
			},
			connector: client[kConnector]
		});
		try {
			client[kConnector]({
				host,
				hostname,
				protocol,
				port,
				servername: client[kServerName],
				localAddress: client[kLocalAddress]
			}, (err, socket) => {
				if (err) {
					handleConnectError(client, err, {
						host,
						hostname,
						protocol,
						port
					});
					client[kResume]();
					return;
				}
				if (client.destroyed) {
					util.destroy(socket.on("error", noop), new ClientDestroyedError());
					client[kResume]();
					return;
				}
				assert$21(socket);
				try {
					client[kHTTPContext] = socket.alpnProtocol === "h2" ? connectH2(client, socket) : connectH1(client, socket);
				} catch (err) {
					socket.destroy().on("error", noop);
					handleConnectError(client, err, {
						host,
						hostname,
						protocol,
						port
					});
					client[kResume]();
					return;
				}
				client[kConnecting] = false;
				socket[kCounter] = 0;
				socket[kMaxRequests] = client[kMaxRequests];
				socket[kClient] = client;
				socket[kError] = null;
				if (channels.connected.hasSubscribers) channels.connected.publish({
					connectParams: {
						host,
						hostname,
						protocol,
						port,
						version: client[kHTTPContext]?.version,
						servername: client[kServerName],
						localAddress: client[kLocalAddress]
					},
					connector: client[kConnector],
					socket
				});
				client.emit("connect", client[kUrl], [client]);
				client[kResume]();
			});
		} catch (err) {
			handleConnectError(client, err, {
				host,
				hostname,
				protocol,
				port
			});
			client[kResume]();
		}
	}
	function handleConnectError(client, err, { host, hostname, protocol, port }) {
		if (client.destroyed) return;
		client[kConnecting] = false;
		if (channels.connectError.hasSubscribers) channels.connectError.publish({
			connectParams: {
				host,
				hostname,
				protocol,
				port,
				version: client[kHTTPContext]?.version,
				servername: client[kServerName],
				localAddress: client[kLocalAddress]
			},
			connector: client[kConnector],
			error: err
		});
		if (err.code === "ERR_TLS_CERT_ALTNAME_INVALID") {
			const running = client[kQueue].splice(client[kRunningIdx], client[kRunning]);
			client[kPendingIdx] = client[kRunningIdx];
			for (let i = 0; i < running.length; i++) util.errorRequest(client, running[i], err);
			while (client[kPending] > 0 && client[kQueue][client[kPendingIdx]].servername === client[kServerName]) {
				const request = client[kQueue].splice(client[kPendingIdx], 1)[0];
				util.errorRequest(client, request, err);
			}
		} else onError(client, err);
		client.emit("connectionError", client[kUrl], [client], err);
	}
	function emitDrain(client) {
		client[kNeedDrain] = 0;
		client.emit("drain", client[kUrl], [client]);
	}
	function resume(client, sync) {
		if (client[kResuming] === 2) return;
		client[kResuming] = 2;
		_resume(client, sync);
		client[kResuming] = 0;
		if (client[kRunningIdx] > 256) {
			client[kQueue].splice(0, client[kRunningIdx]);
			client[kPendingIdx] -= client[kRunningIdx];
			client[kRunningIdx] = 0;
		}
	}
	function _resume(client, sync) {
		while (true) {
			if (client.destroyed) {
				assert$21(client[kPending] === 0);
				return;
			}
			if (client[kClosedResolve] && !client[kSize]) {
				client[kClosedResolve]();
				client[kClosedResolve] = null;
				return;
			}
			if (client[kHTTPContext]) client[kHTTPContext].resume();
			if (client[kBusy]) client[kNeedDrain] = 2;
			else if (client[kNeedDrain] === 2) {
				if (sync) {
					client[kNeedDrain] = 1;
					queueMicrotask(() => emitDrain(client));
				} else emitDrain(client);
				continue;
			}
			if (client[kPending] === 0) return;
			if (client[kRunning] >= (getMaxConcurrent(client) || 1)) return;
			const request = client[kQueue][client[kPendingIdx]];
			if (request === null) return;
			if (client[kUrl].protocol === "https:" && client[kServerName] !== request.servername) {
				if (client[kRunning] > 0) return;
				client[kServerName] = request.servername;
				client[kHTTPContext]?.destroy(new InformationalError("servername changed"), () => {
					client[kHTTPContext] = null;
					resume(client);
				});
			}
			if (client[kConnecting]) return;
			if (!client[kHTTPContext]) {
				connect(client);
				return;
			}
			if (client[kHTTPContext].destroyed) return;
			if (client[kHTTPContext].busy(request)) return;
			if (!request.aborted && client[kHTTPContext].write(request)) client[kPendingIdx]++;
			else client[kQueue].splice(client[kPendingIdx], 1);
		}
	}
	module.exports = Client;
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/dispatcher/fixed-queue.js
var require_fixed_queue = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const kSize = 2048;
	const kMask = 2047;
	/**
	* @type {FixedCircularBuffer}
	* @template T
	*/
	var FixedCircularBuffer = class {
		/** @type {number} */
		bottom = 0;
		/** @type {number} */
		top = 0;
		/** @type {Array<T|undefined>} */
		list = new Array(kSize).fill(void 0);
		/** @type {T|null} */
		next = null;
		/** @returns {boolean} */
		isEmpty() {
			return this.top === this.bottom;
		}
		/** @returns {boolean} */
		isFull() {
			return (this.top + 1 & kMask) === this.bottom;
		}
		/**
		* @param {T} data
		* @returns {void}
		*/
		push(data) {
			this.list[this.top] = data;
			this.top = this.top + 1 & kMask;
		}
		/** @returns {T|null} */
		shift() {
			const nextItem = this.list[this.bottom];
			if (nextItem === void 0) return null;
			this.list[this.bottom] = void 0;
			this.bottom = this.bottom + 1 & kMask;
			return nextItem;
		}
	};
	/**
	* @template T
	*/
	module.exports = class FixedQueue {
		constructor() {
			/** @type {FixedCircularBuffer<T>} */
			this.head = this.tail = new FixedCircularBuffer();
		}
		/** @returns {boolean} */
		isEmpty() {
			return this.head.isEmpty();
		}
		/** @param {T} data */
		push(data) {
			if (this.head.isFull()) this.head = this.head.next = new FixedCircularBuffer();
			this.head.push(data);
		}
		/** @returns {T|null} */
		shift() {
			const tail = this.tail;
			const next = tail.shift();
			if (tail.isEmpty() && tail.next !== null) {
				this.tail = tail.next;
				tail.next = null;
			}
			return next;
		}
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/dispatcher/pool-base.js
var require_pool_base = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { PoolStats } = require_stats();
	const DispatcherBase = require_dispatcher_base();
	const FixedQueue = require_fixed_queue();
	const { kConnected, kSize, kRunning, kPending, kQueued, kBusy, kFree, kUrl, kClose, kDestroy, kDispatch } = require_symbols();
	const kClients = Symbol("clients");
	const kNeedDrain = Symbol("needDrain");
	const kQueue = Symbol("queue");
	const kClosedResolve = Symbol("closed resolve");
	const kOnDrain = Symbol("onDrain");
	const kOnConnect = Symbol("onConnect");
	const kOnDisconnect = Symbol("onDisconnect");
	const kOnConnectionError = Symbol("onConnectionError");
	const kGetDispatcher = Symbol("get dispatcher");
	const kHasDispatcher = Symbol("has dispatcher");
	const kAddClient = Symbol("add client");
	const kRemoveClient = Symbol("remove client");
	var PoolBase = class extends DispatcherBase {
		[kQueue] = new FixedQueue();
		[kQueued] = 0;
		[kClients] = [];
		[kNeedDrain] = false;
		[kOnDrain](client, origin, targets) {
			const queue = this[kQueue];
			let needDrain = false;
			while (!needDrain) {
				const item = queue.shift();
				if (!item) break;
				this[kQueued]--;
				needDrain = !client.dispatch(item.opts, item.handler);
			}
			client[kNeedDrain] = needDrain;
			if (!needDrain && this[kNeedDrain]) {
				this[kNeedDrain] = false;
				this.emit("drain", origin, [this, ...targets]);
			}
			if (this[kClosedResolve] && queue.isEmpty()) {
				const closeAll = [];
				for (let i = 0; i < this[kClients].length; i++) {
					const client = this[kClients][i];
					if (!client.destroyed) closeAll.push(client.close());
				}
				return Promise.all(closeAll).then(this[kClosedResolve]);
			}
		}
		[kOnConnect] = (origin, targets) => {
			this.emit("connect", origin, [this, ...targets]);
		};
		[kOnDisconnect] = (origin, targets, err) => {
			this.emit("disconnect", origin, [this, ...targets], err);
		};
		[kOnConnectionError] = (origin, targets, err) => {
			this.emit("connectionError", origin, [this, ...targets], err);
		};
		get [kBusy]() {
			return this[kNeedDrain];
		}
		get [kConnected]() {
			let ret = 0;
			for (const { [kConnected]: connected } of this[kClients]) ret += connected;
			return ret;
		}
		get [kFree]() {
			let ret = 0;
			for (const { [kConnected]: connected, [kNeedDrain]: needDrain } of this[kClients]) ret += connected && !needDrain;
			return ret;
		}
		get [kPending]() {
			let ret = this[kQueued];
			for (const { [kPending]: pending } of this[kClients]) ret += pending;
			return ret;
		}
		get [kRunning]() {
			let ret = 0;
			for (const { [kRunning]: running } of this[kClients]) ret += running;
			return ret;
		}
		get [kSize]() {
			let ret = this[kQueued];
			for (const { [kSize]: size } of this[kClients]) ret += size;
			return ret;
		}
		get stats() {
			return new PoolStats(this);
		}
		[kClose]() {
			if (this[kQueue].isEmpty()) {
				const closeAll = [];
				for (let i = 0; i < this[kClients].length; i++) {
					const client = this[kClients][i];
					if (!client.destroyed) closeAll.push(client.close());
				}
				return Promise.all(closeAll);
			} else return new Promise((resolve) => {
				this[kClosedResolve] = resolve;
			});
		}
		[kDestroy](err) {
			while (true) {
				const item = this[kQueue].shift();
				if (!item) break;
				item.handler.onResponseError(null, err);
			}
			const destroyAll = new Array(this[kClients].length);
			for (let i = 0; i < this[kClients].length; i++) destroyAll[i] = this[kClients][i].destroy(err);
			return Promise.all(destroyAll);
		}
		[kDispatch](opts, handler) {
			const dispatcher = this[kGetDispatcher]();
			if (!dispatcher) {
				this[kNeedDrain] = true;
				this[kQueue].push({
					opts,
					handler
				});
				this[kQueued]++;
			} else if (!dispatcher.dispatch(opts, handler)) {
				dispatcher[kNeedDrain] = true;
				this[kNeedDrain] = !this[kHasDispatcher]();
			}
			return !this[kNeedDrain];
		}
		[kHasDispatcher]() {
			for (let i = 0; i < this[kClients].length; i++) {
				const dispatcher = this[kClients][i];
				if (!dispatcher[kNeedDrain] && dispatcher.closed !== true && dispatcher.destroyed !== true) return true;
			}
			return false;
		}
		[kAddClient](client) {
			client.on("drain", this[kOnDrain].bind(this, client)).on("connect", this[kOnConnect]).on("disconnect", this[kOnDisconnect]).on("connectionError", this[kOnConnectionError]);
			this[kClients].push(client);
			if (this[kNeedDrain]) queueMicrotask(() => {
				if (this[kNeedDrain]) this[kOnDrain](client, client[kUrl], [client, this]);
			});
			return this;
		}
		[kRemoveClient](client) {
			const idx = this[kClients].indexOf(client);
			if (idx !== -1) this[kClients].splice(idx, 1);
			client.close(() => {});
			this[kNeedDrain] = !this[kClients].some((dispatcher) => !dispatcher[kNeedDrain] && dispatcher.closed !== true && dispatcher.destroyed !== true);
		}
	};
	module.exports = {
		PoolBase,
		kClients,
		kNeedDrain,
		kAddClient,
		kRemoveClient,
		kGetDispatcher,
		kHasDispatcher
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/dispatcher/pool.js
var require_pool = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { PoolBase, kClients, kNeedDrain, kAddClient, kGetDispatcher, kHasDispatcher, kRemoveClient } = require_pool_base();
	const Client = require_client();
	const { InvalidArgumentError } = require_errors();
	const util = require_util$5();
	const { kUrl } = require_symbols();
	const buildConnector = require_connect();
	const kOptions = Symbol("options");
	const kConnections = Symbol("connections");
	const kFactory = Symbol("factory");
	function defaultFactory(origin, opts) {
		return new Client(origin, opts);
	}
	var Pool = class extends PoolBase {
		constructor(origin, { connections, factory = defaultFactory, connect, connectTimeout, tls, maxCachedSessions, socketPath, autoSelectFamily, autoSelectFamilyAttemptTimeout, allowH2, useH2c, clientTtl, ...options } = {}) {
			if (connections != null && (!Number.isFinite(connections) || connections < 0)) throw new InvalidArgumentError("invalid connections");
			if (typeof factory !== "function") throw new InvalidArgumentError("factory must be a function.");
			if (connect != null && typeof connect !== "function" && typeof connect !== "object") throw new InvalidArgumentError("connect must be a function or an object");
			if (typeof connect !== "function") connect = buildConnector({
				...tls,
				maxCachedSessions,
				allowH2,
				useH2c,
				socketPath,
				timeout: connectTimeout,
				...typeof autoSelectFamily === "boolean" ? {
					autoSelectFamily,
					autoSelectFamilyAttemptTimeout
				} : void 0,
				...connect
			});
			super(options);
			this[kConnections] = connections || null;
			this[kUrl] = util.parseOrigin(origin);
			this[kOptions] = {
				...util.deepClone(options),
				connect,
				allowH2,
				useH2c,
				clientTtl,
				socketPath
			};
			this[kFactory] = factory;
			this.on("connect", (origin, targets) => {
				if (clientTtl != null && clientTtl > 0) for (const target of targets) Object.assign(target, { ttl: Date.now() });
			});
			this.on("connectionError", (origin, targets, error) => {
				for (const target of targets) {
					const idx = this[kClients].indexOf(target);
					if (idx !== -1) this[kClients].splice(idx, 1);
				}
			});
		}
		[kGetDispatcher]() {
			const clientTtlOption = this[kOptions].clientTtl;
			for (let i = 0; i < this[kClients].length; i++) {
				const client = this[kClients][i];
				if (clientTtlOption != null && clientTtlOption > 0 && client.ttl && Date.now() - client.ttl > clientTtlOption) {
					this[kRemoveClient](client);
					i--;
				} else if (!client[kNeedDrain]) return client;
			}
			if (!this[kConnections] || this[kClients].length < this[kConnections]) {
				const dispatcher = this[kFactory](this[kUrl], this[kOptions]);
				this[kAddClient](dispatcher);
				return dispatcher;
			}
		}
		[kHasDispatcher]() {
			const clientTtlOption = this[kOptions].clientTtl;
			for (let i = 0; i < this[kClients].length; i++) {
				const client = this[kClients][i];
				if (clientTtlOption != null && clientTtlOption > 0 && client.ttl && Date.now() - client.ttl > clientTtlOption) {
					this[kRemoveClient](client);
					i--;
				} else if (!client[kNeedDrain]) return true;
			}
			if (!this[kConnections] || this[kClients].length < this[kConnections]) {
				const dispatcher = this[kFactory](this[kUrl], this[kOptions]);
				this[kAddClient](dispatcher);
				return true;
			}
			return false;
		}
	};
	module.exports = Pool;
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/dispatcher/balanced-pool.js
var require_balanced_pool = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { BalancedPoolMissingUpstreamError, InvalidArgumentError } = require_errors();
	const { PoolBase, kClients, kNeedDrain, kAddClient, kRemoveClient, kGetDispatcher } = require_pool_base();
	const Pool = require_pool();
	const { kUrl } = require_symbols();
	const util = require_util$5();
	const kFactory = Symbol("factory");
	const kOptions = Symbol("options");
	const kGreatestCommonDivisor = Symbol("kGreatestCommonDivisor");
	const kCurrentWeight = Symbol("kCurrentWeight");
	const kIndex = Symbol("kIndex");
	const kWeight = Symbol("kWeight");
	const kMaxWeightPerServer = Symbol("kMaxWeightPerServer");
	const kErrorPenalty = Symbol("kErrorPenalty");
	/**
	* Calculate the greatest common divisor of two numbers by
	* using the Euclidean algorithm.
	*
	* @param {number} a
	* @param {number} b
	* @returns {number}
	*/
	function getGreatestCommonDivisor(a, b) {
		if (a === 0) return b;
		while (b !== 0) {
			const t = b;
			b = a % b;
			a = t;
		}
		return a;
	}
	function defaultFactory(origin, opts) {
		return new Pool(origin, opts);
	}
	var BalancedPool = class extends PoolBase {
		constructor(upstreams = [], { factory = defaultFactory, ...opts } = {}) {
			if (typeof factory !== "function") throw new InvalidArgumentError("factory must be a function.");
			super();
			this[kOptions] = { ...util.deepClone(opts) };
			this[kIndex] = -1;
			this[kCurrentWeight] = 0;
			this[kMaxWeightPerServer] = this[kOptions].maxWeightPerServer || 100;
			this[kErrorPenalty] = this[kOptions].errorPenalty || 15;
			if (!Array.isArray(upstreams)) upstreams = [upstreams];
			this[kFactory] = factory;
			for (const upstream of upstreams) this.addUpstream(upstream);
			this._updateBalancedPoolStats();
		}
		addUpstream(upstream) {
			const upstreamOrigin = util.parseOrigin(upstream).origin;
			if (this[kClients].find((pool) => pool[kUrl].origin === upstreamOrigin && pool.closed !== true && pool.destroyed !== true)) return this;
			const pool = this[kFactory](upstreamOrigin, this[kOptions]);
			this[kAddClient](pool);
			pool.on("connect", () => {
				pool[kWeight] = Math.min(this[kMaxWeightPerServer], pool[kWeight] + this[kErrorPenalty]);
			});
			pool.on("connectionError", () => {
				pool[kWeight] = Math.max(1, pool[kWeight] - this[kErrorPenalty]);
				this._updateBalancedPoolStats();
			});
			pool.on("disconnect", (...args) => {
				const err = args[2];
				if (err && err.code === "UND_ERR_SOCKET") {
					pool[kWeight] = Math.max(1, pool[kWeight] - this[kErrorPenalty]);
					this._updateBalancedPoolStats();
				}
			});
			for (const client of this[kClients]) client[kWeight] = this[kMaxWeightPerServer];
			this._updateBalancedPoolStats();
			return this;
		}
		_updateBalancedPoolStats() {
			let result = 0;
			for (let i = 0; i < this[kClients].length; i++) result = getGreatestCommonDivisor(this[kClients][i][kWeight], result);
			this[kGreatestCommonDivisor] = result;
		}
		removeUpstream(upstream) {
			const upstreamOrigin = util.parseOrigin(upstream).origin;
			const pool = this[kClients].find((pool) => pool[kUrl].origin === upstreamOrigin && pool.closed !== true && pool.destroyed !== true);
			if (pool) this[kRemoveClient](pool);
			return this;
		}
		getUpstream(upstream) {
			const upstreamOrigin = util.parseOrigin(upstream).origin;
			return this[kClients].find((pool) => pool[kUrl].origin === upstreamOrigin && pool.closed !== true && pool.destroyed !== true);
		}
		get upstreams() {
			return this[kClients].filter((dispatcher) => dispatcher.closed !== true && dispatcher.destroyed !== true).map((p) => p[kUrl].origin);
		}
		[kGetDispatcher]() {
			if (this[kClients].length === 0) throw new BalancedPoolMissingUpstreamError();
			let counter = 0;
			let maxWeightIndex = -1;
			while (counter++ < this[kClients].length) {
				this[kIndex] = (this[kIndex] + 1) % this[kClients].length;
				const pool = this[kClients][this[kIndex]];
				if (this[kIndex] === 0) {
					this[kCurrentWeight] = this[kCurrentWeight] - this[kGreatestCommonDivisor];
					if (this[kCurrentWeight] <= 0) this[kCurrentWeight] = this[kMaxWeightPerServer];
				}
				if (pool[kNeedDrain] || pool.closed === true || pool.destroyed === true) continue;
				if (maxWeightIndex === -1 || pool[kWeight] > this[kClients][maxWeightIndex][kWeight]) maxWeightIndex = this[kIndex];
				if (pool[kWeight] >= this[kCurrentWeight]) return pool;
			}
			if (maxWeightIndex === -1) return;
			this[kCurrentWeight] = this[kClients][maxWeightIndex][kWeight];
			this[kIndex] = maxWeightIndex;
			return this[kClients][maxWeightIndex];
		}
	};
	module.exports = BalancedPool;
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/dispatcher/round-robin-pool.js
var require_round_robin_pool = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { PoolBase, kClients, kNeedDrain, kAddClient, kGetDispatcher, kHasDispatcher, kRemoveClient } = require_pool_base();
	const Client = require_client();
	const { InvalidArgumentError } = require_errors();
	const util = require_util$5();
	const { kUrl } = require_symbols();
	const buildConnector = require_connect();
	const kOptions = Symbol("options");
	const kConnections = Symbol("connections");
	const kFactory = Symbol("factory");
	const kIndex = Symbol("index");
	function defaultFactory(origin, opts) {
		return new Client(origin, opts);
	}
	var RoundRobinPool = class extends PoolBase {
		constructor(origin, { connections, factory = defaultFactory, connect, connectTimeout, tls, maxCachedSessions, socketPath, autoSelectFamily, autoSelectFamilyAttemptTimeout, allowH2, clientTtl, ...options } = {}) {
			if (connections != null && (!Number.isFinite(connections) || connections < 0)) throw new InvalidArgumentError("invalid connections");
			if (typeof factory !== "function") throw new InvalidArgumentError("factory must be a function.");
			if (connect != null && typeof connect !== "function" && typeof connect !== "object") throw new InvalidArgumentError("connect must be a function or an object");
			if (typeof connect !== "function") connect = buildConnector({
				...tls,
				maxCachedSessions,
				allowH2,
				socketPath,
				timeout: connectTimeout,
				...typeof autoSelectFamily === "boolean" ? {
					autoSelectFamily,
					autoSelectFamilyAttemptTimeout
				} : void 0,
				...connect
			});
			super();
			this[kConnections] = connections || null;
			this[kUrl] = util.parseOrigin(origin);
			this[kOptions] = {
				...util.deepClone(options),
				connect,
				allowH2,
				clientTtl,
				socketPath
			};
			this[kFactory] = factory;
			this[kIndex] = -1;
			this.on("connect", (origin, targets) => {
				if (clientTtl != null && clientTtl > 0) for (const target of targets) Object.assign(target, { ttl: Date.now() });
			});
			this.on("connectionError", (origin, targets, error) => {
				for (const target of targets) {
					const idx = this[kClients].indexOf(target);
					if (idx !== -1) this[kClients].splice(idx, 1);
				}
			});
		}
		[kGetDispatcher]() {
			const clientTtlOption = this[kOptions].clientTtl;
			if (this[kClients].length === 0) {
				const dispatcher = this[kFactory](this[kUrl], this[kOptions]);
				this[kAddClient](dispatcher);
				return dispatcher;
			}
			let checked = 0;
			while (checked < this[kClients].length) {
				this[kIndex] = (this[kIndex] + 1) % this[kClients].length;
				const client = this[kClients][this[kIndex]];
				if (clientTtlOption != null && clientTtlOption > 0 && client.ttl && Date.now() - client.ttl > clientTtlOption) {
					this[kRemoveClient](client);
					this[kIndex]--;
					continue;
				}
				if (!client[kNeedDrain]) return client;
				checked++;
			}
			if (!this[kConnections] || this[kClients].length < this[kConnections]) {
				const dispatcher = this[kFactory](this[kUrl], this[kOptions]);
				this[kAddClient](dispatcher);
				return dispatcher;
			}
		}
		[kHasDispatcher]() {
			const clientTtlOption = this[kOptions].clientTtl;
			for (let i = 0; i < this[kClients].length; i++) {
				const client = this[kClients][i];
				if (clientTtlOption != null && clientTtlOption > 0 && client.ttl && Date.now() - client.ttl > clientTtlOption) {
					this[kRemoveClient](client);
					if (i <= this[kIndex]) this[kIndex]--;
					i--;
				} else if (!client[kNeedDrain]) return true;
			}
			if (!this[kConnections] || this[kClients].length < this[kConnections]) {
				const dispatcher = this[kFactory](this[kUrl], this[kOptions]);
				this[kAddClient](dispatcher);
				return true;
			}
			return false;
		}
	};
	module.exports = RoundRobinPool;
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/dispatcher/agent.js
var require_agent = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { InvalidArgumentError, MaxOriginsReachedError } = require_errors();
	const { kBusy, kClients, kConnected, kRunning, kClose, kDestroy, kDispatch, kUrl } = require_symbols();
	const DispatcherBase = require_dispatcher_base();
	const Pool = require_pool();
	const Client = require_client();
	const util = require_util$5();
	const kOnConnect = Symbol("onConnect");
	const kOnDisconnect = Symbol("onDisconnect");
	const kOnConnectionError = Symbol("onConnectionError");
	const kOnDrain = Symbol("onDrain");
	const kFactory = Symbol("factory");
	const kOptions = Symbol("options");
	const kOrigins = Symbol("origins");
	function defaultFactory(origin, opts) {
		return opts && opts.connections === 1 ? new Client(origin, opts) : new Pool(origin, opts);
	}
	var Agent = class extends DispatcherBase {
		constructor({ factory = defaultFactory, maxOrigins = Infinity, connect, ...options } = {}) {
			if (typeof factory !== "function") throw new InvalidArgumentError("factory must be a function.");
			if (connect != null && typeof connect !== "function" && typeof connect !== "object") throw new InvalidArgumentError("connect must be a function or an object");
			if (typeof maxOrigins !== "number" || Number.isNaN(maxOrigins) || maxOrigins <= 0) throw new InvalidArgumentError("maxOrigins must be a number greater than 0");
			super(options);
			if (connect && typeof connect !== "function") connect = { ...connect };
			this[kOptions] = {
				...util.deepClone(options),
				maxOrigins,
				connect
			};
			this[kFactory] = factory;
			this[kClients] = /* @__PURE__ */ new Map();
			this[kOrigins] = /* @__PURE__ */ new Set();
			this[kOnDrain] = (origin, targets) => {
				this.emit("drain", origin, [this, ...targets]);
			};
			this[kOnConnect] = (origin, targets) => {
				this.emit("connect", origin, [this, ...targets]);
			};
			this[kOnDisconnect] = (origin, targets, err) => {
				this.emit("disconnect", origin, [this, ...targets], err);
			};
			this[kOnConnectionError] = (origin, targets, err) => {
				this.emit("connectionError", origin, [this, ...targets], err);
			};
		}
		get [kRunning]() {
			let ret = 0;
			for (const dispatcher of this[kClients].values()) ret += dispatcher[kRunning];
			return ret;
		}
		[kDispatch](opts, handler) {
			let origin;
			if (opts.origin && (typeof opts.origin === "string" || opts.origin instanceof URL)) origin = String(opts.origin);
			else throw new InvalidArgumentError("opts.origin must be a non-empty string or URL.");
			const allowH2 = opts.allowH2 ?? this[kOptions].allowH2;
			const key = allowH2 === false ? `${origin}#http1-only` : origin;
			if (this[kOrigins].size >= this[kOptions].maxOrigins && !this[kOrigins].has(origin)) throw new MaxOriginsReachedError();
			let dispatcher = this[kClients].get(key);
			if (!dispatcher) {
				dispatcher = this[kFactory](opts.origin, allowH2 === false ? {
					...this[kOptions],
					allowH2: false
				} : this[kOptions]);
				const closeClientIfUnused = () => {
					if (this[kClients].get(key) !== dispatcher) return;
					if (dispatcher[kConnected] > 0 || dispatcher[kBusy]) return;
					this[kClients].delete(key);
					if (!dispatcher.destroyed) dispatcher.close();
					let hasOrigin = false;
					for (const k of this[kClients].keys()) if (k === origin || k === `${origin}#http1-only`) {
						hasOrigin = true;
						break;
					}
					if (!hasOrigin) this[kOrigins].delete(origin);
				};
				dispatcher.on("drain", this[kOnDrain]).on("connect", this[kOnConnect]).on("disconnect", (origin, targets, err) => {
					closeClientIfUnused();
					this[kOnDisconnect](origin, targets, err);
				}).on("connectionError", (origin, targets, err) => {
					closeClientIfUnused();
					this[kOnConnectionError](origin, targets, err);
				});
				this[kClients].set(key, dispatcher);
				this[kOrigins].add(origin);
			}
			return dispatcher.dispatch(opts, handler);
		}
		[kClose]() {
			const closePromises = [];
			for (const dispatcher of this[kClients].values()) closePromises.push(dispatcher.close());
			this[kClients].clear();
			return Promise.all(closePromises);
		}
		[kDestroy](err) {
			const destroyPromises = [];
			for (const dispatcher of this[kClients].values()) destroyPromises.push(dispatcher.destroy(err));
			this[kClients].clear();
			return Promise.all(destroyPromises);
		}
		get stats() {
			const allClientStats = {};
			for (const dispatcher of this[kClients].values()) if (dispatcher.stats) allClientStats[dispatcher[kUrl].origin] = dispatcher.stats;
			return allClientStats;
		}
	};
	module.exports = Agent;
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/dispatcher/dispatcher1-wrapper.js
var require_dispatcher1_wrapper = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const Dispatcher = require_dispatcher();
	const { InvalidArgumentError } = require_errors();
	const { toRawHeaders } = require_util$5();
	var LegacyHandlerWrapper = class {
		#handler;
		constructor(handler) {
			this.#handler = handler;
		}
		onRequestStart(controller, context) {
			this.#handler.onConnect?.((reason) => controller.abort(reason), context);
		}
		onRequestUpgrade(controller, statusCode, headers, socket) {
			const rawHeaders = controller?.rawHeaders ?? toRawHeaders(headers ?? {});
			this.#handler.onUpgrade?.(statusCode, rawHeaders, socket);
		}
		onResponseStart(controller, statusCode, headers, statusMessage) {
			const rawHeaders = controller?.rawHeaders ?? toRawHeaders(headers ?? {});
			if (this.#handler.onHeaders?.(statusCode, rawHeaders, () => controller.resume(), statusMessage) === false) controller.pause();
		}
		onResponseData(controller, chunk) {
			if (this.#handler.onData?.(chunk) === false) controller.pause();
		}
		onResponseEnd(controller, trailers) {
			const rawTrailers = controller?.rawTrailers ?? toRawHeaders(trailers ?? {});
			this.#handler.onComplete?.(rawTrailers);
		}
		onResponseError(_controller, err) {
			if (!this.#handler.onError) throw err;
			this.#handler.onError(err);
		}
		onBodySent(chunk) {
			this.#handler.onBodySent?.(chunk);
		}
		onRequestSent() {
			this.#handler.onRequestSent?.();
		}
		onResponseStarted() {
			this.#handler.onResponseStarted?.();
		}
	};
	module.exports = class Dispatcher1Wrapper extends Dispatcher {
		#dispatcher;
		constructor(dispatcher) {
			super();
			if (!dispatcher || typeof dispatcher.dispatch !== "function") throw new InvalidArgumentError("Argument dispatcher must implement dispatch");
			this.#dispatcher = dispatcher;
		}
		static wrapHandler(handler) {
			if (!handler || typeof handler !== "object") throw new InvalidArgumentError("handler must be an object");
			if (typeof handler.onRequestStart === "function") return handler;
			return new LegacyHandlerWrapper(handler);
		}
		dispatch(opts, handler) {
			if (opts.allowH2 !== false) opts = {
				...opts,
				allowH2: false
			};
			return this.#dispatcher.dispatch(opts, Dispatcher1Wrapper.wrapHandler(handler));
		}
		close(...args) {
			return this.#dispatcher.close(...args);
		}
		destroy(...args) {
			return this.#dispatcher.destroy(...args);
		}
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/core/socks5-utils.js
var require_socks5_utils = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { Buffer: Buffer$2 } = __require("node:buffer");
	const net = __require("node:net");
	const { InvalidArgumentError } = require_errors();
	/**
	* Parse an address and determine its type
	* @param {string} address - The address to parse
	* @returns {{type: number, buffer: Buffer}} Address type and buffer
	*/
	function parseAddress(address) {
		if (net.isIPv4(address)) {
			const parts = address.split(".").map(Number);
			return {
				type: 1,
				buffer: Buffer$2.from(parts)
			};
		}
		if (net.isIPv6(address)) return {
			type: 4,
			buffer: parseIPv6(address)
		};
		const domainBuffer = Buffer$2.from(address, "utf8");
		if (domainBuffer.length > 255) throw new InvalidArgumentError("Domain name too long (max 255 bytes)");
		return {
			type: 3,
			buffer: Buffer$2.concat([Buffer$2.from([domainBuffer.length]), domainBuffer])
		};
	}
	/**
	* Parse IPv6 address to buffer
	* @param {string} address - IPv6 address string
	* @returns {Buffer} 16-byte buffer
	*/
	function parseIPv6(address) {
		const buffer = Buffer$2.alloc(16);
		let normalizedAddress = address;
		if (address.includes(".")) {
			const lastColonIndex = address.lastIndexOf(":");
			const ipv4Part = address.slice(lastColonIndex + 1);
			if (net.isIPv4(ipv4Part)) {
				const octets = ipv4Part.split(".").map(Number);
				const high = (octets[0] << 8 | octets[1]).toString(16);
				const low = (octets[2] << 8 | octets[3]).toString(16);
				normalizedAddress = `${address.slice(0, lastColonIndex)}:${high}:${low}`;
			}
		}
		const doubleColonIndex = normalizedAddress.indexOf("::");
		if (doubleColonIndex !== -1) {
			const before = normalizedAddress.slice(0, doubleColonIndex);
			const after = normalizedAddress.slice(doubleColonIndex + 2);
			const beforeParts = before === "" ? [] : before.split(":");
			const afterParts = after === "" ? [] : after.split(":");
			let bufferIndex = 0;
			for (const part of beforeParts) {
				buffer.writeUInt16BE(parseInt(part, 16), bufferIndex);
				bufferIndex += 2;
			}
			bufferIndex = 16 - afterParts.length * 2;
			for (const part of afterParts) {
				buffer.writeUInt16BE(parseInt(part, 16), bufferIndex);
				bufferIndex += 2;
			}
		} else {
			const parts = normalizedAddress.split(":");
			for (let i = 0; i < parts.length; i++) buffer.writeUInt16BE(parseInt(parts[i], 16), i * 2);
		}
		return buffer;
	}
	/**
	* Build a SOCKS5 address buffer
	* @param {number} type - Address type (1=IPv4, 3=Domain, 4=IPv6)
	* @param {Buffer} addressBuffer - The address data
	* @param {number} port - Port number
	* @returns {Buffer} Complete address buffer including type, address, and port
	*/
	function buildAddressBuffer(type, addressBuffer, port) {
		const portBuffer = Buffer$2.allocUnsafe(2);
		portBuffer.writeUInt16BE(port, 0);
		return Buffer$2.concat([
			Buffer$2.from([type]),
			addressBuffer,
			portBuffer
		]);
	}
	/**
	* Parse address from SOCKS5 response
	* @param {Buffer} buffer - Buffer containing the address
	* @param {number} offset - Starting offset in buffer
	* @returns {{address: string, port: number, bytesRead: number}}
	*/
	function parseResponseAddress(buffer, offset = 0) {
		if (buffer.length < offset + 1) throw new InvalidArgumentError("Buffer too small to contain address type");
		const addressType = buffer[offset];
		let address;
		let currentOffset = offset + 1;
		switch (addressType) {
			case 1:
				if (buffer.length < currentOffset + 6) throw new InvalidArgumentError("Buffer too small for IPv4 address");
				address = Array.from(buffer.subarray(currentOffset, currentOffset + 4)).join(".");
				currentOffset += 4;
				break;
			case 3: {
				if (buffer.length < currentOffset + 1) throw new InvalidArgumentError("Buffer too small for domain length");
				const domainLength = buffer[currentOffset];
				currentOffset += 1;
				if (buffer.length < currentOffset + domainLength + 2) throw new InvalidArgumentError("Buffer too small for domain address");
				address = buffer.subarray(currentOffset, currentOffset + domainLength).toString("utf8");
				currentOffset += domainLength;
				break;
			}
			case 4: {
				if (buffer.length < currentOffset + 18) throw new InvalidArgumentError("Buffer too small for IPv6 address");
				const parts = [];
				for (let i = 0; i < 8; i++) {
					const value = buffer.readUInt16BE(currentOffset + i * 2);
					parts.push(value.toString(16));
				}
				address = parts.join(":");
				currentOffset += 16;
				break;
			}
			default: throw new InvalidArgumentError(`Invalid address type: ${addressType}`);
		}
		if (buffer.length < currentOffset + 2) throw new InvalidArgumentError("Buffer too small for port");
		const port = buffer.readUInt16BE(currentOffset);
		currentOffset += 2;
		return {
			address,
			port,
			bytesRead: currentOffset - offset
		};
	}
	/**
	* Create error for SOCKS5 reply code
	* @param {number} replyCode - SOCKS5 reply code
	* @returns {Error} Appropriate error object
	*/
	function createReplyError(replyCode) {
		const message = {
			1: "General SOCKS server failure",
			2: "Connection not allowed by ruleset",
			3: "Network unreachable",
			4: "Host unreachable",
			5: "Connection refused",
			6: "TTL expired",
			7: "Command not supported",
			8: "Address type not supported"
		}[replyCode] || `Unknown SOCKS5 error code: ${replyCode}`;
		const error = new Error(message);
		error.code = `SOCKS5_${replyCode}`;
		return error;
	}
	module.exports = {
		parseAddress,
		parseIPv6,
		buildAddressBuffer,
		parseResponseAddress,
		createReplyError
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/core/socks5-client.js
var require_socks5_client = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { EventEmitter: EventEmitter$1 } = __require("node:events");
	const { Buffer: Buffer$1 } = __require("node:buffer");
	const { InvalidArgumentError, Socks5ProxyError } = require_errors();
	const { debuglog: debuglog$1 } = __require("node:util");
	const { parseAddress } = require_socks5_utils();
	const debug = debuglog$1("undici:socks5");
	const EMPTY_BUFFER = Buffer$1.alloc(0);
	const SOCKS_VERSION = 5;
	const AUTH_METHODS = {
		NO_AUTH: 0,
		GSSAPI: 1,
		USERNAME_PASSWORD: 2,
		NO_ACCEPTABLE: 255
	};
	const COMMANDS = {
		CONNECT: 1,
		BIND: 2,
		UDP_ASSOCIATE: 3
	};
	const ADDRESS_TYPES = {
		IPV4: 1,
		DOMAIN: 3,
		IPV6: 4
	};
	const REPLY_CODES = {
		SUCCEEDED: 0,
		GENERAL_FAILURE: 1,
		CONNECTION_NOT_ALLOWED: 2,
		NETWORK_UNREACHABLE: 3,
		HOST_UNREACHABLE: 4,
		CONNECTION_REFUSED: 5,
		TTL_EXPIRED: 6,
		COMMAND_NOT_SUPPORTED: 7,
		ADDRESS_TYPE_NOT_SUPPORTED: 8
	};
	const STATES = {
		INITIAL: "initial",
		HANDSHAKING: "handshaking",
		AUTHENTICATING: "authenticating",
		AUTHENTICATED: "authenticated",
		CONNECTING: "connecting",
		CONNECTED: "connected",
		ERROR: "error",
		CLOSED: "closed"
	};
	/**
	* SOCKS5 client implementation
	* Handles SOCKS5 protocol negotiation and connection establishment
	*/
	var Socks5Client = class extends EventEmitter$1 {
		constructor(socket, options = {}) {
			super();
			if (!socket) throw new InvalidArgumentError("socket is required");
			this.socket = socket;
			this.options = options;
			this.state = STATES.INITIAL;
			this.buffer = EMPTY_BUFFER;
			this.onSocketData = this.onData.bind(this);
			this.onSocketError = this.onError.bind(this);
			this.onSocketClose = this.onClose.bind(this);
			this.authMethods = [];
			if (options.username && options.password) this.authMethods.push(AUTH_METHODS.USERNAME_PASSWORD);
			this.authMethods.push(AUTH_METHODS.NO_AUTH);
			this.socket.on("data", this.onSocketData);
			this.socket.on("error", this.onSocketError);
			this.socket.on("close", this.onSocketClose);
		}
		/**
		* Handle incoming data from the socket
		*/
		onData(data) {
			debug("received data", data.length, "bytes in state", this.state);
			this.buffer = Buffer$1.concat([this.buffer, data]);
			try {
				switch (this.state) {
					case STATES.HANDSHAKING:
						this.handleHandshakeResponse();
						break;
					case STATES.AUTHENTICATING:
						this.handleAuthResponse();
						break;
					case STATES.CONNECTING: this.handleConnectResponse();
				}
			} catch (err) {
				this.onError(err);
			}
		}
		/**
		* Handle socket errors
		*/
		onError(err) {
			debug("socket error", err);
			this.state = STATES.ERROR;
			this.emit("error", err);
			this.destroy();
		}
		/**
		* Handle socket close
		*/
		onClose() {
			debug("socket closed");
			this.state = STATES.CLOSED;
			this.emit("close");
		}
		/**
		* Destroy the client and underlying socket
		*/
		destroy() {
			if (this.socket && !this.socket.destroyed) this.socket.destroy();
		}
		markAuthenticated() {
			this.state = STATES.AUTHENTICATED;
			this.emit("authenticated");
		}
		/**
		* Start the SOCKS5 handshake
		*/
		handshake() {
			if (this.state !== STATES.INITIAL) throw new InvalidArgumentError("Handshake already started");
			debug("starting handshake with", this.authMethods.length, "auth methods");
			this.state = STATES.HANDSHAKING;
			const request = Buffer$1.alloc(2 + this.authMethods.length);
			request[0] = SOCKS_VERSION;
			request[1] = this.authMethods.length;
			this.authMethods.forEach((method, i) => {
				request[2 + i] = method;
			});
			this.socket.write(request);
		}
		/**
		* Handle handshake response from server
		*/
		handleHandshakeResponse() {
			if (this.buffer.length < 2) return;
			const version = this.buffer[0];
			const method = this.buffer[1];
			if (version !== SOCKS_VERSION) throw new Socks5ProxyError(`Invalid SOCKS version: ${version}`, "UND_ERR_SOCKS5_VERSION");
			if (method === AUTH_METHODS.NO_ACCEPTABLE) throw new Socks5ProxyError("No acceptable authentication method", "UND_ERR_SOCKS5_AUTH_REJECTED");
			this.buffer = this.buffer.subarray(2);
			debug("server selected auth method", method);
			if (method === AUTH_METHODS.NO_AUTH) this.markAuthenticated();
			else if (method === AUTH_METHODS.USERNAME_PASSWORD) {
				this.state = STATES.AUTHENTICATING;
				this.sendAuthRequest();
			} else throw new Socks5ProxyError(`Unsupported authentication method: ${method}`, "UND_ERR_SOCKS5_AUTH_METHOD");
		}
		/**
		* Send username/password authentication request
		*/
		sendAuthRequest() {
			const { username, password } = this.options;
			if (!username || !password) throw new InvalidArgumentError("Username and password required for authentication");
			debug("sending username/password auth");
			const usernameBuffer = Buffer$1.from(username);
			const passwordBuffer = Buffer$1.from(password);
			if (usernameBuffer.length > 255 || passwordBuffer.length > 255) throw new InvalidArgumentError("Username or password too long");
			const request = Buffer$1.alloc(3 + usernameBuffer.length + passwordBuffer.length);
			request[0] = 1;
			request[1] = usernameBuffer.length;
			usernameBuffer.copy(request, 2);
			request[2 + usernameBuffer.length] = passwordBuffer.length;
			passwordBuffer.copy(request, 3 + usernameBuffer.length);
			this.socket.write(request);
		}
		/**
		* Handle authentication response
		*/
		handleAuthResponse() {
			if (this.buffer.length < 2) return;
			const version = this.buffer[0];
			const status = this.buffer[1];
			if (version !== 1) throw new Socks5ProxyError(`Invalid auth sub-negotiation version: ${version}`, "UND_ERR_SOCKS5_AUTH_VERSION");
			if (status !== 0) throw new Socks5ProxyError("Authentication failed", "UND_ERR_SOCKS5_AUTH_FAILED");
			this.buffer = this.buffer.subarray(2);
			debug("authentication successful");
			this.markAuthenticated();
		}
		/**
		* Send CONNECT command
		* @param {string} address - Target address (IP or domain)
		* @param {number} port - Target port
		*/
		connect(address, port) {
			if (this.state === STATES.CONNECTING || this.state === STATES.CONNECTED) throw new InvalidArgumentError("Connection already in progress");
			if (this.state !== STATES.AUTHENTICATED) throw new InvalidArgumentError("Client must be authenticated before CONNECT");
			debug("connecting to", address, port);
			this.state = STATES.CONNECTING;
			const request = this.buildConnectRequest(COMMANDS.CONNECT, address, port);
			this.socket.write(request);
		}
		/**
		* Build a SOCKS5 request
		*/
		buildConnectRequest(command, address, port) {
			const { type: addressType, buffer: addressBuffer } = parseAddress(address);
			const request = Buffer$1.alloc(4 + addressBuffer.length + 2);
			request[0] = SOCKS_VERSION;
			request[1] = command;
			request[2] = 0;
			request[3] = addressType;
			addressBuffer.copy(request, 4);
			request.writeUInt16BE(port, 4 + addressBuffer.length);
			return request;
		}
		/**
		* Handle CONNECT response
		*/
		handleConnectResponse() {
			if (this.buffer.length < 4) return;
			const version = this.buffer[0];
			const reply = this.buffer[1];
			const addressType = this.buffer[3];
			if (version !== SOCKS_VERSION) throw new Socks5ProxyError(`Invalid SOCKS version in reply: ${version}`, "UND_ERR_SOCKS5_REPLY_VERSION");
			let responseLength = 4;
			if (addressType === ADDRESS_TYPES.IPV4) responseLength += 6;
			else if (addressType === ADDRESS_TYPES.DOMAIN) {
				if (this.buffer.length < 5) return;
				responseLength += 1 + this.buffer[4] + 2;
			} else if (addressType === ADDRESS_TYPES.IPV6) responseLength += 18;
			else throw new Socks5ProxyError(`Invalid address type in reply: ${addressType}`, "UND_ERR_SOCKS5_ADDR_TYPE");
			if (this.buffer.length < responseLength) return;
			if (reply !== REPLY_CODES.SUCCEEDED) {
				const errorMessage = this.getReplyErrorMessage(reply);
				throw new Socks5ProxyError(`SOCKS5 connection failed: ${errorMessage}`, `UND_ERR_SOCKS5_REPLY_${reply}`);
			}
			let boundAddress;
			let offset = 4;
			if (addressType === ADDRESS_TYPES.IPV4) {
				boundAddress = Array.from(this.buffer.subarray(offset, offset + 4)).join(".");
				offset += 4;
			} else if (addressType === ADDRESS_TYPES.DOMAIN) {
				const domainLength = this.buffer[offset];
				offset += 1;
				boundAddress = this.buffer.subarray(offset, offset + domainLength).toString();
				offset += domainLength;
			} else if (addressType === ADDRESS_TYPES.IPV6) {
				const parts = [];
				for (let i = 0; i < 8; i++) {
					const value = this.buffer.readUInt16BE(offset + i * 2);
					parts.push(value.toString(16));
				}
				boundAddress = parts.join(":");
				offset += 16;
			}
			const boundPort = this.buffer.readUInt16BE(offset);
			this.buffer = EMPTY_BUFFER;
			this.state = STATES.CONNECTED;
			this.socket.removeListener("data", this.onSocketData);
			debug("connected, bound address:", boundAddress, "port:", boundPort);
			this.emit("connected", {
				address: boundAddress,
				port: boundPort
			});
		}
		/**
		* Get human-readable error message for reply code
		*/
		getReplyErrorMessage(reply) {
			switch (reply) {
				case REPLY_CODES.GENERAL_FAILURE: return "General SOCKS server failure";
				case REPLY_CODES.CONNECTION_NOT_ALLOWED: return "Connection not allowed by ruleset";
				case REPLY_CODES.NETWORK_UNREACHABLE: return "Network unreachable";
				case REPLY_CODES.HOST_UNREACHABLE: return "Host unreachable";
				case REPLY_CODES.CONNECTION_REFUSED: return "Connection refused";
				case REPLY_CODES.TTL_EXPIRED: return "TTL expired";
				case REPLY_CODES.COMMAND_NOT_SUPPORTED: return "Command not supported";
				case REPLY_CODES.ADDRESS_TYPE_NOT_SUPPORTED: return "Address type not supported";
				default: return `Unknown error code: ${reply}`;
			}
		}
	};
	module.exports = {
		Socks5Client,
		AUTH_METHODS,
		COMMANDS,
		ADDRESS_TYPES,
		REPLY_CODES,
		STATES
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/dispatcher/socks5-proxy-agent.js
var require_socks5_proxy_agent = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { URL: URL$1 } = __require("node:url");
	let tls;
	const DispatcherBase = require_dispatcher_base();
	const { InvalidArgumentError } = require_errors();
	const { Socks5Client, STATES } = require_socks5_client();
	const { kDispatch, kClose, kDestroy } = require_symbols();
	const Pool = require_pool();
	const buildConnector = require_connect();
	const { debuglog } = __require("node:util");
	const debug = debuglog("undici:socks5-proxy");
	const kProxyUrl = Symbol("proxy url");
	const kProxyHeaders = Symbol("proxy headers");
	const kProxyAuth = Symbol("proxy auth");
	const kProxyProtocol = Symbol("proxy protocol");
	const kPools = Symbol("pools");
	const kConnector = Symbol("connector");
	const kRequestTls = Symbol("request tls settings");
	let experimentalWarningEmitted = false;
	/**
	* SOCKS5 proxy agent for dispatching requests through a SOCKS5 proxy
	*/
	var Socks5ProxyAgent = class extends DispatcherBase {
		constructor(proxyUrl, options = {}) {
			super();
			if (!experimentalWarningEmitted) {
				process.emitWarning("SOCKS5 proxy support is experimental and subject to change", "ExperimentalWarning");
				experimentalWarningEmitted = true;
			}
			if (!proxyUrl) throw new InvalidArgumentError("Proxy URL is mandatory");
			const url = typeof proxyUrl === "string" ? new URL$1(proxyUrl) : proxyUrl;
			if (url.protocol !== "socks5:" && url.protocol !== "socks:") throw new InvalidArgumentError("Proxy URL must use socks5:// or socks:// protocol");
			this[kProxyUrl] = url;
			this[kProxyHeaders] = options.headers || {};
			this[kProxyProtocol] = options.proxyTls ? "https:" : "http:";
			this[kRequestTls] = options.requestTls;
			this[kProxyAuth] = {
				username: options.username || (url.username ? decodeURIComponent(url.username) : null),
				password: options.password || (url.password ? decodeURIComponent(url.password) : null)
			};
			this[kConnector] = options.connect || buildConnector({
				...options.proxyTls,
				servername: options.proxyTls?.servername || url.hostname
			});
			this[kPools] = /* @__PURE__ */ new Map();
		}
		/**
		* Create a SOCKS5 connection to the proxy
		*/
		async createSocks5Connection(targetHost, targetPort) {
			const proxyHost = this[kProxyUrl].hostname;
			const proxyPort = parseInt(this[kProxyUrl].port) || 1080;
			debug("creating SOCKS5 connection to", proxyHost, proxyPort);
			const socketReady = Promise.withResolvers();
			this[kConnector]({
				hostname: proxyHost,
				host: proxyHost,
				port: proxyPort,
				protocol: this[kProxyProtocol]
			}, (err, socket) => {
				if (err) socketReady.reject(err);
				else socketReady.resolve(socket);
			});
			const socket = await socketReady.promise;
			const socks5Client = new Socks5Client(socket, this[kProxyAuth]);
			socks5Client.on("error", (err) => {
				debug("SOCKS5 error:", err);
				socket.destroy();
			});
			await socks5Client.handshake();
			const authenticationReady = Promise.withResolvers();
			const authenticationTimeout = setTimeout(() => {
				authenticationReady.reject(/* @__PURE__ */ new Error("SOCKS5 authentication timeout"));
			}, 5e3);
			const onAuthenticated = () => {
				clearTimeout(authenticationTimeout);
				socks5Client.removeListener("error", onAuthenticationError);
				authenticationReady.resolve();
			};
			const onAuthenticationError = (err) => {
				clearTimeout(authenticationTimeout);
				socks5Client.removeListener("authenticated", onAuthenticated);
				authenticationReady.reject(err);
			};
			if (socks5Client.state === STATES.AUTHENTICATED) {
				clearTimeout(authenticationTimeout);
				authenticationReady.resolve();
			} else {
				socks5Client.once("authenticated", onAuthenticated);
				socks5Client.once("error", onAuthenticationError);
			}
			await authenticationReady.promise;
			await socks5Client.connect(targetHost, targetPort);
			const connectionReady = Promise.withResolvers();
			const connectionTimeout = setTimeout(() => {
				connectionReady.reject(/* @__PURE__ */ new Error("SOCKS5 connection timeout"));
			}, 5e3);
			const onConnected = (info) => {
				debug("SOCKS5 tunnel established to", targetHost, targetPort, "via", info);
				clearTimeout(connectionTimeout);
				socks5Client.removeListener("error", onConnectionError);
				connectionReady.resolve();
			};
			const onConnectionError = (err) => {
				clearTimeout(connectionTimeout);
				socks5Client.removeListener("connected", onConnected);
				connectionReady.reject(err);
			};
			socks5Client.once("connected", onConnected);
			socks5Client.once("error", onConnectionError);
			await connectionReady.promise;
			return socket;
		}
		/**
		* Dispatch a request through the SOCKS5 proxy
		*/
		[kDispatch](opts, handler) {
			const { origin } = opts;
			debug("dispatching request to", origin, "via SOCKS5");
			try {
				const originKey = String(origin);
				let pool = this[kPools].get(originKey);
				if (!pool || pool.destroyed || pool.closed) {
					pool = new Pool(origin, {
						pipelining: opts.pipelining,
						connections: opts.connections,
						connect: async (connectOpts, callback) => {
							try {
								const url = new URL$1(origin);
								const targetHost = url.hostname;
								const targetPort = parseInt(url.port) || (url.protocol === "https:" ? 443 : 80);
								debug("establishing SOCKS5 connection to", targetHost, targetPort);
								const socket = await this.createSocks5Connection(targetHost, targetPort);
								let finalSocket = socket;
								if (url.protocol === "https:") {
									if (!tls) tls = __require("node:tls");
									debug("upgrading to TLS");
									finalSocket = tls.connect({
										...this[kRequestTls],
										socket,
										servername: this[kRequestTls]?.servername || targetHost
									});
									const tlsReady = Promise.withResolvers();
									finalSocket.once("secureConnect", tlsReady.resolve);
									finalSocket.once("error", tlsReady.reject);
									await tlsReady.promise;
								}
								callback(null, finalSocket);
							} catch (err) {
								debug("SOCKS5 connection error:", err);
								callback(err);
							}
						}
					});
					this[kPools].set(originKey, pool);
				}
				return pool[kDispatch](opts, handler);
			} catch (err) {
				debug("dispatch error:", err);
				if (typeof handler.onResponseError === "function") {
					handler.onResponseError(null, err);
					return false;
				} else if (typeof handler.onError === "function") {
					handler.onError(err);
					return false;
				} else throw err;
			}
		}
		async [kClose]() {
			const closePromises = [];
			for (const pool of this[kPools].values()) closePromises.push(pool.close());
			this[kPools].clear();
			await Promise.all(closePromises);
		}
		async [kDestroy](err) {
			const destroyPromises = [];
			for (const pool of this[kPools].values()) destroyPromises.push(pool.destroy(err));
			this[kPools].clear();
			await Promise.all(destroyPromises);
		}
	};
	module.exports = Socks5ProxyAgent;
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/dispatcher/proxy-agent.js
var require_proxy_agent = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { kProxy, kClose, kDestroy, kDispatch } = require_symbols();
	const Agent = require_agent();
	const Pool = require_pool();
	const DispatcherBase = require_dispatcher_base();
	const { InvalidArgumentError, RequestAbortedError, SecureProxyConnectionError, ProxyConnectionError } = require_errors();
	const buildConnector = require_connect();
	const Client = require_client();
	const { channels } = require_diagnostics();
	const Socks5ProxyAgent = require_socks5_proxy_agent();
	const kAgent = Symbol("proxy agent");
	const kClient = Symbol("proxy client");
	const kProxyHeaders = Symbol("proxy headers");
	const kRequestTls = Symbol("request tls settings");
	const kProxyTls = Symbol("proxy tls settings");
	const kConnectEndpoint = Symbol("connect endpoint function");
	const kConnectEndpointHTTP1 = Symbol("connect endpoint function (http/1.1 only)");
	const kTunnelProxy = Symbol("tunnel proxy");
	const proxyAuthorization = "proxy-authorization";
	function defaultProtocolPort(protocol) {
		return protocol === "https:" ? 443 : 80;
	}
	function defaultFactory(origin, opts) {
		return new Pool(origin, opts);
	}
	const noop = () => {};
	function defaultAgentFactory(origin, opts) {
		if (opts.connections === 1) return new Client(origin, opts);
		return new Pool(origin, opts);
	}
	function shouldProxyTunnel(requestProtocol, proxyTunnel) {
		return proxyTunnel === true || requestProtocol !== "http:";
	}
	var Http1ProxyWrapper = class extends DispatcherBase {
		#client;
		#proxyServername;
		constructor(proxyUrl, { headers = {}, connect, factory, proxyServername }) {
			if (!proxyUrl) throw new InvalidArgumentError("Proxy URL is mandatory");
			super();
			this[kProxyHeaders] = headers;
			this.#proxyServername = proxyServername;
			if (factory) this.#client = factory(proxyUrl, { connect });
			else this.#client = new Client(proxyUrl, { connect });
		}
		[kDispatch](opts, handler) {
			const onResponseStart = handler.onResponseStart;
			handler.onResponseStart = function(controller, statusCode, data, statusMessage) {
				if (statusCode === 407) {
					if (typeof handler.onResponseError === "function") handler.onResponseError(controller, new InvalidArgumentError("Proxy Authentication Required (407)"));
					return;
				}
				if (onResponseStart) onResponseStart.call(this, controller, statusCode, data, statusMessage);
			};
			const { origin, path = "/", headers = {} } = opts;
			opts.path = origin + path;
			if (!("host" in headers) && !("Host" in headers)) {
				const { host } = new URL(origin);
				headers.host = host;
			}
			opts.headers = {
				...this[kProxyHeaders],
				...headers
			};
			if (this.#proxyServername != null) opts.servername = this.#proxyServername;
			return this.#client[kDispatch](opts, handler);
		}
		[kClose]() {
			return this.#client.close();
		}
		[kDestroy](err) {
			return this.#client.destroy(err);
		}
	};
	var ProxyAgent = class extends DispatcherBase {
		constructor(opts) {
			if (!opts || typeof opts === "object" && !(opts instanceof URL) && !opts.uri) throw new InvalidArgumentError("Proxy uri is mandatory");
			const { clientFactory = defaultFactory } = opts;
			if (typeof clientFactory !== "function") throw new InvalidArgumentError("Proxy opts.clientFactory must be a function.");
			const { proxyTunnel, connectTimeout } = opts;
			super();
			const url = this.#getUrl(opts);
			const { href, origin, port, protocol, username, password, hostname: proxyHostname } = url;
			this[kProxy] = {
				uri: href,
				protocol
			};
			this[kRequestTls] = opts.requestTls;
			this[kProxyTls] = opts.proxyTls;
			this[kProxyHeaders] = opts.headers || {};
			this[kTunnelProxy] = proxyTunnel;
			if (opts.auth && opts.token) throw new InvalidArgumentError("opts.auth cannot be used in combination with opts.token");
			else if (opts.auth) this[kProxyHeaders]["proxy-authorization"] = `Basic ${opts.auth}`;
			else if (opts.token) this[kProxyHeaders]["proxy-authorization"] = opts.token;
			else if (username && password) this[kProxyHeaders]["proxy-authorization"] = `Basic ${Buffer.from(`${decodeURIComponent(username)}:${decodeURIComponent(password)}`).toString("base64")}`;
			else if (username) this[kProxyHeaders]["proxy-authorization"] = `Basic ${Buffer.from(`${decodeURIComponent(username)}:`).toString("base64")}`;
			const connect = buildConnector({
				timeout: connectTimeout,
				...opts.proxyTls
			});
			const connectHTTP1 = buildConnector({
				timeout: connectTimeout,
				...opts.proxyTls,
				allowH2: false
			});
			this[kConnectEndpoint] = buildConnector({
				timeout: connectTimeout,
				...opts.requestTls
			});
			this[kConnectEndpointHTTP1] = buildConnector({
				timeout: connectTimeout,
				...opts.requestTls,
				allowH2: false
			});
			const agentFactory = opts.factory || defaultAgentFactory;
			const factory = (origin, options) => {
				const { protocol } = new URL(origin);
				if (this[kProxy].protocol === "socks5:" || this[kProxy].protocol === "socks:") return new Socks5ProxyAgent(this[kProxy].uri, {
					headers: this[kProxyHeaders],
					connect,
					factory: agentFactory,
					username: opts.username || username,
					password: opts.password || password,
					proxyTls: opts.proxyTls,
					requestTls: opts.requestTls
				});
				if (!shouldProxyTunnel(protocol, this[kTunnelProxy])) {
					const forwardConnect = this[kProxy].protocol === "https:" ? (opts, cb) => connectHTTP1(opts, (err, socket) => {
						if (err && err.code === "ERR_TLS_CERT_ALTNAME_INVALID") cb(new SecureProxyConnectionError(err));
						else cb(err, socket);
					}) : connectHTTP1;
					return new Http1ProxyWrapper(this[kProxy].uri, {
						headers: this[kProxyHeaders],
						connect: forwardConnect,
						factory: agentFactory,
						proxyServername: this[kProxy].protocol === "https:" ? this[kProxyTls]?.servername || proxyHostname : void 0
					});
				}
				return agentFactory(origin, options);
			};
			if (protocol === "socks5:" || protocol === "socks:") this[kClient] = null;
			else this[kClient] = clientFactory(url, { connect });
			this[kAgent] = new Agent({
				...opts,
				factory,
				connect: async (opts, callback) => {
					if (!this[kClient]) {
						callback(new InvalidArgumentError("Cannot establish tunnel connection without a proxy client"));
						return;
					}
					let requestedPath = opts.host;
					if (!opts.port) requestedPath += `:${defaultProtocolPort(opts.protocol)}`;
					try {
						const connectParams = {
							origin,
							port,
							path: requestedPath,
							signal: opts.signal,
							headers: {
								...this[kProxyHeaders],
								host: opts.host,
								...opts.connections == null || opts.connections > 0 ? { "proxy-connection": "keep-alive" } : {}
							},
							servername: this[kProxyTls]?.servername || proxyHostname
						};
						const { socket, statusCode } = await this[kClient].connect(connectParams);
						if (statusCode !== 200) {
							socket.on("error", noop).destroy();
							callback(new RequestAbortedError(`Proxy response (${statusCode}) !== 200 when HTTP Tunneling`));
							return;
						}
						if (channels.proxyConnected.hasSubscribers) channels.proxyConnected.publish({
							socket,
							connectParams
						});
						if (opts.protocol !== "https:") {
							callback(null, socket);
							return;
						}
						let servername;
						if (this[kRequestTls]) servername = this[kRequestTls].servername;
						else servername = opts.servername;
						(opts.allowH2 === false ? this[kConnectEndpointHTTP1] : this[kConnectEndpoint])({
							...opts,
							servername,
							httpSocket: socket
						}, callback);
					} catch (err) {
						if (err.code === "ERR_TLS_CERT_ALTNAME_INVALID") callback(new SecureProxyConnectionError(err));
						else if (err.code === "UND_ERR_SOCKET") callback(new ProxyConnectionError(err));
						else callback(err);
					}
				}
			});
		}
		dispatch(opts, handler) {
			const headers = buildHeaders(opts.headers);
			throwIfProxyAuthIsSent(headers);
			if (headers && !("host" in headers) && !("Host" in headers)) {
				const { host } = new URL(opts.origin);
				headers.host = host;
			}
			return this[kAgent].dispatch({
				...opts,
				headers
			}, handler);
		}
		/**
		* @param {import('../../types/proxy-agent').ProxyAgent.Options | string | URL} opts
		* @returns {URL}
		*/
		#getUrl(opts) {
			if (typeof opts === "string") return new URL(opts);
			else if (opts instanceof URL) return opts;
			else return new URL(opts.uri);
		}
		[kClose]() {
			const promises = [this[kAgent].close()];
			if (this[kClient]) promises.push(this[kClient].close());
			return Promise.all(promises);
		}
		[kDestroy]() {
			const promises = [this[kAgent].destroy()];
			if (this[kClient]) promises.push(this[kClient].destroy());
			return Promise.all(promises);
		}
	};
	/**
	* @param {string[] | Record<string, string>} headers
	* @returns {Record<string, string>}
	*/
	function buildHeaders(headers) {
		if (Array.isArray(headers)) {
			/** @type {Record<string, string>} */
			const headersPair = {};
			for (let i = 0; i < headers.length; i += 2) {
				if (isProxyAuthorizationHeader(headers[i])) throwProxyAuthError();
				headersPair[headers[i]] = headers[i + 1];
			}
			return headersPair;
		}
		return headers;
	}
	/**
	* @param {Record<string, string>} headers
	*
	* Previous versions of ProxyAgent suggests the Proxy-Authorization in request headers
	* Nevertheless, it was changed and to avoid a security vulnerability by end users
	* this check was created.
	* It should be removed in the next major version for performance reasons
	*/
	function throwIfProxyAuthIsSent(headers) {
		for (const key in headers) if (isProxyAuthorizationHeader(key)) throwProxyAuthError();
	}
	/**
	* @param {string} key
	* @returns {boolean}
	*/
	function isProxyAuthorizationHeader(key) {
		return key.length === 19 && key.toLowerCase() === proxyAuthorization;
	}
	function throwProxyAuthError() {
		throw new InvalidArgumentError("Proxy-Authorization should be sent in ProxyAgent constructor");
	}
	module.exports = ProxyAgent;
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/dispatcher/env-http-proxy-agent.js
var require_env_http_proxy_agent = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const DispatcherBase = require_dispatcher_base();
	const { kClose, kDestroy, kClosed, kDestroyed, kDispatch, kNoProxyAgent, kHttpProxyAgent, kHttpsProxyAgent } = require_symbols();
	const ProxyAgent = require_proxy_agent();
	const Agent = require_agent();
	const DEFAULT_PORTS = {
		"http:": 80,
		"https:": 443
	};
	var EnvHttpProxyAgent = class extends DispatcherBase {
		#noProxyValue = null;
		#noProxyEntries = null;
		#opts = null;
		constructor(opts = {}) {
			super();
			this.#opts = opts;
			const { httpProxy, httpsProxy, noProxy, ...agentOpts } = opts;
			this[kNoProxyAgent] = new Agent(agentOpts);
			const HTTP_PROXY = httpProxy ?? process.env.http_proxy ?? process.env.HTTP_PROXY;
			if (HTTP_PROXY) this[kHttpProxyAgent] = new ProxyAgent({
				...agentOpts,
				uri: HTTP_PROXY
			});
			else this[kHttpProxyAgent] = this[kNoProxyAgent];
			const HTTPS_PROXY = httpsProxy ?? process.env.https_proxy ?? process.env.HTTPS_PROXY;
			if (HTTPS_PROXY) this[kHttpsProxyAgent] = new ProxyAgent({
				...agentOpts,
				uri: HTTPS_PROXY
			});
			else this[kHttpsProxyAgent] = this[kHttpProxyAgent];
			this.#parseNoProxy();
		}
		[kDispatch](opts, handler) {
			const url = new URL(opts.origin);
			return this.#getProxyAgentForUrl(url).dispatch(opts, handler);
		}
		[kClose]() {
			return Promise.all([
				this[kNoProxyAgent].close(),
				!this[kHttpProxyAgent][kClosed] && this[kHttpProxyAgent].close(),
				!this[kHttpsProxyAgent][kClosed] && this[kHttpsProxyAgent].close()
			]);
		}
		[kDestroy](err) {
			return Promise.all([
				this[kNoProxyAgent].destroy(err),
				!this[kHttpProxyAgent][kDestroyed] && this[kHttpProxyAgent].destroy(err),
				!this[kHttpsProxyAgent][kDestroyed] && this[kHttpsProxyAgent].destroy(err)
			]);
		}
		#getProxyAgentForUrl(url) {
			let { protocol, host: hostname, port } = url;
			hostname = hostname.replace(/:\d*$/, "").toLowerCase();
			port = Number.parseInt(port, 10) || DEFAULT_PORTS[protocol] || 0;
			if (!this.#shouldProxy(hostname, port)) return this[kNoProxyAgent];
			if (protocol === "https:") return this[kHttpsProxyAgent];
			return this[kHttpProxyAgent];
		}
		#shouldProxy(hostname, port) {
			if (this.#noProxyChanged) this.#parseNoProxy();
			if (this.#noProxyEntries.length === 0) return true;
			if (this.#noProxyValue === "*") return false;
			for (let i = 0; i < this.#noProxyEntries.length; i++) {
				const entry = this.#noProxyEntries[i];
				if (entry.port && entry.port !== port) continue;
				if (hostname === entry.hostname) return false;
				if (hostname.slice(-(entry.hostname.length + 1)) === `.${entry.hostname}`) return false;
			}
			return true;
		}
		#parseNoProxy() {
			const noProxyValue = this.#opts.noProxy ?? this.#noProxyEnv;
			const noProxySplit = noProxyValue.split(/[,\s]/);
			const noProxyEntries = [];
			for (let i = 0; i < noProxySplit.length; i++) {
				const entry = noProxySplit[i];
				if (!entry) continue;
				const parsed = entry.match(/^(.+):(\d+)$/);
				noProxyEntries.push({
					hostname: (parsed ? parsed[1] : entry).replace(/^\*?\./, "").toLowerCase(),
					port: parsed ? Number.parseInt(parsed[2], 10) : 0
				});
			}
			this.#noProxyValue = noProxyValue;
			this.#noProxyEntries = noProxyEntries;
		}
		get #noProxyChanged() {
			if (this.#opts.noProxy !== void 0) return false;
			return this.#noProxyValue !== this.#noProxyEnv;
		}
		get #noProxyEnv() {
			return process.env.no_proxy ?? process.env.NO_PROXY ?? "";
		}
	};
	module.exports = EnvHttpProxyAgent;
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/handler/retry-handler.js
var require_retry_handler = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const assert$20 = __require("node:assert");
	const { kRetryHandlerDefaultRetry } = require_symbols();
	const { RequestRetryError } = require_errors();
	const { isDisturbed, parseRangeHeader, wrapRequestBody } = require_util$5();
	function calculateRetryAfterHeader(retryAfter) {
		const retryTime = new Date(retryAfter).getTime();
		return isNaN(retryTime) ? null : retryTime - Date.now();
	}
	function validatePartialResponseContentLength(headers, range, statusCode, retryCount) {
		const contentLength = headers["content-length"];
		if (contentLength == null) return;
		if (!Number.isFinite(range.start) || !Number.isFinite(range.end)) return;
		const length = Number(contentLength);
		const expectedLength = range.end - range.start + 1;
		if (!Number.isFinite(length) || length !== expectedLength) throw new RequestRetryError("Content-Length mismatch", statusCode, {
			headers,
			data: { count: retryCount }
		});
	}
	var RetryController = class {
		constructor() {
			this.target = null;
		}
		pause() {
			this.target?.pause();
		}
		resume() {
			this.target?.resume();
		}
		abort(reason) {
			this.target?.abort(reason);
		}
		get paused() {
			return this.target?.paused ?? false;
		}
		get aborted() {
			return this.target?.aborted ?? false;
		}
		get reason() {
			return this.target?.reason ?? null;
		}
		get rawHeaders() {
			return this.target?.rawHeaders ?? null;
		}
		get rawTrailers() {
			return this.target?.rawTrailers ?? null;
		}
	};
	module.exports = class RetryHandler {
		constructor(opts, { dispatch, handler }) {
			const { retryOptions, ...dispatchOpts } = opts;
			const { retry: retryFn, maxRetries, maxTimeout, minTimeout, timeoutFactor, methods, errorCodes, retryAfter, statusCodes, throwOnError } = retryOptions ?? {};
			this.error = null;
			this.dispatch = dispatch;
			this.handler = handler;
			this.opts = {
				...dispatchOpts,
				body: wrapRequestBody(opts.body)
			};
			this.retryOpts = {
				throwOnError: throwOnError ?? true,
				retry: retryFn ?? RetryHandler[kRetryHandlerDefaultRetry],
				retryAfter: retryAfter ?? true,
				maxTimeout: maxTimeout ?? 3e4,
				minTimeout: minTimeout ?? 500,
				timeoutFactor: timeoutFactor ?? 2,
				maxRetries: maxRetries ?? 5,
				methods: methods ?? [
					"GET",
					"HEAD",
					"OPTIONS",
					"PUT",
					"DELETE",
					"TRACE",
					"QUERY"
				],
				statusCodes: statusCodes ?? [
					500,
					502,
					503,
					504,
					429
				],
				errorCodes: errorCodes ?? [
					"ECONNRESET",
					"ECONNREFUSED",
					"ENOTFOUND",
					"ENETDOWN",
					"ENETUNREACH",
					"EHOSTDOWN",
					"EHOSTUNREACH",
					"EPIPE",
					"UND_ERR_SOCKET"
				]
			};
			this.retryCount = 0;
			this.retryCountCheckpoint = 0;
			this.headersSent = false;
			this.start = 0;
			this.end = null;
			this.etag = null;
			this.statusCode = null;
			this.headers = null;
			this.controllerProxy = new RetryController();
		}
		onResponseStartWithRetry(controller, statusCode, headers, statusMessage, err) {
			if (this.retryOpts.throwOnError) {
				if (this.retryOpts.statusCodes.includes(statusCode) === false) {
					this.headersSent = true;
					this.handler.onResponseStart?.(this.controllerProxy, statusCode, headers, statusMessage);
				} else this.error = err;
				return;
			}
			if (isDisturbed(this.opts.body)) {
				this.headersSent = true;
				this.handler.onResponseStart?.(this.controllerProxy, statusCode, headers, statusMessage);
				return;
			}
			function shouldRetry(passedErr) {
				if (passedErr) {
					this.headersSent = true;
					this.handler.onResponseStart?.(this.controllerProxy, statusCode, headers, statusMessage);
					controller.resume();
					return;
				}
				this.error = err;
				controller.resume();
			}
			controller.pause();
			this.retryOpts.retry(err, {
				state: { counter: this.retryCount },
				opts: {
					retryOptions: this.retryOpts,
					...this.opts
				}
			}, shouldRetry.bind(this));
		}
		onRequestStart(controller, context) {
			this.controllerProxy.target = controller;
			if (!this.headersSent) this.handler.onRequestStart?.(this.controllerProxy, context);
		}
		onRequestUpgrade(_controller, statusCode, headers, socket) {
			this.handler.onRequestUpgrade?.(this.controllerProxy, statusCode, headers, socket);
		}
		static [kRetryHandlerDefaultRetry](err, { state, opts }, cb) {
			const { statusCode, code, headers } = err;
			const { method, retryOptions } = opts;
			const { maxRetries, minTimeout, maxTimeout, timeoutFactor, statusCodes, errorCodes, methods } = retryOptions;
			const { counter } = state;
			if (code && code !== "UND_ERR_REQ_RETRY" && !errorCodes.includes(code)) {
				cb(err);
				return;
			}
			if (Array.isArray(methods) && !methods.includes(method)) {
				cb(err);
				return;
			}
			if (statusCode != null && Array.isArray(statusCodes) && !statusCodes.includes(statusCode)) {
				cb(err);
				return;
			}
			if (counter > maxRetries) {
				cb(err);
				return;
			}
			let retryAfterHeader = headers?.["retry-after"];
			if (retryAfterHeader) {
				retryAfterHeader = Number(retryAfterHeader);
				retryAfterHeader = Number.isNaN(retryAfterHeader) ? calculateRetryAfterHeader(headers["retry-after"]) : retryAfterHeader * 1e3;
			}
			const retryTimeout = retryAfterHeader === 0 ? 0 : retryAfterHeader > 0 ? Math.min(retryAfterHeader, maxTimeout) : Math.min(minTimeout * timeoutFactor ** (counter - 1), maxTimeout);
			setTimeout(() => cb(null), retryTimeout);
		}
		onResponseStart(controller, statusCode, headers, statusMessage) {
			this.error = null;
			this.retryCount += 1;
			this.statusCode = statusCode;
			this.headers = headers;
			if (statusCode >= 300) {
				const err = new RequestRetryError("Request failed", statusCode, {
					headers,
					data: { count: this.retryCount }
				});
				this.onResponseStartWithRetry(controller, statusCode, headers, statusMessage, err);
				return;
			}
			if (this.headersSent) {
				if (statusCode !== 206 && (this.start > 0 || statusCode !== 200)) throw new RequestRetryError("server does not support the range header and the payload was partially consumed", statusCode, {
					headers,
					data: { count: this.retryCount }
				});
				const contentRange = parseRangeHeader(headers["content-range"]);
				if (!contentRange) throw new RequestRetryError("Content-Range mismatch", statusCode, {
					headers,
					data: { count: this.retryCount }
				});
				if (this.etag != null && this.etag !== headers.etag) throw new RequestRetryError("ETag mismatch", statusCode, {
					headers,
					data: { count: this.retryCount }
				});
				validatePartialResponseContentLength(headers, contentRange, statusCode, this.retryCount);
				const { start, size, end = size ? size - 1 : null } = contentRange;
				assert$20(this.start === start, "content-range mismatch");
				assert$20(this.end == null || this.end === end, "content-range mismatch");
				return;
			}
			if (this.end == null) {
				if (statusCode === 206) {
					const range = parseRangeHeader(headers["content-range"]);
					if (range == null) {
						this.headersSent = true;
						this.handler.onResponseStart?.(this.controllerProxy, statusCode, headers, statusMessage);
						return;
					}
					validatePartialResponseContentLength(headers, range, statusCode, this.retryCount);
					const { start, size, end = size ? size - 1 : null } = range;
					assert$20(start != null && Number.isFinite(start), "content-range mismatch");
					assert$20(end != null && Number.isFinite(end), "invalid content-length");
					this.start = start;
					this.end = end;
				}
				if (this.end == null) {
					const contentLength = headers["content-length"];
					this.end = contentLength != null ? Number(contentLength) - 1 : null;
				}
				assert$20(Number.isFinite(this.start));
				assert$20(this.end == null || Number.isFinite(this.end), "invalid content-length");
				this.resume = true;
				this.etag = headers.etag != null ? headers.etag : null;
				if (this.etag != null && this.etag[0] === "W" && this.etag[1] === "/") this.etag = null;
				this.headersSent = true;
				this.handler.onResponseStart?.(this.controllerProxy, statusCode, headers, statusMessage);
			} else throw new RequestRetryError("Request failed", statusCode, {
				headers,
				data: { count: this.retryCount }
			});
		}
		onResponseData(_controller, chunk) {
			if (this.error) return;
			this.start += chunk.length;
			this.handler.onResponseData?.(this.controllerProxy, chunk);
		}
		onResponseEnd(_controller, trailers) {
			if (this.error && this.retryOpts.throwOnError) throw this.error;
			if (!this.error) {
				if (this.end != null && Number.isFinite(this.end)) {
					if (this.start !== this.end + 1) throw new RequestRetryError("Content-Range mismatch", this.statusCode, {
						headers: this.headers,
						data: { count: this.retryCount }
					});
				}
				this.retryCount = 0;
				return this.handler.onResponseEnd?.(this.controllerProxy, trailers);
			}
			this.retry();
		}
		retry() {
			if (this.start !== 0) {
				const headers = { range: `bytes=${this.start}-${this.end ?? ""}` };
				if (this.etag != null) headers["if-match"] = this.etag;
				this.opts = {
					...this.opts,
					headers: {
						...this.opts.headers,
						...headers
					}
				};
			}
			try {
				this.retryCountCheckpoint = this.retryCount;
				this.dispatch(this.opts, this);
			} catch (err) {
				this.handler.onResponseError?.(this.controllerProxy, err);
			}
		}
		onResponseError(controller, err) {
			if (controller?.aborted || isDisturbed(this.opts.body)) {
				this.handler.onResponseError?.(this.controllerProxy, err);
				return;
			}
			function shouldRetry(returnedErr) {
				if (!returnedErr) {
					this.retry();
					return;
				}
				this.handler?.onResponseError?.(this.controllerProxy, returnedErr);
			}
			if (this.retryCount - this.retryCountCheckpoint > 0) this.retryCount = this.retryCountCheckpoint + (this.retryCount - this.retryCountCheckpoint);
			else this.retryCount += 1;
			this.retryOpts.retry(err, {
				state: { counter: this.retryCount },
				opts: {
					retryOptions: this.retryOpts,
					...this.opts
				}
			}, shouldRetry.bind(this));
		}
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/dispatcher/retry-agent.js
var require_retry_agent = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const Dispatcher = require_dispatcher();
	const RetryHandler = require_retry_handler();
	var RetryAgent = class extends Dispatcher {
		#agent = null;
		#options = null;
		constructor(agent, options = {}) {
			super(options);
			this.#agent = agent;
			this.#options = options;
		}
		dispatch(opts, handler) {
			const retry = new RetryHandler({
				...opts,
				retryOptions: this.#options
			}, {
				dispatch: this.#agent.dispatch.bind(this.#agent),
				handler
			});
			return this.#agent.dispatch(opts, retry);
		}
		close() {
			return this.#agent.close();
		}
		destroy() {
			return this.#agent.destroy();
		}
	};
	module.exports = RetryAgent;
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/dispatcher/h2c-client.js
var require_h2c_client = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { InvalidArgumentError } = require_errors();
	const Client = require_client();
	var H2CClient = class extends Client {
		constructor(origin, clientOpts) {
			if (typeof origin === "string") origin = new URL(origin);
			if (origin.protocol !== "http:") throw new InvalidArgumentError("h2c-client: Only h2c protocol is supported");
			const { maxConcurrentStreams, pipelining, ...opts } = clientOpts ?? {};
			const defaultMaxConcurrentStreams = maxConcurrentStreams ?? 100;
			let defaultPipelining = 100;
			if (maxConcurrentStreams != null && (!Number.isInteger(maxConcurrentStreams) || maxConcurrentStreams < 1)) throw new InvalidArgumentError("maxConcurrentStreams must be a positive integer, greater than 0");
			if (pipelining != null && Number.isInteger(pipelining) && pipelining > 0) defaultPipelining = pipelining;
			if (defaultPipelining > defaultMaxConcurrentStreams) throw new InvalidArgumentError("h2c-client: pipelining cannot be greater than maxConcurrentStreams");
			super(origin, {
				...opts,
				maxConcurrentStreams: defaultMaxConcurrentStreams,
				pipelining: defaultPipelining,
				allowH2: true,
				useH2c: true
			});
		}
	};
	module.exports = H2CClient;
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/api/readable.js
var require_readable = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const assert$19 = __require("node:assert");
	const { addAbortListener: addAbortListener$1 } = __require("node:events");
	const { Readable: Readable$3 } = __require("node:stream");
	const { RequestAbortedError, NotSupportedError, InvalidArgumentError, AbortError } = require_errors();
	const util = require_util$5();
	const { ReadableStreamFrom } = require_util$5();
	const kConsume = Symbol("kConsume");
	const kReading = Symbol("kReading");
	const kBody = Symbol("kBody");
	const kAbort = Symbol("kAbort");
	const kContentType = Symbol("kContentType");
	const kContentLength = Symbol("kContentLength");
	const kUsed = Symbol("kUsed");
	const kBytesRead = Symbol("kBytesRead");
	const kPreservedBuffer = Symbol("kPreservedBuffer");
	const noop = () => {};
	/**
	* @class
	* @extends {Readable}
	* @see https://fetch.spec.whatwg.org/#body
	*/
	var BodyReadable = class extends Readable$3 {
		/**
		* @param {object} opts
		* @param {(this: Readable, size: number) => void} opts.resume
		* @param {() => (void | null)} opts.abort
		* @param {string} [opts.contentType = '']
		* @param {number} [opts.contentLength]
		* @param {number} [opts.highWaterMark = 64 * 1024]
		*/
		constructor({ resume, abort, contentType = "", contentLength, highWaterMark = 65536 }) {
			super({
				autoDestroy: true,
				read: resume,
				highWaterMark
			});
			this._readableState.dataEmitted = false;
			this[kAbort] = abort;
			/** @type {Consume | null} */
			this[kConsume] = null;
			/** @type {number} */
			this[kBytesRead] = 0;
			/** @type {ReadableStream|null} */
			this[kBody] = null;
			/** @type {boolean} */
			this[kUsed] = false;
			/** @type {string} */
			this[kContentType] = contentType;
			/** @type {number|null} */
			this[kContentLength] = Number.isFinite(contentLength) ? contentLength : null;
			/**
			* Is stream being consumed through Readable API?
			* This is an optimization so that we avoid checking
			* for 'data' and 'readable' listeners in the hot path
			* inside push().
			*
			* @type {boolean}
			*/
			this[kReading] = false;
		}
		/**
		* @param {Error|null} err
		* @param {(error:(Error|null)) => void} callback
		* @returns {void}
		*/
		_destroy(err, callback) {
			if (!err && !this._readableState.endEmitted) err = new RequestAbortedError();
			if (err) this[kAbort]();
			if (!this[kUsed]) setImmediate(callback, err);
			else callback(err);
		}
		/**
		* @param {string|symbol} event
		* @param {(...args: any[]) => void} listener
		* @returns {this}
		*/
		on(event, listener) {
			if (event === "data" || event === "readable") {
				this[kReading] = true;
				this[kUsed] = true;
			}
			return super.on(event, listener);
		}
		/**
		* @param {string|symbol} event
		* @param {(...args: any[]) => void} listener
		* @returns {this}
		*/
		addListener(event, listener) {
			return this.on(event, listener);
		}
		/**
		* @param {string|symbol} event
		* @param {(...args: any[]) => void} listener
		* @returns {this}
		*/
		off(event, listener) {
			const ret = super.off(event, listener);
			if (event === "data" || event === "readable") this[kReading] = this.listenerCount("data") > 0 || this.listenerCount("readable") > 0;
			return ret;
		}
		/**
		* @param {string|symbol} event
		* @param {(...args: any[]) => void} listener
		* @returns {this}
		*/
		removeListener(event, listener) {
			return this.off(event, listener);
		}
		/**
		* @param {Buffer|null} chunk
		* @returns {boolean}
		*/
		push(chunk) {
			if (chunk) {
				this[kBytesRead] += chunk.length;
				if (this[kConsume]) {
					consumePush(this[kConsume], chunk);
					return this[kReading] ? super.push(chunk) : true;
				}
			}
			return super.push(chunk);
		}
		/**
		* Consumes and returns the body as a string.
		*
		* @see https://fetch.spec.whatwg.org/#dom-body-text
		* @returns {Promise<string>}
		*/
		text() {
			return consume(this, "text");
		}
		/**
		* Consumes and returns the body as a JavaScript Object.
		*
		* @see https://fetch.spec.whatwg.org/#dom-body-json
		* @returns {Promise<unknown>}
		*/
		json() {
			return consume(this, "json");
		}
		/**
		* Consumes and returns the body as a Blob
		*
		* @see https://fetch.spec.whatwg.org/#dom-body-blob
		* @returns {Promise<Blob>}
		*/
		blob() {
			return consume(this, "blob");
		}
		/**
		* Consumes and returns the body as an Uint8Array.
		*
		* @see https://fetch.spec.whatwg.org/#dom-body-bytes
		* @returns {Promise<Uint8Array>}
		*/
		bytes() {
			return consume(this, "bytes");
		}
		/**
		* Consumes and returns the body as an ArrayBuffer.
		*
		* @see https://fetch.spec.whatwg.org/#dom-body-arraybuffer
		* @returns {Promise<ArrayBuffer>}
		*/
		arrayBuffer() {
			return consume(this, "arrayBuffer");
		}
		/**
		* Not implemented
		*
		* @see https://fetch.spec.whatwg.org/#dom-body-formdata
		* @throws {NotSupportedError}
		*/
		async formData() {
			throw new NotSupportedError();
		}
		/**
		* Returns true if the body is not null and the body has been consumed.
		* Otherwise, returns false.
		*
		* @see https://fetch.spec.whatwg.org/#dom-body-bodyused
		* @readonly
		* @returns {boolean}
		*/
		get bodyUsed() {
			return util.isDisturbed(this);
		}
		/**
		* @see https://fetch.spec.whatwg.org/#dom-body-body
		* @readonly
		* @returns {ReadableStream}
		*/
		get body() {
			if (!this[kBody]) {
				this[kBody] = ReadableStreamFrom(this);
				if (this[kConsume]) {
					this[kBody].getReader();
					assert$19(this[kBody].locked);
				}
			}
			return this[kBody];
		}
		/**
		* Dumps the response body by reading `limit` number of bytes.
		* @param {object} opts
		* @param {number} [opts.limit = 131072] Number of bytes to read.
		* @param {AbortSignal} [opts.signal] An AbortSignal to cancel the dump.
		* @returns {Promise<null>}
		*/
		dump(opts) {
			const signal = opts?.signal;
			if (signal != null && (typeof signal !== "object" || !("aborted" in signal))) return Promise.reject(new InvalidArgumentError("signal must be an AbortSignal"));
			const limit = opts?.limit && Number.isFinite(opts.limit) ? opts.limit : 131072;
			if (signal?.aborted) return Promise.reject(signal.reason ?? new AbortError());
			if (this._readableState.closeEmitted) return Promise.resolve(null);
			return new Promise((resolve, reject) => {
				if (this[kContentLength] && this[kContentLength] > limit || this[kBytesRead] > limit) this.destroy(new AbortError());
				if (signal) {
					const onAbort = () => {
						this.destroy(signal.reason ?? new AbortError());
					};
					const abortListener = addAbortListener$1(signal, onAbort);
					this.on("close", function() {
						abortListener[Symbol.dispose]();
						if (signal.aborted) reject(signal.reason ?? new AbortError());
						else resolve(null);
					});
				} else this.on("close", resolve);
				this.on("error", noop).on("data", () => {
					if (this[kBytesRead] > limit) this.destroy();
				}).resume();
			});
		}
		/**
		* @param {BufferEncoding} encoding
		* @returns {this}
		*/
		setEncoding(encoding) {
			if (Buffer.isEncoding(encoding)) {
				const state = this._readableState;
				const buffer = state.buffer;
				if (buffer && state.length > 0) {
					const bufferIndex = state.bufferIndex ?? 0;
					const preserved = [];
					const source = typeof buffer.slice === "function" ? buffer.slice(bufferIndex) : buffer;
					for (const data of source) if (Buffer.isBuffer(data)) preserved.push(data);
					if (preserved.length > 0) this[kPreservedBuffer] = (this[kPreservedBuffer] || []).concat(preserved);
				}
				super.setEncoding(encoding);
			}
			return this;
		}
	};
	/**
	* @see https://streams.spec.whatwg.org/#readablestream-locked
	* @param {BodyReadable} bodyReadable
	* @returns {boolean}
	*/
	function isLocked(bodyReadable) {
		return bodyReadable[kBody]?.locked === true || bodyReadable[kConsume] !== null;
	}
	/**
	* @see https://fetch.spec.whatwg.org/#body-unusable
	* @param {BodyReadable} bodyReadable
	* @returns {boolean}
	*/
	function isUnusable(bodyReadable) {
		return util.isDisturbed(bodyReadable) || isLocked(bodyReadable);
	}
	/**
	* @typedef {'text' | 'json' | 'blob' | 'bytes' | 'arrayBuffer'} ConsumeType
	*/
	/**
	* @template {ConsumeType} T
	* @typedef {T extends 'text' ? string :
	*           T extends 'json' ? unknown :
	*           T extends 'blob' ? Blob :
	*           T extends 'arrayBuffer' ? ArrayBuffer :
	*           T extends 'bytes' ? Uint8Array :
	*           never
	* } ConsumeReturnType
	*/
	/**
	* @typedef {object} Consume
	* @property {ConsumeType} type
	* @property {BodyReadable} stream
	* @property {((value?: any) => void)} resolve
	* @property {((err: Error) => void)} reject
	* @property {number} length
	* @property {Buffer[]} body
	*/
	/**
	* @template {ConsumeType} T
	* @param {BodyReadable} stream
	* @param {T} type
	* @returns {Promise<ConsumeReturnType<T>>}
	*/
	function consume(stream, type) {
		assert$19(!stream[kConsume]);
		return new Promise((resolve, reject) => {
			if (isUnusable(stream)) {
				const rState = stream._readableState;
				if (rState.destroyed && rState.closeEmitted === false) stream.on("error", reject).on("close", () => {
					reject(/* @__PURE__ */ new TypeError("unusable"));
				});
				else reject(rState.errored ?? /* @__PURE__ */ new TypeError("unusable"));
			} else queueMicrotask(() => {
				stream[kConsume] = {
					type,
					stream,
					resolve,
					reject,
					length: 0,
					body: []
				};
				stream.on("error", function(err) {
					consumeFinish(this[kConsume], err);
				}).on("close", function() {
					if (this[kConsume].body !== null) consumeFinish(this[kConsume], new RequestAbortedError());
				});
				consumeStart(stream[kConsume]);
			});
		});
	}
	/**
	* @param {Consume} consume
	* @returns {void}
	*/
	function consumeStart(consume) {
		if (consume.body === null) return;
		const { _readableState: state } = consume.stream;
		const preserved = consume.stream[kPreservedBuffer];
		if (preserved && preserved.length > 0) {
			for (const chunk of preserved) consumePush(consume, chunk);
			consume.stream[kPreservedBuffer] = null;
		} else if (state.bufferIndex) {
			const start = state.bufferIndex;
			const end = state.buffer.length;
			for (let n = start; n < end; n++) consumePush(consume, state.buffer[n]);
		} else for (const chunk of state.buffer) consumePush(consume, chunk);
		if (state.endEmitted) consumeEnd(this[kConsume], this._readableState.encoding);
		else consume.stream.on("end", function() {
			consumeEnd(this[kConsume], this._readableState.encoding);
		});
		consume.stream.resume();
		while (consume.stream.read() != null);
	}
	/**
	* @param {Buffer[]} chunks
	* @param {number} length
	* @param {BufferEncoding} [encoding='utf8']
	* @returns {string}
	*/
	function chunksDecode(chunks, length, encoding) {
		if (chunks.length === 0 || length === 0) return "";
		const buffer = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks, length);
		const bufferLength = buffer.length;
		const start = bufferLength > 2 && buffer[0] === 239 && buffer[1] === 187 && buffer[2] === 191 ? 3 : 0;
		if (!encoding || encoding === "utf8" || encoding === "utf-8") return buffer.utf8Slice(start, bufferLength);
		else return buffer.subarray(start, bufferLength).toString(encoding);
	}
	/**
	* @param {Buffer[]} chunks
	* @param {number} length
	* @returns {Uint8Array}
	*/
	function chunksConcat(chunks, length) {
		if (chunks.length === 0 || length === 0) return /* @__PURE__ */ new Uint8Array(0);
		if (chunks.length === 1) return new Uint8Array(chunks[0]);
		const buffer = new Uint8Array(Buffer.allocUnsafeSlow(length).buffer);
		let offset = 0;
		for (let i = 0; i < chunks.length; ++i) {
			const chunk = chunks[i];
			buffer.set(chunk, offset);
			offset += chunk.length;
		}
		return buffer;
	}
	/**
	* @param {Consume} consume
	* @param {BufferEncoding} encoding
	* @returns {void}
	*/
	function consumeEnd(consume, encoding) {
		const { type, body, resolve, stream, length } = consume;
		try {
			if (type === "text") resolve(chunksDecode(body, length, encoding));
			else if (type === "json") resolve(JSON.parse(chunksDecode(body, length, encoding)));
			else if (type === "arrayBuffer") resolve(chunksConcat(body, length).buffer);
			else if (type === "blob") resolve(new Blob(body, { type: stream[kContentType] }));
			else if (type === "bytes") resolve(chunksConcat(body, length));
			consumeFinish(consume);
		} catch (err) {
			stream.destroy(err);
		}
	}
	/**
	* @param {Consume} consume
	* @param {Buffer} chunk
	* @returns {void}
	*/
	function consumePush(consume, chunk) {
		if (consume.body === null) return;
		consume.length += chunk.length;
		consume.body.push(chunk);
	}
	/**
	* @param {Consume} consume
	* @param {Error} [err]
	* @returns {void}
	*/
	function consumeFinish(consume, err) {
		if (consume.body === null) return;
		if (err) consume.reject(err);
		else consume.resolve();
		consume.type = null;
		consume.stream = null;
		consume.resolve = null;
		consume.reject = null;
		consume.length = 0;
		consume.body = null;
	}
	module.exports = {
		Readable: BodyReadable,
		chunksDecode
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/api/api-request.js
var require_api_request = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const assert$18 = __require("node:assert");
	const { AsyncResource: AsyncResource$4 } = __require("node:async_hooks");
	const { Readable } = require_readable();
	const { InvalidArgumentError, RequestAbortedError } = require_errors();
	const util = require_util$5();
	function noop() {}
	var RequestHandler = class extends AsyncResource$4 {
		constructor(opts, callback) {
			if (!opts || typeof opts !== "object") throw new InvalidArgumentError("invalid opts");
			const { signal, method, opaque, body, onInfo, responseHeaders, highWaterMark } = opts;
			try {
				if (typeof callback !== "function") throw new InvalidArgumentError("invalid callback");
				if (highWaterMark != null && (!Number.isFinite(highWaterMark) || highWaterMark < 0)) throw new InvalidArgumentError("invalid highWaterMark");
				if (signal && typeof signal.on !== "function" && typeof signal.addEventListener !== "function") throw new InvalidArgumentError("signal must be an EventEmitter or EventTarget");
				if (method === "CONNECT") throw new InvalidArgumentError("invalid method");
				if (onInfo && typeof onInfo !== "function") throw new InvalidArgumentError("invalid onInfo callback");
				super("UNDICI_REQUEST");
			} catch (err) {
				if (util.isStream(body)) util.destroy(body.on("error", noop), err);
				throw err;
			}
			this.method = method;
			this.responseHeaders = responseHeaders || null;
			this.opaque = opaque || null;
			this.callback = callback;
			this.res = null;
			this.abort = null;
			this.body = body;
			this.trailers = {};
			this.context = null;
			this.controller = null;
			this.onInfo = onInfo || null;
			this.highWaterMark = highWaterMark;
			this.reason = null;
			this.removeAbortListener = null;
			if (signal?.aborted) this.reason = signal.reason ?? new RequestAbortedError();
			else if (signal) this.removeAbortListener = util.addAbortListener(signal, () => {
				this.reason = signal.reason ?? new RequestAbortedError();
				if (this.res) {
					const res = this.res;
					this.res = null;
					util.destroy(res.on("error", noop), this.reason);
				} else if (this.abort) this.abort(this.reason);
			});
		}
		onRequestStart(controller, context) {
			if (this.reason) {
				controller.abort(this.reason);
				return;
			}
			assert$18(this.callback);
			this.controller = controller;
			this.abort = (reason) => controller.abort(reason);
			this.context = context;
		}
		onResponseStart(controller, statusCode, headers, statusText) {
			const { callback, opaque, context, responseHeaders, highWaterMark } = this;
			const rawHeaders = controller?.rawHeaders;
			const responseHeaderData = responseHeaders === "raw" ? util.parseRawHeaders(rawHeaders) : headers;
			if (statusCode < 200) {
				if (this.onInfo) this.onInfo({
					statusCode,
					headers: responseHeaderData
				});
				return;
			}
			const parsedHeaders = headers;
			const contentType = parsedHeaders?.["content-type"];
			const contentLength = parsedHeaders?.["content-length"];
			const res = new Readable({
				resume: () => controller.resume(),
				abort: (reason) => controller.abort(reason),
				contentType,
				contentLength: this.method !== "HEAD" && contentLength ? Number(contentLength) : null,
				highWaterMark
			});
			if (this.removeAbortListener) {
				res.on("close", this.removeAbortListener);
				this.removeAbortListener = null;
			}
			this.callback = null;
			this.res = res;
			if (callback !== null) try {
				this.runInAsyncScope(callback, null, null, {
					statusCode,
					statusText,
					headers: responseHeaderData,
					trailers: this.trailers,
					opaque,
					body: res,
					context
				});
			} catch (err) {
				this.res = null;
				util.destroy(res.on("error", noop), err);
				queueMicrotask(() => {
					throw err;
				});
			}
		}
		onResponseData(controller, chunk) {
			if (!this.res) return;
			if (this.res.push(chunk) === false) controller.pause();
		}
		onResponseEnd(_controller, trailers) {
			if (trailers && typeof trailers === "object") for (const key of Object.keys(trailers)) if (key === "__proto__") Object.defineProperty(this.trailers, key, {
				value: trailers[key],
				enumerable: true,
				configurable: true,
				writable: true
			});
			else this.trailers[key] = trailers[key];
			this.res?.push(null);
		}
		onResponseError(_controller, err) {
			const { res, callback, body, opaque } = this;
			if (callback) {
				this.callback = null;
				queueMicrotask(() => {
					this.runInAsyncScope(callback, null, err, { opaque });
				});
			}
			if (res) {
				this.res = null;
				queueMicrotask(() => {
					util.destroy(res.on("error", noop), err);
				});
			}
			if (body) {
				this.body = null;
				if (util.isStream(body)) {
					body.on("error", noop);
					util.destroy(body, err);
				}
			}
			if (this.removeAbortListener) {
				this.removeAbortListener();
				this.removeAbortListener = null;
			}
		}
	};
	function request(opts, callback) {
		if (callback === void 0) return new Promise((resolve, reject) => {
			request.call(this, opts, (err, data) => {
				return err ? reject(err) : resolve(data);
			});
		});
		try {
			const handler = new RequestHandler(opts, callback);
			this.dispatch(opts, handler);
		} catch (err) {
			if (typeof callback !== "function") throw err;
			const opaque = opts?.opaque;
			queueMicrotask(() => callback(err, { opaque }));
		}
	}
	module.exports = request;
	module.exports.RequestHandler = RequestHandler;
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/api/abort-signal.js
var require_abort_signal = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { addAbortListener } = require_util$5();
	const { RequestAbortedError } = require_errors();
	const kListener = Symbol("kListener");
	const kSignal = Symbol("kSignal");
	function abort(self) {
		if (self.abort) self.abort(self[kSignal]?.reason);
		else self.reason = self[kSignal]?.reason ?? new RequestAbortedError();
		removeSignal(self);
	}
	function addSignal(self, signal) {
		self.reason = null;
		self[kSignal] = null;
		self[kListener] = null;
		if (!signal) return;
		if (signal.aborted) {
			abort(self);
			return;
		}
		self[kSignal] = signal;
		self[kListener] = () => {
			abort(self);
		};
		addAbortListener(self[kSignal], self[kListener]);
	}
	function removeSignal(self) {
		if (!self[kSignal]) return;
		if ("removeEventListener" in self[kSignal]) self[kSignal].removeEventListener("abort", self[kListener]);
		else self[kSignal].removeListener("abort", self[kListener]);
		self[kSignal] = null;
		self[kListener] = null;
	}
	module.exports = {
		addSignal,
		removeSignal
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/api/api-stream.js
var require_api_stream = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const assert$17 = __require("node:assert");
	const { AsyncResource: AsyncResource$3 } = __require("node:async_hooks");
	const { InvalidArgumentError, InvalidReturnValueError } = require_errors();
	const util = require_util$5();
	const { addSignal, removeSignal } = require_abort_signal();
	function noop() {}
	function getWritableError(stream) {
		return stream.errored ?? stream.writableErrored ?? stream._writableState?.errored;
	}
	function createPrematureCloseError() {
		const err = /* @__PURE__ */ new Error("Premature close");
		err.code = "ERR_STREAM_PREMATURE_CLOSE";
		return err;
	}
	function trackWritableLifecycle(stream, callback) {
		let done = false;
		const cleanup = () => {
			stream.removeListener("close", onClose);
			stream.removeListener("error", onError);
			stream.removeListener("finish", onFinish);
		};
		const finish = (err, fromErrorEvent = false) => {
			if (done) return;
			done = true;
			cleanup();
			callback(err, fromErrorEvent);
		};
		const onClose = () => {
			const err = getWritableError(stream);
			finish(err ?? (!stream.writableFinished ? createPrematureCloseError() : void 0));
		};
		const onError = (err) => finish(err, true);
		const onFinish = () => finish();
		stream.on("close", onClose);
		stream.on("error", onError);
		stream.on("finish", onFinish);
		if (stream.closed) process.nextTick(onClose);
		else if (stream.writableFinished) process.nextTick(onFinish);
	}
	var StreamHandler = class extends AsyncResource$3 {
		constructor(opts, factory, callback) {
			if (!opts || typeof opts !== "object") throw new InvalidArgumentError("invalid opts");
			const { signal, method, opaque, body, onInfo, responseHeaders } = opts;
			try {
				if (typeof callback !== "function") throw new InvalidArgumentError("invalid callback");
				if (typeof factory !== "function") throw new InvalidArgumentError("invalid factory");
				if (signal && typeof signal.on !== "function" && typeof signal.addEventListener !== "function") throw new InvalidArgumentError("signal must be an EventEmitter or EventTarget");
				if (method === "CONNECT") throw new InvalidArgumentError("invalid method");
				if (onInfo && typeof onInfo !== "function") throw new InvalidArgumentError("invalid onInfo callback");
				super("UNDICI_STREAM");
			} catch (err) {
				if (util.isStream(body)) util.destroy(body.on("error", noop), err);
				throw err;
			}
			this.responseHeaders = responseHeaders || null;
			this.opaque = opaque || null;
			this.factory = factory;
			this.callback = callback;
			this.res = null;
			this.abort = null;
			this.context = null;
			this.controller = null;
			this.trailers = null;
			this.body = body;
			this.onInfo = onInfo || null;
			if (util.isStream(body)) body.on("error", (err) => {
				this.onResponseError(this.controller, err);
			});
			addSignal(this, signal);
		}
		onRequestStart(controller, context) {
			if (this.reason) {
				controller.abort(this.reason);
				return;
			}
			assert$17(this.callback);
			this.controller = controller;
			this.abort = (reason) => controller.abort(reason);
			this.context = context;
		}
		onResponseStart(controller, statusCode, headers, _statusMessage) {
			const { factory, opaque, context, responseHeaders } = this;
			const rawHeaders = controller?.rawHeaders;
			const responseHeaderData = responseHeaders === "raw" ? util.parseRawHeaders(rawHeaders) : headers;
			if (statusCode < 200) {
				if (this.onInfo) this.onInfo({
					statusCode,
					headers: responseHeaderData
				});
				return;
			}
			this.factory = null;
			if (factory === null) return;
			const res = this.runInAsyncScope(factory, null, {
				statusCode,
				headers: responseHeaderData,
				opaque,
				context
			});
			if (!res || typeof res.write !== "function" || typeof res.end !== "function" || typeof res.on !== "function") throw new InvalidReturnValueError("expected Writable");
			trackWritableLifecycle(res, (err, fromErrorEvent) => {
				const { callback, res, opaque, trailers, abort } = this;
				this.res = null;
				if (err || !res?.readable) util.destroy(res, fromErrorEvent ? void 0 : err);
				this.callback = null;
				this.runInAsyncScope(callback, null, err || null, {
					opaque,
					trailers
				});
				if (err) abort(err);
			});
			res.on("drain", () => controller.resume());
			this.res = res;
			if ((res.writableNeedDrain !== void 0 ? res.writableNeedDrain : res._writableState?.needDrain) === true) controller.pause();
		}
		onResponseData(controller, chunk) {
			const { res } = this;
			if (!res) return;
			if (res.write(chunk) === false) controller.pause();
		}
		onResponseEnd(_controller, trailers) {
			const { res } = this;
			removeSignal(this);
			if (!res) return;
			if (trailers && typeof trailers === "object") this.trailers = trailers;
			res.end();
		}
		onResponseError(_controller, err) {
			const { res, callback, opaque, body } = this;
			removeSignal(this);
			this.factory = null;
			if (res) {
				this.res = null;
				util.destroy(res, err);
			} else if (callback) {
				this.callback = null;
				queueMicrotask(() => {
					this.runInAsyncScope(callback, null, err, { opaque });
				});
			}
			if (body) {
				this.body = null;
				util.destroy(body, err);
			}
		}
	};
	function stream(opts, factory, callback) {
		if (callback === void 0) return new Promise((resolve, reject) => {
			stream.call(this, opts, factory, (err, data) => {
				return err ? reject(err) : resolve(data);
			});
		});
		try {
			const handler = new StreamHandler(opts, factory, callback);
			this.dispatch(opts, handler);
		} catch (err) {
			if (typeof callback !== "function") throw err;
			const opaque = opts?.opaque;
			queueMicrotask(() => callback(err, { opaque }));
		}
	}
	module.exports = stream;
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/api/api-pipeline.js
var require_api_pipeline = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { Readable: Readable$2, Duplex, PassThrough } = __require("node:stream");
	const assert$16 = __require("node:assert");
	const { AsyncResource: AsyncResource$2 } = __require("node:async_hooks");
	const { InvalidArgumentError, InvalidReturnValueError, RequestAbortedError } = require_errors();
	const util = require_util$5();
	const { kBodyUsed } = require_symbols();
	const { addSignal, removeSignal } = require_abort_signal();
	function noop() {}
	const kResume = Symbol("resume");
	var PipelineRequest = class extends Readable$2 {
		constructor() {
			super({ autoDestroy: true });
			this[kResume] = null;
			this[kBodyUsed] = true;
		}
		_read() {
			const { [kResume]: resume } = this;
			if (resume) {
				this[kResume] = null;
				resume();
			}
		}
		_destroy(err, callback) {
			this._read();
			callback(err);
		}
	};
	var PipelineResponse = class extends Readable$2 {
		constructor(resume) {
			super({ autoDestroy: true });
			this[kResume] = resume;
		}
		_read() {
			this[kResume]();
		}
		_destroy(err, callback) {
			if (!err && !this._readableState.endEmitted) err = new RequestAbortedError();
			callback(err);
		}
	};
	var PipelineHandler = class extends AsyncResource$2 {
		constructor(opts, handler) {
			if (!opts || typeof opts !== "object") throw new InvalidArgumentError("invalid opts");
			if (typeof handler !== "function") throw new InvalidArgumentError("invalid handler");
			const { signal, method, opaque, onInfo, responseHeaders } = opts;
			if (signal && typeof signal.on !== "function" && typeof signal.addEventListener !== "function") throw new InvalidArgumentError("signal must be an EventEmitter or EventTarget");
			if (method === "CONNECT") throw new InvalidArgumentError("invalid method");
			if (onInfo && typeof onInfo !== "function") throw new InvalidArgumentError("invalid onInfo callback");
			super("UNDICI_PIPELINE");
			this.opaque = opaque || null;
			this.responseHeaders = responseHeaders || null;
			this.handler = handler;
			this.abort = null;
			this.context = null;
			this.onInfo = onInfo || null;
			this.req = new PipelineRequest().on("error", noop);
			this.ret = new Duplex({
				readableObjectMode: opts.objectMode,
				autoDestroy: true,
				read: () => {
					const { body } = this;
					if (body?.resume) body.resume();
				},
				write: (chunk, encoding, callback) => {
					const { req } = this;
					if (req.push(chunk, encoding) || req._readableState.destroyed) callback();
					else req[kResume] = callback;
				},
				destroy: (err, callback) => {
					const { body, req, res, ret, abort } = this;
					if (!err && !ret._readableState.endEmitted) err = new RequestAbortedError();
					if (abort && err) abort();
					util.destroy(body, err);
					util.destroy(req, err);
					util.destroy(res, err);
					removeSignal(this);
					callback(err);
				}
			}).on("prefinish", () => {
				const { req } = this;
				req.push(null);
			});
			this.res = null;
			addSignal(this, signal);
		}
		onRequestStart(controller, context) {
			const { res } = this;
			if (this.reason) {
				controller.abort(this.reason);
				return;
			}
			assert$16(!res, "pipeline cannot be retried");
			this.abort = (reason) => controller.abort(reason);
			this.context = context;
		}
		onResponseStart(controller, statusCode, headers, _statusMessage) {
			const { opaque, handler, context } = this;
			if (statusCode < 200) {
				if (this.onInfo) {
					const rawHeaders = controller?.rawHeaders;
					const responseHeaders = this.responseHeaders === "raw" ? util.parseRawHeaders(rawHeaders) : headers;
					this.onInfo({
						statusCode,
						headers: responseHeaders
					});
				}
				return;
			}
			this.res = new PipelineResponse(() => controller.resume());
			let body;
			try {
				this.handler = null;
				const rawHeaders = controller?.rawHeaders;
				const responseHeaders = this.responseHeaders === "raw" ? util.parseRawHeaders(rawHeaders) : headers;
				body = this.runInAsyncScope(handler, null, {
					statusCode,
					headers: responseHeaders,
					opaque,
					body: this.res,
					context
				});
			} catch (err) {
				this.res.on("error", noop);
				throw err;
			}
			if (!body || typeof body.on !== "function") throw new InvalidReturnValueError("expected Readable");
			body.on("data", (chunk) => {
				const { ret, body } = this;
				if (!ret.push(chunk) && body.pause) body.pause();
			}).on("error", (err) => {
				const { ret } = this;
				util.destroy(ret, err);
			}).on("end", () => {
				const { ret } = this;
				ret.push(null);
			}).on("close", () => {
				const { ret } = this;
				if (!ret._readableState.ended) util.destroy(ret, new RequestAbortedError());
			});
			this.body = body;
		}
		onResponseData(controller, chunk) {
			const { res } = this;
			if (res.push(chunk) === false) controller.pause();
		}
		onResponseEnd(_controller, _trailers) {
			const { res } = this;
			res.push(null);
		}
		onResponseError(_controller, err) {
			const { ret } = this;
			this.handler = null;
			util.destroy(ret, err);
		}
	};
	function pipeline(opts, handler) {
		try {
			const pipelineHandler = new PipelineHandler(opts, handler);
			this.dispatch({
				...opts,
				body: pipelineHandler.req
			}, pipelineHandler);
			return pipelineHandler.ret;
		} catch (err) {
			return new PassThrough().destroy(err);
		}
	}
	module.exports = pipeline;
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/api/api-upgrade.js
var require_api_upgrade = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { InvalidArgumentError, SocketError } = require_errors();
	const { AsyncResource: AsyncResource$1 } = __require("node:async_hooks");
	const assert$15 = __require("node:assert");
	const util = require_util$5();
	const { kHTTP2Stream } = require_symbols();
	const { addSignal, removeSignal } = require_abort_signal();
	var UpgradeHandler = class extends AsyncResource$1 {
		constructor(opts, callback) {
			if (!opts || typeof opts !== "object") throw new InvalidArgumentError("invalid opts");
			if (typeof callback !== "function") throw new InvalidArgumentError("invalid callback");
			const { signal, opaque, responseHeaders } = opts;
			if (signal && typeof signal.on !== "function" && typeof signal.addEventListener !== "function") throw new InvalidArgumentError("signal must be an EventEmitter or EventTarget");
			super("UNDICI_UPGRADE");
			this.responseHeaders = responseHeaders || null;
			this.opaque = opaque || null;
			this.callback = callback;
			this.abort = null;
			this.context = null;
			addSignal(this, signal);
		}
		onRequestStart(controller, context) {
			if (this.reason) {
				controller.abort(this.reason);
				return;
			}
			assert$15(this.callback);
			this.abort = (reason) => controller.abort(reason);
			this.context = context;
		}
		onResponseStart() {
			throw new SocketError("bad upgrade", null);
		}
		onRequestUpgrade(controller, statusCode, headers, socket) {
			if (statusCode !== (socket[kHTTP2Stream] === true ? 200 : 101)) {
				const socketInfo = socket[kHTTP2Stream] === true ? null : util.getSocketInfo(socket);
				controller.abort(new SocketError("bad upgrade", socketInfo));
				return;
			}
			const { callback, opaque, context } = this;
			removeSignal(this);
			this.callback = null;
			const rawHeaders = controller?.rawHeaders;
			const responseHeaders = this.responseHeaders === "raw" ? util.parseRawHeaders(rawHeaders) : headers;
			this.runInAsyncScope(callback, null, null, {
				headers: responseHeaders,
				socket,
				opaque,
				context
			});
		}
		onResponseError(_controller, err) {
			const { callback, opaque } = this;
			removeSignal(this);
			if (callback) {
				this.callback = null;
				queueMicrotask(() => {
					this.runInAsyncScope(callback, null, err, { opaque });
				});
			}
		}
	};
	function upgrade(opts, callback) {
		if (callback === void 0) return new Promise((resolve, reject) => {
			upgrade.call(this, opts, (err, data) => {
				return err ? reject(err) : resolve(data);
			});
		});
		try {
			const upgradeHandler = new UpgradeHandler(opts, callback);
			const upgradeOpts = {
				...opts,
				method: opts.method || "GET",
				upgrade: opts.protocol || "Websocket"
			};
			this.dispatch(upgradeOpts, upgradeHandler);
		} catch (err) {
			if (typeof callback !== "function") throw err;
			const opaque = opts?.opaque;
			queueMicrotask(() => callback(err, { opaque }));
		}
	}
	module.exports = upgrade;
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/api/api-connect.js
var require_api_connect = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const assert$14 = __require("node:assert");
	const { AsyncResource } = __require("node:async_hooks");
	const { InvalidArgumentError, SocketError } = require_errors();
	const util = require_util$5();
	const { addSignal, removeSignal } = require_abort_signal();
	var ConnectHandler = class extends AsyncResource {
		constructor(opts, callback) {
			if (!opts || typeof opts !== "object") throw new InvalidArgumentError("invalid opts");
			if (typeof callback !== "function") throw new InvalidArgumentError("invalid callback");
			const { signal, opaque, responseHeaders } = opts;
			if (signal && typeof signal.on !== "function" && typeof signal.addEventListener !== "function") throw new InvalidArgumentError("signal must be an EventEmitter or EventTarget");
			super("UNDICI_CONNECT");
			this.opaque = opaque || null;
			this.responseHeaders = responseHeaders || null;
			this.callback = callback;
			this.abort = null;
			addSignal(this, signal);
		}
		onRequestStart(controller, context) {
			if (this.reason) {
				controller.abort(this.reason);
				return;
			}
			assert$14(this.callback);
			this.abort = (reason) => controller.abort(reason);
			this.context = context;
		}
		onResponseStart() {
			throw new SocketError("bad connect", null);
		}
		onRequestUpgrade(controller, statusCode, headers, socket) {
			const { callback, opaque, context } = this;
			removeSignal(this);
			this.callback = null;
			let responseHeaders = headers;
			const rawHeaders = controller?.rawHeaders;
			if (responseHeaders != null) responseHeaders = this.responseHeaders === "raw" ? util.parseRawHeaders(rawHeaders) : headers;
			this.runInAsyncScope(callback, null, null, {
				statusCode,
				headers: responseHeaders,
				socket,
				opaque,
				context
			});
		}
		onResponseError(_controller, err) {
			const { callback, opaque } = this;
			removeSignal(this);
			if (callback) {
				this.callback = null;
				queueMicrotask(() => {
					this.runInAsyncScope(callback, null, err, { opaque });
				});
			}
		}
	};
	function connect(opts, callback) {
		if (callback === void 0) return new Promise((resolve, reject) => {
			connect.call(this, opts, (err, data) => {
				return err ? reject(err) : resolve(data);
			});
		});
		try {
			const connectHandler = new ConnectHandler(opts, callback);
			const connectOptions = {
				...opts,
				method: "CONNECT"
			};
			this.dispatch(connectOptions, connectHandler);
		} catch (err) {
			if (typeof callback !== "function") throw err;
			const opaque = opts?.opaque;
			queueMicrotask(() => callback(err, { opaque }));
		}
	}
	module.exports = connect;
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/api/index.js
var require_api = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports.request = require_api_request();
	module.exports.stream = require_api_stream();
	module.exports.pipeline = require_api_pipeline();
	module.exports.upgrade = require_api_upgrade();
	module.exports.connect = require_api_connect();
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/mock/mock-errors.js
var require_mock_errors = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { UndiciError } = require_errors();
	const kMockNotMatchedError = Symbol.for("undici.error.UND_MOCK_ERR_MOCK_NOT_MATCHED");
	/**
	* The request does not match any registered mock dispatches.
	*/
	var MockNotMatchedError = class extends UndiciError {
		constructor(message) {
			super(message);
			this.name = "MockNotMatchedError";
			this.message = message || "The request does not match any registered mock dispatches";
			this.code = "UND_MOCK_ERR_MOCK_NOT_MATCHED";
		}
		static [Symbol.hasInstance](instance) {
			return instance && instance[kMockNotMatchedError] === true;
		}
		get [kMockNotMatchedError]() {
			return true;
		}
	};
	module.exports = { MockNotMatchedError };
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/mock/mock-symbols.js
var require_mock_symbols = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = {
		kAgent: Symbol("agent"),
		kOptions: Symbol("options"),
		kFactory: Symbol("factory"),
		kDispatches: Symbol("dispatches"),
		kDispatchKey: Symbol("dispatch key"),
		kDefaultHeaders: Symbol("default headers"),
		kDefaultTrailers: Symbol("default trailers"),
		kContentLength: Symbol("content length"),
		kMockAgent: Symbol("mock agent"),
		kMockAgentSet: Symbol("mock agent set"),
		kMockAgentGet: Symbol("mock agent get"),
		kMockDispatch: Symbol("mock dispatch"),
		kClose: Symbol("close"),
		kOriginalClose: Symbol("original agent close"),
		kOriginalDispatch: Symbol("original dispatch"),
		kOrigin: Symbol("origin"),
		kIsMockActive: Symbol("is mock active"),
		kNetConnect: Symbol("net connect"),
		kGetNetConnect: Symbol("get net connect"),
		kConnected: Symbol("connected"),
		kIgnoreTrailingSlash: Symbol("ignore trailing slash"),
		kMockAgentMockCallHistoryInstance: Symbol("mock agent mock call history name"),
		kMockAgentRegisterCallHistory: Symbol("mock agent register mock call history"),
		kMockAgentAddCallHistoryLog: Symbol("mock agent add call history log"),
		kMockAgentIsCallHistoryEnabled: Symbol("mock agent is call history enabled"),
		kMockAgentAcceptsNonStandardSearchParameters: Symbol("mock agent accepts non standard search parameters"),
		kMockCallHistoryAddLog: Symbol("mock call history add log"),
		kTotalDispatchCount: Symbol("total dispatch count")
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/mock/mock-utils.js
var require_mock_utils = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { MockNotMatchedError } = require_mock_errors();
	const { kDispatches, kMockAgent, kOriginalDispatch, kOrigin, kGetNetConnect, kTotalDispatchCount } = require_mock_symbols();
	const { serializePathWithQuery, parseHeaders } = require_util$5();
	const { STATUS_CODES: STATUS_CODES$1 } = __require("node:http");
	const { types: { isPromise: isPromise$1 } } = __require("node:util");
	const { InvalidArgumentError } = require_errors();
	function matchValue(match, value) {
		if (typeof match === "string") return match === value;
		if (match instanceof RegExp) return match.test(value);
		if (typeof match === "function") return match(value) === true;
		return false;
	}
	function lowerCaseEntries(headers) {
		return Object.fromEntries(Object.entries(headers).map(([headerName, headerValue]) => {
			return [headerName.toLocaleLowerCase(), headerValue];
		}));
	}
	/**
	* @param {import('../../index').Headers|string[]|Record<string, string>} headers
	* @param {string} key
	*/
	function getHeaderByName(headers, key) {
		if (Array.isArray(headers)) {
			for (let i = 0; i < headers.length; i += 2) if (headers[i].toLocaleLowerCase() === key.toLocaleLowerCase()) return headers[i + 1];
			return;
		} else if (typeof headers.get === "function") return headers.get(key);
		else return lowerCaseEntries(headers)[key.toLocaleLowerCase()];
	}
	/** @param {string[]} headers */
	function buildHeadersFromArray(headers) {
		const clone = headers.slice();
		const entries = [];
		for (let index = 0; index < clone.length; index += 2) entries.push([clone[index], clone[index + 1]]);
		return Object.fromEntries(entries);
	}
	function matchHeaders(mockDispatch, headers) {
		if (typeof mockDispatch.headers === "function") {
			if (Array.isArray(headers)) headers = buildHeadersFromArray(headers);
			return mockDispatch.headers(headers ? lowerCaseEntries(headers) : {});
		}
		if (typeof mockDispatch.headers === "undefined") return true;
		if (typeof headers !== "object" || typeof mockDispatch.headers !== "object") return false;
		for (const [matchHeaderName, matchHeaderValue] of Object.entries(mockDispatch.headers)) if (!matchValue(matchHeaderValue, getHeaderByName(headers, matchHeaderName))) return false;
		return true;
	}
	function normalizeSearchParams(query) {
		if (typeof query !== "string") return query;
		const originalQp = new URLSearchParams(query);
		const normalizedQp = new URLSearchParams();
		for (let [key, value] of originalQp.entries()) {
			key = key.replace("[]", "");
			if (/^(['"]).*\1$/.test(value)) {
				normalizedQp.append(key, value);
				continue;
			}
			if (value.includes(",")) {
				const values = value.split(",");
				for (const v of values) normalizedQp.append(key, v);
				continue;
			}
			normalizedQp.append(key, value);
		}
		return normalizedQp;
	}
	function safeUrl(path) {
		if (typeof path !== "string") return path;
		const pathSegments = path.split("?", 3);
		if (pathSegments.length !== 2) return path;
		const qp = new URLSearchParams(pathSegments.pop());
		qp.sort();
		return [...pathSegments, qp.toString()].join("?");
	}
	function matchKey(mockDispatch, { path, method, body, headers }) {
		const pathMatch = matchValue(mockDispatch.path, path);
		const methodMatch = matchValue(mockDispatch.method, method);
		const bodyMatch = typeof mockDispatch.body !== "undefined" ? matchValue(mockDispatch.body, body) : true;
		const headersMatch = matchHeaders(mockDispatch, headers);
		return pathMatch && methodMatch && bodyMatch && headersMatch;
	}
	function getResponseData(data) {
		if (Buffer.isBuffer(data)) return data;
		else if (data instanceof Uint8Array) return data;
		else if (data instanceof ArrayBuffer) return data;
		else if (typeof data === "object") return JSON.stringify(data);
		else if (data) return data.toString();
		else return "";
	}
	function getMockDispatch(mockDispatches, key) {
		const basePath = key.query ? serializePathWithQuery(key.path, key.query) : key.path;
		const resolvedPath = typeof basePath === "string" ? safeUrl(basePath) : basePath;
		const resolvedPathWithoutTrailingSlash = removeTrailingSlash(resolvedPath);
		let matchedMockDispatches = mockDispatches.filter(({ consumed }) => !consumed).filter(({ path, ignoreTrailingSlash }) => {
			return ignoreTrailingSlash ? matchValue(removeTrailingSlash(safeUrl(path)), resolvedPathWithoutTrailingSlash) : matchValue(safeUrl(path), resolvedPath);
		});
		if (matchedMockDispatches.length === 0) throw new MockNotMatchedError(`Mock dispatch not matched for path '${resolvedPath}'`);
		matchedMockDispatches = matchedMockDispatches.filter(({ method }) => matchValue(method, key.method));
		if (matchedMockDispatches.length === 0) throw new MockNotMatchedError(`Mock dispatch not matched for method '${key.method}' on path '${resolvedPath}'`);
		matchedMockDispatches = matchedMockDispatches.filter(({ body }) => typeof body !== "undefined" ? matchValue(body, key.body) : true);
		if (matchedMockDispatches.length === 0) throw new MockNotMatchedError(`Mock dispatch not matched for body '${key.body}' on path '${resolvedPath}'`);
		matchedMockDispatches = matchedMockDispatches.filter((mockDispatch) => matchHeaders(mockDispatch, key.headers));
		if (matchedMockDispatches.length === 0) {
			const headers = typeof key.headers === "object" ? JSON.stringify(key.headers) : key.headers;
			throw new MockNotMatchedError(`Mock dispatch not matched for headers '${headers}' on path '${resolvedPath}'`);
		}
		return matchedMockDispatches[0];
	}
	function addMockDispatch(mockDispatches, key, data, opts) {
		const baseData = {
			timesInvoked: 0,
			times: 1,
			persist: false,
			consumed: false,
			...opts
		};
		const replyData = typeof data === "function" ? { callback: data } : { ...data };
		const newMockDispatch = {
			...baseData,
			...key,
			pending: true,
			data: {
				error: null,
				...replyData
			}
		};
		mockDispatches.push(newMockDispatch);
		mockDispatches[kTotalDispatchCount] = (mockDispatches[kTotalDispatchCount] || 0) + 1;
		return newMockDispatch;
	}
	function deleteMockDispatch(mockDispatches, key) {
		const index = mockDispatches.findIndex((dispatch) => {
			if (!dispatch.consumed) return false;
			return matchKey(dispatch, key);
		});
		if (index !== -1) mockDispatches.splice(index, 1);
	}
	/**
	* @param {string} path Path to remove trailing slash from
	*/
	function removeTrailingSlash(path) {
		while (path.endsWith("/")) path = path.slice(0, -1);
		if (path.length === 0) path = "/";
		return path;
	}
	function buildKey(opts) {
		const { path, method, body, headers, query } = opts;
		return {
			path,
			method,
			body,
			headers,
			query
		};
	}
	function generateKeyValues(data) {
		const keys = Object.keys(data);
		const result = [];
		for (let i = 0; i < keys.length; ++i) {
			const key = keys[i];
			const value = data[key];
			const name = Buffer.from(`${key}`);
			if (Array.isArray(value)) for (let j = 0; j < value.length; ++j) result.push(name, Buffer.from(`${value[j]}`));
			else result.push(name, Buffer.from(`${value}`));
		}
		return result;
	}
	/**
	* @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Status
	* @param {number} statusCode
	*/
	function getStatusText(statusCode) {
		return STATUS_CODES$1[statusCode] || "unknown";
	}
	async function getResponse(body) {
		const buffers = [];
		for await (const data of body) buffers.push(data);
		return Buffer.concat(buffers).toString("utf8");
	}
	/**
	* Mock dispatch function used to simulate undici dispatches
	*/
	function mockDispatch(opts, handler) {
		const key = buildKey(opts);
		const mockDispatch = getMockDispatch(this[kDispatches], key);
		const mockDispatches = this[kDispatches];
		mockDispatch.timesInvoked++;
		const { timesInvoked, times } = mockDispatch;
		mockDispatch.consumed = !mockDispatch.persist && timesInvoked >= times;
		mockDispatch.pending = timesInvoked < times;
		if (mockDispatch.data.callback) {
			const callbackResult = mockDispatch.data.callback(opts);
			if (isPromise$1(callbackResult)) {
				callbackResult.then((resolvedData) => {
					mockDispatch.data = {
						...mockDispatch.data,
						...resolvedData
					};
					dispatchMockReply(mockDispatches, mockDispatch, key, opts, handler);
				}, (error) => {
					deleteMockDispatch(mockDispatches, key);
					handler.onResponseError(null, error);
				});
				return true;
			}
			mockDispatch.data = {
				...mockDispatch.data,
				...callbackResult
			};
		}
		return dispatchMockReply(mockDispatches, mockDispatch, key, opts, handler);
	}
	/**
	* Replies to a request once the mock dispatch data is fully resolved
	*/
	function dispatchMockReply(mockDispatches, mockDispatch, key, opts, handler) {
		const { data: { statusCode, data, headers, trailers, error }, delay } = mockDispatch;
		if (error !== null) {
			deleteMockDispatch(mockDispatches, key);
			handler.onResponseError(null, error);
			return true;
		}
		let aborted = false;
		let timer = null;
		const controller = {
			paused: false,
			rawHeaders: null,
			rawTrailers: null,
			pause() {
				this.paused = true;
			},
			resume() {
				this.paused = false;
			},
			abort: (reason) => {
				if (aborted) return;
				aborted = true;
				if (timer !== null) {
					clearTimeout(timer);
					timer = null;
				}
				handler.onResponseError?.(controller, reason);
			}
		};
		handler.onRequestStart?.(controller, null);
		if (typeof delay === "number" && delay > 0) timer = setTimeout(() => {
			timer = null;
			handleReply(mockDispatches);
		}, delay);
		else handleReply(mockDispatches);
		function handleReply(mockDispatches, _data = data) {
			if (aborted) return;
			const optsHeaders = Array.isArray(opts.headers) ? buildHeadersFromArray(opts.headers) : opts.headers;
			const body = typeof _data === "function" ? _data({
				...opts,
				headers: optsHeaders
			}) : _data;
			if (isPromise$1(body)) return body.then((newData) => handleReply(mockDispatches, newData));
			if (aborted) return;
			const responseData = getResponseData(body);
			const responseHeaders = generateKeyValues(headers);
			const responseTrailers = generateKeyValues(trailers);
			controller.rawHeaders = responseHeaders;
			controller.rawTrailers = responseTrailers;
			handler.onResponseStart?.(controller, statusCode, parseHeaders(responseHeaders), getStatusText(statusCode));
			handler.onResponseData?.(controller, Buffer.from(responseData));
			handler.onResponseEnd?.(controller, parseHeaders(responseTrailers));
			deleteMockDispatch(mockDispatches, key);
		}
		return true;
	}
	function buildMockDispatch() {
		const agent = this[kMockAgent];
		const origin = this[kOrigin];
		const originalDispatch = this[kOriginalDispatch];
		return function dispatch(opts, handler) {
			if (agent.isMockActive) try {
				mockDispatch.call(this, opts, handler);
			} catch (error) {
				if (error.code === "UND_MOCK_ERR_MOCK_NOT_MATCHED") {
					const netConnect = agent[kGetNetConnect]();
					const totalInterceptsCount = this[kDispatches][kTotalDispatchCount] || this[kDispatches].length;
					const interceptsMessage = `, ${this[kDispatches].filter(({ consumed }) => !consumed).length} interceptor(s) remaining out of ${totalInterceptsCount} defined`;
					if (netConnect === false) throw new MockNotMatchedError(`${error.message}: subsequent request to origin ${origin} was not allowed (net.connect disabled)${interceptsMessage}`);
					if (checkNetConnect(netConnect, origin)) originalDispatch.call(this, "__mockAgentBodyForDispatch" in opts ? {
						...opts,
						body: opts.__mockAgentBodyForDispatch
					} : opts, handler);
					else throw new MockNotMatchedError(`${error.message}: subsequent request to origin ${origin} was not allowed (net.connect is not enabled for this origin)${interceptsMessage}`);
				} else throw error;
			}
			else originalDispatch.call(this, opts, handler);
		};
	}
	function checkNetConnect(netConnect, origin) {
		const url = new URL(origin);
		if (netConnect === true) return true;
		else if (Array.isArray(netConnect) && netConnect.some((matcher) => matchValue(matcher, url.host))) return true;
		return false;
	}
	function normalizeOrigin(origin) {
		if (typeof origin !== "string" && !(origin instanceof URL)) return origin;
		if (origin instanceof URL) return origin.origin;
		return origin.toLowerCase();
	}
	function buildAndValidateMockOptions(opts) {
		const { agent, ...mockOptions } = opts;
		if ("enableCallHistory" in mockOptions && typeof mockOptions.enableCallHistory !== "boolean") throw new InvalidArgumentError("options.enableCallHistory must to be a boolean");
		if ("acceptNonStandardSearchParameters" in mockOptions && typeof mockOptions.acceptNonStandardSearchParameters !== "boolean") throw new InvalidArgumentError("options.acceptNonStandardSearchParameters must to be a boolean");
		if ("ignoreTrailingSlash" in mockOptions && typeof mockOptions.ignoreTrailingSlash !== "boolean") throw new InvalidArgumentError("options.ignoreTrailingSlash must to be a boolean");
		return mockOptions;
	}
	module.exports = {
		getResponseData,
		getMockDispatch,
		addMockDispatch,
		deleteMockDispatch,
		buildKey,
		generateKeyValues,
		matchValue,
		getResponse,
		getStatusText,
		mockDispatch,
		buildMockDispatch,
		checkNetConnect,
		buildAndValidateMockOptions,
		getHeaderByName,
		buildHeadersFromArray,
		normalizeSearchParams,
		normalizeOrigin
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/mock/mock-interceptor.js
var require_mock_interceptor = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { getResponseData, buildKey, addMockDispatch } = require_mock_utils();
	const { kDispatches, kDispatchKey, kDefaultHeaders, kDefaultTrailers, kContentLength, kMockDispatch, kIgnoreTrailingSlash } = require_mock_symbols();
	const { InvalidArgumentError } = require_errors();
	const { serializePathWithQuery } = require_util$5();
	const { types: { isPromise } } = __require("node:util");
	/**
	* Defines the scope API for an interceptor reply
	*/
	var MockScope = class {
		constructor(mockDispatch) {
			this[kMockDispatch] = mockDispatch;
		}
		/**
		* Delay a reply by a set amount in ms.
		*/
		delay(waitInMs) {
			if (typeof waitInMs !== "number" || !Number.isInteger(waitInMs) || waitInMs <= 0) throw new InvalidArgumentError("waitInMs must be a valid integer > 0");
			this[kMockDispatch].delay = waitInMs;
			return this;
		}
		/**
		* For a defined reply, never mark as consumed.
		*/
		persist() {
			this[kMockDispatch].persist = true;
			return this;
		}
		/**
		* Allow one to define a reply for a set amount of matching requests.
		*/
		times(repeatTimes) {
			if (typeof repeatTimes !== "number" || !Number.isInteger(repeatTimes) || repeatTimes <= 0) throw new InvalidArgumentError("repeatTimes must be a valid integer > 0");
			this[kMockDispatch].times = repeatTimes;
			return this;
		}
	};
	/**
	* Defines an interceptor for a Mock
	*/
	var MockInterceptor = class {
		constructor(opts, mockDispatches) {
			if (typeof opts !== "object") throw new InvalidArgumentError("opts must be an object");
			if (typeof opts.path === "undefined") throw new InvalidArgumentError("opts.path must be defined");
			if (typeof opts.method === "undefined") opts.method = "GET";
			if (typeof opts.path === "string") {
				if (opts.query) opts.path = serializePathWithQuery(opts.path, opts.query);
				else {
					const parsedURL = new URL(opts.path, "data://");
					opts.path = parsedURL.pathname + parsedURL.search;
				}
			}
			if (typeof opts.method === "string") opts.method = opts.method.toUpperCase();
			this[kDispatchKey] = buildKey(opts);
			this[kDispatches] = mockDispatches;
			this[kIgnoreTrailingSlash] = opts.ignoreTrailingSlash ?? false;
			this[kDefaultHeaders] = {};
			this[kDefaultTrailers] = {};
			this[kContentLength] = false;
		}
		createMockScopeDispatchData({ statusCode, data, responseOptions }) {
			const responseData = getResponseData(data);
			const contentLength = this[kContentLength] ? { "content-length": responseData.length } : {};
			return {
				statusCode,
				data,
				headers: {
					...this[kDefaultHeaders],
					...contentLength,
					...responseOptions.headers
				},
				trailers: {
					...this[kDefaultTrailers],
					...responseOptions.trailers
				}
			};
		}
		validateReplyParameters(replyParameters) {
			if (typeof replyParameters.statusCode === "undefined") throw new InvalidArgumentError("statusCode must be defined");
			if (typeof replyParameters.responseOptions !== "object" || replyParameters.responseOptions === null) throw new InvalidArgumentError("responseOptions must be an object");
		}
		/**
		* Mock an undici request with a defined reply.
		*/
		reply(replyOptionsCallbackOrStatusCode) {
			if (typeof replyOptionsCallbackOrStatusCode === "function") {
				const resolveReplyCallbackData = (resolvedData) => {
					if (typeof resolvedData !== "object" || resolvedData === null) throw new InvalidArgumentError("reply options callback must return an object");
					const replyParameters = {
						data: "",
						responseOptions: {},
						...resolvedData
					};
					this.validateReplyParameters(replyParameters);
					return { ...this.createMockScopeDispatchData(replyParameters) };
				};
				const wrappedDefaultsCallback = (opts) => {
					const resolvedData = replyOptionsCallbackOrStatusCode(opts);
					if (isPromise(resolvedData)) return resolvedData.then(resolveReplyCallbackData);
					return resolveReplyCallbackData(resolvedData);
				};
				return new MockScope(addMockDispatch(this[kDispatches], this[kDispatchKey], wrappedDefaultsCallback, { ignoreTrailingSlash: this[kIgnoreTrailingSlash] }));
			}
			const replyParameters = {
				statusCode: replyOptionsCallbackOrStatusCode,
				data: arguments[1] === void 0 ? "" : arguments[1],
				responseOptions: arguments[2] === void 0 ? {} : arguments[2]
			};
			this.validateReplyParameters(replyParameters);
			const dispatchData = this.createMockScopeDispatchData(replyParameters);
			return new MockScope(addMockDispatch(this[kDispatches], this[kDispatchKey], dispatchData, { ignoreTrailingSlash: this[kIgnoreTrailingSlash] }));
		}
		/**
		* Mock an undici request with a defined error.
		*/
		replyWithError(error) {
			if (typeof error === "undefined") throw new InvalidArgumentError("error must be defined");
			return new MockScope(addMockDispatch(this[kDispatches], this[kDispatchKey], { error }, { ignoreTrailingSlash: this[kIgnoreTrailingSlash] }));
		}
		/**
		* Set default reply headers on the interceptor for subsequent replies
		*/
		defaultReplyHeaders(headers) {
			if (typeof headers === "undefined") throw new InvalidArgumentError("headers must be defined");
			this[kDefaultHeaders] = headers;
			return this;
		}
		/**
		* Set default reply trailers on the interceptor for subsequent replies
		*/
		defaultReplyTrailers(trailers) {
			if (typeof trailers === "undefined") throw new InvalidArgumentError("trailers must be defined");
			this[kDefaultTrailers] = trailers;
			return this;
		}
		/**
		* Set reply content length header for replies on the interceptor
		*/
		replyContentLength() {
			this[kContentLength] = true;
			return this;
		}
	};
	module.exports.MockInterceptor = MockInterceptor;
	module.exports.MockScope = MockScope;
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/mock/mock-client.js
var require_mock_client = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { promisify: promisify$1 } = __require("node:util");
	const Client = require_client();
	const { buildMockDispatch } = require_mock_utils();
	const { kDispatches, kMockAgent, kClose, kOriginalClose, kOrigin, kOriginalDispatch, kConnected, kIgnoreTrailingSlash } = require_mock_symbols();
	const { MockInterceptor } = require_mock_interceptor();
	const Symbols = require_symbols();
	const { InvalidArgumentError } = require_errors();
	/**
	* MockClient provides an API that extends the Client to influence the mockDispatches.
	*/
	var MockClient = class extends Client {
		constructor(origin, opts) {
			if (!opts || !opts.agent || typeof opts.agent.dispatch !== "function") throw new InvalidArgumentError("Argument opts.agent must implement Agent");
			super(origin, opts);
			this[kMockAgent] = opts.agent;
			this[kOrigin] = origin;
			this[kIgnoreTrailingSlash] = opts.ignoreTrailingSlash ?? false;
			this[kDispatches] = [];
			this[kConnected] = 1;
			this[kOriginalDispatch] = this.dispatch;
			this[kOriginalClose] = this.close.bind(this);
			this.dispatch = buildMockDispatch.call(this);
			this.close = this[kClose];
		}
		get [Symbols.kConnected]() {
			return this[kConnected];
		}
		/**
		* Sets up the base interceptor for mocking replies from undici.
		*/
		intercept(opts) {
			return new MockInterceptor(opts && {
				ignoreTrailingSlash: this[kIgnoreTrailingSlash],
				...opts
			}, this[kDispatches]);
		}
		cleanMocks() {
			this[kDispatches] = [];
		}
		async [kClose]() {
			await promisify$1(this[kOriginalClose])();
			this[kConnected] = 0;
			this[kMockAgent][Symbols.kClients].delete(this[kOrigin]);
		}
	};
	module.exports = MockClient;
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/mock/mock-call-history.js
var require_mock_call_history = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { kMockCallHistoryAddLog } = require_mock_symbols();
	const { InvalidArgumentError } = require_errors();
	function handleFilterCallsWithOptions(criteria, options, handler, store, allLogs) {
		switch (options.operator) {
			case "OR":
				store.push(...handler(criteria, allLogs));
				return store;
			case "AND": return handler(criteria, store);
			default: throw new InvalidArgumentError("options.operator must to be a case insensitive string equal to 'OR' or 'AND'");
		}
	}
	function buildAndValidateFilterCallsOptions(options = {}) {
		const finalOptions = {};
		if ("operator" in options) {
			if (typeof options.operator !== "string" || options.operator.toUpperCase() !== "OR" && options.operator.toUpperCase() !== "AND") throw new InvalidArgumentError("options.operator must to be a case insensitive string equal to 'OR' or 'AND'");
			return {
				...finalOptions,
				operator: options.operator.toUpperCase()
			};
		}
		return finalOptions;
	}
	function makeFilterCalls(parameterName) {
		return (parameterValue, logs = this.logs) => {
			if (typeof parameterValue === "string" || parameterValue == null) return logs.filter((log) => {
				return log[parameterName] === parameterValue;
			});
			if (parameterValue instanceof RegExp) return logs.filter((log) => {
				return parameterValue.test(log[parameterName]);
			});
			throw new InvalidArgumentError(`${parameterName} parameter should be one of string, regexp, undefined or null`);
		};
	}
	function computeUrlWithMaybeSearchParameters(requestInit) {
		try {
			const url = new URL(requestInit.path, requestInit.origin);
			if (url.search.length !== 0) return url;
			url.search = new URLSearchParams(requestInit.query).toString();
			return url;
		} catch (error) {
			throw new InvalidArgumentError("An error occurred when computing MockCallHistoryLog.url", { cause: error });
		}
	}
	var MockCallHistoryLog = class {
		constructor(requestInit = {}) {
			this.body = requestInit.body;
			this.headers = requestInit.headers;
			this.method = requestInit.method;
			const url = computeUrlWithMaybeSearchParameters(requestInit);
			this.fullUrl = url.toString();
			this.origin = url.origin;
			this.path = url.pathname;
			this.searchParams = Object.fromEntries(url.searchParams);
			this.protocol = url.protocol;
			this.host = url.host;
			this.port = url.port;
			this.hash = url.hash;
		}
		toMap() {
			return /* @__PURE__ */ new Map([
				["protocol", this.protocol],
				["host", this.host],
				["port", this.port],
				["origin", this.origin],
				["path", this.path],
				["hash", this.hash],
				["searchParams", this.searchParams],
				["fullUrl", this.fullUrl],
				["method", this.method],
				["body", this.body],
				["headers", this.headers]
			]);
		}
		toString() {
			const options = {
				betweenKeyValueSeparator: "->",
				betweenPairSeparator: "|"
			};
			let result = "";
			this.toMap().forEach((value, key) => {
				if (typeof value === "string" || value === void 0 || value === null) result = `${result}${key}${options.betweenKeyValueSeparator}${value}${options.betweenPairSeparator}`;
				if (typeof value === "object" && value !== null || Array.isArray(value)) result = `${result}${key}${options.betweenKeyValueSeparator}${JSON.stringify(value)}${options.betweenPairSeparator}`;
			});
			return result.slice(0, -1);
		}
	};
	var MockCallHistory = class {
		logs = [];
		calls() {
			return this.logs;
		}
		firstCall() {
			return this.logs.at(0);
		}
		lastCall() {
			return this.logs.at(-1);
		}
		nthCall(number) {
			if (typeof number !== "number") throw new InvalidArgumentError("nthCall must be called with a number");
			if (!Number.isInteger(number)) throw new InvalidArgumentError("nthCall must be called with an integer");
			if (Math.sign(number) !== 1) throw new InvalidArgumentError("nthCall must be called with a positive value. use firstCall or lastCall instead");
			return this.logs.at(number - 1);
		}
		filterCalls(criteria, options) {
			if (this.logs.length === 0) return this.logs;
			if (typeof criteria === "function") return this.logs.filter(criteria);
			if (criteria instanceof RegExp) return this.logs.filter((log) => {
				return criteria.test(log.toString());
			});
			if (typeof criteria === "object" && criteria !== null) {
				if (Object.keys(criteria).length === 0) return this.logs;
				const finalOptions = {
					operator: "OR",
					...buildAndValidateFilterCallsOptions(options)
				};
				let maybeDuplicatedLogsFiltered = finalOptions.operator === "AND" ? this.logs : [];
				if ("protocol" in criteria) maybeDuplicatedLogsFiltered = handleFilterCallsWithOptions(criteria.protocol, finalOptions, this.filterCallsByProtocol, maybeDuplicatedLogsFiltered, this.logs);
				if ("host" in criteria) maybeDuplicatedLogsFiltered = handleFilterCallsWithOptions(criteria.host, finalOptions, this.filterCallsByHost, maybeDuplicatedLogsFiltered, this.logs);
				if ("port" in criteria) maybeDuplicatedLogsFiltered = handleFilterCallsWithOptions(criteria.port, finalOptions, this.filterCallsByPort, maybeDuplicatedLogsFiltered, this.logs);
				if ("origin" in criteria) maybeDuplicatedLogsFiltered = handleFilterCallsWithOptions(criteria.origin, finalOptions, this.filterCallsByOrigin, maybeDuplicatedLogsFiltered, this.logs);
				if ("path" in criteria) maybeDuplicatedLogsFiltered = handleFilterCallsWithOptions(criteria.path, finalOptions, this.filterCallsByPath, maybeDuplicatedLogsFiltered, this.logs);
				if ("hash" in criteria) maybeDuplicatedLogsFiltered = handleFilterCallsWithOptions(criteria.hash, finalOptions, this.filterCallsByHash, maybeDuplicatedLogsFiltered, this.logs);
				if ("fullUrl" in criteria) maybeDuplicatedLogsFiltered = handleFilterCallsWithOptions(criteria.fullUrl, finalOptions, this.filterCallsByFullUrl, maybeDuplicatedLogsFiltered, this.logs);
				if ("method" in criteria) maybeDuplicatedLogsFiltered = handleFilterCallsWithOptions(criteria.method, finalOptions, this.filterCallsByMethod, maybeDuplicatedLogsFiltered, this.logs);
				return [...new Set(maybeDuplicatedLogsFiltered)];
			}
			throw new InvalidArgumentError("criteria parameter should be one of function, regexp, or object");
		}
		filterCallsByProtocol = makeFilterCalls.call(this, "protocol");
		filterCallsByHost = makeFilterCalls.call(this, "host");
		filterCallsByPort = makeFilterCalls.call(this, "port");
		filterCallsByOrigin = makeFilterCalls.call(this, "origin");
		filterCallsByPath = makeFilterCalls.call(this, "path");
		filterCallsByHash = makeFilterCalls.call(this, "hash");
		filterCallsByFullUrl = makeFilterCalls.call(this, "fullUrl");
		filterCallsByMethod = makeFilterCalls.call(this, "method");
		clear() {
			this.logs = [];
		}
		[kMockCallHistoryAddLog](requestInit) {
			const log = new MockCallHistoryLog(requestInit);
			this.logs.push(log);
			return log;
		}
		*[Symbol.iterator]() {
			for (const log of this.calls()) yield log;
		}
	};
	module.exports.MockCallHistory = MockCallHistory;
	module.exports.MockCallHistoryLog = MockCallHistoryLog;
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/mock/mock-pool.js
var require_mock_pool = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { promisify } = __require("node:util");
	const Pool = require_pool();
	const { buildMockDispatch } = require_mock_utils();
	const { kDispatches, kMockAgent, kClose, kOriginalClose, kOrigin, kOriginalDispatch, kConnected, kIgnoreTrailingSlash } = require_mock_symbols();
	const { MockInterceptor } = require_mock_interceptor();
	const Symbols = require_symbols();
	const { InvalidArgumentError } = require_errors();
	/**
	* MockPool provides an API that extends the Pool to influence the mockDispatches.
	*/
	var MockPool = class extends Pool {
		constructor(origin, opts) {
			if (!opts || !opts.agent || typeof opts.agent.dispatch !== "function") throw new InvalidArgumentError("Argument opts.agent must implement Agent");
			super(origin, opts);
			this[kMockAgent] = opts.agent;
			this[kOrigin] = origin;
			this[kIgnoreTrailingSlash] = opts.ignoreTrailingSlash ?? false;
			this[kDispatches] = [];
			this[kConnected] = 1;
			this[kOriginalDispatch] = this.dispatch;
			this[kOriginalClose] = this.close.bind(this);
			this.dispatch = buildMockDispatch.call(this);
			this.close = this[kClose];
		}
		get [Symbols.kConnected]() {
			return this[kConnected];
		}
		/**
		* Sets up the base interceptor for mocking replies from undici.
		*/
		intercept(opts) {
			return new MockInterceptor(opts && {
				ignoreTrailingSlash: this[kIgnoreTrailingSlash],
				...opts
			}, this[kDispatches]);
		}
		cleanMocks() {
			this[kDispatches] = [];
		}
		async [kClose]() {
			await promisify(this[kOriginalClose])();
			this[kConnected] = 0;
			this[kMockAgent][Symbols.kClients].delete(this[kOrigin]);
		}
	};
	module.exports = MockPool;
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/mock/pending-interceptors-formatter.js
var require_pending_interceptors_formatter = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { Transform: Transform$1 } = __require("node:stream");
	const { Console } = __require("node:console");
	const PERSISTENT = process.versions.icu ? "✅" : "Y ";
	const NOT_PERSISTENT = process.versions.icu ? "❌" : "N ";
	/**
	* Gets the output of `console.table(…)` as a string.
	*/
	module.exports = class PendingInterceptorsFormatter {
		constructor({ disableColors } = {}) {
			this.transform = new Transform$1({ transform(chunk, _enc, cb) {
				cb(null, chunk);
			} });
			this.logger = new Console({
				stdout: this.transform,
				inspectOptions: { colors: !disableColors && !process.env.CI }
			});
		}
		format(pendingInterceptors) {
			const withPrettyHeaders = pendingInterceptors.map(({ method, path, data: { statusCode }, persist, times, timesInvoked, origin }) => ({
				Method: method,
				Origin: origin,
				Path: path,
				"Status code": statusCode,
				Persistent: persist ? PERSISTENT : NOT_PERSISTENT,
				Invocations: timesInvoked,
				Remaining: persist ? Infinity : times - timesInvoked
			}));
			this.logger.table(withPrettyHeaders);
			return this.transform.read().toString();
		}
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/mock/mock-agent.js
var require_mock_agent = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { kClients } = require_symbols();
	const Agent = require_agent();
	const { kAgent, kMockAgentSet, kMockAgentGet, kDispatches, kIsMockActive, kNetConnect, kGetNetConnect, kOptions, kFactory, kMockAgentRegisterCallHistory, kMockAgentIsCallHistoryEnabled, kMockAgentAddCallHistoryLog, kMockAgentMockCallHistoryInstance, kMockAgentAcceptsNonStandardSearchParameters, kMockCallHistoryAddLog, kIgnoreTrailingSlash } = require_mock_symbols();
	const MockClient = require_mock_client();
	const MockPool = require_mock_pool();
	const { matchValue, normalizeSearchParams, buildAndValidateMockOptions, normalizeOrigin } = require_mock_utils();
	const { InvalidArgumentError, UndiciError } = require_errors();
	const Dispatcher = require_dispatcher();
	const PendingInterceptorsFormatter = require_pending_interceptors_formatter();
	const { MockCallHistory } = require_mock_call_history();
	var MockAgent = class extends Dispatcher {
		constructor(opts = {}) {
			super(opts);
			const mockOptions = buildAndValidateMockOptions(opts);
			this[kNetConnect] = true;
			this[kIsMockActive] = true;
			this[kMockAgentIsCallHistoryEnabled] = mockOptions.enableCallHistory ?? false;
			this[kMockAgentAcceptsNonStandardSearchParameters] = mockOptions.acceptNonStandardSearchParameters ?? false;
			this[kIgnoreTrailingSlash] = mockOptions.ignoreTrailingSlash ?? false;
			if (opts?.agent && typeof opts.agent.dispatch !== "function") throw new InvalidArgumentError("Argument opts.agent must implement Agent");
			const agent = opts?.agent ? opts.agent : new Agent(opts);
			this[kAgent] = agent;
			this[kClients] = agent[kClients];
			this[kOptions] = mockOptions;
			if (this[kMockAgentIsCallHistoryEnabled]) this[kMockAgentRegisterCallHistory]();
		}
		get(origin) {
			const normalizedOrigin = normalizeOrigin(origin);
			const originKey = this[kIgnoreTrailingSlash] ? normalizedOrigin.replace(/\/$/, "") : normalizedOrigin;
			let dispatcher = this[kMockAgentGet](originKey);
			if (!dispatcher) {
				dispatcher = this[kFactory](originKey);
				this[kMockAgentSet](originKey, dispatcher);
			}
			return dispatcher;
		}
		dispatch(opts, handler) {
			opts.origin = normalizeOrigin(opts.origin);
			this.get(opts.origin);
			this[kMockAgentAddCallHistoryLog](opts);
			const acceptNonStandardSearchParameters = this[kMockAgentAcceptsNonStandardSearchParameters];
			const dispatchOpts = { ...opts };
			if (acceptNonStandardSearchParameters && dispatchOpts.path) {
				const [path, searchParams] = dispatchOpts.path.split("?");
				dispatchOpts.path = `${path}?${normalizeSearchParams(searchParams, acceptNonStandardSearchParameters)}`;
			}
			return this[kAgent].dispatch(dispatchOpts, handler);
		}
		async close() {
			this.clearCallHistory();
			await this[kAgent].close();
			this[kClients].clear();
		}
		deactivate() {
			this[kIsMockActive] = false;
		}
		activate() {
			this[kIsMockActive] = true;
		}
		enableNetConnect(matcher) {
			if (typeof matcher === "string" || typeof matcher === "function" || matcher instanceof RegExp) {
				if (Array.isArray(this[kNetConnect])) this[kNetConnect].push(matcher);
				else this[kNetConnect] = [matcher];
			} else if (typeof matcher === "undefined") this[kNetConnect] = true;
			else throw new InvalidArgumentError("Unsupported matcher. Must be one of String|Function|RegExp.");
		}
		disableNetConnect() {
			this[kNetConnect] = false;
		}
		enableCallHistory() {
			this[kMockAgentIsCallHistoryEnabled] = true;
			return this;
		}
		disableCallHistory() {
			this[kMockAgentIsCallHistoryEnabled] = false;
			return this;
		}
		getCallHistory() {
			return this[kMockAgentMockCallHistoryInstance];
		}
		clearCallHistory() {
			if (this[kMockAgentMockCallHistoryInstance] !== void 0) this[kMockAgentMockCallHistoryInstance].clear();
		}
		get isMockActive() {
			return this[kIsMockActive];
		}
		[kMockAgentRegisterCallHistory]() {
			if (this[kMockAgentMockCallHistoryInstance] === void 0) this[kMockAgentMockCallHistoryInstance] = new MockCallHistory();
		}
		[kMockAgentAddCallHistoryLog](opts) {
			if (this[kMockAgentIsCallHistoryEnabled]) {
				this[kMockAgentRegisterCallHistory]();
				this[kMockAgentMockCallHistoryInstance][kMockCallHistoryAddLog](opts);
			}
		}
		[kMockAgentSet](origin, dispatcher) {
			this[kClients].set(origin, dispatcher);
		}
		[kFactory](origin) {
			const mockOptions = Object.assign({ agent: this }, this[kOptions]);
			return this[kOptions] && this[kOptions].connections === 1 ? new MockClient(origin, mockOptions) : new MockPool(origin, mockOptions);
		}
		[kMockAgentGet](origin) {
			const dispatcher = this[kClients].get(origin);
			if (dispatcher) return dispatcher;
			if (typeof origin !== "string") {
				const dispatcher = this[kFactory]("http://localhost:9999");
				this[kMockAgentSet](origin, dispatcher);
				return dispatcher;
			}
			for (const [keyMatcher, nonExplicitDispatcher] of Array.from(this[kClients])) if (nonExplicitDispatcher && typeof keyMatcher !== "string" && matchValue(keyMatcher, origin)) {
				const dispatcher = this[kFactory](origin);
				this[kMockAgentSet](origin, dispatcher);
				dispatcher[kDispatches] = nonExplicitDispatcher[kDispatches];
				return dispatcher;
			}
		}
		[kGetNetConnect]() {
			return this[kNetConnect];
		}
		pendingInterceptors() {
			const mockAgentClients = this[kClients];
			return Array.from(mockAgentClients.entries()).flatMap(([origin, dispatcher]) => dispatcher[kDispatches].map((dispatch) => ({
				...dispatch,
				origin
			}))).filter(({ pending }) => pending);
		}
		assertNoPendingInterceptors({ pendingInterceptorsFormatter = new PendingInterceptorsFormatter() } = {}) {
			const pending = this.pendingInterceptors();
			if (pending.length === 0) return;
			throw new UndiciError(pending.length === 1 ? `1 interceptor is pending:\n\n${pendingInterceptorsFormatter.format(pending)}`.trim() : `${pending.length} interceptors are pending:\n\n${pendingInterceptorsFormatter.format(pending)}`.trim());
		}
	};
	module.exports = MockAgent;
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/mock/snapshot-utils.js
var require_snapshot_utils = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { InvalidArgumentError } = require_errors();
	const { runtimeFeatures } = require_runtime_features();
	/**
	* @typedef {Object} HeaderFilters
	* @property {Set<string>} ignore - Set of headers to ignore for matching
	* @property {Set<string>} exclude - Set of headers to exclude from matching
	* @property {Set<string>} match - Set of headers to match (empty means match
	*/
	/**
	* Creates cached header sets for performance
	*
	* @param {import('./snapshot-recorder').SnapshotRecorderMatchOptions} matchOptions - Matching options for headers
	* @returns {HeaderFilters} - Cached sets for ignore, exclude, and match headers
	*/
	function createHeaderFilters(matchOptions = {}) {
		const { ignoreHeaders = [], excludeHeaders = [], matchHeaders = [], caseSensitive = false } = matchOptions;
		return {
			ignore: new Set(ignoreHeaders.map((header) => caseSensitive ? header : header.toLowerCase())),
			exclude: new Set(excludeHeaders.map((header) => caseSensitive ? header : header.toLowerCase())),
			match: new Set(matchHeaders.map((header) => caseSensitive ? header : header.toLowerCase()))
		};
	}
	const crypto$1 = runtimeFeatures.has("crypto") ? __require("node:crypto") : null;
	/**
	* @callback HashIdFunction
	* @param {string} value - The value to hash
	* @returns {string} - The base64url encoded hash of the value
	*/
	/**
	* Generates a hash for a given value
	* @type {HashIdFunction}
	*/
	const hashId = crypto$1?.hash ? (value) => crypto$1.hash("sha256", value, "base64url") : (value) => Buffer.from(value).toString("base64url");
	/**
	* @typedef {(url: string) => boolean} IsUrlExcluded Checks if a URL matches any of the exclude patterns
	*/
	/** @typedef {{[key: Lowercase<string>]: string}} NormalizedHeaders */
	/** @typedef {Array<string>} UndiciHeaders */
	/** @typedef {Record<string, string|string[]>} Headers */
	/**
	* @param {*} headers
	* @returns {headers is UndiciHeaders}
	*/
	function isUndiciHeaders(headers) {
		return Array.isArray(headers) && (headers.length & 1) === 0;
	}
	/**
	* Factory function to create a URL exclusion checker
	* @param {Array<string| RegExp>} [excludePatterns=[]] - Array of patterns to exclude
	* @returns {IsUrlExcluded} - A function that checks if a URL matches any of the exclude patterns
	*/
	function isUrlExcludedFactory(excludePatterns = []) {
		if (excludePatterns.length === 0) return () => false;
		return function isUrlExcluded(url) {
			let urlLowerCased;
			for (const pattern of excludePatterns) if (typeof pattern === "string") {
				if (!urlLowerCased) urlLowerCased = url.toLowerCase();
				if (urlLowerCased.includes(pattern.toLowerCase())) return true;
			} else if (pattern instanceof RegExp) {
				if (pattern.test(url)) return true;
			}
			return false;
		};
	}
	/**
	* Normalizes headers for consistent comparison
	*
	* @param {Object|UndiciHeaders} headers - Headers to normalize
	* @returns {NormalizedHeaders} - Normalized headers as a lowercase object
	*/
	function normalizeHeaders(headers) {
		/** @type {NormalizedHeaders} */
		const normalizedHeaders = {};
		if (!headers) return normalizedHeaders;
		if (isUndiciHeaders(headers)) {
			for (let i = 0; i < headers.length; i += 2) {
				const key = headers[i];
				const value = headers[i + 1];
				if (key && value !== void 0) {
					const keyStr = Buffer.isBuffer(key) ? key.toString() : key;
					const valueStr = Buffer.isBuffer(value) ? value.toString() : value;
					normalizedHeaders[keyStr.toLowerCase()] = valueStr;
				}
			}
			return normalizedHeaders;
		}
		if (headers && typeof headers === "object") {
			for (const [key, value] of Object.entries(headers)) if (key && typeof key === "string") normalizedHeaders[key.toLowerCase()] = Array.isArray(value) ? value.join(", ") : String(value);
		}
		return normalizedHeaders;
	}
	const validSnapshotModes = [
		"record",
		"playback",
		"update"
	];
	/** @typedef {typeof validSnapshotModes[number]} SnapshotMode */
	/**
	* @param {*} mode - The snapshot mode to validate
	* @returns {asserts mode is SnapshotMode}
	*/
	function validateSnapshotMode(mode) {
		if (!validSnapshotModes.includes(mode)) throw new InvalidArgumentError(`Invalid snapshot mode: ${mode}. Must be one of: ${validSnapshotModes.join(", ")}`);
	}
	module.exports = {
		createHeaderFilters,
		hashId,
		isUndiciHeaders,
		normalizeHeaders,
		isUrlExcludedFactory,
		validateSnapshotMode
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/mock/snapshot-recorder.js
var require_snapshot_recorder = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { writeFile, readFile, mkdir } = __require("node:fs/promises");
	const { dirname, resolve } = __require("node:path");
	const { setTimeout: setTimeout$1, clearTimeout: clearTimeout$1 } = __require("node:timers");
	const { InvalidArgumentError, UndiciError } = require_errors();
	const { hashId, isUrlExcludedFactory, normalizeHeaders, createHeaderFilters } = require_snapshot_utils();
	/**
	* @typedef {Object} SnapshotRequestOptions
	* @property {string} method - HTTP method (e.g. 'GET', 'POST', etc.)
	* @property {string} path - Request path
	* @property {string} origin - Request origin (base URL)
	* @property {import('./snapshot-utils').Headers|import('./snapshot-utils').UndiciHeaders} headers - Request headers
	* @property {import('./snapshot-utils').NormalizedHeaders} _normalizedHeaders - Request headers as a lowercase object
	* @property {string|Buffer} [body] - Request body (optional)
	*/
	/**
	* @typedef {Object} SnapshotEntryRequest
	* @property {string} method - HTTP method (e.g. 'GET', 'POST', etc.)
	* @property {string} url - Full URL of the request
	* @property {import('./snapshot-utils').NormalizedHeaders} headers - Normalized headers as a lowercase object
	* @property {string|Buffer} [body] - Request body (optional)
	*/
	/**
	* @typedef {Object} SnapshotEntryResponse
	* @property {number} statusCode - HTTP status code of the response
	* @property {import('./snapshot-utils').NormalizedHeaders} headers - Normalized response headers as a lowercase object
	* @property {string} body - Response body as a base64url encoded string
	* @property {Object} [trailers] - Optional response trailers
	*/
	/**
	* @typedef {Object} SnapshotEntry
	* @property {SnapshotEntryRequest} request - The request object
	* @property {Array<SnapshotEntryResponse>} responses - Array of response objects
	* @property {number} callCount - Number of times this snapshot has been called
	* @property {string} timestamp - ISO timestamp of when the snapshot was created
	*/
	/**
	* @typedef {Object} SnapshotRecorderMatchOptions
	* @property {Array<string>} [matchHeaders=[]] - Headers to match (empty array means match all headers)
	* @property {Array<string>} [ignoreHeaders=[]] - Headers to ignore for matching
	* @property {Array<string>} [excludeHeaders=[]] - Headers to exclude from matching
	* @property {boolean} [matchBody=true] - Whether to match request body
	* @property {(body: string|Buffer|null|undefined) => string} [normalizeBody] - Function to normalize the body before matching (e.g. strip timestamps)
	* @property {boolean} [matchQuery=true] - Whether to match query parameters
	* @property {(query: URLSearchParams) => string} [normalizeQuery] - Function to normalize query parameters before matching (e.g. strip volatile params)
	* @property {boolean} [caseSensitive=false] - Whether header matching is case-sensitive
	*/
	/**
	* @typedef {Object} SnapshotRecorderOptions
	* @property {string} [snapshotPath] - Path to save/load snapshots
	* @property {import('./snapshot-utils').SnapshotMode} [mode='record'] - Mode: 'record' or 'playback'
	* @property {number} [maxSnapshots=Infinity] - Maximum number of snapshots to keep
	* @property {boolean} [autoFlush=false] - Whether to automatically flush snapshots to disk
	* @property {number} [flushInterval=30000] - Auto-flush interval in milliseconds (default: 30 seconds)
	* @property {Array<string|RegExp>} [excludeUrls=[]] - URLs to exclude from recording
	* @property {function} [shouldRecord=null] - Function to filter requests for recording
	* @property {function} [shouldPlayback=null] - Function to filter requests
	*/
	/**
	* @typedef {Object} SnapshotFormattedRequest
	* @property {string} method - HTTP method (e.g. 'GET', 'POST', etc.)
	* @property {string} url - Full URL of the request (with query parameters if matchQuery is true)
	* @property {import('./snapshot-utils').NormalizedHeaders} headers - Normalized headers as a lowercase object
	* @property {string} body - Request body (optional, only if matchBody is true)
	*/
	/**
	* @typedef {Object} SnapshotInfo
	* @property {string} hash - Hash key for the snapshot
	* @property {SnapshotEntryRequest} request - The request object
	* @property {number} responseCount - Number of responses recorded for this request
	* @property {number} callCount - Number of times this snapshot has been called
	* @property {string} timestamp - ISO timestamp of when the snapshot was created
	*/
	/**
	* Normalizes the URL string used for request matching.
	*
	* @param {URL} url - Parsed request URL
	* @param {boolean} matchQuery - Whether to include query parameters in matching
	* @param {((query: URLSearchParams) => string)|undefined} normalizeQuery - Optional normalization function
	* @returns {string} - URL string for hashing
	*/
	function normalizeUrlForMatching(url, matchQuery, normalizeQuery) {
		if (matchQuery === false) return `${url.origin}${url.pathname}`;
		if (normalizeQuery) {
			const normalized = String(normalizeQuery(url.searchParams) ?? "");
			return normalized ? `${url.origin}${url.pathname}?${normalized}` : `${url.origin}${url.pathname}`;
		}
		return url.toString();
	}
	/**
	* Normalizes the body value used for request matching.
	*
	* @param {string|Buffer|null|undefined} body - Raw request body
	* @param {boolean} matchBody - Whether to include the body in matching
	* @param {((body: string|Buffer|null|undefined) => string)|undefined} normalizeBody - Optional normalization function
	* @returns {string} - Body string for hashing
	*/
	function normalizeBodyForMatching(body, matchBody, normalizeBody) {
		if (matchBody === false) return "";
		if (normalizeBody) return String(normalizeBody(body) ?? "");
		return body ? String(body) : "";
	}
	/**
	* Formats a request for consistent snapshot storage
	* Caches normalized headers to avoid repeated processing
	*
	* @param {SnapshotRequestOptions} opts - Request options
	* @param {import('./snapshot-utils').HeaderFilters} headerFilters - Cached header sets for performance
	* @param {SnapshotRecorderMatchOptions} [matchOptions] - Matching options for headers and body
	* @returns {SnapshotFormattedRequest} - Formatted request object
	*/
	function formatRequestKey(opts, headerFilters, matchOptions = {}) {
		const url = new URL(opts.path, opts.origin);
		const normalized = opts._normalizedHeaders || normalizeHeaders(opts.headers);
		if (!opts._normalizedHeaders) opts._normalizedHeaders = normalized;
		return {
			method: opts.method || "GET",
			url: normalizeUrlForMatching(url, matchOptions.matchQuery, matchOptions.normalizeQuery),
			headers: filterHeadersForMatching(normalized, headerFilters, matchOptions),
			body: normalizeBodyForMatching(opts.body, matchOptions.matchBody, matchOptions.normalizeBody)
		};
	}
	/**
	* Filters headers based on matching configuration
	*
	* @param {import('./snapshot-utils').Headers} headers - Headers to filter
	* @param {import('./snapshot-utils').HeaderFilters} headerFilters - Cached sets for ignore, exclude, and match headers
	* @param {SnapshotRecorderMatchOptions} [matchOptions] - Matching options for headers
	*/
	function filterHeadersForMatching(headers, headerFilters, matchOptions = {}) {
		if (!headers || typeof headers !== "object") return {};
		const { caseSensitive = false } = matchOptions;
		const filtered = {};
		const { ignore, exclude, match } = headerFilters;
		for (const [key, value] of Object.entries(headers)) {
			const headerKey = caseSensitive ? key : key.toLowerCase();
			if (exclude.has(headerKey)) continue;
			if (ignore.has(headerKey)) continue;
			if (match.size !== 0) {
				if (!match.has(headerKey)) continue;
			}
			filtered[headerKey] = value;
		}
		return filtered;
	}
	/**
	* Filters headers for storage (only excludes sensitive headers)
	*
	* @param {import('./snapshot-utils').Headers} headers - Headers to filter
	* @param {import('./snapshot-utils').HeaderFilters} headerFilters - Cached sets for ignore, exclude, and match headers
	* @param {SnapshotRecorderMatchOptions} [matchOptions] - Matching options for headers
	*/
	function filterHeadersForStorage(headers, headerFilters, matchOptions = {}) {
		if (!headers || typeof headers !== "object") return {};
		const { caseSensitive = false } = matchOptions;
		const filtered = {};
		const { exclude: excludeSet } = headerFilters;
		for (const [key, value] of Object.entries(headers)) {
			const headerKey = caseSensitive ? key : key.toLowerCase();
			if (excludeSet.has(headerKey)) continue;
			filtered[headerKey] = value;
		}
		return filtered;
	}
	/**
	* Creates a hash key for request matching
	* Properly orders headers to avoid conflicts and uses crypto hashing when available
	*
	* @param {SnapshotFormattedRequest} formattedRequest - Request object
	* @returns {string} - Base64url encoded hash of the request
	*/
	function createRequestHash(formattedRequest) {
		const parts = [formattedRequest.method, formattedRequest.url];
		if (formattedRequest.headers && typeof formattedRequest.headers === "object") {
			const headerKeys = Object.keys(formattedRequest.headers).sort();
			for (const key of headerKeys) {
				const values = Array.isArray(formattedRequest.headers[key]) ? formattedRequest.headers[key] : [formattedRequest.headers[key]];
				parts.push(key);
				for (const value of values.sort()) parts.push(String(value));
			}
		}
		parts.push(formattedRequest.body);
		const content = parts.join("|");
		return hashId(content);
	}
	var SnapshotRecorder = class {
		/** @type {NodeJS.Timeout | null} */
		#flushTimeout;
		/** @type {import('./snapshot-utils').IsUrlExcluded} */
		#isUrlExcluded;
		/** @type {Map<string, SnapshotEntry>} */
		#snapshots = /* @__PURE__ */ new Map();
		/** @type {string|undefined} */
		#snapshotPath;
		/** @type {number} */
		#maxSnapshots = Infinity;
		/** @type {boolean} */
		#autoFlush = false;
		/** @type {import('./snapshot-utils').HeaderFilters} */
		#headerFilters;
		/**
		* Creates a new SnapshotRecorder instance
		* @param {SnapshotRecorderOptions&SnapshotRecorderMatchOptions} [options={}] - Configuration options for the recorder
		*/
		constructor(options = {}) {
			this.#snapshotPath = options.snapshotPath;
			this.#maxSnapshots = options.maxSnapshots || Infinity;
			this.#autoFlush = options.autoFlush || false;
			this.flushInterval = options.flushInterval || 3e4;
			this._flushTimer = null;
			/** @type {Required<SnapshotRecorderMatchOptions>} */
			this.matchOptions = {
				matchHeaders: options.matchHeaders || [],
				ignoreHeaders: options.ignoreHeaders || [],
				excludeHeaders: options.excludeHeaders || [],
				matchBody: options.matchBody !== false,
				normalizeBody: options.normalizeBody || void 0,
				matchQuery: options.matchQuery !== false,
				normalizeQuery: options.normalizeQuery || void 0,
				caseSensitive: options.caseSensitive || false
			};
			this.#headerFilters = createHeaderFilters(this.matchOptions);
			this.shouldRecord = options.shouldRecord || (() => true);
			this.shouldPlayback = options.shouldPlayback || (() => true);
			this.#isUrlExcluded = isUrlExcludedFactory(options.excludeUrls);
			if (this.#autoFlush && this.#snapshotPath) this.#startAutoFlush();
		}
		/**
		* Records a request-response interaction
		* @param {SnapshotRequestOptions} requestOpts - Request options
		* @param {SnapshotEntryResponse} response - Response data to record
		* @return {Promise<void>} - Resolves when the recording is complete
		*/
		async record(requestOpts, response) {
			if (!this.shouldRecord(requestOpts)) return;
			if (this.isUrlExcluded(requestOpts)) return;
			const request = formatRequestKey(requestOpts, this.#headerFilters, this.matchOptions);
			const hash = createRequestHash(request);
			const normalizedHeaders = normalizeHeaders(response.headers);
			/** @type {SnapshotEntryResponse} */
			const responseData = {
				statusCode: response.statusCode,
				headers: filterHeadersForStorage(normalizedHeaders, this.#headerFilters, this.matchOptions),
				body: Buffer.isBuffer(response.body) ? response.body.toString("base64") : Buffer.from(String(response.body || "")).toString("base64"),
				trailers: response.trailers
			};
			if (this.#snapshots.size >= this.#maxSnapshots && !this.#snapshots.has(hash)) {
				const oldestKey = this.#snapshots.keys().next().value;
				this.#snapshots.delete(oldestKey);
			}
			const existingSnapshot = this.#snapshots.get(hash);
			if (existingSnapshot && existingSnapshot.responses) {
				existingSnapshot.responses.push(responseData);
				existingSnapshot.timestamp = (/* @__PURE__ */ new Date()).toISOString();
			} else this.#snapshots.set(hash, {
				request,
				responses: [responseData],
				callCount: 0,
				timestamp: (/* @__PURE__ */ new Date()).toISOString()
			});
			if (this.#autoFlush && this.#snapshotPath) this.#scheduleFlush();
		}
		/**
		* Checks if a URL should be excluded from recording/playback
		* @param {SnapshotRequestOptions} requestOpts - Request options to check
		* @returns {boolean} - True if URL is excluded
		*/
		isUrlExcluded(requestOpts) {
			const url = new URL(requestOpts.path, requestOpts.origin).toString();
			return this.#isUrlExcluded(url);
		}
		/**
		* Finds a matching snapshot for the given request
		* Returns the appropriate response based on call count for sequential responses
		*
		* @param {SnapshotRequestOptions} requestOpts - Request options to match
		* @returns {SnapshotEntry&Record<'response', SnapshotEntryResponse>|undefined} - Matching snapshot response or undefined if not found
		*/
		findSnapshot(requestOpts) {
			if (!this.shouldPlayback(requestOpts)) return;
			if (this.isUrlExcluded(requestOpts)) return;
			const hash = createRequestHash(formatRequestKey(requestOpts, this.#headerFilters, this.matchOptions));
			const snapshot = this.#snapshots.get(hash);
			if (!snapshot) return void 0;
			const currentCallCount = snapshot.callCount || 0;
			const responseIndex = Math.min(currentCallCount, snapshot.responses.length - 1);
			snapshot.callCount = currentCallCount + 1;
			return {
				...snapshot,
				response: snapshot.responses[responseIndex]
			};
		}
		/**
		* Loads snapshots from file
		* @param {string} [filePath] - Optional file path to load snapshots from
		* @return {Promise<void>} - Resolves when snapshots are loaded
		*/
		async loadSnapshots(filePath) {
			const path = filePath || this.#snapshotPath;
			if (!path) throw new InvalidArgumentError("Snapshot path is required");
			try {
				const data = await readFile(resolve(path), "utf8");
				const parsed = JSON.parse(data);
				if (Array.isArray(parsed)) {
					this.#snapshots.clear();
					for (const { hash, snapshot } of parsed) this.#snapshots.set(hash, snapshot);
				} else this.#snapshots = new Map(Object.entries(parsed));
			} catch (error) {
				if (error.code === "ENOENT") this.#snapshots.clear();
				else throw new UndiciError(`Failed to load snapshots from ${path}`, { cause: error });
			}
		}
		/**
		* Saves snapshots to file
		*
		* @param {string} [filePath] - Optional file path to save snapshots
		* @returns {Promise<void>} - Resolves when snapshots are saved
		*/
		async saveSnapshots(filePath) {
			const path = filePath || this.#snapshotPath;
			if (!path) throw new InvalidArgumentError("Snapshot path is required");
			const resolvedPath = resolve(path);
			await mkdir(dirname(resolvedPath), { recursive: true });
			const data = Array.from(this.#snapshots.entries()).map(([hash, snapshot]) => ({
				hash,
				snapshot
			}));
			await writeFile(resolvedPath, JSON.stringify(data, null, 2), { flush: true });
		}
		/**
		* Clears all recorded snapshots
		* @returns {void}
		*/
		clear() {
			this.#snapshots.clear();
		}
		/**
		* Gets all recorded snapshots
		* @return {Array<SnapshotEntry>} - Array of all recorded snapshots
		*/
		getSnapshots() {
			return Array.from(this.#snapshots.values());
		}
		/**
		* Gets snapshot count
		* @return {number} - Number of recorded snapshots
		*/
		size() {
			return this.#snapshots.size;
		}
		/**
		* Resets call counts for all snapshots (useful for test cleanup)
		* @returns {void}
		*/
		resetCallCounts() {
			for (const snapshot of this.#snapshots.values()) snapshot.callCount = 0;
		}
		/**
		* Deletes a specific snapshot by request options
		* @param {SnapshotRequestOptions} requestOpts - Request options to match
		* @returns {boolean} - True if snapshot was deleted, false if not found
		*/
		deleteSnapshot(requestOpts) {
			const hash = createRequestHash(formatRequestKey(requestOpts, this.#headerFilters, this.matchOptions));
			return this.#snapshots.delete(hash);
		}
		/**
		* Gets information about a specific snapshot
		* @param {SnapshotRequestOptions} requestOpts - Request options to match
		* @returns {SnapshotInfo|null} - Snapshot information or null if not found
		*/
		getSnapshotInfo(requestOpts) {
			const hash = createRequestHash(formatRequestKey(requestOpts, this.#headerFilters, this.matchOptions));
			const snapshot = this.#snapshots.get(hash);
			if (!snapshot) return null;
			return {
				hash,
				request: snapshot.request,
				responseCount: snapshot.responses ? snapshot.responses.length : snapshot.response ? 1 : 0,
				callCount: snapshot.callCount || 0,
				timestamp: snapshot.timestamp
			};
		}
		/**
		* Replaces all snapshots with new data (full replacement)
		* @param {Array<{hash: string; snapshot: SnapshotEntry}>|Record<string, SnapshotEntry>} snapshotData - New snapshot data to replace existing ones
		* @returns {void}
		*/
		replaceSnapshots(snapshotData) {
			this.#snapshots.clear();
			if (Array.isArray(snapshotData)) for (const { hash, snapshot } of snapshotData) this.#snapshots.set(hash, snapshot);
			else if (snapshotData && typeof snapshotData === "object") this.#snapshots = new Map(Object.entries(snapshotData));
		}
		/**
		* Starts the auto-flush timer
		* @returns {void}
		*/
		#startAutoFlush() {
			return this.#scheduleFlush();
		}
		/**
		* Stops the auto-flush timer
		* @returns {void}
		*/
		#stopAutoFlush() {
			if (this.#flushTimeout) {
				clearTimeout$1(this.#flushTimeout);
				this.saveSnapshots().catch(() => {});
				this.#flushTimeout = null;
			}
		}
		/**
		* Schedules a flush (debounced to avoid excessive writes)
		*/
		#scheduleFlush() {
			this.#flushTimeout = setTimeout$1(() => {
				this.saveSnapshots().catch(() => {});
				if (this.#autoFlush) this.#flushTimeout?.refresh();
				else this.#flushTimeout = null;
			}, 1e3);
		}
		/**
		* Cleanup method to stop timers
		* @returns {void}
		*/
		destroy() {
			this.#stopAutoFlush();
			if (this.#flushTimeout) {
				clearTimeout$1(this.#flushTimeout);
				this.#flushTimeout = null;
			}
		}
		/**
		* Async close method that saves all recordings and performs cleanup
		* @returns {Promise<void>}
		*/
		async close() {
			if (this.#snapshotPath && this.#snapshots.size !== 0) await this.saveSnapshots();
			this.destroy();
		}
	};
	module.exports = {
		SnapshotRecorder,
		formatRequestKey,
		createRequestHash,
		filterHeadersForMatching,
		filterHeadersForStorage,
		createHeaderFilters
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/mock/snapshot-agent.js
var require_snapshot_agent = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const Agent = require_agent();
	const MockAgent = require_mock_agent();
	const { SnapshotRecorder } = require_snapshot_recorder();
	const { InvalidArgumentError, UndiciError } = require_errors();
	const util = require_util$5();
	const { validateSnapshotMode } = require_snapshot_utils();
	const kSnapshotRecorder = Symbol("kSnapshotRecorder");
	const kSnapshotMode = Symbol("kSnapshotMode");
	const kSnapshotPath = Symbol("kSnapshotPath");
	const kSnapshotLoaded = Symbol("kSnapshotLoaded");
	const kRealAgent = Symbol("kRealAgent");
	let warningEmitted = false;
	var SnapshotAgent = class extends MockAgent {
		constructor(opts = {}) {
			if (!warningEmitted) {
				process.emitWarning("SnapshotAgent is experimental and subject to change", "ExperimentalWarning");
				warningEmitted = true;
			}
			const { mode = "record", snapshotPath = null, ...mockAgentOpts } = opts;
			super(mockAgentOpts);
			validateSnapshotMode(mode);
			if ((mode === "playback" || mode === "update") && !snapshotPath) throw new InvalidArgumentError(`snapshotPath is required when mode is '${mode}'`);
			this[kSnapshotMode] = mode;
			this[kSnapshotPath] = snapshotPath;
			this[kSnapshotRecorder] = new SnapshotRecorder({
				snapshotPath: this[kSnapshotPath],
				mode: this[kSnapshotMode],
				maxSnapshots: opts.maxSnapshots,
				autoFlush: opts.autoFlush,
				flushInterval: opts.flushInterval,
				matchHeaders: opts.matchHeaders,
				ignoreHeaders: opts.ignoreHeaders,
				excludeHeaders: opts.excludeHeaders,
				matchBody: opts.matchBody,
				normalizeBody: opts.normalizeBody,
				matchQuery: opts.matchQuery,
				normalizeQuery: opts.normalizeQuery,
				caseSensitive: opts.caseSensitive,
				shouldRecord: opts.shouldRecord,
				shouldPlayback: opts.shouldPlayback,
				excludeUrls: opts.excludeUrls
			});
			this[kSnapshotLoaded] = false;
			if (this[kSnapshotMode] === "record" || this[kSnapshotMode] === "update" || this[kSnapshotMode] === "playback" && opts.excludeUrls && opts.excludeUrls.length > 0) this[kRealAgent] = new Agent(opts);
			if ((this[kSnapshotMode] === "playback" || this[kSnapshotMode] === "update") && this[kSnapshotPath]) this.loadSnapshots().catch(() => {});
		}
		dispatch(opts, handler) {
			const mode = this[kSnapshotMode];
			if (this[kSnapshotRecorder].isUrlExcluded(opts)) return this[kRealAgent].dispatch(opts, handler);
			if (mode === "playback" || mode === "update") {
				if (!this[kSnapshotLoaded]) return this.#asyncDispatch(opts, handler);
				const snapshot = this[kSnapshotRecorder].findSnapshot(opts);
				if (snapshot) return this.#replaySnapshot(snapshot, handler);
				else if (mode === "update") return this.#recordAndReplay(opts, handler);
				else {
					const error = new UndiciError(`No snapshot found for ${opts.method || "GET"} ${opts.path}`);
					if (handler.onResponseError) {
						handler.onResponseError(null, error);
						return;
					}
					throw error;
				}
			} else if (mode === "record") return this.#recordAndReplay(opts, handler);
		}
		/**
		* Async version of dispatch for when we need to load snapshots first
		*/
		async #asyncDispatch(opts, handler) {
			await this.loadSnapshots();
			return this.dispatch(opts, handler);
		}
		/**
		* Records a real request and replays the response
		*/
		#recordAndReplay(opts, handler) {
			const responseData = {
				statusCode: null,
				headers: {},
				trailers: {},
				body: []
			};
			const self = this;
			return this[kRealAgent].dispatch(opts, {
				onRequestStart(controller, context) {
					return handler.onRequestStart(controller, {
						...context,
						history: this.history
					});
				},
				onRequestUpgrade(controller, statusCode, headers, socket) {
					return handler.onRequestUpgrade(controller, statusCode, headers, socket);
				},
				onResponseStart(controller, statusCode, headers, statusMessage) {
					responseData.statusCode = statusCode;
					responseData.headers = headers;
					return handler.onResponseStart(controller, statusCode, headers, statusMessage);
				},
				onResponseData(controller, chunk) {
					responseData.body.push(chunk);
					return handler.onResponseData(controller, chunk);
				},
				onResponseEnd(controller, trailers) {
					responseData.trailers = trailers;
					const responseBody = Buffer.concat(responseData.body);
					self[kSnapshotRecorder].record(opts, {
						statusCode: responseData.statusCode,
						headers: responseData.headers,
						body: responseBody,
						trailers: responseData.trailers
					}).then(() => handler.onResponseEnd(controller, trailers)).catch((error) => handler.onResponseError(controller, error));
				},
				onResponseError(controller, error) {
					return handler.onResponseError(controller, error);
				}
			});
		}
		/**
		* Replays a recorded response
		*
		* @param {Object} snapshot - The recorded snapshot to replay.
		* @param {Object} handler - The handler to call with the response data.
		* @returns {void}
		*/
		#replaySnapshot(snapshot, handler) {
			try {
				const { response } = snapshot;
				const controller = {
					rawHeaders: response.headers ? util.toRawHeaders(response.headers) : [],
					rawTrailers: response.trailers ? util.toRawHeaders(response.trailers) : [],
					pause() {},
					resume() {},
					abort(reason) {
						this.aborted = true;
						this.reason = reason;
					},
					aborted: false,
					paused: false
				};
				handler.onRequestStart(controller);
				handler.onResponseStart(controller, response.statusCode, response.headers, response.statusMessage);
				const body = Buffer.from(response.body, "base64");
				handler.onResponseData(controller, body);
				handler.onResponseEnd(controller, response.trailers);
			} catch (error) {
				handler.onResponseError?.(null, error);
			}
		}
		/**
		* Loads snapshots from file
		*
		* @param {string} [filePath] - Optional file path to load snapshots from.
		* @returns {Promise<void>} - Resolves when snapshots are loaded.
		*/
		async loadSnapshots(filePath) {
			await this[kSnapshotRecorder].loadSnapshots(filePath || this[kSnapshotPath]);
			this[kSnapshotLoaded] = true;
			if (this[kSnapshotMode] === "playback") this.#setupMockInterceptors();
		}
		/**
		* Saves snapshots to file
		*
		* @param {string} [filePath] - Optional file path to save snapshots to.
		* @returns {Promise<void>} - Resolves when snapshots are saved.
		*/
		async saveSnapshots(filePath) {
			return this[kSnapshotRecorder].saveSnapshots(filePath || this[kSnapshotPath]);
		}
		/**
		* Sets up MockAgent interceptors based on recorded snapshots.
		*
		* This method creates MockAgent interceptors for each recorded snapshot,
		* allowing the SnapshotAgent to fall back to MockAgent's standard intercept
		* mechanism in playback mode. Each interceptor is configured to persist
		* (remain active for multiple requests) and responds with the recorded
		* response data.
		*
		* Called automatically when loading snapshots in playback mode.
		*
		* @returns {void}
		*/
		#setupMockInterceptors() {
			for (const snapshot of this[kSnapshotRecorder].getSnapshots()) {
				const { request, responses, response } = snapshot;
				const url = new URL(request.url);
				const mockPool = this.get(url.origin);
				const responseData = responses ? responses[0] : response;
				if (!responseData) continue;
				mockPool.intercept({
					path: url.pathname + url.search,
					method: request.method,
					headers: request.headers,
					body: request.body
				}).reply(responseData.statusCode, responseData.body, {
					headers: responseData.headers,
					trailers: responseData.trailers
				}).persist();
			}
		}
		/**
		* Gets the snapshot recorder
		* @return {SnapshotRecorder} - The snapshot recorder instance
		*/
		getRecorder() {
			return this[kSnapshotRecorder];
		}
		/**
		* Gets the current mode
		* @return {import('./snapshot-utils').SnapshotMode} - The current snapshot mode
		*/
		getMode() {
			return this[kSnapshotMode];
		}
		/**
		* Clears all snapshots
		* @returns {void}
		*/
		clearSnapshots() {
			this[kSnapshotRecorder].clear();
		}
		/**
		* Resets call counts for all snapshots (useful for test cleanup)
		* @returns {void}
		*/
		resetCallCounts() {
			this[kSnapshotRecorder].resetCallCounts();
		}
		/**
		* Deletes a specific snapshot by request options
		* @param {import('./snapshot-recorder').SnapshotRequestOptions} requestOpts - Request options to identify the snapshot
		* @return {Promise<boolean>} - Returns true if the snapshot was deleted, false if not found
		*/
		deleteSnapshot(requestOpts) {
			return this[kSnapshotRecorder].deleteSnapshot(requestOpts);
		}
		/**
		* Gets information about a specific snapshot
		* @returns {import('./snapshot-recorder').SnapshotInfo|null} - Snapshot information or null if not found
		*/
		getSnapshotInfo(requestOpts) {
			return this[kSnapshotRecorder].getSnapshotInfo(requestOpts);
		}
		/**
		* Replaces all snapshots with new data (full replacement)
		* @param {Array<{hash: string; snapshot: import('./snapshot-recorder').SnapshotEntryshotEntry}>|Record<string, import('./snapshot-recorder').SnapshotEntry>} snapshotData - New snapshot data to replace existing snapshots
		* @returns {void}
		*/
		replaceSnapshots(snapshotData) {
			this[kSnapshotRecorder].replaceSnapshots(snapshotData);
		}
		/**
		* Closes the agent, saving snapshots and cleaning up resources.
		*
		* @returns {Promise<void>}
		*/
		async close() {
			if (this[kSnapshotMode] === "playback") this[kSnapshotRecorder].destroy();
			else await this[kSnapshotRecorder].close();
			await this[kRealAgent]?.close();
			await super.close();
		}
	};
	module.exports = SnapshotAgent;
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/global.js
var require_global = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const globalDispatcher = Symbol.for("undici.globalDispatcher.2");
	const legacyGlobalDispatcher = Symbol.for("undici.globalDispatcher.1");
	const { InvalidArgumentError } = require_errors();
	const Agent = require_agent();
	const Dispatcher1Wrapper = require_dispatcher1_wrapper();
	let fallbackDispatcher;
	if (getGlobalDispatcher() === void 0) setGlobalDispatcher(new Agent());
	function setGlobalDispatcher(agent) {
		if (!agent || typeof agent.dispatch !== "function") throw new InvalidArgumentError("Argument agent must implement Agent");
		try {
			Object.defineProperty(globalThis, globalDispatcher, {
				value: agent,
				writable: true,
				enumerable: false,
				configurable: false
			});
		} catch (err) {
			if (err instanceof TypeError) {
				fallbackDispatcher = agent;
				return;
			}
			throw err;
		}
		try {
			const legacyAgent = agent instanceof Dispatcher1Wrapper ? agent : new Dispatcher1Wrapper(agent);
			Object.defineProperty(globalThis, legacyGlobalDispatcher, {
				value: legacyAgent,
				writable: true,
				enumerable: false,
				configurable: false
			});
		} catch (err) {
			if (!(err instanceof TypeError)) throw err;
		}
	}
	function getGlobalDispatcher() {
		return globalThis[globalDispatcher] ?? fallbackDispatcher;
	}
	module.exports = {
		setGlobalDispatcher,
		getGlobalDispatcher,
		installedExports: [
			"fetch",
			"Headers",
			"Response",
			"Request",
			"FormData",
			"WebSocket",
			"CloseEvent",
			"ErrorEvent",
			"MessageEvent",
			"EventSource"
		]
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/handler/decorator-handler.js
var require_decorator_handler = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const assert$13 = __require("node:assert");
	/**
	* @deprecated
	*/
	module.exports = class DecoratorHandler {
		#handler;
		#onCompleteCalled = false;
		#onErrorCalled = false;
		#onResponseStartCalled = false;
		constructor(handler) {
			if (typeof handler !== "object" || handler === null) throw new TypeError("handler must be an object");
			this.#handler = handler;
		}
		onRequestStart(...args) {
			this.#handler.onRequestStart?.(...args);
		}
		onRequestUpgrade(...args) {
			assert$13(!this.#onCompleteCalled);
			assert$13(!this.#onErrorCalled);
			return this.#handler.onRequestUpgrade?.(...args);
		}
		onResponseStart(...args) {
			assert$13(!this.#onCompleteCalled);
			assert$13(!this.#onErrorCalled);
			assert$13(!this.#onResponseStartCalled);
			this.#onResponseStartCalled = true;
			return this.#handler.onResponseStart?.(...args);
		}
		onResponseData(...args) {
			assert$13(!this.#onCompleteCalled);
			assert$13(!this.#onErrorCalled);
			return this.#handler.onResponseData?.(...args);
		}
		onResponseEnd(...args) {
			assert$13(!this.#onCompleteCalled);
			assert$13(!this.#onErrorCalled);
			this.#onCompleteCalled = true;
			return this.#handler.onResponseEnd?.(...args);
		}
		onResponseError(...args) {
			this.#onErrorCalled = true;
			return this.#handler.onResponseError?.(...args);
		}
		/**
		* @deprecated
		*/
		onBodySent() {}
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/handler/redirect-handler.js
var require_redirect_handler = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const util = require_util$5();
	const assert$12 = __require("node:assert");
	const { InvalidArgumentError } = require_errors();
	const redirectableStatusCodes = [
		300,
		301,
		302,
		303,
		307,
		308
	];
	const noop = () => {};
	var RedirectHandler = class RedirectHandler {
		static buildDispatch(dispatcher, maxRedirections) {
			if (maxRedirections != null && (!Number.isInteger(maxRedirections) || maxRedirections < 0)) throw new InvalidArgumentError("maxRedirections must be a positive number");
			const dispatch = dispatcher.dispatch.bind(dispatcher);
			return (opts, originalHandler) => dispatch(opts, new RedirectHandler(dispatch, maxRedirections, opts, originalHandler));
		}
		constructor(dispatch, maxRedirections, opts, handler) {
			if (maxRedirections != null && (!Number.isInteger(maxRedirections) || maxRedirections < 0)) throw new InvalidArgumentError("maxRedirections must be a positive number");
			if (opts.throwOnMaxRedirect != null && typeof opts.throwOnMaxRedirect !== "boolean") throw new InvalidArgumentError("throwOnMaxRedirect must be a boolean");
			this.dispatch = dispatch;
			this.location = null;
			const { maxRedirections: _, stripHeadersOnRedirect, stripHeadersOnCrossOriginRedirect, ...cleanOpts } = opts;
			this.opts = cleanOpts;
			this.opts.body = util.wrapRequestBody(this.opts.body);
			this.stripHeadersOnRedirect = normalizeStripHeaders(stripHeadersOnRedirect, "stripHeadersOnRedirect");
			this.stripHeadersOnCrossOriginRedirect = normalizeStripHeaders(stripHeadersOnCrossOriginRedirect, "stripHeadersOnCrossOriginRedirect");
			this.maxRedirections = maxRedirections;
			this.handler = handler;
			this.history = [];
		}
		onRequestStart(controller, context) {
			this.handler.onRequestStart?.(controller, {
				...context,
				history: this.history
			});
		}
		onRequestUpgrade(controller, statusCode, headers, socket) {
			this.handler.onRequestUpgrade?.(controller, statusCode, headers, socket);
		}
		onResponseStart(controller, statusCode, headers, statusMessage) {
			if (this.opts.throwOnMaxRedirect && this.history.length >= this.maxRedirections) throw new Error("max redirects");
			let removeContentHeaders = statusCode === 303;
			if ((statusCode === 301 || statusCode === 302) && this.opts.method === "POST") {
				this.opts.method = "GET";
				if (util.isStream(this.opts.body)) util.destroy(this.opts.body.on("error", noop));
				this.opts.body = null;
				removeContentHeaders = true;
			}
			if (statusCode === 303 && this.opts.method !== "HEAD") {
				this.opts.method = "GET";
				if (util.isStream(this.opts.body)) util.destroy(this.opts.body.on("error", noop));
				this.opts.body = null;
			}
			this.location = this.history.length >= this.maxRedirections || util.isDisturbed(this.opts.body) || redirectableStatusCodes.indexOf(statusCode) === -1 ? null : headers.location;
			if (this.opts.origin) this.history.push(new URL(this.opts.path, this.opts.origin));
			if (!this.location) {
				this.handler.onResponseStart?.(controller, statusCode, headers, statusMessage);
				return;
			}
			const { origin, pathname, search } = util.parseURL(new URL(this.location, this.opts.origin && new URL(this.opts.path, this.opts.origin)));
			const path = search ? `${pathname}${search}` : pathname;
			const redirectUrlString = `${origin}${path}`;
			for (const historyUrl of this.history) if (historyUrl.toString() === redirectUrlString) throw new InvalidArgumentError(`Redirect loop detected. Cannot redirect to ${origin}. This typically happens when using a Client or Pool with cross-origin redirects. Use an Agent for cross-origin redirects.`);
			this.opts.headers = cleanRequestHeaders(this.opts.headers, removeContentHeaders, this.opts.origin !== origin, this.stripHeadersOnRedirect, this.stripHeadersOnCrossOriginRedirect);
			this.opts.path = path;
			this.opts.origin = origin;
			this.opts.query = null;
		}
		onResponseData(controller, chunk) {
			if (this.location) {} else this.handler.onResponseData?.(controller, chunk);
		}
		onResponseEnd(controller, trailers) {
			if (this.location) this.dispatch(this.opts, this);
			else this.handler.onResponseEnd(controller, trailers);
		}
		onResponseError(controller, error) {
			this.handler.onResponseError?.(controller, error);
		}
	};
	function shouldRemoveHeader(header, removeContent, unknownOrigin, stripHeaders, stripHeadersOnCrossOrigin) {
		const name = util.headerNameToString(header);
		if (name === "host") return true;
		if (stripHeaders?.has(name) || unknownOrigin && stripHeadersOnCrossOrigin?.has(name)) return true;
		if (removeContent && name.startsWith("content-")) return true;
		if (unknownOrigin) return name === "authorization" || name === "cookie" || name === "proxy-authorization";
		return false;
	}
	function normalizeStripHeaders(headers, optionName) {
		if (headers == null) return null;
		if (!Array.isArray(headers)) throw new InvalidArgumentError(`${optionName} must be an array`);
		const normalized = /* @__PURE__ */ new Set();
		for (const header of headers) {
			if (typeof header !== "string") throw new InvalidArgumentError(`${optionName} must contain header names`);
			normalized.add(util.headerNameToString(header));
		}
		return normalized;
	}
	function cleanRequestHeaders(headers, removeContent, unknownOrigin, stripHeaders, stripHeadersOnCrossOrigin) {
		const ret = [];
		if (Array.isArray(headers)) {
			for (let i = 0; i < headers.length; i += 2) if (!shouldRemoveHeader(headers[i], removeContent, unknownOrigin, stripHeaders, stripHeadersOnCrossOrigin)) ret.push(headers[i], headers[i + 1]);
		} else if (headers && typeof headers === "object") {
			const entries = util.hasSafeIterator(headers) ? headers : Object.entries(headers);
			for (const [key, value] of entries) if (!shouldRemoveHeader(key, removeContent, unknownOrigin, stripHeaders, stripHeadersOnCrossOrigin)) ret.push(key, value);
		} else assert$12(headers == null, "headers must be an object or an array");
		return ret;
	}
	module.exports = RedirectHandler;
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/interceptor/redirect.js
var require_redirect = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const RedirectHandler = require_redirect_handler();
	function createRedirectInterceptor({ maxRedirections: defaultMaxRedirections, throwOnMaxRedirect: defaultThrowOnMaxRedirect, stripHeadersOnRedirect: defaultStripHeadersOnRedirect, stripHeadersOnCrossOriginRedirect: defaultStripHeadersOnCrossOriginRedirect } = {}) {
		return (dispatch) => {
			return function Intercept(opts, handler) {
				const { maxRedirections = defaultMaxRedirections, throwOnMaxRedirect = defaultThrowOnMaxRedirect, stripHeadersOnRedirect = defaultStripHeadersOnRedirect, stripHeadersOnCrossOriginRedirect = defaultStripHeadersOnCrossOriginRedirect, ...rest } = opts;
				if (maxRedirections == null || maxRedirections === 0) return dispatch(opts, handler);
				const dispatchOpts = {
					...rest,
					throwOnMaxRedirect,
					stripHeadersOnRedirect,
					stripHeadersOnCrossOriginRedirect
				};
				return dispatch(dispatchOpts, new RedirectHandler(dispatch, maxRedirections, dispatchOpts, handler));
			};
		};
	}
	module.exports = createRedirectInterceptor;
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/interceptor/response-error.js
var require_response_error = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const DecoratorHandler = require_decorator_handler();
	const { ResponseError } = require_errors();
	var ResponseErrorHandler = class extends DecoratorHandler {
		#statusCode;
		#contentType;
		#decoder;
		#headers;
		#body;
		constructor(_opts, { handler }) {
			super(handler);
		}
		#checkContentType(contentType) {
			return (this.#contentType ?? "").indexOf(contentType) === 0;
		}
		onRequestStart(controller, context) {
			this.#statusCode = 0;
			this.#contentType = null;
			this.#decoder = null;
			this.#headers = null;
			this.#body = "";
			return super.onRequestStart(controller, context);
		}
		onResponseStart(controller, statusCode, headers, statusMessage) {
			this.#statusCode = statusCode;
			this.#headers = headers;
			this.#contentType = headers["content-type"];
			if (this.#statusCode < 400) return super.onResponseStart(controller, statusCode, headers, statusMessage);
			if (this.#checkContentType("application/json") || this.#checkContentType("text/plain")) this.#decoder = new TextDecoder("utf-8");
		}
		onResponseData(controller, chunk) {
			if (this.#statusCode < 400) return super.onResponseData(controller, chunk);
			this.#body += this.#decoder?.decode(chunk, { stream: true }) ?? "";
		}
		onResponseEnd(controller, trailers) {
			if (this.#statusCode >= 400) {
				this.#body += this.#decoder?.decode(void 0, { stream: false }) ?? "";
				if (this.#checkContentType("application/json")) try {
					this.#body = JSON.parse(this.#body);
				} catch {}
				let err;
				const stackTraceLimit = Error.stackTraceLimit;
				Error.stackTraceLimit = 0;
				try {
					err = new ResponseError("Response Error", this.#statusCode, {
						body: this.#body,
						headers: this.#headers
					});
				} finally {
					Error.stackTraceLimit = stackTraceLimit;
				}
				super.onResponseError(controller, err);
			} else super.onResponseEnd(controller, trailers);
		}
		onResponseError(controller, err) {
			super.onResponseError(controller, err);
		}
	};
	module.exports = () => {
		return (dispatch) => {
			return function Intercept(opts, handler) {
				return dispatch(opts, new ResponseErrorHandler(opts, { handler }));
			};
		};
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/interceptor/retry.js
var require_retry = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const RetryHandler = require_retry_handler();
	module.exports = (globalOpts) => {
		return (dispatch) => {
			return function retryInterceptor(opts, handler) {
				return dispatch(opts, new RetryHandler({
					...opts,
					retryOptions: {
						...globalOpts,
						...opts.retryOptions
					}
				}, {
					handler,
					dispatch
				}));
			};
		};
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/interceptor/dump.js
var require_dump = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { InvalidArgumentError, RequestAbortedError } = require_errors();
	const DecoratorHandler = require_decorator_handler();
	var DumpHandler = class extends DecoratorHandler {
		#maxSize = 1048576;
		#dumped = false;
		#size = 0;
		#controller = null;
		aborted = false;
		reason = false;
		constructor({ maxSize, signal }, handler) {
			if (maxSize != null && (!Number.isFinite(maxSize) || maxSize < 1)) throw new InvalidArgumentError("maxSize must be a number greater than 0");
			super(handler);
			this.#maxSize = maxSize ?? this.#maxSize;
		}
		#abort(reason) {
			this.aborted = true;
			this.reason = reason;
		}
		onRequestStart(controller, context) {
			controller.abort = this.#abort.bind(this);
			this.#controller = controller;
			return super.onRequestStart(controller, context);
		}
		onResponseStart(controller, statusCode, headers, statusMessage) {
			const contentLength = headers["content-length"];
			if (contentLength != null && contentLength > this.#maxSize) throw new RequestAbortedError(`Response size (${contentLength}) larger than maxSize (${this.#maxSize})`);
			if (this.aborted === true) return true;
			return super.onResponseStart(controller, statusCode, headers, statusMessage);
		}
		onResponseError(controller, err) {
			if (this.#dumped) return;
			err = this.#controller?.reason ?? err;
			super.onResponseError(controller, err);
		}
		onResponseData(controller, chunk) {
			this.#size = this.#size + chunk.length;
			if (this.#size >= this.#maxSize) {
				this.#dumped = true;
				if (this.aborted === true) super.onResponseError(controller, this.reason);
				else super.onResponseEnd(controller, {});
			}
			return true;
		}
		onResponseEnd(controller, trailers) {
			if (this.#dumped) return;
			if (this.#controller.aborted === true) {
				super.onResponseError(controller, this.reason);
				return;
			}
			super.onResponseEnd(controller, trailers);
		}
	};
	function createDumpInterceptor({ maxSize: defaultMaxSize } = { maxSize: 1048576 }) {
		return (dispatch) => {
			return function Intercept(opts, handler) {
				const { dumpMaxSize = defaultMaxSize } = opts;
				return dispatch(opts, new DumpHandler({
					maxSize: dumpMaxSize,
					signal: opts.signal
				}, handler));
			};
		};
	}
	module.exports = createDumpInterceptor;
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/interceptor/dns.js
var require_dns = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { isIP } = __require("node:net");
	const { lookup } = __require("node:dns");
	const DecoratorHandler = require_decorator_handler();
	const { InvalidArgumentError, InformationalError } = require_errors();
	const maxInt = Math.pow(2, 31) - 1;
	function hasSafeIterator(headers) {
		const prototype = Object.getPrototypeOf(headers);
		return Object.hasOwn(headers, Symbol.iterator) || prototype != null && prototype !== Object.prototype && typeof headers[Symbol.iterator] === "function";
	}
	function isHostHeader(key) {
		return typeof key === "string" && key.toLowerCase() === "host";
	}
	function normalizeHeaders(headers) {
		if (headers == null) return null;
		if (Array.isArray(headers)) {
			if (headers.length === 0 || !Array.isArray(headers[0])) return headers;
			const normalized = [];
			for (const header of headers) if (Array.isArray(header) && header.length === 2) normalized.push(header[0], header[1]);
			else normalized.push(header);
			return normalized;
		}
		if (typeof headers === "object" && hasSafeIterator(headers)) {
			const normalized = [];
			for (const header of headers) if (Array.isArray(header) && header.length === 2) normalized.push(header[0], header[1]);
			else normalized.push(header);
			return normalized;
		}
		return headers;
	}
	function hasHostHeader(headers) {
		if (headers == null) return false;
		if (Array.isArray(headers)) {
			if (headers.length === 0) return false;
			for (let i = 0; i < headers.length; i += 2) if (isHostHeader(headers[i])) return true;
			return false;
		}
		if (typeof headers === "object") {
			for (const key in headers) if (isHostHeader(key)) return true;
		}
		return false;
	}
	function withHostHeader(host, headers) {
		const normalizedHeaders = normalizeHeaders(headers);
		if (hasHostHeader(normalizedHeaders)) return normalizedHeaders;
		if (Array.isArray(normalizedHeaders)) return [
			"host",
			host,
			...normalizedHeaders
		];
		if (normalizedHeaders && typeof normalizedHeaders === "object") return {
			host,
			...normalizedHeaders
		};
		return { host };
	}
	var DNSStorage = class {
		#maxItems = 0;
		#records = /* @__PURE__ */ new Map();
		constructor(opts) {
			this.#maxItems = opts.maxItems;
		}
		get size() {
			return this.#records.size;
		}
		get(hostname) {
			return this.#records.get(hostname) ?? null;
		}
		set(hostname, records) {
			this.#records.set(hostname, records);
		}
		delete(hostname) {
			this.#records.delete(hostname);
		}
		full() {
			return this.size >= this.#maxItems;
		}
	};
	var DNSInstance = class {
		#maxTTL = 0;
		#maxItems = 0;
		dualStack = true;
		affinity = null;
		lookup = null;
		pick = null;
		storage = null;
		constructor(opts) {
			this.#maxTTL = opts.maxTTL;
			this.#maxItems = opts.maxItems;
			this.dualStack = opts.dualStack;
			this.affinity = opts.affinity;
			this.lookup = opts.lookup ?? this.#defaultLookup;
			this.pick = opts.pick ?? this.#defaultPick;
			this.storage = opts.storage ?? new DNSStorage(opts);
		}
		runLookup(origin, opts, cb) {
			const ips = this.storage.get(origin.hostname);
			if (ips == null && this.storage.full()) {
				cb(null, origin);
				return;
			}
			const newOpts = {
				affinity: this.affinity,
				dualStack: this.dualStack,
				lookup: this.lookup,
				pick: this.pick,
				...opts.dns,
				maxTTL: this.#maxTTL,
				maxItems: this.#maxItems
			};
			if (ips == null) this.lookup(origin, newOpts, (err, addresses) => {
				if (err || addresses == null || addresses.length === 0) {
					cb(err ?? new InformationalError("No DNS entries found"));
					return;
				}
				this.setRecords(origin, addresses);
				const records = this.storage.get(origin.hostname);
				const ip = this.pick(origin, records, newOpts.affinity);
				let port;
				if (typeof ip.port === "number") port = `:${ip.port}`;
				else if (origin.port !== "") port = `:${origin.port}`;
				else port = "";
				cb(null, new URL(`${origin.protocol}//${ip.family === 6 ? `[${ip.address}]` : ip.address}${port}`));
			});
			else {
				const ip = this.pick(origin, ips, newOpts.affinity);
				if (ip == null) {
					this.storage.delete(origin.hostname);
					this.runLookup(origin, opts, cb);
					return;
				}
				let port;
				if (typeof ip.port === "number") port = `:${ip.port}`;
				else if (origin.port !== "") port = `:${origin.port}`;
				else port = "";
				cb(null, new URL(`${origin.protocol}//${ip.family === 6 ? `[${ip.address}]` : ip.address}${port}`));
			}
		}
		#defaultLookup(origin, opts, cb) {
			lookup(origin.hostname, {
				all: true,
				family: this.dualStack === false ? this.affinity : 0,
				order: "ipv4first"
			}, (err, addresses) => {
				if (err) return cb(err);
				const results = /* @__PURE__ */ new Map();
				for (const addr of addresses) results.set(`${addr.address}:${addr.family}`, addr);
				cb(null, results.values());
			});
		}
		#defaultPick(origin, hostnameRecords, affinity) {
			let ip = null;
			const { records, offset } = hostnameRecords;
			let family;
			if (this.dualStack) {
				if (affinity == null) {
					if (offset == null || offset === maxInt) {
						hostnameRecords.offset = 0;
						affinity = 4;
					} else {
						hostnameRecords.offset++;
						affinity = (hostnameRecords.offset & 1) === 1 ? 6 : 4;
					}
				}
				if (records[affinity] != null && records[affinity].ips.length > 0) family = records[affinity];
				else family = records[affinity === 4 ? 6 : 4];
			} else family = records[affinity];
			if (family == null || family.ips.length === 0) return ip;
			if (family.offset == null || family.offset === maxInt) family.offset = 0;
			else family.offset++;
			const position = family.offset % family.ips.length;
			ip = family.ips[position] ?? null;
			if (ip == null) return ip;
			if (Date.now() - ip.timestamp > ip.ttl) {
				family.ips.splice(position, 1);
				return this.pick(origin, hostnameRecords, affinity);
			}
			return ip;
		}
		pickFamily(origin, ipFamily) {
			const records = this.storage.get(origin.hostname)?.records;
			if (!records) return null;
			const family = records[ipFamily];
			if (!family) return null;
			if (family.offset == null || family.offset === maxInt) family.offset = 0;
			else family.offset++;
			const position = family.offset % family.ips.length;
			const ip = family.ips[position] ?? null;
			if (ip == null) return ip;
			if (Date.now() - ip.timestamp > ip.ttl) family.ips.splice(position, 1);
			return ip;
		}
		setRecords(origin, addresses) {
			const timestamp = Date.now();
			const records = { records: {
				4: null,
				6: null
			} };
			let minTTL = this.#maxTTL;
			for (const record of addresses) {
				record.timestamp = timestamp;
				if (typeof record.ttl === "number") {
					record.ttl = Math.min(record.ttl, this.#maxTTL);
					minTTL = Math.min(minTTL, record.ttl);
				} else record.ttl = this.#maxTTL;
				const familyRecords = records.records[record.family] ?? { ips: [] };
				familyRecords.ips.push(record);
				records.records[record.family] = familyRecords;
			}
			this.storage.set(origin.hostname, records, { ttl: minTTL });
		}
		deleteRecords(origin) {
			this.storage.delete(origin.hostname);
		}
		getHandler(meta, opts) {
			return new DNSDispatchHandler(this, meta, opts);
		}
	};
	var DNSDispatchHandler = class extends DecoratorHandler {
		#state = null;
		#opts = null;
		#dispatch = null;
		#origin = null;
		#controller = null;
		#newOrigin = null;
		#firstTry = true;
		constructor(state, { origin, handler, dispatch, newOrigin }, opts) {
			super(handler);
			this.#origin = origin;
			this.#newOrigin = newOrigin;
			this.#opts = { ...opts };
			this.#state = state;
			this.#dispatch = dispatch;
		}
		onResponseError(controller, err) {
			switch (err.code) {
				case "ETIMEDOUT":
				case "ECONNREFUSED":
					if (this.#state.dualStack) {
						if (!this.#firstTry) {
							super.onResponseError(controller, err);
							return;
						}
						this.#firstTry = false;
						const otherFamily = this.#newOrigin.hostname[0] === "[" ? 4 : 6;
						const ip = this.#state.pickFamily(this.#origin, otherFamily);
						if (ip == null) {
							super.onResponseError(controller, err);
							return;
						}
						let port;
						if (typeof ip.port === "number") port = `:${ip.port}`;
						else if (this.#origin.port !== "") port = `:${this.#origin.port}`;
						else port = "";
						const dispatchOpts = {
							...this.#opts,
							origin: `${this.#origin.protocol}//${ip.family === 6 ? `[${ip.address}]` : ip.address}${port}`,
							headers: withHostHeader(this.#origin.host, this.#opts.headers)
						};
						this.#dispatch(dispatchOpts, this);
						return;
					}
					super.onResponseError(controller, err);
					break;
				case "ENOTFOUND":
					this.#state.deleteRecords(this.#origin);
					super.onResponseError(controller, err);
					break;
				default: super.onResponseError(controller, err);
			}
		}
	};
	module.exports = (interceptorOpts) => {
		if (interceptorOpts?.maxTTL != null && (typeof interceptorOpts?.maxTTL !== "number" || interceptorOpts?.maxTTL < 0)) throw new InvalidArgumentError("Invalid maxTTL. Must be a positive number");
		if (interceptorOpts?.maxItems != null && (typeof interceptorOpts?.maxItems !== "number" || interceptorOpts?.maxItems < 1)) throw new InvalidArgumentError("Invalid maxItems. Must be a positive number and greater than zero");
		if (interceptorOpts?.affinity != null && interceptorOpts?.affinity !== 4 && interceptorOpts?.affinity !== 6) throw new InvalidArgumentError("Invalid affinity. Must be either 4 or 6");
		if (interceptorOpts?.dualStack != null && typeof interceptorOpts?.dualStack !== "boolean") throw new InvalidArgumentError("Invalid dualStack. Must be a boolean");
		if (interceptorOpts?.lookup != null && typeof interceptorOpts?.lookup !== "function") throw new InvalidArgumentError("Invalid lookup. Must be a function");
		if (interceptorOpts?.pick != null && typeof interceptorOpts?.pick !== "function") throw new InvalidArgumentError("Invalid pick. Must be a function");
		if (interceptorOpts?.storage != null && (typeof interceptorOpts?.storage?.get !== "function" || typeof interceptorOpts?.storage?.set !== "function" || typeof interceptorOpts?.storage?.full !== "function" || typeof interceptorOpts?.storage?.delete !== "function")) throw new InvalidArgumentError("Invalid storage. Must be a object with methods: { get, set, full, delete }");
		const dualStack = interceptorOpts?.dualStack ?? true;
		let affinity;
		if (dualStack) affinity = interceptorOpts?.affinity ?? null;
		else affinity = interceptorOpts?.affinity ?? 4;
		const instance = new DNSInstance({
			maxTTL: interceptorOpts?.maxTTL ?? 1e4,
			lookup: interceptorOpts?.lookup ?? null,
			pick: interceptorOpts?.pick ?? null,
			dualStack,
			affinity,
			maxItems: interceptorOpts?.maxItems ?? Infinity,
			storage: interceptorOpts?.storage
		});
		return (dispatch) => {
			return function dnsInterceptor(origDispatchOpts, handler) {
				if (origDispatchOpts.origin == null) return dispatch(origDispatchOpts, handler);
				const origin = origDispatchOpts.origin.constructor === URL ? origDispatchOpts.origin : new URL(origDispatchOpts.origin);
				if (isIP(origin.hostname) !== 0) return dispatch(origDispatchOpts, handler);
				instance.runLookup(origin, origDispatchOpts, (err, newOrigin) => {
					if (err) return handler.onResponseError(null, err);
					dispatch({
						...origDispatchOpts,
						servername: origin.hostname,
						origin: newOrigin.origin,
						headers: withHostHeader(origin.host, origDispatchOpts.headers)
					}, instance.getHandler({
						origin,
						dispatch,
						handler,
						newOrigin
					}, origDispatchOpts));
				});
				return true;
			};
		};
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/util/cache.js
var require_cache$2 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { safeHTTPMethods, pathHasQueryOrFragment, hasSafeIterator, isValidHTTPToken } = require_util$5();
	const { serializePathWithQuery } = require_util$5();
	const MAX_DELTA_SECONDS = 2147483647;
	const RESTRICTIVE_DIRECTIVE_NAMES = [
		"no-store",
		"private",
		"no-cache"
	];
	const kInvalidCacheControlDirectives = Symbol("invalid cache-control directives");
	function trimOWS(value) {
		return value.replace(/^[\t ]+|[\t ]+$/g, "");
	}
	function arrayIncludes(array, value) {
		for (let i = 0; i < array.length; i++) if (array[i] === value) return true;
		return false;
	}
	function trimOWSStart(value) {
		return value.replace(/^[\t ]+/, "");
	}
	function trimOWSEnd(value) {
		return value.replace(/[\t ]+$/, "");
	}
	function findUnescapedQuote(value, start) {
		let escaped = false;
		for (let i = start; i < value.length; i++) if (escaped) escaped = false;
		else if (value[i] === "\\") escaped = true;
		else if (value[i] === "\"") return i;
		return -1;
	}
	function splitCacheControlHeaderValue(value) {
		const directives = [];
		let start = 0;
		let quoteStart = -1;
		let inQuote = false;
		let escaped = false;
		for (let i = 0; i < value.length; i++) if (inQuote) {
			if (escaped) escaped = false;
			else if (value[i] === "\\") escaped = true;
			else if (value[i] === "\"") {
				inQuote = false;
				quoteStart = -1;
			}
		} else if (value[i] === "\"") {
			inQuote = true;
			quoteStart = i;
		} else if (value[i] === ",") {
			directives.push({
				value: value.substring(start, i),
				fromMalformedQuote: false
			});
			start = i + 1;
		}
		if (!inQuote) {
			directives.push({
				value: value.substring(start),
				fromMalformedQuote: false
			});
			return directives;
		}
		const tail = value.substring(start);
		const quoteOffset = quoteStart - start;
		let tailStart = 0;
		for (let i = 0; i < tail.length; i++) if (tail[i] === ",") {
			directives.push({
				value: tail.substring(tailStart, i),
				fromMalformedQuote: tailStart > quoteOffset
			});
			tailStart = i + 1;
		}
		directives.push({
			value: tail.substring(tailStart),
			fromMalformedQuote: tailStart > quoteOffset
		});
		return directives;
	}
	function markInvalidCacheControlDirective(directives, key) {
		let invalidDirectives = directives[kInvalidCacheControlDirectives];
		if (invalidDirectives === void 0) {
			invalidDirectives = /* @__PURE__ */ new Set();
			Object.defineProperty(directives, kInvalidCacheControlDirectives, { value: invalidDirectives });
		}
		invalidDirectives.add(key);
	}
	function hasInvalidCacheControlDirective(directives, key) {
		return directives[kInvalidCacheControlDirectives]?.has(key) === true;
	}
	function getMalformedRestrictiveDirectiveName(key) {
		for (const directiveName of RESTRICTIVE_DIRECTIVE_NAMES) if (key.startsWith(directiveName) && key.length > directiveName.length && !isValidHTTPToken(key[directiveName.length])) return directiveName;
		let tokenOnlyKey = "";
		let hasInvalidTokenChar = false;
		for (let i = 0; i < key.length; i++) if (isValidHTTPToken(key[i])) tokenOnlyKey += key[i];
		else hasInvalidTokenChar = true;
		if (hasInvalidTokenChar && arrayIncludes(RESTRICTIVE_DIRECTIVE_NAMES, tokenOnlyKey)) return tokenOnlyKey;
	}
	/**
	* @param {import('../../types/dispatcher.d.ts').default.DispatchOptions} opts
	*/
	function makeCacheKey(opts) {
		if (!opts.origin) throw new Error("opts.origin is undefined");
		let fullPath = opts.path || "/";
		if (opts.query && !pathHasQueryOrFragment(fullPath)) fullPath = serializePathWithQuery(fullPath, opts.query);
		return {
			origin: opts.origin.toString(),
			method: opts.method,
			path: fullPath,
			headers: opts.headers
		};
	}
	function appendHeader(headers, key, val) {
		const headerName = key.toLowerCase();
		const current = headers[headerName];
		const values = Array.isArray(val) ? val : [val];
		if (current === void 0) headers[headerName] = Array.isArray(val) ? val.slice() : val;
		else if (Array.isArray(current)) current.push(...values);
		else headers[headerName] = [current, ...values];
	}
	/**
	* @param {Record<string, string[] | string>}
	* @returns {Record<string, string[] | string>}
	*/
	function normalizeHeaders(opts) {
		let headers;
		if (opts.headers == null) headers = {};
		else if (typeof opts.headers === "object") {
			headers = {};
			if (hasSafeIterator(opts.headers)) {
				if (Array.isArray(opts.headers)) {
					const first = opts.headers[0];
					if (Array.isArray(first)) for (const x of opts.headers) {
						if (!Array.isArray(x)) throw new Error("opts.headers is not a valid header map");
						const [key, val] = x;
						if (typeof key !== "string" || typeof val !== "string") throw new Error("opts.headers is not a valid header map");
						appendHeader(headers, key, val);
					}
					else {
						const len = opts.headers.length;
						if (len % 2 !== 0) throw new Error("opts.headers is not a valid header map");
						for (let i = 0; i < len; i += 2) {
							const key = opts.headers[i];
							const val = opts.headers[i + 1];
							if (typeof key !== "string" || typeof val !== "string" && !Array.isArray(val)) throw new Error("opts.headers is not a valid header map");
							if (typeof val === "string") appendHeader(headers, key, val);
							else {
								const mapped = [];
								for (let j = 0; j < val.length; j++) {
									const v = val[j];
									mapped.push(typeof v === "string" ? v : v.toString("latin1"));
								}
								appendHeader(headers, key, mapped);
							}
						}
					}
				} else for (const x of opts.headers) {
					if (!Array.isArray(x)) throw new Error("opts.headers is not a valid header map");
					const [key, val] = x;
					if (typeof key !== "string" || typeof val !== "string") throw new Error("opts.headers is not a valid header map");
					appendHeader(headers, key, val);
				}
			} else for (const key of Object.keys(opts.headers)) appendHeader(headers, key, opts.headers[key]);
		} else throw new Error("opts.headers is not an object");
		return headers;
	}
	/**
	* @param {any} key
	*/
	function assertCacheKey(key) {
		if (typeof key !== "object") throw new TypeError(`expected key to be object, got ${typeof key}`);
		for (const property of [
			"origin",
			"method",
			"path"
		]) if (typeof key[property] !== "string") throw new TypeError(`expected key.${property} to be string, got ${typeof key[property]}`);
		if (key.headers !== void 0 && typeof key.headers !== "object") throw new TypeError(`expected headers to be object, got ${typeof key}`);
	}
	/**
	* @param {any} value
	*/
	function assertCacheValue(value) {
		if (typeof value !== "object") throw new TypeError(`expected value to be object, got ${typeof value}`);
		for (const property of [
			"statusCode",
			"cachedAt",
			"staleAt",
			"deleteAt"
		]) if (typeof value[property] !== "number") throw new TypeError(`expected value.${property} to be number, got ${typeof value[property]}`);
		if (typeof value.statusMessage !== "string") throw new TypeError(`expected value.statusMessage to be string, got ${typeof value.statusMessage}`);
		if (value.headers != null && typeof value.headers !== "object") throw new TypeError(`expected value.rawHeaders to be object, got ${typeof value.headers}`);
		if (value.vary !== void 0 && typeof value.vary !== "object") throw new TypeError(`expected value.vary to be object, got ${typeof value.vary}`);
		if (value.etag !== void 0 && typeof value.etag !== "string") throw new TypeError(`expected value.etag to be string, got ${typeof value.etag}`);
	}
	/**
	* @see https://www.rfc-editor.org/rfc/rfc9111.html#name-cache-control
	* @see https://www.iana.org/assignments/http-cache-directives/http-cache-directives.xhtml
	
	* @param {string | string[]} header
	* @returns {import('../../types/cache-interceptor.d.ts').default.CacheControlDirectives}
	*/
	function parseCacheControlHeader(header) {
		/**
		* @type {import('../../types/cache-interceptor.d.ts').default.CacheControlDirectives}
		*/
		const output = {};
		const invalidNumericDirectives = /* @__PURE__ */ new Set();
		const invalidNoArgumentDirectives = /* @__PURE__ */ new Set();
		const directives = splitCacheControlHeaderValue(Array.isArray(header) ? header.join(",") : header);
		for (let i = 0; i < directives.length; i++) {
			const directiveRecord = directives[i];
			const directive = directiveRecord.value.toLowerCase();
			const fromMalformedQuote = directiveRecord.fromMalformedQuote;
			const keyValueDelimiter = directive.indexOf("=");
			let key;
			let value;
			let keyHasTrailingWhitespace = false;
			let valueHasLeadingWhitespace = false;
			if (keyValueDelimiter !== -1) {
				const rawKey = directive.substring(0, keyValueDelimiter);
				const rawValue = directive.substring(keyValueDelimiter + 1);
				keyHasTrailingWhitespace = trimOWSEnd(rawKey) !== rawKey;
				valueHasLeadingWhitespace = trimOWSStart(rawValue) !== rawValue;
				key = trimOWS(rawKey);
				value = trimOWSStart(rawValue);
			} else key = trimOWS(directive);
			const malformedRestrictiveDirectiveName = getMalformedRestrictiveDirectiveName(key);
			if (malformedRestrictiveDirectiveName !== void 0) {
				output[malformedRestrictiveDirectiveName] = true;
				continue;
			}
			switch (key) {
				case "min-fresh":
				case "max-stale":
				case "max-age":
				case "s-maxage":
				case "stale-while-revalidate":
				case "stale-if-error": {
					if (fromMalformedQuote || invalidNumericDirectives.has(key)) continue;
					if (value === void 0 || keyHasTrailingWhitespace || valueHasLeadingWhitespace) {
						delete output[key];
						invalidNumericDirectives.add(key);
						markInvalidCacheControlDirective(output, key);
						continue;
					}
					if (value.length >= 2 && value[0] === "\"" && value[value.length - 1] === "\"") value = value.substring(1, value.length - 1);
					if (!/^[0-9]+$/.test(value)) {
						delete output[key];
						invalidNumericDirectives.add(key);
						markInvalidCacheControlDirective(output, key);
						continue;
					}
					const parsedValue = Math.min(parseInt(value, 10), MAX_DELTA_SECONDS);
					if (key === "min-fresh") {
						if (!(key in output) || output[key] < parsedValue) output[key] = parsedValue;
					} else if (!(key in output) || output[key] > parsedValue) output[key] = parsedValue;
					break;
				}
				case "private":
				case "no-cache":
					if (fromMalformedQuote) {
						output[key] = true;
						break;
					}
					if (value !== void 0 && value.length === 0) {
						output[key] = true;
						break;
					}
					if (value) {
						if (value[0] === "\"") {
							value = trimOWSEnd(value);
							let fieldList = "";
							let lastQuotedPart = i;
							let foundEndingQuote = false;
							const closingQuote = findUnescapedQuote(value, 1);
							if (closingQuote !== -1) {
								fieldList = value.substring(1, closingQuote);
								foundEndingQuote = true;
							} else {
								const fieldListParts = [value.substring(1)];
								for (let j = i + 1; j < directives.length; j++) {
									const nextPart = trimOWS(directives[j].value);
									const closingQuote = findUnescapedQuote(nextPart, 0);
									lastQuotedPart = j;
									if (closingQuote !== -1) {
										fieldListParts.push(nextPart.substring(0, closingQuote));
										foundEndingQuote = true;
										break;
									}
									fieldListParts.push(nextPart);
								}
								fieldList = fieldListParts.join(",");
							}
							if (!foundEndingQuote) {
								output[key] = true;
								break;
							}
							i = lastQuotedPart;
							const headers = fieldList.split(",");
							let validFieldNames = true;
							for (let j = 0; j < headers.length; j++) {
								headers[j] = trimOWS(headers[j]);
								if (!isValidHTTPToken(headers[j])) validFieldNames = false;
							}
							if (!validFieldNames) output[key] = true;
							else if (output[key] !== true) {
								if (key in output) output[key] = output[key].concat(headers);
								else output[key] = headers;
							}
						} else {
							const fieldName = trimOWS(value);
							if (!isValidHTTPToken(fieldName)) output[key] = true;
							else if (output[key] !== true) {
								if (key in output) output[key] = output[key].concat(fieldName);
								else output[key] = [fieldName];
							}
						}
						break;
					}
				case "public":
				case "must-revalidate":
				case "proxy-revalidate":
				case "immutable":
				case "no-transform":
				case "must-understand":
				case "only-if-cached":
					if (fromMalformedQuote || invalidNoArgumentDirectives.has(key)) continue;
					if (value !== void 0) {
						delete output[key];
						invalidNoArgumentDirectives.add(key);
						continue;
					}
					output[key] = true;
					break;
				case "no-store":
					output[key] = true;
					break;
				default: continue;
			}
		}
		return output;
	}
	/**
	* @param {string | string[]} varyHeader Vary header from the server
	* @returns {string[]}
	*/
	function splitVaryHeader(varyHeader) {
		const values = Array.isArray(varyHeader) ? varyHeader : [varyHeader];
		const output = [];
		for (let i = 0; i < values.length; i++) {
			const parts = values[i].split(",");
			for (let j = 0; j < parts.length; j++) output.push(parts[j]);
		}
		return output;
	}
	/**
	* @param {string | string[]} varyHeader Vary header from the server
	* @returns {boolean}
	*/
	function hasVaryStar(varyHeader) {
		const values = splitVaryHeader(varyHeader);
		for (let i = 0; i < values.length; i++) if (trimOWS(values[i]).indexOf("*") !== -1) return true;
		return false;
	}
	/**
	* @param {string | string[]} varyHeader Vary header from the server
	* @param {Record<string, string | string[]>} headers Request headers
	* @returns {Record<string, string | string[] | null> | undefined}
	*/
	function parseVaryHeader(varyHeader, headers) {
		if (hasVaryStar(varyHeader)) return headers;
		const output = {};
		const varyingHeaders = splitVaryHeader(varyHeader);
		for (const header of varyingHeaders) {
			const trimmedHeader = trimOWS(header).toLowerCase();
			if (trimmedHeader.length === 0) continue;
			if (!isValidHTTPToken(trimmedHeader)) return;
			const headerValue = headers[trimmedHeader];
			output[trimmedHeader] = Array.isArray(headerValue) ? headerValue.slice() : headerValue ?? null;
		}
		return output;
	}
	/**
	* @param {string | string[]} varyHeader Vary header from the server
	* @returns {boolean}
	*/
	function isInvalidOrWildcardVaryHeader(varyHeader) {
		return hasVaryStar(varyHeader) || parseVaryHeader(varyHeader, {}) === void 0;
	}
	/**
	* Note: this deviates from the spec a little. Empty etags ("", W/"") are valid,
	*  however, including them in cached resposnes serves little to no purpose.
	*
	* @see https://www.rfc-editor.org/rfc/rfc9110.html#name-etag
	*
	* @param {string} etag
	* @returns {boolean}
	*/
	function isEtagUsable(etag) {
		if (etag.length <= 2) return false;
		if (etag[0] === "\"" && etag[etag.length - 1] === "\"") return !(etag[1] === "\"" || etag.startsWith("\"W/"));
		if (etag.startsWith("W/\"") && etag[etag.length - 1] === "\"") return etag.length !== 4;
		return false;
	}
	/**
	* @param {unknown} store
	* @returns {asserts store is import('../../types/cache-interceptor.d.ts').default.CacheStore}
	*/
	function assertCacheStore(store, name = "CacheStore") {
		if (typeof store !== "object" || store === null) throw new TypeError(`expected type of ${name} to be a CacheStore, got ${store === null ? "null" : typeof store}`);
		for (const fn of [
			"get",
			"createWriteStream",
			"delete"
		]) if (typeof store[fn] !== "function") throw new TypeError(`${name} needs to have a \`${fn}()\` function`);
	}
	/**
	* @param {unknown} methods
	* @returns {asserts methods is import('../../types/cache-interceptor.d.ts').default.CacheMethods[]}
	*/
	function assertCacheMethods(methods, name = "CacheMethods") {
		if (!Array.isArray(methods)) throw new TypeError(`expected type of ${name} needs to be an array, got ${methods === null ? "null" : typeof methods}`);
		if (methods.length === 0) throw new TypeError(`${name} needs to have at least one method`);
		for (const method of methods) if (!arrayIncludes(safeHTTPMethods, method)) throw new TypeError(`element of ${name}-array needs to be one of following values: ${safeHTTPMethods.join(", ")}, got ${method}`);
	}
	/**
	* Creates a string key for request deduplication purposes.
	* This key is used to identify in-flight requests that can be shared.
	* @param {import('../../types/cache-interceptor.d.ts').default.CacheKey} cacheKey
	* @param {Set<string>} [excludeHeaders] Set of lowercase header names to exclude from the key
	* @returns {string}
	*/
	function makeDeduplicationKey(cacheKey, excludeHeaders) {
		const headers = {};
		if (cacheKey.headers) {
			const sortedHeaders = Object.keys(cacheKey.headers).sort();
			for (const header of sortedHeaders) {
				if (excludeHeaders?.has(header.toLowerCase())) continue;
				headers[header] = cacheKey.headers[header];
			}
		}
		return JSON.stringify([
			cacheKey.origin,
			cacheKey.method,
			cacheKey.path,
			headers
		]);
	}
	module.exports = {
		makeCacheKey,
		normalizeHeaders,
		assertCacheKey,
		assertCacheValue,
		parseCacheControlHeader,
		hasInvalidCacheControlDirective,
		parseVaryHeader,
		hasVaryStar,
		isInvalidOrWildcardVaryHeader,
		isEtagUsable,
		assertCacheMethods,
		assertCacheStore,
		makeDeduplicationKey
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/util/date.js
var require_date = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	/**
	* @see https://www.rfc-editor.org/rfc/rfc9110.html#name-date-time-formats
	*
	* @param {string} date
	* @returns {Date | undefined}
	*/
	function parseHttpDate(date) {
		switch (date[3]) {
			case ",": return parseImfDate(date);
			case " ": return parseAscTimeDate(date);
			default: return parseRfc850Date(date);
		}
	}
	function makeDate(year, monthIdx, day, hour, minute, second, weekday) {
		const result = new Date(Date.UTC(year, monthIdx, day, hour, minute, second));
		if (year >= 0 && year <= 99) result.setUTCFullYear(year);
		return result.getUTCFullYear() === year && result.getUTCMonth() === monthIdx && result.getUTCDate() === day && result.getUTCHours() === hour && result.getUTCMinutes() === minute && result.getUTCSeconds() === second && result.getUTCDay() === weekday ? result : void 0;
	}
	/**
	* @see https://httpwg.org/specs/rfc9110.html#preferred.date.format
	*
	* @param {string} date
	* @returns {Date | undefined}
	*/
	function parseImfDate(date) {
		if (date.length !== 29 || date[4] !== " " || date[7] !== " " || date[11] !== " " || date[16] !== " " || date[19] !== ":" || date[22] !== ":" || date[25] !== " " || date[26] !== "G" || date[27] !== "M" || date[28] !== "T") return;
		let weekday = -1;
		if (date[0] === "S" && date[1] === "u" && date[2] === "n") weekday = 0;
		else if (date[0] === "M" && date[1] === "o" && date[2] === "n") weekday = 1;
		else if (date[0] === "T" && date[1] === "u" && date[2] === "e") weekday = 2;
		else if (date[0] === "W" && date[1] === "e" && date[2] === "d") weekday = 3;
		else if (date[0] === "T" && date[1] === "h" && date[2] === "u") weekday = 4;
		else if (date[0] === "F" && date[1] === "r" && date[2] === "i") weekday = 5;
		else if (date[0] === "S" && date[1] === "a" && date[2] === "t") weekday = 6;
		else return;
		let day = 0;
		if (date[5] === "0") {
			const code = date.charCodeAt(6);
			if (code < 49 || code > 57) return;
			day = code - 48;
		} else {
			const code1 = date.charCodeAt(5);
			if (code1 < 49 || code1 > 51) return;
			const code2 = date.charCodeAt(6);
			if (code2 < 48 || code2 > 57) return;
			day = (code1 - 48) * 10 + (code2 - 48);
		}
		let monthIdx = -1;
		if (date[8] === "J" && date[9] === "a" && date[10] === "n") monthIdx = 0;
		else if (date[8] === "F" && date[9] === "e" && date[10] === "b") monthIdx = 1;
		else if (date[8] === "M" && date[9] === "a") {
			if (date[10] === "r") monthIdx = 2;
			else if (date[10] === "y") monthIdx = 4;
			else return;
		} else if (date[8] === "J") {
			if (date[9] === "a" && date[10] === "n") monthIdx = 0;
			else if (date[9] === "u") {
				if (date[10] === "n") monthIdx = 5;
				else if (date[10] === "l") monthIdx = 6;
				else return;
			} else return;
		} else if (date[8] === "A") {
			if (date[9] === "p" && date[10] === "r") monthIdx = 3;
			else if (date[9] === "u" && date[10] === "g") monthIdx = 7;
			else return;
		} else if (date[8] === "S" && date[9] === "e" && date[10] === "p") monthIdx = 8;
		else if (date[8] === "O" && date[9] === "c" && date[10] === "t") monthIdx = 9;
		else if (date[8] === "N" && date[9] === "o" && date[10] === "v") monthIdx = 10;
		else if (date[8] === "D" && date[9] === "e" && date[10] === "c") monthIdx = 11;
		else return;
		const yearDigit1 = date.charCodeAt(12);
		if (yearDigit1 < 48 || yearDigit1 > 57) return;
		const yearDigit2 = date.charCodeAt(13);
		if (yearDigit2 < 48 || yearDigit2 > 57) return;
		const yearDigit3 = date.charCodeAt(14);
		if (yearDigit3 < 48 || yearDigit3 > 57) return;
		const yearDigit4 = date.charCodeAt(15);
		if (yearDigit4 < 48 || yearDigit4 > 57) return;
		const year = (yearDigit1 - 48) * 1e3 + (yearDigit2 - 48) * 100 + (yearDigit3 - 48) * 10 + (yearDigit4 - 48);
		let hour = 0;
		if (date[17] === "0") {
			const code = date.charCodeAt(18);
			if (code < 48 || code > 57) return;
			hour = code - 48;
		} else {
			const code1 = date.charCodeAt(17);
			if (code1 < 48 || code1 > 50) return;
			const code2 = date.charCodeAt(18);
			if (code2 < 48 || code2 > 57) return;
			if (code1 === 50 && code2 > 51) return;
			hour = (code1 - 48) * 10 + (code2 - 48);
		}
		let minute = 0;
		if (date[20] === "0") {
			const code = date.charCodeAt(21);
			if (code < 48 || code > 57) return;
			minute = code - 48;
		} else {
			const code1 = date.charCodeAt(20);
			if (code1 < 48 || code1 > 53) return;
			const code2 = date.charCodeAt(21);
			if (code2 < 48 || code2 > 57) return;
			minute = (code1 - 48) * 10 + (code2 - 48);
		}
		let second = 0;
		if (date[23] === "0") {
			const code = date.charCodeAt(24);
			if (code < 48 || code > 57) return;
			second = code - 48;
		} else {
			const code1 = date.charCodeAt(23);
			if (code1 < 48 || code1 > 53) return;
			const code2 = date.charCodeAt(24);
			if (code2 < 48 || code2 > 57) return;
			second = (code1 - 48) * 10 + (code2 - 48);
		}
		return makeDate(year, monthIdx, day, hour, minute, second, weekday);
	}
	/**
	* @see https://httpwg.org/specs/rfc9110.html#obsolete.date.formats
	*
	* @param {string} date
	* @returns {Date | undefined}
	*/
	function parseAscTimeDate(date) {
		if (date.length !== 24 || date[7] !== " " || date[10] !== " " || date[19] !== " ") return;
		let weekday = -1;
		if (date[0] === "S" && date[1] === "u" && date[2] === "n") weekday = 0;
		else if (date[0] === "M" && date[1] === "o" && date[2] === "n") weekday = 1;
		else if (date[0] === "T" && date[1] === "u" && date[2] === "e") weekday = 2;
		else if (date[0] === "W" && date[1] === "e" && date[2] === "d") weekday = 3;
		else if (date[0] === "T" && date[1] === "h" && date[2] === "u") weekday = 4;
		else if (date[0] === "F" && date[1] === "r" && date[2] === "i") weekday = 5;
		else if (date[0] === "S" && date[1] === "a" && date[2] === "t") weekday = 6;
		else return;
		let monthIdx = -1;
		if (date[4] === "J" && date[5] === "a" && date[6] === "n") monthIdx = 0;
		else if (date[4] === "F" && date[5] === "e" && date[6] === "b") monthIdx = 1;
		else if (date[4] === "M" && date[5] === "a") {
			if (date[6] === "r") monthIdx = 2;
			else if (date[6] === "y") monthIdx = 4;
			else return;
		} else if (date[4] === "J") {
			if (date[5] === "a" && date[6] === "n") monthIdx = 0;
			else if (date[5] === "u") {
				if (date[6] === "n") monthIdx = 5;
				else if (date[6] === "l") monthIdx = 6;
				else return;
			} else return;
		} else if (date[4] === "A") {
			if (date[5] === "p" && date[6] === "r") monthIdx = 3;
			else if (date[5] === "u" && date[6] === "g") monthIdx = 7;
			else return;
		} else if (date[4] === "S" && date[5] === "e" && date[6] === "p") monthIdx = 8;
		else if (date[4] === "O" && date[5] === "c" && date[6] === "t") monthIdx = 9;
		else if (date[4] === "N" && date[5] === "o" && date[6] === "v") monthIdx = 10;
		else if (date[4] === "D" && date[5] === "e" && date[6] === "c") monthIdx = 11;
		else return;
		let day = 0;
		if (date[8] === " ") {
			const code = date.charCodeAt(9);
			if (code < 49 || code > 57) return;
			day = code - 48;
		} else {
			const code1 = date.charCodeAt(8);
			if (code1 < 49 || code1 > 51) return;
			const code2 = date.charCodeAt(9);
			if (code2 < 48 || code2 > 57) return;
			day = (code1 - 48) * 10 + (code2 - 48);
		}
		let hour = 0;
		if (date[11] === "0") {
			const code = date.charCodeAt(12);
			if (code < 48 || code > 57) return;
			hour = code - 48;
		} else {
			const code1 = date.charCodeAt(11);
			if (code1 < 48 || code1 > 50) return;
			const code2 = date.charCodeAt(12);
			if (code2 < 48 || code2 > 57) return;
			if (code1 === 50 && code2 > 51) return;
			hour = (code1 - 48) * 10 + (code2 - 48);
		}
		let minute = 0;
		if (date[14] === "0") {
			const code = date.charCodeAt(15);
			if (code < 48 || code > 57) return;
			minute = code - 48;
		} else {
			const code1 = date.charCodeAt(14);
			if (code1 < 48 || code1 > 53) return;
			const code2 = date.charCodeAt(15);
			if (code2 < 48 || code2 > 57) return;
			minute = (code1 - 48) * 10 + (code2 - 48);
		}
		let second = 0;
		if (date[17] === "0") {
			const code = date.charCodeAt(18);
			if (code < 48 || code > 57) return;
			second = code - 48;
		} else {
			const code1 = date.charCodeAt(17);
			if (code1 < 48 || code1 > 53) return;
			const code2 = date.charCodeAt(18);
			if (code2 < 48 || code2 > 57) return;
			second = (code1 - 48) * 10 + (code2 - 48);
		}
		const yearDigit1 = date.charCodeAt(20);
		if (yearDigit1 < 48 || yearDigit1 > 57) return;
		const yearDigit2 = date.charCodeAt(21);
		if (yearDigit2 < 48 || yearDigit2 > 57) return;
		const yearDigit3 = date.charCodeAt(22);
		if (yearDigit3 < 48 || yearDigit3 > 57) return;
		const yearDigit4 = date.charCodeAt(23);
		if (yearDigit4 < 48 || yearDigit4 > 57) return;
		return makeDate((yearDigit1 - 48) * 1e3 + (yearDigit2 - 48) * 100 + (yearDigit3 - 48) * 10 + (yearDigit4 - 48), monthIdx, day, hour, minute, second, weekday);
	}
	/**
	* @see https://httpwg.org/specs/rfc9110.html#obsolete.date.formats
	*
	* @param {string} date
	* @returns {Date | undefined}
	*/
	function parseRfc850Date(date) {
		let commaIndex = -1;
		let weekday = -1;
		if (date[0] === "S") {
			if (date[1] === "u" && date[2] === "n" && date[3] === "d" && date[4] === "a" && date[5] === "y") {
				weekday = 0;
				commaIndex = 6;
			} else if (date[1] === "a" && date[2] === "t" && date[3] === "u" && date[4] === "r" && date[5] === "d" && date[6] === "a" && date[7] === "y") {
				weekday = 6;
				commaIndex = 8;
			}
		} else if (date[0] === "M" && date[1] === "o" && date[2] === "n" && date[3] === "d" && date[4] === "a" && date[5] === "y") {
			weekday = 1;
			commaIndex = 6;
		} else if (date[0] === "T") {
			if (date[1] === "u" && date[2] === "e" && date[3] === "s" && date[4] === "d" && date[5] === "a" && date[6] === "y") {
				weekday = 2;
				commaIndex = 7;
			} else if (date[1] === "h" && date[2] === "u" && date[3] === "r" && date[4] === "s" && date[5] === "d" && date[6] === "a" && date[7] === "y") {
				weekday = 4;
				commaIndex = 8;
			}
		} else if (date[0] === "W" && date[1] === "e" && date[2] === "d" && date[3] === "n" && date[4] === "e" && date[5] === "s" && date[6] === "d" && date[7] === "a" && date[8] === "y") {
			weekday = 3;
			commaIndex = 9;
		} else if (date[0] === "F" && date[1] === "r" && date[2] === "i" && date[3] === "d" && date[4] === "a" && date[5] === "y") {
			weekday = 5;
			commaIndex = 6;
		} else return;
		if (date[commaIndex] !== "," || date.length - commaIndex - 1 !== 23 || date[commaIndex + 1] !== " " || date[commaIndex + 4] !== "-" || date[commaIndex + 8] !== "-" || date[commaIndex + 11] !== " " || date[commaIndex + 14] !== ":" || date[commaIndex + 17] !== ":" || date[commaIndex + 20] !== " " || date[commaIndex + 21] !== "G" || date[commaIndex + 22] !== "M" || date[commaIndex + 23] !== "T") return;
		let day = 0;
		if (date[commaIndex + 2] === "0") {
			const code = date.charCodeAt(commaIndex + 3);
			if (code < 49 || code > 57) return;
			day = code - 48;
		} else {
			const code1 = date.charCodeAt(commaIndex + 2);
			if (code1 < 49 || code1 > 51) return;
			const code2 = date.charCodeAt(commaIndex + 3);
			if (code2 < 48 || code2 > 57) return;
			day = (code1 - 48) * 10 + (code2 - 48);
		}
		let monthIdx = -1;
		if (date[commaIndex + 5] === "J" && date[commaIndex + 6] === "a" && date[commaIndex + 7] === "n") monthIdx = 0;
		else if (date[commaIndex + 5] === "F" && date[commaIndex + 6] === "e" && date[commaIndex + 7] === "b") monthIdx = 1;
		else if (date[commaIndex + 5] === "M" && date[commaIndex + 6] === "a" && date[commaIndex + 7] === "r") monthIdx = 2;
		else if (date[commaIndex + 5] === "A" && date[commaIndex + 6] === "p" && date[commaIndex + 7] === "r") monthIdx = 3;
		else if (date[commaIndex + 5] === "M" && date[commaIndex + 6] === "a" && date[commaIndex + 7] === "y") monthIdx = 4;
		else if (date[commaIndex + 5] === "J" && date[commaIndex + 6] === "u" && date[commaIndex + 7] === "n") monthIdx = 5;
		else if (date[commaIndex + 5] === "J" && date[commaIndex + 6] === "u" && date[commaIndex + 7] === "l") monthIdx = 6;
		else if (date[commaIndex + 5] === "A" && date[commaIndex + 6] === "u" && date[commaIndex + 7] === "g") monthIdx = 7;
		else if (date[commaIndex + 5] === "S" && date[commaIndex + 6] === "e" && date[commaIndex + 7] === "p") monthIdx = 8;
		else if (date[commaIndex + 5] === "O" && date[commaIndex + 6] === "c" && date[commaIndex + 7] === "t") monthIdx = 9;
		else if (date[commaIndex + 5] === "N" && date[commaIndex + 6] === "o" && date[commaIndex + 7] === "v") monthIdx = 10;
		else if (date[commaIndex + 5] === "D" && date[commaIndex + 6] === "e" && date[commaIndex + 7] === "c") monthIdx = 11;
		else return;
		const yearDigit1 = date.charCodeAt(commaIndex + 9);
		if (yearDigit1 < 48 || yearDigit1 > 57) return;
		const yearDigit2 = date.charCodeAt(commaIndex + 10);
		if (yearDigit2 < 48 || yearDigit2 > 57) return;
		let year = (yearDigit1 - 48) * 10 + (yearDigit2 - 48);
		year += year < 70 ? 2e3 : 1900;
		let hour = 0;
		if (date[commaIndex + 12] === "0") {
			const code = date.charCodeAt(commaIndex + 13);
			if (code < 48 || code > 57) return;
			hour = code - 48;
		} else {
			const code1 = date.charCodeAt(commaIndex + 12);
			if (code1 < 48 || code1 > 50) return;
			const code2 = date.charCodeAt(commaIndex + 13);
			if (code2 < 48 || code2 > 57) return;
			if (code1 === 50 && code2 > 51) return;
			hour = (code1 - 48) * 10 + (code2 - 48);
		}
		let minute = 0;
		if (date[commaIndex + 15] === "0") {
			const code = date.charCodeAt(commaIndex + 16);
			if (code < 48 || code > 57) return;
			minute = code - 48;
		} else {
			const code1 = date.charCodeAt(commaIndex + 15);
			if (code1 < 48 || code1 > 53) return;
			const code2 = date.charCodeAt(commaIndex + 16);
			if (code2 < 48 || code2 > 57) return;
			minute = (code1 - 48) * 10 + (code2 - 48);
		}
		let second = 0;
		if (date[commaIndex + 18] === "0") {
			const code = date.charCodeAt(commaIndex + 19);
			if (code < 48 || code > 57) return;
			second = code - 48;
		} else {
			const code1 = date.charCodeAt(commaIndex + 18);
			if (code1 < 48 || code1 > 53) return;
			const code2 = date.charCodeAt(commaIndex + 19);
			if (code2 < 48 || code2 > 57) return;
			second = (code1 - 48) * 10 + (code2 - 48);
		}
		return makeDate(year, monthIdx, day, hour, minute, second, weekday);
	}
	module.exports = { parseHttpDate };
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/handler/cache-handler.js
var require_cache_handler = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const util = require_util$5();
	const { parseCacheControlHeader, hasInvalidCacheControlDirective, parseVaryHeader, hasVaryStar, isInvalidOrWildcardVaryHeader, isEtagUsable } = require_cache$2();
	const { parseHttpDate } = require_date();
	function noop() {}
	const HEURISTICALLY_CACHEABLE_STATUS_CODES = [
		200,
		203,
		204,
		206,
		300,
		301,
		308,
		404,
		405,
		410,
		414,
		501
	];
	const NOT_UNDERSTOOD_STATUS_CODES = [206];
	const MAX_RESPONSE_AGE = 2147483647e3;
	const REVALIDATION_ONLY_RETENTION = 864e5;
	function trimOWS(value) {
		return value.replace(/^[\t ]+|[\t ]+$/g, "");
	}
	function arrayIncludes(array, value) {
		for (let i = 0; i < array.length; i++) if (array[i] === value) return true;
		return false;
	}
	function appendConnectionHeaderTokens(headersToRemove, connectionHeader) {
		const values = Array.isArray(connectionHeader) ? connectionHeader : [connectionHeader];
		for (let i = 0; i < values.length; i++) {
			const tokens = values[i].split(",");
			for (let j = 0; j < tokens.length; j++) headersToRemove.push(trimOWS(tokens[j]).toLowerCase());
		}
	}
	function getSameOriginPath(cacheKey, location) {
		if (typeof location !== "string") return;
		let originUrl;
		let requestUrl;
		let locationUrl;
		try {
			originUrl = new URL(cacheKey.origin);
			requestUrl = new URL(cacheKey.path, originUrl);
			locationUrl = new URL(location, requestUrl);
		} catch {
			return;
		}
		if (locationUrl.origin !== originUrl.origin) return;
		return locationUrl.pathname + locationUrl.search;
	}
	function deleteCachedUri(store, cacheKey, path) {
		deleteCachedValue(store, {
			...cacheKey,
			path
		});
		for (let i = 0; i < util.safeHTTPMethods.length; i++) {
			const method = util.safeHTTPMethods[i];
			if (method !== cacheKey.method) deleteCachedValue(store, {
				...cacheKey,
				method,
				path
			});
		}
	}
	function deleteLocationTargets(store, cacheKey, headerValue) {
		if (headerValue === void 0) return;
		const values = Array.isArray(headerValue) ? headerValue : [headerValue];
		for (let i = 0; i < values.length; i++) {
			const path = getSameOriginPath(cacheKey, values[i]);
			if (path !== void 0) deleteCachedUri(store, cacheKey, path);
		}
	}
	function invalidateUnsafeRequest(store, cacheKey, resHeaders) {
		deleteCachedUri(store, cacheKey, cacheKey.path);
		deleteLocationTargets(store, cacheKey, resHeaders.location);
		deleteLocationTargets(store, cacheKey, resHeaders["content-location"]);
	}
	/**
	* @typedef {import('../../types/dispatcher.d.ts').default.DispatchHandler} DispatchHandler
	*
	* @implements {DispatchHandler}
	*/
	var CacheHandler = class {
		/**
		* @type {import('../../types/cache-interceptor.d.ts').default.CacheKey}
		*/
		#cacheKey;
		/**
		* @type {import('../../types/cache-interceptor.d.ts').default.CacheHandlerOptions['type']}
		*/
		#cacheType;
		/**
		* @type {number | undefined}
		*/
		#cacheByDefault;
		/**
		* @type {import('../../types/cache-interceptor.d.ts').default.CacheStore}
		*/
		#store;
		/**
		* @type {import('../../types/dispatcher.d.ts').default.DispatchHandler}
		*/
		#handler;
		/**
		* @type {import('node:stream').Writable | undefined}
		*/
		#writeStream;
		/**
		* @param {import('../../types/cache-interceptor.d.ts').default.CacheHandlerOptions} opts
		* @param {import('../../types/cache-interceptor.d.ts').default.CacheKey} cacheKey
		* @param {import('../../types/dispatcher.d.ts').default.DispatchHandler} handler
		*/
		constructor({ store, type, cacheByDefault }, cacheKey, handler) {
			this.#store = store;
			this.#cacheType = type;
			this.#cacheByDefault = cacheByDefault;
			this.#cacheKey = cacheKey;
			this.#handler = handler;
		}
		onRequestStart(controller, context) {
			this.#writeStream?.destroy();
			this.#writeStream = void 0;
			this.#handler.onRequestStart?.(controller, context);
		}
		onRequestUpgrade(controller, statusCode, headers, socket) {
			this.#handler.onRequestUpgrade?.(controller, statusCode, headers, socket);
		}
		/**
		* @param {import('../../types/dispatcher.d.ts').default.DispatchController} controller
		* @param {number} statusCode
		* @param {import('../../types/header.d.ts').IncomingHttpHeaders} resHeaders
		* @param {string} statusMessage
		*/
		onResponseStart(controller, statusCode, resHeaders, statusMessage) {
			const downstreamOnHeaders = () => this.#handler.onResponseStart?.(controller, statusCode, resHeaders, statusMessage);
			const handler = this;
			if (!arrayIncludes(util.safeHTTPMethods, this.#cacheKey.method) && statusCode >= 200 && statusCode <= 399) {
				invalidateUnsafeRequest(this.#store, this.#cacheKey, resHeaders);
				return downstreamOnHeaders();
			}
			const cacheControlHeader = resHeaders["cache-control"];
			const heuristicallyCacheable = resHeaders["last-modified"] && arrayIncludes(HEURISTICALLY_CACHEABLE_STATUS_CODES, statusCode);
			if (!cacheControlHeader && !resHeaders["expires"] && !heuristicallyCacheable && !this.#cacheByDefault) {
				if (statusCode === 304 && resHeaders.vary && isInvalidOrWildcardVaryHeader(resHeaders.vary)) deleteCachedValue(this.#store, this.#cacheKey);
				return downstreamOnHeaders();
			}
			const cacheControlDirectives = cacheControlHeader ? parseCacheControlHeader(cacheControlHeader) : {};
			if (!canCacheResponse(this.#cacheType, statusCode, resHeaders, cacheControlDirectives, this.#cacheKey.headers)) {
				if (statusCode === 304 && (cacheControlHeader || revalidationResponseDisallowsCachedReuse(this.#cacheType, resHeaders, cacheControlDirectives))) deleteCachedValue(this.#store, this.#cacheKey);
				return downstreamOnHeaders();
			}
			const now = Date.now();
			const resAge = Object.hasOwn(resHeaders, "age") ? getAge(resHeaders.age) : void 0;
			if (resAge !== void 0 && resAge >= MAX_RESPONSE_AGE) {
				deleteCachedValueIfNotModified(statusCode, this.#store, this.#cacheKey);
				return downstreamOnHeaders();
			}
			const resDate = Object.hasOwn(resHeaders, "date") ? getDate(resHeaders.date) : void 0;
			if (resDate === null) {
				deleteCachedValueIfNotModified(statusCode, this.#store, this.#cacheKey);
				return downstreamOnHeaders();
			}
			const apparentAge = resDate ? Math.max(0, now - resDate.getTime()) : 0;
			const currentAge = Math.max(apparentAge, resAge ?? 0);
			const hasValidator = typeof resHeaders.etag === "string" && isEtagUsable(resHeaders.etag) || typeof resHeaders["last-modified"] === "string";
			const staleAt = determineStaleAt(this.#cacheType, now, resAge, resHeaders, resDate, cacheControlDirectives, hasValidator) ?? this.#cacheByDefault;
			const revalidationOnly = staleAt === 0 && hasValidator;
			if (staleAt === void 0 || currentAge >= staleAt && !revalidationOnly) {
				if (cacheControlHeader || staleAt !== void 0) deleteCachedValueIfNotModified(statusCode, this.#store, this.#cacheKey);
				return downstreamOnHeaders();
			}
			const baseTime = now - currentAge;
			const absoluteStaleAt = staleAt + baseTime;
			if (now >= absoluteStaleAt && !revalidationOnly) {
				deleteCachedValueIfNotModified(statusCode, this.#store, this.#cacheKey);
				return downstreamOnHeaders();
			}
			let varyDirectives;
			if (this.#cacheKey.headers && resHeaders.vary) {
				varyDirectives = parseVaryHeader(resHeaders.vary, this.#cacheKey.headers);
				if (!varyDirectives) return downstreamOnHeaders();
			}
			const cachedAt = baseTime;
			const deleteAt = determineDeleteAt(baseTime, now, cacheControlDirectives, absoluteStaleAt);
			const strippedHeaders = stripNecessaryHeaders(resHeaders, cacheControlDirectives);
			/**
			* @type {import('../../types/cache-interceptor.d.ts').default.CacheValue}
			*/
			const value = {
				statusCode,
				statusMessage,
				headers: strippedHeaders,
				vary: varyDirectives,
				cacheControlDirectives,
				cachedAt,
				staleAt: absoluteStaleAt,
				deleteAt
			};
			if (statusCode === 304) {
				const handle304 = (cachedValue) => {
					if (!cachedValue) return downstreamOnHeaders();
					value.statusCode = cachedValue.statusCode;
					value.statusMessage = cachedValue.statusMessage;
					value.etag = cachedValue.etag;
					value.vary = varyDirectives ?? cachedValue.vary;
					value.headers = {
						...cachedValue.headers,
						...strippedHeaders
					};
					downstreamOnHeaders();
					this.#writeStream = this.#store.createWriteStream(this.#cacheKey, value);
					if (!this.#writeStream || !cachedValue?.body) return;
					if (typeof cachedValue.body.values === "function") {
						const bodyIterator = cachedValue.body.values();
						const streamCachedBody = () => {
							for (const chunk of bodyIterator) {
								const full = this.#writeStream.write(chunk) === false;
								this.#handler.onResponseData?.(controller, chunk);
								if (full) break;
							}
						};
						this.#writeStream.on("error", function() {
							handler.#writeStream = void 0;
							handler.#store.delete(handler.#cacheKey);
						}).on("drain", () => {
							streamCachedBody();
						}).on("close", function() {
							if (handler.#writeStream === this) handler.#writeStream = void 0;
						});
						streamCachedBody();
					} else if (typeof cachedValue.body.on === "function") {
						cachedValue.body.on("data", (chunk) => {
							this.#writeStream.write(chunk);
							this.#handler.onResponseData?.(controller, chunk);
						}).on("end", () => {
							this.#writeStream.end();
						}).on("error", () => {
							this.#writeStream = void 0;
							this.#store.delete(this.#cacheKey);
						});
						this.#writeStream.on("error", function() {
							handler.#writeStream = void 0;
							handler.#store.delete(handler.#cacheKey);
						}).on("close", function() {
							if (handler.#writeStream === this) handler.#writeStream = void 0;
						});
					}
				};
				/**
				* @type {import('../../types/cache-interceptor.d.ts').default.CacheValue}
				*/
				const result = this.#store.get(this.#cacheKey);
				if (result && typeof result.then === "function") result.then(handle304);
				else handle304(result);
			} else {
				if (typeof resHeaders.etag === "string" && isEtagUsable(resHeaders.etag)) value.etag = resHeaders.etag;
				this.#writeStream = this.#store.createWriteStream(this.#cacheKey, value);
				if (!this.#writeStream) return downstreamOnHeaders();
				this.#writeStream.on("drain", () => controller.resume()).on("error", function() {
					handler.#writeStream = void 0;
					handler.#store.delete(handler.#cacheKey);
				}).on("close", function() {
					if (handler.#writeStream === this) handler.#writeStream = void 0;
					controller.resume();
				});
				downstreamOnHeaders();
			}
		}
		onResponseData(controller, chunk) {
			if (this.#writeStream?.write(chunk) === false) controller.pause();
			this.#handler.onResponseData?.(controller, chunk);
		}
		onResponseEnd(controller, trailers) {
			this.#writeStream?.end();
			this.#handler.onResponseEnd?.(controller, trailers);
		}
		onResponseError(controller, err) {
			this.#writeStream?.destroy(err);
			this.#writeStream = void 0;
			this.#handler.onResponseError?.(controller, err);
		}
	};
	/**
	* @param {import('../../types/cache-interceptor.d.ts').default.CacheStore} store
	* @param {import('../../types/cache-interceptor.d.ts').default.CacheKey} cacheKey
	*/
	function deleteCachedValue(store, cacheKey) {
		try {
			store.delete(cacheKey)?.catch?.(noop);
		} catch {}
	}
	function deleteCachedValueIfNotModified(statusCode, store, cacheKey) {
		if (statusCode === 304) deleteCachedValue(store, cacheKey);
	}
	/**
	* @param {import('../../types/cache-interceptor.d.ts').default.CacheOptions['type']} cacheType
	* @param {import('../../types/header.d.ts').IncomingHttpHeaders} resHeaders
	* @param {import('../../types/cache-interceptor.d.ts').default.CacheControlDirectives} cacheControlDirectives
	* @returns {boolean}
	*/
	function revalidationResponseDisallowsCachedReuse(cacheType, resHeaders, cacheControlDirectives) {
		return cacheControlDirectives["no-store"] === true || cacheType === "shared" && cacheControlDirectives.private === true || (resHeaders.vary ? isInvalidOrWildcardVaryHeader(resHeaders.vary) : false);
	}
	/**
	* @see https://www.rfc-editor.org/rfc/rfc9111.html#name-storing-responses-to-authen
	*
	* @param {import('../../types/cache-interceptor.d.ts').default.CacheOptions['type']} cacheType
	* @param {number} statusCode
	* @param {import('../../types/header.d.ts').IncomingHttpHeaders} resHeaders
	* @param {import('../../types/cache-interceptor.d.ts').default.CacheControlDirectives} cacheControlDirectives
	* @param {import('../../types/header.d.ts').IncomingHttpHeaders} [reqHeaders]
	*/
	function canCacheResponse(cacheType, statusCode, resHeaders, cacheControlDirectives, reqHeaders) {
		if (statusCode < 200 || arrayIncludes(NOT_UNDERSTOOD_STATUS_CODES, statusCode)) return false;
		if (!arrayIncludes(HEURISTICALLY_CACHEABLE_STATUS_CODES, statusCode) && !resHeaders["expires"] && !cacheControlDirectives.public && cacheControlDirectives["max-age"] === void 0 && !(cacheControlDirectives.private && cacheType === "private") && !(cacheControlDirectives["s-maxage"] !== void 0 && cacheType === "shared")) return false;
		if (cacheControlDirectives["no-store"]) return false;
		if (cacheType === "shared" && cacheControlDirectives.private === true) return false;
		if (resHeaders.vary && hasVaryStar(resHeaders.vary)) return false;
		if (reqHeaders != null && Object.hasOwn(reqHeaders, "authorization")) {
			if (!cacheControlDirectives.public && !cacheControlDirectives["s-maxage"] && !cacheControlDirectives["must-revalidate"]) return false;
			if (typeof reqHeaders.authorization !== "string") return false;
			if (Array.isArray(cacheControlDirectives["no-cache"]) && arrayIncludes(cacheControlDirectives["no-cache"], "authorization")) return false;
			if (Array.isArray(cacheControlDirectives["private"]) && arrayIncludes(cacheControlDirectives["private"], "authorization")) return false;
		}
		return true;
	}
	/**
	* @param {string | string[]} dateHeader
	* @returns {Date | null | undefined}
	*/
	function getDate(dateHeader) {
		let dateValue = dateHeader;
		if (Array.isArray(dateValue)) {
			if (dateValue.length !== 1) return null;
			dateValue = dateValue[0];
		}
		if (typeof dateValue !== "string") return null;
		return parseHttpDate(dateValue);
	}
	/**
	* @param {string | string[]} ageHeader
	* @returns {number | undefined}
	*/
	function getAge(ageHeader) {
		let ageValue = ageHeader;
		if (Array.isArray(ageValue)) {
			if (ageValue.length !== 1) return MAX_RESPONSE_AGE;
			ageValue = ageValue[0];
		}
		if (typeof ageValue !== "string" || !/^[\t ]*[0-9]+[\t ]*$/.test(ageValue)) return MAX_RESPONSE_AGE;
		const age = BigInt(ageValue.replace(/^[\t ]+|[\t ]+$/g, ""));
		if (age >= BigInt(MAX_RESPONSE_AGE / 1e3)) return MAX_RESPONSE_AGE;
		return Number(age) * 1e3;
	}
	/**
	* @param {import('../../types/cache-interceptor.d.ts').default.CacheOptions['type']} cacheType
	* @param {number} now
	* @param {number | undefined} age
	* @param {import('../../types/header.d.ts').IncomingHttpHeaders} resHeaders
	* @param {Date | undefined} responseDate
	* @param {import('../../types/cache-interceptor.d.ts').default.CacheControlDirectives} cacheControlDirectives
	* @param {boolean} hasValidator whether the response has a validator (etag or
	*  last-modified) that revalidation requests can be made with
	*
	* @returns {number | undefined} time that the value is stale at in seconds or undefined if it shouldn't be cached
	*/
	function determineStaleAt(cacheType, now, age, resHeaders, responseDate, cacheControlDirectives, hasValidator) {
		if (cacheType === "shared") {
			if (hasInvalidCacheControlDirective(cacheControlDirectives, "s-maxage")) return 0;
			const sMaxAge = cacheControlDirectives["s-maxage"];
			if (sMaxAge !== void 0) {
				if (sMaxAge > 0) return sMaxAge * 1e3;
				return 0;
			}
		}
		if (hasInvalidCacheControlDirective(cacheControlDirectives, "max-age")) return 0;
		const maxAge = cacheControlDirectives["max-age"];
		if (maxAge !== void 0) {
			if (maxAge > 0) return maxAge * 1e3;
			return 0;
		}
		if (Object.hasOwn(resHeaders, "expires")) {
			if (typeof resHeaders.expires !== "string") return 0;
			const expiresDate = parseHttpDate(resHeaders.expires);
			if (!expiresDate) return 0;
			if (now >= expiresDate.getTime()) return 0;
			if (responseDate) {
				if (responseDate >= expiresDate) return 0;
				const freshnessLifetime = expiresDate.getTime() - responseDate.getTime();
				if (age !== void 0 && age >= freshnessLifetime) return 0;
				return freshnessLifetime;
			}
			return expiresDate.getTime() - now;
		}
		if (typeof resHeaders["last-modified"] === "string") {
			const lastModified = parseHttpDate(resHeaders["last-modified"]);
			if (lastModified) {
				if (lastModified.getTime() >= now) return;
				return (now - lastModified.getTime()) * .1;
			}
		}
		if (cacheControlDirectives.immutable) return 31536e6;
		if (cacheControlDirectives["no-cache"] === true && hasValidator) return 0;
	}
	/**
	* @param {number} baseTime
	* @param {number} cachedAt
	* @param {import('../../types/cache-interceptor.d.ts').default.CacheControlDirectives} cacheControlDirectives
	* @param {number} staleAt
	*/
	function determineDeleteAt(baseTime, cachedAt, cacheControlDirectives, staleAt) {
		let staleWhileRevalidate = -Infinity;
		let staleIfError = -Infinity;
		let immutable = -Infinity;
		if (cacheControlDirectives["stale-while-revalidate"]) staleWhileRevalidate = staleAt + cacheControlDirectives["stale-while-revalidate"] * 1e3;
		if (cacheControlDirectives["stale-if-error"]) staleIfError = staleAt + cacheControlDirectives["stale-if-error"] * 1e3;
		if (cacheControlDirectives.immutable && staleWhileRevalidate === -Infinity && staleIfError === -Infinity) immutable = cachedAt + 31536e6;
		if (staleWhileRevalidate === -Infinity && staleIfError === -Infinity && immutable === -Infinity) {
			const freshnessLifetime = staleAt - baseTime;
			if (freshnessLifetime <= 0) return cachedAt + REVALIDATION_ONLY_RETENTION;
			const datePrecisionPadding = Math.min(Math.max(cachedAt - baseTime, 0), 1e3);
			return staleAt + freshnessLifetime + datePrecisionPadding;
		}
		return Math.max(staleAt, staleWhileRevalidate, staleIfError, immutable);
	}
	/**
	* Strips headers required to be removed in cached responses
	* @param {import('../../types/header.d.ts').IncomingHttpHeaders} resHeaders
	* @param {import('../../types/cache-interceptor.d.ts').default.CacheControlDirectives} cacheControlDirectives
	* @returns {Record<string, string | string []>}
	*/
	function stripNecessaryHeaders(resHeaders, cacheControlDirectives) {
		const headersToRemove = [
			"connection",
			"proxy-authenticate",
			"proxy-authentication-info",
			"proxy-authorization",
			"proxy-connection",
			"te",
			"transfer-encoding",
			"upgrade",
			"age"
		];
		if (resHeaders["connection"]) appendConnectionHeaderTokens(headersToRemove, resHeaders["connection"]);
		if (Array.isArray(cacheControlDirectives["no-cache"])) headersToRemove.push(...cacheControlDirectives["no-cache"]);
		if (Array.isArray(cacheControlDirectives["private"])) headersToRemove.push(...cacheControlDirectives["private"]);
		let strippedHeaders;
		for (const headerName of headersToRemove) if (Object.hasOwn(resHeaders, headerName)) {
			strippedHeaders ??= { ...resHeaders };
			delete strippedHeaders[headerName];
		}
		return strippedHeaders ?? resHeaders;
	}
	module.exports = CacheHandler;
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/cache/memory-cache-store.js
var require_memory_cache_store = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { Writable: Writable$2 } = __require("node:stream");
	const { EventEmitter } = __require("node:events");
	const { assertCacheKey, assertCacheValue } = require_cache$2();
	/**
	* @typedef {import('../../types/cache-interceptor.d.ts').default.CacheKey} CacheKey
	* @typedef {import('../../types/cache-interceptor.d.ts').default.CacheValue} CacheValue
	* @typedef {import('../../types/cache-interceptor.d.ts').default.CacheStore} CacheStore
	* @typedef {import('../../types/cache-interceptor.d.ts').default.GetResult} GetResult
	*/
	/**
	* @implements {CacheStore}
	* @extends {EventEmitter}
	*/
	var MemoryCacheStore = class extends EventEmitter {
		#maxCount = 1024;
		#maxSize = 104857600;
		#maxEntrySize = 5242880;
		#size = 0;
		#count = 0;
		#entries = /* @__PURE__ */ new Map();
		#hasEmittedMaxSizeEvent = false;
		/**
		* @param {import('../../types/cache-interceptor.d.ts').default.MemoryCacheStoreOpts | undefined} [opts]
		*/
		constructor(opts) {
			super();
			if (opts) {
				if (typeof opts !== "object") throw new TypeError("MemoryCacheStore options must be an object");
				if (opts.maxCount !== void 0) {
					if (typeof opts.maxCount !== "number" || !Number.isInteger(opts.maxCount) || opts.maxCount < 0) throw new TypeError("MemoryCacheStore options.maxCount must be a non-negative integer");
					this.#maxCount = opts.maxCount;
				}
				if (opts.maxSize !== void 0) {
					if (typeof opts.maxSize !== "number" || !Number.isInteger(opts.maxSize) || opts.maxSize < 0) throw new TypeError("MemoryCacheStore options.maxSize must be a non-negative integer");
					this.#maxSize = opts.maxSize;
				}
				if (opts.maxEntrySize !== void 0) {
					if (typeof opts.maxEntrySize !== "number" || !Number.isInteger(opts.maxEntrySize) || opts.maxEntrySize < 0) throw new TypeError("MemoryCacheStore options.maxEntrySize must be a non-negative integer");
					this.#maxEntrySize = opts.maxEntrySize;
				}
			}
		}
		/**
		* Get the current size of the cache in bytes
		* @returns {number} The current size of the cache in bytes
		*/
		get size() {
			return this.#size;
		}
		/**
		* Check if the cache is full (either max size or max count reached)
		* @returns {boolean} True if the cache is full, false otherwise
		*/
		isFull() {
			return this.#size >= this.#maxSize || this.#count >= this.#maxCount;
		}
		/**
		* @param {import('../../types/cache-interceptor.d.ts').default.CacheKey} req
		* @returns {import('../../types/cache-interceptor.d.ts').default.GetResult | undefined}
		*/
		get(key) {
			assertCacheKey(key);
			const topLevelKey = `${key.origin}:${key.path}`;
			const now = Date.now();
			const entries = this.#entries.get(topLevelKey);
			const entry = entries ? findEntry(key, entries, now) : null;
			return entry == null ? void 0 : {
				statusMessage: entry.statusMessage,
				statusCode: entry.statusCode,
				headers: entry.headers,
				body: entry.body,
				vary: entry.vary ? entry.vary : void 0,
				etag: entry.etag,
				cacheControlDirectives: entry.cacheControlDirectives,
				cachedAt: entry.cachedAt,
				staleAt: entry.staleAt,
				deleteAt: entry.deleteAt
			};
		}
		/**
		* @param {import('../../types/cache-interceptor.d.ts').default.CacheKey} key
		* @param {import('../../types/cache-interceptor.d.ts').default.CacheValue} val
		* @returns {Writable | undefined}
		*/
		createWriteStream(key, val) {
			assertCacheKey(key);
			assertCacheValue(val);
			const topLevelKey = `${key.origin}:${key.path}`;
			const store = this;
			const entry = {
				...key,
				...val,
				body: [],
				size: 0
			};
			return new Writable$2({
				write(chunk, encoding, callback) {
					if (typeof chunk === "string") chunk = Buffer.from(chunk, encoding);
					entry.size += chunk.byteLength;
					if (entry.size > store.#maxEntrySize) this.destroy();
					else entry.body.push(chunk);
					callback(null);
				},
				final(callback) {
					let entries = store.#entries.get(topLevelKey);
					if (!entries) {
						entries = [];
						store.#entries.set(topLevelKey, entries);
					}
					const previousEntry = findEntry(key, entries, Date.now());
					if (previousEntry) {
						const index = entries.indexOf(previousEntry);
						entries.splice(index, 1, entry);
						store.#size -= previousEntry.size;
					} else {
						entries.push(entry);
						store.#count += 1;
					}
					store.#size += entry.size;
					if (store.#size > store.#maxSize || store.#count > store.#maxCount) {
						if (!store.#hasEmittedMaxSizeEvent) {
							store.emit("maxSizeExceeded", {
								size: store.#size,
								maxSize: store.#maxSize,
								count: store.#count,
								maxCount: store.#maxCount
							});
							store.#hasEmittedMaxSizeEvent = true;
						}
						for (const [key, entries] of store.#entries) {
							for (const entry of entries.splice(0, entries.length / 2)) {
								store.#size -= entry.size;
								store.#count -= 1;
							}
							if (entries.length === 0) store.#entries.delete(key);
						}
						if (store.#size < store.#maxSize && store.#count < store.#maxCount) store.#hasEmittedMaxSizeEvent = false;
					}
					callback(null);
				}
			});
		}
		/**
		* @param {CacheKey} key
		*/
		delete(key) {
			if (typeof key !== "object") throw new TypeError(`expected key to be object, got ${typeof key}`);
			const topLevelKey = `${key.origin}:${key.path}`;
			for (const entry of this.#entries.get(topLevelKey) ?? []) {
				this.#size -= entry.size;
				this.#count -= 1;
			}
			this.#entries.delete(topLevelKey);
		}
	};
	function findEntry(key, entries, now) {
		for (let i = 0; i < entries.length; i++) {
			const entry = entries[i];
			if (entry.deleteAt > now && entry.method === key.method && varyMatches(key, entry)) return entry;
		}
	}
	function varyMatches(key, entry) {
		if (entry.vary == null) return true;
		for (const headerName in entry.vary) if (Object.hasOwn(entry.vary, headerName) && !headerValueEquals(key.headers?.[headerName], entry.vary[headerName])) return false;
		return true;
	}
	/**
	* @param {string|string[]|null|undefined} lhs
	* @param {string|string[]|null|undefined} rhs
	* @returns {boolean}
	*/
	function headerValueEquals(lhs, rhs) {
		if (lhs == null && rhs == null) return true;
		if (lhs == null && rhs != null || lhs != null && rhs == null) return false;
		if (Array.isArray(lhs) && Array.isArray(rhs)) {
			if (lhs.length !== rhs.length) return false;
			for (let i = 0; i < lhs.length; i++) if (lhs[i] !== rhs[i]) return false;
			return true;
		}
		return lhs === rhs;
	}
	module.exports = MemoryCacheStore;
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/handler/cache-revalidation-handler.js
var require_cache_revalidation_handler = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const assert$11 = __require("node:assert");
	/**
	* This takes care of revalidation requests we send to the origin. If we get
	*  a response indicating that what we have is cached (via a HTTP 304), we can
	*  continue using the cached value. Otherwise, we'll receive the new response
	*  here, which we then just pass on to the next handler (most likely a
	*  CacheHandler). Note that this assumes the proper headers were already
	*  included in the request to tell the origin that we want to revalidate the
	*  response (i.e. if-modified-since or if-none-match).
	*
	* @see https://www.rfc-editor.org/rfc/rfc9111.html#name-validation
	*
	* @implements {import('../../types/dispatcher.d.ts').default.DispatchHandler}
	*/
	var CacheRevalidationHandler = class {
		#successful = false;
		/**
		* @type {((success: boolean, context?: any, statusCode?: number, headers?: import('../../types/header.d.ts').IncomingHttpHeaders) => void) | null}
		*/
		#callback;
		/**
		* @type {(import('../../types/dispatcher.d.ts').default.DispatchHandler)}
		*/
		#handler;
		#context;
		/**
		* @type {boolean}
		*/
		#allowErrorStatusCodes;
		/**
		* @param {(success: boolean, context?: any, statusCode?: number, headers?: import('../../types/header.d.ts').IncomingHttpHeaders) => void} callback Function to call if the cached value is valid
		* @param {import('../../types/dispatcher.d.ts').default.DispatchHandlers} handler
		* @param {boolean} allowErrorStatusCodes
		*/
		constructor(callback, handler, allowErrorStatusCodes) {
			if (typeof callback !== "function") throw new TypeError("callback must be a function");
			this.#callback = callback;
			this.#handler = handler;
			this.#allowErrorStatusCodes = allowErrorStatusCodes;
		}
		onRequestStart(_, context) {
			this.#successful = false;
			this.#context = context;
		}
		onRequestUpgrade(controller, statusCode, headers, socket) {
			this.#handler.onRequestUpgrade?.(controller, statusCode, headers, socket);
		}
		onResponseStart(controller, statusCode, headers, statusMessage) {
			assert$11(this.#callback != null);
			this.#successful = statusCode === 304 || this.#allowErrorStatusCodes && statusCode >= 500 && statusCode <= 504;
			this.#callback(this.#successful, this.#context, statusCode, headers);
			this.#callback = null;
			if (this.#successful) return true;
			this.#handler.onRequestStart?.(controller, this.#context);
			this.#handler.onResponseStart?.(controller, statusCode, headers, statusMessage);
		}
		onResponseData(controller, chunk) {
			if (this.#successful) return;
			return this.#handler.onResponseData?.(controller, chunk);
		}
		onResponseEnd(controller, trailers) {
			if (this.#successful) return;
			this.#handler.onResponseEnd?.(controller, trailers);
		}
		onResponseError(controller, err) {
			if (this.#successful) return;
			if (this.#callback) {
				if (this.#allowErrorStatusCodes) {
					this.#successful = true;
					this.#callback(true, this.#context);
					this.#callback = null;
					return;
				}
				this.#callback(false);
				this.#callback = null;
			}
			if (typeof this.#handler.onResponseError === "function") this.#handler.onResponseError(controller, err);
			else throw err;
		}
	};
	module.exports = CacheRevalidationHandler;
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/interceptor/cache.js
var require_cache$1 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const assert$10 = __require("node:assert");
	const { Readable: Readable$1 } = __require("node:stream");
	const util = require_util$5();
	const CacheHandler = require_cache_handler();
	const MemoryCacheStore = require_memory_cache_store();
	const CacheRevalidationHandler = require_cache_revalidation_handler();
	const { assertCacheStore, assertCacheMethods, makeCacheKey, normalizeHeaders, parseCacheControlHeader, isInvalidOrWildcardVaryHeader } = require_cache$2();
	const { AbortError } = require_errors();
	const { parseHttpDate } = require_date();
	/**
	* @param {(string | RegExp)[] | undefined} origins
	* @param {string} name
	*/
	function assertCacheOrigins(origins, name) {
		if (origins === void 0) return;
		if (!Array.isArray(origins)) throw new TypeError(`expected ${name} to be an array or undefined, got ${typeof origins}`);
		for (let i = 0; i < origins.length; i++) {
			const origin = origins[i];
			if (typeof origin !== "string" && !(origin instanceof RegExp)) throw new TypeError(`expected ${name}[${i}] to be a string or RegExp, got ${typeof origin}`);
		}
	}
	const nop = () => {};
	function trimOWS(value) {
		return value.replace(/^[\t ]+|[\t ]+$/g, "");
	}
	function arrayIncludes(array, value) {
		for (let i = 0; i < array.length; i++) if (array[i] === value) return true;
		return false;
	}
	function hasPragmaNoCache(headers) {
		const pragma = headers?.pragma;
		if (!pragma) return false;
		const values = Array.isArray(pragma) ? pragma : [pragma];
		for (let i = 0; i < values.length; i++) {
			const value = values[i];
			if (typeof value !== "string") continue;
			const directives = value.split(",");
			for (let j = 0; j < directives.length; j++) if (trimOWS(directives[j]).toLowerCase() === "no-cache") return true;
		}
		return false;
	}
	/**
	* @typedef {(options: import('../../types/dispatcher.d.ts').default.DispatchOptions, handler: import('../../types/dispatcher.d.ts').default.DispatchHandler) => void} DispatchFn
	*/
	/**
	* @param {import('../../types/cache-interceptor.d.ts').default.GetResult} result
	* @param {import('../../types/cache-interceptor.d.ts').default.CacheControlDirectives | undefined} cacheControlDirectives
	* @param {import('../../types/dispatcher.d.ts').default.RequestOptions} opts
	* @returns {boolean}
	*/
	function needsRevalidation(result, cacheControlDirectives, { headers = {} }) {
		if (cacheControlDirectives?.["no-cache"]) return true;
		if (result.cacheControlDirectives?.["no-cache"] && !Array.isArray(result.cacheControlDirectives["no-cache"])) return true;
		if (headers["if-modified-since"] || headers["if-none-match"]) return true;
		return false;
	}
	/**
	* @param {import('../../types/cache-interceptor.d.ts').default.GetResult} result
	* @param {import('../../types/cache-interceptor.d.ts').default.CacheOptions['type']} cacheType
	* @returns {boolean}
	*/
	function staleResponseRequiresRevalidation(result, cacheType) {
		return result.cacheControlDirectives?.["must-revalidate"] === true || cacheType === "shared" && (result.cacheControlDirectives?.["proxy-revalidate"] === true || result.cacheControlDirectives?.["s-maxage"] !== void 0);
	}
	/**
	* @param {import('../../types/cache-interceptor.d.ts').default.CacheOptions['type']} cacheType
	* @param {import('../../types/header.d.ts').IncomingHttpHeaders} headers
	* @returns {boolean}
	*/
	function revalidationResponseDisallowsCachedReuse(cacheType, headers) {
		if (headers.vary && isInvalidOrWildcardVaryHeader(headers.vary)) return true;
		const cacheControl = headers["cache-control"];
		if (!cacheControl) return false;
		const cacheControlDirectives = parseCacheControlHeader(cacheControl);
		return cacheControlDirectives["no-store"] === true || cacheType === "shared" && cacheControlDirectives.private === true;
	}
	function revalidationResponseUpdatesCacheControl(headers) {
		return headers["cache-control"] !== void 0;
	}
	function deleteCachedValue(store, cacheKey) {
		try {
			store.delete(cacheKey)?.catch?.(nop);
		} catch {}
	}
	function getUsableLastModified(headers) {
		const lastModified = headers?.["last-modified"];
		if (typeof lastModified === "string" && parseHttpDate(lastModified)) return lastModified;
	}
	function makeRevalidationHeaders(opts, result) {
		const headers = {
			...opts.headers,
			"if-modified-since": getUsableLastModified(result.headers) ?? new Date(result.cachedAt).toUTCString()
		};
		if (result.etag) headers["if-none-match"] = result.etag;
		if (result.vary) {
			for (const key in result.vary) if (result.vary[key] != null) headers[key] = result.vary[key];
		}
		return headers;
	}
	/**
	* @param {import('../../types/cache-interceptor.d.ts').default.GetResult} result
	* @param {import('../../types/cache-interceptor.d.ts').default.CacheControlDirectives | undefined} cacheControlDirectives
	* @param {import('../../types/cache-interceptor.d.ts').default.CacheOptions['type']} cacheType
	* @returns {boolean}
	*/
	function isStale(result, cacheControlDirectives, cacheType) {
		const now = Date.now();
		if (now > result.staleAt) {
			if (!staleResponseRequiresRevalidation(result, cacheType) && cacheControlDirectives?.["max-stale"]) return now > result.staleAt + cacheControlDirectives["max-stale"] * 1e3;
			return true;
		}
		if (cacheControlDirectives?.["min-fresh"]) return result.staleAt - now <= cacheControlDirectives["min-fresh"] * 1e3;
		return false;
	}
	/**
	* Check if we're within the stale-while-revalidate window for a stale response
	* @param {import('../../types/cache-interceptor.d.ts').default.GetResult} result
	* @param {import('../../types/cache-interceptor.d.ts').default.CacheOptions['type']} cacheType
	* @returns {boolean}
	*/
	function withinStaleWhileRevalidateWindow(result, cacheType) {
		const staleWhileRevalidate = result.cacheControlDirectives?.["stale-while-revalidate"];
		if (!staleWhileRevalidate || staleResponseRequiresRevalidation(result, cacheType)) return false;
		return Date.now() <= result.staleAt + staleWhileRevalidate * 1e3;
	}
	/**
	* @param {DispatchFn} dispatch
	* @param {import('../../types/cache-interceptor.d.ts').default.CacheHandlerOptions} globalOpts
	* @param {import('../../types/cache-interceptor.d.ts').default.CacheKey} cacheKey
	* @param {import('../../types/dispatcher.d.ts').default.DispatchHandler} handler
	* @param {import('../../types/dispatcher.d.ts').default.RequestOptions} opts
	* @param {import('../../types/cache-interceptor.d.ts').default.CacheControlDirectives | undefined} reqCacheControl
	*/
	function handleUncachedResponse(dispatch, globalOpts, cacheKey, handler, opts, reqCacheControl) {
		if (reqCacheControl?.["only-if-cached"]) {
			let aborted = false;
			const controller = {
				paused: false,
				rawHeaders: [],
				rawTrailers: [],
				pause() {
					this.paused = true;
				},
				resume() {
					this.paused = false;
				},
				abort: (reason) => {
					aborted = true;
					handler.onResponseError?.(controller, reason ?? new AbortError());
				}
			};
			try {
				handler.onRequestStart?.(controller, null);
				if (aborted) return;
				handler.onResponseStart?.(controller, 504, {}, "Gateway Timeout");
				if (aborted) return;
				handler.onResponseEnd?.(controller, {});
			} catch (err) {
				if (typeof handler.onResponseError === "function") handler.onResponseError(controller, err);
			}
			return true;
		}
		return dispatch(opts, new CacheHandler(globalOpts, cacheKey, handler));
	}
	/**
	* @param {import('../../types/dispatcher.d.ts').default.DispatchHandler} handler
	* @param {import('../../types/dispatcher.d.ts').default.RequestOptions} opts
	* @param {import('../../types/cache-interceptor.d.ts').default.GetResult} result
	* @param {number} age
	* @param {any} context
	* @param {boolean} isStale
	*/
	function sendCachedValue(handler, opts, result, age, context, isStale) {
		const stream = util.isStream(result.body) ? result.body : Readable$1.from(result.body ?? []);
		assert$10(!stream.destroyed, "stream should not be destroyed");
		assert$10(!stream.readableDidRead, "stream should not be readableDidRead");
		const controller = {
			rawHeaders: [],
			rawTrailers: [],
			resume() {
				stream.resume();
			},
			pause() {
				stream.pause();
			},
			get paused() {
				return stream.isPaused();
			},
			get aborted() {
				return stream.destroyed;
			},
			get reason() {
				return stream.errored;
			},
			abort(reason) {
				stream.destroy(reason ?? new AbortError());
			}
		};
		stream.on("error", function(err) {
			if (!this.readableEnded) {
				if (typeof handler.onResponseError === "function") handler.onResponseError(controller, err);
				else throw err;
			}
		}).on("close", function() {
			if (!this.errored) handler.onResponseEnd?.(controller, {});
		});
		handler.onRequestStart?.(controller, context);
		if (stream.destroyed) return;
		const headers = {
			...result.headers,
			age: String(age)
		};
		if (isStale) headers.warning = "110 - \"response is stale\"";
		controller.rawHeaders = util.toRawHeaders(headers);
		handler.onResponseStart?.(controller, result.statusCode, headers, result.statusMessage);
		if (opts.method === "HEAD") stream.destroy();
		else stream.on("data", function(chunk) {
			handler.onResponseData?.(controller, chunk);
		});
	}
	/**
	* @param {DispatchFn} dispatch
	* @param {import('../../types/cache-interceptor.d.ts').default.CacheHandlerOptions} globalOpts
	* @param {import('../../types/cache-interceptor.d.ts').default.CacheKey} cacheKey
	* @param {import('../../types/dispatcher.d.ts').default.DispatchHandler} handler
	* @param {import('../../types/dispatcher.d.ts').default.RequestOptions} opts
	* @param {import('../../types/cache-interceptor.d.ts').default.CacheControlDirectives | undefined} reqCacheControl
	* @param {import('../../types/cache-interceptor.d.ts').default.GetResult | undefined} result
	*/
	function handleResult(dispatch, globalOpts, cacheKey, handler, opts, reqCacheControl, result) {
		if (!result) return handleUncachedResponse(dispatch, globalOpts, cacheKey, handler, opts, reqCacheControl);
		const now = Date.now();
		if (now > result.deleteAt) return dispatch(opts, new CacheHandler(globalOpts, cacheKey, handler));
		const age = Math.round((now - result.cachedAt) / 1e3);
		const requestMaxAgeExpired = reqCacheControl?.["max-age"] !== void 0 && age >= reqCacheControl["max-age"];
		const stale = requestMaxAgeExpired || isStale(result, reqCacheControl, globalOpts.type);
		const revalidate = requestMaxAgeExpired || needsRevalidation(result, reqCacheControl, opts);
		if (stale || revalidate) {
			if (util.isStream(opts.body) && util.bodyLength(opts.body) !== 0) return dispatch(opts, new CacheHandler(globalOpts, cacheKey, handler));
			if (!revalidate && withinStaleWhileRevalidateWindow(result, globalOpts.type)) {
				sendCachedValue(handler, opts, result, age, null, true);
				queueMicrotask(() => {
					const headers = makeRevalidationHeaders(opts, result);
					dispatch({
						...opts,
						headers
					}, new CacheHandler(globalOpts, cacheKey, {
						onRequestStart() {},
						onRequestUpgrade() {},
						onResponseStart() {},
						onResponseData() {},
						onResponseEnd() {},
						onResponseError() {}
					}));
				});
				return true;
			}
			let withinStaleIfErrorThreshold = false;
			if (!staleResponseRequiresRevalidation(result, globalOpts.type)) {
				const staleIfErrorExpiry = result.cacheControlDirectives["stale-if-error"] ?? reqCacheControl?.["stale-if-error"];
				if (staleIfErrorExpiry) withinStaleIfErrorThreshold = now < result.staleAt + staleIfErrorExpiry * 1e3;
			}
			const headers = makeRevalidationHeaders(opts, result);
			return dispatch({
				...opts,
				headers
			}, new CacheRevalidationHandler((success, context, statusCode, headers) => {
				if (success) {
					if (statusCode === 304) {
						if (revalidationResponseDisallowsCachedReuse(globalOpts.type, headers)) {
							if (util.isStream(result.body)) result.body.on("error", nop).destroy();
							deleteCachedValue(globalOpts.store, cacheKey);
							return dispatch(opts, new CacheHandler(globalOpts, cacheKey, handler));
						}
						if (revalidationResponseUpdatesCacheControl(headers)) deleteCachedValue(globalOpts.store, cacheKey);
					}
					sendCachedValue(handler, opts, result, age, context, stale);
				} else if (util.isStream(result.body)) result.body.on("error", nop).destroy();
			}, new CacheHandler(globalOpts, cacheKey, handler), withinStaleIfErrorThreshold));
		}
		if (util.isStream(opts.body)) opts.body.on("error", nop).destroy();
		sendCachedValue(handler, opts, result, age, null, false);
	}
	/**
	* @param {import('../../types/cache-interceptor.d.ts').default.CacheOptions} [opts]
	* @returns {import('../../types/dispatcher.d.ts').default.DispatcherComposeInterceptor}
	*/
	module.exports = (opts = {}) => {
		const { store = new MemoryCacheStore(), methods = ["GET"], cacheByDefault = void 0, type = "shared", origins = void 0 } = opts;
		if (typeof opts !== "object" || opts === null) throw new TypeError(`expected type of opts to be an Object, got ${opts === null ? "null" : typeof opts}`);
		assertCacheStore(store, "opts.store");
		assertCacheMethods(methods, "opts.methods");
		assertCacheOrigins(origins, "opts.origins");
		if (typeof cacheByDefault !== "undefined" && typeof cacheByDefault !== "number") throw new TypeError(`expected opts.cacheByDefault to be number or undefined, got ${typeof cacheByDefault}`);
		if (typeof type !== "undefined" && type !== "shared" && type !== "private") throw new TypeError(`expected opts.type to be shared, private, or undefined, got ${typeof type}`);
		const globalOpts = {
			store,
			methods,
			cacheByDefault,
			type
		};
		const safeMethodsToNotCache = [];
		for (let i = 0; i < util.safeHTTPMethods.length; i++) {
			const method = util.safeHTTPMethods[i];
			if (!arrayIncludes(methods, method)) safeMethodsToNotCache.push(method);
		}
		return (dispatch) => {
			return (opts, handler) => {
				if (!opts.origin || arrayIncludes(safeMethodsToNotCache, opts.method)) return dispatch(opts, handler);
				if (origins !== void 0) {
					const requestOrigin = opts.origin.toString().toLowerCase();
					let isAllowed = false;
					for (let i = 0; i < origins.length; i++) {
						const allowed = origins[i];
						if (typeof allowed === "string") {
							if (allowed.toLowerCase() === requestOrigin) {
								isAllowed = true;
								break;
							}
						} else if (allowed.test(requestOrigin)) {
							isAllowed = true;
							break;
						}
					}
					if (!isAllowed) return dispatch(opts, handler);
				}
				opts = {
					...opts,
					headers: normalizeHeaders(opts)
				};
				const reqCacheControl = opts.headers?.["cache-control"] ? parseCacheControlHeader(opts.headers["cache-control"]) : hasPragmaNoCache(opts.headers) ? { "no-cache": true } : void 0;
				if (reqCacheControl?.["no-store"]) return dispatch(opts, handler);
				/**
				* @type {import('../../types/cache-interceptor.d.ts').default.CacheKey}
				*/
				const cacheKey = makeCacheKey(opts);
				const result = store.get(cacheKey);
				if (result && typeof result.then === "function") return result.then((result) => handleResult(dispatch, globalOpts, cacheKey, handler, opts, reqCacheControl, result));
				else return handleResult(dispatch, globalOpts, cacheKey, handler, opts, reqCacheControl, result);
			};
		};
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/interceptor/decompress.js
var require_decompress = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { createInflate, createGunzip, createBrotliDecompress, createZstdDecompress } = __require("node:zlib");
	const { pipeline: pipeline$2 } = __require("node:stream");
	const DecoratorHandler = require_decorator_handler();
	/** @typedef {import('node:stream').Transform} Transform */
	/** @typedef {import('node:stream').Transform} Controller */
	/** @typedef {Transform&import('node:zlib').Zlib} DecompressorStream */
	/** @type {Record<string, () => DecompressorStream>} */
	const supportedEncodings = {
		gzip: createGunzip,
		"x-gzip": createGunzip,
		br: createBrotliDecompress,
		deflate: createInflate,
		compress: createInflate,
		"x-compress": createInflate,
		zstd: createZstdDecompress
	};
	const defaultSkipStatusCodes = [204, 304];
	let warningEmitted = false;
	/**
	* @typedef {Object} DecompressHandlerOptions
	* @property {number[]|Readonly<number[]>} [skipStatusCodes=[204, 304]] - List of status codes to skip decompression for
	* @property {boolean} [skipErrorResponses] - Whether to skip decompression for error responses (status codes >= 400)
	*/
	var DecompressHandler = class extends DecoratorHandler {
		/** @type {Transform[]} */
		#decompressors = [];
		/** @type {Record<string, string | string[]> | undefined} */
		#trailers;
		/** @type {Readonly<number[]>} */
		#skipStatusCodes;
		/** @type {boolean} */
		#skipErrorResponses;
		constructor(handler, { skipStatusCodes = defaultSkipStatusCodes, skipErrorResponses = true } = {}) {
			super(handler);
			this.#skipStatusCodes = skipStatusCodes;
			this.#skipErrorResponses = skipErrorResponses;
		}
		/**
		* Determines if decompression should be skipped based on encoding and status code
		* @param {string} contentEncoding - Content-Encoding header value
		* @param {number} statusCode - HTTP status code of the response
		* @returns {boolean} - True if decompression should be skipped
		*/
		#shouldSkipDecompression(contentEncoding, statusCode) {
			if (!contentEncoding || statusCode < 200) return true;
			if (this.#skipStatusCodes.includes(statusCode)) return true;
			if (this.#skipErrorResponses && statusCode >= 400) return true;
			return false;
		}
		/**
		* Creates a chain of decompressors for multiple content encodings
		*
		* @param {string} encodings - Comma-separated list of content encodings
		* @returns {Array<DecompressorStream>} - Array of decompressor streams
		* @throws {Error} - If the number of content-encodings exceeds the maximum allowed
		*/
		#createDecompressionChain(encodings) {
			const parts = encodings.split(",");
			const maxContentEncodings = 5;
			if (parts.length > maxContentEncodings) throw new Error(`too many content-encodings in response: ${parts.length}, maximum allowed is ${maxContentEncodings}`);
			/** @type {DecompressorStream[]} */
			const decompressors = [];
			for (let i = parts.length - 1; i >= 0; i--) {
				const encoding = parts[i].trim();
				if (!encoding) continue;
				if (!supportedEncodings[encoding]) {
					decompressors.length = 0;
					return decompressors;
				}
				decompressors.push(supportedEncodings[encoding]());
			}
			return decompressors;
		}
		/**
		* Sets up event handlers for a decompressor stream using readable events
		* @param {DecompressorStream} decompressor - The decompressor stream
		* @param {Controller} controller - The controller to coordinate with
		* @returns {void}
		*/
		#setupDecompressorEvents(decompressor, controller) {
			decompressor.on("readable", () => {
				let chunk;
				while ((chunk = decompressor.read()) !== null) if (super.onResponseData(controller, chunk) === false) break;
			});
			decompressor.on("error", (error) => {
				super.onResponseError(controller, error);
			});
		}
		/**
		* Sets up event handling for a single decompressor
		* @param {Controller} controller - The controller to handle events
		* @returns {void}
		*/
		#setupSingleDecompressor(controller) {
			const decompressor = this.#decompressors[0];
			this.#setupDecompressorEvents(decompressor, controller);
			decompressor.on("end", () => {
				super.onResponseEnd(controller, this.#trailers);
			});
		}
		/**
		* Sets up event handling for multiple chained decompressors using pipeline
		* @param {Controller} controller - The controller to handle events
		* @returns {void}
		*/
		#setupMultipleDecompressors(controller) {
			const lastDecompressor = this.#decompressors[this.#decompressors.length - 1];
			this.#setupDecompressorEvents(lastDecompressor, controller);
			pipeline$2(this.#decompressors, (err) => {
				if (err) {
					super.onResponseError(controller, err);
					return;
				}
				super.onResponseEnd(controller, this.#trailers);
			});
		}
		/**
		* Cleans up decompressor references to prevent memory leaks
		* @returns {void}
		*/
		#cleanupDecompressors() {
			this.#decompressors.length = 0;
		}
		/**
		* @param {Controller} controller
		* @param {number} statusCode
		* @param {Record<string, string | string[] | undefined>} headers
		* @param {string} statusMessage
		* @returns {void}
		*/
		onResponseStart(controller, statusCode, headers, statusMessage) {
			const contentEncoding = headers["content-encoding"];
			if (this.#shouldSkipDecompression(contentEncoding, statusCode)) return super.onResponseStart(controller, statusCode, headers, statusMessage);
			const decompressors = this.#createDecompressionChain(contentEncoding.toLowerCase());
			if (decompressors.length === 0) {
				this.#cleanupDecompressors();
				return super.onResponseStart(controller, statusCode, headers, statusMessage);
			}
			this.#decompressors = decompressors;
			const { "content-encoding": _, "content-length": __, ...newHeaders } = headers;
			if (controller?.rawHeaders) {
				const rawHeaders = controller.rawHeaders;
				if (Array.isArray(rawHeaders)) {
					const filteredHeaders = [];
					for (let i = 0; i < rawHeaders.length; i += 2) {
						const headerName = rawHeaders[i];
						const lowerName = (Buffer.isBuffer(headerName) ? headerName.toString("latin1") : `${headerName}`).toLowerCase();
						if (lowerName === "content-encoding" || lowerName === "content-length") continue;
						filteredHeaders.push(rawHeaders[i], rawHeaders[i + 1]);
					}
					controller.rawHeaders = filteredHeaders;
				} else if (typeof rawHeaders === "object") for (const name of Object.keys(rawHeaders)) {
					const lowerName = name.toLowerCase();
					if (lowerName === "content-encoding" || lowerName === "content-length") delete rawHeaders[name];
				}
			}
			if (this.#decompressors.length === 1) this.#setupSingleDecompressor(controller);
			else this.#setupMultipleDecompressors(controller);
			return super.onResponseStart(controller, statusCode, newHeaders, statusMessage);
		}
		/**
		* @param {Controller} controller
		* @param {Buffer} chunk
		* @returns {void}
		*/
		onResponseData(controller, chunk) {
			if (this.#decompressors.length > 0) {
				this.#decompressors[0].write(chunk);
				return;
			}
			super.onResponseData(controller, chunk);
		}
		/**
		* @param {Controller} controller
		* @param {Record<string, string | string[]> | undefined} trailers
		* @returns {void}
		*/
		onResponseEnd(controller, trailers) {
			if (this.#decompressors.length > 0) {
				this.#trailers = trailers;
				this.#decompressors[0].end();
				this.#cleanupDecompressors();
				return;
			}
			super.onResponseEnd(controller, trailers);
		}
		/**
		* @param {Controller} controller
		* @param {Error} err
		* @returns {void}
		*/
		onResponseError(controller, err) {
			if (this.#decompressors.length > 0) {
				for (const decompressor of this.#decompressors) decompressor.destroy(err);
				this.#cleanupDecompressors();
			}
			super.onResponseError(controller, err);
		}
	};
	/**
	* Creates a decompression interceptor for HTTP responses
	* @param {DecompressHandlerOptions} [options] - Options for the interceptor
	* @returns {Function} - Interceptor function
	*/
	function createDecompressInterceptor(options = {}) {
		if (!warningEmitted) {
			process.emitWarning("DecompressInterceptor is experimental and subject to change", "ExperimentalWarning");
			warningEmitted = true;
		}
		return (dispatch) => {
			return (opts, handler) => {
				if (opts.method === "HEAD") return dispatch(opts, handler);
				return dispatch(opts, new DecompressHandler(handler, options));
			};
		};
	}
	module.exports = createDecompressInterceptor;
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/handler/deduplication-handler.js
var require_deduplication_handler = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { RequestAbortedError } = require_errors();
	/**
	* @typedef {import('../../types/dispatcher.d.ts').default.DispatchHandler} DispatchHandler
	*/
	const DEFAULT_MAX_BUFFER_SIZE = 5242880;
	/**
	* @typedef {Object} WaitingHandler
	* @property {DispatchHandler} handler
	* @property {import('../../types/dispatcher.d.ts').default.DispatchController} controller
	* @property {Buffer[]} bufferedChunks
	* @property {number} bufferedBytes
	* @property {object | null} pendingTrailers
	* @property {boolean} done
	*/
	/**
	* Handler that forwards response events to multiple waiting handlers.
	* Used for request deduplication.
	*
	* @implements {DispatchHandler}
	*/
	var DeduplicationHandler = class {
		/**
		* @type {DispatchHandler}
		*/
		#primaryHandler;
		/**
		* @type {WaitingHandler[]}
		*/
		#waitingHandlers = [];
		/**
		* @type {number}
		*/
		#maxBufferSize = DEFAULT_MAX_BUFFER_SIZE;
		/**
		* @type {number}
		*/
		#statusCode = 0;
		/**
		* @type {Record<string, string | string[]>}
		*/
		#headers = {};
		/**
		* @type {string}
		*/
		#statusMessage = "";
		/**
		* @type {boolean}
		*/
		#aborted = false;
		/**
		* @type {boolean}
		*/
		#responseStarted = false;
		/**
		* @type {boolean}
		*/
		#responseDataStarted = false;
		/**
		* @type {boolean}
		*/
		#completed = false;
		/**
		* @type {import('../../types/dispatcher.d.ts').default.DispatchController | null}
		*/
		#controller = null;
		/**
		* @type {(() => void) | null}
		*/
		#onComplete = null;
		/**
		* @param {DispatchHandler} primaryHandler The primary handler
		* @param {() => void} onComplete Callback when request completes
		* @param {number} [maxBufferSize] Maximum paused buffer size per waiting handler
		*/
		constructor(primaryHandler, onComplete, maxBufferSize = DEFAULT_MAX_BUFFER_SIZE) {
			this.#primaryHandler = primaryHandler;
			this.#onComplete = onComplete;
			this.#maxBufferSize = maxBufferSize;
		}
		/**
		* Add a waiting handler that will receive response events.
		* Returns false if deduplication can no longer safely attach this handler.
		*
		* @param {DispatchHandler} handler
		* @returns {boolean}
		*/
		addWaitingHandler(handler) {
			if (this.#completed || this.#responseDataStarted) return false;
			const waitingHandler = this.#createWaitingHandler(handler);
			const waitingController = waitingHandler.controller;
			try {
				handler.onRequestStart?.(waitingController, null);
				if (waitingController.aborted) {
					waitingHandler.done = true;
					return true;
				}
				if (this.#responseStarted) handler.onResponseStart?.(waitingController, this.#statusCode, this.#headers, this.#statusMessage);
			} catch {
				waitingHandler.done = true;
				return true;
			}
			if (!waitingController.aborted) this.#waitingHandlers.push(waitingHandler);
			return true;
		}
		/**
		* @param {import('../../types/dispatcher.d.ts').default.DispatchController} controller
		* @param {any} context
		*/
		onRequestStart(controller, context) {
			this.#controller = controller;
			this.#primaryHandler.onRequestStart?.(controller, context);
		}
		/**
		* @param {import('../../types/dispatcher.d.ts').default.DispatchController} controller
		* @param {number} statusCode
		* @param {import('../../types/header.d.ts').IncomingHttpHeaders} headers
		* @param {Socket} socket
		*/
		onRequestUpgrade(controller, statusCode, headers, socket) {
			this.#primaryHandler.onRequestUpgrade?.(controller, statusCode, headers, socket);
		}
		/**
		* @param {import('../../types/dispatcher.d.ts').default.DispatchController} controller
		* @param {number} statusCode
		* @param {Record<string, string | string[]>} headers
		* @param {string} statusMessage
		*/
		onResponseStart(controller, statusCode, headers, statusMessage) {
			this.#responseStarted = true;
			this.#statusCode = statusCode;
			this.#headers = headers;
			this.#statusMessage = statusMessage;
			this.#primaryHandler.onResponseStart?.(controller, statusCode, headers, statusMessage);
			for (const waitingHandler of this.#waitingHandlers) {
				const { handler, controller: waitingController } = waitingHandler;
				if (waitingHandler.done || waitingController.aborted) {
					waitingHandler.done = true;
					continue;
				}
				try {
					handler.onResponseStart?.(waitingController, statusCode, headers, statusMessage);
				} catch {}
				if (waitingController.aborted) waitingHandler.done = true;
			}
			this.#pruneDoneWaitingHandlers();
		}
		/**
		* @param {import('../../types/dispatcher.d.ts').default.DispatchController} controller
		* @param {Buffer} chunk
		*/
		onResponseData(controller, chunk) {
			if (this.#aborted || this.#completed) return;
			this.#responseDataStarted = true;
			this.#primaryHandler.onResponseData?.(controller, chunk);
			for (const waitingHandler of this.#waitingHandlers) {
				const { handler, controller: waitingController } = waitingHandler;
				if (waitingHandler.done || waitingController.aborted) {
					waitingHandler.done = true;
					continue;
				}
				if (waitingController.paused) {
					this.#bufferWaitingChunk(waitingHandler, chunk);
					continue;
				}
				try {
					handler.onResponseData?.(waitingController, chunk);
				} catch {}
				if (waitingController.aborted) {
					waitingHandler.done = true;
					waitingHandler.bufferedChunks = [];
					waitingHandler.bufferedBytes = 0;
				}
			}
			this.#pruneDoneWaitingHandlers();
		}
		/**
		* @param {import('../../types/dispatcher.d.ts').default.DispatchController} controller
		* @param {object} trailers
		*/
		onResponseEnd(controller, trailers) {
			if (this.#aborted || this.#completed) return;
			this.#completed = true;
			this.#primaryHandler.onResponseEnd?.(controller, trailers);
			for (const waitingHandler of this.#waitingHandlers) {
				if (waitingHandler.done || waitingHandler.controller.aborted) {
					waitingHandler.done = true;
					continue;
				}
				this.#flushWaitingHandler(waitingHandler);
				if (waitingHandler.done || waitingHandler.controller.aborted) {
					waitingHandler.done = true;
					continue;
				}
				if (waitingHandler.controller.paused && waitingHandler.bufferedChunks.length > 0) {
					waitingHandler.pendingTrailers = trailers;
					continue;
				}
				try {
					waitingHandler.handler.onResponseEnd?.(waitingHandler.controller, trailers);
				} catch {}
				waitingHandler.done = true;
			}
			this.#pruneDoneWaitingHandlers();
			this.#onComplete?.();
		}
		/**
		* @param {import('../../types/dispatcher.d.ts').default.DispatchController} controller
		* @param {Error} err
		*/
		onResponseError(controller, err) {
			if (this.#completed) return;
			this.#aborted = true;
			this.#completed = true;
			this.#primaryHandler.onResponseError?.(controller, err);
			for (const waitingHandler of this.#waitingHandlers) this.#errorWaitingHandler(waitingHandler, err);
			this.#waitingHandlers = [];
			this.#onComplete?.();
		}
		/**
		* @param {DispatchHandler} handler
		* @returns {WaitingHandler}
		*/
		#createWaitingHandler(handler) {
			/** @type {WaitingHandler} */
			const waitingHandler = {
				handler,
				controller: null,
				bufferedChunks: [],
				bufferedBytes: 0,
				pendingTrailers: null,
				done: false
			};
			const state = {
				aborted: false,
				paused: false,
				reason: null
			};
			waitingHandler.controller = {
				resume: () => {
					if (state.aborted) return;
					state.paused = false;
					this.#flushWaitingHandler(waitingHandler);
					if (this.#completed && waitingHandler.pendingTrailers && waitingHandler.bufferedChunks.length === 0 && !state.paused && !state.aborted) {
						try {
							waitingHandler.handler.onResponseEnd?.(waitingHandler.controller, waitingHandler.pendingTrailers);
						} catch {}
						waitingHandler.pendingTrailers = null;
						waitingHandler.done = true;
					}
					this.#pruneDoneWaitingHandlers();
				},
				pause: () => {
					if (!state.aborted) state.paused = true;
				},
				get paused() {
					return state.paused;
				},
				get aborted() {
					return state.aborted;
				},
				get reason() {
					return state.reason;
				},
				abort: (reason) => {
					state.aborted = true;
					state.reason = reason ?? null;
					waitingHandler.done = true;
					waitingHandler.pendingTrailers = null;
					waitingHandler.bufferedChunks = [];
					waitingHandler.bufferedBytes = 0;
				}
			};
			return waitingHandler;
		}
		/**
		* @param {WaitingHandler} waitingHandler
		* @param {Buffer} chunk
		*/
		#bufferWaitingChunk(waitingHandler, chunk) {
			if (waitingHandler.done || waitingHandler.controller.aborted) {
				waitingHandler.done = true;
				waitingHandler.bufferedChunks = [];
				waitingHandler.bufferedBytes = 0;
				return;
			}
			const bufferedChunk = Buffer.from(chunk);
			waitingHandler.bufferedChunks.push(bufferedChunk);
			waitingHandler.bufferedBytes += bufferedChunk.length;
			if (waitingHandler.bufferedBytes > this.#maxBufferSize) {
				const err = new RequestAbortedError(`Deduplicated waiting handler exceeded maxBufferSize (${this.#maxBufferSize} bytes) while paused`);
				this.#errorWaitingHandler(waitingHandler, err);
			}
		}
		/**
		* @param {WaitingHandler} waitingHandler
		*/
		#flushWaitingHandler(waitingHandler) {
			const { handler, controller } = waitingHandler;
			while (!waitingHandler.done && !controller.aborted && !controller.paused && waitingHandler.bufferedChunks.length > 0) {
				const bufferedChunk = waitingHandler.bufferedChunks.shift();
				waitingHandler.bufferedBytes -= bufferedChunk.length;
				try {
					handler.onResponseData?.(controller, bufferedChunk);
				} catch {}
				if (controller.aborted) {
					waitingHandler.done = true;
					waitingHandler.pendingTrailers = null;
					waitingHandler.bufferedChunks = [];
					waitingHandler.bufferedBytes = 0;
					break;
				}
			}
		}
		/**
		* @param {WaitingHandler} waitingHandler
		* @param {Error} err
		*/
		#errorWaitingHandler(waitingHandler, err) {
			if (waitingHandler.done) return;
			waitingHandler.done = true;
			waitingHandler.pendingTrailers = null;
			waitingHandler.bufferedChunks = [];
			waitingHandler.bufferedBytes = 0;
			try {
				waitingHandler.controller.abort(err);
				waitingHandler.handler.onResponseError?.(waitingHandler.controller, err);
			} catch {}
		}
		#pruneDoneWaitingHandlers() {
			this.#waitingHandlers = this.#waitingHandlers.filter((waitingHandler) => waitingHandler.done === false);
		}
	};
	module.exports = DeduplicationHandler;
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/interceptor/deduplicate.js
var require_deduplicate = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const diagnosticsChannel = __require("node:diagnostics_channel");
	const util = require_util$5();
	const DeduplicationHandler = require_deduplication_handler();
	const { normalizeHeaders, makeCacheKey, makeDeduplicationKey } = require_cache$2();
	const pendingRequestsChannel = diagnosticsChannel.channel("undici:request:pending-requests");
	/**
	* @param {import('../../types/interceptors.d.ts').default.DeduplicateInterceptorOpts} [opts]
	* @returns {import('../../types/dispatcher.d.ts').default.DispatcherComposeInterceptor}
	*/
	module.exports = (opts = {}) => {
		const { methods = ["GET"], skipHeaderNames = [], excludeHeaderNames = [], maxBufferSize = 5242880 } = opts;
		if (typeof opts !== "object" || opts === null) throw new TypeError(`expected type of opts to be an Object, got ${opts === null ? "null" : typeof opts}`);
		if (!Array.isArray(methods)) throw new TypeError(`expected opts.methods to be an array, got ${typeof methods}`);
		for (const method of methods) if (!util.safeHTTPMethods.includes(method)) throw new TypeError(`expected opts.methods to only contain safe HTTP methods, got ${method}`);
		if (!Array.isArray(skipHeaderNames)) throw new TypeError(`expected opts.skipHeaderNames to be an array, got ${typeof skipHeaderNames}`);
		if (!Array.isArray(excludeHeaderNames)) throw new TypeError(`expected opts.excludeHeaderNames to be an array, got ${typeof excludeHeaderNames}`);
		if (!Number.isFinite(maxBufferSize) || maxBufferSize <= 0) throw new TypeError(`expected opts.maxBufferSize to be a positive finite number, got ${maxBufferSize}`);
		const skipHeaderNamesSet = new Set(skipHeaderNames.map((name) => name.toLowerCase()));
		const excludeHeaderNamesSet = new Set(excludeHeaderNames.map((name) => name.toLowerCase()));
		/**
		* Map of pending requests for deduplication
		* @type {Map<string, DeduplicationHandler>}
		*/
		const pendingRequests = /* @__PURE__ */ new Map();
		return (dispatch) => {
			return (opts, handler) => {
				if (!opts.origin || methods.includes(opts.method) === false) return dispatch(opts, handler);
				opts = {
					...opts,
					headers: normalizeHeaders(opts)
				};
				if (skipHeaderNamesSet.size > 0) {
					for (const headerName of Object.keys(opts.headers)) if (skipHeaderNamesSet.has(headerName.toLowerCase())) return dispatch(opts, handler);
				}
				const cacheKey = makeCacheKey(opts);
				const dedupeKey = makeDeduplicationKey(cacheKey, excludeHeaderNamesSet);
				const pendingHandler = pendingRequests.get(dedupeKey);
				if (pendingHandler) {
					if (pendingHandler.addWaitingHandler(handler)) return true;
					return dispatch(opts, handler);
				}
				const deduplicationHandler = new DeduplicationHandler(handler, () => {
					pendingRequests.delete(dedupeKey);
					if (pendingRequestsChannel.hasSubscribers) pendingRequestsChannel.publish({
						size: pendingRequests.size,
						key: dedupeKey,
						type: "removed"
					});
				}, maxBufferSize);
				pendingRequests.set(dedupeKey, deduplicationHandler);
				if (pendingRequestsChannel.hasSubscribers) pendingRequestsChannel.publish({
					size: pendingRequests.size,
					key: dedupeKey,
					type: "added"
				});
				return dispatch(opts, deduplicationHandler);
			};
		};
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/cache/sqlite-cache-store.js
var require_sqlite_cache_store = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { Writable: Writable$1 } = __require("node:stream");
	const { assertCacheKey, assertCacheValue } = require_cache$2();
	let DatabaseSync;
	const VERSION = 3;
	const MAX_ENTRY_SIZE = 2e9;
	/**
	* @typedef {import('../../types/cache-interceptor.d.ts').default.CacheStore} CacheStore
	* @implements {CacheStore}
	*
	* @typedef {{
	*  id: Readonly<number>,
	*  body?: Uint8Array
	*  statusCode: number
	*  statusMessage: string
	*  headers?: string
	*  vary?: string
	*  etag?: string
	*  cacheControlDirectives?: string
	*  cachedAt: number
	*  staleAt: number
	*  deleteAt: number
	* }} SqliteStoreValue
	*/
	module.exports = class SqliteCacheStore {
		#maxEntrySize = MAX_ENTRY_SIZE;
		#maxCount = Infinity;
		/**
		* @type {import('node:sqlite').DatabaseSync}
		*/
		#db;
		/**
		* @type {import('node:sqlite').StatementSync}
		*/
		#getValuesQuery;
		/**
		* @type {import('node:sqlite').StatementSync}
		*/
		#updateValueQuery;
		/**
		* @type {import('node:sqlite').StatementSync}
		*/
		#insertValueQuery;
		/**
		* @type {import('node:sqlite').StatementSync}
		*/
		#deleteExpiredValuesQuery;
		/**
		* @type {import('node:sqlite').StatementSync}
		*/
		#deleteByUrlQuery;
		/**
		* @type {import('node:sqlite').StatementSync}
		*/
		#countEntriesQuery;
		/**
		* @type {import('node:sqlite').StatementSync | null}
		*/
		#deleteOldValuesQuery;
		/**
		* @param {import('../../types/cache-interceptor.d.ts').default.SqliteCacheStoreOpts | undefined} opts
		*/
		constructor(opts) {
			if (opts) {
				if (typeof opts !== "object") throw new TypeError("SqliteCacheStore options must be an object");
				if (opts.maxEntrySize !== void 0) {
					if (typeof opts.maxEntrySize !== "number" || !Number.isInteger(opts.maxEntrySize) || opts.maxEntrySize < 0) throw new TypeError("SqliteCacheStore options.maxEntrySize must be a non-negative integer");
					if (opts.maxEntrySize > MAX_ENTRY_SIZE) throw new TypeError("SqliteCacheStore options.maxEntrySize must be less than 2gb");
					this.#maxEntrySize = opts.maxEntrySize;
				}
				if (opts.maxCount !== void 0) {
					if (typeof opts.maxCount !== "number" || !Number.isInteger(opts.maxCount) || opts.maxCount < 0) throw new TypeError("SqliteCacheStore options.maxCount must be a non-negative integer");
					this.#maxCount = opts.maxCount;
				}
			}
			if (!DatabaseSync) DatabaseSync = __require("node:sqlite").DatabaseSync;
			this.#db = new DatabaseSync(opts?.location ?? ":memory:");
			this.#db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA temp_store = memory;
      PRAGMA optimize;

      CREATE TABLE IF NOT EXISTS cacheInterceptorV${VERSION} (
        -- Data specific to us
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        method TEXT NOT NULL,

        -- Data returned to the interceptor
        body BUF NULL,
        deleteAt INTEGER NOT NULL,
        statusCode INTEGER NOT NULL,
        statusMessage TEXT NOT NULL,
        headers TEXT NULL,
        cacheControlDirectives TEXT NULL,
        etag TEXT NULL,
        vary TEXT NULL,
        cachedAt INTEGER NOT NULL,
        staleAt INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_cacheInterceptorV${VERSION}_getValuesQuery ON cacheInterceptorV${VERSION}(url, method, deleteAt);
      CREATE INDEX IF NOT EXISTS idx_cacheInterceptorV${VERSION}_deleteByUrlQuery ON cacheInterceptorV${VERSION}(deleteAt);
    `);
			this.#getValuesQuery = this.#db.prepare(`
      SELECT
        id,
        body,
        deleteAt,
        statusCode,
        statusMessage,
        headers,
        etag,
        cacheControlDirectives,
        vary,
        cachedAt,
        staleAt
      FROM cacheInterceptorV${VERSION}
      WHERE
        url = ?
        AND method = ?
      ORDER BY
        deleteAt ASC
    `);
			this.#updateValueQuery = this.#db.prepare(`
      UPDATE cacheInterceptorV${VERSION} SET
        body = ?,
        deleteAt = ?,
        statusCode = ?,
        statusMessage = ?,
        headers = ?,
        etag = ?,
        cacheControlDirectives = ?,
        vary = ?,
        cachedAt = ?,
        staleAt = ?
      WHERE
        id = ?
    `);
			this.#insertValueQuery = this.#db.prepare(`
      INSERT INTO cacheInterceptorV${VERSION} (
        url,
        method,
        body,
        deleteAt,
        statusCode,
        statusMessage,
        headers,
        etag,
        cacheControlDirectives,
        vary,
        cachedAt,
        staleAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
			this.#deleteByUrlQuery = this.#db.prepare(`DELETE FROM cacheInterceptorV${VERSION} WHERE url = ?`);
			this.#countEntriesQuery = this.#db.prepare(`SELECT COUNT(*) AS total FROM cacheInterceptorV${VERSION}`);
			this.#deleteExpiredValuesQuery = this.#db.prepare(`DELETE FROM cacheInterceptorV${VERSION} WHERE deleteAt <= ?`);
			this.#deleteOldValuesQuery = this.#maxCount === Infinity ? null : this.#db.prepare(`
        DELETE FROM cacheInterceptorV${VERSION}
        WHERE id IN (
          SELECT
            id
          FROM cacheInterceptorV${VERSION}
          ORDER BY cachedAt ASC
          LIMIT ?
        )
      `);
		}
		close() {
			this.#db.close();
		}
		/**
		* @param {import('../../types/cache-interceptor.d.ts').default.CacheKey} key
		* @returns {(import('../../types/cache-interceptor.d.ts').default.GetResult & { body?: Buffer }) | undefined}
		*/
		get(key) {
			assertCacheKey(key);
			const value = this.#findValue(key);
			return value ? {
				body: value.body ? Buffer.from(value.body.buffer, value.body.byteOffset, value.body.byteLength) : void 0,
				statusCode: value.statusCode,
				statusMessage: value.statusMessage,
				headers: value.headers ? JSON.parse(value.headers) : void 0,
				etag: value.etag ? value.etag : void 0,
				vary: value.vary ? JSON.parse(value.vary) : void 0,
				cacheControlDirectives: value.cacheControlDirectives ? JSON.parse(value.cacheControlDirectives) : void 0,
				cachedAt: value.cachedAt,
				staleAt: value.staleAt,
				deleteAt: value.deleteAt
			} : void 0;
		}
		/**
		* @param {import('../../types/cache-interceptor.d.ts').default.CacheKey} key
		* @param {import('../../types/cache-interceptor.d.ts').default.CacheValue & { body: null | Buffer | Array<Buffer>}} value
		*/
		set(key, value) {
			assertCacheKey(key);
			const url = this.#makeValueUrl(key);
			const body = Array.isArray(value.body) ? Buffer.concat(value.body) : value.body;
			const size = body?.byteLength;
			if (size && size > this.#maxEntrySize) return;
			const existingValue = this.#findValue(key, true);
			if (existingValue) this.#updateValueQuery.run(body, value.deleteAt, value.statusCode, value.statusMessage, value.headers ? JSON.stringify(value.headers) : null, value.etag ? value.etag : null, value.cacheControlDirectives ? JSON.stringify(value.cacheControlDirectives) : null, value.vary ? JSON.stringify(value.vary) : null, value.cachedAt, value.staleAt, existingValue.id);
			else {
				this.#insertValueQuery.run(url, key.method, body, value.deleteAt, value.statusCode, value.statusMessage, value.headers ? JSON.stringify(value.headers) : null, value.etag ? value.etag : null, value.cacheControlDirectives ? JSON.stringify(value.cacheControlDirectives) : null, value.vary ? JSON.stringify(value.vary) : null, value.cachedAt, value.staleAt);
				this.#prune();
			}
		}
		/**
		* @param {import('../../types/cache-interceptor.d.ts').default.CacheKey} key
		* @param {import('../../types/cache-interceptor.d.ts').default.CacheValue} value
		* @returns {Writable | undefined}
		*/
		createWriteStream(key, value) {
			assertCacheKey(key);
			assertCacheValue(value);
			let size = 0;
			/**
			* @type {Buffer[] | null}
			*/
			const body = [];
			const store = this;
			return new Writable$1({
				decodeStrings: true,
				write(chunk, encoding, callback) {
					size += chunk.byteLength;
					if (size <= store.#maxEntrySize) body.push(chunk);
					else this.destroy();
					callback();
				},
				final(callback) {
					store.set(key, {
						...value,
						body
					});
					callback();
				}
			});
		}
		/**
		* @param {import('../../types/cache-interceptor.d.ts').default.CacheKey} key
		*/
		delete(key) {
			if (typeof key !== "object") throw new TypeError(`expected key to be object, got ${typeof key}`);
			this.#deleteByUrlQuery.run(this.#makeValueUrl(key));
		}
		#prune() {
			if (Number.isFinite(this.#maxCount) && this.size <= this.#maxCount) return 0;
			{
				const removed = this.#deleteExpiredValuesQuery.run(Date.now()).changes;
				if (removed) return removed;
			}
			{
				const removed = this.#deleteOldValuesQuery?.run(Math.max(Math.floor(this.#maxCount * .1), 1)).changes;
				if (removed) return removed;
			}
			return 0;
		}
		/**
		* Counts the number of rows in the cache
		* @returns {Number}
		*/
		get size() {
			const { total } = this.#countEntriesQuery.get();
			return total;
		}
		/**
		* @param {import('../../types/cache-interceptor.d.ts').default.CacheKey} key
		* @returns {string}
		*/
		#makeValueUrl(key) {
			return `${key.origin}/${key.path}`;
		}
		/**
		* @param {import('../../types/cache-interceptor.d.ts').default.CacheKey} key
		* @param {boolean} [canBeExpired=false]
		* @returns {SqliteStoreValue | undefined}
		*/
		#findValue(key, canBeExpired = false) {
			const url = this.#makeValueUrl(key);
			const { headers, method } = key;
			/**
			* @type {SqliteStoreValue[]}
			*/
			const values = this.#getValuesQuery.all(url, method);
			if (values.length === 0) return;
			const now = Date.now();
			for (const value of values) {
				if (now >= value.deleteAt && !canBeExpired) continue;
				let matches = true;
				if (value.vary) {
					const vary = JSON.parse(value.vary);
					for (const header in vary) if (!headerValueEquals(headers[header], vary[header])) {
						matches = false;
						break;
					}
				}
				if (matches) return value;
			}
		}
	};
	/**
	* @param {string|string[]|null|undefined} lhs
	* @param {string|string[]|null|undefined} rhs
	* @returns {boolean}
	*/
	function headerValueEquals(lhs, rhs) {
		if (lhs == null && rhs == null) return true;
		if (lhs == null && rhs != null || lhs != null && rhs == null) return false;
		if (Array.isArray(lhs) && Array.isArray(rhs)) {
			if (lhs.length !== rhs.length) return false;
			for (let i = 0; i < lhs.length; i++) if (lhs[i] !== rhs[i]) return false;
			return true;
		}
		return lhs === rhs;
	}
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/web/fetch/headers.js
var require_headers = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { kConstruct } = require_symbols();
	const { kEnumerableProperty } = require_util$5();
	const { iteratorMixin, isValidHeaderName, isValidHeaderValue } = require_util$4();
	const { webidl } = require_webidl();
	const assert$9 = __require("node:assert");
	const util = __require("node:util");
	/**
	* @param {number} code
	* @returns {code is (0x0a | 0x0d | 0x09 | 0x20)}
	*/
	function isHTTPWhiteSpaceCharCode(code) {
		return code === 10 || code === 13 || code === 9 || code === 32;
	}
	/**
	* @see https://fetch.spec.whatwg.org/#concept-header-value-normalize
	* @param {string} potentialValue
	* @returns {string}
	*/
	function headerValueNormalize(potentialValue) {
		let i = 0;
		let j = potentialValue.length;
		while (j > i && isHTTPWhiteSpaceCharCode(potentialValue.charCodeAt(j - 1))) --j;
		while (j > i && isHTTPWhiteSpaceCharCode(potentialValue.charCodeAt(i))) ++i;
		return i === 0 && j === potentialValue.length ? potentialValue : potentialValue.substring(i, j);
	}
	/**
	* @param {Headers} headers
	* @param {Array|Object} object
	*/
	function fill(headers, object) {
		if (Array.isArray(object)) for (let i = 0; i < object.length; ++i) {
			const header = object[i];
			if (header.length !== 2) throw webidl.errors.exception({
				header: "Headers constructor",
				message: `expected name/value pair to be length 2, found ${header.length}.`
			});
			appendHeader(headers, header[0], header[1]);
		}
		else if (typeof object === "object" && object !== null) {
			const keys = Object.keys(object);
			for (let i = 0; i < keys.length; ++i) appendHeader(headers, keys[i], object[keys[i]]);
		} else throw webidl.errors.conversionFailed({
			prefix: "Headers constructor",
			argument: "Argument 1",
			types: ["sequence<sequence<ByteString>>", "record<ByteString, ByteString>"]
		});
	}
	/**
	* @see https://fetch.spec.whatwg.org/#concept-headers-append
	* @param {Headers} headers
	* @param {string} name
	* @param {string} value
	*/
	function appendHeader(headers, name, value) {
		value = headerValueNormalize(value);
		if (!isValidHeaderName(name)) throw webidl.errors.invalidArgument({
			prefix: "Headers.append",
			value: name,
			type: "header name"
		});
		else if (!isValidHeaderValue(value)) throw webidl.errors.invalidArgument({
			prefix: "Headers.append",
			value,
			type: "header value"
		});
		if (getHeadersGuard(headers) === "immutable") throw new TypeError("immutable");
		return getHeadersList(headers).append(name, value, false);
	}
	/**
	* @param {Headers} target
	*/
	function headersListSortAndCombine(target) {
		const headersList = getHeadersList(target);
		if (!headersList) return [];
		if (headersList.sortedMap) return headersList.sortedMap;
		const headers = [];
		const names = headersList.toSortedArray();
		const cookies = headersList.cookies;
		if (cookies === null || cookies.length === 1) return headersList.sortedMap = names;
		for (let i = 0; i < names.length; ++i) {
			const { 0: name, 1: value } = names[i];
			if (name === "set-cookie") for (let j = 0; j < cookies.length; ++j) headers.push([name, cookies[j]]);
			else headers.push([name, value]);
		}
		return headersList.sortedMap = headers;
	}
	function compareHeaderName(a, b) {
		return a[0] < b[0] ? -1 : 1;
	}
	var HeadersList = class HeadersList {
		/** @type {[string, string][]|null} */
		cookies = null;
		sortedMap;
		headersMap;
		constructor(init) {
			if (init instanceof HeadersList) {
				this.headersMap = new Map(init.headersMap);
				this.sortedMap = init.sortedMap;
				this.cookies = init.cookies === null ? null : [...init.cookies];
			} else {
				this.headersMap = new Map(init);
				this.sortedMap = null;
			}
		}
		/**
		* @see https://fetch.spec.whatwg.org/#header-list-contains
		* @param {string} name
		* @param {boolean} isLowerCase
		*/
		contains(name, isLowerCase) {
			return this.headersMap.has(isLowerCase ? name : name.toLowerCase());
		}
		clear() {
			this.headersMap.clear();
			this.sortedMap = null;
			this.cookies = null;
		}
		/**
		* @see https://fetch.spec.whatwg.org/#concept-header-list-append
		* @param {string} name
		* @param {string} value
		* @param {boolean} isLowerCase
		*/
		append(name, value, isLowerCase) {
			this.sortedMap = null;
			const lowercaseName = isLowerCase ? name : name.toLowerCase();
			const exists = this.headersMap.get(lowercaseName);
			if (exists) {
				const delimiter = lowercaseName === "cookie" ? "; " : ", ";
				this.headersMap.set(lowercaseName, {
					name: exists.name,
					value: `${exists.value}${delimiter}${value}`
				});
			} else this.headersMap.set(lowercaseName, {
				name,
				value
			});
			if (lowercaseName === "set-cookie") (this.cookies ??= []).push(value);
		}
		/**
		* @see https://fetch.spec.whatwg.org/#concept-header-list-set
		* @param {string} name
		* @param {string} value
		* @param {boolean} isLowerCase
		*/
		set(name, value, isLowerCase) {
			this.sortedMap = null;
			const lowercaseName = isLowerCase ? name : name.toLowerCase();
			if (lowercaseName === "set-cookie") this.cookies = [value];
			this.headersMap.set(lowercaseName, {
				name,
				value
			});
		}
		/**
		* @see https://fetch.spec.whatwg.org/#concept-header-list-delete
		* @param {string} name
		* @param {boolean} isLowerCase
		*/
		delete(name, isLowerCase) {
			this.sortedMap = null;
			if (!isLowerCase) name = name.toLowerCase();
			if (name === "set-cookie") this.cookies = null;
			this.headersMap.delete(name);
		}
		/**
		* @see https://fetch.spec.whatwg.org/#concept-header-list-get
		* @param {string} name
		* @param {boolean} isLowerCase
		* @returns {string | null}
		*/
		get(name, isLowerCase) {
			return this.headersMap.get(isLowerCase ? name : name.toLowerCase())?.value ?? null;
		}
		*[Symbol.iterator]() {
			for (const { 0: name, 1: { value } } of this.headersMap) yield [name, value];
		}
		get entries() {
			const headers = {};
			if (this.headersMap.size !== 0) for (const { name, value } of this.headersMap.values()) headers[name] = value;
			return headers;
		}
		rawValues() {
			return this.headersMap.values();
		}
		get entriesList() {
			const headers = [];
			if (this.headersMap.size !== 0) for (const { 0: lowerName, 1: { name, value } } of this.headersMap) if (lowerName === "set-cookie") for (const cookie of this.cookies) headers.push([name, cookie]);
			else headers.push([name, value]);
			return headers;
		}
		toSortedArray() {
			const size = this.headersMap.size;
			const array = new Array(size);
			if (size <= 32) {
				if (size === 0) return array;
				const iterator = this.headersMap[Symbol.iterator]();
				const firstValue = iterator.next().value;
				array[0] = [firstValue[0], firstValue[1].value];
				assert$9(firstValue[1].value !== null);
				for (let i = 1, j = 0, right = 0, left = 0, pivot = 0, x, value; i < size; ++i) {
					value = iterator.next().value;
					x = array[i] = [value[0], value[1].value];
					assert$9(x[1] !== null);
					left = 0;
					right = i;
					while (left < right) {
						pivot = left + (right - left >> 1);
						if (array[pivot][0] <= x[0]) left = pivot + 1;
						else right = pivot;
					}
					if (i !== pivot) {
						j = i;
						while (j > left) array[j] = array[--j];
						array[left] = x;
					}
				}
				/* c8 ignore next 4 */
				if (!iterator.next().done) throw new TypeError("Unreachable");
				return array;
			} else {
				let i = 0;
				for (const { 0: name, 1: { value } } of this.headersMap) {
					array[i++] = [name, value];
					assert$9(value !== null);
				}
				return array.sort(compareHeaderName);
			}
		}
	};
	var Headers = class Headers {
		#guard;
		/**
		* @type {HeadersList}
		*/
		#headersList;
		/**
		* @param {HeadersInit|Symbol} [init]
		* @returns
		*/
		constructor(init = void 0) {
			webidl.util.markAsUncloneable(this);
			if (init === kConstruct) return;
			this.#headersList = new HeadersList();
			this.#guard = "none";
			if (init !== void 0) {
				init = webidl.converters.HeadersInit(init, "Headers constructor", "init");
				fill(this, init);
			}
		}
		append(name, value) {
			webidl.brandCheck(this, Headers);
			webidl.argumentLengthCheck(arguments, 2, "Headers.append");
			const prefix = "Headers.append";
			name = webidl.converters.ByteString(name, prefix, "name");
			value = webidl.converters.ByteString(value, prefix, "value");
			return appendHeader(this, name, value);
		}
		delete(name) {
			webidl.brandCheck(this, Headers);
			webidl.argumentLengthCheck(arguments, 1, "Headers.delete");
			name = webidl.converters.ByteString(name, "Headers.delete", "name");
			if (!isValidHeaderName(name)) throw webidl.errors.invalidArgument({
				prefix: "Headers.delete",
				value: name,
				type: "header name"
			});
			if (this.#guard === "immutable") throw new TypeError("immutable");
			if (!this.#headersList.contains(name, false)) return;
			this.#headersList.delete(name, false);
		}
		get(name) {
			webidl.brandCheck(this, Headers);
			webidl.argumentLengthCheck(arguments, 1, "Headers.get");
			const prefix = "Headers.get";
			name = webidl.converters.ByteString(name, prefix, "name");
			if (!isValidHeaderName(name)) throw webidl.errors.invalidArgument({
				prefix,
				value: name,
				type: "header name"
			});
			return this.#headersList.get(name, false);
		}
		has(name) {
			webidl.brandCheck(this, Headers);
			webidl.argumentLengthCheck(arguments, 1, "Headers.has");
			const prefix = "Headers.has";
			name = webidl.converters.ByteString(name, prefix, "name");
			if (!isValidHeaderName(name)) throw webidl.errors.invalidArgument({
				prefix,
				value: name,
				type: "header name"
			});
			return this.#headersList.contains(name, false);
		}
		set(name, value) {
			webidl.brandCheck(this, Headers);
			webidl.argumentLengthCheck(arguments, 2, "Headers.set");
			const prefix = "Headers.set";
			name = webidl.converters.ByteString(name, prefix, "name");
			value = webidl.converters.ByteString(value, prefix, "value");
			value = headerValueNormalize(value);
			if (!isValidHeaderName(name)) throw webidl.errors.invalidArgument({
				prefix,
				value: name,
				type: "header name"
			});
			else if (!isValidHeaderValue(value)) throw webidl.errors.invalidArgument({
				prefix,
				value,
				type: "header value"
			});
			if (this.#guard === "immutable") throw new TypeError("immutable");
			this.#headersList.set(name, value, false);
		}
		getSetCookie() {
			webidl.brandCheck(this, Headers);
			const list = this.#headersList.cookies;
			if (list) return [...list];
			return [];
		}
		[util.inspect.custom](depth, options) {
			options.depth ??= depth;
			return `Headers ${util.formatWithOptions(options, this.#headersList.entries)}`;
		}
		static getHeadersGuard(o) {
			return o.#guard;
		}
		static setHeadersGuard(o, guard) {
			o.#guard = guard;
		}
		/**
		* @param {Headers} o
		*/
		static getHeadersList(o) {
			return o.#headersList;
		}
		/**
		* @param {Headers} target
		* @param {HeadersList} list
		*/
		static setHeadersList(target, list) {
			target.#headersList = list;
		}
	};
	const { getHeadersGuard, setHeadersGuard, getHeadersList, setHeadersList } = Headers;
	Reflect.deleteProperty(Headers, "getHeadersGuard");
	Reflect.deleteProperty(Headers, "setHeadersGuard");
	Reflect.deleteProperty(Headers, "getHeadersList");
	Reflect.deleteProperty(Headers, "setHeadersList");
	iteratorMixin("Headers", Headers, headersListSortAndCombine, 0, 1);
	Object.defineProperties(Headers.prototype, {
		append: kEnumerableProperty,
		delete: kEnumerableProperty,
		get: kEnumerableProperty,
		has: kEnumerableProperty,
		set: kEnumerableProperty,
		getSetCookie: kEnumerableProperty,
		[Symbol.toStringTag]: {
			value: "Headers",
			configurable: true
		},
		[util.inspect.custom]: { enumerable: false }
	});
	webidl.converters.HeadersInit = function(V, prefix, argument) {
		if (webidl.util.Type(V) === webidl.util.Types.OBJECT) {
			const iterator = Reflect.get(V, Symbol.iterator);
			if (!util.types.isProxy(V) && iterator === Headers.prototype.entries) try {
				return getHeadersList(V).entriesList;
			} catch {}
			if (typeof iterator === "function") return webidl.converters["sequence<sequence<ByteString>>"](V, prefix, argument, iterator.bind(V));
			return webidl.converters["record<ByteString, ByteString>"](V, prefix, argument);
		}
		throw webidl.errors.conversionFailed({
			prefix: "Headers constructor",
			argument: "Argument 1",
			types: ["sequence<sequence<ByteString>>", "record<ByteString, ByteString>"]
		});
	};
	module.exports = {
		fill,
		compareHeaderName,
		Headers,
		HeadersList,
		getHeadersGuard,
		setHeadersGuard,
		setHeadersList,
		getHeadersList
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/web/fetch/response.js
var require_response = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { Headers, HeadersList, fill, getHeadersGuard, setHeadersGuard, setHeadersList } = require_headers();
	const { extractBody, cloneBody, mixinBody, streamRegistry, bodyUnusable } = require_body();
	const util = require_util$5();
	const nodeUtil$1 = __require("node:util");
	const { kEnumerableProperty } = util;
	const { isValidReasonPhrase, isCancelled, isAborted, isErrorLike, environmentSettingsObject: relevantRealm } = require_util$4();
	const { redirectStatusSet, nullBodyStatus } = require_constants$2();
	const { webidl } = require_webidl();
	const { URLSerializer } = require_data_url();
	const { kConstruct } = require_symbols();
	const assert$8 = __require("node:assert");
	const { isomorphicEncode, serializeJavascriptValueToJSONString } = require_infra();
	const textEncoder = new TextEncoder("utf-8");
	var Response = class Response {
		/** @type {Headers} */
		#headers;
		#state;
		static error() {
			return fromInnerResponse(makeNetworkError(), "immutable");
		}
		static json(data, init = void 0) {
			webidl.argumentLengthCheck(arguments, 1, "Response.json");
			init = webidl.converters.ResponseInit(init);
			const bytes = textEncoder.encode(serializeJavascriptValueToJSONString(data));
			const body = extractBody(bytes);
			const responseObject = fromInnerResponse(makeResponse({}), "response");
			initializeResponse(responseObject, init, {
				body: body[0],
				type: "application/json"
			});
			return responseObject;
		}
		static redirect(url, status = 302) {
			webidl.argumentLengthCheck(arguments, 1, "Response.redirect");
			url = webidl.converters.USVString(url);
			status = webidl.converters["unsigned short"](status);
			let parsedURL;
			try {
				parsedURL = new URL(url, relevantRealm.settingsObject.baseUrl);
			} catch (err) {
				throw new TypeError(`Failed to parse URL from ${url}`, { cause: err });
			}
			if (!redirectStatusSet.has(status)) throw new RangeError(`Invalid status code ${status}`);
			const responseObject = fromInnerResponse(makeResponse({}), "immutable");
			responseObject.#state.status = status;
			const value = isomorphicEncode(URLSerializer(parsedURL));
			responseObject.#state.headersList.append("location", value, true);
			return responseObject;
		}
		constructor(body = null, init = void 0) {
			webidl.util.markAsUncloneable(this);
			if (body === kConstruct) return;
			if (body !== null) body = webidl.converters.BodyInit(body, "Response", "body");
			init = webidl.converters.ResponseInit(init);
			this.#state = makeResponse({});
			this.#headers = new Headers(kConstruct);
			setHeadersGuard(this.#headers, "response");
			setHeadersList(this.#headers, this.#state.headersList);
			let bodyWithType = null;
			if (body != null) {
				const [extractedBody, type] = extractBody(body);
				bodyWithType = {
					body: extractedBody,
					type
				};
			}
			initializeResponse(this, init, bodyWithType);
		}
		get type() {
			webidl.brandCheck(this, Response);
			return this.#state.type;
		}
		get url() {
			webidl.brandCheck(this, Response);
			const urlList = this.#state.urlList;
			const url = urlList[urlList.length - 1] ?? null;
			if (url === null) return "";
			return URLSerializer(url, true);
		}
		get redirected() {
			webidl.brandCheck(this, Response);
			return this.#state.urlList.length > 1;
		}
		get status() {
			webidl.brandCheck(this, Response);
			return this.#state.status;
		}
		get ok() {
			webidl.brandCheck(this, Response);
			return this.#state.status >= 200 && this.#state.status <= 299;
		}
		get statusText() {
			webidl.brandCheck(this, Response);
			return this.#state.statusText;
		}
		get headers() {
			webidl.brandCheck(this, Response);
			return this.#headers;
		}
		get body() {
			webidl.brandCheck(this, Response);
			return this.#state.body ? this.#state.body.stream : null;
		}
		get bodyUsed() {
			webidl.brandCheck(this, Response);
			return !!this.#state.body && util.isDisturbed(this.#state.body.stream);
		}
		clone() {
			webidl.brandCheck(this, Response);
			if (bodyUnusable(this.#state)) throw webidl.errors.exception({
				header: "Response.clone",
				message: "Body has already been consumed."
			});
			const clonedResponse = cloneResponse(this.#state);
			if (this.#state.urlList.length !== 0 && this.#state.body?.stream) streamRegistry.register(this, new WeakRef(this.#state.body.stream));
			return fromInnerResponse(clonedResponse, getHeadersGuard(this.#headers));
		}
		[nodeUtil$1.inspect.custom](depth, options) {
			if (options.depth === null) options.depth = 2;
			options.colors ??= true;
			const properties = {
				status: this.status,
				statusText: this.statusText,
				headers: this.headers,
				body: this.body,
				bodyUsed: this.bodyUsed,
				ok: this.ok,
				redirected: this.redirected,
				type: this.type,
				url: this.url
			};
			return `Response ${nodeUtil$1.formatWithOptions(options, properties)}`;
		}
		/**
		* @param {Response} response
		*/
		static getResponseHeaders(response) {
			return response.#headers;
		}
		/**
		* @param {Response} response
		* @param {Headers} newHeaders
		*/
		static setResponseHeaders(response, newHeaders) {
			response.#headers = newHeaders;
		}
		/**
		* @param {Response} response
		*/
		static getResponseState(response) {
			return response.#state;
		}
		/**
		* @param {Response} response
		* @param {any} newState
		*/
		static setResponseState(response, newState) {
			response.#state = newState;
		}
	};
	const { getResponseHeaders, setResponseHeaders, getResponseState, setResponseState } = Response;
	Reflect.deleteProperty(Response, "getResponseHeaders");
	Reflect.deleteProperty(Response, "setResponseHeaders");
	Reflect.deleteProperty(Response, "getResponseState");
	Reflect.deleteProperty(Response, "setResponseState");
	mixinBody(Response, getResponseState);
	Object.defineProperties(Response.prototype, {
		type: kEnumerableProperty,
		url: kEnumerableProperty,
		status: kEnumerableProperty,
		ok: kEnumerableProperty,
		redirected: kEnumerableProperty,
		statusText: kEnumerableProperty,
		headers: kEnumerableProperty,
		clone: kEnumerableProperty,
		body: kEnumerableProperty,
		bodyUsed: kEnumerableProperty,
		[Symbol.toStringTag]: {
			value: "Response",
			configurable: true
		}
	});
	Object.defineProperties(Response, {
		json: kEnumerableProperty,
		redirect: kEnumerableProperty,
		error: kEnumerableProperty
	});
	function cloneResponse(response) {
		if (response.internalResponse) return filterResponse(cloneResponse(response.internalResponse), response.type);
		const newResponse = makeResponse({
			...response,
			body: null
		});
		if (response.body != null) newResponse.body = cloneBody(response.body);
		return newResponse;
	}
	function makeResponse(init) {
		return {
			aborted: false,
			rangeRequested: false,
			timingAllowPassed: false,
			requestIncludesCredentials: false,
			type: "default",
			status: 200,
			timingInfo: null,
			cacheState: "",
			statusText: "",
			...init,
			headersList: init?.headersList ? new HeadersList(init?.headersList) : new HeadersList(),
			urlList: init?.urlList ? [...init.urlList] : []
		};
	}
	function makeNetworkError(reason) {
		return makeResponse({
			type: "error",
			status: 0,
			error: isErrorLike(reason) ? reason : new Error(reason ? String(reason) : reason),
			aborted: reason && reason.name === "AbortError"
		});
	}
	function isNetworkError(response) {
		return response.type === "error" && response.status === 0;
	}
	function makeFilteredResponse(response, state) {
		state = {
			internalResponse: response,
			...state
		};
		return new Proxy(response, {
			get(target, p) {
				return p in state ? state[p] : target[p];
			},
			set(target, p, value) {
				assert$8(!(p in state));
				target[p] = value;
				return true;
			}
		});
	}
	function filterResponse(response, type) {
		if (type === "basic") return makeFilteredResponse(response, {
			type: "basic",
			headersList: response.headersList
		});
		else if (type === "cors") return makeFilteredResponse(response, {
			type: "cors",
			headersList: response.headersList
		});
		else if (type === "opaque") return makeFilteredResponse(response, {
			type: "opaque",
			urlList: [],
			status: 0,
			statusText: "",
			body: null
		});
		else if (type === "opaqueredirect") return makeFilteredResponse(response, {
			type: "opaqueredirect",
			status: 0,
			statusText: "",
			headersList: [],
			body: null
		});
		else assert$8(false);
	}
	function makeAppropriateNetworkError(fetchParams, err = null) {
		assert$8(isCancelled(fetchParams));
		return isAborted(fetchParams) ? makeNetworkError(Object.assign(new DOMException("The operation was aborted.", "AbortError"), { cause: err })) : makeNetworkError(Object.assign(new DOMException("Request was cancelled."), { cause: err }));
	}
	function initializeResponse(response, init, body) {
		if (init.status !== null && (init.status < 200 || init.status > 599)) throw new RangeError("init[\"status\"] must be in the range of 200 to 599, inclusive.");
		if ("statusText" in init && init.statusText != null) {
			if (!isValidReasonPhrase(String(init.statusText))) throw new TypeError("Invalid statusText");
		}
		if ("status" in init && init.status != null) getResponseState(response).status = init.status;
		if ("statusText" in init && init.statusText != null) getResponseState(response).statusText = init.statusText;
		if ("headers" in init && init.headers != null) fill(getResponseHeaders(response), init.headers);
		if (body) {
			if (nullBodyStatus.includes(response.status)) throw webidl.errors.exception({
				header: "Response constructor",
				message: `Invalid response status code ${response.status}`
			});
			getResponseState(response).body = body.body;
			if (body.type != null && !getResponseState(response).headersList.contains("content-type", true)) getResponseState(response).headersList.append("content-type", body.type, true);
		}
	}
	/**
	* @see https://fetch.spec.whatwg.org/#response-create
	* @param {any} innerResponse
	* @param {'request' | 'immutable' | 'request-no-cors' | 'response' | 'none'} guard
	* @returns {Response}
	*/
	function fromInnerResponse(innerResponse, guard) {
		const response = new Response(kConstruct);
		setResponseState(response, innerResponse);
		const headers = new Headers(kConstruct);
		setResponseHeaders(response, headers);
		setHeadersList(headers, innerResponse.headersList);
		setHeadersGuard(headers, guard);
		if (innerResponse.urlList.length !== 0 && innerResponse.body?.stream) streamRegistry.register(response, new WeakRef(innerResponse.body.stream));
		return response;
	}
	webidl.converters.XMLHttpRequestBodyInit = function(V, prefix, name) {
		if (typeof V === "string") return webidl.converters.USVString(V, prefix, name);
		if (webidl.is.Blob(V)) return V;
		if (webidl.is.BufferSource(V)) return V;
		if (webidl.is.FormData(V)) return V;
		if (webidl.is.URLSearchParams(V)) return V;
		return webidl.converters.DOMString(V, prefix, name);
	};
	webidl.converters.BodyInit = function(V, prefix, argument) {
		if (webidl.is.ReadableStream(V)) return V;
		if (V?.[Symbol.asyncIterator]) return V;
		return webidl.converters.XMLHttpRequestBodyInit(V, prefix, argument);
	};
	webidl.converters.ResponseInit = webidl.dictionaryConverter([
		{
			key: "status",
			converter: webidl.converters["unsigned short"],
			defaultValue: () => 200
		},
		{
			key: "statusText",
			converter: webidl.converters.ByteString,
			defaultValue: () => ""
		},
		{
			key: "headers",
			converter: webidl.converters.HeadersInit
		}
	]);
	webidl.is.Response = webidl.util.MakeTypeAssertion(Response);
	module.exports = {
		isNetworkError,
		makeNetworkError,
		makeResponse,
		makeAppropriateNetworkError,
		filterResponse,
		Response,
		cloneResponse,
		fromInnerResponse,
		getResponseState
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/web/fetch/request.js
var require_request = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { extractBody, mixinBody, cloneBody, bodyUnusable } = require_body();
	const { Headers, fill: fillHeaders, HeadersList, setHeadersGuard, getHeadersGuard, setHeadersList, getHeadersList } = require_headers();
	const util = require_util$5();
	const nodeUtil = __require("node:util");
	const { isValidHTTPToken, sameOrigin, environmentSettingsObject } = require_util$4();
	const { forbiddenMethodsSet, corsSafeListedMethodsSet, referrerPolicy, requestRedirect, requestMode, requestCredentials, requestCache, requestDuplex } = require_constants$2();
	const { kEnumerableProperty, normalizedMethodRecordsBase, normalizedMethodRecords } = util;
	const { webidl } = require_webidl();
	const { URLSerializer } = require_data_url();
	const { kConstruct } = require_symbols();
	const assert$7 = __require("node:assert");
	const { getMaxListeners, setMaxListeners, defaultMaxListeners } = __require("node:events");
	const kAbortController = Symbol("abortController");
	const requestFinalizer = new FinalizationRegistry(({ signal, abort }) => {
		signal.removeEventListener("abort", abort);
	});
	const dependentControllerMap = /* @__PURE__ */ new WeakMap();
	let abortSignalHasEventHandlerLeakWarning;
	try {
		abortSignalHasEventHandlerLeakWarning = getMaxListeners(new AbortController().signal) > 0;
	} catch {
		abortSignalHasEventHandlerLeakWarning = false;
	}
	function buildAbort(acRef) {
		return abort;
		function abort() {
			const ac = acRef.deref();
			if (ac !== void 0) {
				requestFinalizer.unregister(abort);
				this.removeEventListener("abort", abort);
				ac.abort(this.reason);
				const controllerList = dependentControllerMap.get(ac.signal);
				if (controllerList !== void 0) {
					if (controllerList.size !== 0) {
						for (const ref of controllerList) {
							const ctrl = ref.deref();
							if (ctrl !== void 0) ctrl.abort(this.reason);
						}
						controllerList.clear();
					}
					dependentControllerMap.delete(ac.signal);
				}
			}
		}
	}
	let patchMethodWarning = false;
	var Request = class Request {
		/** @type {AbortSignal} */
		#signal;
		/** @type {import('../../dispatcher/dispatcher')} */
		#dispatcher;
		/** @type {Headers} */
		#headers;
		#state;
		/**
		* Removes the `abort` listener that makes this request's signal follow the
		* passed signal. `null` when no such listener was registered.
		* @type {(() => void) | null}
		*/
		#abortCleanup = null;
		constructor(input, init = void 0) {
			webidl.util.markAsUncloneable(this);
			if (input === kConstruct) return;
			webidl.argumentLengthCheck(arguments, 1, "Request constructor");
			input = webidl.converters.RequestInfo(input);
			init = webidl.converters.RequestInit(init);
			let request = null;
			let fallbackMode = null;
			const baseUrl = environmentSettingsObject.settingsObject.baseUrl;
			let signal = null;
			if (typeof input === "string") {
				this.#dispatcher = init.dispatcher;
				let parsedURL;
				try {
					parsedURL = new URL(input, baseUrl);
				} catch (err) {
					throw new TypeError("Failed to parse URL from " + input, { cause: err });
				}
				if (parsedURL.username || parsedURL.password) throw new TypeError("Request cannot be constructed from a URL that includes credentials: " + input);
				request = makeRequest({ urlList: [parsedURL] });
				fallbackMode = "cors";
			} else {
				assert$7(webidl.is.Request(input));
				request = input.#state;
				signal = input.#signal;
				this.#dispatcher = init.dispatcher || input.#dispatcher;
			}
			const origin = environmentSettingsObject.settingsObject.origin;
			let window = "client";
			if (request.window?.constructor?.name === "EnvironmentSettingsObject" && sameOrigin(request.window, origin)) window = request.window;
			if (init.window != null) throw new TypeError(`'window' option '${window}' must be null`);
			if ("window" in init) window = "no-window";
			request = makeRequest({
				method: request.method,
				headersList: request.headersList,
				unsafeRequest: request.unsafeRequest,
				client: environmentSettingsObject.settingsObject,
				window,
				priority: request.priority,
				origin: request.origin,
				referrer: request.referrer,
				referrerPolicy: request.referrerPolicy,
				mode: request.mode,
				credentials: request.credentials,
				cache: request.cache,
				redirect: request.redirect,
				integrity: request.integrity,
				keepalive: request.keepalive,
				reloadNavigation: request.reloadNavigation,
				historyNavigation: request.historyNavigation,
				urlList: [...request.urlList]
			});
			const initHasKey = Object.keys(init).length !== 0;
			if (initHasKey) {
				if (request.mode === "navigate") request.mode = "same-origin";
				request.reloadNavigation = false;
				request.historyNavigation = false;
				request.origin = "client";
				request.referrer = "client";
				request.referrerPolicy = "";
				request.url = request.urlList[request.urlList.length - 1];
				request.urlList = [request.url];
			}
			if (init.referrer !== void 0) {
				const referrer = init.referrer;
				if (referrer === "") request.referrer = "no-referrer";
				else {
					let parsedReferrer;
					try {
						parsedReferrer = new URL(referrer, baseUrl);
					} catch (err) {
						throw new TypeError(`Referrer "${referrer}" is not a valid URL.`, { cause: err });
					}
					if (parsedReferrer.protocol === "about:" && parsedReferrer.hostname === "client" || origin && !sameOrigin(parsedReferrer, environmentSettingsObject.settingsObject.baseUrl)) request.referrer = "client";
					else request.referrer = parsedReferrer;
				}
			}
			if (init.referrerPolicy !== void 0) request.referrerPolicy = init.referrerPolicy;
			let mode;
			if (init.mode !== void 0) mode = init.mode;
			else mode = fallbackMode;
			if (mode === "navigate") throw webidl.errors.exception({
				header: "Request constructor",
				message: "invalid request mode navigate."
			});
			if (mode != null) request.mode = mode;
			if (init.credentials !== void 0) request.credentials = init.credentials;
			if (init.cache !== void 0) request.cache = init.cache;
			if (request.cache === "only-if-cached" && request.mode !== "same-origin") throw new TypeError("'only-if-cached' can be set only with 'same-origin' mode");
			if (init.redirect !== void 0) request.redirect = init.redirect;
			if (init.integrity != null) request.integrity = String(init.integrity);
			if (init.keepalive !== void 0) request.keepalive = Boolean(init.keepalive);
			if (init.method !== void 0) {
				let method = init.method;
				const mayBeNormalized = normalizedMethodRecords[method];
				if (mayBeNormalized !== void 0) request.method = mayBeNormalized;
				else {
					if (!isValidHTTPToken(method)) throw new TypeError(`'${method}' is not a valid HTTP method.`);
					const upperCase = method.toUpperCase();
					if (forbiddenMethodsSet.has(upperCase)) throw new TypeError(`'${method}' HTTP method is unsupported.`);
					method = normalizedMethodRecordsBase[upperCase] ?? method;
					request.method = method;
				}
				if (!patchMethodWarning && request.method === "patch") {
					process.emitWarning("Using `patch` is highly likely to result in a `405 Method Not Allowed`. `PATCH` is much more likely to succeed.", { code: "UNDICI-FETCH-patch" });
					patchMethodWarning = true;
				}
			}
			if (init.signal !== void 0) signal = init.signal;
			this.#state = request;
			const ac = new AbortController();
			this.#signal = ac.signal;
			if (signal != null) {
				if (signal.aborted) ac.abort(signal.reason);
				else {
					this[kAbortController] = ac;
					const abort = buildAbort(new WeakRef(ac));
					if (abortSignalHasEventHandlerLeakWarning && getMaxListeners(signal) === defaultMaxListeners) setMaxListeners(1500, signal);
					const removeAbortListener = util.addAbortListener(signal, abort);
					requestFinalizer.register(ac, {
						signal,
						abort
					}, abort);
					this.#abortCleanup = () => {
						requestFinalizer.unregister(abort);
						removeAbortListener();
						this.#abortCleanup = null;
					};
				}
			}
			this.#headers = new Headers(kConstruct);
			setHeadersList(this.#headers, request.headersList);
			setHeadersGuard(this.#headers, "request");
			if (mode === "no-cors") {
				if (!corsSafeListedMethodsSet.has(request.method)) throw new TypeError(`'${request.method} is unsupported in no-cors mode.`);
				setHeadersGuard(this.#headers, "request-no-cors");
			}
			if (initHasKey) {
				/** @type {HeadersList} */
				const headersList = getHeadersList(this.#headers);
				const headers = init.headers !== void 0 ? init.headers : new HeadersList(headersList);
				headersList.clear();
				if (headers instanceof HeadersList) {
					for (const { name, value } of headers.rawValues()) headersList.append(name, value, false);
					headersList.cookies = headers.cookies;
				} else fillHeaders(this.#headers, headers);
			}
			const inputBody = webidl.is.Request(input) ? input.#state.body : null;
			if ((init.body != null || inputBody != null) && (request.method === "GET" || request.method === "HEAD")) throw new TypeError("Request with GET/HEAD method cannot have body.");
			let initBody = null;
			if (init.body != null) {
				const [extractedBody, contentType] = extractBody(init.body, request.keepalive);
				initBody = extractedBody;
				if (contentType && !getHeadersList(this.#headers).contains("content-type", true)) this.#headers.append("content-type", contentType, true);
			}
			const inputOrInitBody = initBody ?? inputBody;
			if (inputOrInitBody != null && inputOrInitBody.source == null) {
				if (initBody != null && init.duplex == null) throw new TypeError("RequestInit: duplex option is required when sending a body.");
				if (request.mode !== "same-origin" && request.mode !== "cors") throw new TypeError("If request is made from ReadableStream, mode should be \"same-origin\" or \"cors\"");
				request.useCORSPreflightFlag = true;
			}
			let finalBody = inputOrInitBody;
			if (initBody == null && inputBody != null) {
				if (bodyUnusable(input.#state)) throw new TypeError("Cannot construct a Request with a Request object that has already been used.");
				const identityTransform = new TransformStream();
				inputBody.stream.pipeThrough(identityTransform);
				finalBody = {
					source: inputBody.source,
					length: inputBody.length,
					stream: identityTransform.readable
				};
			}
			this.#state.body = finalBody;
		}
		get method() {
			webidl.brandCheck(this, Request);
			return this.#state.method;
		}
		get url() {
			webidl.brandCheck(this, Request);
			return URLSerializer(this.#state.url);
		}
		get headers() {
			webidl.brandCheck(this, Request);
			return this.#headers;
		}
		get destination() {
			webidl.brandCheck(this, Request);
			return this.#state.destination;
		}
		get referrer() {
			webidl.brandCheck(this, Request);
			if (this.#state.referrer === "no-referrer") return "";
			if (this.#state.referrer === "client") return "about:client";
			return this.#state.referrer.toString();
		}
		get referrerPolicy() {
			webidl.brandCheck(this, Request);
			return this.#state.referrerPolicy;
		}
		get mode() {
			webidl.brandCheck(this, Request);
			return this.#state.mode;
		}
		get credentials() {
			webidl.brandCheck(this, Request);
			return this.#state.credentials;
		}
		get cache() {
			webidl.brandCheck(this, Request);
			return this.#state.cache;
		}
		get redirect() {
			webidl.brandCheck(this, Request);
			return this.#state.redirect;
		}
		get integrity() {
			webidl.brandCheck(this, Request);
			return this.#state.integrity;
		}
		get keepalive() {
			webidl.brandCheck(this, Request);
			return this.#state.keepalive;
		}
		get isReloadNavigation() {
			webidl.brandCheck(this, Request);
			return this.#state.reloadNavigation;
		}
		get isHistoryNavigation() {
			webidl.brandCheck(this, Request);
			return this.#state.historyNavigation;
		}
		get signal() {
			webidl.brandCheck(this, Request);
			return this.#signal;
		}
		get body() {
			webidl.brandCheck(this, Request);
			return this.#state.body ? this.#state.body.stream : null;
		}
		get bodyUsed() {
			webidl.brandCheck(this, Request);
			return !!this.#state.body && util.isDisturbed(this.#state.body.stream);
		}
		get duplex() {
			webidl.brandCheck(this, Request);
			return "half";
		}
		clone() {
			webidl.brandCheck(this, Request);
			if (bodyUnusable(this.#state)) throw new TypeError("unusable");
			const clonedRequest = cloneRequest(this.#state);
			const ac = new AbortController();
			if (this.signal.aborted) ac.abort(this.signal.reason);
			else {
				let list = dependentControllerMap.get(this.signal);
				if (list === void 0) {
					list = /* @__PURE__ */ new Set();
					dependentControllerMap.set(this.signal, list);
				}
				const acRef = new WeakRef(ac);
				list.add(acRef);
				util.addAbortListener(ac.signal, buildAbort(acRef));
			}
			return fromInnerRequest(clonedRequest, this.#dispatcher, ac.signal, getHeadersGuard(this.#headers));
		}
		[nodeUtil.inspect.custom](depth, options) {
			if (options.depth === null) options.depth = 2;
			options.colors ??= true;
			const properties = {
				method: this.method,
				url: this.url,
				headers: this.headers,
				destination: this.destination,
				referrer: this.referrer,
				referrerPolicy: this.referrerPolicy,
				mode: this.mode,
				credentials: this.credentials,
				cache: this.cache,
				redirect: this.redirect,
				integrity: this.integrity,
				keepalive: this.keepalive,
				isReloadNavigation: this.isReloadNavigation,
				isHistoryNavigation: this.isHistoryNavigation,
				signal: this.signal
			};
			return `Request ${nodeUtil.formatWithOptions(options, properties)}`;
		}
		/**
		* @param {Request} request
		* @param {AbortSignal} newSignal
		*/
		static setRequestSignal(request, newSignal) {
			request.#signal = newSignal;
			return request;
		}
		/**
		* @param {Request} request
		*/
		static getRequestDispatcher(request) {
			return request.#dispatcher;
		}
		/**
		* @param {Request} request
		* @param {import('../../dispatcher/dispatcher')} newDispatcher
		*/
		static setRequestDispatcher(request, newDispatcher) {
			request.#dispatcher = newDispatcher;
		}
		/**
		* @param {Request} request
		* @param {Headers} newHeaders
		*/
		static setRequestHeaders(request, newHeaders) {
			request.#headers = newHeaders;
		}
		/**
		* @param {Request} request
		*/
		static getRequestState(request) {
			return request.#state;
		}
		/**
		* @param {Request} request
		* @param {any} newState
		*/
		static setRequestState(request, newState) {
			request.#state = newState;
		}
		/**
		* Removes the `abort` listener that makes this request's signal follow the
		* signal passed to its constructor, if any. Idempotent.
		* @param {Request} request
		*/
		static removeRequestAbortListener(request) {
			request.#abortCleanup?.();
		}
	};
	const { setRequestSignal, getRequestDispatcher, setRequestDispatcher, setRequestHeaders, getRequestState, setRequestState, removeRequestAbortListener } = Request;
	Reflect.deleteProperty(Request, "setRequestSignal");
	Reflect.deleteProperty(Request, "getRequestDispatcher");
	Reflect.deleteProperty(Request, "setRequestDispatcher");
	Reflect.deleteProperty(Request, "setRequestHeaders");
	Reflect.deleteProperty(Request, "getRequestState");
	Reflect.deleteProperty(Request, "setRequestState");
	Reflect.deleteProperty(Request, "removeRequestAbortListener");
	mixinBody(Request, getRequestState);
	function makeRequest(init) {
		return {
			method: init.method ?? "GET",
			localURLsOnly: init.localURLsOnly ?? false,
			unsafeRequest: init.unsafeRequest ?? false,
			body: init.body ?? null,
			client: init.client ?? null,
			reservedClient: init.reservedClient ?? null,
			replacesClientId: init.replacesClientId ?? "",
			window: init.window ?? "client",
			keepalive: init.keepalive ?? false,
			serviceWorkers: init.serviceWorkers ?? "all",
			initiator: init.initiator ?? "",
			destination: init.destination ?? "",
			priority: init.priority ?? null,
			origin: init.origin ?? "client",
			policyContainer: init.policyContainer ?? "client",
			referrer: init.referrer ?? "client",
			referrerPolicy: init.referrerPolicy ?? "",
			mode: init.mode ?? "no-cors",
			useCORSPreflightFlag: init.useCORSPreflightFlag ?? false,
			credentials: init.credentials ?? "same-origin",
			useCredentials: init.useCredentials ?? false,
			cache: init.cache ?? "default",
			redirect: init.redirect ?? "follow",
			integrity: init.integrity ?? "",
			cryptoGraphicsNonceMetadata: init.cryptoGraphicsNonceMetadata ?? "",
			parserMetadata: init.parserMetadata ?? "",
			reloadNavigation: init.reloadNavigation ?? false,
			historyNavigation: init.historyNavigation ?? false,
			userActivation: init.userActivation ?? false,
			taintedOrigin: init.taintedOrigin ?? false,
			redirectCount: init.redirectCount ?? 0,
			responseTainting: init.responseTainting ?? "basic",
			preventNoCacheCacheControlHeaderModification: init.preventNoCacheCacheControlHeaderModification ?? false,
			done: init.done ?? false,
			timingAllowFailed: init.timingAllowFailed ?? false,
			useURLCredentials: init.useURLCredentials ?? void 0,
			traversableForUserPrompts: init.traversableForUserPrompts ?? "client",
			urlList: init.urlList,
			url: init.urlList[0],
			headersList: init.headersList ? new HeadersList(init.headersList) : new HeadersList()
		};
	}
	function cloneRequest(request) {
		const newRequest = makeRequest({
			...request,
			body: null
		});
		if (request.body != null) newRequest.body = cloneBody(request.body);
		return newRequest;
	}
	/**
	* @see https://fetch.spec.whatwg.org/#request-create
	* @param {any} innerRequest
	* @param {import('../../dispatcher/agent')} dispatcher
	* @param {AbortSignal} signal
	* @param {'request' | 'immutable' | 'request-no-cors' | 'response' | 'none'} guard
	* @returns {Request}
	*/
	function fromInnerRequest(innerRequest, dispatcher, signal, guard) {
		const request = new Request(kConstruct);
		setRequestState(request, innerRequest);
		setRequestDispatcher(request, dispatcher);
		setRequestSignal(request, signal);
		const headers = new Headers(kConstruct);
		setRequestHeaders(request, headers);
		setHeadersList(headers, innerRequest.headersList);
		setHeadersGuard(headers, guard);
		return request;
	}
	Object.defineProperties(Request.prototype, {
		method: kEnumerableProperty,
		url: kEnumerableProperty,
		headers: kEnumerableProperty,
		redirect: kEnumerableProperty,
		clone: kEnumerableProperty,
		signal: kEnumerableProperty,
		duplex: kEnumerableProperty,
		destination: kEnumerableProperty,
		body: kEnumerableProperty,
		bodyUsed: kEnumerableProperty,
		isHistoryNavigation: kEnumerableProperty,
		isReloadNavigation: kEnumerableProperty,
		keepalive: kEnumerableProperty,
		integrity: kEnumerableProperty,
		cache: kEnumerableProperty,
		credentials: kEnumerableProperty,
		attribute: kEnumerableProperty,
		referrerPolicy: kEnumerableProperty,
		referrer: kEnumerableProperty,
		mode: kEnumerableProperty,
		[Symbol.toStringTag]: {
			value: "Request",
			configurable: true
		}
	});
	webidl.is.Request = webidl.util.MakeTypeAssertion(Request);
	/**
	* @param {*} V
	* @returns {import('../../../types/fetch').Request|string}
	*
	* @see https://fetch.spec.whatwg.org/#requestinfo
	*/
	webidl.converters.RequestInfo = function(V) {
		if (typeof V === "string") return webidl.converters.USVString(V);
		if (webidl.is.Request(V)) return V;
		return webidl.converters.USVString(V);
	};
	/**
	* @param {*} V
	* @returns {import('../../../types/fetch').RequestInit}
	* @see https://fetch.spec.whatwg.org/#requestinit
	*/
	webidl.converters.RequestInit = webidl.dictionaryConverter([
		{
			key: "method",
			converter: webidl.converters.ByteString
		},
		{
			key: "headers",
			converter: webidl.converters.HeadersInit
		},
		{
			key: "body",
			converter: webidl.nullableConverter(webidl.converters.BodyInit)
		},
		{
			key: "referrer",
			converter: webidl.converters.USVString
		},
		{
			key: "referrerPolicy",
			converter: webidl.converters.DOMString,
			allowedValues: referrerPolicy
		},
		{
			key: "mode",
			converter: webidl.converters.DOMString,
			allowedValues: requestMode
		},
		{
			key: "credentials",
			converter: webidl.converters.DOMString,
			allowedValues: requestCredentials
		},
		{
			key: "cache",
			converter: webidl.converters.DOMString,
			allowedValues: requestCache
		},
		{
			key: "redirect",
			converter: webidl.converters.DOMString,
			allowedValues: requestRedirect
		},
		{
			key: "integrity",
			converter: webidl.converters.DOMString
		},
		{
			key: "keepalive",
			converter: webidl.converters.boolean
		},
		{
			key: "signal",
			converter: webidl.nullableConverter((signal) => webidl.converters.AbortSignal(signal, "RequestInit", "signal"))
		},
		{
			key: "window",
			converter: webidl.converters.any
		},
		{
			key: "duplex",
			converter: webidl.converters.DOMString,
			allowedValues: requestDuplex
		},
		{
			key: "dispatcher",
			converter: webidl.converters.any
		},
		{
			key: "priority",
			converter: webidl.converters.DOMString,
			allowedValues: [
				"high",
				"low",
				"auto"
			],
			defaultValue: () => "auto"
		}
	]);
	module.exports = {
		Request,
		makeRequest,
		fromInnerRequest,
		cloneRequest,
		getRequestDispatcher,
		getRequestState,
		removeRequestAbortListener
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/web/subresource-integrity/subresource-integrity.js
var require_subresource_integrity = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const assert$6 = __require("node:assert");
	const { runtimeFeatures } = require_runtime_features();
	/**
	* @typedef {object} Metadata
	* @property {SRIHashAlgorithm} alg - The algorithm used for the hash.
	* @property {string} val - The base64-encoded hash value.
	*/
	/**
	* @typedef {Metadata[]} MetadataList
	*/
	/**
	* @typedef {('sha256' | 'sha384' | 'sha512')} SRIHashAlgorithm
	*/
	/**
	* @type {Map<SRIHashAlgorithm, number>}
	*
	* The valid SRI hash algorithm token set is the ordered set « "sha256",
	* "sha384", "sha512" » (corresponding to SHA-256, SHA-384, and SHA-512
	* respectively). The ordering of this set is meaningful, with stronger
	* algorithms appearing later in the set.
	*
	* @see https://w3c.github.io/webappsec-subresource-integrity/#valid-sri-hash-algorithm-token-set
	*/
	const validSRIHashAlgorithmTokenSet = /* @__PURE__ */ new Map([
		["sha256", 0],
		["sha384", 1],
		["sha512", 2]
	]);
	/** @type {import('node:crypto')} */
	let crypto;
	if (runtimeFeatures.has("crypto")) {
		crypto = __require("node:crypto");
		const cryptoHashes = crypto.getHashes();
		if (cryptoHashes.length === 0) validSRIHashAlgorithmTokenSet.clear();
		for (const algorithm of validSRIHashAlgorithmTokenSet.keys()) if (cryptoHashes.includes(algorithm) === false) validSRIHashAlgorithmTokenSet.delete(algorithm);
	} else validSRIHashAlgorithmTokenSet.clear();
	/**
	* @typedef GetSRIHashAlgorithmIndex
	* @type {(algorithm: SRIHashAlgorithm) => number}
	* @param {SRIHashAlgorithm} algorithm
	* @returns {number} The index of the algorithm in the valid SRI hash algorithm
	* token set.
	*/
	const getSRIHashAlgorithmIndex = Map.prototype.get.bind(validSRIHashAlgorithmTokenSet);
	/**
	* @typedef IsValidSRIHashAlgorithm
	* @type {(algorithm: string) => algorithm is SRIHashAlgorithm}
	* @param {*} algorithm
	* @returns {algorithm is SRIHashAlgorithm}
	*/
	const isValidSRIHashAlgorithm = Map.prototype.has.bind(validSRIHashAlgorithmTokenSet);
	/**
	* @param {Uint8Array} bytes
	* @param {string} metadataList
	* @returns {boolean}
	*
	* @see https://w3c.github.io/webappsec-subresource-integrity/#does-response-match-metadatalist
	*/
	const bytesMatch = runtimeFeatures.has("crypto") === false || validSRIHashAlgorithmTokenSet.size === 0 ? () => true : (bytes, metadataList) => {
		const parsedMetadata = parseMetadata(metadataList);
		if (parsedMetadata.length === 0) return true;
		const metadata = getStrongestMetadata(parsedMetadata);
		for (const item of metadata) {
			const algorithm = item.alg;
			const expectedValue = item.val;
			if (caseSensitiveMatch(applyAlgorithmToBytes(algorithm, bytes), expectedValue)) return true;
		}
		return false;
	};
	/**
	* @param {MetadataList} metadataList
	* @returns {MetadataList} The strongest hash algorithm from the metadata list.
	*/
	function getStrongestMetadata(metadataList) {
		const result = [];
		/** @type {Metadata|null} */
		let strongest = null;
		for (const item of metadataList) {
			assert$6(isValidSRIHashAlgorithm(item.alg), "Invalid SRI hash algorithm token");
			if (result.length === 0) {
				result.push(item);
				strongest = item;
				continue;
			}
			const currentAlgorithm = strongest.alg;
			const currentAlgorithmIndex = getSRIHashAlgorithmIndex(currentAlgorithm);
			const newAlgorithm = item.alg;
			const newAlgorithmIndex = getSRIHashAlgorithmIndex(newAlgorithm);
			if (newAlgorithmIndex < currentAlgorithmIndex) continue;
			else if (newAlgorithmIndex > currentAlgorithmIndex) {
				strongest = item;
				result[0] = item;
				result.length = 1;
			} else result.push(item);
		}
		return result;
	}
	/**
	* @param {string} metadata
	* @returns {MetadataList}
	*
	* @see https://w3c.github.io/webappsec-subresource-integrity/#parse-metadata
	*/
	function parseMetadata(metadata) {
		/** @type {MetadataList} */
		const result = [];
		for (const item of metadata.split(" ")) {
			const algorithmExpression = item.split("?", 1)[0];
			let base64Value = "";
			const algorithmAndValue = [algorithmExpression.slice(0, 6), algorithmExpression.slice(7)];
			const algorithm = algorithmAndValue[0];
			if (!isValidSRIHashAlgorithm(algorithm)) continue;
			if (algorithmAndValue[1]) base64Value = algorithmAndValue[1];
			const metadata = {
				alg: algorithm,
				val: base64Value
			};
			result.push(metadata);
		}
		return result;
	}
	/**
	* Applies the specified hash algorithm to the given bytes
	*
	* @typedef {(algorithm: SRIHashAlgorithm, bytes: Uint8Array) => string} ApplyAlgorithmToBytes
	* @param {SRIHashAlgorithm} algorithm
	* @param {Uint8Array} bytes
	* @returns {string}
	*/
	const applyAlgorithmToBytes = (algorithm, bytes) => {
		return crypto.hash(algorithm, bytes, "base64");
	};
	/**
	* Compares two base64 strings, allowing for base64url
	* in the second string.
	*
	* @param {string} actualValue base64 encoded string
	* @param {string} expectedValue base64 or base64url encoded string
	* @returns {boolean}
	*/
	function caseSensitiveMatch(actualValue, expectedValue) {
		let actualValueLength = actualValue.length;
		if (actualValueLength !== 0 && actualValue[actualValueLength - 1] === "=") actualValueLength -= 1;
		if (actualValueLength !== 0 && actualValue[actualValueLength - 1] === "=") actualValueLength -= 1;
		let expectedValueLength = expectedValue.length;
		if (expectedValueLength !== 0 && expectedValue[expectedValueLength - 1] === "=") expectedValueLength -= 1;
		if (expectedValueLength !== 0 && expectedValue[expectedValueLength - 1] === "=") expectedValueLength -= 1;
		if (actualValueLength !== expectedValueLength) return false;
		for (let i = 0; i < actualValueLength; ++i) {
			if (actualValue[i] === expectedValue[i] || actualValue[i] === "+" && expectedValue[i] === "-" || actualValue[i] === "/" && expectedValue[i] === "_") continue;
			return false;
		}
		return true;
	}
	module.exports = {
		applyAlgorithmToBytes,
		bytesMatch,
		caseSensitiveMatch,
		isValidSRIHashAlgorithm,
		getStrongestMetadata,
		parseMetadata
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/web/fetch/index.js
var require_fetch = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { makeNetworkError, makeAppropriateNetworkError, filterResponse, makeResponse, fromInnerResponse, getResponseState } = require_response();
	const { HeadersList } = require_headers();
	const { Request, cloneRequest, getRequestDispatcher, getRequestState, removeRequestAbortListener } = require_request();
	const zlib = __require("node:zlib");
	const { makePolicyContainer, clonePolicyContainer, requestBadPort, TAOCheck, appendRequestOriginHeader, responseLocationURL, requestCurrentURL, setRequestReferrerPolicyOnRedirect, tryUpgradeRequestToAPotentiallyTrustworthyURL, createOpaqueTimingInfo, appendFetchMetadata, corsCheck, crossOriginResourcePolicyCheck, determineRequestsReferrer, coarsenedSharedCurrentTime, sameOrigin, isCancelled, isAborted, isErrorLike, fullyReadBody, readableStreamClose, urlIsLocal, urlIsHttpHttpsScheme, urlHasHttpsScheme, clampAndCoarsenConnectionTimingInfo, simpleRangeHeaderValue, buildContentRange, createInflate, extractMimeType, hasAuthenticationEntry, includesCredentials, isTraversableNavigable } = require_util$4();
	const assert$5 = __require("node:assert");
	const { safelyExtractBody, extractBody } = require_body();
	const { redirectStatusSet, nullBodyStatus, safeMethodsSet, requestBodyHeader, subresourceSet } = require_constants$2();
	const EE = __require("node:events");
	const { Readable, pipeline: pipeline$1, finished, isErrored, isReadable } = __require("node:stream");
	const { addAbortListener, bufferToLowerCasedHeaderName } = require_util$5();
	const { dataURLProcessor, serializeAMimeType, minimizeSupportedMimeType } = require_data_url();
	const { getGlobalDispatcher } = require_global();
	const { webidl } = require_webidl();
	const { STATUS_CODES } = __require("node:http");
	const { bytesMatch } = require_subresource_integrity();
	const { isomorphicEncode } = require_infra();
	const GET_OR_HEAD = ["GET", "HEAD"];
	const defaultUserAgent = typeof __UNDICI_IS_NODE__ !== "undefined" || typeof esbuildDetection !== "undefined" ? "node" : "undici";
	/** @type {import('buffer').resolveObjectURL} */
	let resolveObjectURL;
	function appendHeadersListFromResponseHeaders(headersList, headers, rawHeaders) {
		if (Array.isArray(rawHeaders)) {
			for (let i = 0; i < rawHeaders.length; i += 2) {
				const nameStr = bufferToLowerCasedHeaderName(rawHeaders[i]);
				const value = rawHeaders[i + 1];
				if (Array.isArray(value) && !Buffer.isBuffer(value)) for (const val of value) headersList.append(nameStr, val.toString("latin1"), true);
				else headersList.append(nameStr, value.toString("latin1"), true);
			}
			return;
		}
		for (const [name, value] of Object.entries(headers ?? {})) if (Array.isArray(value)) for (const entry of value) headersList.append(name, `${entry}`, true);
		else headersList.append(name, `${value}`, true);
	}
	var Fetch = class extends EE {
		constructor(dispatcher) {
			super();
			this.dispatcher = dispatcher;
			this.connection = null;
			this.dump = false;
			this.state = "ongoing";
		}
		terminate(reason) {
			if (this.state !== "ongoing") return;
			this.state = "terminated";
			this.connection?.destroy(reason);
			this.emit("terminated", reason);
		}
		abort(error) {
			if (this.state !== "ongoing") return;
			this.state = "aborted";
			if (!error) error = new DOMException("The operation was aborted.", "AbortError");
			this.serializedAbortReason = error;
			this.connection?.destroy(error);
			this.emit("terminated", error);
		}
	};
	function handleFetchDone(response) {
		finalizeAndReportTiming(response, "fetch");
	}
	function fetch(input, init = void 0) {
		webidl.argumentLengthCheck(arguments, 1, "globalThis.fetch");
		let p = Promise.withResolvers();
		let requestObject;
		try {
			requestObject = new Request(input, init);
		} catch (e) {
			p.reject(e);
			return p.promise;
		}
		const request = getRequestState(requestObject);
		if (requestObject.signal.aborted) {
			abortFetch(p, request, null, requestObject.signal.reason, null);
			return p.promise;
		}
		if (request.client.globalObject?.constructor?.name === "ServiceWorkerGlobalScope") request.serviceWorkers = "none";
		let responseObject = null;
		let locallyAborted = false;
		let controller = null;
		const removeAbortListener = addAbortListener(requestObject.signal, () => {
			locallyAborted = true;
			assert$5(controller != null);
			controller.abort(requestObject.signal.reason);
			const realResponse = responseObject?.deref();
			abortFetch(p, request, realResponse, requestObject.signal.reason, controller.controller);
		});
		const cleanupAbortListeners = () => {
			removeAbortListener();
			removeRequestAbortListener(requestObject);
		};
		const processResponse = (response) => {
			if (locallyAborted) return;
			if (response.aborted) {
				abortFetch(p, request, responseObject, controller.serializedAbortReason, controller.controller);
				cleanupAbortListeners();
				return;
			}
			if (response.type === "error") {
				p.reject(new TypeError("fetch failed", { cause: response.error }));
				cleanupAbortListeners();
				return;
			}
			responseObject = new WeakRef(fromInnerResponse(response, "immutable"));
			p.resolve(responseObject.deref());
			p = null;
		};
		controller = fetching({
			request,
			processResponseEndOfBody: (response) => {
				handleFetchDone(response);
				cleanupAbortListeners();
			},
			processResponse,
			dispatcher: getRequestDispatcher(requestObject),
			requestObject
		});
		return p.promise;
	}
	function finalizeAndReportTiming(response, initiatorType = "other") {
		if (response.type === "error" && response.aborted) return;
		if (!response.urlList?.length) return;
		const originalURL = response.urlList[0];
		let timingInfo = response.timingInfo;
		let cacheState = response.cacheState;
		if (!urlIsHttpHttpsScheme(originalURL)) return;
		if (timingInfo === null) return;
		if (!response.timingAllowPassed) {
			timingInfo = createOpaqueTimingInfo({ startTime: timingInfo.startTime });
			cacheState = "";
		}
		timingInfo.endTime = coarsenedSharedCurrentTime();
		response.timingInfo = timingInfo;
		markResourceTiming(timingInfo, originalURL.href, initiatorType, globalThis, cacheState, "", response.status);
	}
	const markResourceTiming = performance.markResourceTiming;
	function abortFetch(p, request, responseObject, error, controller) {
		if (p) p.reject(error);
		if (request.body?.stream != null && isReadable(request.body.stream)) request.body.stream.cancel(error).catch((err) => {
			if (err.code === "ERR_INVALID_STATE") return;
			throw err;
		});
		if (responseObject == null) return;
		const response = getResponseState(responseObject);
		if (response.body?.stream != null && isReadable(response.body.stream)) controller.error(error);
	}
	function fetching({ request, processRequestBodyChunkLength, processRequestEndOfBody, processResponse, processResponseEndOfBody, processResponseConsumeBody, useParallelQueue = false, dispatcher = getGlobalDispatcher(), requestObject = null }) {
		assert$5(dispatcher);
		let taskDestination = null;
		let crossOriginIsolatedCapability = false;
		if (request.client != null) {
			taskDestination = request.client.globalObject;
			crossOriginIsolatedCapability = request.client.crossOriginIsolatedCapability;
		}
		const currentTime = coarsenedSharedCurrentTime(crossOriginIsolatedCapability);
		const timingInfo = createOpaqueTimingInfo({ startTime: currentTime });
		const fetchParams = {
			controller: new Fetch(dispatcher),
			request,
			timingInfo,
			processRequestBodyChunkLength,
			processRequestEndOfBody,
			processResponse,
			processResponseConsumeBody,
			processResponseEndOfBody,
			taskDestination,
			crossOriginIsolatedCapability,
			requestObject
		};
		assert$5(!request.body || request.body.stream);
		if (request.window === "client") request.window = request.client?.globalObject?.constructor?.name === "Window" ? request.client : "no-window";
		if (request.origin === "client") request.origin = request.client.origin;
		if (request.policyContainer === "client") {
			if (request.client != null) request.policyContainer = clonePolicyContainer(request.client.policyContainer);
			else request.policyContainer = makePolicyContainer();
		}
		if (!request.headersList.contains("accept", true)) request.headersList.append("accept", "*/*", true);
		if (!request.headersList.contains("accept-language", true)) request.headersList.append("accept-language", "*", true);
		if (request.priority === null) {}
		if (subresourceSet.has(request.destination)) {}
		mainFetch(fetchParams, false);
		return fetchParams.controller;
	}
	async function mainFetch(fetchParams, recursive) {
		try {
			const request = fetchParams.request;
			let response = null;
			if (request.localURLsOnly && !urlIsLocal(requestCurrentURL(request))) response = makeNetworkError("local URLs only");
			tryUpgradeRequestToAPotentiallyTrustworthyURL(request);
			if (requestBadPort(request) === "blocked") response = makeNetworkError("bad port");
			if (request.referrerPolicy === "") request.referrerPolicy = request.policyContainer.referrerPolicy;
			if (request.referrer !== "no-referrer") request.referrer = determineRequestsReferrer(request);
			if (response === null) {
				const currentURL = requestCurrentURL(request);
				if (sameOrigin(currentURL, request.url) && request.responseTainting === "basic" || currentURL.protocol === "data:" || request.mode === "navigate" || request.mode === "websocket") {
					request.responseTainting = "basic";
					response = await schemeFetch(fetchParams);
				} else if (request.mode === "same-origin") response = makeNetworkError("request mode cannot be \"same-origin\"");
				else if (request.mode === "no-cors") {
					if (request.redirect !== "follow") response = makeNetworkError("redirect mode cannot be \"follow\" for \"no-cors\" request");
					else {
						request.responseTainting = "opaque";
						response = await schemeFetch(fetchParams);
					}
				} else if (!urlIsHttpHttpsScheme(requestCurrentURL(request))) response = makeNetworkError("URL scheme must be a HTTP(S) scheme");
				else {
					request.responseTainting = "cors";
					response = await httpFetch(fetchParams);
				}
			}
			if (recursive) return response;
			if (response.status !== 0 && !response.internalResponse) {
				if (request.responseTainting === "cors") {}
				if (request.responseTainting === "basic") response = filterResponse(response, "basic");
				else if (request.responseTainting === "cors") response = filterResponse(response, "cors");
				else if (request.responseTainting === "opaque") response = filterResponse(response, "opaque");
				else assert$5(false);
			}
			let internalResponse = response.status === 0 ? response : response.internalResponse;
			if (internalResponse.urlList.length === 0) internalResponse.urlList.push(...request.urlList);
			if (!request.timingAllowFailed) response.timingAllowPassed = true;
			if (response.type === "opaque" && internalResponse.status === 206 && internalResponse.rangeRequested && !request.headers.contains("range", true)) response = internalResponse = makeNetworkError();
			if (response.status !== 0 && (request.method === "HEAD" || request.method === "CONNECT" || nullBodyStatus.includes(internalResponse.status))) {
				internalResponse.body = null;
				fetchParams.controller.dump = true;
			}
			if (request.integrity) {
				const processBodyError = (reason) => fetchFinale(fetchParams, makeNetworkError(reason));
				if (request.responseTainting === "opaque" || response.body == null) {
					processBodyError(response.error);
					return;
				}
				const processBody = (bytes) => {
					if (!bytesMatch(bytes, request.integrity)) {
						processBodyError("integrity mismatch");
						return;
					}
					response.body = safelyExtractBody(bytes)[0];
					fetchFinale(fetchParams, response);
				};
				fullyReadBody(response.body, processBody, processBodyError);
			} else fetchFinale(fetchParams, response);
		} catch (err) {
			fetchParams.controller.terminate(err);
		}
	}
	function schemeFetch(fetchParams) {
		if (isCancelled(fetchParams) && fetchParams.request.redirectCount === 0) return Promise.resolve(makeAppropriateNetworkError(fetchParams));
		const { request } = fetchParams;
		const { protocol: scheme } = requestCurrentURL(request);
		switch (scheme) {
			case "about:": return Promise.resolve(makeNetworkError("about scheme is not supported"));
			case "blob:": {
				if (!resolveObjectURL) resolveObjectURL = __require("node:buffer").resolveObjectURL;
				const blobURLEntry = requestCurrentURL(request);
				if (blobURLEntry.search.length !== 0) return Promise.resolve(makeNetworkError("NetworkError when attempting to fetch resource."));
				const blob = resolveObjectURL(blobURLEntry.toString());
				if (request.method !== "GET" || !webidl.is.Blob(blob)) return Promise.resolve(makeNetworkError("invalid method"));
				const response = makeResponse();
				const fullLength = blob.size;
				const serializedFullLength = isomorphicEncode(`${fullLength}`);
				const type = blob.type;
				if (!request.headersList.contains("range", true)) {
					const bodyWithType = extractBody(blob);
					response.statusText = "OK";
					response.body = bodyWithType[0];
					response.headersList.set("content-length", serializedFullLength, true);
					response.headersList.set("content-type", type, true);
				} else {
					response.rangeRequested = true;
					const rangeHeader = request.headersList.get("range", true);
					const rangeValue = simpleRangeHeaderValue(rangeHeader, true);
					if (rangeValue === "failure") return Promise.resolve(makeNetworkError("failed to fetch the data URL"));
					let { rangeStartValue: rangeStart, rangeEndValue: rangeEnd } = rangeValue;
					if (rangeStart === null) {
						rangeStart = fullLength - rangeEnd;
						rangeEnd = rangeStart + rangeEnd - 1;
					} else {
						if (rangeStart >= fullLength) return Promise.resolve(makeNetworkError("Range start is greater than the blob's size."));
						if (rangeEnd === null || rangeEnd >= fullLength) rangeEnd = fullLength - 1;
					}
					const slicedBlob = blob.slice(rangeStart, rangeEnd + 1, type);
					response.body = extractBody(slicedBlob)[0];
					const serializedSlicedLength = isomorphicEncode(`${slicedBlob.size}`);
					const contentRange = buildContentRange(rangeStart, rangeEnd, fullLength);
					response.status = 206;
					response.statusText = "Partial Content";
					response.headersList.set("content-length", serializedSlicedLength, true);
					response.headersList.set("content-type", type, true);
					response.headersList.set("content-range", contentRange, true);
				}
				return Promise.resolve(response);
			}
			case "data:": {
				const currentURL = requestCurrentURL(request);
				const dataURLStruct = dataURLProcessor(currentURL);
				if (dataURLStruct === "failure") return Promise.resolve(makeNetworkError("failed to fetch the data URL"));
				const mimeType = serializeAMimeType(dataURLStruct.mimeType);
				return Promise.resolve(makeResponse({
					statusText: "OK",
					headersList: [["content-type", {
						name: "Content-Type",
						value: mimeType
					}]],
					body: safelyExtractBody(dataURLStruct.body)[0]
				}));
			}
			case "file:": return Promise.resolve(makeNetworkError("not implemented... yet..."));
			case "http:":
			case "https:": return httpFetch(fetchParams).catch((err) => makeNetworkError(err));
			default: return Promise.resolve(makeNetworkError("unknown scheme"));
		}
	}
	function finalizeResponse(fetchParams, response) {
		fetchParams.request.done = true;
		if (fetchParams.processResponseDone != null) queueMicrotask(() => fetchParams.processResponseDone(response));
	}
	function fetchFinale(fetchParams, response) {
		let timingInfo = fetchParams.timingInfo;
		const processResponseEndOfBody = () => {
			const unsafeEndTime = Date.now();
			if (fetchParams.request.destination === "document") fetchParams.controller.fullTimingInfo = timingInfo;
			fetchParams.controller.reportTimingSteps = () => {
				if (!urlIsHttpHttpsScheme(fetchParams.request.url)) return;
				timingInfo.endTime = unsafeEndTime;
				let cacheState = response.cacheState;
				const bodyInfo = response.bodyInfo;
				if (!response.timingAllowPassed) {
					timingInfo = createOpaqueTimingInfo(timingInfo);
					cacheState = "";
				}
				let responseStatus = 0;
				if (fetchParams.request.mode !== "navigate" || !response.hasCrossOriginRedirects) {
					responseStatus = response.status;
					const mimeType = extractMimeType(response.headersList);
					if (mimeType !== "failure") bodyInfo.contentType = minimizeSupportedMimeType(mimeType);
				}
				if (fetchParams.request.initiatorType != null) markResourceTiming(timingInfo, fetchParams.request.url.href, fetchParams.request.initiatorType, globalThis, cacheState, bodyInfo, responseStatus);
			};
			const processResponseEndOfBodyTask = () => {
				fetchParams.request.done = true;
				if (fetchParams.processResponseEndOfBody != null) queueMicrotask(() => fetchParams.processResponseEndOfBody(response));
				if (fetchParams.request.initiatorType != null) fetchParams.controller.reportTimingSteps();
			};
			queueMicrotask(() => processResponseEndOfBodyTask());
		};
		if (fetchParams.processResponse != null) queueMicrotask(() => {
			fetchParams.processResponse(response);
			fetchParams.processResponse = null;
		});
		const internalResponse = response.type === "error" ? response : response.internalResponse ?? response;
		if (internalResponse.body == null) processResponseEndOfBody();
		else finished(internalResponse.body.stream, () => {
			processResponseEndOfBody();
		});
	}
	async function httpFetch(fetchParams) {
		const request = fetchParams.request;
		let response = null;
		let actualResponse = null;
		const timingInfo = fetchParams.timingInfo;
		if (request.serviceWorkers === "all") {}
		if (response === null) {
			if (request.redirect === "follow") request.serviceWorkers = "none";
			actualResponse = response = await httpNetworkOrCacheFetch(fetchParams);
			if (request.responseTainting === "cors" && corsCheck(request, response) === "failure") return makeNetworkError("cors failure");
			if (TAOCheck(request, response) === "failure") request.timingAllowFailed = true;
		}
		if ((request.responseTainting === "opaque" || response.type === "opaque") && crossOriginResourcePolicyCheck(request.origin, request.client, request.destination, actualResponse) === "blocked") return makeNetworkError("blocked");
		if (redirectStatusSet.has(actualResponse.status)) {
			if (request.redirect !== "manual") fetchParams.controller.connection.destroy(void 0, false);
			if (request.redirect === "error") response = makeNetworkError("unexpected redirect");
			else if (request.redirect === "manual") response = actualResponse;
			else if (request.redirect === "follow") response = await httpRedirectFetch(fetchParams, response);
			else assert$5(false);
		}
		response.timingInfo = timingInfo;
		return response;
	}
	function httpRedirectFetch(fetchParams, response) {
		const request = fetchParams.request;
		const actualResponse = response.internalResponse ? response.internalResponse : response;
		let locationURL;
		try {
			locationURL = responseLocationURL(actualResponse, requestCurrentURL(request).hash);
			if (locationURL == null) return response;
		} catch (err) {
			return Promise.resolve(makeNetworkError(err));
		}
		if (!urlIsHttpHttpsScheme(locationURL)) return Promise.resolve(makeNetworkError("URL scheme must be a HTTP(S) scheme"));
		if (request.redirectCount === 20) return Promise.resolve(makeNetworkError("redirect count exceeded"));
		request.redirectCount += 1;
		if (request.mode === "cors" && (locationURL.username || locationURL.password) && !sameOrigin(request, locationURL)) return Promise.resolve(makeNetworkError("cross origin not allowed for request mode \"cors\""));
		if (request.responseTainting === "cors" && (locationURL.username || locationURL.password)) return Promise.resolve(makeNetworkError("URL cannot contain credentials for request mode \"cors\""));
		if (actualResponse.status !== 303 && request.body != null && request.body.source == null) return Promise.resolve(makeNetworkError());
		if ([301, 302].includes(actualResponse.status) && request.method === "POST" || actualResponse.status === 303 && !GET_OR_HEAD.includes(request.method)) {
			request.method = "GET";
			request.body = null;
			for (const headerName of requestBodyHeader) request.headersList.delete(headerName);
		}
		if (!sameOrigin(requestCurrentURL(request), locationURL)) {
			request.headersList.delete("authorization", true);
			request.headersList.delete("proxy-authorization", true);
			request.headersList.delete("cookie", true);
			request.headersList.delete("host", true);
		}
		if (request.body != null) {
			assert$5(request.body.source != null);
			request.body = safelyExtractBody(request.body.source)[0];
		}
		const timingInfo = fetchParams.timingInfo;
		timingInfo.redirectEndTime = timingInfo.postRedirectStartTime = coarsenedSharedCurrentTime(fetchParams.crossOriginIsolatedCapability);
		if (timingInfo.redirectStartTime === 0) timingInfo.redirectStartTime = timingInfo.startTime;
		request.urlList.push(locationURL);
		setRequestReferrerPolicyOnRedirect(request, actualResponse);
		return mainFetch(fetchParams, true);
	}
	async function httpNetworkOrCacheFetch(fetchParams, isAuthenticationFetch = false, isNewConnectionFetch = false) {
		const request = fetchParams.request;
		let httpFetchParams = null;
		let httpRequest = null;
		let response = null;
		if (request.window === "no-window" && request.redirect === "error") {
			httpFetchParams = fetchParams;
			httpRequest = request;
		} else {
			if (request.body?.source != null) httpRequest = cloneRequest(request);
			else {
				httpRequest = cloneRequest({
					...request,
					body: null
				});
				httpRequest.body = request.body;
			}
			httpFetchParams = { ...fetchParams };
			httpFetchParams.request = httpRequest;
		}
		const includeCredentials = request.credentials === "include" || request.credentials === "same-origin" && request.responseTainting === "basic";
		const contentLength = httpRequest.body ? httpRequest.body.length : null;
		let contentLengthHeaderValue = null;
		if (httpRequest.body == null && ["POST", "PUT"].includes(httpRequest.method)) contentLengthHeaderValue = "0";
		if (contentLength != null) contentLengthHeaderValue = isomorphicEncode(`${contentLength}`);
		if (contentLengthHeaderValue != null && !httpRequest.headersList.contains("content-length", true)) httpRequest.headersList.append("content-length", contentLengthHeaderValue, true);
		if (contentLength != null && httpRequest.keepalive) {}
		if (webidl.is.URL(httpRequest.referrer)) httpRequest.headersList.append("referer", isomorphicEncode(httpRequest.referrer.href), true);
		appendRequestOriginHeader(httpRequest);
		appendFetchMetadata(httpRequest);
		if (!httpRequest.headersList.contains("user-agent", true)) httpRequest.headersList.append("user-agent", defaultUserAgent, true);
		if (httpRequest.cache === "default" && (httpRequest.headersList.contains("if-modified-since", true) || httpRequest.headersList.contains("if-none-match", true) || httpRequest.headersList.contains("if-unmodified-since", true) || httpRequest.headersList.contains("if-match", true) || httpRequest.headersList.contains("if-range", true))) httpRequest.cache = "no-store";
		if (httpRequest.cache === "no-cache" && !httpRequest.preventNoCacheCacheControlHeaderModification && !httpRequest.headersList.contains("cache-control", true)) httpRequest.headersList.append("cache-control", "max-age=0", true);
		if (httpRequest.cache === "no-store" || httpRequest.cache === "reload") {
			if (!httpRequest.headersList.contains("pragma", true)) httpRequest.headersList.append("pragma", "no-cache", true);
			if (!httpRequest.headersList.contains("cache-control", true)) httpRequest.headersList.append("cache-control", "no-cache", true);
		}
		if (httpRequest.headersList.contains("range", true)) httpRequest.headersList.append("accept-encoding", "identity", true);
		if (!httpRequest.headersList.contains("accept-encoding", true)) {
			if (urlHasHttpsScheme(requestCurrentURL(httpRequest))) httpRequest.headersList.append("accept-encoding", "br, gzip, deflate, zstd", true);
			else httpRequest.headersList.append("accept-encoding", "gzip, deflate", true);
		}
		httpRequest.headersList.delete("host", true);
		if (includeCredentials) {
			if (!httpRequest.headersList.contains("authorization", true)) {
				let authorizationValue = null;
				if (hasAuthenticationEntry(httpRequest) && (httpRequest.useURLCredentials === void 0 || !includesCredentials(requestCurrentURL(httpRequest)))) {} else if (includesCredentials(requestCurrentURL(httpRequest)) && isAuthenticationFetch) {
					const { username, password } = requestCurrentURL(httpRequest);
					authorizationValue = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
				}
				if (authorizationValue !== null) httpRequest.headersList.append("Authorization", authorizationValue, false);
			}
		}
		httpRequest.cache = "no-store";
		if (httpRequest.cache !== "no-store" && httpRequest.cache !== "reload") {}
		if (response == null) {
			if (httpRequest.cache === "only-if-cached") return makeNetworkError("only if cached");
			const forwardResponse = await httpNetworkFetch(httpFetchParams, includeCredentials, isNewConnectionFetch);
			if (!safeMethodsSet.has(httpRequest.method) && forwardResponse.status >= 200 && forwardResponse.status <= 399) {}
			if (response == null) response = forwardResponse;
		}
		response.urlList = [...httpRequest.urlList];
		if (httpRequest.headersList.contains("range", true)) response.rangeRequested = true;
		response.requestIncludesCredentials = includeCredentials;
		if (response.status === 401 && httpRequest.responseTainting !== "cors" && includeCredentials && (request.useURLCredentials !== void 0 || isTraversableNavigable(request.traversableForUserPrompts))) {
			if (request.body != null) {
				if (request.body.source == null) return response;
				request.body = safelyExtractBody(request.body.source)[0];
			}
			if (request.useURLCredentials === void 0 || isAuthenticationFetch) {
				if (isCancelled(fetchParams)) return makeAppropriateNetworkError(fetchParams);
				return response;
			}
			fetchParams.controller.connection.destroy();
			response = await httpNetworkOrCacheFetch(fetchParams, true);
		}
		if (response.status === 407) {
			if (request.window === "no-window") return makeNetworkError();
			if (isCancelled(fetchParams)) return makeAppropriateNetworkError(fetchParams);
			return makeNetworkError("proxy authentication required");
		}
		if (response.status === 421 && !isNewConnectionFetch && (request.body == null || request.body.source != null)) {
			if (isCancelled(fetchParams)) return makeAppropriateNetworkError(fetchParams);
			fetchParams.controller.connection.destroy();
			response = await httpNetworkOrCacheFetch(fetchParams, isAuthenticationFetch, true);
		}
		if (isAuthenticationFetch) {}
		return response;
	}
	async function httpNetworkFetch(fetchParams, includeCredentials = false, forceNewConnection = false) {
		assert$5(!fetchParams.controller.connection || fetchParams.controller.connection.destroyed);
		fetchParams.controller.connection = {
			abort: null,
			destroyed: false,
			destroy(err, abort = true) {
				if (!this.destroyed) {
					this.destroyed = true;
					if (abort) this.abort?.(err ?? new DOMException("The operation was aborted.", "AbortError"));
				}
			}
		};
		const request = fetchParams.request;
		let response = null;
		const timingInfo = fetchParams.timingInfo;
		request.cache = "no-store";
		if (request.mode === "websocket") {}
		let requestBody = null;
		if (request.body == null && fetchParams.processRequestEndOfBody) queueMicrotask(() => fetchParams.processRequestEndOfBody());
		else if (request.body != null) {
			const processBodyChunk = async function* (bytes) {
				if (isCancelled(fetchParams)) return;
				yield bytes;
				fetchParams.processRequestBodyChunkLength?.(bytes.byteLength);
			};
			const processEndOfBody = () => {
				if (isCancelled(fetchParams)) return;
				if (fetchParams.processRequestEndOfBody) fetchParams.processRequestEndOfBody();
			};
			const processBodyError = (e) => {
				if (isCancelled(fetchParams)) return;
				if (e.name === "AbortError") fetchParams.controller.abort();
				else fetchParams.controller.terminate(e);
			};
			requestBody = (async function* () {
				try {
					for await (const bytes of request.body.stream) yield* processBodyChunk(bytes);
					processEndOfBody();
				} catch (err) {
					processBodyError(err);
				}
			})();
		}
		try {
			const { body, status, statusText, headersList, socket } = await dispatch({ body: requestBody });
			if (socket) response = makeResponse({
				status,
				statusText,
				headersList,
				socket
			});
			else {
				const iterator = body[Symbol.asyncIterator]();
				fetchParams.controller.next = () => iterator.next();
				response = makeResponse({
					status,
					statusText,
					headersList
				});
			}
		} catch (err) {
			if (err.name === "AbortError") {
				fetchParams.controller.connection.destroy();
				return makeAppropriateNetworkError(fetchParams, err);
			}
			return makeNetworkError(err);
		}
		const pullAlgorithm = () => {
			return fetchParams.controller.resume();
		};
		const cancelAlgorithm = (reason) => {
			if (!isCancelled(fetchParams)) fetchParams.controller.abort(reason);
		};
		const stream = new ReadableStream({
			start(controller) {
				fetchParams.controller.controller = controller;
			},
			pull: pullAlgorithm,
			cancel: cancelAlgorithm,
			type: "bytes"
		});
		response.body = {
			stream,
			source: null,
			length: null
		};
		if (!fetchParams.controller.resume) fetchParams.controller.on("terminated", onAborted);
		fetchParams.controller.resume = async () => {
			while (true) {
				let bytes;
				let isFailure;
				try {
					const { done, value } = await fetchParams.controller.next();
					if (isAborted(fetchParams)) break;
					bytes = done ? void 0 : value;
				} catch (err) {
					if (fetchParams.controller.ended && !timingInfo.encodedBodySize) bytes = void 0;
					else {
						bytes = err;
						isFailure = true;
					}
				}
				if (bytes === void 0) {
					readableStreamClose(fetchParams.controller.controller);
					finalizeResponse(fetchParams, response);
					return;
				}
				timingInfo.decodedBodySize += bytes?.byteLength ?? 0;
				if (isFailure) {
					fetchParams.controller.terminate(bytes);
					return;
				}
				const buffer = new Uint8Array(bytes);
				if (buffer.byteLength) fetchParams.controller.controller.enqueue(buffer);
				if (isErrored(stream)) {
					fetchParams.controller.terminate();
					return;
				}
				if (fetchParams.controller.controller.desiredSize <= 0) return;
			}
		};
		function onAborted(reason) {
			if (isAborted(fetchParams)) {
				response.aborted = true;
				if (isReadable(stream)) fetchParams.controller.controller.error(fetchParams.controller.serializedAbortReason);
			} else if (isReadable(stream)) fetchParams.controller.controller.error(new TypeError("terminated", { cause: isErrorLike(reason) ? reason : void 0 }));
			fetchParams.controller.connection.destroy();
		}
		return response;
		function dispatch({ body }) {
			const url = requestCurrentURL(request);
			/** @type {import('../../..').Agent} */
			const agent = fetchParams.controller.dispatcher;
			const path = url.pathname + url.search;
			const hasTrailingQuestionMark = url.search.length === 0 && url.href[url.href.length - url.hash.length - 1] === "?";
			return dispatchWithProtocolPreference(body);
			function dispatchWithProtocolPreference(body, allowH2) {
				return new Promise((resolve, reject) => agent.dispatch({
					path: hasTrailingQuestionMark ? `${path}?` : path,
					origin: url.origin,
					method: request.method,
					body: agent.isMockActive ? request.body && (request.body.source || request.body.stream) : body,
					__mockAgentBodyForDispatch: body,
					headers: request.headersList.entries,
					maxRedirections: 0,
					upgrade: request.mode === "websocket" ? "websocket" : void 0,
					...allowH2 === false ? { allowH2 } : null
				}, {
					body: null,
					abort: null,
					onRequestStart(controller) {
						const { connection } = fetchParams.controller;
						timingInfo.finalConnectionTimingInfo = clampAndCoarsenConnectionTimingInfo(void 0, timingInfo.postRedirectStartTime, fetchParams.crossOriginIsolatedCapability);
						const abort = (reason) => controller.abort(reason);
						if (connection.destroyed) abort(new DOMException("The operation was aborted.", "AbortError"));
						else {
							fetchParams.controller.on("terminated", abort);
							this.abort = connection.abort = abort;
						}
						timingInfo.finalNetworkRequestStartTime = coarsenedSharedCurrentTime(fetchParams.crossOriginIsolatedCapability);
					},
					onResponseStarted() {
						timingInfo.finalNetworkResponseStartTime = coarsenedSharedCurrentTime(fetchParams.crossOriginIsolatedCapability);
					},
					onResponseStart(controller, status, headers, statusText) {
						if (status < 200) return;
						const rawHeaders = controller?.rawHeaders ?? [];
						const headersList = new HeadersList();
						appendHeadersListFromResponseHeaders(headersList, headers, rawHeaders);
						const location = headersList.get("location", true);
						this.body = new Readable({ read: () => controller.resume() });
						const willFollow = location && request.redirect === "follow" && redirectStatusSet.has(status);
						const decoders = [];
						if (request.method !== "HEAD" && request.method !== "CONNECT" && !nullBodyStatus.includes(status) && !willFollow) {
							const contentEncoding = headersList.get("content-encoding", true);
							/** @type {string[]} */
							const codings = contentEncoding ? contentEncoding.toLowerCase().split(",") : [];
							const maxContentEncodings = 5;
							if (codings.length > maxContentEncodings) {
								reject(/* @__PURE__ */ new Error(`too many content-encodings in response: ${codings.length}, maximum allowed is ${maxContentEncodings}`));
								return;
							}
							for (let i = codings.length - 1; i >= 0; --i) {
								const coding = codings[i].trim();
								if (coding === "x-gzip" || coding === "gzip") decoders.push(zlib.createGunzip({
									flush: zlib.constants.Z_SYNC_FLUSH,
									finishFlush: zlib.constants.Z_SYNC_FLUSH
								}));
								else if (coding === "deflate") decoders.push(createInflate({
									flush: zlib.constants.Z_SYNC_FLUSH,
									finishFlush: zlib.constants.Z_SYNC_FLUSH
								}));
								else if (coding === "br") decoders.push(zlib.createBrotliDecompress({
									flush: zlib.constants.BROTLI_OPERATION_FLUSH,
									finishFlush: zlib.constants.BROTLI_OPERATION_FLUSH
								}));
								else if (coding === "zstd") decoders.push(zlib.createZstdDecompress({
									flush: zlib.constants.ZSTD_e_continue,
									finishFlush: zlib.constants.ZSTD_e_end
								}));
								else {
									decoders.length = 0;
									break;
								}
							}
						}
						const onError = (err) => this.onResponseError(controller, err);
						resolve({
							status,
							statusText,
							headersList,
							body: decoders.length ? pipeline$1(this.body, ...decoders, (err) => {
								if (err) this.onResponseError(controller, err);
							}).on("error", onError) : this.body.on("error", onError)
						});
					},
					onResponseData(controller, chunk) {
						if (fetchParams.controller.dump) return;
						const bytes = chunk;
						timingInfo.encodedBodySize += bytes.byteLength;
						if (this.body.push(bytes) === false) controller.pause();
					},
					onResponseEnd() {
						if (this.abort) fetchParams.controller.off("terminated", this.abort);
						fetchParams.controller.ended = true;
						this.body?.push(null);
					},
					onResponseError(_controller, error) {
						if (this.abort) fetchParams.controller.off("terminated", this.abort);
						if (request.mode === "websocket" && allowH2 !== false && error?.code === "UND_ERR_INFO" && error?.message === "HTTP/2: Extended CONNECT protocol not supported by server") {
							resolve(dispatchWithProtocolPreference(body, false));
							return;
						}
						this.body?.destroy(error);
						fetchParams.controller.terminate(error);
						reject(error);
					},
					onRequestUpgrade(controller, status, headers, socket) {
						if (socket.session != null && status !== 200 || socket.session == null && status !== 101) return false;
						const rawHeaders = controller?.rawHeaders ?? [];
						const headersList = new HeadersList();
						appendHeadersListFromResponseHeaders(headersList, headers, rawHeaders);
						resolve({
							status,
							statusText: STATUS_CODES[status],
							headersList,
							socket
						});
						return true;
					}
				}));
			}
		}
	}
	module.exports = {
		fetch,
		Fetch,
		fetching,
		finalizeAndReportTiming
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/web/cache/util.js
var require_util$3 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const assert$4 = __require("node:assert");
	const { URLSerializer } = require_data_url();
	const { isValidHeaderName } = require_util$4();
	/**
	* @see https://url.spec.whatwg.org/#concept-url-equals
	* @param {URL} A
	* @param {URL} B
	* @param {boolean | undefined} excludeFragment
	* @returns {boolean}
	*/
	function urlEquals(A, B, excludeFragment = false) {
		return URLSerializer(A, excludeFragment) === URLSerializer(B, excludeFragment);
	}
	/**
	* @see https://github.com/chromium/chromium/blob/694d20d134cb553d8d89e5500b9148012b1ba299/content/browser/cache_storage/cache_storage_cache.cc#L260-L262
	* @param {string} header
	*/
	function getFieldValues(header) {
		assert$4(header !== null);
		const values = [];
		for (let value of header.split(",")) {
			value = value.trim();
			if (isValidHeaderName(value)) values.push(value);
		}
		return values;
	}
	module.exports = {
		urlEquals,
		getFieldValues
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/web/cache/cache.js
var require_cache = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const assert$3 = __require("node:assert");
	const { kConstruct } = require_symbols();
	const { urlEquals, getFieldValues } = require_util$3();
	const { kEnumerableProperty, isDisturbed } = require_util$5();
	const { webidl } = require_webidl();
	const { cloneResponse, fromInnerResponse, getResponseState } = require_response();
	const { Request, fromInnerRequest, getRequestState } = require_request();
	const { fetching } = require_fetch();
	const { urlIsHttpHttpsScheme, readAllBytes } = require_util$4();
	/**
	* @see https://w3c.github.io/ServiceWorker/#dfn-cache-batch-operation
	* @typedef {Object} CacheBatchOperation
	* @property {'delete' | 'put'} type
	* @property {any} request
	* @property {any} response
	* @property {import('../../../types/cache').CacheQueryOptions} options
	*/
	/**
	* @see https://w3c.github.io/ServiceWorker/#dfn-request-response-list
	* @typedef {[any, any][]} requestResponseList
	*/
	var Cache = class Cache {
		/**
		* @see https://w3c.github.io/ServiceWorker/#dfn-relevant-request-response-list
		* @type {requestResponseList}
		*/
		#relevantRequestResponseList;
		constructor() {
			if (arguments[0] !== kConstruct) webidl.illegalConstructor();
			webidl.util.markAsUncloneable(this);
			this.#relevantRequestResponseList = arguments[1];
		}
		async match(request, options = {}) {
			webidl.brandCheck(this, Cache);
			const prefix = "Cache.match";
			webidl.argumentLengthCheck(arguments, 1, prefix);
			request = webidl.converters.RequestInfo(request);
			options = webidl.converters.CacheQueryOptions(options, prefix, "options");
			const p = this.#internalMatchAll(request, options, 1);
			if (p.length === 0) return;
			return p[0];
		}
		async matchAll(request = void 0, options = {}) {
			webidl.brandCheck(this, Cache);
			const prefix = "Cache.matchAll";
			if (request !== void 0) request = webidl.converters.RequestInfo(request);
			options = webidl.converters.CacheQueryOptions(options, prefix, "options");
			return this.#internalMatchAll(request, options);
		}
		async add(request) {
			webidl.brandCheck(this, Cache);
			webidl.argumentLengthCheck(arguments, 1, "Cache.add");
			request = webidl.converters.RequestInfo(request);
			const requests = [request];
			return await this.addAll(requests);
		}
		async addAll(requests) {
			webidl.brandCheck(this, Cache);
			const prefix = "Cache.addAll";
			webidl.argumentLengthCheck(arguments, 1, prefix);
			const responsePromises = [];
			const requestList = [];
			for (let request of requests) {
				if (request === void 0) throw webidl.errors.conversionFailed({
					prefix,
					argument: "Argument 1",
					types: ["undefined is not allowed"]
				});
				request = webidl.converters.RequestInfo(request);
				if (typeof request === "string") continue;
				const r = getRequestState(request);
				if (!urlIsHttpHttpsScheme(r.url) || r.method !== "GET") throw webidl.errors.exception({
					header: prefix,
					message: "Expected http/s scheme when method is not GET."
				});
			}
			/** @type {ReturnType<typeof fetching>[]} */
			const fetchControllers = [];
			for (const request of requests) {
				const r = getRequestState(new Request(request));
				if (!urlIsHttpHttpsScheme(r.url)) throw webidl.errors.exception({
					header: prefix,
					message: "Expected http/s scheme."
				});
				r.initiator = "fetch";
				r.destination = "subresource";
				requestList.push(r);
				const responsePromise = Promise.withResolvers();
				fetchControllers.push(fetching({
					request: r,
					processResponse(response) {
						if (response.type === "error" || response.status === 206 || response.status < 200 || response.status > 299) responsePromise.reject(webidl.errors.exception({
							header: "Cache.addAll",
							message: "Received an invalid status code or the request failed."
						}));
						else if (response.headersList.contains("vary")) {
							const fieldValues = getFieldValues(response.headersList.get("vary"));
							for (const fieldValue of fieldValues) if (fieldValue === "*") {
								responsePromise.reject(webidl.errors.exception({
									header: "Cache.addAll",
									message: "invalid vary field value"
								}));
								for (const controller of fetchControllers) controller.abort();
								return;
							}
						}
					},
					processResponseEndOfBody(response) {
						if (response.aborted) {
							responsePromise.reject(new DOMException("aborted", "AbortError"));
							return;
						}
						responsePromise.resolve(response);
					}
				}));
				responsePromises.push(responsePromise.promise);
			}
			const responses = await Promise.all(responsePromises);
			const operations = [];
			let index = 0;
			for (const response of responses) {
				/** @type {CacheBatchOperation} */
				const operation = {
					type: "put",
					request: requestList[index],
					response
				};
				operations.push(operation);
				index++;
			}
			const cacheJobPromise = Promise.withResolvers();
			let errorData = null;
			try {
				this.#batchCacheOperations(operations);
			} catch (e) {
				errorData = e;
			}
			queueMicrotask(() => {
				if (errorData === null) cacheJobPromise.resolve(void 0);
				else cacheJobPromise.reject(errorData);
			});
			return cacheJobPromise.promise;
		}
		async put(request, response) {
			webidl.brandCheck(this, Cache);
			const prefix = "Cache.put";
			webidl.argumentLengthCheck(arguments, 2, prefix);
			request = webidl.converters.RequestInfo(request);
			response = webidl.converters.Response(response, prefix, "response");
			let innerRequest = null;
			if (webidl.is.Request(request)) innerRequest = getRequestState(request);
			else innerRequest = getRequestState(new Request(request));
			if (!urlIsHttpHttpsScheme(innerRequest.url) || innerRequest.method !== "GET") throw webidl.errors.exception({
				header: prefix,
				message: "Expected an http/s scheme when method is not GET"
			});
			const innerResponse = getResponseState(response);
			if (innerResponse.status === 206) throw webidl.errors.exception({
				header: prefix,
				message: "Got 206 status"
			});
			if (innerResponse.headersList.contains("vary")) {
				const fieldValues = getFieldValues(innerResponse.headersList.get("vary"));
				for (const fieldValue of fieldValues) if (fieldValue === "*") throw webidl.errors.exception({
					header: prefix,
					message: "Got * vary field value"
				});
			}
			if (innerResponse.body && (isDisturbed(innerResponse.body.stream) || innerResponse.body.stream.locked)) throw webidl.errors.exception({
				header: prefix,
				message: "Response body is locked or disturbed"
			});
			const clonedResponse = cloneResponse(innerResponse);
			const bodyReadPromise = Promise.withResolvers();
			if (innerResponse.body != null) {
				const reader = innerResponse.body.stream.getReader();
				readAllBytes(reader, bodyReadPromise.resolve, bodyReadPromise.reject);
			} else bodyReadPromise.resolve(void 0);
			/** @type {CacheBatchOperation[]} */
			const operations = [];
			/** @type {CacheBatchOperation} */
			const operation = {
				type: "put",
				request: innerRequest,
				response: clonedResponse
			};
			operations.push(operation);
			const bytes = await bodyReadPromise.promise;
			if (clonedResponse.body != null) clonedResponse.body.source = bytes;
			const cacheJobPromise = Promise.withResolvers();
			let errorData = null;
			try {
				this.#batchCacheOperations(operations);
			} catch (e) {
				errorData = e;
			}
			queueMicrotask(() => {
				if (errorData === null) cacheJobPromise.resolve();
				else cacheJobPromise.reject(errorData);
			});
			return cacheJobPromise.promise;
		}
		async delete(request, options = {}) {
			webidl.brandCheck(this, Cache);
			const prefix = "Cache.delete";
			webidl.argumentLengthCheck(arguments, 1, prefix);
			request = webidl.converters.RequestInfo(request);
			options = webidl.converters.CacheQueryOptions(options, prefix, "options");
			/**
			* @type {Request}
			*/
			let r = null;
			if (webidl.is.Request(request)) {
				r = getRequestState(request);
				if (r.method !== "GET" && !options.ignoreMethod) return false;
			} else {
				assert$3(typeof request === "string");
				r = getRequestState(new Request(request));
			}
			/** @type {CacheBatchOperation[]} */
			const operations = [];
			/** @type {CacheBatchOperation} */
			const operation = {
				type: "delete",
				request: r,
				options
			};
			operations.push(operation);
			const cacheJobPromise = Promise.withResolvers();
			let errorData = null;
			let requestResponses;
			try {
				requestResponses = this.#batchCacheOperations(operations);
			} catch (e) {
				errorData = e;
			}
			queueMicrotask(() => {
				if (errorData === null) cacheJobPromise.resolve(!!requestResponses?.length);
				else cacheJobPromise.reject(errorData);
			});
			return cacheJobPromise.promise;
		}
		/**
		* @see https://w3c.github.io/ServiceWorker/#dom-cache-keys
		* @param {any} request
		* @param {import('../../../types/cache').CacheQueryOptions} options
		* @returns {Promise<readonly Request[]>}
		*/
		async keys(request = void 0, options = {}) {
			webidl.brandCheck(this, Cache);
			const prefix = "Cache.keys";
			if (request !== void 0) request = webidl.converters.RequestInfo(request);
			options = webidl.converters.CacheQueryOptions(options, prefix, "options");
			let r = null;
			if (request !== void 0) {
				if (webidl.is.Request(request)) {
					r = getRequestState(request);
					if (r.method !== "GET" && !options.ignoreMethod) return [];
				} else if (typeof request === "string") r = getRequestState(new Request(request));
			}
			const promise = Promise.withResolvers();
			const requests = [];
			if (request === void 0) for (const requestResponse of this.#relevantRequestResponseList) requests.push(requestResponse[0]);
			else {
				const requestResponses = this.#queryCache(r, options);
				for (const requestResponse of requestResponses) requests.push(requestResponse[0]);
			}
			queueMicrotask(() => {
				const requestList = [];
				for (const request of requests) {
					const requestObject = fromInnerRequest(request, void 0, new AbortController().signal, "immutable");
					requestList.push(requestObject);
				}
				promise.resolve(Object.freeze(requestList));
			});
			return promise.promise;
		}
		/**
		* @see https://w3c.github.io/ServiceWorker/#batch-cache-operations-algorithm
		* @param {CacheBatchOperation[]} operations
		* @returns {requestResponseList}
		*/
		#batchCacheOperations(operations) {
			const cache = this.#relevantRequestResponseList;
			const backupCache = [...cache];
			const addedItems = [];
			const resultList = [];
			try {
				for (const operation of operations) {
					if (operation.type !== "delete" && operation.type !== "put") throw webidl.errors.exception({
						header: "Cache.#batchCacheOperations",
						message: "operation type does not match \"delete\" or \"put\""
					});
					if (operation.type === "delete" && operation.response != null) throw webidl.errors.exception({
						header: "Cache.#batchCacheOperations",
						message: "delete operation should not have an associated response"
					});
					if (this.#queryCache(operation.request, operation.options, addedItems).length) throw new DOMException("???", "InvalidStateError");
					let requestResponses;
					if (operation.type === "delete") {
						requestResponses = this.#queryCache(operation.request, operation.options);
						if (requestResponses.length === 0) return [];
						for (const requestResponse of requestResponses) {
							const idx = cache.indexOf(requestResponse);
							assert$3(idx !== -1);
							cache.splice(idx, 1);
						}
					} else if (operation.type === "put") {
						if (operation.response == null) throw webidl.errors.exception({
							header: "Cache.#batchCacheOperations",
							message: "put operation should have an associated response"
						});
						const r = operation.request;
						if (!urlIsHttpHttpsScheme(r.url)) throw webidl.errors.exception({
							header: "Cache.#batchCacheOperations",
							message: "expected http or https scheme"
						});
						if (r.method !== "GET") throw webidl.errors.exception({
							header: "Cache.#batchCacheOperations",
							message: "not get method"
						});
						if (operation.options != null) throw webidl.errors.exception({
							header: "Cache.#batchCacheOperations",
							message: "options must not be defined"
						});
						requestResponses = this.#queryCache(operation.request);
						for (const requestResponse of requestResponses) {
							const idx = cache.indexOf(requestResponse);
							assert$3(idx !== -1);
							cache.splice(idx, 1);
						}
						cache.push([operation.request, operation.response]);
						addedItems.push([operation.request, operation.response]);
					}
					resultList.push([operation.request, operation.response]);
				}
				return resultList;
			} catch (e) {
				this.#relevantRequestResponseList.length = 0;
				this.#relevantRequestResponseList = backupCache;
				throw e;
			}
		}
		/**
		* @see https://w3c.github.io/ServiceWorker/#query-cache
		* @param {any} requestQuery
		* @param {import('../../../types/cache').CacheQueryOptions} options
		* @param {requestResponseList} targetStorage
		* @returns {requestResponseList}
		*/
		#queryCache(requestQuery, options, targetStorage) {
			/** @type {requestResponseList} */
			const resultList = [];
			const storage = targetStorage ?? this.#relevantRequestResponseList;
			for (const requestResponse of storage) {
				const [cachedRequest, cachedResponse] = requestResponse;
				if (this.#requestMatchesCachedItem(requestQuery, cachedRequest, cachedResponse, options)) resultList.push(requestResponse);
			}
			return resultList;
		}
		/**
		* @see https://w3c.github.io/ServiceWorker/#request-matches-cached-item-algorithm
		* @param {any} requestQuery
		* @param {any} request
		* @param {any | null} response
		* @param {import('../../../types/cache').CacheQueryOptions | undefined} options
		* @returns {boolean}
		*/
		#requestMatchesCachedItem(requestQuery, request, response = null, options) {
			const queryURL = new URL(requestQuery.url);
			const cachedURL = new URL(request.url);
			if (options?.ignoreSearch) {
				cachedURL.search = "";
				queryURL.search = "";
			}
			if (!urlEquals(queryURL, cachedURL, true)) return false;
			if (response == null || options?.ignoreVary || !response.headersList.contains("vary")) return true;
			const fieldValues = getFieldValues(response.headersList.get("vary"));
			for (const fieldValue of fieldValues) {
				if (fieldValue === "*") return false;
				if (request.headersList.get(fieldValue) !== requestQuery.headersList.get(fieldValue)) return false;
			}
			return true;
		}
		#internalMatchAll(request, options, maxResponses = Infinity) {
			let r = null;
			if (request !== void 0) {
				if (webidl.is.Request(request)) {
					r = getRequestState(request);
					if (r.method !== "GET" && !options.ignoreMethod) return [];
				} else if (typeof request === "string") r = getRequestState(new Request(request));
			}
			const responses = [];
			if (request === void 0) for (const requestResponse of this.#relevantRequestResponseList) responses.push(requestResponse[1]);
			else {
				const requestResponses = this.#queryCache(r, options);
				for (const requestResponse of requestResponses) responses.push(requestResponse[1]);
			}
			const responseList = [];
			for (const response of responses) {
				const responseObject = fromInnerResponse(cloneResponse(response), "immutable");
				responseList.push(responseObject);
				if (responseList.length >= maxResponses) break;
			}
			return Object.freeze(responseList);
		}
	};
	Object.defineProperties(Cache.prototype, {
		[Symbol.toStringTag]: {
			value: "Cache",
			configurable: true
		},
		match: kEnumerableProperty,
		matchAll: kEnumerableProperty,
		add: kEnumerableProperty,
		addAll: kEnumerableProperty,
		put: kEnumerableProperty,
		delete: kEnumerableProperty,
		keys: kEnumerableProperty
	});
	const cacheQueryOptionConverters = [
		{
			key: "ignoreSearch",
			converter: webidl.converters.boolean,
			defaultValue: () => false
		},
		{
			key: "ignoreMethod",
			converter: webidl.converters.boolean,
			defaultValue: () => false
		},
		{
			key: "ignoreVary",
			converter: webidl.converters.boolean,
			defaultValue: () => false
		}
	];
	webidl.converters.CacheQueryOptions = webidl.dictionaryConverter(cacheQueryOptionConverters);
	webidl.converters.MultiCacheQueryOptions = webidl.dictionaryConverter([...cacheQueryOptionConverters, {
		key: "cacheName",
		converter: webidl.converters.DOMString
	}]);
	webidl.converters.Response = webidl.interfaceConverter(webidl.is.Response, "Response");
	webidl.converters["sequence<RequestInfo>"] = webidl.sequenceConverter(webidl.converters.RequestInfo);
	module.exports = { Cache };
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/web/cache/cachestorage.js
var require_cachestorage = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { Cache } = require_cache();
	const { webidl } = require_webidl();
	const { kEnumerableProperty } = require_util$5();
	const { kConstruct } = require_symbols();
	var CacheStorage = class CacheStorage {
		/**
		* @see https://w3c.github.io/ServiceWorker/#dfn-relevant-name-to-cache-map
		* @type {Map<string, import('./cache').requestResponseList}
		*/
		#caches = /* @__PURE__ */ new Map();
		constructor() {
			if (arguments[0] !== kConstruct) webidl.illegalConstructor();
			webidl.util.markAsUncloneable(this);
		}
		async match(request, options = {}) {
			webidl.brandCheck(this, CacheStorage);
			webidl.argumentLengthCheck(arguments, 1, "CacheStorage.match");
			request = webidl.converters.RequestInfo(request);
			options = webidl.converters.MultiCacheQueryOptions(options);
			if (options.cacheName != null) {
				if (this.#caches.has(options.cacheName)) {
					const cacheList = this.#caches.get(options.cacheName);
					return await new Cache(kConstruct, cacheList).match(request, options);
				}
			} else for (const cacheList of this.#caches.values()) {
				const response = await new Cache(kConstruct, cacheList).match(request, options);
				if (response !== void 0) return response;
			}
		}
		/**
		* @see https://w3c.github.io/ServiceWorker/#cache-storage-has
		* @param {string} cacheName
		* @returns {Promise<boolean>}
		*/
		async has(cacheName) {
			webidl.brandCheck(this, CacheStorage);
			const prefix = "CacheStorage.has";
			webidl.argumentLengthCheck(arguments, 1, prefix);
			cacheName = webidl.converters.DOMString(cacheName, prefix, "cacheName");
			return this.#caches.has(cacheName);
		}
		/**
		* @see https://w3c.github.io/ServiceWorker/#dom-cachestorage-open
		* @param {string} cacheName
		* @returns {Promise<Cache>}
		*/
		async open(cacheName) {
			webidl.brandCheck(this, CacheStorage);
			const prefix = "CacheStorage.open";
			webidl.argumentLengthCheck(arguments, 1, prefix);
			cacheName = webidl.converters.DOMString(cacheName, prefix, "cacheName");
			if (this.#caches.has(cacheName)) {
				const cache = this.#caches.get(cacheName);
				return new Cache(kConstruct, cache);
			}
			const cache = [];
			this.#caches.set(cacheName, cache);
			return new Cache(kConstruct, cache);
		}
		/**
		* @see https://w3c.github.io/ServiceWorker/#cache-storage-delete
		* @param {string} cacheName
		* @returns {Promise<boolean>}
		*/
		async delete(cacheName) {
			webidl.brandCheck(this, CacheStorage);
			const prefix = "CacheStorage.delete";
			webidl.argumentLengthCheck(arguments, 1, prefix);
			cacheName = webidl.converters.DOMString(cacheName, prefix, "cacheName");
			return this.#caches.delete(cacheName);
		}
		/**
		* @see https://w3c.github.io/ServiceWorker/#cache-storage-keys
		* @returns {Promise<string[]>}
		*/
		async keys() {
			webidl.brandCheck(this, CacheStorage);
			return [...this.#caches.keys()];
		}
	};
	Object.defineProperties(CacheStorage.prototype, {
		[Symbol.toStringTag]: {
			value: "CacheStorage",
			configurable: true
		},
		match: kEnumerableProperty,
		has: kEnumerableProperty,
		open: kEnumerableProperty,
		delete: kEnumerableProperty,
		keys: kEnumerableProperty
	});
	module.exports = { CacheStorage };
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/web/cookies/constants.js
var require_constants$1 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = {
		maxAttributeValueSize: 1024,
		maxNameValuePairSize: 4096
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/web/cookies/util.js
var require_util$2 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	/**
	* @param {string} value
	* @returns {boolean}
	*/
	function isCTLExcludingHtab(value) {
		for (let i = 0; i < value.length; ++i) {
			const code = value.charCodeAt(i);
			if (code >= 0 && code <= 8 || code >= 10 && code <= 31 || code === 127) return true;
		}
		return false;
	}
	/**
	CHAR           = <any US-ASCII character (octets 0 - 127)>
	token          = 1*<any CHAR except CTLs or separators>
	separators     = "(" | ")" | "<" | ">" | "@"
	| "," | ";" | ":" | "\" | <">
	| "/" | "[" | "]" | "?" | "="
	| "{" | "}" | SP | HT
	* @param {string} name
	*/
	function validateCookieName(name) {
		for (let i = 0; i < name.length; ++i) {
			const code = name.charCodeAt(i);
			if (code < 33 || code > 126 || code === 34 || code === 40 || code === 41 || code === 60 || code === 62 || code === 64 || code === 44 || code === 59 || code === 58 || code === 92 || code === 47 || code === 91 || code === 93 || code === 63 || code === 61 || code === 123 || code === 125) throw new Error("Invalid cookie name");
		}
	}
	/**
	cookie-value      = *cookie-octet / ( DQUOTE *cookie-octet DQUOTE )
	cookie-octet      = %x21 / %x23-2B / %x2D-3A / %x3C-5B / %x5D-7E
	; US-ASCII characters excluding CTLs,
	; whitespace DQUOTE, comma, semicolon,
	; and backslash
	* @param {string} value
	*/
	function validateCookieValue(value) {
		let len = value.length;
		let i = 0;
		if (value[0] === "\"") {
			if (len === 1 || value[len - 1] !== "\"") throw new Error("Invalid cookie value");
			--len;
			++i;
		}
		while (i < len) {
			const code = value.charCodeAt(i++);
			if (code < 33 || code > 126 || code === 34 || code === 44 || code === 59 || code === 92) throw new Error("Invalid cookie value");
		}
	}
	/**
	* path-value        = <any CHAR except CTLs or ";">
	* @param {string} path
	*/
	function validateCookiePath(path) {
		for (let i = 0; i < path.length; ++i) {
			const code = path.charCodeAt(i);
			if (code < 32 || code > 126 || code === 59) throw new Error("Invalid cookie path");
		}
	}
	/**
	* <let-dig> ::= <letter> | <digit>
	*
	* <letter> ::= any one of the 52 alphabetic characters A through Z in
	* upper case and a through z in lower case
	*
	* <digit> ::= any one of the ten digits 0 through 9r
	*
	* @see https://www.rfc-editor.org/rfc/rfc1034#section-3.5
	* @param {number} code
	*/
	function isLetterOrDigit(code) {
		return code >= 48 && code <= 57 || code >= 65 && code <= 90 || code >= 97 && code <= 122;
	}
	/**
	* Validates a cookie domain against the "preferred name syntax".
	*
	* <domain>      ::= <subdomain> | " "
	* <subdomain>   ::= <label> | <subdomain> "." <label>
	* <label>       ::= <let-dig> [ [ <ldh-str> ] <let-dig> ]
	* <ldh-str>     ::= <let-dig-hyp> | <let-dig-hyp> <ldh-str>
	* <let-dig-hyp> ::= <let-dig> | "-"
	*
	* @see https://www.rfc-editor.org/rfc/rfc1034#section-3.5
	* @see https://www.rfc-editor.org/rfc/rfc1123#section-2.1
	* @see https://www.rfc-editor.org/rfc/rfc1035#section-2.3.4
	* @param {string} domain
	*/
	function validateCookieDomain(domain) {
		if (domain === " ") return;
		if (domain.length > 255) throw new Error("Invalid cookie domain");
		let labelLength = 0;
		for (let i = 0; i < domain.length; ++i) {
			const code = domain.charCodeAt(i);
			if (code === 46) {
				if (labelLength === 0) throw new Error("Invalid cookie domain");
				if (domain.charCodeAt(i - 1) === 45) throw new Error("Invalid cookie domain");
				labelLength = 0;
				continue;
			}
			if (labelLength === 0 && !isLetterOrDigit(code)) throw new Error("Invalid cookie domain");
			if (!isLetterOrDigit(code) && code !== 45) throw new Error("Invalid cookie domain");
			if (++labelLength > 63) throw new Error("Invalid cookie domain");
		}
		if (labelLength === 0 || domain.charCodeAt(domain.length - 1) === 45) throw new Error("Invalid cookie domain");
	}
	const IMFDays = [
		"Sun",
		"Mon",
		"Tue",
		"Wed",
		"Thu",
		"Fri",
		"Sat"
	];
	const IMFMonths = [
		"Jan",
		"Feb",
		"Mar",
		"Apr",
		"May",
		"Jun",
		"Jul",
		"Aug",
		"Sep",
		"Oct",
		"Nov",
		"Dec"
	];
	const IMFPaddedNumbers = Array(61).fill(0).map((_, i) => i.toString().padStart(2, "0"));
	/**
	* @see https://www.rfc-editor.org/rfc/rfc7231#section-7.1.1.1
	* @param {number|Date} date
	IMF-fixdate  = day-name "," SP date1 SP time-of-day SP GMT
	; fixed length/zone/capitalization subset of the format
	; see Section 3.3 of [RFC5322]
	
	day-name     = %x4D.6F.6E ; "Mon", case-sensitive
	/ %x54.75.65 ; "Tue", case-sensitive
	/ %x57.65.64 ; "Wed", case-sensitive
	/ %x54.68.75 ; "Thu", case-sensitive
	/ %x46.72.69 ; "Fri", case-sensitive
	/ %x53.61.74 ; "Sat", case-sensitive
	/ %x53.75.6E ; "Sun", case-sensitive
	date1        = day SP month SP year
	; e.g., 02 Jun 1982
	
	day          = 2DIGIT
	month        = %x4A.61.6E ; "Jan", case-sensitive
	/ %x46.65.62 ; "Feb", case-sensitive
	/ %x4D.61.72 ; "Mar", case-sensitive
	/ %x41.70.72 ; "Apr", case-sensitive
	/ %x4D.61.79 ; "May", case-sensitive
	/ %x4A.75.6E ; "Jun", case-sensitive
	/ %x4A.75.6C ; "Jul", case-sensitive
	/ %x41.75.67 ; "Aug", case-sensitive
	/ %x53.65.70 ; "Sep", case-sensitive
	/ %x4F.63.74 ; "Oct", case-sensitive
	/ %x4E.6F.76 ; "Nov", case-sensitive
	/ %x44.65.63 ; "Dec", case-sensitive
	year         = 4DIGIT
	
	GMT          = %x47.4D.54 ; "GMT", case-sensitive
	
	time-of-day  = hour ":" minute ":" second
	; 00:00:00 - 23:59:60 (leap second)
	
	hour         = 2DIGIT
	minute       = 2DIGIT
	second       = 2DIGIT
	*/
	function toIMFDate(date) {
		if (typeof date === "number") date = new Date(date);
		return `${IMFDays[date.getUTCDay()]}, ${IMFPaddedNumbers[date.getUTCDate()]} ${IMFMonths[date.getUTCMonth()]} ${date.getUTCFullYear()} ${IMFPaddedNumbers[date.getUTCHours()]}:${IMFPaddedNumbers[date.getUTCMinutes()]}:${IMFPaddedNumbers[date.getUTCSeconds()]} GMT`;
	}
	/**
	max-age-av        = "Max-Age=" non-zero-digit *DIGIT
	; In practice, both expires-av and max-age-av
	; are limited to dates representable by the
	; user agent.
	* @param {number} maxAge
	*/
	function validateCookieMaxAge(maxAge) {
		if (maxAge < 0) throw new Error("Invalid cookie max-age");
	}
	/**
	* @see https://www.rfc-editor.org/rfc/rfc6265#section-4.1.1
	* @param {import('./index').Cookie} cookie
	*/
	function stringify(cookie) {
		if (cookie.name.length === 0) return null;
		validateCookieName(cookie.name);
		validateCookieValue(cookie.value);
		const out = [`${cookie.name}=${cookie.value}`];
		if (cookie.name.startsWith("__Secure-")) cookie.secure = true;
		if (cookie.name.startsWith("__Host-")) {
			cookie.secure = true;
			cookie.domain = null;
			cookie.path = "/";
		}
		if (cookie.secure) out.push("Secure");
		if (cookie.httpOnly) out.push("HttpOnly");
		if (typeof cookie.maxAge === "number") {
			validateCookieMaxAge(cookie.maxAge);
			out.push(`Max-Age=${cookie.maxAge}`);
		}
		if (cookie.domain) {
			validateCookieDomain(cookie.domain);
			out.push(`Domain=${cookie.domain}`);
		}
		if (cookie.path) {
			validateCookiePath(cookie.path);
			out.push(`Path=${cookie.path}`);
		}
		if (cookie.expires && cookie.expires.toString() !== "Invalid Date") out.push(`Expires=${toIMFDate(cookie.expires)}`);
		if (cookie.sameSite) out.push(`SameSite=${cookie.sameSite}`);
		for (const part of cookie.unparsed) {
			if (!part.includes("=")) throw new Error("Invalid unparsed");
			const [key, ...value] = part.split("=");
			const trimmedKey = key.trim();
			const joinedValue = value.join("=");
			validateCookieName(trimmedKey);
			validateCookieValue(joinedValue);
			out.push(`${trimmedKey}=${joinedValue}`);
		}
		return out.join("; ");
	}
	module.exports = {
		isCTLExcludingHtab,
		validateCookieName,
		validateCookiePath,
		validateCookieValue,
		toIMFDate,
		stringify
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/web/cookies/parse.js
var require_parse = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { collectASequenceOfCodePointsFast } = require_infra();
	const { maxNameValuePairSize, maxAttributeValueSize } = require_constants$1();
	const { isCTLExcludingHtab } = require_util$2();
	const assert$2 = __require("node:assert");
	/**
	* @description Parses the field-value attributes of a set-cookie header string.
	* @see https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis#section-5.4
	* @param {string} header
	* @returns {import('./index').Cookie|null} if the header is invalid, null will be returned
	*/
	function parseSetCookie(header) {
		if (isCTLExcludingHtab(header)) return null;
		let nameValuePair = "";
		let unparsedAttributes = "";
		let name = "";
		let value = "";
		if (header.includes(";")) {
			const position = { position: 0 };
			nameValuePair = collectASequenceOfCodePointsFast(";", header, position);
			unparsedAttributes = header.slice(position.position);
		} else nameValuePair = header;
		if (!nameValuePair.includes("=")) value = nameValuePair;
		else {
			const position = { position: 0 };
			name = collectASequenceOfCodePointsFast("=", nameValuePair, position);
			value = nameValuePair.slice(position.position + 1);
		}
		name = name.trim();
		value = value.trim();
		if (name.length + value.length > maxNameValuePairSize) return null;
		return {
			name,
			value,
			...parseUnparsedAttributes(unparsedAttributes)
		};
	}
	/**
	* Parses the remaining attributes of a set-cookie header
	* @see https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis#section-5.4
	* @param {string} unparsedAttributes
	* @param {Object.<string, unknown>} [cookieAttributeList={}]
	*/
	function parseUnparsedAttributes(unparsedAttributes, cookieAttributeList = {}) {
		if (unparsedAttributes.length === 0) return cookieAttributeList;
		assert$2(unparsedAttributes[0] === ";");
		unparsedAttributes = unparsedAttributes.slice(1);
		let cookieAv = "";
		if (unparsedAttributes.includes(";")) {
			cookieAv = collectASequenceOfCodePointsFast(";", unparsedAttributes, { position: 0 });
			unparsedAttributes = unparsedAttributes.slice(cookieAv.length);
		} else {
			cookieAv = unparsedAttributes;
			unparsedAttributes = "";
		}
		let attributeName = "";
		let attributeValue = "";
		if (cookieAv.includes("=")) {
			const position = { position: 0 };
			attributeName = collectASequenceOfCodePointsFast("=", cookieAv, position);
			attributeValue = cookieAv.slice(position.position + 1);
		} else attributeName = cookieAv;
		attributeName = attributeName.trim();
		attributeValue = attributeValue.trim();
		if (attributeValue.length > maxAttributeValueSize) return parseUnparsedAttributes(unparsedAttributes, cookieAttributeList);
		const attributeNameLowercase = attributeName.toLowerCase();
		if (attributeNameLowercase === "expires") {
			const expiryTime = new Date(attributeValue);
			if (!Number.isNaN(expiryTime.getTime())) cookieAttributeList.expires = expiryTime;
		} else if (attributeNameLowercase === "max-age") {
			const charCode = attributeValue.charCodeAt(0);
			if ((charCode < 48 || charCode > 57) && attributeValue[0] !== "-") return parseUnparsedAttributes(unparsedAttributes, cookieAttributeList);
			if (!/^\d+$/.test(attributeValue)) return parseUnparsedAttributes(unparsedAttributes, cookieAttributeList);
			cookieAttributeList.maxAge = Number(attributeValue);
		} else if (attributeNameLowercase === "domain") {
			let cookieDomain = attributeValue;
			if (cookieDomain[0] === ".") cookieDomain = cookieDomain.slice(1);
			cookieDomain = cookieDomain.toLowerCase();
			cookieAttributeList.domain = cookieDomain;
		} else if (attributeNameLowercase === "path") {
			let cookiePath = "";
			if (attributeValue.length === 0 || attributeValue[0] !== "/") cookiePath = "/";
			else cookiePath = attributeValue;
			cookieAttributeList.path = cookiePath;
		} else if (attributeNameLowercase === "secure") cookieAttributeList.secure = true;
		else if (attributeNameLowercase === "httponly") cookieAttributeList.httpOnly = true;
		else if (attributeNameLowercase === "samesite") {
			const attributeValueLowercase = attributeValue.toLowerCase();
			if (attributeValueLowercase === "none") cookieAttributeList.sameSite = "None";
			else if (attributeValueLowercase === "strict") cookieAttributeList.sameSite = "Strict";
			else if (attributeValueLowercase === "lax") cookieAttributeList.sameSite = "Lax";
		} else {
			cookieAttributeList.unparsed ??= [];
			cookieAttributeList.unparsed.push(`${attributeName}=${attributeValue}`);
		}
		return parseUnparsedAttributes(unparsedAttributes, cookieAttributeList);
	}
	module.exports = {
		parseSetCookie,
		parseUnparsedAttributes
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/web/cookies/index.js
var require_cookies = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { parseSetCookie } = require_parse();
	const { stringify } = require_util$2();
	const { webidl } = require_webidl();
	const { Headers } = require_headers();
	const brandChecks = webidl.brandCheckMultiple([Headers, globalThis.Headers].filter(Boolean));
	/**
	* @typedef {Object} Cookie
	* @property {string} name
	* @property {string} value
	* @property {Date|number} [expires]
	* @property {number} [maxAge]
	* @property {string} [domain]
	* @property {string} [path]
	* @property {boolean} [secure]
	* @property {boolean} [httpOnly]
	* @property {'Strict'|'Lax'|'None'} [sameSite]
	* @property {string[]} [unparsed]
	*/
	/**
	* @param {Headers} headers
	* @returns {Record<string, string>}
	*/
	function getCookies(headers) {
		webidl.argumentLengthCheck(arguments, 1, "getCookies");
		brandChecks(headers);
		const cookie = headers.get("cookie");
		/** @type {Record<string, string>} */
		const out = {};
		if (!cookie) return out;
		for (const piece of cookie.split(";")) {
			const [name, ...value] = piece.split("=");
			out[name.trim()] = value.join("=");
		}
		return out;
	}
	/**
	* @param {Headers} headers
	* @param {string} name
	* @param {{ path?: string, domain?: string }|undefined} attributes
	* @returns {void}
	*/
	function deleteCookie(headers, name, attributes) {
		brandChecks(headers);
		const prefix = "deleteCookie";
		webidl.argumentLengthCheck(arguments, 2, prefix);
		name = webidl.converters.DOMString(name, prefix, "name");
		attributes = webidl.converters.DeleteCookieAttributes(attributes);
		setCookie(headers, {
			name,
			value: "",
			expires: /* @__PURE__ */ new Date(0),
			...attributes
		});
	}
	/**
	* @param {Headers} headers
	* @returns {Cookie[]}
	*/
	function getSetCookies(headers) {
		webidl.argumentLengthCheck(arguments, 1, "getSetCookies");
		brandChecks(headers);
		const cookies = headers.getSetCookie();
		if (!cookies) return [];
		return cookies.map((pair) => parseSetCookie(pair));
	}
	/**
	* Parses a cookie string
	* @param {string} cookie
	*/
	function parseCookie(cookie) {
		cookie = webidl.converters.DOMString(cookie);
		return parseSetCookie(cookie);
	}
	/**
	* @param {Headers} headers
	* @param {Cookie} cookie
	* @returns {void}
	*/
	function setCookie(headers, cookie) {
		webidl.argumentLengthCheck(arguments, 2, "setCookie");
		brandChecks(headers);
		cookie = webidl.converters.Cookie(cookie);
		const str = stringify(cookie);
		if (str) headers.append("set-cookie", str, true);
	}
	webidl.converters.DeleteCookieAttributes = webidl.dictionaryConverter([{
		converter: webidl.nullableConverter(webidl.converters.DOMString),
		key: "path",
		defaultValue: () => null
	}, {
		converter: webidl.nullableConverter(webidl.converters.DOMString),
		key: "domain",
		defaultValue: () => null
	}]);
	webidl.converters.Cookie = webidl.dictionaryConverter([
		{
			converter: webidl.converters.DOMString,
			key: "name"
		},
		{
			converter: webidl.converters.DOMString,
			key: "value"
		},
		{
			converter: webidl.nullableConverter((value) => {
				if (typeof value === "number") return webidl.converters["unsigned long long"](value);
				return new Date(value);
			}),
			key: "expires",
			defaultValue: () => null
		},
		{
			converter: webidl.nullableConverter(webidl.converters["long long"]),
			key: "maxAge",
			defaultValue: () => null
		},
		{
			converter: webidl.nullableConverter(webidl.converters.DOMString),
			key: "domain",
			defaultValue: () => null
		},
		{
			converter: webidl.nullableConverter(webidl.converters.DOMString),
			key: "path",
			defaultValue: () => null
		},
		{
			converter: webidl.nullableConverter(webidl.converters.boolean),
			key: "secure",
			defaultValue: () => null
		},
		{
			converter: webidl.nullableConverter(webidl.converters.boolean),
			key: "httpOnly",
			defaultValue: () => null
		},
		{
			converter: webidl.converters.USVString,
			key: "sameSite",
			allowedValues: [
				"Strict",
				"Lax",
				"None"
			]
		},
		{
			converter: webidl.sequenceConverter(webidl.converters.DOMString),
			key: "unparsed",
			defaultValue: () => []
		}
	]);
	module.exports = {
		getCookies,
		deleteCookie,
		getSetCookies,
		setCookie,
		parseCookie
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/web/websocket/events.js
var require_events = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { webidl } = require_webidl();
	const { kEnumerableProperty } = require_util$5();
	const { kConstruct } = require_symbols();
	/**
	* @see https://html.spec.whatwg.org/multipage/comms.html#messageevent
	*/
	var MessageEvent = class MessageEvent extends Event {
		#eventInit;
		constructor(type, eventInitDict = {}) {
			if (type === kConstruct) {
				super(arguments[1], arguments[2]);
				webidl.util.markAsUncloneable(this);
				return;
			}
			const prefix = "MessageEvent constructor";
			webidl.argumentLengthCheck(arguments, 1, prefix);
			type = webidl.converters.DOMString(type, prefix, "type");
			eventInitDict = webidl.converters.MessageEventInit(eventInitDict, prefix, "eventInitDict");
			super(type, eventInitDict);
			this.#eventInit = eventInitDict;
			webidl.util.markAsUncloneable(this);
		}
		get data() {
			webidl.brandCheck(this, MessageEvent);
			return this.#eventInit.data;
		}
		get origin() {
			webidl.brandCheck(this, MessageEvent);
			return this.#eventInit.origin;
		}
		get lastEventId() {
			webidl.brandCheck(this, MessageEvent);
			return this.#eventInit.lastEventId;
		}
		get source() {
			webidl.brandCheck(this, MessageEvent);
			return this.#eventInit.source;
		}
		get ports() {
			webidl.brandCheck(this, MessageEvent);
			if (!Object.isFrozen(this.#eventInit.ports)) Object.freeze(this.#eventInit.ports);
			return this.#eventInit.ports;
		}
		initMessageEvent(type, bubbles = false, cancelable = false, data = null, origin = "", lastEventId = "", source = null, ports = []) {
			webidl.brandCheck(this, MessageEvent);
			webidl.argumentLengthCheck(arguments, 1, "MessageEvent.initMessageEvent");
			return new MessageEvent(type, {
				bubbles,
				cancelable,
				data,
				origin,
				lastEventId,
				source,
				ports
			});
		}
		static createFastMessageEvent(type, init) {
			const messageEvent = new MessageEvent(kConstruct, type, init);
			messageEvent.#eventInit = init;
			messageEvent.#eventInit.data ??= null;
			messageEvent.#eventInit.origin ??= "";
			messageEvent.#eventInit.lastEventId ??= "";
			messageEvent.#eventInit.source ??= null;
			messageEvent.#eventInit.ports ??= [];
			return messageEvent;
		}
	};
	const { createFastMessageEvent } = MessageEvent;
	delete MessageEvent.createFastMessageEvent;
	/**
	* @see https://websockets.spec.whatwg.org/#the-closeevent-interface
	*/
	var CloseEvent = class CloseEvent extends Event {
		#eventInit;
		constructor(type, eventInitDict = {}) {
			const prefix = "CloseEvent constructor";
			webidl.argumentLengthCheck(arguments, 1, prefix);
			type = webidl.converters.DOMString(type, prefix, "type");
			eventInitDict = webidl.converters.CloseEventInit(eventInitDict);
			super(type, eventInitDict);
			this.#eventInit = eventInitDict;
			webidl.util.markAsUncloneable(this);
		}
		get wasClean() {
			webidl.brandCheck(this, CloseEvent);
			return this.#eventInit.wasClean;
		}
		get code() {
			webidl.brandCheck(this, CloseEvent);
			return this.#eventInit.code;
		}
		get reason() {
			webidl.brandCheck(this, CloseEvent);
			return this.#eventInit.reason;
		}
	};
	var ErrorEvent = class ErrorEvent extends Event {
		#eventInit;
		constructor(type, eventInitDict) {
			const prefix = "ErrorEvent constructor";
			webidl.argumentLengthCheck(arguments, 1, prefix);
			super(type, eventInitDict);
			webidl.util.markAsUncloneable(this);
			type = webidl.converters.DOMString(type, prefix, "type");
			eventInitDict = webidl.converters.ErrorEventInit(eventInitDict ?? {});
			this.#eventInit = eventInitDict;
		}
		get message() {
			webidl.brandCheck(this, ErrorEvent);
			return this.#eventInit.message;
		}
		get filename() {
			webidl.brandCheck(this, ErrorEvent);
			return this.#eventInit.filename;
		}
		get lineno() {
			webidl.brandCheck(this, ErrorEvent);
			return this.#eventInit.lineno;
		}
		get colno() {
			webidl.brandCheck(this, ErrorEvent);
			return this.#eventInit.colno;
		}
		get error() {
			webidl.brandCheck(this, ErrorEvent);
			return this.#eventInit.error;
		}
	};
	Object.defineProperties(MessageEvent.prototype, {
		[Symbol.toStringTag]: {
			value: "MessageEvent",
			configurable: true
		},
		data: kEnumerableProperty,
		origin: kEnumerableProperty,
		lastEventId: kEnumerableProperty,
		source: kEnumerableProperty,
		ports: kEnumerableProperty,
		initMessageEvent: kEnumerableProperty
	});
	Object.defineProperties(CloseEvent.prototype, {
		[Symbol.toStringTag]: {
			value: "CloseEvent",
			configurable: true
		},
		reason: kEnumerableProperty,
		code: kEnumerableProperty,
		wasClean: kEnumerableProperty
	});
	Object.defineProperties(ErrorEvent.prototype, {
		[Symbol.toStringTag]: {
			value: "ErrorEvent",
			configurable: true
		},
		message: kEnumerableProperty,
		filename: kEnumerableProperty,
		lineno: kEnumerableProperty,
		colno: kEnumerableProperty,
		error: kEnumerableProperty
	});
	webidl.converters.MessagePort = webidl.interfaceConverter(webidl.is.MessagePort, "MessagePort");
	webidl.converters["sequence<MessagePort>"] = webidl.sequenceConverter(webidl.converters.MessagePort);
	const eventInit = [
		{
			key: "bubbles",
			converter: webidl.converters.boolean,
			defaultValue: () => false
		},
		{
			key: "cancelable",
			converter: webidl.converters.boolean,
			defaultValue: () => false
		},
		{
			key: "composed",
			converter: webidl.converters.boolean,
			defaultValue: () => false
		}
	];
	webidl.converters.MessageEventInit = webidl.dictionaryConverter([
		...eventInit,
		{
			key: "data",
			converter: webidl.converters.any,
			defaultValue: () => null
		},
		{
			key: "origin",
			converter: webidl.converters.USVString,
			defaultValue: () => ""
		},
		{
			key: "lastEventId",
			converter: webidl.converters.DOMString,
			defaultValue: () => ""
		},
		{
			key: "source",
			converter: webidl.nullableConverter(webidl.converters.MessagePort),
			defaultValue: () => null
		},
		{
			key: "ports",
			converter: webidl.converters["sequence<MessagePort>"],
			defaultValue: () => []
		}
	]);
	webidl.converters.CloseEventInit = webidl.dictionaryConverter([
		...eventInit,
		{
			key: "wasClean",
			converter: webidl.converters.boolean,
			defaultValue: () => false
		},
		{
			key: "code",
			converter: webidl.converters["unsigned short"],
			defaultValue: () => 0
		},
		{
			key: "reason",
			converter: webidl.converters.USVString,
			defaultValue: () => ""
		}
	]);
	webidl.converters.ErrorEventInit = webidl.dictionaryConverter([
		...eventInit,
		{
			key: "message",
			converter: webidl.converters.DOMString,
			defaultValue: () => ""
		},
		{
			key: "filename",
			converter: webidl.converters.USVString,
			defaultValue: () => ""
		},
		{
			key: "lineno",
			converter: webidl.converters["unsigned long"],
			defaultValue: () => 0
		},
		{
			key: "colno",
			converter: webidl.converters["unsigned long"],
			defaultValue: () => 0
		},
		{
			key: "error",
			converter: webidl.converters.any
		}
	]);
	module.exports = {
		MessageEvent,
		CloseEvent,
		ErrorEvent,
		createFastMessageEvent
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/web/websocket/constants.js
var require_constants = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = {
		uid: "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
		sentCloseFrameState: {
			SENT: 1,
			RECEIVED: 2
		},
		staticPropertyDescriptors: {
			enumerable: true,
			writable: false,
			configurable: false
		},
		states: {
			CONNECTING: 0,
			OPEN: 1,
			CLOSING: 2,
			CLOSED: 3
		},
		opcodes: {
			CONTINUATION: 0,
			TEXT: 1,
			BINARY: 2,
			CLOSE: 8,
			PING: 9,
			PONG: 10
		},
		maxUnsigned16Bit: 65535,
		parserStates: {
			INFO: 0,
			PAYLOADLENGTH_16: 2,
			PAYLOADLENGTH_64: 3,
			READ_DATA: 4
		},
		emptyBuffer: Buffer.allocUnsafe(0),
		sendHints: {
			text: 1,
			typedArray: 2,
			arrayBuffer: 3,
			blob: 4
		}
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/web/websocket/util.js
var require_util$1 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { states, opcodes } = require_constants();
	const { isUtf8 } = __require("node:buffer");
	const { removeHTTPWhitespace } = require_data_url();
	const { collectASequenceOfCodePointsFast } = require_infra();
	/**
	* @param {number} readyState
	* @returns {boolean}
	*/
	function isConnecting(readyState) {
		return readyState === states.CONNECTING;
	}
	/**
	* @param {number} readyState
	* @returns {boolean}
	*/
	function isEstablished(readyState) {
		return readyState === states.OPEN;
	}
	/**
	* @param {number} readyState
	* @returns {boolean}
	*/
	function isClosing(readyState) {
		return readyState === states.CLOSING;
	}
	/**
	* @param {number} readyState
	* @returns {boolean}
	*/
	function isClosed(readyState) {
		return readyState === states.CLOSED;
	}
	/**
	* @see https://dom.spec.whatwg.org/#concept-event-fire
	* @param {string} e
	* @param {EventTarget} target
	* @param {(...args: ConstructorParameters<typeof Event>) => Event} eventFactory
	* @param {EventInit | undefined} eventInitDict
	* @returns {void}
	*/
	function fireEvent(e, target, eventFactory = (type, init) => new Event(type, init), eventInitDict = {}) {
		const event = eventFactory(e, eventInitDict);
		target.dispatchEvent(event);
	}
	/**
	* @see https://websockets.spec.whatwg.org/#feedback-from-the-protocol
	* @param {import('./websocket').Handler} handler
	* @param {number} type Opcode
	* @param {Buffer} data application data
	* @returns {void}
	*/
	function websocketMessageReceived(handler, type, data) {
		handler.onMessage(type, data);
	}
	/**
	* @param {Buffer} buffer
	* @returns {ArrayBuffer}
	*/
	function toArrayBuffer(buffer) {
		if (buffer.byteLength === buffer.buffer.byteLength) return buffer.buffer;
		return new Uint8Array(buffer).buffer;
	}
	/**
	* @see https://datatracker.ietf.org/doc/html/rfc6455
	* @see https://datatracker.ietf.org/doc/html/rfc2616
	* @see https://bugs.chromium.org/p/chromium/issues/detail?id=398407
	* @param {string} protocol
	* @returns {boolean}
	*/
	function isValidSubprotocol(protocol) {
		if (protocol.length === 0) return false;
		for (let i = 0; i < protocol.length; ++i) {
			const code = protocol.charCodeAt(i);
			if (code < 33 || code > 126 || code === 34 || code === 40 || code === 41 || code === 44 || code === 47 || code === 58 || code === 59 || code === 60 || code === 61 || code === 62 || code === 63 || code === 64 || code === 91 || code === 92 || code === 93 || code === 123 || code === 125) return false;
		}
		return true;
	}
	/**
	* @see https://datatracker.ietf.org/doc/html/rfc6455#section-7-4
	* @param {number} code
	* @returns {boolean}
	*/
	function isValidStatusCode(code) {
		if (code >= 1e3 && code < 1015) return code !== 1004 && code !== 1005 && code !== 1006;
		return code >= 3e3 && code <= 4999;
	}
	/**
	* @see https://datatracker.ietf.org/doc/html/rfc6455#section-5.5
	* @param {number} opcode
	* @returns {boolean}
	*/
	function isControlFrame(opcode) {
		return opcode === opcodes.CLOSE || opcode === opcodes.PING || opcode === opcodes.PONG;
	}
	/**
	* @param {number} opcode
	* @returns {boolean}
	*/
	function isContinuationFrame(opcode) {
		return opcode === opcodes.CONTINUATION;
	}
	/**
	* @param {number} opcode
	* @returns {boolean}
	*/
	function isTextBinaryFrame(opcode) {
		return opcode === opcodes.TEXT || opcode === opcodes.BINARY;
	}
	/**
	*
	* @param {number} opcode
	* @returns {boolean}
	*/
	function isValidOpcode(opcode) {
		return isTextBinaryFrame(opcode) || isContinuationFrame(opcode) || isControlFrame(opcode);
	}
	/**
	* Parses a Sec-WebSocket-Extensions header value.
	* @param {string} extensions
	* @returns {Map<string, string>}
	*/
	function parseExtensions(extensions) {
		const position = { position: 0 };
		const extensionList = /* @__PURE__ */ new Map();
		while (position.position < extensions.length) {
			const [name, value = ""] = collectASequenceOfCodePointsFast(";", extensions, position).split("=", 2);
			extensionList.set(removeHTTPWhitespace(name, true, false), removeHTTPWhitespace(value, false, true));
			position.position++;
		}
		return extensionList;
	}
	/**
	* @see https://www.rfc-editor.org/rfc/rfc7692#section-7.1.2.2
	* @description "client-max-window-bits = 1*DIGIT"
	* @param {string} value
	* @returns {boolean}
	*/
	function isValidClientWindowBits(value) {
		if (value.length === 0) return false;
		for (let i = 0; i < value.length; i++) {
			const byte = value.charCodeAt(i);
			if (byte < 48 || byte > 57) return false;
		}
		const num = Number.parseInt(value, 10);
		return num >= 8 && num <= 15;
	}
	/**
	* @see https://whatpr.org/websockets/48/7b748d3...d5570f3.html#get-a-url-record
	* @param {string} url
	* @param {string} [baseURL]
	*/
	function getURLRecord(url, baseURL) {
		let urlRecord;
		try {
			urlRecord = new URL(url, baseURL);
		} catch (e) {
			throw new DOMException(e, "SyntaxError");
		}
		if (urlRecord.protocol === "http:") urlRecord.protocol = "ws:";
		else if (urlRecord.protocol === "https:") urlRecord.protocol = "wss:";
		if (urlRecord.protocol !== "ws:" && urlRecord.protocol !== "wss:") throw new DOMException("expected a ws: or wss: url", "SyntaxError");
		if (urlRecord.hash.length || urlRecord.href.endsWith("#")) throw new DOMException("hash", "SyntaxError");
		return urlRecord;
	}
	function validateCloseCodeAndReason(code, reason) {
		if (code !== null) {
			if (code !== 1e3 && (code < 3e3 || code > 4999)) throw new DOMException("invalid code", "InvalidAccessError");
		}
		if (reason !== null) {
			const reasonBytesLength = Buffer.byteLength(reason);
			if (reasonBytesLength > 123) throw new DOMException(`Reason must be less than 123 bytes; received ${reasonBytesLength}`, "SyntaxError");
		}
	}
	module.exports = {
		isConnecting,
		isEstablished,
		isClosing,
		isClosed,
		fireEvent,
		isValidSubprotocol,
		isValidStatusCode,
		websocketMessageReceived,
		utf8Decode: (() => {
			if (typeof process.versions.icu === "string") {
				const fatalDecoder = new TextDecoder("utf-8", { fatal: true });
				return fatalDecoder.decode.bind(fatalDecoder);
			}
			return function(buffer) {
				if (isUtf8(buffer)) return buffer.toString("utf-8");
				throw new TypeError("Invalid utf-8 received.");
			};
		})(),
		isControlFrame,
		isContinuationFrame,
		isTextBinaryFrame,
		isValidOpcode,
		parseExtensions,
		isValidClientWindowBits,
		toArrayBuffer,
		getURLRecord,
		validateCloseCodeAndReason
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/web/websocket/frame.js
var require_frame = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { runtimeFeatures } = require_runtime_features();
	const { maxUnsigned16Bit, opcodes } = require_constants();
	const BUFFER_SIZE = 8192;
	let buffer = null;
	let bufIdx = BUFFER_SIZE;
	const randomFillSync = runtimeFeatures.has("crypto") ? __require("node:crypto").randomFillSync : null;
	function generateMask() {
		if (bufIdx === BUFFER_SIZE) {
			bufIdx = 0;
			randomFillSync(buffer ??= Buffer.allocUnsafeSlow(BUFFER_SIZE), 0, BUFFER_SIZE);
		}
		return [
			buffer[bufIdx++],
			buffer[bufIdx++],
			buffer[bufIdx++],
			buffer[bufIdx++]
		];
	}
	var WebsocketFrameSend = class {
		/**
		* @param {Buffer|undefined} data
		*/
		constructor(data) {
			this.frameData = data;
		}
		createFrame(opcode) {
			const frameData = this.frameData;
			const maskKey = generateMask();
			const bodyLength = frameData?.byteLength ?? 0;
			/** @type {number} */
			let payloadLength = bodyLength;
			let offset = 6;
			if (bodyLength > maxUnsigned16Bit) {
				offset += 8;
				payloadLength = 127;
			} else if (bodyLength > 125) {
				offset += 2;
				payloadLength = 126;
			}
			const buffer = Buffer.allocUnsafe(bodyLength + offset);
			buffer[0] = buffer[1] = 0;
			buffer[0] |= 128;
			buffer[0] = (buffer[0] & 240) + opcode;
			/*! ws. MIT License. Einar Otto Stangvik <einaros@gmail.com> */
			buffer[offset - 4] = maskKey[0];
			buffer[offset - 3] = maskKey[1];
			buffer[offset - 2] = maskKey[2];
			buffer[offset - 1] = maskKey[3];
			buffer[1] = payloadLength;
			if (payloadLength === 126) buffer.writeUInt16BE(bodyLength, 2);
			else if (payloadLength === 127) {
				buffer[2] = buffer[3] = 0;
				buffer.writeUIntBE(bodyLength, 4, 6);
			}
			buffer[1] |= 128;
			for (let i = 0; i < bodyLength; ++i) buffer[offset + i] = frameData[i] ^ maskKey[i & 3];
			return buffer;
		}
		/**
		* @param {Uint8Array} buffer
		*/
		static createFastTextFrame(buffer) {
			const maskKey = generateMask();
			const bodyLength = buffer.length;
			for (let i = 0; i < bodyLength; ++i) buffer[i] ^= maskKey[i & 3];
			let payloadLength = bodyLength;
			let offset = 6;
			if (bodyLength > maxUnsigned16Bit) {
				offset += 8;
				payloadLength = 127;
			} else if (bodyLength > 125) {
				offset += 2;
				payloadLength = 126;
			}
			const head = Buffer.allocUnsafeSlow(offset);
			head[0] = 128 | opcodes.TEXT;
			head[1] = payloadLength | 128;
			head[offset - 4] = maskKey[0];
			head[offset - 3] = maskKey[1];
			head[offset - 2] = maskKey[2];
			head[offset - 1] = maskKey[3];
			if (payloadLength === 126) head.writeUInt16BE(bodyLength, 2);
			else if (payloadLength === 127) {
				head[2] = head[3] = 0;
				head.writeUIntBE(bodyLength, 4, 6);
			}
			return [head, buffer];
		}
	};
	module.exports = {
		WebsocketFrameSend,
		generateMask
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/web/websocket/connection.js
var require_connection = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { uid, states, sentCloseFrameState, emptyBuffer, opcodes } = require_constants();
	const { parseExtensions, isClosed, isClosing, isEstablished, isConnecting, validateCloseCodeAndReason } = require_util$1();
	const { makeRequest } = require_request();
	const { fetching } = require_fetch();
	const { Headers, getHeadersList } = require_headers();
	const { getDecodeSplit } = require_util$4();
	const { WebsocketFrameSend } = require_frame();
	const assert$1 = __require("node:assert");
	const { runtimeFeatures } = require_runtime_features();
	const crypto = runtimeFeatures.has("crypto") ? __require("node:crypto") : null;
	let warningEmitted = false;
	/**
	* @see https://websockets.spec.whatwg.org/#concept-websocket-establish
	* @param {URL} url
	* @param {string|string[]} protocols
	* @param {import('./websocket').Handler} handler
	* @param {Partial<import('../../../types/websocket').WebSocketInit>} options
	*/
	function establishWebSocketConnection(url, protocols, client, handler, options) {
		const requestURL = url;
		requestURL.protocol = url.protocol === "ws:" ? "http:" : "https:";
		const request = makeRequest({
			urlList: [requestURL],
			client,
			serviceWorkers: "none",
			referrer: "no-referrer",
			mode: "websocket",
			credentials: "include",
			cache: "no-store",
			redirect: "error",
			useURLCredentials: true
		});
		if (options.headers) request.headersList = getHeadersList(new Headers(options.headers));
		const keyValue = crypto.randomBytes(16).toString("base64");
		request.headersList.append("sec-websocket-key", keyValue, true);
		request.headersList.append("sec-websocket-version", "13", true);
		for (const protocol of protocols) request.headersList.append("sec-websocket-protocol", protocol, true);
		request.headersList.append("sec-websocket-extensions", "permessage-deflate; client_max_window_bits", true);
		return fetching({
			request,
			useParallelQueue: true,
			dispatcher: options.dispatcher,
			processResponse(response) {
				if (response.type === "error" || response.status !== 101) {
					if (response.socket?.session == null) {
						failWebsocketConnection(handler, 1002, "Received network error or non-101 status code.", response.error);
						return;
					}
					if (response.status !== 200) {
						failWebsocketConnection(handler, 1002, "Received network error or non-200 status code.", response.error);
						return;
					}
				}
				if (warningEmitted === false && response.socket?.session != null) {
					process.emitWarning("WebSocket over HTTP2 is experimental, and subject to change.", "ExperimentalWarning");
					warningEmitted = true;
				}
				if (protocols.length !== 0 && !response.headersList.get("Sec-WebSocket-Protocol")) {
					failWebsocketConnection(handler, 1002, "Server did not respond with sent protocols.");
					return;
				}
				if (response.socket.session == null && response.headersList.get("Upgrade")?.toLowerCase() !== "websocket") {
					failWebsocketConnection(handler, 1002, "Server did not set Upgrade header to \"websocket\".");
					return;
				}
				if (response.socket.session == null && response.headersList.get("Connection")?.toLowerCase() !== "upgrade") {
					failWebsocketConnection(handler, 1002, "Server did not set Connection header to \"upgrade\".");
					return;
				}
				if (response.headersList.get("Sec-WebSocket-Accept") !== crypto.hash("sha1", keyValue + uid, "base64")) {
					failWebsocketConnection(handler, 1002, "Incorrect hash received in Sec-WebSocket-Accept header.");
					return;
				}
				const secExtension = response.headersList.get("Sec-WebSocket-Extensions");
				let extensions;
				if (secExtension !== null) {
					extensions = parseExtensions(secExtension);
					if (!extensions.has("permessage-deflate")) {
						failWebsocketConnection(handler, 1002, "Sec-WebSocket-Extensions header does not match.");
						return;
					}
				}
				const secProtocol = response.headersList.get("Sec-WebSocket-Protocol");
				if (secProtocol !== null) {
					if (!getDecodeSplit("sec-websocket-protocol", request.headersList).includes(secProtocol)) {
						failWebsocketConnection(handler, 1002, "Protocol was not set in the opening handshake.");
						return;
					}
				}
				response.socket.on("data", handler.onSocketData);
				response.socket.on("close", handler.onSocketClose);
				response.socket.on("error", handler.onSocketError);
				handler.wasEverConnected = true;
				handler.onConnectionEstablished(response, extensions);
			}
		});
	}
	/**
	* @see https://whatpr.org/websockets/48.html#close-the-websocket
	* @param {import('./websocket').Handler} object
	* @param {number} [code=null]
	* @param {string} [reason='']
	*/
	function closeWebSocketConnection(object, code, reason, validate = false) {
		code ??= null;
		reason ??= "";
		if (validate) validateCloseCodeAndReason(code, reason);
		if (isClosed(object.readyState) || isClosing(object.readyState)) {} else if (!isEstablished(object.readyState)) {
			failWebsocketConnection(object);
			object.readyState = states.CLOSING;
		} else if (!object.closeState.has(sentCloseFrameState.SENT) && !object.closeState.has(sentCloseFrameState.RECEIVED)) {
			const frame = new WebsocketFrameSend();
			if (reason.length !== 0 && code === null) code = 1e3;
			assert$1(code === null || Number.isInteger(code));
			if (code === null && reason.length === 0) frame.frameData = emptyBuffer;
			else if (code !== null && reason === null) {
				frame.frameData = Buffer.allocUnsafe(2);
				frame.frameData.writeUInt16BE(code, 0);
			} else if (code !== null && reason !== null) {
				frame.frameData = Buffer.allocUnsafe(2 + Buffer.byteLength(reason));
				frame.frameData.writeUInt16BE(code, 0);
				frame.frameData.write(reason, 2, "utf-8");
			} else frame.frameData = emptyBuffer;
			object.socket.write(frame.createFrame(opcodes.CLOSE));
			object.closeState.add(sentCloseFrameState.SENT);
			object.readyState = states.CLOSING;
		} else object.readyState = states.CLOSING;
	}
	/**
	* @param {import('./websocket').Handler} handler
	* @param {number} code
	* @param {string|undefined} reason
	* @param {unknown} cause
	* @returns {void}
	*/
	function failWebsocketConnection(handler, code, reason, cause) {
		if (isEstablished(handler.readyState)) closeWebSocketConnection(handler, code, reason, false);
		handler.controller.abort();
		if (isConnecting(handler.readyState)) handler.onSocketClose();
		else if (handler.socket?.destroyed === false) handler.socket.destroy();
	}
	module.exports = {
		establishWebSocketConnection,
		failWebsocketConnection,
		closeWebSocketConnection
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/web/websocket/permessage-deflate.js
var require_permessage_deflate = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { createInflateRaw, Z_DEFAULT_WINDOWBITS } = __require("node:zlib");
	const { isValidClientWindowBits } = require_util$1();
	const { MessageSizeExceededError } = require_errors();
	const tail = Buffer.from([
		0,
		0,
		255,
		255
	]);
	const kBuffer = Symbol("kBuffer");
	const kLength = Symbol("kLength");
	var PerMessageDeflate = class {
		/** @type {import('node:zlib').InflateRaw} */
		#inflate;
		#options = {};
		#maxPayloadSize = 0;
		/**
		* @param {Map<string, string>} extensions
		*/
		constructor(extensions, options) {
			this.#options.serverNoContextTakeover = extensions.has("server_no_context_takeover");
			this.#options.serverMaxWindowBits = extensions.get("server_max_window_bits");
			this.#maxPayloadSize = options.maxPayloadSize;
		}
		/**
		* Decompress a compressed payload.
		* @param {Buffer} chunk Compressed data
		* @param {boolean} fin Final fragment flag
		* @param {Function} callback Callback function
		*/
		decompress(chunk, fin, callback) {
			if (!this.#inflate) {
				let windowBits = Z_DEFAULT_WINDOWBITS;
				if (this.#options.serverMaxWindowBits) {
					if (!isValidClientWindowBits(this.#options.serverMaxWindowBits)) {
						callback(/* @__PURE__ */ new Error("Invalid server_max_window_bits"));
						return;
					}
					windowBits = Number.parseInt(this.#options.serverMaxWindowBits);
				}
				try {
					this.#inflate = createInflateRaw({ windowBits });
				} catch (err) {
					callback(err);
					return;
				}
				this.#inflate[kBuffer] = [];
				this.#inflate[kLength] = 0;
				this.#inflate.on("data", (data) => {
					this.#inflate[kLength] += data.length;
					if (this.#maxPayloadSize > 0 && this.#inflate[kLength] > this.#maxPayloadSize) {
						callback(new MessageSizeExceededError());
						this.#inflate.removeAllListeners();
						this.#inflate = null;
						return;
					}
					this.#inflate[kBuffer].push(data);
				});
				this.#inflate.on("error", (err) => {
					this.#inflate = null;
					callback(err);
				});
			}
			this.#inflate.write(chunk);
			if (fin) this.#inflate.write(tail);
			this.#inflate.flush(() => {
				if (!this.#inflate) return;
				const full = Buffer.concat(this.#inflate[kBuffer], this.#inflate[kLength]);
				this.#inflate[kBuffer].length = 0;
				this.#inflate[kLength] = 0;
				callback(null, full);
			});
		}
	};
	module.exports = { PerMessageDeflate };
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/web/websocket/receiver.js
var require_receiver = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { Writable } = __require("node:stream");
	const assert = __require("node:assert");
	const { parserStates, opcodes, states, emptyBuffer, sentCloseFrameState } = require_constants();
	const { isValidStatusCode, isValidOpcode, websocketMessageReceived, utf8Decode, isControlFrame, isTextBinaryFrame, isContinuationFrame } = require_util$1();
	const { failWebsocketConnection } = require_connection();
	const { WebsocketFrameSend } = require_frame();
	const { PerMessageDeflate } = require_permessage_deflate();
	const { MessageSizeExceededError } = require_errors();
	var ByteParser = class extends Writable {
		#buffers = [];
		#fragmentsBytes = 0;
		#byteOffset = 0;
		#loop = false;
		#state = parserStates.INFO;
		#info = {};
		#fragments = [];
		/** @type {Map<string, PerMessageDeflate>} */
		#extensions;
		/** @type {import('./websocket').Handler} */
		#handler;
		/** @type {number} */
		#maxFragments;
		/** @type {number} */
		#maxPayloadSize;
		/**
		* @param {import('./websocket').Handler} handler
		* @param {Map<string, string>|null} extensions
		* @param {{ maxPayloadSize?: number }} [options]
		*/
		constructor(handler, extensions, options = {}) {
			super();
			this.#handler = handler;
			this.#extensions = extensions == null ? /* @__PURE__ */ new Map() : extensions;
			this.#maxFragments = options.maxFragments ?? 0;
			this.#maxPayloadSize = options.maxPayloadSize ?? 0;
			if (this.#extensions.has("permessage-deflate")) this.#extensions.set("permessage-deflate", new PerMessageDeflate(extensions, options));
		}
		/**
		* @param {Buffer} chunk
		* @param {() => void} callback
		*/
		_write(chunk, _, callback) {
			this.#buffers.push(chunk);
			this.#byteOffset += chunk.length;
			this.#loop = true;
			this.run(callback);
		}
		#validatePayloadLength() {
			if (this.#maxPayloadSize > 0 && !isControlFrame(this.#info.opcode) && this.#info.payloadLength + this.#fragmentsBytes > this.#maxPayloadSize) {
				failWebsocketConnection(this.#handler, 1009, "Payload size exceeds maximum allowed size");
				return false;
			}
			return true;
		}
		/**
		* Runs whenever a new chunk is received.
		* Callback is called whenever there are no more chunks buffering,
		* or not enough bytes are buffered to parse.
		*/
		run(callback) {
			while (this.#loop) if (this.#state === parserStates.INFO) {
				if (this.#byteOffset < 2) return callback();
				const buffer = this.consume(2);
				const fin = (buffer[0] & 128) !== 0;
				const opcode = buffer[0] & 15;
				const masked = (buffer[1] & 128) === 128;
				const fragmented = !fin && opcode !== opcodes.CONTINUATION;
				const payloadLength = buffer[1] & 127;
				const rsv1 = buffer[0] & 64;
				const rsv2 = buffer[0] & 32;
				const rsv3 = buffer[0] & 16;
				if (!isValidOpcode(opcode)) {
					failWebsocketConnection(this.#handler, 1002, "Invalid opcode received");
					return callback();
				}
				if (masked) {
					failWebsocketConnection(this.#handler, 1002, "Frame cannot be masked");
					return callback();
				}
				if (rsv1 !== 0 && !this.#extensions.has("permessage-deflate")) {
					failWebsocketConnection(this.#handler, 1002, "Expected RSV1 to be clear.");
					return;
				}
				if (rsv2 !== 0 || rsv3 !== 0) {
					failWebsocketConnection(this.#handler, 1002, "RSV1, RSV2, RSV3 must be clear");
					return;
				}
				if (fragmented && !isTextBinaryFrame(opcode)) {
					failWebsocketConnection(this.#handler, 1002, "Invalid frame type was fragmented.");
					return;
				}
				if (isTextBinaryFrame(opcode) && this.#fragments.length > 0) {
					failWebsocketConnection(this.#handler, 1002, "Expected continuation frame");
					return;
				}
				if (this.#info.fragmented && fragmented) {
					failWebsocketConnection(this.#handler, 1002, "Fragmented frame exceeded 125 bytes.");
					return;
				}
				if ((payloadLength > 125 || fragmented) && isControlFrame(opcode)) {
					failWebsocketConnection(this.#handler, 1002, "Control frame either too large or fragmented");
					return;
				}
				if (isContinuationFrame(opcode) && this.#fragments.length === 0 && !this.#info.compressed) {
					failWebsocketConnection(this.#handler, 1002, "Unexpected continuation frame");
					return;
				}
				if (payloadLength <= 125) {
					this.#info.payloadLength = payloadLength;
					this.#state = parserStates.READ_DATA;
					if (!this.#validatePayloadLength()) return;
				} else if (payloadLength === 126) this.#state = parserStates.PAYLOADLENGTH_16;
				else if (payloadLength === 127) this.#state = parserStates.PAYLOADLENGTH_64;
				if (isTextBinaryFrame(opcode)) {
					this.#info.binaryType = opcode;
					this.#info.compressed = rsv1 !== 0;
				}
				this.#info.opcode = opcode;
				this.#info.masked = masked;
				this.#info.fin = fin;
				this.#info.fragmented = fragmented;
			} else if (this.#state === parserStates.PAYLOADLENGTH_16) {
				if (this.#byteOffset < 2) return callback();
				const buffer = this.consume(2);
				this.#info.payloadLength = buffer.readUInt16BE(0);
				this.#state = parserStates.READ_DATA;
				if (!this.#validatePayloadLength()) return;
			} else if (this.#state === parserStates.PAYLOADLENGTH_64) {
				if (this.#byteOffset < 8) return callback();
				const buffer = this.consume(8);
				const upper = buffer.readUInt32BE(0);
				const lower = buffer.readUInt32BE(4);
				if (upper !== 0 || lower > 2 ** 31 - 1) {
					failWebsocketConnection(this.#handler, 1009, "Received payload length > 2^31 bytes.");
					return;
				}
				this.#info.payloadLength = lower;
				this.#state = parserStates.READ_DATA;
				if (!this.#validatePayloadLength()) return;
			} else if (this.#state === parserStates.READ_DATA) {
				if (this.#byteOffset < this.#info.payloadLength) return callback();
				const body = this.consume(this.#info.payloadLength);
				if (isControlFrame(this.#info.opcode)) {
					this.#loop = this.parseControlFrame(body);
					this.#state = parserStates.INFO;
				} else if (!this.#info.compressed) {
					if (!this.writeFragments(body)) return;
					if (!this.#info.fragmented && this.#info.fin) websocketMessageReceived(this.#handler, this.#info.binaryType, this.consumeFragments());
					this.#state = parserStates.INFO;
				} else {
					this.#extensions.get("permessage-deflate").decompress(body, this.#info.fin, (error, data) => {
						if (error) {
							const code = error instanceof MessageSizeExceededError ? 1009 : 1007;
							failWebsocketConnection(this.#handler, code, error.message);
							return;
						}
						if (!this.writeFragments(data)) return;
						if (this.#maxPayloadSize > 0 && this.#fragmentsBytes > this.#maxPayloadSize) {
							failWebsocketConnection(this.#handler, 1009, new MessageSizeExceededError().message);
							return;
						}
						if (!this.#info.fin) {
							this.#state = parserStates.INFO;
							this.#loop = true;
							this.run(callback);
							return;
						}
						websocketMessageReceived(this.#handler, this.#info.binaryType, this.consumeFragments());
						this.#loop = true;
						this.#state = parserStates.INFO;
						this.run(callback);
					}, this.#fragmentsBytes);
					this.#loop = false;
					break;
				}
			}
		}
		/**
		* Take n bytes from the buffered Buffers
		* @param {number} n
		* @returns {Buffer}
		*/
		consume(n) {
			if (n > this.#byteOffset) throw new Error("Called consume() before buffers satiated.");
			else if (n === 0) return emptyBuffer;
			this.#byteOffset -= n;
			const first = this.#buffers[0];
			if (first.length > n) {
				this.#buffers[0] = first.subarray(n, first.length);
				return first.subarray(0, n);
			} else if (first.length === n) return this.#buffers.shift();
			else {
				let offset = 0;
				const buffer = Buffer.allocUnsafeSlow(n);
				while (offset !== n) {
					const next = this.#buffers[0];
					const length = next.length;
					if (length + offset === n) {
						buffer.set(this.#buffers.shift(), offset);
						break;
					} else if (length + offset > n) {
						buffer.set(next.subarray(0, n - offset), offset);
						this.#buffers[0] = next.subarray(n - offset);
						break;
					} else {
						buffer.set(this.#buffers.shift(), offset);
						offset += length;
					}
				}
				return buffer;
			}
		}
		writeFragments(fragment) {
			if (this.#maxFragments > 0 && this.#fragments.length === this.#maxFragments) {
				failWebsocketConnection(this.#handler, 1008, "Too many message fragments");
				return false;
			}
			this.#fragmentsBytes += fragment.length;
			this.#fragments.push(fragment);
			return true;
		}
		consumeFragments() {
			const fragments = this.#fragments;
			if (fragments.length === 1) {
				this.#fragmentsBytes = 0;
				return fragments.shift();
			}
			let offset = 0;
			const output = Buffer.allocUnsafeSlow(this.#fragmentsBytes);
			for (let i = 0; i < fragments.length; ++i) {
				const buffer = fragments[i];
				output.set(buffer, offset);
				offset += buffer.length;
			}
			this.#fragments = [];
			this.#fragmentsBytes = 0;
			return output;
		}
		parseCloseBody(data) {
			assert(data.length !== 1);
			/** @type {number|undefined} */
			let code;
			if (data.length >= 2) code = data.readUInt16BE(0);
			if (code !== void 0 && !isValidStatusCode(code)) return {
				code: 1002,
				reason: "Invalid status code",
				error: true
			};
			/** @type {Buffer} */
			let reason = data.subarray(2);
			if (reason[0] === 239 && reason[1] === 187 && reason[2] === 191) reason = reason.subarray(3);
			try {
				reason = utf8Decode(reason);
			} catch {
				return {
					code: 1007,
					reason: "Invalid UTF-8",
					error: true
				};
			}
			return {
				code,
				reason,
				error: false
			};
		}
		/**
		* Parses control frames.
		* @param {Buffer} body
		*/
		parseControlFrame(body) {
			const { opcode, payloadLength } = this.#info;
			if (opcode === opcodes.CLOSE) {
				if (payloadLength === 1) {
					failWebsocketConnection(this.#handler, 1002, "Received close frame with a 1-byte body.");
					return false;
				}
				this.#info.closeInfo = this.parseCloseBody(body);
				if (this.#info.closeInfo.error) {
					const { code, reason } = this.#info.closeInfo;
					failWebsocketConnection(this.#handler, code, reason);
					return false;
				}
				if (!this.#handler.closeState.has(sentCloseFrameState.SENT) && !this.#handler.closeState.has(sentCloseFrameState.RECEIVED)) {
					let body = emptyBuffer;
					if (this.#info.closeInfo.code) {
						body = Buffer.allocUnsafe(2);
						body.writeUInt16BE(this.#info.closeInfo.code, 0);
					}
					const closeFrame = new WebsocketFrameSend(body);
					this.#handler.socket.write(closeFrame.createFrame(opcodes.CLOSE));
					this.#handler.closeState.add(sentCloseFrameState.SENT);
				}
				this.#handler.readyState = states.CLOSING;
				this.#handler.closeState.add(sentCloseFrameState.RECEIVED);
				return false;
			} else if (opcode === opcodes.PING) {
				if (!this.#handler.closeState.has(sentCloseFrameState.RECEIVED)) {
					const frame = new WebsocketFrameSend(body);
					this.#handler.socket.write(frame.createFrame(opcodes.PONG));
					this.#handler.onPing(body);
				}
			} else if (opcode === opcodes.PONG) this.#handler.onPong(body);
			return true;
		}
		get closingInfo() {
			return this.#info.closeInfo;
		}
	};
	module.exports = { ByteParser };
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/web/websocket/sender.js
var require_sender = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { WebsocketFrameSend } = require_frame();
	const { opcodes, sendHints } = require_constants();
	const FixedQueue = require_fixed_queue();
	/**
	* @typedef {object} SendQueueNode
	* @property {Promise<void> | null} promise
	* @property {((...args: any[]) => any)} callback
	* @property {Buffer | null} frame
	*/
	var SendQueue = class {
		/**
		* @type {FixedQueue}
		*/
		#queue = new FixedQueue();
		/**
		* @type {boolean}
		*/
		#running = false;
		/** @type {import('node:net').Socket} */
		#socket;
		constructor(socket) {
			this.#socket = socket;
		}
		add(item, cb, hint) {
			if (hint !== sendHints.blob) {
				if (!this.#running) {
					if (hint === sendHints.text) {
						const { 0: head, 1: body } = WebsocketFrameSend.createFastTextFrame(item);
						this.#socket.cork();
						this.#socket.write(head);
						this.#socket.write(body, cb);
						this.#socket.uncork();
					} else this.#socket.write(createFrame(item, hint), cb);
				} else {
					/** @type {SendQueueNode} */
					const node = {
						promise: null,
						callback: cb,
						frame: createFrame(item, hint)
					};
					this.#queue.push(node);
				}
				return;
			}
			/** @type {SendQueueNode} */
			const node = {
				promise: item.arrayBuffer().then((ab) => {
					node.promise = null;
					node.frame = createFrame(ab, hint);
				}),
				callback: cb,
				frame: null
			};
			this.#queue.push(node);
			if (!this.#running) this.#run();
		}
		async #run() {
			this.#running = true;
			const queue = this.#queue;
			while (!queue.isEmpty()) {
				const node = queue.shift();
				if (node.promise !== null) await node.promise;
				this.#socket.write(node.frame, node.callback);
				node.callback = node.frame = null;
			}
			this.#running = false;
		}
	};
	function createFrame(data, hint) {
		return new WebsocketFrameSend(toBuffer(data, hint)).createFrame(hint === sendHints.text ? opcodes.TEXT : opcodes.BINARY);
	}
	function toBuffer(data, hint) {
		switch (hint) {
			case sendHints.text:
			case sendHints.typedArray: return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
			case sendHints.arrayBuffer:
			case sendHints.blob: return new Uint8Array(data);
		}
	}
	module.exports = { SendQueue };
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/web/websocket/websocket.js
var require_websocket = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { isArrayBuffer } = __require("node:util/types");
	const { webidl } = require_webidl();
	const { URLSerializer } = require_data_url();
	const { environmentSettingsObject } = require_util$4();
	const { staticPropertyDescriptors, states, sentCloseFrameState, sendHints, opcodes } = require_constants();
	const { isConnecting, isEstablished, isClosing, isClosed, isValidSubprotocol, fireEvent, utf8Decode, toArrayBuffer, getURLRecord } = require_util$1();
	const { establishWebSocketConnection, closeWebSocketConnection, failWebsocketConnection } = require_connection();
	const { ByteParser } = require_receiver();
	const { kEnumerableProperty } = require_util$5();
	const { getGlobalDispatcher } = require_global();
	const { ErrorEvent, CloseEvent, createFastMessageEvent } = require_events();
	const { SendQueue } = require_sender();
	const { WebsocketFrameSend } = require_frame();
	const { channels } = require_diagnostics();
	function getSocketAddress(socket) {
		if (typeof socket?.address === "function") return socket.address();
		if (typeof socket?.session?.socket?.address === "function") return socket.session.socket.address();
		return null;
	}
	/**
	* @typedef {object} Handler
	* @property {(response: any, extensions?: string[]) => void} onConnectionEstablished
	* @property {(opcode: number, data: Buffer) => void} onMessage
	* @property {(error: Error) => void} onParserError
	* @property {() => void} onParserDrain
	* @property {(chunk: Buffer) => void} onSocketData
	* @property {(err: Error) => void} onSocketError
	* @property {() => void} onSocketClose
	* @property {(body: Buffer) => void} onPing
	* @property {(body: Buffer) => void} onPong
	*
	* @property {number} readyState
	* @property {import('stream').Duplex} socket
	* @property {Set<number>} closeState
	* @property {import('../fetch/index').Fetch} controller
	* @property {boolean} [wasEverConnected=false]
	*/
	var WebSocket = class WebSocket extends EventTarget {
		#events = {
			open: null,
			error: null,
			close: null,
			message: null
		};
		#bufferedAmount = 0;
		#protocol = "";
		#extensions = "";
		/** @type {SendQueue} */
		#sendQueue;
		/** @type {Handler} */
		#handler = {
			onConnectionEstablished: (response, extensions) => this.#onConnectionEstablished(response, extensions),
			onMessage: (opcode, data) => this.#onMessage(opcode, data),
			onParserError: (err) => failWebsocketConnection(this.#handler, null, err.message),
			onParserDrain: () => this.#onParserDrain(),
			onSocketData: (chunk) => {
				if (!this.#parser.write(chunk)) this.#handler.socket.pause();
			},
			onSocketError: (err) => {
				this.#handler.readyState = states.CLOSING;
				if (channels.socketError.hasSubscribers) channels.socketError.publish(err);
				this.#handler.socket.destroy();
			},
			onSocketClose: () => this.#onSocketClose(),
			onPing: (body) => {
				if (channels.ping.hasSubscribers) channels.ping.publish({
					payload: body,
					websocket: this
				});
			},
			onPong: (body) => {
				if (channels.pong.hasSubscribers) channels.pong.publish({
					payload: body,
					websocket: this
				});
			},
			readyState: states.CONNECTING,
			socket: null,
			closeState: /* @__PURE__ */ new Set(),
			controller: null,
			wasEverConnected: false
		};
		#url;
		#binaryType;
		/** @type {import('./receiver').ByteParser} */
		#parser;
		/**
		* @param {string} url
		* @param {string|string[]} protocols
		*/
		constructor(url, protocols = []) {
			super();
			webidl.util.markAsUncloneable(this);
			const prefix = "WebSocket constructor";
			webidl.argumentLengthCheck(arguments, 1, prefix);
			const options = webidl.converters["DOMString or sequence<DOMString> or WebSocketInit"](protocols, prefix, "options");
			url = webidl.converters.USVString(url);
			protocols = options.protocols;
			const baseURL = environmentSettingsObject.settingsObject.baseUrl;
			const urlRecord = getURLRecord(url, baseURL);
			if (typeof protocols === "string") protocols = [protocols];
			if (protocols.length !== new Set(protocols.map((p) => p.toLowerCase())).size) throw new DOMException("Invalid Sec-WebSocket-Protocol value", "SyntaxError");
			if (protocols.length > 0 && !protocols.every((p) => isValidSubprotocol(p))) throw new DOMException("Invalid Sec-WebSocket-Protocol value", "SyntaxError");
			this.#url = new URL(urlRecord.href);
			const client = environmentSettingsObject.settingsObject;
			this.#handler.controller = establishWebSocketConnection(urlRecord, protocols, client, this.#handler, options);
			this.#handler.readyState = WebSocket.CONNECTING;
			this.#binaryType = "blob";
		}
		/**
		* @see https://websockets.spec.whatwg.org/#dom-websocket-close
		* @param {number|undefined} code
		* @param {string|undefined} reason
		*/
		close(code = void 0, reason = void 0) {
			webidl.brandCheck(this, WebSocket);
			const prefix = "WebSocket.close";
			if (code !== void 0) code = webidl.converters["unsigned short"](code, prefix, "code", webidl.attributes.Clamp);
			if (reason !== void 0) reason = webidl.converters.USVString(reason);
			code ??= null;
			reason ??= "";
			closeWebSocketConnection(this.#handler, code, reason, true);
		}
		/**
		* @see https://websockets.spec.whatwg.org/#dom-websocket-send
		* @param {NodeJS.TypedArray|ArrayBuffer|Blob|string} data
		*/
		send(data) {
			webidl.brandCheck(this, WebSocket);
			const prefix = "WebSocket.send";
			webidl.argumentLengthCheck(arguments, 1, prefix);
			data = webidl.converters.WebSocketSendData(data, prefix, "data");
			if (isConnecting(this.#handler.readyState)) throw new DOMException("Sent before connected.", "InvalidStateError");
			if (!isEstablished(this.#handler.readyState) || isClosing(this.#handler.readyState)) return;
			if (typeof data === "string") {
				const buffer = Buffer.from(data);
				this.#bufferedAmount += buffer.byteLength;
				this.#sendQueue.add(buffer, () => {
					this.#bufferedAmount -= buffer.byteLength;
				}, sendHints.text);
			} else if (isArrayBuffer(data)) {
				this.#bufferedAmount += data.byteLength;
				this.#sendQueue.add(data, () => {
					this.#bufferedAmount -= data.byteLength;
				}, sendHints.arrayBuffer);
			} else if (ArrayBuffer.isView(data)) {
				this.#bufferedAmount += data.byteLength;
				this.#sendQueue.add(data, () => {
					this.#bufferedAmount -= data.byteLength;
				}, sendHints.typedArray);
			} else if (webidl.is.Blob(data)) {
				this.#bufferedAmount += data.size;
				this.#sendQueue.add(data, () => {
					this.#bufferedAmount -= data.size;
				}, sendHints.blob);
			}
		}
		get readyState() {
			webidl.brandCheck(this, WebSocket);
			return this.#handler.readyState;
		}
		get bufferedAmount() {
			webidl.brandCheck(this, WebSocket);
			return this.#bufferedAmount;
		}
		get url() {
			webidl.brandCheck(this, WebSocket);
			return URLSerializer(this.#url);
		}
		get extensions() {
			webidl.brandCheck(this, WebSocket);
			return this.#extensions;
		}
		get protocol() {
			webidl.brandCheck(this, WebSocket);
			return this.#protocol;
		}
		get onopen() {
			webidl.brandCheck(this, WebSocket);
			return this.#events.open;
		}
		set onopen(fn) {
			webidl.brandCheck(this, WebSocket);
			if (this.#events.open) this.removeEventListener("open", this.#events.open);
			const listener = webidl.converters.EventHandlerNonNull(fn);
			if (listener !== null) {
				this.addEventListener("open", listener);
				this.#events.open = fn;
			} else this.#events.open = null;
		}
		get onerror() {
			webidl.brandCheck(this, WebSocket);
			return this.#events.error;
		}
		set onerror(fn) {
			webidl.brandCheck(this, WebSocket);
			if (this.#events.error) this.removeEventListener("error", this.#events.error);
			const listener = webidl.converters.EventHandlerNonNull(fn);
			if (listener !== null) {
				this.addEventListener("error", listener);
				this.#events.error = fn;
			} else this.#events.error = null;
		}
		get onclose() {
			webidl.brandCheck(this, WebSocket);
			return this.#events.close;
		}
		set onclose(fn) {
			webidl.brandCheck(this, WebSocket);
			if (this.#events.close) this.removeEventListener("close", this.#events.close);
			const listener = webidl.converters.EventHandlerNonNull(fn);
			if (listener !== null) {
				this.addEventListener("close", listener);
				this.#events.close = fn;
			} else this.#events.close = null;
		}
		get onmessage() {
			webidl.brandCheck(this, WebSocket);
			return this.#events.message;
		}
		set onmessage(fn) {
			webidl.brandCheck(this, WebSocket);
			if (this.#events.message) this.removeEventListener("message", this.#events.message);
			const listener = webidl.converters.EventHandlerNonNull(fn);
			if (listener !== null) {
				this.addEventListener("message", listener);
				this.#events.message = fn;
			} else this.#events.message = null;
		}
		get binaryType() {
			webidl.brandCheck(this, WebSocket);
			return this.#binaryType;
		}
		set binaryType(type) {
			webidl.brandCheck(this, WebSocket);
			if (type !== "blob" && type !== "arraybuffer") this.#binaryType = "blob";
			else this.#binaryType = type;
		}
		/**
		* @see https://websockets.spec.whatwg.org/#feedback-from-the-protocol
		*/
		#onConnectionEstablished(response, parsedExtensions) {
			this.#handler.socket = response.socket;
			const maxFragments = this.#handler.controller.dispatcher?.webSocketOptions?.maxFragments;
			const maxPayloadSize = this.#handler.controller.dispatcher?.webSocketOptions?.maxPayloadSize;
			const parser = new ByteParser(this.#handler, parsedExtensions, {
				maxFragments,
				maxPayloadSize
			});
			parser.on("drain", () => this.#handler.onParserDrain());
			parser.on("error", (err) => this.#handler.onParserError(err));
			this.#parser = parser;
			this.#sendQueue = new SendQueue(response.socket);
			this.#handler.readyState = states.OPEN;
			const extensions = response.headersList.get("sec-websocket-extensions");
			if (extensions !== null) this.#extensions = extensions;
			const protocol = response.headersList.get("sec-websocket-protocol");
			if (protocol !== null) this.#protocol = protocol;
			fireEvent("open", this);
			if (channels.open.hasSubscribers) {
				const headers = response.headersList.entries;
				channels.open.publish({
					address: getSocketAddress(response.socket),
					protocol: this.#protocol,
					extensions: this.#extensions,
					websocket: this,
					handshakeResponse: {
						status: response.status,
						statusText: response.statusText,
						headers
					}
				});
			}
		}
		#onMessage(type, data) {
			if (this.#handler.readyState !== states.OPEN) return;
			let dataForEvent;
			if (type === opcodes.TEXT) try {
				dataForEvent = utf8Decode(data);
			} catch {
				failWebsocketConnection(this.#handler, 1007, "Received invalid UTF-8 in text frame.");
				return;
			}
			else if (type === opcodes.BINARY) {
				if (this.#binaryType === "blob") dataForEvent = new Blob([data]);
				else dataForEvent = toArrayBuffer(data);
			}
			fireEvent("message", this, createFastMessageEvent, {
				origin: this.#url.origin,
				data: dataForEvent
			});
		}
		#onParserDrain() {
			this.#handler.socket.resume();
		}
		/**
		* @see https://websockets.spec.whatwg.org/#feedback-from-the-protocol
		* @see https://datatracker.ietf.org/doc/html/rfc6455#section-7.1.4
		*/
		#onSocketClose() {
			const wasClean = this.#handler.closeState.has(sentCloseFrameState.SENT) && this.#handler.closeState.has(sentCloseFrameState.RECEIVED);
			let code = 1005;
			let reason = "";
			const result = this.#parser?.closingInfo;
			if (result && !result.error) {
				code = result.code ?? 1005;
				reason = result.reason;
			}
			this.#handler.readyState = states.CLOSED;
			if (!this.#handler.closeState.has(sentCloseFrameState.RECEIVED)) {
				code = 1006;
				fireEvent("error", this, (type, init) => new ErrorEvent(type, init), { error: new TypeError(reason) });
			}
			fireEvent("close", this, (type, init) => new CloseEvent(type, init), {
				wasClean,
				code,
				reason
			});
			if (channels.close.hasSubscribers) channels.close.publish({
				websocket: this,
				code,
				reason
			});
		}
		/**
		* @param {WebSocket} ws
		* @param {Buffer|undefined} buffer
		*/
		static ping(ws, buffer) {
			if (Buffer.isBuffer(buffer)) {
				if (buffer.length > 125) throw new TypeError("A PING frame cannot have a body larger than 125 bytes.");
			} else if (buffer !== void 0) throw new TypeError("Expected buffer payload");
			const readyState = ws.#handler.readyState;
			if (isEstablished(readyState) && !isClosing(readyState) && !isClosed(readyState)) {
				const frame = new WebsocketFrameSend(buffer);
				ws.#handler.socket.write(frame.createFrame(opcodes.PING));
			}
		}
	};
	const { ping } = WebSocket;
	Reflect.deleteProperty(WebSocket, "ping");
	WebSocket.CONNECTING = WebSocket.prototype.CONNECTING = states.CONNECTING;
	WebSocket.OPEN = WebSocket.prototype.OPEN = states.OPEN;
	WebSocket.CLOSING = WebSocket.prototype.CLOSING = states.CLOSING;
	WebSocket.CLOSED = WebSocket.prototype.CLOSED = states.CLOSED;
	Object.defineProperties(WebSocket.prototype, {
		CONNECTING: staticPropertyDescriptors,
		OPEN: staticPropertyDescriptors,
		CLOSING: staticPropertyDescriptors,
		CLOSED: staticPropertyDescriptors,
		url: kEnumerableProperty,
		readyState: kEnumerableProperty,
		bufferedAmount: kEnumerableProperty,
		onopen: kEnumerableProperty,
		onerror: kEnumerableProperty,
		onclose: kEnumerableProperty,
		close: kEnumerableProperty,
		onmessage: kEnumerableProperty,
		binaryType: kEnumerableProperty,
		send: kEnumerableProperty,
		extensions: kEnumerableProperty,
		protocol: kEnumerableProperty,
		[Symbol.toStringTag]: {
			value: "WebSocket",
			writable: false,
			enumerable: false,
			configurable: true
		}
	});
	Object.defineProperties(WebSocket, {
		CONNECTING: staticPropertyDescriptors,
		OPEN: staticPropertyDescriptors,
		CLOSING: staticPropertyDescriptors,
		CLOSED: staticPropertyDescriptors
	});
	webidl.converters["sequence<DOMString>"] = webidl.sequenceConverter(webidl.converters.DOMString);
	webidl.converters["DOMString or sequence<DOMString>"] = function(V, prefix, argument) {
		if (webidl.util.Type(V) === webidl.util.Types.OBJECT && Symbol.iterator in V) return webidl.converters["sequence<DOMString>"](V);
		return webidl.converters.DOMString(V, prefix, argument);
	};
	webidl.converters.WebSocketInit = webidl.dictionaryConverter([
		{
			key: "protocols",
			converter: webidl.converters["DOMString or sequence<DOMString>"],
			defaultValue: () => []
		},
		{
			key: "dispatcher",
			converter: webidl.converters.any,
			defaultValue: () => getGlobalDispatcher()
		},
		{
			key: "headers",
			converter: webidl.nullableConverter(webidl.converters.HeadersInit)
		}
	]);
	webidl.converters["DOMString or sequence<DOMString> or WebSocketInit"] = function(V) {
		if (webidl.util.Type(V) === webidl.util.Types.OBJECT && !(Symbol.iterator in V)) return webidl.converters.WebSocketInit(V);
		return { protocols: webidl.converters["DOMString or sequence<DOMString>"](V) };
	};
	webidl.converters.WebSocketSendData = function(V) {
		if (webidl.util.Type(V) === webidl.util.Types.OBJECT) {
			if (webidl.is.Blob(V)) return V;
			if (webidl.is.BufferSource(V)) return V;
		}
		return webidl.converters.USVString(V);
	};
	module.exports = {
		WebSocket,
		ping
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/web/websocket/stream/websocketerror.js
var require_websocketerror = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { webidl } = require_webidl();
	const { validateCloseCodeAndReason } = require_util$1();
	const { kConstruct } = require_symbols();
	const { kEnumerableProperty } = require_util$5();
	function createInheritableDOMException() {
		class Test extends DOMException {
			get reason() {
				return "";
			}
		}
		if (new Test().reason !== void 0) return DOMException;
		return new Proxy(DOMException, { construct(target, args, newTarget) {
			const instance = Reflect.construct(target, args, target);
			Object.setPrototypeOf(instance, newTarget.prototype);
			return instance;
		} });
	}
	var WebSocketError = class WebSocketError extends createInheritableDOMException() {
		#closeCode;
		#reason;
		constructor(message = "", init = void 0) {
			message = webidl.converters.DOMString(message, "WebSocketError", "message");
			super(message, "WebSocketError");
			if (init === kConstruct) return;
			else if (init !== null) init = webidl.converters.WebSocketCloseInfo(init);
			let code = init.closeCode ?? null;
			const reason = init.reason ?? "";
			validateCloseCodeAndReason(code, reason);
			if (reason.length !== 0 && code === null) code = 1e3;
			this.#closeCode = code;
			this.#reason = reason;
		}
		get closeCode() {
			return this.#closeCode;
		}
		get reason() {
			return this.#reason;
		}
		/**
		* @param {string} message
		* @param {number|null} code
		* @param {string} reason
		*/
		static createUnvalidatedWebSocketError(message, code, reason) {
			const error = new WebSocketError(message, kConstruct);
			error.#closeCode = code;
			error.#reason = reason;
			return error;
		}
	};
	const { createUnvalidatedWebSocketError } = WebSocketError;
	delete WebSocketError.createUnvalidatedWebSocketError;
	Object.defineProperties(WebSocketError.prototype, {
		closeCode: kEnumerableProperty,
		reason: kEnumerableProperty,
		[Symbol.toStringTag]: {
			value: "WebSocketError",
			writable: false,
			enumerable: false,
			configurable: true
		}
	});
	webidl.is.WebSocketError = webidl.util.MakeTypeAssertion(WebSocketError);
	module.exports = {
		WebSocketError,
		createUnvalidatedWebSocketError
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/web/websocket/stream/websocketstream.js
var require_websocketstream = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { addAbortListener } = __require("node:events");
	const { environmentSettingsObject, readableStreamClose } = require_util$4();
	const { states, opcodes, sentCloseFrameState } = require_constants();
	const { webidl } = require_webidl();
	const { getURLRecord, isValidSubprotocol, isEstablished, utf8Decode } = require_util$1();
	const { establishWebSocketConnection, failWebsocketConnection, closeWebSocketConnection } = require_connection();
	const { channels } = require_diagnostics();
	const { WebsocketFrameSend } = require_frame();
	const { ByteParser } = require_receiver();
	const { WebSocketError, createUnvalidatedWebSocketError } = require_websocketerror();
	const { kEnumerableProperty } = require_util$5();
	const { utf8DecodeBytes } = require_encoding();
	let emittedExperimentalWarning = false;
	var WebSocketStream = class {
		/** @type {URL} */
		#url;
		/** @type {ReturnType<typeof Promise.withResolvers>} */
		#openedPromise;
		/** @type {ReturnType<typeof Promise.withResolvers>} */
		#closedPromise;
		/** @type {ReadableStream} */
		#readableStream;
		/** @type {ReadableStreamDefaultController} */
		#readableStreamController;
		/** @type {WritableStream} */
		#writableStream;
		#handshakeAborted = false;
		/** @type {import('../websocket').Handler} */
		#handler = {
			onConnectionEstablished: (response, extensions) => this.#onConnectionEstablished(response, extensions),
			onMessage: (opcode, data) => this.#onMessage(opcode, data),
			onParserError: (err) => failWebsocketConnection(this.#handler, null, err.message),
			onParserDrain: () => this.#handler.socket.resume(),
			onSocketData: (chunk) => {
				if (!this.#parser.write(chunk)) this.#handler.socket.pause();
			},
			onSocketError: (err) => {
				this.#handler.readyState = states.CLOSING;
				if (channels.socketError.hasSubscribers) channels.socketError.publish(err);
				this.#handler.socket.destroy();
			},
			onSocketClose: () => this.#onSocketClose(),
			onPing: () => {},
			onPong: () => {},
			readyState: states.CONNECTING,
			socket: null,
			closeState: /* @__PURE__ */ new Set(),
			controller: null,
			wasEverConnected: false
		};
		/** @type {import('../receiver').ByteParser} */
		#parser;
		constructor(url, options = void 0) {
			if (!emittedExperimentalWarning) {
				process.emitWarning("WebSocketStream is experimental! Expect it to change at any time.", { code: "UNDICI-WSS" });
				emittedExperimentalWarning = true;
			}
			webidl.argumentLengthCheck(arguments, 1, "WebSocket");
			url = webidl.converters.USVString(url);
			if (options !== null) options = webidl.converters.WebSocketStreamOptions(options);
			const baseURL = environmentSettingsObject.settingsObject.baseUrl;
			const urlRecord = getURLRecord(url, baseURL);
			const protocols = options.protocols;
			if (protocols.length !== new Set(protocols.map((p) => p.toLowerCase())).size) throw new DOMException("Invalid Sec-WebSocket-Protocol value", "SyntaxError");
			if (protocols.length > 0 && !protocols.every((p) => isValidSubprotocol(p))) throw new DOMException("Invalid Sec-WebSocket-Protocol value", "SyntaxError");
			this.#url = urlRecord.toString();
			this.#openedPromise = Promise.withResolvers();
			this.#closedPromise = Promise.withResolvers();
			if (options.signal != null) {
				const signal = options.signal;
				if (signal.aborted) {
					this.#openedPromise.reject(signal.reason);
					this.#closedPromise.reject(signal.reason);
					return;
				}
				addAbortListener(signal, () => {
					if (!isEstablished(this.#handler.readyState)) {
						failWebsocketConnection(this.#handler);
						this.#handler.readyState = states.CLOSING;
						this.#openedPromise.reject(signal.reason);
						this.#closedPromise.reject(signal.reason);
						this.#handshakeAborted = true;
					}
				});
			}
			const client = environmentSettingsObject.settingsObject;
			this.#handler.controller = establishWebSocketConnection(urlRecord, protocols, client, this.#handler, options);
		}
		get url() {
			return this.#url.toString();
		}
		get opened() {
			return this.#openedPromise.promise;
		}
		get closed() {
			return this.#closedPromise.promise;
		}
		close(closeInfo = void 0) {
			if (closeInfo !== null) closeInfo = webidl.converters.WebSocketCloseInfo(closeInfo);
			const code = closeInfo.closeCode ?? null;
			const reason = closeInfo.reason;
			closeWebSocketConnection(this.#handler, code, reason, true);
		}
		#write(chunk) {
			chunk = webidl.converters.WebSocketStreamWrite(chunk);
			const promise = Promise.withResolvers();
			let data = null;
			let opcode = null;
			if (webidl.is.BufferSource(chunk)) {
				data = new Uint8Array(ArrayBuffer.isView(chunk) ? new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength) : chunk.slice());
				opcode = opcodes.BINARY;
			} else {
				let string;
				try {
					string = webidl.converters.DOMString(chunk);
				} catch (e) {
					promise.reject(e);
					return promise.promise;
				}
				data = new TextEncoder().encode(string);
				opcode = opcodes.TEXT;
			}
			if (!this.#handler.closeState.has(sentCloseFrameState.SENT) && !this.#handler.closeState.has(sentCloseFrameState.RECEIVED)) {
				const frame = new WebsocketFrameSend(data);
				this.#handler.socket.write(frame.createFrame(opcode), () => {
					promise.resolve(void 0);
				});
			}
			return promise.promise;
		}
		/** @type {import('../websocket').Handler['onConnectionEstablished']} */
		#onConnectionEstablished(response, parsedExtensions) {
			this.#handler.socket = response.socket;
			const maxFragments = this.#handler.controller.dispatcher?.webSocketOptions?.maxFragments;
			const maxPayloadSize = this.#handler.controller.dispatcher?.webSocketOptions?.maxPayloadSize;
			const parser = new ByteParser(this.#handler, parsedExtensions, {
				maxFragments,
				maxPayloadSize
			});
			parser.on("drain", () => this.#handler.onParserDrain());
			parser.on("error", (err) => this.#handler.onParserError(err));
			this.#parser = parser;
			this.#handler.readyState = states.OPEN;
			const extensions = parsedExtensions ?? "";
			const protocol = response.headersList.get("sec-websocket-protocol") ?? "";
			const readable = new ReadableStream({
				start: (controller) => {
					this.#readableStreamController = controller;
				},
				cancel: (reason) => this.#cancel(reason)
			});
			const writable = new WritableStream({
				write: (chunk) => this.#write(chunk),
				close: () => closeWebSocketConnection(this.#handler, null, null),
				abort: (reason) => this.#closeUsingReason(reason)
			});
			this.#readableStream = readable;
			this.#writableStream = writable;
			this.#openedPromise.resolve({
				extensions,
				protocol,
				readable,
				writable
			});
		}
		/** @type {import('../websocket').Handler['onMessage']} */
		#onMessage(type, data) {
			if (this.#handler.readyState !== states.OPEN) return;
			let chunk;
			if (type === opcodes.TEXT) try {
				chunk = utf8Decode(data);
			} catch {
				failWebsocketConnection(this.#handler, 1007, "Received invalid UTF-8 in text frame.");
				return;
			}
			else if (type === opcodes.BINARY) chunk = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
			this.#readableStreamController.enqueue(chunk);
		}
		/** @type {import('../websocket').Handler['onSocketClose']} */
		#onSocketClose() {
			const wasClean = this.#handler.closeState.has(sentCloseFrameState.SENT) && this.#handler.closeState.has(sentCloseFrameState.RECEIVED);
			this.#handler.readyState = states.CLOSED;
			if (this.#handshakeAborted) return;
			if (!this.#handler.wasEverConnected) this.#openedPromise.reject(new WebSocketError("Socket never opened"));
			const result = this.#parser?.closingInfo;
			let code = result?.code ?? 1005;
			if (!this.#handler.closeState.has(sentCloseFrameState.SENT) && !this.#handler.closeState.has(sentCloseFrameState.RECEIVED)) code = 1006;
			const reason = result?.reason == null ? "" : utf8DecodeBytes(Buffer.from(result.reason));
			if (wasClean) {
				readableStreamClose(this.#readableStreamController);
				if (!this.#writableStream.locked) this.#writableStream.abort(new DOMException("A closed WebSocketStream cannot be written to", "InvalidStateError"));
				this.#closedPromise.resolve({
					closeCode: code,
					reason
				});
			} else {
				const error = createUnvalidatedWebSocketError("unclean close", code, reason);
				this.#readableStreamController?.error(error);
				this.#writableStream?.abort(error);
				this.#closedPromise.reject(error);
			}
		}
		#closeUsingReason(reason) {
			let code = null;
			let reasonString = "";
			if (webidl.is.WebSocketError(reason)) {
				code = reason.closeCode;
				reasonString = reason.reason;
			}
			closeWebSocketConnection(this.#handler, code, reasonString);
		}
		#cancel(reason) {
			this.#closeUsingReason(reason);
		}
	};
	Object.defineProperties(WebSocketStream.prototype, {
		url: kEnumerableProperty,
		opened: kEnumerableProperty,
		closed: kEnumerableProperty,
		close: kEnumerableProperty,
		[Symbol.toStringTag]: {
			value: "WebSocketStream",
			writable: false,
			enumerable: false,
			configurable: true
		}
	});
	webidl.converters.WebSocketStreamOptions = webidl.dictionaryConverter([{
		key: "protocols",
		converter: webidl.sequenceConverter(webidl.converters.USVString),
		defaultValue: () => []
	}, {
		key: "signal",
		converter: webidl.nullableConverter(webidl.converters.AbortSignal),
		defaultValue: () => null
	}]);
	webidl.converters.WebSocketCloseInfo = webidl.dictionaryConverter([{
		key: "closeCode",
		converter: (V) => webidl.converters["unsigned short"](V, webidl.attributes.EnforceRange)
	}, {
		key: "reason",
		converter: webidl.converters.USVString,
		defaultValue: () => ""
	}]);
	webidl.converters.WebSocketStreamWrite = function(V) {
		if (typeof V === "string") return webidl.converters.USVString(V);
		return webidl.converters.BufferSource(V);
	};
	module.exports = { WebSocketStream };
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/web/eventsource/util.js
var require_util = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { makeRequest } = require_request();
	/**
	* Checks if the given value is a valid LastEventId.
	* @param {string} value
	* @returns {boolean}
	*/
	function isValidLastEventId(value) {
		return value.indexOf("\0") === -1;
	}
	/**
	* Checks if the given value is a base 10 digit.
	* @param {string} value
	* @returns {boolean}
	*/
	function isASCIINumber(value) {
		if (value.length === 0) return false;
		for (let i = 0; i < value.length; i++) if (value.charCodeAt(i) < 48 || value.charCodeAt(i) > 57) return false;
		return true;
	}
	function createPotentialCORSRequest(url, destination, corsAttributeState, sameOriginFallback) {
		let mode = corsAttributeState === "no cors" ? "no-cors" : "cors";
		if (sameOriginFallback && mode === "no-cors") mode = "same-origin";
		let credentialsMode = "include";
		if (corsAttributeState === "anonymous") credentialsMode = "same-origin";
		return makeRequest({
			urlList: [url],
			destination,
			mode,
			credentials: credentialsMode,
			useURLCredentials: true
		});
	}
	module.exports = {
		isValidLastEventId,
		isASCIINumber,
		createPotentialCORSRequest
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/web/eventsource/eventsource-stream.js
var require_eventsource_stream = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { Transform } = __require("node:stream");
	const { isASCIINumber, isValidLastEventId } = require_util();
	/**
	* @type {number[]} BOM
	*/
	const BOM = [
		239,
		187,
		191
	];
	/**
	* @type {10} LF
	*/
	const LF = 10;
	/**
	* @type {13} CR
	*/
	const CR = 13;
	/**
	* @type {58} COLON
	*/
	const COLON = 58;
	/**
	* @type {32} SPACE
	*/
	const SPACE = 32;
	const DATA = Buffer.from("data");
	const EVENT = Buffer.from("event");
	const ID = Buffer.from("id");
	const RETRY = Buffer.from("retry");
	function isASCIINumberBytes(buffer, start) {
		if (start >= buffer.length) return false;
		for (let i = start; i < buffer.length; i++) if (buffer[i] < 48 || buffer[i] > 57) return false;
		return true;
	}
	function isValidLastEventIdBytes(buffer, start) {
		for (let i = start; i < buffer.length; i++) if (buffer[i] === 0) return false;
		return true;
	}
	function isFieldName(line, length, field) {
		if (length !== field.length) return false;
		for (let i = 0; i < length; i++) if (line[i] !== field[i]) return false;
		return true;
	}
	/**
	* @typedef {object} EventSourceStreamEvent
	* @type {object}
	* @property {string} [event] The event type.
	* @property {string} [data] The data of the message.
	* @property {string} [id] A unique ID for the event.
	* @property {string} [retry] The reconnection time, in milliseconds.
	*/
	/**
	* @typedef eventSourceSettings
	* @type {object}
	* @property {string} [lastEventId] The last event ID received from the server.
	* @property {string} [origin] The origin of the event source.
	* @property {number} [reconnectionTime] The reconnection time, in milliseconds.
	*/
	var EventSourceStream = class extends Transform {
		/**
		* @type {eventSourceSettings}
		*/
		state;
		/**
		* Leading byte-order-mark check.
		* @type {boolean}
		*/
		checkBOM = true;
		/**
		* @type {boolean}
		*/
		crlfCheck = false;
		/**
		* @type {boolean}
		*/
		eventEndCheck = false;
		/**
		* @type {Buffer[]}
		*/
		chunks = [];
		chunkIndex = 0;
		pos = 0;
		lineChunkIndex = 0;
		linePos = 0;
		event = {
			data: void 0,
			event: void 0,
			id: void 0,
			retry: void 0
		};
		/**
		* @param {object} options
		* @param {boolean} [options.readableObjectMode]
		* @param {eventSourceSettings} [options.eventSourceSettings]
		* @param {(chunk: any, encoding?: BufferEncoding | undefined) => boolean} [options.push]
		*/
		constructor(options = {}) {
			options.readableObjectMode = true;
			super(options);
			this.state = options.eventSourceSettings || {};
			if (options.push) this.push = options.push;
		}
		/**
		* @param {Buffer} chunk
		* @param {string} _encoding
		* @param {Function} callback
		* @returns {void}
		*/
		_transform(chunk, _encoding, callback) {
			if (chunk.length === 0) {
				callback();
				return;
			}
			this.chunks.push(chunk);
			if (this.checkBOM) {
				if (this.handleBOM()) {
					callback();
					return;
				}
			}
			while (this.hasCurrentByte()) {
				const byte = this.currentByte();
				if (this.eventEndCheck) {
					if (this.crlfCheck) {
						if (byte === LF) {
							this.crlfCheck = false;
							this.consumeCurrentByte();
							continue;
						}
						this.crlfCheck = false;
					}
					if (byte === LF || byte === CR) {
						if (byte === CR) this.crlfCheck = true;
						this.consumeCurrentByte();
						if (this.hasPendingEvent()) this.processEvent(this.event);
						this.clearEvent();
						continue;
					}
					this.eventEndCheck = false;
					continue;
				}
				if (byte === LF || byte === CR) {
					if (byte === CR) this.crlfCheck = true;
					this.parseLine(this.readLine(), this.event);
					this.consumeCurrentByte();
					this.eventEndCheck = true;
					continue;
				}
				this.advanceCursor();
			}
			callback();
		}
		/**
		* @param {Buffer} line
		* @param {EventSourceStreamEvent} event
		*/
		parseLine(line, event) {
			if (line.length === 0) return;
			const colonPosition = line.indexOf(COLON);
			if (colonPosition === 0) return;
			let fieldLength = line.length;
			let valueStart = line.length;
			if (colonPosition !== -1) {
				fieldLength = colonPosition;
				valueStart = colonPosition + 1;
				if (line[valueStart] === SPACE) ++valueStart;
			}
			if (isFieldName(line, fieldLength, DATA)) {
				const value = line.toString("utf8", valueStart);
				if (event.data === void 0) event.data = value;
				else event.data += `\n${value}`;
				return;
			}
			if (isFieldName(line, fieldLength, RETRY)) {
				if (isASCIINumberBytes(line, valueStart)) event.retry = line.toString("utf8", valueStart);
				return;
			}
			if (isFieldName(line, fieldLength, ID)) {
				if (isValidLastEventIdBytes(line, valueStart)) event.id = line.toString("utf8", valueStart);
				return;
			}
			if (isFieldName(line, fieldLength, EVENT)) {
				const value = line.toString("utf8", valueStart);
				if (value.length > 0) event.event = value;
			}
		}
		/**
		* @param {EventSourceStreamEvent} event
		*/
		processEvent(event) {
			if (event.retry && isASCIINumber(event.retry)) this.state.reconnectionTime = parseInt(event.retry, 10);
			if (event.id !== void 0 && isValidLastEventId(event.id)) this.state.lastEventId = event.id;
			if (event.data !== void 0) this.push({
				type: event.event || "message",
				options: {
					data: event.data,
					lastEventId: this.state.lastEventId,
					origin: this.state.origin
				}
			});
		}
		clearEvent() {
			this.event.data = void 0;
			this.event.event = void 0;
			this.event.id = void 0;
			this.event.retry = void 0;
		}
		hasPendingEvent() {
			return this.event.data !== void 0 || this.event.event !== void 0 || this.event.id !== void 0 || this.event.retry !== void 0;
		}
		hasCurrentByte() {
			return this.chunkIndex < this.chunks.length && this.pos < this.chunks[this.chunkIndex].length;
		}
		currentByte() {
			return this.chunks[this.chunkIndex][this.pos];
		}
		consumeCurrentByte() {
			this.advanceCursor();
			this.syncLineStartToCursor();
		}
		advanceCursor() {
			this.pos++;
			while (this.chunkIndex < this.chunks.length && this.pos >= this.chunks[this.chunkIndex].length) {
				this.chunkIndex++;
				this.pos = 0;
			}
		}
		syncLineStartToCursor() {
			this.lineChunkIndex = this.chunkIndex;
			this.linePos = this.pos;
			this.dropConsumedChunks();
		}
		dropConsumedChunks() {
			while (this.lineChunkIndex > 0) {
				this.chunks.shift();
				this.lineChunkIndex--;
				this.chunkIndex--;
			}
			if (this.chunkIndex === this.chunks.length) {
				this.chunks.length = 0;
				this.chunkIndex = 0;
				this.pos = 0;
				this.lineChunkIndex = 0;
				this.linePos = 0;
			}
		}
		readLine() {
			if (this.lineChunkIndex === this.chunkIndex) return this.chunks[this.chunkIndex].subarray(this.linePos, this.pos);
			const chunks = [];
			let length = 0;
			for (let i = this.lineChunkIndex; i <= this.chunkIndex; i++) {
				const chunk = this.chunks[i];
				const start = i === this.lineChunkIndex ? this.linePos : 0;
				const end = i === this.chunkIndex ? this.pos : chunk.length;
				const slice = chunk.subarray(start, end);
				length += slice.length;
				chunks.push(slice);
			}
			return Buffer.concat(chunks, length);
		}
		peekBufferedByte(offset) {
			let chunkIndex = this.lineChunkIndex;
			let pos = this.linePos;
			while (chunkIndex < this.chunks.length) {
				const chunk = this.chunks[chunkIndex];
				const remaining = chunk.length - pos;
				if (offset < remaining) return chunk[pos + offset];
				offset -= remaining;
				chunkIndex++;
				pos = 0;
			}
		}
		discardLeadingBytes(count) {
			while (count > 0 && this.lineChunkIndex < this.chunks.length) {
				const remaining = this.chunks[this.lineChunkIndex].length - this.linePos;
				if (count < remaining) {
					this.linePos += count;
					count = 0;
				} else {
					count -= remaining;
					this.lineChunkIndex++;
					this.linePos = 0;
				}
			}
			this.chunkIndex = this.lineChunkIndex;
			this.pos = this.linePos;
			this.dropConsumedChunks();
		}
		handleBOM() {
			const first = this.peekBufferedByte(0);
			const second = this.peekBufferedByte(1);
			const third = this.peekBufferedByte(2);
			if (second === void 0) {
				if (first === BOM[0]) return true;
				this.checkBOM = false;
				return true;
			}
			if (third === void 0) {
				if (first === BOM[0] && second === BOM[1]) return true;
				this.checkBOM = false;
				return false;
			}
			if (first === BOM[0] && second === BOM[1] && third === BOM[2]) this.discardLeadingBytes(3);
			this.checkBOM = false;
			return !this.hasCurrentByte();
		}
	};
	module.exports = { EventSourceStream };
}));
//#endregion
//#region node_modules/eve/node_modules/undici/lib/web/eventsource/eventsource.js
var require_eventsource = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { pipeline } = __require("node:stream");
	const { fetching } = require_fetch();
	const { webidl } = require_webidl();
	const { EventSourceStream } = require_eventsource_stream();
	const { parseMIMEType } = require_data_url();
	const { createFastMessageEvent } = require_events();
	const { isNetworkError } = require_response();
	const { kEnumerableProperty } = require_util$5();
	const { environmentSettingsObject } = require_util$4();
	const { createPotentialCORSRequest } = require_util();
	let experimentalWarned = false;
	/**
	* A reconnection time, in milliseconds. This must initially be an implementation-defined value,
	* probably in the region of a few seconds.
	*
	* In Comparison:
	* - Chrome uses 3000ms.
	* - Deno uses 5000ms.
	*
	* @type {3000}
	*/
	const defaultReconnectionTime = 3e3;
	/**
	* The readyState attribute represents the state of the connection.
	* @typedef ReadyState
	* @type {0|1|2}
	* @readonly
	* @see https://html.spec.whatwg.org/multipage/server-sent-events.html#dom-eventsource-readystate-dev
	*/
	/**
	* The connection has not yet been established, or it was closed and the user
	* agent is reconnecting.
	* @type {0}
	*/
	const CONNECTING = 0;
	/**
	* The user agent has an open connection and is dispatching events as it
	* receives them.
	* @type {1}
	*/
	const OPEN = 1;
	/**
	* The connection is not open, and the user agent is not trying to reconnect.
	* @type {2}
	*/
	const CLOSED = 2;
	/**
	* Requests for the element will have their mode set to "cors" and their credentials mode set to "same-origin".
	* @type {'anonymous'}
	*/
	const ANONYMOUS = "anonymous";
	/**
	* Requests for the element will have their mode set to "cors" and their credentials mode set to "include".
	* @type {'use-credentials'}
	*/
	const USE_CREDENTIALS = "use-credentials";
	/**
	* The EventSource interface is used to receive server-sent events. It
	* connects to a server over HTTP and receives events in text/event-stream
	* format without closing the connection.
	* @extends {EventTarget}
	* @see https://html.spec.whatwg.org/multipage/server-sent-events.html#server-sent-events
	* @api public
	*/
	var EventSource = class EventSource extends EventTarget {
		#events = {
			open: null,
			error: null,
			message: null
		};
		#url;
		#withCredentials = false;
		/**
		* @type {ReadyState}
		*/
		#readyState = CONNECTING;
		#request = null;
		#controller = null;
		#dispatcher;
		/**
		* @type {import('./eventsource-stream').eventSourceSettings}
		*/
		#state;
		/**
		* Creates a new EventSource object.
		* @param {string} url
		* @param {EventSourceInit} [eventSourceInitDict={}]
		* @see https://html.spec.whatwg.org/multipage/server-sent-events.html#the-eventsource-interface
		*/
		constructor(url, eventSourceInitDict = {}) {
			super();
			webidl.util.markAsUncloneable(this);
			const prefix = "EventSource constructor";
			webidl.argumentLengthCheck(arguments, 1, prefix);
			if (!experimentalWarned) {
				experimentalWarned = true;
				process.emitWarning("EventSource is experimental, expect them to change at any time.", { code: "UNDICI-ES" });
			}
			url = webidl.converters.USVString(url);
			eventSourceInitDict = webidl.converters.EventSourceInitDict(eventSourceInitDict, prefix, "eventSourceInitDict");
			this.#dispatcher = eventSourceInitDict.node.dispatcher || eventSourceInitDict.dispatcher;
			this.#state = {
				lastEventId: "",
				reconnectionTime: eventSourceInitDict.node.reconnectionTime
			};
			const settings = environmentSettingsObject;
			let urlRecord;
			try {
				urlRecord = new URL(url, settings.settingsObject.baseUrl);
				this.#state.origin = urlRecord.origin;
			} catch (e) {
				throw new DOMException(e, "SyntaxError");
			}
			this.#url = urlRecord.href;
			let corsAttributeState = ANONYMOUS;
			if (eventSourceInitDict.withCredentials === true) {
				corsAttributeState = USE_CREDENTIALS;
				this.#withCredentials = true;
			}
			const request = createPotentialCORSRequest(urlRecord, "", corsAttributeState);
			request.client = environmentSettingsObject.settingsObject;
			request.headersList.set("Accept", "text/event-stream");
			request.cache = "no-store";
			request.initiator = "other";
			this.#request = request;
			this.#connect();
		}
		/**
		* Returns the state of this EventSource object's connection. It can have the
		* values described below.
		* @returns {ReadyState}
		* @readonly
		*/
		get readyState() {
			return this.#readyState;
		}
		/**
		* Returns the URL providing the event stream.
		* @readonly
		* @returns {string}
		*/
		get url() {
			return this.#url;
		}
		/**
		* Returns a boolean indicating whether the EventSource object was
		* instantiated with CORS credentials set (true), or not (false, the default).
		*/
		get withCredentials() {
			return this.#withCredentials;
		}
		#connect() {
			if (this.#readyState === CLOSED) return;
			this.#readyState = CONNECTING;
			const fetchParams = {
				request: this.#request,
				dispatcher: this.#dispatcher
			};
			const processEventSourceEndOfBody = (response) => {
				if (!isNetworkError(response)) return this.#reconnect();
			};
			fetchParams.processResponseEndOfBody = processEventSourceEndOfBody;
			fetchParams.processResponse = (response) => {
				if (isNetworkError(response)) {
					if (response.aborted) {
						this.close();
						this.dispatchEvent(new Event("error"));
						return;
					} else {
						this.#reconnect();
						return;
					}
				}
				const contentType = response.headersList.get("content-type", true);
				const mimeType = contentType !== null ? parseMIMEType(contentType) : "failure";
				const contentTypeValid = mimeType !== "failure" && mimeType.essence === "text/event-stream";
				if (response.status !== 200 || contentTypeValid === false) {
					this.close();
					this.dispatchEvent(new Event("error"));
					return;
				}
				this.#readyState = OPEN;
				this.dispatchEvent(new Event("open"));
				this.#state.origin = response.urlList[response.urlList.length - 1].origin;
				const eventSourceStream = new EventSourceStream({
					eventSourceSettings: this.#state,
					push: (event) => {
						this.dispatchEvent(createFastMessageEvent(event.type, event.options));
					}
				});
				pipeline(response.body.stream, eventSourceStream, (error) => {
					if (error?.aborted === false) {
						this.close();
						this.dispatchEvent(new Event("error"));
					}
				});
			};
			this.#controller = fetching(fetchParams);
		}
		/**
		* @see https://html.spec.whatwg.org/multipage/server-sent-events.html#sse-processing-model
		* @returns {void}
		*/
		#reconnect() {
			if (this.#readyState === CLOSED) return;
			this.#readyState = CONNECTING;
			this.dispatchEvent(new Event("error"));
			setTimeout(() => {
				if (this.#readyState !== CONNECTING) return;
				if (this.#state.lastEventId.length) this.#request.headersList.set("last-event-id", this.#state.lastEventId, true);
				this.#connect();
			}, this.#state.reconnectionTime)?.unref();
		}
		/**
		* Closes the connection, if any, and sets the readyState attribute to
		* CLOSED.
		*/
		close() {
			webidl.brandCheck(this, EventSource);
			if (this.#readyState === CLOSED) return;
			this.#readyState = CLOSED;
			this.#controller.abort();
			this.#request = null;
		}
		get onopen() {
			return this.#events.open;
		}
		set onopen(fn) {
			if (this.#events.open) this.removeEventListener("open", this.#events.open);
			const listener = webidl.converters.EventHandlerNonNull(fn);
			if (listener !== null) {
				this.addEventListener("open", listener);
				this.#events.open = fn;
			} else this.#events.open = null;
		}
		get onmessage() {
			return this.#events.message;
		}
		set onmessage(fn) {
			if (this.#events.message) this.removeEventListener("message", this.#events.message);
			const listener = webidl.converters.EventHandlerNonNull(fn);
			if (listener !== null) {
				this.addEventListener("message", listener);
				this.#events.message = fn;
			} else this.#events.message = null;
		}
		get onerror() {
			return this.#events.error;
		}
		set onerror(fn) {
			if (this.#events.error) this.removeEventListener("error", this.#events.error);
			const listener = webidl.converters.EventHandlerNonNull(fn);
			if (listener !== null) {
				this.addEventListener("error", listener);
				this.#events.error = fn;
			} else this.#events.error = null;
		}
	};
	const constantsPropertyDescriptors = {
		CONNECTING: {
			__proto__: null,
			configurable: false,
			enumerable: true,
			value: CONNECTING,
			writable: false
		},
		OPEN: {
			__proto__: null,
			configurable: false,
			enumerable: true,
			value: OPEN,
			writable: false
		},
		CLOSED: {
			__proto__: null,
			configurable: false,
			enumerable: true,
			value: CLOSED,
			writable: false
		}
	};
	Object.defineProperties(EventSource, constantsPropertyDescriptors);
	Object.defineProperties(EventSource.prototype, constantsPropertyDescriptors);
	Object.defineProperties(EventSource.prototype, {
		close: kEnumerableProperty,
		onerror: kEnumerableProperty,
		onmessage: kEnumerableProperty,
		onopen: kEnumerableProperty,
		readyState: kEnumerableProperty,
		url: kEnumerableProperty,
		withCredentials: kEnumerableProperty
	});
	webidl.converters.EventSourceInitDict = webidl.dictionaryConverter([
		{
			key: "withCredentials",
			converter: webidl.converters.boolean,
			defaultValue: () => false
		},
		{
			key: "dispatcher",
			converter: webidl.converters.any
		},
		{
			key: "node",
			converter: webidl.dictionaryConverter([{
				key: "reconnectionTime",
				converter: webidl.converters["unsigned long"],
				defaultValue: () => defaultReconnectionTime
			}, {
				key: "dispatcher",
				converter: webidl.converters.any
			}]),
			defaultValue: () => ({})
		}
	]);
	module.exports = {
		EventSource,
		defaultReconnectionTime
	};
}));
//#endregion
//#region node_modules/eve/node_modules/undici/index.js
var require_undici = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const Client = require_client();
	const Dispatcher = require_dispatcher();
	const Pool = require_pool();
	const BalancedPool = require_balanced_pool();
	const RoundRobinPool = require_round_robin_pool();
	const Agent = require_agent();
	const Dispatcher1Wrapper = require_dispatcher1_wrapper();
	const ProxyAgent = require_proxy_agent();
	const Socks5ProxyAgent = require_socks5_proxy_agent();
	const EnvHttpProxyAgent = require_env_http_proxy_agent();
	const RetryAgent = require_retry_agent();
	const H2CClient = require_h2c_client();
	const errors = require_errors();
	const util = require_util$5();
	const { InvalidArgumentError } = errors;
	const api = require_api();
	const buildConnector = require_connect();
	const MockClient = require_mock_client();
	const { MockCallHistory, MockCallHistoryLog } = require_mock_call_history();
	const MockAgent = require_mock_agent();
	const MockPool = require_mock_pool();
	const SnapshotAgent = require_snapshot_agent();
	const mockErrors = require_mock_errors();
	const RetryHandler = require_retry_handler();
	const { getGlobalDispatcher, setGlobalDispatcher } = require_global();
	const DecoratorHandler = require_decorator_handler();
	const RedirectHandler = require_redirect_handler();
	Object.assign(Dispatcher.prototype, api);
	module.exports.Dispatcher = Dispatcher;
	module.exports.Client = Client;
	module.exports.Pool = Pool;
	module.exports.BalancedPool = BalancedPool;
	module.exports.RoundRobinPool = RoundRobinPool;
	module.exports.Agent = Agent;
	module.exports.Dispatcher1Wrapper = Dispatcher1Wrapper;
	module.exports.ProxyAgent = ProxyAgent;
	module.exports.Socks5ProxyAgent = Socks5ProxyAgent;
	module.exports.EnvHttpProxyAgent = EnvHttpProxyAgent;
	module.exports.RetryAgent = RetryAgent;
	module.exports.H2CClient = H2CClient;
	module.exports.RetryHandler = RetryHandler;
	module.exports.DecoratorHandler = DecoratorHandler;
	module.exports.RedirectHandler = RedirectHandler;
	module.exports.interceptors = {
		redirect: require_redirect(),
		responseError: require_response_error(),
		retry: require_retry(),
		dump: require_dump(),
		dns: require_dns(),
		cache: require_cache$1(),
		decompress: require_decompress(),
		deduplicate: require_deduplicate()
	};
	module.exports.cacheStores = { MemoryCacheStore: require_memory_cache_store() };
	const SqliteCacheStore = require_sqlite_cache_store();
	module.exports.cacheStores.SqliteCacheStore = SqliteCacheStore;
	module.exports.buildConnector = buildConnector;
	module.exports.errors = errors;
	module.exports.util = {
		parseHeaders: util.parseHeaders,
		headerNameToString: util.headerNameToString
	};
	function makeDispatcher(fn) {
		return (url, opts, handler) => {
			if (typeof opts === "function") {
				handler = opts;
				opts = null;
			}
			if (!url || typeof url !== "string" && typeof url !== "object" && !(url instanceof URL)) throw new InvalidArgumentError("invalid url");
			if (opts != null && typeof opts !== "object") throw new InvalidArgumentError("invalid opts");
			if (opts && opts.path != null) {
				if (typeof opts.path !== "string") throw new InvalidArgumentError("invalid opts.path");
				let path = opts.path;
				if (!opts.path.startsWith("/")) path = `/${path}`;
				url = new URL(util.parseOrigin(url).origin + path);
			} else {
				if (!opts) opts = typeof url === "object" ? url : {};
				url = util.parseURL(url);
			}
			const { agent, dispatcher = getGlobalDispatcher(), ...restOpts } = opts;
			if (agent) throw new InvalidArgumentError("unsupported opts.agent. Did you mean opts.client?");
			return fn.call(dispatcher, {
				...restOpts,
				origin: url.origin,
				path: url.search ? `${url.pathname}${url.search}` : url.pathname,
				method: opts.method || (opts.body ? "PUT" : "GET")
			}, handler);
		};
	}
	module.exports.setGlobalDispatcher = setGlobalDispatcher;
	module.exports.getGlobalDispatcher = getGlobalDispatcher;
	const fetchImpl = require_fetch().fetch;
	const currentFilename = typeof __filename !== "undefined" ? __filename : void 0;
	function appendFetchStackTrace(err, filename) {
		if (!err || typeof err !== "object") return;
		const stack = typeof err.stack === "string" ? err.stack : "";
		const normalizedFilename = filename.replace(/\\/g, "/");
		if (stack && (stack.includes(filename) || stack.includes(normalizedFilename))) return;
		const capture = {};
		Error.captureStackTrace(capture, appendFetchStackTrace);
		if (!capture.stack) return;
		const captureLines = capture.stack.split("\n").slice(1).join("\n");
		err.stack = stack ? `${stack}\n${captureLines}` : capture.stack;
	}
	module.exports.fetch = function fetch(init, options = void 0) {
		return fetchImpl(init, options).catch((err) => {
			if (currentFilename) appendFetchStackTrace(err, currentFilename);
			else if (err && typeof err === "object") Error.captureStackTrace(err, module.exports.fetch);
			throw err;
		});
	};
	module.exports.Headers = require_headers().Headers;
	module.exports.Response = require_response().Response;
	module.exports.Request = require_request().Request;
	module.exports.FormData = require_formdata().FormData;
	const { setGlobalOrigin, getGlobalOrigin } = require_global$1();
	module.exports.setGlobalOrigin = setGlobalOrigin;
	module.exports.getGlobalOrigin = getGlobalOrigin;
	const { CacheStorage } = require_cachestorage();
	const { kConstruct } = require_symbols();
	module.exports.caches = new CacheStorage(kConstruct);
	const { deleteCookie, getCookies, getSetCookies, setCookie, parseCookie } = require_cookies();
	module.exports.deleteCookie = deleteCookie;
	module.exports.getCookies = getCookies;
	module.exports.getSetCookies = getSetCookies;
	module.exports.setCookie = setCookie;
	module.exports.parseCookie = parseCookie;
	const { parseMIMEType, serializeAMimeType } = require_data_url();
	module.exports.parseMIMEType = parseMIMEType;
	module.exports.serializeAMimeType = serializeAMimeType;
	const { CloseEvent, ErrorEvent, MessageEvent } = require_events();
	const { WebSocket, ping } = require_websocket();
	module.exports.WebSocket = WebSocket;
	module.exports.CloseEvent = CloseEvent;
	module.exports.ErrorEvent = ErrorEvent;
	module.exports.MessageEvent = MessageEvent;
	module.exports.ping = ping;
	module.exports.WebSocketStream = require_websocketstream().WebSocketStream;
	module.exports.WebSocketError = require_websocketerror().WebSocketError;
	module.exports.request = makeDispatcher(api.request);
	module.exports.stream = makeDispatcher(api.stream);
	module.exports.pipeline = makeDispatcher(api.pipeline);
	module.exports.connect = makeDispatcher(api.connect);
	module.exports.upgrade = makeDispatcher(api.upgrade);
	module.exports.MockClient = MockClient;
	module.exports.MockCallHistory = MockCallHistory;
	module.exports.MockCallHistoryLog = MockCallHistoryLog;
	module.exports.MockPool = MockPool;
	module.exports.MockAgent = MockAgent;
	module.exports.SnapshotAgent = SnapshotAgent;
	module.exports.mockErrors = mockErrors;
	const { EventSource } = require_eventsource();
	module.exports.EventSource = EventSource;
	function install() {
		globalThis.fetch = module.exports.fetch;
		globalThis.Headers = module.exports.Headers;
		globalThis.Response = module.exports.Response;
		globalThis.Request = module.exports.Request;
		globalThis.FormData = module.exports.FormData;
		globalThis.WebSocket = module.exports.WebSocket;
		globalThis.CloseEvent = module.exports.CloseEvent;
		globalThis.ErrorEvent = module.exports.ErrorEvent;
		globalThis.MessageEvent = module.exports.MessageEvent;
		globalThis.EventSource = module.exports.EventSource;
	}
	module.exports.install = install;
}));
//#endregion
export { require_undici as t };
