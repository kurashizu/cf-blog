import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

// The engine runs here so decoding never competes with the UI for the main
// thread. Everything else is web-llm's own message protocol.
const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg: MessageEvent) => handler.onmessage(msg);
