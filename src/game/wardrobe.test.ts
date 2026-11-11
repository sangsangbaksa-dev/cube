import { describe, it, expect } from 'vitest';
import { Wardrobe, SKINS, DEFAULT_SKIN_ID, skinById, type WardrobeSave, type WardrobeStorage } from './wardrobe';

/** 메모리 저장소. set한 값을 JSON으로 되돌려 실제 저장처럼 복사본을 쓴다 */
function memStorage(initial: unknown = null) {
  let value: unknown = initial;
  const storage: WardrobeStorage = {
    get: () => value,
    set: (v: WardrobeSave) => { value = JSON.parse(JSON.stringify(v)); },
  };
  return { storage, peek: () => value };
}

describe('스킨 목록', () => {
  it('9개, id 고유, 기본 스킨은 무료', () => {
    expect(SKINS).toHaveLength(9);
    expect(new Set(SKINS.map((s) => s.id)).size).toBe(9);
    expect(skinById(DEFAULT_SKIN_ID)?.price).toBe(0);
  });

  it('유료 스킨 가격은 40~600 사이', () => {
    for (const s of SKINS.filter((s) => s.id !== DEFAULT_SKIN_ID)) {
      expect(s.price).toBeGreaterThanOrEqual(40);
      expect(s.price).toBeLessThanOrEqual(600);
    }
  });
});

describe('Wardrobe 기본 동작', () => {
  it('처음에는 코인 0, 기본 스킨만 소유, 기본 스킨 착용', () => {
    const w = new Wardrobe(memStorage().storage);
    expect(w.coins).toBe(0);
    expect(w.owned(DEFAULT_SKIN_ID)).toBe(true);
    expect(w.owned('gold')).toBe(false);
    expect(w.equipped.id).toBe(DEFAULT_SKIN_ID);
  });

  it('earn은 정수만 받고 잘못된 값은 무시한다', () => {
    const w = new Wardrobe(memStorage().storage);
    expect(w.earn(10.7, '별가루')).toBe(10);
    expect(w.earn(-5)).toBe(0);
    expect(w.earn(Number.NaN)).toBe(0);
    expect(w.earn(Infinity)).toBe(0);
    expect(w.coins).toBe(10);
    expect(w.totalEarned).toBe(10);
    expect(w.lastReason).toBe('별가루');
  });
});

describe('구매 / 장착 / 잔액', () => {
  it('잔액이 모자라면 poor, 잔액과 소유는 그대로', () => {
    const w = new Wardrobe(memStorage().storage);
    w.earn(39);
    expect(w.buy('dusk')).toBe('poor');
    expect(w.coins).toBe(39);
    expect(w.owned('dusk')).toBe(false);
  });

  it('충분하면 ok, 가격만큼 차감, 다시 사면 owned', () => {
    const w = new Wardrobe(memStorage().storage);
    w.earn(100);
    expect(w.buy('dusk')).toBe('ok');
    expect(w.coins).toBe(60);
    expect(w.owned('dusk')).toBe(true);
    expect(w.buy('dusk')).toBe('owned');
    expect(w.coins).toBe(60);
  });

  it('없는 id는 unknown', () => {
    const w = new Wardrobe(memStorage().storage);
    w.earn(1000);
    expect(w.buy('nope')).toBe('unknown');
    expect(w.coins).toBe(1000);
  });

  it('총 획득량은 구매해도 줄지 않는다', () => {
    const w = new Wardrobe(memStorage().storage);
    w.earn(100);
    w.buy('dusk');
    expect(w.totalEarned).toBe(100);
  });

  it('미소유 스킨은 장착 불가, 소유 후에는 장착 가능', () => {
    const w = new Wardrobe(memStorage().storage);
    expect(w.equip('gold')).toBe(false);
    expect(w.equipped.id).toBe(DEFAULT_SKIN_ID);
    w.earn(40);
    w.buy('dusk');
    expect(w.equip('dusk')).toBe(true);
    expect(w.equipped.id).toBe('dusk');
  });
});

describe('저장 왕복', () => {
  it('구매/장착/잔액이 새 인스턴스에서 그대로 복원된다', () => {
    const { storage } = memStorage();
    const a = new Wardrobe(storage);
    a.earn(500);
    a.buy('moss');
    a.buy('night');
    a.equip('night');

    const b = new Wardrobe(storage);
    expect(b.coins).toBe(500 - 80 - 400);
    expect(b.totalEarned).toBe(500);
    expect(b.owned('moss')).toBe(true);
    expect(b.owned('night')).toBe(true);
    expect(b.owned('gold')).toBe(false);
    expect(b.equipped.id).toBe('night');
  });

  it('저장 키 형태: 저장된 값에 owned 목록이 들어간다', () => {
    const { storage, peek } = memStorage();
    new Wardrobe(storage).earn(5);
    expect(peek()).toMatchObject({ coins: 5, totalEarned: 5, owned: [DEFAULT_SKIN_ID], equipped: DEFAULT_SKIN_ID });
  });
});

describe('손상된 저장 데이터', () => {
  it('이상한 최상위 값(문자열, 숫자, 배열)이면 기본 상태', () => {
    for (const bad of ['garbage', 42, [1, 2], true]) {
      const w = new Wardrobe(memStorage(bad).storage);
      expect(w.coins).toBe(0);
      expect(w.equipped.id).toBe(DEFAULT_SKIN_ID);
    }
  });

  it('get이 던져도 기본 상태로 시작', () => {
    const storage: WardrobeStorage = { get: () => { throw new Error('boom'); }, set: () => {} };
    const w = new Wardrobe(storage);
    expect(w.coins).toBe(0);
    expect(w.owned(DEFAULT_SKIN_ID)).toBe(true);
  });

  it('항목별로 검증: 음수/소수 코인 무시, 없는 스킨 id 제거, 미소유 착용 무시', () => {
    const { storage } = memStorage({
      coins: -5,
      totalEarned: 'many',
      owned: ['nope', 'gold', 42, null, 'dusk'],
      equipped: 'night',
    });
    const w = new Wardrobe(storage);
    expect(w.coins).toBe(0);
    expect(w.totalEarned).toBe(0);
    expect(w.owned('nope')).toBe(false);
    expect(w.owned('gold')).toBe(true);
    expect(w.owned('dusk')).toBe(true);
    expect(w.owned('night')).toBe(false);
    expect(w.equipped.id).toBe(DEFAULT_SKIN_ID);
  });

  it('소수 코인은 무시, 총 획득량은 유효하면 살리고 코인보다 작으면 코인에 맞춘다', () => {
    const a = new Wardrobe(memStorage({ coins: 12.5, totalEarned: 3, owned: [], equipped: 'sky' }).storage);
    expect(a.coins).toBe(0);
    expect(a.totalEarned).toBe(3);
    const b = new Wardrobe(memStorage({ coins: 50, totalEarned: 20 }).storage);
    expect(b.coins).toBe(50);
    expect(b.totalEarned).toBe(50);
  });

  it('기본 스킨은 저장 데이터와 무관하게 항상 소유', () => {
    const { storage } = memStorage({ coins: 0, owned: [], equipped: 'gold' });
    const w = new Wardrobe(storage);
    expect(w.owned(DEFAULT_SKIN_ID)).toBe(true);
    expect(w.equipped.id).toBe(DEFAULT_SKIN_ID);
  });
});
