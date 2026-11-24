import { objectiveProgress } from './objective-progress';

describe('objectiveProgress', () => {
  it('sem itens → 0', () => {
    expect(objectiveProgress([], false)).toBe(0);
  });

  it('conta etapas e tarefas juntas, arredondado', () => {
    const items = [{ done: true }, { done: false }, { done: false }];
    expect(objectiveProgress(items, false)).toBe(33);
  });

  it('tudo feito → 100', () => {
    expect(objectiveProgress([{ done: true }, { done: true }], false)).toBe(
      100,
    );
  });

  it('meta concluída é 100 mesmo com itens pendentes', () => {
    expect(objectiveProgress([{ done: false }], true)).toBe(100);
  });
});
