import React from 'react';
import { X, ArrowUpRight } from 'lucide-react';
import { playSound } from '../lib/sound';

export interface ProjectItem {
  id: string;
  title: string;
  subtitle: string;
  url: string;
  year: string;
  tag: string;
  badgeType: string;
  accentColor: string;
  colSpanClass: string;
  description: string;
  imageSrc?: string;
  techHighlights: string[];
  metrics: { label: string; value: string }[];
  interactiveDemo?: React.ReactNode;
}

interface ProjectModalProps {
  project: ProjectItem | null;
  onClose: () => void;
}

export const ProjectModal: React.FC<ProjectModalProps> = ({ project, onClose }) => {
  if (!project) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-[var(--bg-card)] border border-[var(--border)] rounded overflow-hidden font-mono text-xs text-[var(--text-secondary)] select-none shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--bg)]">
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-xs"
              style={{ backgroundColor: project.accentColor }}
            />
            <span className="text-[var(--text-primary)] font-bold uppercase tracking-wider text-xs">
              MOD_{project.id.toUpperCase()} // SPECIFICATION
            </span>
            <span className="text-[10px] text-[var(--text-tertiary)]">
              [{project.year}]
            </span>
          </div>

          <button
            onClick={() => {
              playSound('click');
              onClose();
            }}
            className="p-1 rounded hover:bg-[var(--bg-card)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto no-scrollbar">
          <div>
            <div className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] mb-1">
              NODE CLASSIFICATION: {project.badgeType}
            </div>
            <h3 className="font-mono text-base sm:text-lg font-bold text-[var(--text-primary)]">
              {project.subtitle}
            </h3>
            <p className="mt-2 text-xs font-mono text-[var(--text-secondary)] leading-relaxed">
              {project.description}
            </p>
          </div>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {project.metrics.map((m, i) => (
              <div key={i} className="p-2.5 rounded bg-[var(--bg)] border border-[var(--border)]">
                <span className="text-[10px] text-[var(--text-tertiary)] block uppercase">
                  {m.label}
                </span>
                <span className="text-xs font-bold text-[var(--text-primary)] mt-0.5 block tabular-nums">
                  {m.value}
                </span>
              </div>
            ))}
          </div>

          {/* Architecture Highlights */}
          <div className="space-y-2">
            <span className="text-[10px] uppercase font-bold text-[var(--text-tertiary)]">
              TECHNICAL DIRECTIVES &amp; PIPELINES
            </span>
            <ul className="space-y-1.5 font-mono text-xs divide-y divide-[var(--border)] border-t border-b border-[var(--border)] py-1">
              {project.techHighlights.map((tech, i) => (
                <li key={i} className="flex items-center gap-2 text-[var(--text-secondary)] py-1">
                  <span className="text-[var(--text-tertiary)] text-[10px] font-bold">[{i + 1}]</span>
                  <span>{tech}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Footer Bar */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)] bg-[var(--bg)]">
          <span className="text-[10px] text-[var(--text-tertiary)]">
            RUNTIME: 100% SERVERLESS V8
          </span>

          <a
            href={project.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => playSound('click')}
            className="btn-dotted px-3 py-1.5 rounded bg-[var(--text-primary)] text-[var(--bg)] font-bold uppercase text-xs flex items-center gap-1.5 hover:opacity-90 transition-opacity"
          >
            <span>LAUNCH {project.title}</span>
            <ArrowUpRight className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
};
