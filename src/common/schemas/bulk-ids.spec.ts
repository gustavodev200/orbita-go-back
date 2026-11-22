import { bulkIdsSchema } from './common.schema';

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('bulkIdsSchema', () => {
  it('aceita 1 uuid', () => {
    expect(bulkIdsSchema.parse({ ids: [id(1)] })).toEqual({ ids: [id(1)] });
  });

  it('rejeita lista vazia', () => {
    expect(bulkIdsSchema.safeParse({ ids: [] }).success).toBe(false);
  });

  it('rejeita mais de 200 ids', () => {
    const ids = Array.from({ length: 201 }, (_, i) => id(i));
    expect(bulkIdsSchema.safeParse({ ids }).success).toBe(false);
  });

  it('rejeita id que não é uuid', () => {
    expect(bulkIdsSchema.safeParse({ ids: ['abc'] }).success).toBe(false);
  });

  it('remove ids repetidos', () => {
    expect(bulkIdsSchema.parse({ ids: [id(1), id(1), id(2)] })).toEqual({
      ids: [id(1), id(2)],
    });
  });
});
