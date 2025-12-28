import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../services/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

const Home: React.FC = () => {
  const [name, setName] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [professionalSummary, setProfessionalSummary] = useState('');
  const [skills, setSkills] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const [resumeFile, setResumeFile] = useState<File | null>(null);

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    if (!resumeFile) {
        alert("Please upload your resume to continue.");
        setLoading(false);
        return;
    }

    try {
      // Combined info for AI context
      const fullProfileContext = `Summary: ${professionalSummary}. \nSkills: ${skills}`;

      // 1. Create candidate
      let candidateId = `temp_candidate_${Date.now()}`;
      try {
        const candidateRef = await addDoc(collection(db, 'candidates'), {
          name,
          rollNumber,
          resumeText: fullProfileContext, 
          resumeURL: "Uploaded: " + resumeFile.name, // Mock URL until storage is set up
          createdAt: serverTimestamp()
        });
        candidateId = candidateRef.id;
      } catch (err) {
        console.warn("Firestore Write Failed (Candidates), using temp ID:", err);
        localStorage.setItem(`candidate_${candidateId}`, JSON.stringify({ 
            name, 
            rollNumber, 
            resumeText: fullProfileContext,
            resumeURL: "Uploaded: " + resumeFile.name
        }));
      }

      // 2. Generate First Question (Optimized: No heavy resume analysis)
      const { initializeInterviewSession } = await import('../services/aiInterview');
      // We pass the explicit summary + skills to generating the first question
      const analysisData = await initializeInterviewSession(professionalSummary, skills);

      // 3. Create interview session
      let interviewId = `temp_interview_${Date.now()}`;
      try {
        const interviewRef = await addDoc(collection(db, 'interviews'), {
          candidateId: candidateId,
          resumeSummary: fullProfileContext, 
          initialQuestion: analysisData.firstQuestion,
          status: 'pending',
          startedAt: serverTimestamp(),
          overallScore: 0
        });
        interviewId = interviewRef.id;
      } catch (err) {
          console.warn("Firestore Write Failed (Interviews), using temp ID:", err);
          // Fallback: Store locally
          localStorage.setItem(`interview_${interviewId}`, JSON.stringify({ 
              candidateId, 
              resumeSummary: fullProfileContext, 
              initialQuestion: analysisData.firstQuestion,
              status: 'pending',
              createdAt: Date.now() 
          }));
      }

      navigate(`/interview/${interviewId}`);
    } catch (error) {
      console.error("Error starting interview:", error);
      if (error instanceof Error && error.message.includes('AI_RATE_LIMIT_EXCEEDED')) {
        alert("The AI service is currently busy (Rate Limit). Please wait 10-15 seconds and try again.");
      } else {
        alert("Failed to start interview. Check console for details.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: '600px', marginTop: '10vh' }}>
      <div className="card text-center">
        <h1>AI Technical Interview</h1>
        <p className="text-muted">Enter your profile details to prepare the AI.</p>
        
        <form onSubmit={handleStart} style={{ marginTop: '2rem', textAlign: 'left' }}>
          <div className="input-group">
            <label className="label">Full Name</label>
            <input 
              className="input" 
              required 
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: John Doe"
            />
          </div>

          <div className="input-group">
            <label className="label">Roll Number</label>
            <input 
              className="input" 
              required 
              value={rollNumber}
              onChange={(e) => setRollNumber(e.target.value)}
              placeholder="Ex: 21B001"
            />
          </div>

          <div className="input-group">
            <label className="label">Upload Resume (PDF/Doc)</label>
            <input 
              type="file"
              className="input" 
              required 
              accept=".pdf,.doc,.docx,.txt"
              onChange={(e) => setResumeFile(e.target.files ? e.target.files[0] : null)}
            />
            <small className="text-muted">File upload required for records.</small>
          </div>

          <div className="input-group">
            <label className="label">Professional Summary</label>
            <textarea 
              className="input" 
              required
              value={professionalSummary}
              onChange={(e) => setProfessionalSummary(e.target.value)}
              placeholder="Briefly describe your experience (Copy from Resume)..."
              rows={3}
            />
          </div>

          <div className="input-group">
            <label className="label">Key Skills / Technologies</label>
             <input 
              className="input" 
              required 
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
              placeholder="Ex: React, Node.js, Python, SQL"
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Generating Interview...' : 'Start Interview'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Home;
