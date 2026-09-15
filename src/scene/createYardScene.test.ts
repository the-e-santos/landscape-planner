import * as THREE from 'three/webgpu'
import { describe, expect, it } from 'vitest'
import { getPrimitiveEntityIdFromObject } from './createYardScene'

describe('yard scene selection', () => {
  it('resolves a picked descendant to its domain entity ID', () => {
    const root = new THREE.Group()
    root.userData.entityId = 'primitive.test'
    const nested = new THREE.Group()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
    nested.add(mesh)
    root.add(nested)

    expect(getPrimitiveEntityIdFromObject(mesh)).toBe('primitive.test')

    mesh.geometry.dispose()
  })

  it('returns null for scene objects without a domain entity', () => {
    expect(getPrimitiveEntityIdFromObject(new THREE.Object3D())).toBeNull()
  })
})
