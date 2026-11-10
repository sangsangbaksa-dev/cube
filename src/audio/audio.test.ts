import { describe, it, expect } from 'vitest';
import { GameAudio } from './audio';

// 노드 환경에는 AudioContext가 없으므로 ctx는 null이다. 모든 호출이 아무 일 없이 끝나야 한다.
describe('GameAudio without an AudioContext', () => {
  it('runs every combat and status cue as a no-op', () => {
    const audio = new GameAudio();
    const cues: Array<() => void> = [
      () => audio.swing(1),
      () => audio.swing(2),
      () => audio.swing(3),
      () => audio.hit(),
      () => audio.enemyHurt(),
      () => audio.enemyDie(false),
      () => audio.enemyDie(true),
      () => audio.hurt(),
      () => audio.dash(),
      () => audio.doubleJump(),
      () => audio.slamStart(),
      () => audio.slamImpact(0),
      () => audio.slamImpact(1),
      () => audio.stomp(),
      () => audio.shard(),
      () => audio.orbShoot(),
      () => audio.orbReflect(),
      () => audio.roar(),
      () => audio.riftPulse(),
      () => audio.heal(),
      () => audio.death(),
      () => audio.respawn(),
      () => audio.checkpoint(),
    ];
    for (const cue of cues) expect(() => cue()).not.toThrow();
  });

  it('accepts threat and low-health state and runs update() without throwing', () => {
    const audio = new GameAudio();
    expect(() => {
      audio.setThreat(0.8, true);
      audio.setLowHealth(true);
      audio.update(0.016, { elevation: -0.5, speed: 3, grounded: true });
      audio.setThreat(0, false);
      audio.setLowHealth(false);
      audio.update(0.016, { elevation: 0.5, speed: 0, grounded: false });
    }).not.toThrow();
    expect(audio.state).toBe('locked');
  });

  it('stays a no-op when muted', () => {
    const audio = new GameAudio();
    audio.setMuted(true);
    expect(() => {
      audio.swing(3);
      audio.roar();
      audio.setThreat(1, true);
      audio.update(0.016, { elevation: -1, speed: 0, grounded: true });
    }).not.toThrow();
  });
});
