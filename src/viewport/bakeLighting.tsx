import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { MAP_BG } from "../contract/constants";

// Shared lighting rig — the companion to isoCamera.ts. That file exists so every viewport
// frames the model at the game's bake angle; this one exists so every viewport *lights* it
// the same way, for the same reason: the editor's job is to predict what the game's bake
// produces, and a preview lit differently from the bake is a preview that lies.
//
// Whatever lands here must be mirrored in the game's bake SubViewport (a WorldEnvironment
// with a matching sky gradient and a matching key light) or the two drift apart.

/**
 * The environment gradient, in the game's own palette.
 *
 * Values are linear and deliberately unbounded above 1: the sky is genuinely brighter than
 * the ground it lights, and flattening that ratio to LDR is what makes procedural
 * environments read as flat grey cards. The zenith is a touch cooler and the nadir is the
 * ochre field bouncing back up, which gives metal a cool-above / warm-below split to
 * describe its curvature with — the single biggest thing that makes a metallic surface look
 * metallic rather than dark grey.
 */
const ZENITH = new THREE.Color("#D6D2C6").multiplyScalar(1.55);
const HORIZON = new THREE.Color("#D2B183").multiplyScalar(1.0);
const NADIR = new THREE.Color(MAP_BG).multiplyScalar(0.34);

/**
 * Key light placement, derived from the game's bake rig rather than chosen here.
 *
 * `ui/model_baker.gd` builds its `DirectionalLight3D` with `rotation = (-50°, -35°, 0)` in
 * Godot's default YXZ Euler order, which puts the light at the vector below — coming from
 * the **-X** side. The editor previously used `[4, 6, 2]`, which comes from **+X**: the two
 * were mirrored, so every highlight and cast shadow fell on the opposite side of the model
 * in the preview from where it lands in the sprite the game actually bakes.
 *
 * The game owns this angle (its comment ties the light to the map's hand-drawn SUN_SCREEN
 * convention), so the editor matches the game, not the reverse.
 */
const KEY_ELEVATION_DEG = 50;
const KEY_AZIMUTH_DEG = -35;
const KEY_DISTANCE = 10;

function keyPosition(): [number, number, number] {
  const e = THREE.MathUtils.degToRad(KEY_ELEVATION_DEG);
  const a = THREE.MathUtils.degToRad(KEY_AZIMUTH_DEG);
  // Godot's light shines along its own -Z; this is the reverse of that, i.e. where it sits.
  return [
    Math.sin(a) * Math.cos(e) * KEY_DISTANCE,
    Math.sin(e) * KEY_DISTANCE,
    Math.cos(a) * Math.cos(e) * KEY_DISTANCE,
  ];
}

export const KEY_POSITION: [number, number, number] = keyPosition();

/**
 * A sky/ground gradient as an equirectangular texture. Built in memory rather than loaded:
 * no asset to ship, no CDN fetch (which rules out drei's `<Environment preset>`, whose
 * presets are downloaded), and it stays locked to the game's palette because it is derived
 * from `MAP_BG`.
 *
 * Only the vertical axis varies, so every row is one flat colour — but the texture still has
 * to be a real 2:1 equirect. PMREMGenerator sizes its cubemap from the source *width*
 * (`width / 4`), so a 1px-wide source collapses the target to a degenerate size and three
 * emits `CUBEUV_TEXEL_HEIGHT` as an integer literal, which fails to compile in the fragment
 * shader ("cannot convert from 'const int' to 'highp float'") and blacks out every
 * MeshStandardMaterial in the scene.
 *
 * HalfFloat rather than Float: RGBA16F is filterable in core WebGL2, RGBA32F needs
 * OES_texture_float_linear, and PMREM filters the source.
 */
function gradientEquirect(width = 256): THREE.DataTexture {
  const height = width / 2;
  const data = new Uint16Array(width * height * 4);
  const c = new THREE.Color();
  const one = THREE.DataUtils.toHalfFloat(1);
  for (let y = 0; y < height; y++) {
    // v: 0 at the zenith, 1 at the nadir.
    const v = y / (height - 1);
    if (v < 0.5) c.copy(ZENITH).lerp(HORIZON, v / 0.5);
    else c.copy(HORIZON).lerp(NADIR, (v - 0.5) / 0.5);
    const r = THREE.DataUtils.toHalfFloat(c.r);
    const g = THREE.DataUtils.toHalfFloat(c.g);
    const b = THREE.DataUtils.toHalfFloat(c.b);
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = one;
    }
  }
  const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Install the bake lighting on the enclosing canvas: an image-based environment plus a
 * directional key.
 *
 * The environment is the point. `MeshStandardMaterial` moves energy from diffuse into a
 * specular reflection of the environment as metalness rises, so a metallic surface with no
 * environment to reflect simply loses that energy and renders dark — which is why the
 * contracts' 0.2–0.45 metalness values (and the `metal`/`brass`/`glass` surface finishes)
 * were costing brightness and returning nothing. With an environment they describe a
 * surface again.
 *
 * There is no flat `ambientLight` here on purpose. A constant added to every fragment
 * regardless of orientation is exactly what erases the facet-to-facet contrast that a
 * low-poly model reads by. The environment replaces it with ambient that has a *direction*:
 * up-facing facets catch sky, down-facing ones catch the ochre field.
 */
export function BakeLighting({ shadows = false }: { shadows?: boolean }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);

  // Built in an effect, not a useMemo. Generating the PMREM is GPU work — it binds render
  // targets and draws six cube faces — and doing that during React's render phase, before the
  // canvas has committed, leaves the renderer in a state the next frame doesn't recover from.
  // The symptom is canvas-dependent and easy to miss: the main viewport looked fine (its
  // OrbitControls keep forcing fresh frames) while the read-check overlay, which has no
  // controls and draws a static scene, rendered nothing at all. An effect runs after commit
  // and both are correct.
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const src = gradientEquirect();
    const rt = pmrem.fromEquirectangular(src);
    src.dispose();
    pmrem.dispose();

    scene.environment = rt.texture;
    invalidate();
    return () => {
      scene.environment = null;
      rt.dispose();
    };
  }, [gl, scene, invalidate]);

  return (
    <directionalLight
      position={KEY_POSITION}
      intensity={1.6}
      castShadow={shadows}
      // Defaults are a 512² map over a ±5 frustum, which for a ~2-unit model is a soft
      // smear. Tighten the frustum to the contract's own working volume and raise the
      // resolution; normalBias keeps the faceted surfaces from shadow-acneing themselves.
      shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-2.5}
      shadow-camera-right={2.5}
      shadow-camera-top={2.5}
      shadow-camera-bottom={-2.5}
      shadow-camera-near={0.1}
      shadow-camera-far={20}
      shadow-normalBias={0.02}
    />
  );
}
