import React from 'react';
import { ProductionPhase, ProjectState } from '../../types';

interface DirectorChipsProps {
    onSelect: (text: string) => void;
    currentPhase: ProductionPhase;
    project: ProjectState;
    disabled?: boolean;
}

export const DirectorChips: React.FC<DirectorChipsProps> = ({ onSelect, currentPhase, project, disabled }) => {
    const completedCount = Object.values(project.assets).filter((a: any) => a.status === 'complete').length;

    let chips: string[];

    if (currentPhase === 'genesis' && project.script && project.scenes.length === 0) {
        chips = ["Analyze my script now", "Reformat my script", "Help me write a script", "What should I do next?"];
    } else if (currentPhase === 'genesis') {
        chips = ["Help me name my characters", "Suggest a visual style", "What should I do next?", "Reformat my script"];
    } else if (currentPhase === 'manifest' && project.characters.some(c => !c.characterDNA)) {
        chips = ["Optimize all character prompts", "Assign voices to cast", "Check continuity", "Suggest camera shots"];
    } else if (currentPhase === 'manifest') {
        chips = ["Audit character voices", "Check scene pacing", "Suggest B-Roll ideas", "Review script dialogue"];
    } else if (currentPhase === 'synthesis' && completedCount > 0) {
        chips = ["Audit visual consistency", "Flag inconsistent scenes", "Suggest B-roll", "Apply lighting brief"];
    } else if (currentPhase === 'synthesis') {
        chips = ["Analyze visual consistency", "Regenerate inconsistent shots", "Suggest better music moods", "Check for rendering errors"];
    } else {
        chips = ["Suggest color grading logic", "Draft YouTube title/desc", "Analyze pacing flow", "Export checklist"];
    }

    return (
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide px-1 mt-2">
            {chips.map((chip, idx) => (
                <button
                    key={idx}
                    onClick={() => onSelect(chip)}
                    disabled={disabled}
                    className="whitespace-nowrap flex-shrink-0 px-3 py-1.5 rounded-full border border-[#00d4ff]/30 text-[#00d4ff] text-[10px] font-medium hover:bg-[#00d4ff]/10 hover:border-[#00d4ff] hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none backdrop-blur-sm"
                >
                    {chip}
                </button>
            ))}
        </div>
    );
};
