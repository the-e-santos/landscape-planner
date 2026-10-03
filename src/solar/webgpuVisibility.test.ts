import { describe, expect, it, vi } from 'vitest'
import type { PrimitiveEntity } from '../domain/primitive'
import {
  packVisibilityRayBatch,
  type VisibilityBatchExecutor,
} from './batchedVisibility'
import { packGpuSceneGeometry } from './gpuScene'
import {
  packWebGpuRays,
  packWebGpuScene,
  withCpuVisibilityFallback,
} from './webgpuVisibility'
import {
  WEBGPU_VISIBILITY_SHADER,
  WEBGPU_VISIBILITY_WORKGROUP_SIZE,
} from './webgpuVisibilityShader'

const entity: PrimitiveEntity = {
  id: 'screen',
  kind: 'primitive',
  name: 'Screen',
  transform: {
    position: { eastMeters: 0, elevationMeters: 1, northMeters: 0 },
    rotation: { xRadians: 0, yRadians: 0, zRadians: 0 },
  },
  geometry: {
    kind: 'box', widthMeters: 2, heightMeters: 0.1, depthMeters: 2,
  },
  solarOptics: { mode: 'transmissive', transmittance: 0.5 },
}

describe('WebGPU visibility executor boundary', () => {
  it('combines scene arrays into one storage buffer with shader metadata', () => {
    const scene = packGpuSceneGeometry([entity])
    const packed = packWebGpuScene(scene)

    expect(packed.metadata).toHaveLength(16)
    expect(packed.metadata[0]).toBe(1)
    expect(packed.metadata[10]).toBe(scene.bvhNodes.length / 4)
    expect(packed.metadata[11]).toBe(0)
    expect(packed.storage[packed.metadata[1]])
      .toBe(scene.primitiveKinds[0])
    expect(new Float32Array(new Uint32Array([
      packed.storage[packed.metadata[4]],
    ]).buffer)[0]).toBeCloseTo(0.5, 7)
  })

  it('packs each ray into aligned origin, direction, and exclusion fields', () => {
    const scene = packGpuSceneGeometry([entity])
    const batch = packVisibilityRayBatch(scene, [{
      ray: {
        origin: { x: 1, y: 2, z: 3 },
        direction: { x: 0.25, y: 0.5, z: 0.75 },
      },
      excludedEntityId: 'screen',
    }])
    const packed = packWebGpuRays(batch)
    const floats = new Float32Array(packed.buffer)

    expect(packed).toHaveLength(12)
    expect([...floats.slice(0, 3)]).toEqual([1, 2, 3])
    expect([...floats.slice(4, 7)]).toEqual([0.25, 0.5, 0.75])
    expect(packed[8]).toBe(0)
  })

  it('falls back to the packed CPU executor after any WebGPU failure', async () => {
    const scene = packGpuSceneGeometry([entity])
    const batch = packVisibilityRayBatch(scene, [{
      ray: {
        origin: { x: 0, y: 0, z: 0 },
        direction: { x: 0, y: 1, z: 0 },
      },
    }])
    const primary: VisibilityBatchExecutor = {
      backend: 'webgpu',
      execute: async () => { throw new Error('device lost during dispatch') },
    }
    const onFallback = vi.fn()
    const result = await withCpuVisibilityFallback(primary, onFallback)
      .execute(scene, batch)

    expect(result.backend).toBe('cpu')
    expect(result.fallbackReason).toContain('device lost')
    expect([...result.transmissions]).toEqual([0.5])
    expect(onFallback).toHaveBeenCalledWith(
      expect.stringContaining('device lost'),
    )

  })

  it('latches onto CPU after the first runtime failure', async () => {
    const scene = packGpuSceneGeometry([entity])
    const batch = packVisibilityRayBatch(scene, [{
      ray: {
        origin: { x: 0, y: 0, z: 0 },
        direction: { x: 0, y: 1, z: 0 },
      },
    }])
    const execute = vi.fn(async () => {
      throw new Error('device lost')
    })
    const executor = withCpuVisibilityFallback({
      backend: 'webgpu',
      execute,
    })

    await executor.execute(scene, batch)
    const second = await executor.execute(scene, batch)
    expect(second.backend).toBe('cpu')
    expect(second.fallbackReason).toBe('device lost')
    expect(execute).toHaveBeenCalledOnce()
  })

  it('returns successful primary results without invoking fallback', async () => {
    const expected = {
      backend: 'webgpu' as const,
      transmissions: Float32Array.of(1),
      blockedByPrimitiveIndices: Uint32Array.of(0xffffffff),
    }
    const primary: VisibilityBatchExecutor = {
      backend: 'webgpu',
      execute: async () => expected,
    }
    const onFallback = vi.fn()
    const scene = packGpuSceneGeometry([])
    const batch = packVisibilityRayBatch(scene, [{
      ray: {
        origin: { x: 0, y: 0, z: 0 },
        direction: { x: 0, y: 1, z: 0 },
      },
    }])

    expect(await withCpuVisibilityFallback(primary, onFallback)
      .execute(scene, batch)).toBe(expected)
    expect(onFallback).not.toHaveBeenCalled()
  })

  it('defines a bounded compute entry point for one invocation per ray', () => {
    expect(WEBGPU_VISIBILITY_WORKGROUP_SIZE).toBe(64)
    expect(WEBGPU_VISIBILITY_SHADER).toContain('@compute @workgroup_size(64)')
    expect(WEBGPU_VISIBILITY_SHADER).toContain('fn main(')
    expect(WEBGPU_VISIBILITY_SHADER).toContain('var stack: array<u32, 64>')
  })
})
