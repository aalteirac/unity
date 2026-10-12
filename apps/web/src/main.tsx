import React from 'react';
import { createRoot } from 'react-dom/client';
import { OnboardingPage } from './features/onboarding/OnboardingPage';
import './styles.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><OnboardingPage/></React.StrictMode>);