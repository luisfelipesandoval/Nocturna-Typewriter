import React, { useState } from 'react';
import {
  BookOpen,
  FilePlus,
  FolderPlus,
  Search,
  Trash2,
  X,
  FileText,
} from 'lucide-react';
import { calculateTextMetrics, Notebook } from '../utils/pagination';

interface NotebookOrganizerProps {
  isOpen: boolean;
  notebooks: Notebook[];
  activeNotebookId: string;
  activePageIndex: number;
  onClose: () => void;
  onSelectNotebookAndPage: (notebookId: string, pageIndex: number) => void;
  onCreateNotebook: (title?: string) => void;
  onDeleteNotebook: (notebookId: string) => void;
  onAddPageToNotebook: (notebookId: string) => void;
  onDeletePageFromNotebook: (notebookId: string, pageIndex: number) => void;
}

export const NotebookOrganizer: React.FC<NotebookOrganizerProps> = ({
  isOpen,
  notebooks,
  activeNotebookId,
  activePageIndex,
  onClose,
  onSelectNotebookAndPage,
  onCreateNotebook,
  onDeleteNotebook,
  onAddPageToNotebook,
  onDeletePageFromNotebook,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [newTitleInput, setNewTitleInput] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  if (!isOpen) return null;

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredNotebooks = notebooks.filter((nb) => {
    if (!normalizedQuery) return true;
    if (nb.title.toLowerCase().includes(normalizedQuery)) return true;
    return nb.pages.some((p) => p.content.toLowerCase().includes(normalizedQuery));
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTitleInput.trim() || `Cuaderno nocturno ${notebooks.length + 1}`;
    onCreateNotebook(title);
    setNewTitleInput('');
    setIsCreating(false);
  };

  return (
    <aside
      aria-label="Organizador de cuadernos y hojas guardadas"
      className="fixed inset-y-0 left-0 z-40 w-full max-w-[360px] bg-[#171310] border-r border-[#312822] shadow-[16px_0_48px_rgba(0,0,0,0.75)] flex flex-col"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#2C241E] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <BookOpen className="w-4 h-4 text-[#D99B4E]" />
          <h2 className="font-editorial text-base font-normal text-[#F3E9D7]">
            Archivo de Cuadernos y Hojas
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar organizador de notas"
          className="p-1.5 rounded-md text-[#A89A8A] hover:text-[#F2E9D8] hover:bg-[#26201C] transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Actions & Search Bar */}
      <div className="p-4 border-b border-[#2A221D] space-y-3 bg-[#1A1512]">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-[#8A7B6B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar en tus hojas..."
              aria-label="Buscar en cuadernos y hojas"
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md bg-[#13100E] border border-[#312822] text-[#F2E9D8] placeholder-[#736558] focus:outline-none focus:border-[#D99B4E]"
            />
          </div>
          <button
            type="button"
            onClick={() => setIsCreating((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[#D99B4E] text-[#171310] hover:bg-[#E5AA5E] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>Nuevo cuaderno</span>
          </button>
        </div>

        {isCreating && (
          <form onSubmit={handleCreateSubmit} className="flex items-center gap-2 pt-1">
            <input
              type="text"
              value={newTitleInput}
              onChange={(e) => setNewTitleInput(e.target.value)}
              placeholder="Nombre del nuevo cuaderno..."
              aria-label="Nombre del nuevo cuaderno"
              autoFocus
              className="flex-1 px-3 py-1.5 text-xs rounded-md bg-[#120F0D] border border-[#45382E] text-[#F2E9D8] placeholder-[#736558] focus:outline-none focus:border-[#D99B4E]"
            />
            <button
              type="submit"
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-[#2D251F] border border-[#4A3D33] text-[#F0C987] hover:bg-[#3A3028] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Crear
            </button>
          </form>
        )}
      </div>

      {/* Notebooks & Sheets Tree */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {filteredNotebooks.length === 0 ? (
          <div className="py-10 text-center text-xs text-[#8C7E70]">
            No se encontraron hojas que coincidan con tu búsqueda.
          </div>
        ) : (
          filteredNotebooks.map((nb) => {
            const isActiveNb = nb.id === activeNotebookId;
            const fullText = nb.pages.map((p) => p.content).join('\n');
            const nbMetrics = calculateTextMetrics(fullText);

            return (
              <div
                key={nb.id}
                className={`rounded-lg border transition-colors ${
                  isActiveNb
                    ? 'bg-[#211B17] border-[#4A3D33]'
                    : 'bg-[#1A1613] border-[#2C241E] hover:border-[#3A3028]'
                }`}
              >
                {/* Notebook Header */}
                <div className="p-3.5 flex items-start justify-between gap-2 border-b border-[#2A221D]">
                  <button
                    type="button"
                    onClick={() => onSelectNotebookAndPage(nb.id, 0)}
                    className="text-left flex-1 group cursor-pointer"
                  >
                    <h3 className="font-editorial text-sm text-[#F4EBDC] group-hover:text-[#F0C987] transition-colors">
                      {nb.title || 'Cuaderno sin título'}
                    </h3>
                    <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[#8E7F70] font-mono tabular-nums">
                      <span>{nb.pages.length} {nb.pages.length === 1 ? 'hoja' : 'hojas'}</span>
                      <span aria-hidden="true">·</span>
                      <span>{nbMetrics.words} palabras</span>
                    </div>
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onAddPageToNotebook(nb.id)}
                      title="Añadir hoja a este cuaderno"
                      aria-label={`Añadir hoja a ${nb.title}`}
                      className="p-1.5 rounded text-[#B5A594] hover:text-[#F0C987] hover:bg-[#2B231E] transition-colors cursor-pointer"
                    >
                      <FilePlus className="w-3.5 h-3.5" />
                    </button>
                    {notebooks.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onDeleteNotebook(nb.id)}
                        title="Eliminar cuaderno"
                        aria-label={`Eliminar cuaderno ${nb.title}`}
                        className="p-1.5 rounded text-[#9E7264] hover:text-[#E8957E] hover:bg-[#2B231E] transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Individual Physical Sheets List */}
                <div className="divide-y divide-[#261F1B]">
                  {nb.pages.map((pg, idx) => {
                    const isSelectedSheet = isActiveNb && idx === activePageIndex;
                    const snippet =
                      pg.content.trim().slice(0, 72) || 'Hoja en blanco...';

                    return (
                      <div
                        key={pg.id}
                        className={`px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs transition-colors ${
                          isSelectedSheet
                            ? 'bg-[#2C241E] text-[#F5EAD8]'
                            : 'text-[#B5A695] hover:bg-[#241E19]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onSelectNotebookAndPage(nb.id, idx)}
                          className="flex-1 text-left flex items-start gap-2.5 min-w-0 cursor-pointer"
                        >
                          <FileText
                            className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                              isSelectedSheet ? 'text-[#D99B4E]' : 'text-[#7A6C5E]'
                            }`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="font-mono text-[11px] text-[#D8C7B4] flex items-center gap-1.5">
                              <span>Hoja {idx + 1}</span>
                              {isSelectedSheet && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-[#E8A856]">Activa</span>
                                </>
                              )}
                            </div>
                            <p className="truncate text-[11px] text-[#8E7F70] font-typewriter mt-0.5">
                              {snippet}
                            </p>
                          </div>
                        </button>

                        {nb.pages.length > 1 && (
                          <button
                            type="button"
                            onClick={() => onDeletePageFromNotebook(nb.id, idx)}
                            aria-label={`Borrar hoja ${idx + 1} de ${nb.title}`}
                            title="Borrar esta hoja"
                            className="p-1 rounded text-[#8A675B] hover:text-[#E59882] hover:bg-[#332923] transition-colors shrink-0 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
