import NES from "jsnes/src/nes.js";
import Screen from "jsnes/src/browser/screen.js";
import KeyboardController from "jsnes/src/browser/keyboard.js";
import GamepadController from "jsnes/src/browser/gamepad.js";

const NES_FPS = 60.098;
const FRAME_DURATION = 1000 / NES_FPS; // ~16.639ms
const BATCH_SIZE = 128; // AudioWorklet quantum size

// Inlined AudioWorklet processor with soft fade-out anti-pop smoothing
const workletCode = `
class NESAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.capacity = 8192; // ~170ms audio buffer at 48kHz
    this.bufferL = new Float32Array(this.capacity);
    this.bufferR = new Float32Array(this.capacity);
    this.readPos = 0;
    this.writePos = 0;
    this.count = 0;
    this.lastL = 0;
    this.lastR = 0;

    this.port.onmessage = (e) => {
      if (e.data.type === "samples") {
        const left = e.data.left;
        const right = e.data.right;
        const len = left.length;

        // If overflow would happen, drop oldest samples smoothly
        if (this.count + len > this.capacity) {
          const drop = this.count + len - this.capacity;
          this.readPos = (this.readPos + drop) % this.capacity;
          this.count -= drop;
        }

        for (let i = 0; i < len; i++) {
          this.bufferL[this.writePos] = left[i];
          this.bufferR[this.writePos] = right[i];
          this.writePos = (this.writePos + 1) % this.capacity;
        }
        this.count += len;
      }
    };
  }

  process(inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length < 2) return true;

    const outL = output[0];
    const outR = output[1];
    const size = outL.length;

    if (this.count >= size) {
      for (let i = 0; i < size; i++) {
        const l = this.bufferL[this.readPos];
        const r = this.bufferR[this.readPos];
        outL[i] = l;
        outR[i] = r;
        this.readPos = (this.readPos + 1) % this.capacity;
      }
      this.count -= size;
      this.lastL = outL[size - 1];
      this.lastR = outR[size - 1];
    } else {
      // Partial fill + smooth exponential fade-out to 0 (prevents pops / DC offset clicks)
      let available = this.count;
      for (let i = 0; i < available; i++) {
        const l = this.bufferL[this.readPos];
        const r = this.bufferR[this.readPos];
        outL[i] = l;
        outR[i] = r;
        this.readPos = (this.readPos + 1) % this.capacity;
      }
      if (available > 0) {
        this.lastL = outL[available - 1];
        this.lastR = outR[available - 1];
      }
      this.count = 0;

      for (let i = available; i < size; i++) {
        this.lastL *= 0.92; // smooth decay to 0
        this.lastR *= 0.92;
        outL[i] = this.lastL;
        outR[i] = this.lastR;
      }
      this.port.postMessage({ type: "underrun" });
    }

    return true;
  }
}

registerProcessor("nes-audio-processor", NESAudioProcessor);
`;

class AntiPopSpeakers {
    private audioCtx: AudioContext | null = null;
    private node: AudioWorkletNode | null = null;
    private batchL = new Float32Array(BATCH_SIZE);
    private batchR = new Float32Array(BATCH_SIZE);
    private batchPos = 0;
    private onBufferUnderrun?: () => void;
    private _resumeOnInteraction: (() => void) | null = null;

    constructor(options: { onBufferUnderrun?: () => void }) {
        this.onBufferUnderrun = options.onBufferUnderrun;
    }

    getSampleRate(): number {
        if (this.audioCtx) return this.audioCtx.sampleRate;
        return 44100;
    }

    async start(): Promise<void> {
        if (typeof window === "undefined" || !window.AudioContext) return;
        if (this.audioCtx) {
            if (this.audioCtx.state === "suspended") {
                await this.audioCtx.resume();
            }
            return;
        }

        try {
            this.audioCtx = new window.AudioContext();
            const blob = new Blob([workletCode], {
                type: "application/javascript",
            });
            const workletUrl = URL.createObjectURL(blob);
            await this.audioCtx.audioWorklet.addModule(workletUrl);
            URL.revokeObjectURL(workletUrl);

            this.node = new AudioWorkletNode(
                this.audioCtx,
                "nes-audio-processor",
                {
                    outputChannelCount: [2],
                },
            );

            this.node.port.onmessage = (e) => {
                if (e.data?.type === "underrun" && this.onBufferUnderrun) {
                    this.onBufferUnderrun();
                }
            };

            this.node.connect(this.audioCtx.destination);

            if (this.audioCtx.state === "suspended") {
                this._resumeOnInteraction = () => {
                    if (this.audioCtx && this.audioCtx.state === "suspended") {
                        this.audioCtx.resume().catch(() => {});
                    }
                    this._removeResumeListeners();
                };
                document.addEventListener("keydown", this._resumeOnInteraction);
                document.addEventListener(
                    "mousedown",
                    this._resumeOnInteraction,
                );
                document.addEventListener(
                    "touchstart",
                    this._resumeOnInteraction,
                );
            }
        } catch (e) {
            console.error("AudioWorklet initialization error:", e);
        }
    }

    private _removeResumeListeners() {
        if (this._resumeOnInteraction) {
            document.removeEventListener(
                "keydown",
                this._resumeOnInteraction,
            );
            document.removeEventListener(
                "mousedown",
                this._resumeOnInteraction,
            );
            document.removeEventListener(
                "touchstart",
                this._resumeOnInteraction,
            );
            this._resumeOnInteraction = null;
        }
    }

    stop(): void {
        this._removeResumeListeners();
        if (this.node && this.audioCtx) {
            this.node.disconnect(this.audioCtx.destination);
            this.node = null;
        }
        if (this.audioCtx) {
            this.audioCtx.close().catch(() => {});
            this.audioCtx = null;
        }
        this.batchPos = 0;
    }

    writeSample = (left: number, right: number): void => {
        if (!this.node) return;
        this.batchL[this.batchPos] = left;
        this.batchR[this.batchPos] = right;
        this.batchPos++;

        if (this.batchPos >= BATCH_SIZE) {
            this.node.port.postMessage({
                type: "samples",
                left: this.batchL.slice(),
                right: this.batchR.slice(),
            });
            this.batchPos = 0;
        }
    };

    flush(): void {
        if (this.batchPos > 0 && this.node) {
            this.node.port.postMessage({
                type: "samples",
                left: this.batchL.slice(0, this.batchPos),
                right: this.batchR.slice(0, this.batchPos),
            });
            this.batchPos = 0;
        }
    }
}

/** Smooth delta-time frame timer compatible with 60Hz - 240Hz monitors */
class SmoothFrameTimer {
    private onGenerateFrame: () => void;
    private onWriteFrame: () => void;
    private running = false;
    private requestID: number | null = null;
    private lastTime = 0;
    private accumulator = 0;

    constructor(props: {
        onGenerateFrame: () => void;
        onWriteFrame: () => void;
    }) {
        this.onGenerateFrame = props.onGenerateFrame;
        this.onWriteFrame = props.onWriteFrame;
    }

    start(): void {
        if (this.running) return;
        this.running = true;
        this.lastTime = 0;
        this.accumulator = 0;
        this.requestID = window.requestAnimationFrame(this.onAnimationFrame);
    }

    stop(): void {
        this.running = false;
        if (this.requestID !== null) {
            window.cancelAnimationFrame(this.requestID);
            this.requestID = null;
        }
        this.lastTime = 0;
        this.accumulator = 0;
    }

    stepSingleFrame(): void {
        this.onGenerateFrame();
    }

    private onAnimationFrame = (now: number): void => {
        if (!this.running) return;
        this.requestID = window.requestAnimationFrame(this.onAnimationFrame);

        if (!this.lastTime) {
            this.lastTime = now;
            return;
        }

        const delta = now - this.lastTime;
        this.lastTime = now;

        // Cap maximum frame delta to prevent spiral of death on background tabs
        this.accumulator += Math.min(delta, 100);

        let framesGenerated = 0;
        // Run up to 3 frames max per rAF tick to keep audio filled and avoid frame skips
        while (this.accumulator >= FRAME_DURATION && framesGenerated < 3) {
            this.onGenerateFrame();
            this.accumulator -= FRAME_DURATION;
            framesGenerated++;
        }

        // Drop remaining accumulated time if too far behind
        if (this.accumulator > FRAME_DURATION * 3) {
            this.accumulator = 0;
        }

        if (framesGenerated > 0) {
            this.onWriteFrame();
        }
    };
}

export interface NESBrowserOptions {
    container: HTMLElement;
    romData?: string;
    onError?: (error: Error) => void;
    onBatteryRamWrite?: () => void;
}

export class NESBrowserEngine {
    private _options: NESBrowserOptions;
    private _screen: any;
    private _speakers: AntiPopSpeakers;
    private _frameTimer: SmoothFrameTimer;
    public nes: any;
    public gamepad: any;
    public keyboard: any;
    private _gamepadPolling: any;

    constructor(options: NESBrowserOptions) {
        this._options = options;

        this._screen = new Screen(options.container, {
            onMouseDown: (x: number, y: number) => {
                this.nes.zapperMove(x, y);
                this.nes.zapperFireDown();
            },
            onMouseUp: () => {
                this.nes.zapperFireUp();
            },
        });
        this._screen.fitInParent();

        this._speakers = new AntiPopSpeakers({
            onBufferUnderrun: () => {
                // Gently step 1 frame asynchronously if running
                this._frameTimer.stepSingleFrame();
            },
        });

        this.nes = new NES({
            onFrame: this._screen.setBuffer,
            onStatusUpdate: () => {},
            onAudioSample: this._speakers.writeSample,
            onBatteryRamWrite: options.onBatteryRamWrite || (() => {}),
            sampleRate: this._speakers.getSampleRate(),
        });

        this._frameTimer = new SmoothFrameTimer({
            onGenerateFrame: () => {
                try {
                    this.nes.frame();
                    this._speakers.flush();
                } catch (e) {
                    this.stop();
                    if (this._options.onError) {
                        this._options.onError(
                            e instanceof Error ? e : new Error(String(e)),
                        );
                    }
                }
            },
            onWriteFrame: this._screen.writeBuffer,
        });

        this.gamepad = new GamepadController({
            onButtonDown: this.nes.buttonDown,
            onButtonUp: this.nes.buttonUp,
        });
        this.gamepad.loadGamepadConfig();
        this._gamepadPolling = this.gamepad.startPolling();

        this.keyboard = new KeyboardController({
            onButtonDown: this.gamepad.disableIfGamepadEnabled(
                this.nes.buttonDown,
            ),
            onButtonUp: this.gamepad.disableIfGamepadEnabled(this.nes.buttonUp),
        });
        this.keyboard.loadKeys();

        if (typeof document !== "undefined") {
            document.addEventListener("keydown", this.keyboard.handleKeyDown);
            document.addEventListener("keyup", this.keyboard.handleKeyUp);
            document.addEventListener("keypress", this.keyboard.handleKeyPress);
        }

        if (options.romData) {
            this.nes.loadROM(options.romData);
            this.start();
        }
    }

    start(): void {
        this._frameTimer.start();
        this._speakers.start().catch(() => {});
    }

    stop(): void {
        this._frameTimer.stop();
        this._speakers.stop();
    }

    loadROM(data: string): void {
        this.stop();
        this.nes.loadROM(data);
        this.start();
    }

    fitInParent(): void {
        this._screen.fitInParent();
    }

    screenshot(): HTMLImageElement {
        return this._screen.screenshot();
    }

    destroy(): void {
        this.stop();
        if (typeof document !== "undefined") {
            document.removeEventListener(
                "keydown",
                this.keyboard.handleKeyDown,
            );
            document.removeEventListener("keyup", this.keyboard.handleKeyUp);
            document.removeEventListener(
                "keypress",
                this.keyboard.handleKeyPress,
            );
        }
        if (this._gamepadPolling) {
            this._gamepadPolling.stop();
        }
        this._screen.destroy();
    }

    static loadROMFromURL(
        url: string,
        callback: (err: Error | null, data?: string) => void,
    ): void {
        const req = new XMLHttpRequest();
        req.open("GET", url);
        req.overrideMimeType("text/plain; charset=x-user-defined");
        req.onerror = () =>
            callback(new Error(`Error loading ${url}: ${req.statusText}`));
        req.onload = function () {
            if (this.status === 200) {
                callback(null, req.responseText);
            } else if (this.status === 0) {
                // Aborted
            } else {
                req.onerror(new ProgressEvent("error"));
            }
        };
        req.send();
    }
}
