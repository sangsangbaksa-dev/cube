import { ROUTES, type Site } from '../world/terrain';
import type { CourseSpec, PlatformKind, PlatformSpec } from './types';

export interface Barrier {
  x: number; z: number; hx: number; hz: number; bottom: number; top: number;
  kind: 'wall' | 'ceiling';
}

export interface RouteCourse extends CourseSpec {
  barriers: Barrier[];
  recovery?: { minY: number; x: number; z: number; hx: number; hz: number };
}

export function makeRoute(site: Site): RouteCourse {
  const { x, y: baseY, z } = site;
  const platforms: PlatformSpec[] = [];
  const barriers: Barrier[] = [];
  const p = (u: number, y: number, v: number, hx: number, hz = hx, kind: PlatformKind = 'static',
    options: Pick<PlatformSpec, 'move' | 'launch' | 'orbit'> = {}) => {
    platforms.push({ x: x + u, y: baseY + y, z: z + v, hx, hz, thickness: 0.48, kind, ...options });
  };
  const wall = (u: number, v: number, hx: number, hz: number, bottom: number, top: number, kind: Barrier['kind'] = 'wall') => {
    barriers.push({ x: x + u, z: z + v, hx, hz, bottom: baseY + bottom, top: baseY + top, kind });
  };
  const drift = (ax: number, ay: number, az: number, period: number, phase = 0) => ({ move: { ax, ay, az, period, phase } });
  let recovery: RouteCourse['recovery'];

  switch (site.id) {
    case 1: // 짧고 넓은 입문 계단
      p(6, .25, 9, 1.9, 1.65);
      p(4, 1.2, 6, 1.45);
      p(3, 2.25, 2.8, 1.45);
      p(.6, 3.25, .4, 1.45);
      p(-2.4, 4.3, -1, 1.5);
      p(-5.4, 5.35, -2, 1.7, 1.55, 'goal');
      break;
    case 2: { // 기본 탑 한 개: 고정 발판
      const a0 = 2.48;
      for (let i = 0; i < 16; i++) {
        const a = a0 + i * .53;
        p(Math.cos(a) * 6.35, .28 + i * 1.14, Math.sin(a) * 6.35, i === 8 ? 1.45 : 1.22,
          i === 8 ? 1.45 : 1.22, i === 15 ? 'goal' : i === 8 ? 'checkpoint' : 'static');
      }
      break;
    }
    case 3: // 수직 리프트, 가로로 밀려오는 수문
      p(-16, .32, -6, 1.9);
      p(-12.4, 1.46, -5, 1.42, 1.28);
      p(-8.4, 2.1, -4, 1.32, 1.22, 'moving', drift(0, 1.0, 0, 3.6, .7));
      p(-4.7, 3.65, -3.5, 1.4, 1.4);
      p(-1.2, 4.75, -1.5, 1.42, 1.55);
      p(2.6, 5.5, -.8, 1.78, 1.8, 'checkpoint');
      p(6.7, 6.2, .3, 1.26, 1.42, 'moving', drift(1.28, 0, 0, 4.2, .2));
      p(10.5, 6.85, 2.1, 1.35, 1.5);
      p(14.5, 7.75, 2.4, 1.25, 1.4, 'moving', drift(0, 0, 1.45, 4.4, .5));
      p(18.5, 8.9, 3.9, 1.6, 1.5, 'goal');
      break;
    case 4: // 동굴 입구 → 낮은 천장 → 수정 지하호수
      p(0, .25, -19.3, 2.35, 1.6);
      p(0, -.12, -15.4, 1.65, 1.45);
      p(0, .28, -11.3, 1.6, 1.38);
      p(.2, .64, -7.45, 1.68, 1.4);
      wall(0, -11.55, 3.65, 5.4, 2.67, 3.18, 'ceiling');
      p(2.9, 1.68, -4, 1.62, 1.48);
      p(3.6, 2.55, .1, 1.7, 1.65, 'checkpoint');
      p(.5, 2.25, 3.3, 1.28, 1.2);
      p(-3.15, 2.65, 5.5, 1.32, 1.22, 'moving', drift(1.12, 0, 0, 4.7));
      p(-5, 3.45, 9.35, 1.34, 1.36);
      p(-2.35, 4.4, 12.7, 1.28, 1.26);
      p(1.3, 5.15, 15, 1.17, 1.25, 'crumble');
      p(4.35, 5.85, 18, 1.2, 1.29);
      p(5.1, 6.95, 22, 1.75, 1.65, 'goal');
      wall(-12, 4.25, 1.5, 23.75, -7, 12);
      wall(12, 4.25, 1.5, 23.75, -7, 12);
      wall(0, 26.5, 12, 1.5, -7, 12);
      wall(0, 3.8, 11.5, 24.6, 11.5, 14, 'ceiling');
      wall(-7.5, -19.5, 4.1, 1.25, -2, 12);
      wall(7.5, -19.5, 4.1, 1.25, -2, 12);
      recovery = { minY: baseY - 2.2, x, z: z + 4.9, hx: 10.8, hz: 21.6 };
      break;
    case 5: { // 바람벽 바깥으로 돌아서 착지한 뒤 소용돌이 타기
      p(10.4, .25, -10.4, 1.7, 1.6);
      p(7.3, 1.35, -8.15, 1.35, 1.32);
      p(4.1, 2.5, -7.2, 1.22, 1.23);
      p(1.8, 3.57, -5.05, 1.04, 1.1);
      p(-1.8, 3.74, -5.05, 1.04, 1.1);
      wall(0, -3.58, .24, 2.55, .05, 8);
      p(-4.9, 4.84, -3.45, 1.28, 1.3);
      p(-7.25, 5.9, -.15, 1.44, 1.45, 'checkpoint');
      p(-7.05, 6.92, 3.7, 1.35, 1.4, 'bounce', { launch: 1.47 });
      p(-4.5, 11.17, 6.55, 1.27, 1.3);
      p(-.45, 12.18, 8.0, 1.3, 1.2, 'moving', { orbit: { radius: .78, period: 5.5, phase: .5 } });
      p(3.8, 13.14, 7.0, 1.25, 1.2);
      p(6.7, 14.33, 4.1, 1.32, 1.3, 'bounce', { launch: 1.45 });
      p(7.55, 18.55, .3, 1.3, 1.26);
      p(6.12, 19.5, -3.64, 1.25, 1.27, 'moving', { orbit: { radius: .85, period: 4.8, phase: .25 } });
      p(3.5, 20.6, -6.8, 1.58, 1.6, 'checkpoint');
      p(-.55, 21.48, -7.48, 1.14, 1.2);
      p(-4.35, 22.6, -5.85, 1.18, 1.24, 'crumble');
      p(-6.4, 23.82, -2.2, 1.38, 1.4);
      p(-4.08, 24.92, .76, 1.13, 1.18);
      p(0, 25.95, 0, 1.77, 1.72, 'goal');
      break;
    }
    case 6: // 연속 붕괴 발판, 높아진 상승폭, 두 번째 바람벽
      p(20.7, .25, 2.3, 1.65, 1.5);
      p(17.2, 1.66, 2.3, 1.24);
      p(13.8, 3.02, .2, 1.12, 1.15, 'crumble');
      p(9.86, 4.27, -.58, 1.09, 1.14, 'crumble');
      p(6, 5.55, -1.9, 1.17, 1.22, 'moving', drift(0, .56, .78, 4.3));
      p(2.05, 6.82, -1.9, 1.52, 1.5, 'checkpoint');
      p(-1.72, 7.96, -.52, 1.12, 1.09);
      p(-4.1, 9.21, 2.2, 1.03, 1.08, 'crumble');
      p(-4.1, 9.38, 5.85, 1.03, 1.08);
      wall(-2.76, 4.03, 2.4, .24, 4.0, 13.5);
      p(-2.35, 10.74, 9.2, 1.12, 1.24, 'moving', drift(.7, 0, 0, 3.7, .35));
      p(1.5, 12, 10.55, 1.17, 1.16, 'crumble');
      p(5.5, 13.32, 9.65, 1.48, 1.5, 'checkpoint');
      p(9.1, 14.57, 7.95, 1.12, 1.1, 'crumble');
      p(12.15, 15.89, 5.4, 1.12, 1.16, 'moving', drift(.48, .55, .54, 3.9, .8));
      p(14, 17.31, 1.77, 1.05, 1.08, 'crumble');
      p(13.1, 18.68, -2.12, 1.15, 1.19);
      p(10.75, 20.07, -5.5, 1.1, 1.15, 'crumble');
      p(7.12, 21.41, -7.12, 1.42, 1.4, 'goal');
      break;
    case 7: // 별조각이 열어 주는 수호자 투기장
      p(4.5, .34, 20.8, 1.8, 1.65);
      p(2.2, 1.56, 17.45, 1.24, 1.32);
      p(0, 2.86, 14, 1.18, 1.24, 'moving', drift(.85, 0, 0, 4.4));
      p(-.2, 4.2, 10.05, 1.56, 1.55, 'checkpoint');
      p(0, 4.8, -.7, 8.15, 7.55, 'goal');
      break;
    default: throw new Error('Unknown route');
  }
  const end = platforms[platforms.length - 1];
  return { id: `route-${site.id}`, x, z, baseY, platforms, barriers, recovery, goal: { x: end.x, y: end.y + 1.02, z: end.z } };
}

export const routeInfo = (site: Site) => ROUTES[site.id - 1];
