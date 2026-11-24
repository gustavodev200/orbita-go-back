/**
 * % de conclusão de uma meta: etapas feitas + tarefas vinculadas feitas sobre
 * o total das duas. Meta concluída é sempre 100; sem itens, 0.
 */
export function objectiveProgress(
  items: { done: boolean }[],
  completed: boolean,
): number {
  if (completed) return 100;
  if (items.length === 0) return 0;
  const done = items.filter((i) => i.done).length;
  return Math.round((done / items.length) * 100);
}
