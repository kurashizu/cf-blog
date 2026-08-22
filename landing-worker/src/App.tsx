import React from 'react';
import { TmuxWorkspace } from './components/tmux/TmuxWorkspace';

export const App: React.FC = () => {
  return (
    <div className="w-full min-h-screen lg:h-screen lg:max-h-screen overflow-x-hidden lg:overflow-hidden bg-[#0d0f12] flex flex-col">
      <TmuxWorkspace />
    </div>
  );
};

export default App;
