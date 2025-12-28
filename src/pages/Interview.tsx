import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Webcam from 'react-webcam';
import { db } from '../services/firebase';
import { doc, getDoc, updateDoc, addDoc, collection, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { generateQuestion, evaluateAnswer, calculateFinalScore } from '../services/aiInterview';
import { useSpeechToText } from '../hooks/useSpeechToText';
import { useMediaRecorder } from '../hooks/useMediaRecorder';

const Interview: React.FC = () => {
  const { interviewId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [interviewData, setInterviewData] = useState<any>(null);
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);
  const [questionCount, setQuestionCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Timer active flag (waits for TTS)
  const [isTimerActive, setIsTimerActive] = useState(false);
  const [codeAnswer, setCodeAnswer] = useState(""); // For Coding Round
  const [answerText, setAnswerText] = useState(""); // For Verbal Round

  // Question History for AI Context
  const [questionHistory, setQuestionHistory] = useState<string[]>([]);

  const webcamRef = useRef<Webcam>(null);

  const { transcript, startListening, stopListening, resetTranscript } = useSpeechToText();
  const { startRecording, stopRecording, getBlob } = useMediaRecorder();

  // Sync Transcript to Answer Text
  useEffect(() => {
      if (transcript) {
          setAnswerText(transcript);
      }
  }, [transcript]);

  // Helper: TTS
  const speakQuestion = (text: string) => {
    if (!('speechSynthesis' in window)) {
        console.warn("TTS not supported");
        setIsTimerActive(true); 
        return;
    }
    
    // Stop any previous
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.9; // Slightly slower is clearer
    
    // Try to pick a decent voice (Chrome needs wait, but simplistic here)
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => v.lang.includes('en-US') && v.name.includes('Google')) || voices.find(v => v.lang.includes('en'));
    if (preferredVoice) utterance.voice = preferredVoice;

    utterance.onend = () => {
        setIsTimerActive(true); // Start timer only after speaking
        
        // Start recording if verbal question
        if (questionCount < 6) { 
             startListening();
             startRecording();
        }
    };
    
    utterance.onerror = (e) => {
        console.error("TTS Error:", e);
        setIsTimerActive(true);
    };

    console.log("Speaking:", text);
    window.speechSynthesis.speak(utterance);
  };

  // Setup Phase
  useEffect(() => {
    const initSession = async () => {
      if (!interviewId) return;
      try {
        const docRef = doc(db, 'interviews', interviewId);
        const snap = await getDoc(docRef);
        
        if (snap.exists()) {
            const data = snap.data();
            setInterviewData(data);
            
            if (data.initialQuestion && !data.currentQuestion) {
                 setCurrentQuestion(data.initialQuestion);
                 setQuestionCount(1);
                 setQuestionHistory([data.initialQuestion.questionText]); // Add to history
                 // Speak First Question
                 speakQuestion(data.initialQuestion.questionText);
            } else if (data.resumeSummary) {
                 if(!currentQuestion) {
                      try {
                          // Initialize history empty for first question gen
                          const nextQ = await generateQuestion(data.resumeSummary, [], "Start", 1);
                          setCurrentQuestion(nextQ);
                          setQuestionCount(1);
                          setQuestionHistory([nextQ.questionText]);
                          speakQuestion(nextQ.questionText);
                      } catch (err: any) {
                          if (err.message === "AI_RATE_LIMIT_EXCEEDED") {
                              setError("System is busy (Rate Limit). Please refresh.");
                          }
                      }
                 }
            }
        } else {
            // Local fallback (omitted for brevity, assume DB works or handle same way)
             const localDataStr = localStorage.getItem(`interview_${interviewId}`);
              if (localDataStr) {
                 const localData = JSON.parse(localDataStr);
                 setInterviewData(localData);
                 if (localData.initialQuestion) {
                     setCurrentQuestion(localData.initialQuestion);
                     setQuestionCount(1);
                     setQuestionHistory([localData.initialQuestion.questionText]);
                     speakQuestion(localData.initialQuestion.questionText);
                 }
              }
        }
      } catch (err) {
          console.warn("Init Error", err);
      }
      setLoading(false);
    };
    initSession();
    
    return () => window.speechSynthesis.cancel(); // Cleanup
  }, [interviewId]);

  // Timer Logic
  useEffect(() => {
    if (!currentQuestion || submitting || !isTimerActive) return;
    
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleSubmitAnswer();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [currentQuestion, submitting, isTimerActive]);

  // Adjust Timer Limit based on Question Type
  useEffect(() => {
    if (currentQuestion) {
        // Stop listening initally until TTS says so
        stopListening(); 
        setIsTimerActive(false); // Wait for info to be spoken
        
        // Coding Round: 3 mins (180s), Verbal: 60s
        if (questionCount >= 6) {
            setTimeLeft(180);
            setCodeAnswer(""); // Reset code editor
        } else {
            setTimeLeft(60);
            setAnswerText(""); // Reset verbal answer
            resetTranscript();
        }
        
        // Speak only if distinct question
        speakQuestion(currentQuestion.questionText);
    }
  }, [currentQuestion]);

  const handleSubmitAnswer = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    // Stop things
    window.speechSynthesis.cancel();
    stopListening();
    stopRecording();
    
    await new Promise(r => setTimeout(r, 1000));
    
    try {
        // Determine answer content
        // For Coding: codeAnswer. For Verbal: answerText (which includes transcript edits)
        const finalAnswer = questionCount >= 6 ? `[CODE_SUBMISSION] ${codeAnswer}` : (answerText || "[No text captured]");

        // Evaluate
        const evaluation = await evaluateAnswer(currentQuestion.questionText, finalAnswer);
        
        // Save Answer
        if (interviewId) {
            try {
                await addDoc(collection(db, 'answers'), {
                    interviewId: doc(db, 'interviews', interviewId),
                    interviewIdString: interviewId, 
                    questionText: currentQuestion.questionText,
                    answerText: finalAnswer,
                    ...evaluation,
                    createdAt: serverTimestamp()
                });
            } catch (e) { console.warn("Answer save failed", e); }
        }

        // Next Question or Finish (7 Questions Total)
        if (questionCount >= 7) {
            // ... (Same finishing logic completion...)
            let fullTranscript = "";
            try {
                const qAnswers = query(collection(db, 'answers'), where('interviewIdString', '==', interviewId));
                const querySnapshot = await getDocs(qAnswers);
                fullTranscript = querySnapshot.docs.map(d => {
                    const da = d.data();
                    return `Q: ${da.questionText}\nA: ${da.answerText}\nScore: ${da.technicalScore}`;
                }).join('\n\n');
            } catch (e) { fullTranscript = "Data unavailable"; }
            
            const finalResult = await calculateFinalScore(fullTranscript); 
            try {
                await updateDoc(doc(db, 'interviews', interviewId!), { 
                    status: 'completed', 
                    endedAt: serverTimestamp(),
                    overallScore: finalResult.finalScore
                });
            } catch (e) {}

            navigate('/completed');
        } else {
            // Update History before generating
            const newHistory = [...questionHistory, currentQuestion.questionText];
            setQuestionHistory(newHistory);

            // Generate Next
            const nextQ = await generateQuestion(
                interviewData.resumeSummary, 
                newHistory, // Pass Full History
                finalAnswer,
                questionCount + 1 
            );
            setCurrentQuestion(nextQ);
            setQuestionCount(prev => prev + 1);
        }
    } catch (err: any) {
        console.error("AI Step Failed:", err);
        if (err.message === "AI_RATE_LIMIT_EXCEEDED") {
            setError("Server load is high. Please wait a few seconds and try 'Submit Answer' again.");
        } else {
            setError("An error occurred. Please try again.");
        }
    } finally {
        setSubmitting(false);
    }
  };

  if (loading) return <div className="container text-center">Loading Interview Environment...</div>;

  const isCoding = questionCount >= 6;

  return (
    <div className="container" style={{maxWidth: '1200px', display: 'flex', gap: '2rem'}}>
        <div style={{flex: 1}}>
            <div className="card">
                <h3>Question {questionCount} of 7</h3>
                {isCoding && <span className="badge" style={{background:'#6366f1', color:'white', padding:'0.2rem 0.5rem', borderRadius:'4px'}}>Coding Challenge</span>}
                
                <div style={{display:'flex', alignItems:'center', gap:'1rem'}}>
                    <h2 style={{fontSize: '1.5rem', margin: '1rem 0', flex:1}}>{currentQuestion?.questionText}</h2>
                    <button 
                        className="btn" 
                        style={{padding:'0.2rem 0.5rem', fontSize:'0.8rem', background:'#e5e7eb', color:'#374151'}}
                        onClick={() => speakQuestion(currentQuestion?.questionText || "")}
                        title="Read Question Aloud"
                    >
                        🔊 Read Aloud
                    </button>
                </div>
                
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2rem'}}>
                    <div style={{fontSize: '1.25rem', fontWeight: 'bold', color: timeLeft < 15 ? 'red' : 'inherit'}}>
                        Time Remaining: {timeLeft}s 
                        {!isTimerActive && <span style={{fontSize:'0.8rem', fontWeight:'normal', color:'#666', marginLeft:'0.5rem'}}>(Speaking...)</span>}
                    </div>
                    {/* Submit disabled only if submitting or TTS playing (optional? user might want to read first). 
                        Actually, allowing submit during TTS is risky if they haven't heard it, but editing is fine. 
                        Let's keep submit disabled until TTS done to ensure they listen. */}
                    <button className="btn btn-primary" onClick={handleSubmitAnswer} disabled={submitting || !isTimerActive}>
                        {submitting ? 'Processing...' : 'Submit Answer'}
                    </button>
                </div>
                {error && <div style={{color: 'red', marginTop: '1rem'}}>{error}</div>}
            </div>
            
            {isCoding ? (
                <div className="card" style={{marginTop: '1rem'}}>
                    <label className="label">Code Editor (JavaScript/Python/Pseudo-code):</label>
                    <textarea 
                        className="input"
                        style={{fontFamily: 'monospace', minHeight: '300px', background: '#1e293b', color: '#e2e8f0'}}
                        value={codeAnswer}
                        onChange={(e) => setCodeAnswer(e.target.value)}
                        placeholder="// Write your solution here..."
                         // ENABLED always
                    />
                </div>
            ) : (
                <div className="card" style={{marginTop: '1rem', minHeight: '200px'}}>
                   <label className="label">Your Answer (Speak or Type):</label>
                   <textarea 
                        className="input"
                        rows={6}
                        value={answerText}
                        onChange={(e) => setAnswerText(e.target.value)}
                        placeholder="Start speaking or type your answer here..."
                        // ENABLED always
                   />
                </div>
            )}
        </div>

        <div style={{width: '400px'}}>
             <div className="card" style={{padding: '0.5rem'}}>
                <Webcam
                    ref={webcamRef}
                    audio={false}
                    style={{width: '100%', borderRadius: '0.25rem'}}
                />
                <div style={{marginTop: '0.5rem', textAlign: 'center'}}>
                    <span className="text-muted" style={{fontSize: '0.8rem'}}>REC ●</span>
                </div>
             </div>
        </div>
    </div>
  );
};

export default Interview;
