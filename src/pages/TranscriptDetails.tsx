import React from 'react';
import { useLocation } from 'react-router-dom';
import TranscriptDetails from '../components/TranscriptDetails';

/**
 * Page component that renders the TranscriptDetails component
 * Passes along any state received from navigation
 */
const TranscriptDetailsPage: React.FC = () => {
  const location = useLocation();
  
  return <TranscriptDetails initialMeetingState={location.state} />;
};

export default TranscriptDetailsPage;
