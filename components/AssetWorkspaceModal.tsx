import React, { useEffect } from 'react';
import { ProjectState, YoutubeMetadata } from '../types';
import { AssetLibraryBody } from './AssetLibrary';
import { StoryboardViewBody } from './StoryboardView';
import { ProductionManifestBody } from './ProductionManifest';

// B3 (audit slice): one modal, three tabs. Replaces three competing dashboard
// buttons (Storyboard / Asset Registry / Production Manifest) that each
// rendered their own full-screen overlay with their own backdrop, header,
// and close affordance. The unified workspace shares all of that and lets
// the user flip between views via the tab strip without round-tripping
// through the dashboard.

export type AssetWorkspaceTab = 'library' | 'storyboard' | 'manifest';

interface AssetWorkspaceModalProps {
    project: ProjectState;
    youtubeMetadata?: YoutubeMetadata | null;
    activeTab: AssetWorkspaceTab;
    onTabChange: (tab: AssetWorkspaceTab) => void;
    onSelectScene: (sceneId: string) => void;
    onClose: () => void;
}

const TAB_DEFS: Array<{ id: AssetWorkspaceTab; label: string; icon: string; sub: string }> = [
    { id: 'library', label: 'Asset Registry', icon: 'fa-photo-film', sub: 'Vault of all generated production takes' },
    { id: 'storyboard', label: 'Storyboard', icon: 'fa-grip', sub: 'Full visual sequence breakdown' },
    { id: 'manifest', label: 'Production Manifest', icon: 'fa-file-invoice', sub: 'Real-time project telemetry & synthesis' },
];

export const AssetWorkspaceModal: React.FC<AssetWorkspaceModalProps> = ({
    project,
    youtubeMetadata,
    activeTab,
    onTabChange,
    onSelectScene,
    onClose,
}) => {
    // The existing App.tsx Escape handler closes every modal flag at once
    // (App.tsx:370-…). It already covers this modal via the activeTab → null
    // reset wired at the workspace setter site; no extra Escape wiring needed.
    // We still mount this effect to lock body scroll while the workspace is
    // open — three children all expect that behaviour from the old standalone
    // modals' fixed-overlay positioning.
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, []);

    const tab = TAB_DEFS.find(t => t.id === activeTab)!;

    return (
        <div className="fixed inset-0 z-[400] bg-eclipse-black/97 backdrop-blur-3xl flex items-center justify-center p-6 animate-in fade-in duration-500">
            <div className="w-full max-w-7xl h-full max-h-[90vh] flex flex-col bg-eclipse-black border border-white/5 rounded-[3rem] overflow-hidden shadow-2xl">
                <header className="p-8 border-b border-white/5 flex justify-between items-center bg-white/5">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-luna-gold/10 border border-luna-gold/30 flex items-center justify-center text-luna-gold">
                            <i className={`fa-solid ${tab.icon} text-xl`}></i>
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-white uppercase tracking-tighter font-mono italic">{tab.label}</h2>
                            <p className="text-[10px] text-mystic-gray uppercase font-bold tracking-[0.3em]">{tab.sub}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-10 h-10 rounded-full nm-button flex items-center justify-center text-mystic-gray hover:text-white transition-all"
                        aria-label="Dismiss asset workspace"
                    >
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </header>

                <nav className="px-8 pt-4 border-b border-white/5 flex gap-2" role="tablist" aria-label="Asset workspace tabs">
                    {TAB_DEFS.map(t => {
                        const isActive = t.id === activeTab;
                        return (
                            <button
                                key={t.id}
                                role="tab"
                                aria-selected={isActive}
                                onClick={() => onTabChange(t.id)}
                                className={`px-6 py-3 -mb-px text-[10px] font-black uppercase tracking-widest border-b-2 transition-colors ${
                                    isActive
                                        ? 'text-luna-gold border-luna-gold'
                                        : 'text-mystic-gray border-transparent hover:text-white'
                                }`}
                            >
                                <i className={`fa-solid ${t.icon} mr-2`}></i>
                                {t.label}
                            </button>
                        );
                    })}
                </nav>

                <div className="flex-1 overflow-y-auto p-10 scrollbar-hide" role="tabpanel">
                    {activeTab === 'library' && (
                        <AssetLibraryBody assets={project.assets} scenes={project.scenes} onSelect={(sceneId) => { onSelectScene(sceneId); onClose(); }} />
                    )}
                    {activeTab === 'storyboard' && (
                        <StoryboardViewBody scenes={project.scenes} assets={project.assets} onSelectScene={onSelectScene} onSelectClose={onClose} />
                    )}
                    {activeTab === 'manifest' && (
                        <ProductionManifestBody project={project} youtubeMetadata={youtubeMetadata ?? undefined} />
                    )}
                </div>

                <footer className="p-6 border-t border-white/5 bg-white/5 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-10 py-3 bg-white text-black rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-2xl hover:bg-luna-gold hover:text-white transition-all"
                    >
                        Dismiss Workspace
                    </button>
                </footer>
            </div>
        </div>
    );
};
