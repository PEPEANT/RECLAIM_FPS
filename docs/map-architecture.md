# Map Architecture

목표:

- 맵 생성 로직을 `VoxelWorld`에서 분리해 파일 구조화한다.
- 지형/건물/오브젝트 생성을 맵 단위 모듈로 나눠 유지보수성을 높인다.

현재 구조:

- `src/game/build/VoxelWorld.js`
  - 블록 저장/렌더/레이캐스트/충돌 같은 엔진 책임만 담당
  - 맵 생성은 `buildSelectedMap(...)` 호출로 위임
- `src/game/world/MapBuilder.js`
  - 맵 스크립트에서 쓰는 공통 빌더 API
  - `fillRect`, `carveRect`, `setBlock`, `removeBlock` 제공
- `src/game/world/MapRegistry.js`
  - 맵 ID -> 생성기 매핑
  - 기본 맵 선택 담당
- `src/game/world/maps/forestFrontlineMap.js`
  - 숲 분위기 CTF 맵 생성기
  - 지형/산벽/기지 요새/거점/숲 배치 구현

확장 방법:

1. `src/game/world/maps/<newMap>.js` 파일을 만든다.
2. `MapRegistry.js`에 맵 ID를 등록한다.
3. 필요 시 `Game` 또는 설정값에서 `mapId`를 선택해 `generateTerrain({ mapId })` 호출한다.

