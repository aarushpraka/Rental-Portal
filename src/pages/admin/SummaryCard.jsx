import React from 'react';
import './AdminDashboard.css';
 
const SummaryCard = ({ label, value }) => {
  return (
    <div className="card">
      <div className="card-label">{label}</div>
      <div className="card-value">{value}</div>
    </div>
  );
};

export default SummaryCard;
