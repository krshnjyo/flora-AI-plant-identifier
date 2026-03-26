"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { GlassSurface } from "@/components/layout/showcase-shell";
import { WorkspaceButton, type WorkspaceButtonTone } from "@/components/layout/workspace-button";

type ExpanderPanel<K extends string> = {
  key: K;
  label: string;
  title: string;
  description: string;
  tone?: WorkspaceButtonTone;
};

export function WorkspaceExpander<K extends string>({
  panelButtons,
  selectedPanelKey,
  onSelectPanel,
  onBackToGrid,
  renderExpandedPanel,
  sideRail,
  heightClassName = "xl:h-[34rem]"
}: {
  panelButtons: Array<ExpanderPanel<K>>;
  selectedPanelKey: K | "";
  onSelectPanel: (key: K) => void;
  onBackToGrid: () => void;
  renderExpandedPanel: () => ReactNode;
  sideRail: ReactNode;
  heightClassName?: string;
}) {
  return (
    <div className={`grid min-h-0 gap-4 xl:min-h-0 xl:grid-cols-12 ${heightClassName}`}>
      <section className={`min-h-0 ${selectedPanelKey ? "xl:col-span-12" : "xl:col-span-8"} xl:flex xl:h-full xl:min-h-0 xl:flex-col`}>
        <GlassSurface className="xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:p-4">
          {selectedPanelKey ? (
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.36 }}
              className="animate-result-panel-expand flex h-full min-h-0 flex-col"
            >
              <div className="flex items-start justify-start">
                <button
                  type="button"
                  onClick={onBackToGrid}
                  aria-label="Back to grid"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-900/12 bg-white text-zinc-700 transition-colors hover:border-zinc-900 hover:text-zinc-900"
                >
                  <ArrowLeft size={14} />
                </button>
              </div>

              <div className="mt-3 flex h-full min-h-0 flex-col overflow-y-auto pr-1">{renderExpandedPanel()}</div>
            </motion.section>
          ) : (
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.36 }}
              className="flex h-full min-h-0 flex-col"
            >
              <div className="grid h-full min-h-0 auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-2 xl:grid-rows-3">
                {panelButtons.map((panel) => (
                  <WorkspaceButton
                    key={panel.key}
                    label={panel.label}
                    title={panel.title}
                    description={panel.description}
                    tone={panel.tone}
                    onClick={() => onSelectPanel(panel.key)}
                    className="h-full"
                  />
                ))}
              </div>
            </motion.section>
          )}
        </GlassSurface>
      </section>

      {!selectedPanelKey ? (
        <GlassSurface className="xl:col-span-4 xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:p-5">{sideRail}</GlassSurface>
      ) : null}
    </div>
  );
}
