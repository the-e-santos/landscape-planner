import {
  CPU_VISIBILITY_BATCH_EXECUTOR,
  VISIBILITY_RAY_STRIDE,
  type PackedVisibilityBatchResult,
  type PackedVisibilityRayBatch,
  type VisibilityBatchExecutor,
} from './batchedVisibility'
import type { GpuSceneGeometry } from './gpuScene'
import {
  WEBGPU_VISIBILITY_SHADER,
  WEBGPU_VISIBILITY_WORKGROUP_SIZE,
} from './webgpuVisibilityShader'

const BUFFER_USAGE = {
  mapRead: 0x0001,
  copySrc: 0x0004,
  copyDst: 0x0008,
  uniform: 0x0040,
  storage: 0x0080,
} as const
const MAP_MODE_READ = 0x0001
const METADATA_LENGTH = 16
const GPU_RAY_STRIDE = 12

export interface WebGpuBufferLike {
  getMappedRange(): ArrayBuffer
  mapAsync(mode: number): Promise<void>
  unmap(): void
  destroy(): void
}

interface WebGpuComputePassLike {
  setPipeline(pipeline: WebGpuComputePipelineLike): void
  setBindGroup(index: number, bindGroup: unknown): void
  dispatchWorkgroups(count: number): void
  end(): void
}

interface WebGpuCommandEncoderLike {
  beginComputePass(): WebGpuComputePassLike
  copyBufferToBuffer(
    source: WebGpuBufferLike,
    sourceOffset: number,
    destination: WebGpuBufferLike,
    destinationOffset: number,
    size: number,
  ): void
  finish(): unknown
}

interface WebGpuComputePipelineLike {
  getBindGroupLayout(index: number): unknown
}

export interface WebGpuDeviceLike {
  readonly queue: { submit(commands: readonly unknown[]): void }
  readonly lost?: Promise<{ readonly message?: string }>
  createBuffer(descriptor: {
    readonly size: number
    readonly usage: number
    readonly mappedAtCreation?: boolean
  }): WebGpuBufferLike
  createShaderModule(descriptor: { readonly code: string }): unknown
  createComputePipelineAsync(descriptor: {
    readonly layout: 'auto'
    readonly compute: { readonly module: unknown; readonly entryPoint: 'main' }
  }): Promise<WebGpuComputePipelineLike>
  createBindGroup(descriptor: {
    readonly layout: unknown
    readonly entries: readonly {
      readonly binding: number
      readonly resource: { readonly buffer: WebGpuBufferLike }
    }[]
  }): unknown
  createCommandEncoder(): WebGpuCommandEncoderLike
  pushErrorScope?(filter: 'validation'): void
  popErrorScope?(): Promise<{ readonly message: string } | null>
}

export interface PackedWebGpuScene {
  readonly storage: Uint32Array
  readonly metadata: Uint32Array
}

function uintBits(values: Float32Array): Uint32Array {
  return new Uint32Array(values.buffer, values.byteOffset, values.length)
}

export function packWebGpuScene(scene: GpuSceneGeometry): PackedWebGpuScene {
  const parts: readonly Uint32Array[] = [
    scene.primitiveKinds,
    uintBits(scene.primitiveTransforms),
    uintBits(scene.primitiveParameters),
    uintBits(scene.primitiveTransmittances),
    scene.polygonRanges,
    uintBits(scene.polygonVertices),
    uintBits(scene.bvhBounds),
    scene.bvhNodes,
    scene.bvhPrimitiveIndices,
  ]
  const offsets: number[] = []
  let length = 0
  parts.forEach((part) => {
    offsets.push(length)
    length += part.length
  })
  const storage = new Uint32Array(Math.max(1, length))
  parts.forEach((part, index) => storage.set(part, offsets[index]))
  const metadata = new Uint32Array(METADATA_LENGTH)
  metadata.set([
    scene.entityIds.length,
    ...offsets,
    scene.bvhNodes.length / 4,
    0,
  ])
  return { storage, metadata }
}

export function packWebGpuRays(batch: PackedVisibilityRayBatch): Uint32Array {
  const rayCount = batch.excludedPrimitiveIndices.length
  const storage = new Uint32Array(Math.max(1, rayCount * GPU_RAY_STRIDE))
  const origins = uintBits(batch.origins)
  const directions = uintBits(batch.directions)
  for (let index = 0; index < rayCount; index += 1) {
    const source = index * VISIBILITY_RAY_STRIDE
    const target = index * GPU_RAY_STRIDE
    storage.set(origins.subarray(source, source + 4), target)
    storage.set(directions.subarray(source, source + 4), target + 4)
    storage[target + 8] = batch.excludedPrimitiveIndices[index]
  }
  return storage
}

function createUploadBuffer(
  device: WebGpuDeviceLike,
  data: Uint32Array,
  usage: number,
): WebGpuBufferLike {
  const buffer = device.createBuffer({
    size: Math.max(4, data.byteLength),
    usage,
    mappedAtCreation: true,
  })
  new Uint8Array(buffer.getMappedRange()).set(
    new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
  )
  buffer.unmap()
  return buffer
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'WebGPU visibility failed.'
}

export function createWebGpuVisibilityBatchExecutor(
  device: WebGpuDeviceLike,
): VisibilityBatchExecutor {
  let pipeline: Promise<WebGpuComputePipelineLike> | undefined
  const getPipeline = () => {
    pipeline ??= device.createComputePipelineAsync({
      layout: 'auto',
      compute: {
        module: device.createShaderModule({ code: WEBGPU_VISIBILITY_SHADER }),
        entryPoint: 'main',
      },
    })
    return pipeline
  }

  return {
    backend: 'webgpu',
    execute: async (scene, batch) => {
      const rayCount = batch.excludedPrimitiveIndices.length
      if (
        batch.origins.length !== rayCount * VISIBILITY_RAY_STRIDE ||
        batch.directions.length !== rayCount * VISIBILITY_RAY_STRIDE
      ) {
        throw new Error('Packed visibility batch buffers have inconsistent lengths')
      }
      if (rayCount === 0) {
        return {
          backend: 'webgpu',
          transmissions: new Float32Array(),
          blockedByPrimitiveIndices: new Uint32Array(),
        }
      }

      const packedScene = packWebGpuScene(scene)
      packedScene.metadata[11] = rayCount
      const packedRays = packWebGpuRays(batch)
      const resultSize = rayCount * 8
      const buffers: WebGpuBufferLike[] = []
      const usesErrorScope = device.pushErrorScope !== undefined &&
        device.popErrorScope !== undefined
      if (usesErrorScope) device.pushErrorScope!('validation')
      let errorScopeOpen = usesErrorScope
      try {
        const sceneBuffer = createUploadBuffer(
          device,
          packedScene.storage,
          BUFFER_USAGE.storage,
        )
        const rayBuffer = createUploadBuffer(
          device,
          packedRays,
          BUFFER_USAGE.storage,
        )
        const metadataBuffer = createUploadBuffer(
          device,
          packedScene.metadata,
          BUFFER_USAGE.uniform,
        )
        const resultBuffer = device.createBuffer({
          size: resultSize,
          usage: BUFFER_USAGE.storage | BUFFER_USAGE.copySrc,
        })
        const readbackBuffer = device.createBuffer({
          size: resultSize,
          usage: BUFFER_USAGE.mapRead | BUFFER_USAGE.copyDst,
        })
        buffers.push(
          sceneBuffer,
          rayBuffer,
          metadataBuffer,
          resultBuffer,
          readbackBuffer,
        )

        const activePipeline = await getPipeline()
        const bindGroup = device.createBindGroup({
          layout: activePipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: sceneBuffer } },
            { binding: 1, resource: { buffer: rayBuffer } },
            { binding: 2, resource: { buffer: resultBuffer } },
            { binding: 3, resource: { buffer: metadataBuffer } },
          ],
        })
        const encoder = device.createCommandEncoder()
        const pass = encoder.beginComputePass()
        pass.setPipeline(activePipeline)
        pass.setBindGroup(0, bindGroup)
        pass.dispatchWorkgroups(Math.ceil(
          rayCount / WEBGPU_VISIBILITY_WORKGROUP_SIZE,
        ))
        pass.end()
        encoder.copyBufferToBuffer(
          resultBuffer,
          0,
          readbackBuffer,
          0,
          resultSize,
        )
        device.queue.submit([encoder.finish()])

        const read = async () => {
          await readbackBuffer.mapAsync(MAP_MODE_READ)
          return new Uint32Array(readbackBuffer.getMappedRange().slice(0))
        }
        const raw = device.lost
          ? await Promise.race([
              read(),
              device.lost.then((info) => {
                throw new Error(
                  `WebGPU device was lost${
                    info.message ? `: ${info.message}` : '.'
                  }`,
                )
              }),
            ])
          : await read()
        readbackBuffer.unmap()
        const validationError = await device.popErrorScope?.()
        errorScopeOpen = false
        if (validationError) throw new Error(validationError.message)

        const transmissions = new Float32Array(rayCount)
        const blockedByPrimitiveIndices = new Uint32Array(rayCount)
        for (let index = 0; index < rayCount; index += 1) {
          const bits = new Uint32Array([raw[index * 2]])
          transmissions[index] = new Float32Array(bits.buffer)[0]
          blockedByPrimitiveIndices[index] = raw[index * 2 + 1]
        }
        return { backend: 'webgpu', transmissions, blockedByPrimitiveIndices }
      } catch (error) {
        if (errorScopeOpen && device.popErrorScope) {
          try { await device.popErrorScope() } catch { /* device already lost */ }
        }
        throw error
      } finally {
        buffers.forEach((buffer) => buffer.destroy())
      }
    },
  }
}

export function withCpuVisibilityFallback(
  primary: VisibilityBatchExecutor,
  onFallback?: (reason: string) => void,
): VisibilityBatchExecutor {
  return {
    backend: primary.backend,
    execute: async (scene, batch): Promise<PackedVisibilityBatchResult> => {
      try {
        return await primary.execute(scene, batch)
      } catch (error) {
        const fallbackReason = messageOf(error)
        onFallback?.(fallbackReason)
        const result = await CPU_VISIBILITY_BATCH_EXECUTOR.execute(scene, batch)
        return { ...result, fallbackReason }
      }
    },
  }
}
