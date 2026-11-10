import * as THREE from 'three';

const GEO = {
  shardGem: new THREE.OctahedronGeometry(0.22, 0),
  shardHalo: new THREE.SphereGeometry(0.4, 10, 8),
};

/** 탑 꼭대기의 별조각 */
export function createShard(): { group: THREE.Group; update(t: number): void } {
  const group = new THREE.Group();
  const core = new THREE.Group();
  group.add(core);

  const goldMat = new THREE.MeshLambertMaterial({
    color: '#ffe27a', emissive: '#ffb938', emissiveIntensity: 0.6, flatShading: true,
  });
  const vertical = new THREE.Mesh(GEO.shardGem, goldMat);
  vertical.scale.set(1, 1.8, 0.45);
  const horizontal = new THREE.Mesh(GEO.shardGem, goldMat);
  horizontal.scale.set(1, 1.8, 0.45);
  horizontal.rotation.z = Math.PI / 2;
  core.add(vertical, horizontal);

  const haloMat = new THREE.MeshBasicMaterial({
    color: '#fff3b0', transparent: true, opacity: 0.28,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const halo = new THREE.Mesh(GEO.shardHalo, haloMat);
  group.add(halo);

  return {
    group,
    update(t: number) {
      core.rotation.y = t * 2;
      core.position.y = Math.sin(t * 2.2) * 0.12;
      halo.scale.setScalar(1 + Math.sin(t * 3) * 0.08);
    },
  };
}
