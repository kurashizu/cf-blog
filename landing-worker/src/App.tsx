import React from 'react';
import { TmuxWorkspace } from './components/tmux/TmuxWorkspace';

export const App: React.FC = () => {
  return (
    <div className="w-full h-screen max-h-screen overflow-hidden bg-[#0d0f12] flex flex-col">
      <TmuxWorkspace />
    </div>
  );
};

export default App;
