/**
 * B3JS Voice AI Assistant
 * Manages STT and intent parsing for the Item Bank and XR.
 */

export class VoiceManager {
    private recognition: any = null;
    private isListening: boolean = false;
    private onResultCallback: (text: string, response: string) => void = () => {};
    private onStatusCallback: (isListening: boolean) => void = () => {};

    constructor(private engine: any) {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = false;
            this.recognition.interimResults = false;
            this.recognition.lang = 'en-US';

            this.recognition.onresult = async (event: any) => {
                const transcript = event.results[0][0].transcript;
                const context = (this as any)._pendingContext || {};
                const response = await this.engine.handleVoiceCommand(transcript, context);
                this.onResultCallback(transcript, response);
                (this as any)._pendingContext = null;
                this.stop();
            };

            this.recognition.onend = () => {
                this.isListening = false;
                this.onStatusCallback(false);
            };

            this.recognition.onerror = (e: any) => {
                console.error('VoiceManager Error:', e);
                this.isListening = false;
                this.onStatusCallback(false);
            };
        }
    }

    public start(onResult: (text: string, response: string) => void, onStatus: (isListening: boolean) => void) {
        if (!this.recognition) {
            console.error('B3JS: Speech Recognition not supported in this browser.');
            return;
        }
        if (this.isListening) return;

        this.onResultCallback = onResult;
        this.onStatusCallback = onStatus;
        
        try {
            this.recognition.start();
            this.isListening = true;
            this.onStatusCallback(true);
        } catch (e) {
            console.warn('B3JS: Recognition already started.');
        }
    }

    public stop() {
        if (this.recognition && this.isListening) {
            this.recognition.stop();
            this.isListening = false;
            this.onStatusCallback(false);
        }
    }

    public toggle(onResult: (text: string, response: string) => void, onStatus: (isListening: boolean) => void) {
        if (this.isListening) this.stop();
        else this.start(onResult, onStatus);
    }

    public setContext(context: any) {
        (this as any)._pendingContext = context;
    }
}
