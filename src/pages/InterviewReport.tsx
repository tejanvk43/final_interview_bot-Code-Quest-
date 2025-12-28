import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../services/firebase';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';

const InterviewReport: React.FC = () => {
    const { interviewId } = useParams();
    const navigate = useNavigate();
    const [interview, setInterview] = useState<any>(null);
    const [candidate, setCandidate] = useState<any>(null);
    const [answers, setAnswers] = useState<any[]>([]);

    useEffect(() => {
        const fetchDetails = async () => {
            if (!interviewId) return;
            
            // Try Firestore
            try {
                const docRef = doc(db, 'interviews', interviewId);
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    const iData = snap.data();
                    setInterview(iData);
                    
                    if (iData.candidateId) {
                        const cSnap = await getDoc(doc(db, 'candidates', iData.candidateId));
                        if (cSnap.exists()) setCandidate(cSnap.data());
                    }

                    const q = query(collection(db, 'answers'), where('interviewIdString', '==', interviewId));
                    const ansSnap = await getDocs(q);
                    const ansList = ansSnap.docs.map(d => ({id: d.id, ...d.data()}));
                    setAnswers(ansList);
                    return; // Succcess, exit
                } else {
                    // Not found in DB, could be local
                }
            } catch (e) {
                console.warn("Firestore fetch failed, checking local:", e);
            }

            // Fallback to LocalStorage
            try {
                // Check for local interview data
                const localInvStr = localStorage.getItem(`interview_${interviewId}`);
                if (localInvStr) {
                    const localInv = JSON.parse(localInvStr);
                    setInterview(localInv);

                    if (localInv.candidateId) {
                         const localCandStr = localStorage.getItem(`candidate_${localInv.candidateId}`);
                         if (localCandStr) setCandidate(JSON.parse(localCandStr));
                    }
                    
                    // We don't store answers array in local storage efficiently in this demo (we rely on DB).
                    // But if we did, we'd fetch them here. 
                    // For now, show "Transcript Unavailable" or mock if needed.
                    // Actually, let's just leave answers empty as 'answers' collection writes fail in permission mode.
                    // Improvement: We COULD store answers in localStorage in Interview.tsx array, but for now this is sufficient to show the 'Report' shell.
                }
            } catch (e) { console.error("Local fetch failed", e); }
        };
        fetchDetails();
    }, [interviewId]);

    if (!interview) return <div className="container">Loading...</div>;

    return (
        <div className="container">
            <button className="btn" onClick={() => navigate('/admin/dashboard')}>&larr; Back to Dashboard</button>
            
            <div className="card mt-4">
                <div className="flex justify-between">
                    <div>
                        <h1>{candidate?.name || 'Candidate'}</h1>
                        <p className="text-muted">{candidate?.rollNumber} | {candidate?.resumeURL ? <a href={candidate.resumeURL} target="_blank">Resume Link</a> : 'No Resume URL'}</p>
                    </div>
                     <div className="text-center">
                        <h3>Overall Score</h3>
                        <h1 style={{color: 'var(--color-accent)'}}>{interview.overallScore != null ? `${interview.overallScore}/100` : 'N/A'}</h1>
                    </div>
                </div>
                <hr style={{border: '0', borderTop: '1px solid #eee', margin: '1rem 0'}} />
                <h4>Resume Summary</h4>
                <p style={{fontSize: '0.9rem', color: '#555'}}>{interview.resumeSummary}</p>
            </div>

            <h2 className="mt-4">Q&A Transcript</h2>
            <div style={{display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem'}}>
                {answers.map((ans, idx) => (
                    <div key={ans.id} className="card">
                        <h4>Q{idx+1}: {ans.questionText}</h4>
                        <div style={{display: 'flex', gap: '1rem', marginTop: '0.5rem'}}>
                            <div style={{flex: 1}}>
                                <p className="label">Candidate Answer (Transcript):</p>
                                <p style={{background: '#f1f5f9', padding: '0.5rem', borderRadius: '4px'}}>{ans.answerText}</p>
                                
                                <div style={{marginTop: '1rem', display: 'flex', gap: '1rem'}}>
                                    <span style={{fontSize: '0.8rem', fontWeight: 'bold'}}>Technical: {ans.technicalScore}/10</span>
                                    <span style={{fontSize: '0.8rem', fontWeight: 'bold'}}>Clarity: {ans.clarityScore}/10</span>
                                    <span style={{fontSize: '0.8rem', fontWeight: 'bold'}}>Confidence: {ans.confidenceScore}/10</span>
                                </div>
                                <p style={{fontSize: '0.9rem', color: '#666', marginTop: '0.5rem'}}><i>AI Feedback: {ans.feedback}</i></p>
                            </div>
                            {ans.videoURL && (
                                <div style={{width: '200px'}}>
                                    <video src={ans.videoURL} controls style={{width: '100%', borderRadius: '4px'}} />
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default InterviewReport;
