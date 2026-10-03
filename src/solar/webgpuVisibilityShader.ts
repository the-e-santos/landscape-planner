export const WEBGPU_VISIBILITY_WORKGROUP_SIZE = 64

/** WGSL counterpart of the packed CPU traversal in batchedVisibility.ts. */
export const WEBGPU_VISIBILITY_SHADER = /* wgsl */ `
struct RawBuffer { data: array<u32> }
struct Metadata {
  primitive_count: u32,
  kind_offset: u32,
  transform_offset: u32,
  parameter_offset: u32,
  transmittance_offset: u32,
  polygon_range_offset: u32,
  polygon_vertex_offset: u32,
  bvh_bounds_offset: u32,
  bvh_node_offset: u32,
  bvh_index_offset: u32,
  node_count: u32,
  ray_count: u32,
  padding_0: u32,
  padding_1: u32,
  padding_2: u32,
  padding_3: u32,
}

@group(0) @binding(0) var<storage, read> scene: RawBuffer;
@group(0) @binding(1) var<storage, read> rays: RawBuffer;
@group(0) @binding(2) var<storage, read_write> results: RawBuffer;
@group(0) @binding(3) var<uniform> metadata: Metadata;

const NO_INDEX: u32 = 0xffffffffu;
const EPSILON: f32 = 0.000001;
const NUMBER_EPSILON: f32 = 2.220446049e-16;

fn sf(index: u32) -> f32 { return bitcast<f32>(scene.data[index]); }
fn rf(index: u32) -> f32 { return bitcast<f32>(rays.data[index]); }

fn intersects_bounds(origin: vec3f, direction: vec3f, node: u32) -> bool {
  let base = metadata.bvh_bounds_offset + node * 6u;
  var near = -3.402823466e+38;
  var far = 3.402823466e+38;
  for (var axis = 0u; axis < 3u; axis++) {
    let o = origin[axis];
    let d = direction[axis];
    let minimum = sf(base + axis);
    let maximum = sf(base + axis + 3u);
    if (abs(d) < NUMBER_EPSILON) {
      if (o < minimum || o > maximum) { return false; }
    } else {
      let first = (minimum - o) / d;
      let second = (maximum - o) / d;
      near = max(near, min(first, second));
      far = min(far, max(first, second));
      if (near > far) { return false; }
    }
  }
  return far > EPSILON;
}

fn local_ray(primitive: u32, origin: vec3f, direction: vec3f) -> mat2x3<f32> {
  let base = metadata.transform_offset + primitive * 12u;
  let offset = origin - vec3f(sf(base), sf(base + 1u), sf(base + 2u));
  let row0 = vec3f(sf(base + 3u), sf(base + 4u), sf(base + 5u));
  let row1 = vec3f(sf(base + 6u), sf(base + 7u), sf(base + 8u));
  let row2 = vec3f(sf(base + 9u), sf(base + 10u), sf(base + 11u));
  return mat2x3<f32>(
    vec3f(dot(row0, offset), dot(row1, offset), dot(row2, offset)),
    vec3f(dot(row0, direction), dot(row1, direction), dot(row2, direction)),
  );
}

fn intersect_box(origin: vec3f, direction: vec3f, extents: vec3f) -> f32 {
  var near = -3.402823466e+38;
  var far = 3.402823466e+38;
  for (var axis = 0u; axis < 3u; axis++) {
    if (abs(direction[axis]) < NUMBER_EPSILON) {
      if (origin[axis] < -extents[axis] || origin[axis] > extents[axis]) {
        return -1.0;
      }
    } else {
      let first = (-extents[axis] - origin[axis]) / direction[axis];
      let second = (extents[axis] - origin[axis]) / direction[axis];
      near = max(near, min(first, second));
      far = min(far, max(first, second));
      if (near > far) { return -1.0; }
    }
  }
  let distance = select(far, near, near > EPSILON);
  return select(-1.0, distance, distance > EPSILON);
}

fn intersect_cylinder(origin: vec3f, direction: vec3f, radius: f32, half_height: f32) -> f32 {
  var nearest = 3.402823466e+38;
  let radius_squared = radius * radius;
  let a = (direction.x * direction.x + direction.z * direction.z) / radius_squared;
  let b = 2.0 * (origin.x * direction.x + origin.z * direction.z) / radius_squared;
  let c = (origin.x * origin.x + origin.z * origin.z) / radius_squared - 1.0;
  let discriminant = b * b - 4.0 * a * c;
  if (a > NUMBER_EPSILON && discriminant >= 0.0) {
    let root = sqrt(discriminant);
    for (var side = 0u; side < 2u; side++) {
      let signed_root = select(-root, root, side == 1u);
      let distance = (-b + signed_root) / (2.0 * a);
      let y = origin.y + distance * direction.y;
      if (distance > EPSILON && abs(y) <= half_height) {
        nearest = min(nearest, distance);
      }
    }
  }
  if (abs(direction.y) > NUMBER_EPSILON) {
    for (var side = 0u; side < 2u; side++) {
      let y = select(-half_height, half_height, side == 1u);
      let distance = (y - origin.y) / direction.y;
      let x = origin.x + distance * direction.x;
      let z = origin.z + distance * direction.z;
      if (distance > EPSILON && (x * x + z * z) / radius_squared <= 1.0) {
        nearest = min(nearest, distance);
      }
    }
  }
  return select(nearest, -1.0, nearest == 3.402823466e+38);
}

fn intersect_ellipsoid(origin: vec3f, direction: vec3f, radii: vec3f) -> f32 {
  let rr = radii * radii;
  let a = dot(direction * direction, 1.0 / rr);
  let b = 2.0 * dot(origin * direction, 1.0 / rr);
  let c = dot(origin * origin, 1.0 / rr) - 1.0;
  let discriminant = b * b - 4.0 * a * c;
  if (discriminant < 0.0) { return -1.0; }
  let root = sqrt(discriminant);
  let first = (-b - root) / (2.0 * a);
  let second = (-b + root) / (2.0 * a);
  if (first > EPSILON) { return first; }
  return select(-1.0, second, second > EPSILON);
}

fn point_in_polygon(x: f32, z: f32, first: u32, count: u32) -> bool {
  var inside = false;
  var previous = count - 1u;
  for (var index = 0u; index < count; index++) {
    let a = metadata.polygon_vertex_offset + (first + index) * 2u;
    let b = metadata.polygon_vertex_offset + (first + previous) * 2u;
    let ax = sf(a);
    let az = sf(a + 1u);
    let bx = sf(b);
    let bz = sf(b + 1u);
    if ((az > z) != (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) {
      inside = !inside;
    }
    previous = index;
  }
  return inside;
}

fn intersect_polygon(primitive: u32, origin: vec3f, direction: vec3f, half_height: f32) -> f32 {
  let range = metadata.polygon_range_offset + primitive * 2u;
  let first = scene.data[range];
  let count = scene.data[range + 1u];
  var nearest = 3.402823466e+38;
  if (abs(direction.y) > NUMBER_EPSILON) {
    for (var side = 0u; side < 2u; side++) {
      let y = select(-half_height, half_height, side == 1u);
      let distance = (y - origin.y) / direction.y;
      if (distance > EPSILON && point_in_polygon(
        origin.x + distance * direction.x,
        origin.z + distance * direction.z,
        first,
        count,
      )) { nearest = min(nearest, distance); }
    }
  }
  for (var index = 0u; index < count; index++) {
    let start = metadata.polygon_vertex_offset + (first + index) * 2u;
    let end = metadata.polygon_vertex_offset + (first + (index + 1u) % count) * 2u;
    let start_x = sf(start);
    let start_z = sf(start + 1u);
    let edge_x = sf(end) - start_x;
    let edge_z = sf(end + 1u) - start_z;
    let determinant = direction.x * edge_z - direction.z * edge_x;
    if (abs(determinant) >= NUMBER_EPSILON) {
      let offset_x = start_x - origin.x;
      let offset_z = start_z - origin.z;
      let distance = (offset_x * edge_z - offset_z * edge_x) / determinant;
      let edge_parameter = (offset_x * direction.z - offset_z * direction.x) / determinant;
      let y = origin.y + distance * direction.y;
      if (distance > EPSILON && edge_parameter >= 0.0 && edge_parameter <= 1.0 && abs(y) <= half_height) {
        nearest = min(nearest, distance);
      }
    }
  }
  return select(nearest, -1.0, nearest == 3.402823466e+38);
}

fn intersect_primitive(primitive: u32, origin: vec3f, direction: vec3f) -> f32 {
  let ray = local_ray(primitive, origin, direction);
  let local_origin = ray[0];
  let local_direction = ray[1];
  let parameter = metadata.parameter_offset + primitive * 4u;
  let kind = scene.data[metadata.kind_offset + primitive];
  switch kind {
    case 0u, 2u: {
      return intersect_box(local_origin, local_direction, vec3f(
        sf(parameter), sf(parameter + 1u), sf(parameter + 2u)
      ));
    }
    case 1u: {
      return intersect_cylinder(local_origin, local_direction, sf(parameter), sf(parameter + 1u));
    }
    case 3u: {
      return intersect_polygon(primitive, local_origin, local_direction, sf(parameter));
    }
    case 4u: {
      return intersect_ellipsoid(local_origin, local_direction, vec3f(
        sf(parameter), sf(parameter + 1u), sf(parameter + 2u)
      ));
    }
    default: { return -1.0; }
  }
}

@compute @workgroup_size(${WEBGPU_VISIBILITY_WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) id: vec3u) {
  let ray_index = id.x;
  if (ray_index >= metadata.ray_count) { return; }
  let ray_base = ray_index * 12u;
  let origin = vec3f(rf(ray_base), rf(ray_base + 1u), rf(ray_base + 2u));
  let direction = vec3f(rf(ray_base + 4u), rf(ray_base + 5u), rf(ray_base + 6u));
  let excluded = rays.data[ray_base + 8u];
  var transmission = 1.0;
  var blocker = NO_INDEX;
  var blocker_distance = 3.402823466e+38;
  var stack: array<u32, 64>;
  var stack_size = 0u;
  if (metadata.node_count > 0u) {
    stack[0] = 0u;
    stack_size = 1u;
  }
  loop {
    if (stack_size == 0u) { break; }
    stack_size--;
    let node = stack[stack_size];
    if (!intersects_bounds(origin, direction, node)) { continue; }
    let node_base = metadata.bvh_node_offset + node * 4u;
    let count = scene.data[node_base + 3u];
    if (count > 0u) {
      let first = scene.data[node_base + 2u];
      for (var leaf_index = 0u; leaf_index < count; leaf_index++) {
        let primitive = scene.data[metadata.bvh_index_offset + first + leaf_index];
        if (primitive == excluded) { continue; }
        let distance = intersect_primitive(primitive, origin, direction);
        if (distance > 0.0) {
          let transmittance = sf(metadata.transmittance_offset + primitive);
          transmission *= transmittance;
          if (transmittance == 0.0 && (
            distance < blocker_distance ||
            (distance == blocker_distance && primitive < blocker)
          )) {
            blocker_distance = distance;
            blocker = primitive;
          }
        }
      }
    } else {
      let left = scene.data[node_base];
      let right = scene.data[node_base + 1u];
      if (right != NO_INDEX && stack_size < 64u) {
        stack[stack_size] = right;
        stack_size++;
      }
      if (left != NO_INDEX && stack_size < 64u) {
        stack[stack_size] = left;
        stack_size++;
      }
    }
  }
  results.data[ray_index * 2u] = bitcast<u32>(transmission);
  results.data[ray_index * 2u + 1u] = blocker;
}
`
