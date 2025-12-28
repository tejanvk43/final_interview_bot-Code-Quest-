import React from 'react';
import { useNavigate } from 'react-router-dom';

const Completed: React.FC = () => {
    const navigate = useNavigate();
    return (
        <div className="container text-center" style={{marginTop: '15vh'}}>
            <div className="card">
                <h1>Interview Completed</h1>
                <p>Thank you for taking the time. Your responses have been recorded and will be reviewed.</p>
                <div style={{marginTop: '2rem'}}>
                    <button className="btn btn-primary" onClick={() => navigate('/')}>Return Home</button>
                </div>
            </div>
        </div>
    );
};

export default Completed;
