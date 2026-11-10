# 스카이 큐브

황혼의 부유섬에서 파란 큐브가 별의 탑(파쿠르)을 오르고, 어둠의 균열에서 몬스터와 보스를 물리쳐 일곱 개의 별조각을 모으는 웹 게임. Three.js + TypeScript + Vite. 물리엔진과 큐브는 Travel 저장소에서 가져와 확장했다.

```bash
npm install
npm run dev
npm test
npm run build   # dist/index.html 한 파일
```

- `src/physics`: 고정 60Hz 물리. 가변 점프, 코요테 타임, 점프 버퍼에 이단 점프, 대시, 내려찍기, 넉백, 떠 있는/움직이는 상자 발판을 더했다.
- `src/world`: 부유섬, 다리, 하늘과 구름 바다.
- `src/game`: 파쿠르 코스 생성, 몬스터 AI와 보스, 균열, 회전 공격, 무기 제작, 저장.
