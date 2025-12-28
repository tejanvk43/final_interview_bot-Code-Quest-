import { useRef, useState, useCallback } from 'react';

export const useMediaRecorder = () => {
    const [mediaBlobUrl, setMediaBlobUrl] = useState<string | null>(null);
    const [status, setStatus] = useState<string>('idle');
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);

    const startRecording = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream);
            chunksRef.current = [];

            mediaRecorderRef.current.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    chunksRef.current.push(event.data);
                }
            };

            mediaRecorderRef.current.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                setMediaBlobUrl(url);
                setStatus('stopped');
                // Stop all tracks to release camera
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorderRef.current.start();
            setStatus('recording');
        } catch (error) {
            console.error("Error accessing media devices:", error);
            setStatus('error');
        }
    }, []);

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
    }, []);

    const getBlob = useCallback(() => {
        if (chunksRef.current.length === 0) return null;
        return new Blob(chunksRef.current, { type: 'video/webm' });
    }, []);

    return { status, startRecording, stopRecording, mediaBlobUrl, getBlob };
};
