
import React from 'react';
import { ProjectState } from '../types';

interface ProjectsViewProps {
  projects: ProjectState[];
  onSelect: (project: ProjectState) => void;
  onDelete: (index: number) => void;
  onImport: () => void;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({ projects, onSelect, onDelete, onImport }) => {
  return (
    <div className="py-12 animate-in fade-in slide-in-from-bottom-5 duration-700">
      <div className="flex justify-between items-end mb-12">
        <div>
          <h2 className="text-4xl font-bold text-white tracking-tighter font-mono uppercase">Stored Archives</h2>
          <p className="text-celestial-stone mt-2 uppercase tracking-widest text-[10px] font-bold">Local Storage Registry</p>
        </div>
        <div className="flex gap-4 items-center">
          <button 
            onClick={onImport}
            className="px-6 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-bold uppercase tracking-widest text-luna-gold hover:bg-luna-gold hover:text-white transition-all"
          >
            <i className="fa-solid fa-file-import mr-2"></i> Import Manifest
          </button>
          <div className="text-right">
            <span className="text-3xl font-bold text-luna-gold font-mono">{projects.length}</span>
            <p className="text-[10px] text-mystic-gray uppercase font-bold">Active Projects</p>
          </div>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="glass-panel p-20 rounded-3xl border-dashed border-white/10 text-center">
          <i className="fa-solid fa-box-open text-6xl text-white/10 mb-6"></i>
          <p className="text-celestial-stone italic">No production archives found in this session.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {projects.map((proj, i) => (
            <div key={i} className="glass-card rounded-3xl overflow-hidden border border-white/5 hover:border-luna-gold/30 transition-all group flex flex-col h-full shadow-2xl">
              <div className="aspect-video bg-eclipse-light relative overflow-hidden">
                {proj.scenes[0] && proj.assets[proj.scenes[0].id]?.imageUrl ? (
                  <img src={proj.assets[proj.scenes[0].id].imageUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt="Preview" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-white/5">
                    <i className="fa-solid fa-film text-4xl text-white/10"></i>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-eclipse-black via-transparent to-transparent"></div>
                <div className="absolute bottom-4 left-6">
                  <span className="px-2 py-0.5 rounded bg-luna-gold text-[9px] font-bold text-white uppercase tracking-widest">{proj.status}</span>
                </div>
              </div>
              
              <div className="p-8 flex-1 flex flex-col">
                <h3 className="text-xl font-bold text-white mb-2 font-mono tracking-tight line-clamp-1">
                  {proj.script.substring(0, 30).trim() || 'Untitled Fragment'}...
                </h3>
                <div className="flex gap-4 mb-6">
                  <div className="text-center">
                    <p className="text-[9px] text-mystic-gray uppercase font-bold">Scenes</p>
                    <p className="text-sm font-bold text-starlight">{proj.scenes.length}</p>
                  </div>
                  <div className="w-px h-8 bg-white/5"></div>
                  <div className="text-center">
                    <p className="text-[9px] text-mystic-gray uppercase font-bold">Cast</p>
                    <p className="text-sm font-bold text-starlight">{proj.characters.length}</p>
                  </div>
                  <div className="w-px h-8 bg-white/5"></div>
                  <div className="text-center">
                    <p className="text-[9px] text-mystic-gray uppercase font-bold">Style</p>
                    <p className="text-sm font-bold text-starlight truncate max-w-[80px]">{proj.globalStyle?.split(' ')[0]}</p>
                  </div>
                </div>
                
                <div className="flex gap-2 mt-auto">
                  <button 
                    onClick={() => onSelect(proj)}
                    className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl text-[10px] font-bold uppercase tracking-widest text-starlight hover:bg-luna-gold hover:text-white hover:border-luna-gold transition-all"
                  >
                    Restore Sequence
                  </button>
                  <button 
                    onClick={() => onDelete(i)}
                    className="w-12 h-12 flex items-center justify-center bg-white/5 border border-white/10 rounded-xl text-solar-amber/50 hover:text-solar-amber hover:bg-solar-amber/10 transition-all"
                  >
                    <i className="fa-solid fa-trash-can text-sm"></i>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
