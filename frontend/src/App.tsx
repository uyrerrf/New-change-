import React from 'react';
import { useStore } from './store/useStore';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';

const App: React.FC = () => {
  const authenticated = useStore((s) => s.auth.authenticated);
  return authenticated ? <Dashboard /> : <Login />;
};

export default App;
