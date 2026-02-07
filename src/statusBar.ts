import { setIcon } from "obsidian";

export class StatusBar {
    private item: HTMLElement;
    private spinnerInterval: any;
    private startTime: number = 0;
    private tokenCount: number = 0;

    constructor(item: HTMLElement) {
        this.item = item;
        this.reset();
    }

    reset() {
        this.item.empty();
        this.item.style.display = 'none';
        this.stopSpinner();
        this.startTime = 0;
        this.tokenCount = 0;
    }

    setConnecting() {
        this.item.style.display = 'inline-flex';
        this.item.empty();
        const icon = this.item.createSpan({ cls: 'status-bar-item-icon' });
        setIcon(icon, 'rss');
        this.item.createSpan({ text: ' Connecting...' });
    }

    setThinking() {
        this.item.style.display = 'inline-flex';
        this.item.empty();
        const icon = this.item.createSpan({ cls: 'status-bar-item-icon' });
        setIcon(icon, 'brain-circuit'); // Or similar
        this.item.createSpan({ text: ' Thinking...' });
        this.startSpinner();
    }

    setGenerating() {
        if (this.startTime === 0) this.startTime = Date.now();

        this.item.style.display = 'inline-flex';
        this.item.empty();

        // Dynamic spinner icon or text
        const icon = this.item.createSpan({ cls: 'status-bar-item-icon' });
        setIcon(icon, 'zap');

        const speed = this.calculateSpeed();
        const speedText = speed > 0 ? ` (${speed} t/s)` : '';
        this.item.createSpan({ text: ` Generating...${speedText}` });
    }

    updateProgress(tokens: number) {
        this.tokenCount += tokens;
        this.setGenerating(); // Update speed text
    }

    setSuccess() {
        this.stopSpinner();
        this.item.empty();
        const icon = this.item.createSpan({ cls: 'status-bar-item-icon' });
        setIcon(icon, 'check');
        this.item.createSpan({ text: ' Done' });

        setTimeout(() => this.reset(), 3000);
    }

    setError(msg: string) {
        this.stopSpinner();
        this.item.empty();
        const icon = this.item.createSpan({ cls: 'status-bar-item-icon' });
        setIcon(icon, 'alert-triangle');
        this.item.createSpan({ text: ' Error' });
        this.item.title = msg;

        setTimeout(() => this.reset(), 5000);
    }

    private calculateSpeed(): number {
        if (this.startTime === 0 || this.tokenCount === 0) return 0;
        const elapsedSec = (Date.now() - this.startTime) / 1000;
        return elapsedSec > 0 ? Math.round(this.tokenCount / elapsedSec) : 0;
    }

    private startSpinner() {
        // Optional: animate text or icon if needed
    }

    private stopSpinner() {
        if (this.spinnerInterval) {
            clearInterval(this.spinnerInterval);
            this.spinnerInterval = null;
        }
    }
}
