import { BadRequestException } from '@nestjs/common';
import { DEFAULT_CARDS, LayoutService, MAX_CARDS } from './layout.service';

function make(doc: { cards: string[] } | null = null) {
  const model = {
    findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(doc) }),
    updateOne: jest.fn().mockResolvedValue({}),
    deleteOne: jest.fn().mockResolvedValue({}),
  };
  return { model, service: new LayoutService(model as never) };
}

describe('LayoutService', () => {
  it('gives the default cards to someone who never arranged theirs', async () => {
    const { service } = make();
    expect(await service.get('u1')).toEqual({ cards: DEFAULT_CARDS, isDefault: true });
  });

  it('gives back what a person saved', async () => {
    const { service } = make({ cards: ['rage', 'live'] });
    expect(await service.get('u1')).toEqual({ cards: ['rage', 'live'], isDefault: false });
  });

  it('saves the cards for that person only, without repeats, in order', async () => {
    const { service, model } = make();
    const r = await service.set('u1', ['live', 'rage', 'live']);
    expect(r).toEqual({ cards: ['live', 'rage'], isDefault: false });
    expect(model.updateOne).toHaveBeenCalledWith({ userId: 'u1' }, { $set: { cards: ['live', 'rage'] } }, { upsert: true });
  });

  it('can save an empty dashboard', async () => {
    const { service } = make();
    expect((await service.set('u1', [])).cards).toEqual([]);
  });

  it('rejects too many cards and odd card names', async () => {
    const { service, model } = make();
    await expect(service.set('u1', Array.from({ length: MAX_CARDS + 1 }, (_, i) => `c${i}`))).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.set('u1', ['$where'])).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.set('u1', ['a.b'])).rejects.toBeInstanceOf(BadRequestException);
    expect(model.updateOne).not.toHaveBeenCalled();
  });

  it('goes back to the default view', async () => {
    const { service, model } = make();
    expect(await service.reset('u1')).toEqual({ cards: DEFAULT_CARDS, isDefault: true });
    expect(model.deleteOne).toHaveBeenCalledWith({ userId: 'u1' });
  });
});
