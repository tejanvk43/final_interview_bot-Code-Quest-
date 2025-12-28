import { useState, useEffect, useCallback } from 'react';

export const useSpeechToText = () => {
    const [transcript, setTranscript] = useState('');
    const [isListening, setIsListening] = useState(false);
    const [recognition, setRecognition] = useState<any>(null);

    useEffect(() => {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            // @ts-ignore
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            const speechParam = new SpeechRecognition();
            speechParam.continuous = true;
            speechParam.interimResults = true;
            speechParam.lang = 'en-US';

            speechParam.onresult = (event: any) => {
                const currentParams = Array.from(event.results)
                    .map((result: any) => result[0].transcript)
                    .join('');
                setTranscript(currentParams);
            };

            speechParam.onend = () => {
                setIsListening(false);
            };

            setRecognition(speechParam);
        }
    }, []);

    const startListening = useCallback(() => {
        if (recognition) {
            try {
                recognition.start();
                setIsListening(true);
            } catch (e) {
                console.warn("Mic start error (likely already active):", e);
            }
        }
    }, [recognition]);

    const stopListening = useCallback(() => {
        if (recognition) {
            try {
                // abort() is faster and more forceful than stop()
                recognition.abort();
            } catch (e) {
                console.warn("Mic stop error:", e);
            }
            setIsListening(false);
        }
    }, [recognition]);

    const resetTranscript = () => setTranscript('');

    return { transcript, isListening, startListening, stopListening, resetTranscript };
};
