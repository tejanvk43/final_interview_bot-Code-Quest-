import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../services/firebase';
import { collection, getDocs, query, orderBy, doc, getDoc, deleteDoc } from 'firebase/firestore';

const AdminDashboard: React.FC = () => {
    const [interviews, setInterviews] = useState<any[]>([]);
    const navigate = useNavigate();

    useEffect(() => {
        const auth = localStorage.getItem('admin_auth');
        if (!auth) navigate('/admin');

        const fetchData = async () => {
            const data: any[] = [];
            
            // 1. Try fetching from Firestore
            try {
                const q = query(collection(db, 'interviews'), orderBy('startedAt', 'desc'));
                const querySnapshot = await getDocs(q);
                for (const d of querySnapshot.docs) {
                    const interview = d.data();
                    let candidateName = "Unknown";
                    let rollNumber = "-";
                    if (interview.candidateId) {
                        try {
                            const candidateSnap = await getDoc(doc(db, 'candidates', interview.candidateId));
                            if (candidateSnap.exists()) {
                                const cData = candidateSnap.data();
                                candidateName = cData.name;
                                rollNumber = cData.rollNumber;
                            }
                        } catch (e) { console.warn("Candidate fetch failed", e); }
                    }
                    data.push({ id: d.id, ...interview, candidateName, rollNumber });
                }
            } catch (error) {
                console.warn("Firestore list failed (using local only):", error);
            }

            // 2. Fetch from LocalStorage (Demo Mode items)
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('interview_')) {
                    try {
                        const localInv = JSON.parse(localStorage.getItem(key) || "{}");
                        // Resolve candidate from local if possible
                        let candidateName = "Local Candidate";
                        let rollNumber = "000";
                        if (localInv.candidateId) {
                            const localCandStr = localStorage.getItem(`candidate_${localInv.candidateId}`);
                            if (localCandStr) {
                                const localCand = JSON.parse(localCandStr);
                                candidateName = localCand.name;
                                rollNumber = localCand.rollNumber;
                            }
                        }
                        
                        // normalize timestamp
                        let startedAt = localInv.startedAt;
                        // Transform basic number timestamp to helper object with toDate() for compatibility
                        const dateObj = typeof startedAt === 'number' ? new Date(startedAt) : new Date();
                        
                        data.push({
                            id: key.replace('interview_', ''), // Use the temp id
                            ...localInv,
                            candidateName,
                            rollNumber,
                            startedAt: { toDate: () => dateObj } // Mock Firestore Timestamp
                        });
                    } catch (e) { console.error("Bad local interview data", e); }
                }
            });
            
            // Sort combined data
            data.sort((a, b) => b.startedAt.toDate().getTime() - a.startedAt.toDate().getTime());

            setInterviews(data);
        };
        fetchData();
    }, []);

    const handleDelete = async (id: string, isLocal: boolean) => {
        if (!window.confirm("Are you sure you want to delete this interview record?")) return;

        // Optimistic UI update
        setInterviews(prev => prev.filter(i => i.id !== id));

        try {
            if (isLocal) {
                localStorage.removeItem(`interview_${id}`);
            } else {
                await deleteDoc(doc(db, 'interviews', id));
            }
        } catch (error) {
            console.error("Delete failed:", error);
            alert("Failed to delete record.");
            // Re-fetch or revert if needed (simplified here)
        }
    };

    return (
        <div className="container" style={{maxWidth: '1000px'}}>
            <div className="flex justify-between items-center mb-4">
                <h1>Admin Dashboard</h1>
                <button className="btn btn-danger" onClick={() => { localStorage.removeItem('admin_auth'); navigate('/admin'); }}>Logout</button>
            </div>

            <div className="card">
                <table style={{width: '100%', borderCollapse: 'collapse', textAlign: 'left'}}>
                    <thead>
                        <tr style={{borderBottom: '1px solid #ccc'}}>
                            <th style={{padding: '0.5rem'}}>Candidate</th>
                            <th>Roll No</th>
                            <th>Status</th>
                            <th>Score</th>
                            <th>Date</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {interviews.map(inv => {
                            // Helper to detect if item is local-only (simplistic check based on ID pattern used in Home.tsx)
                            const isLocal = inv.id.startsWith('temp_interview_');
                            
                            return (
                                <tr key={inv.id} style={{borderBottom: '1px solid #eee'}}>
                                    <td style={{padding: '0.75rem 0.5rem'}}>{inv.candidateName}</td>
                                    <td>{inv.rollNumber}</td>
                                    <td>
                                        <span style={{
                                            padding: '0.25rem 0.5rem', 
                                            borderRadius: '4px', 
                                            backgroundColor: inv.status === 'completed' ? '#dcfce7' : '#fef9c3',
                                            color: inv.status === 'completed' ? '#166534' : '#854d0e',
                                            fontSize: '0.8rem'
                                        }}>
                                            {inv.status}
                                        </span>
                                    </td>
                                    <td>{inv.overallScore || '-'}</td>
                                    <td>{inv.startedAt?.toDate().toLocaleDateString()}</td>
                                    <td>
                                        <div style={{display: 'flex', gap: '0.5rem'}}>
                                            <button className="btn btn-primary" style={{padding: '0.25rem 0.75rem', fontSize: '0.8rem'}} onClick={() => navigate(`/admin/report/${inv.id}`)}>
                                                View
                                            </button>
                                            <button className="btn btn-danger" style={{padding: '0.25rem 0.75rem', fontSize: '0.8rem', backgroundColor: '#dc2626'}} onClick={() => handleDelete(inv.id, isLocal)}>
                                                Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AdminDashboard;
