/**
 * Notes from importing a Word template, handed from the Templates page to the editor it opens.
 * Held in memory for the one navigation; the editor takes them once.
 */
export const pendingImportNotes = new Map<string, string[]>();

export function takeImportNotes(templateId: string): string[] | null {
  const notes = pendingImportNotes.get(templateId) ?? null;
  pendingImportNotes.delete(templateId);
  return notes;
}
