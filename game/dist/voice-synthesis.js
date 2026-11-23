// Keep just the newest pending reaction. An older line may finish in the worker
// after the player moves or another NPC answers.
export class VoiceSynthesis {
  ticket = 0;
  warm() {
    if (this.worker || this.failed) return;
    try {
      this.worker = new Worker(new URL('./voice-worker.js',import.meta.url), {type:'module'});
      this.worker.onerror = this.worker.onmessageerror = () => this.fail();
      this.worker.onmessage = ({data}) => {
        if (data.failed) return this.fail();
        if (data.ticket !== this.ticket) return;
        this.finish?.(data.pcm);
        this.finish = null;
      };
    } catch { this.fail(); }
  }
  fail() {
    this.failed = true;
    this.worker?.terminate();
    this.worker = null;
    this.finish?.(null);
    this.finish = null;
  }
  render(speaker,text) {
    this.warm();
    if (this.failed) return Promise.resolve(null);
    this.finish?.(null);
    return new Promise(resolve => {
      this.finish = resolve;
      try { this.worker.postMessage({ticket:++this.ticket,speaker,text}); }
      catch { this.fail(); }
    });
  }
}
