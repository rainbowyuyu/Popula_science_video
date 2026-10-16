// src/V7GripHand.ts
import * as T from "three";
var clamp = (x) => Math.max(0, Math.min(1, x));
var smooth = (x) => {
  const q = clamp(x);
  return q * q * (3 - 2 * q);
};
var V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
function poseAtlasFingers(point, side, grip) {
  const wrist = V(side * 0.25, 0.911, 8e-3), forward = V(side * 0.023, -0.104, 0.042).normalize();
  const dorsal = V(0, 0, -1).addScaledVector(forward, forward.z).normalize();
  const lateral = V().crossVectors(forward, dorsal).normalize();
  const delta = point.clone().sub(wrist), local = V(delta.dot(lateral) * side, delta.dot(forward), delta.dot(dorsal));
  if (local.y < 0.025 || local.y > 0.23 || Math.abs(local.x) > 0.082) return point.clone();
  const q = clamp(grip), out = local.clone();
  const thumb = local.clone();
  {
    const oppose = smooth((local.x - 0.024) / 0.018) * smooth((local.y - 0.025) / 0.045);
    thumb.sub(V(0.03, 0.045, 1e-3)).applyAxisAngle(V(0, 1, 0), -0.48 * q * oppose).add(V(0.03, 0.045, 1e-3));
    thumb.sub(V(0.035, 0.055, 0)).applyAxisAngle(V(0, 0, 1), 0.6 * q * oppose).add(V(0.035, 0.055, 0));
    thumb.sub(V(0.043, 0.1, -9e-3)).applyAxisAngle(V(1, 0, 0), -0.88 * q * smooth((local.y - 0.092) / 0.018)).add(V(0.043, 0.1, -9e-3));
  }
  {
    const fingers = [
      { x: -0.043, y: 0.101, dx: -0.3, pip: 0.13, dip: 0.151, a: [1.05, 1.3, 0.6] },
      { x: -0.027, y: 0.114, dx: -0.12, pip: 0.147, dip: 0.172, a: [0.95, 1.28, 0.55] },
      { x: -6e-3, y: 0.121, dx: -0.07, pip: 0.158, dip: 0.188, a: [0.76, 1.08, 0.48] },
      { x: 0.019, y: 0.115, dx: 0.06, pip: 0.153, dip: 0.181, a: [0.78, 0.25, 0.1] }
    ];
    const sum = V();
    let total = 0;
    const sigma = 5e-3 + 5e-3 * (1 - smooth((local.y - 0.12) / 0.045));
    for (const finger of fingers) {
      const distance = local.x - (finger.x + finger.dx * Math.max(0, local.y - finger.y));
      const weight = Math.exp(-distance * distance / (2 * sigma * sigma));
      if (weight < 1e-8) continue;
      const posed = local.clone(), axis = V(1, -finger.dx, 0).normalize();
      for (const joint of [{ y: finger.dip, a: finger.a[2] }, { y: finger.pip, a: finger.a[1] }, { y: finger.y, a: finger.a[0] }]) {
        const pivot = V(finger.x + finger.dx * (joint.y - finger.y), joint.y, -3e-3);
        posed.sub(pivot).applyAxisAngle(axis, -joint.a * q * smooth((local.y - joint.y + 5e-3) / 0.013)).add(pivot);
      }
      sum.addScaledVector(posed, weight);
      total += weight;
    }
    if (total > 1e-8) out.copy(sum.multiplyScalar(1 / total));
  }
  const thumbWeight = smooth((local.x - 0.027) / 0.023) * (1 - smooth((local.y - 0.145) / 0.02));
  out.lerp(thumb, thumbWeight);
  return wrist.clone().addScaledVector(lateral, out.x * side).addScaledVector(forward, out.y).addScaledVector(dorsal, out.z);
}
function relaxedForearmRoll(side) {
  return new T.Quaternion().setFromAxisAngle(V(side * 0.025, -0.197, 0.044).normalize(), side * Math.PI * 0.46);
}
export {
  poseAtlasFingers,
  relaxedForearmRoll
};
