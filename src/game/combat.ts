// 플레이어 회전 공격: 콤보 3단, 짧은 판정 시간. 렌더와 무관한 순수 상태 기계.
export interface HitBox {
  /** 공격마다 바뀌는 번호. 몬스터는 같은 번호에 두 번 맞지 않는다 */
  id: number;
  radius: number;
  damage: number;
  knock: number;
  combo: number;
}

export const SWING_TIME = 0.26;
const ACTIVE_FROM = 0.03;
const ACTIVE_TO = 0.2;
const COOLDOWN = 0.3;
const COMBO_WINDOW = 0.55;

export class PlayerCombat {
  /** 현재 휘두르기 경과 시간. 휘두르지 않으면 -1 */
  t = -1;
  combo = 0;
  private sinceEnd = 99;
  private cooldown = 0;
  private nextId = 1;
  private id = 0;
  power = 0;
  /** 장착한 무기 보정 */
  weapon = { radius: 0, damage: 0, knock: 1 };

  /** 공격 버튼: 휘두를 수 있으면 콤보 단계(1~3)를, 아니면 0을 돌려준다 */
  tryAttack(): number {
    if (this.t >= 0 || this.cooldown > 0) return 0;
    this.combo = this.sinceEnd < COMBO_WINDOW && this.combo < 3 ? this.combo + 1 : 1;
    this.t = 0;
    this.id = this.nextId++;
    return this.combo;
  }

  update(dt: number) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.t >= 0) {
      this.t += dt;
      if (this.t >= SWING_TIME) {
        this.t = -1;
        this.sinceEnd = 0;
        this.cooldown = this.combo === 3 ? COOLDOWN * 1.8 : COOLDOWN * 0.4;
      }
    } else {
      this.sinceEnd += dt;
    }
  }

  cancel() {
    this.t = -1;
  }

  /** 지금 맞힐 수 있는 판정 (없으면 null) */
  get hit(): HitBox | null {
    if (this.t < ACTIVE_FROM || this.t > ACTIVE_TO) return null;
    const big = this.combo === 3;
    return {
      id: this.id,
      radius: (big ? 2.35 : 1.85) + this.power * 0.5 + this.weapon.radius,
      damage: (big ? 2 : 1) + (big && this.power > 0 ? 1 : 0) + this.weapon.damage,
      knock: (big ? 13 : 8) * this.weapon.knock,
      combo: this.combo,
    };
  }

  /** 연출용 회전 각도 */
  get spin(): number {
    if (this.t < 0) return 0;
    const k = Math.min(1, this.t / SWING_TIME);
    const e = 1 - Math.pow(1 - k, 3);
    return e * Math.PI * 2 * (this.combo === 3 ? 2 : 1) * (this.combo === 2 ? -1 : 1);
  }
}
