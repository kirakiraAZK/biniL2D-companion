/**
 * Loads a rebuilt Cubism model (moc3 + textures + expressions) and drives it.
 * Supports zoom, pan repositioning, procedural breathing, blinking, and lip-sync.
 */
import { CubismUserModel } from '../vendor/CubismWebFramework/src/model/cubismusermodel';
import { CubismModelSettingJson } from '../vendor/CubismWebFramework/src/cubismmodelsettingjson';
import { CubismMatrix44 } from '../vendor/CubismWebFramework/src/math/cubismmatrix44';
import { CubismEyeBlink } from '../vendor/CubismWebFramework/src/effect/cubismeyeblink';
import {
  CubismBreath,
  BreathParameterData
} from '../vendor/CubismWebFramework/src/effect/cubismbreath';
import { CubismFramework } from '../vendor/CubismWebFramework/src/live2dcubismframework';
import { CubismDefaultParameterId as DefaultId } from '../vendor/CubismWebFramework/src/cubismdefaultparameterid';
import { csmVector } from '../vendor/CubismWebFramework/src/type/csmvector';

const fetchBuffer = async (url: string): Promise<ArrayBuffer> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.arrayBuffer();
};

function makeTexture(gl: WebGLRenderingContext, img: HTMLImageElement): WebGLTexture {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

export class CompanionModel extends CubismUserModel {
  private setting: CubismModelSettingJson;
  private projection = new CubismMatrix44();
  private baseDir = '';
  readonly expressions = new Map<string, any>();
  readonly motions = new Map<string, any>();
  motionIndex: { name: string; file: string; duration: number; loop: boolean }[] = [];
  mocVersion = 0;

  /** Motion index URL; motions live at character level, shared by costumes. */
  motionsUrl?: string;

  /** Repositioning / Pan and Zoom coordinates */
  zoom = 1.0;
  margin = 0.06;
  offsetX = 0;
  offsetY = 0;

  setTransform(x: number, y: number, zoom?: number): void {
    this.offsetX = x;
    this.offsetY = y;
    if (typeof zoom === 'number') this.zoom = zoom;
  }

  static async load(
    gl: WebGLRenderingContext,
    baseDir: string,
    model3: string,
    onStep: (msg: string) => void,
    motionsUrl?: string
  ): Promise<CompanionModel> {
    const self = new CompanionModel();
    const settingBuf = await fetchBuffer(`${baseDir}/${model3}`);
    self.setting = new CubismModelSettingJson(settingBuf, settingBuf.byteLength);

    const mocBuf = await fetchBuffer(`${baseDir}/${self.setting.getModelFileName()}`);
    self.mocVersion = new Uint8Array(mocBuf)[4];
    const supported = Live2DCubismCore.Version.csmGetLatestMocVersion();
    onStep(`moc3 v${self.mocVersion}, Core supports up to v${supported}`);
    if (self.mocVersion > supported) {
      throw new Error(`moc3 v${self.mocVersion} is newer than this Core (v${supported})`);
    }

    self.loadModel(mocBuf, true);
    if (!self.getModel()) throw new Error('Core rejected the moc3');

    const physicsFile = self.setting.getPhysicsFileName();
    if (physicsFile) {
      const buf = await fetchBuffer(`${baseDir}/${physicsFile}`);
      self.loadPhysics(buf, buf.byteLength);
      onStep('physics loaded');
    }

    for (let i = 0; i < self.setting.getExpressionCount(); i++) {
      const name = self.setting.getExpressionName(i);
      const buf = await fetchBuffer(`${baseDir}/${self.setting.getExpressionFileName(i)}`);
      const motion = self.loadExpression(buf, buf.byteLength, name);
      if (motion) self.expressions.set(name, motion);
    }
    onStep(`${self.expressions.size} expressions loaded`);

    self.setupIdle();

    const count = self.setting.getTextureCount();
    self.createRenderer(0, 0);
    self.getRenderer().startUp(gl);
    self.getRenderer().setIsPremultipliedAlpha(true);
    for (let i = 0; i < count; i++) {
      const img = new Image();
      img.src = `${baseDir}/${self.setting.getTextureFileName(i)}`;
      await img.decode();
      self.getRenderer().bindTexture(i, makeTexture(gl, img));
    }
    onStep(`${count} texture(s) bound`);

    self.baseDir = baseDir;
    self.motionsUrl = motionsUrl ?? `${baseDir}/motions/index.json`;
    self.setInitialized(true);
    return self;
  }

  private effectIds(): [csmVector<any>, csmVector<any>] {
    if (!this._effectIds) {
      const eye = new csmVector<any>();
      for (let i = 0; i < this.setting.getEyeBlinkParameterCount(); i++) {
        eye.pushBack(this.setting.getEyeBlinkParameterId(i));
      }
      const lip = new csmVector<any>();
      for (let i = 0; i < this.setting.getLipSyncParameterCount(); i++) {
        lip.pushBack(this.setting.getLipSyncParameterId(i));
      }
      this._effectIds = [eye, lip];
    }
    return this._effectIds;
  }
  private _effectIds?: [csmVector<any>, csmVector<any>];

  async loadMotions(): Promise<number> {
    if (!this.motionsUrl) return 0;
    const res = await fetch(this.motionsUrl).catch(() => null);
    if (!res?.ok) return 0;
    this.motionIndex = await res.json();
    this.motionsBase = this.motionsUrl.slice(0, this.motionsUrl.lastIndexOf('/'));
    return this.motionIndex.length;
  }

  private motionsBase = '';

  get motionIdle(): boolean {
    return !this._motionManager || this._motionManager.isFinished();
  }

  async playMotion(name: string): Promise<boolean> {
    let motion = this.motions.get(name);
    if (!motion) {
      const entry = this.motionIndex.find((e) => e.name === name);
      if (!entry) return false;
      const buf = await fetchBuffer(`${this.motionsBase}/${entry.file}`);
      motion = this.loadMotion(buf, buf.byteLength, name);
      if (!motion) return false;
      motion.setEffectIds(...this.effectIds());
      motion.setIsLoop?.(entry.loop);
      this.motions.set(name, motion);
    }
    this._motionManager.startMotion(motion, false);
    return true;
  }

  private setupIdle(): void {
    this._eyeBlink = CubismEyeBlink.create(this.setting);

    const id = CubismFramework.getIdManager();
    const breath = new csmVector<BreathParameterData>();
    for (const [param, offset, peak, cycle, weight] of [
      [DefaultId.ParamAngleX, 0.0, 15.0, 6.5345, 0.5],
      [DefaultId.ParamAngleY, 0.0, 8.0, 3.5345, 0.5],
      [DefaultId.ParamAngleZ, 0.0, 10.0, 5.5345, 0.5],
      [DefaultId.ParamBodyAngleX, 0.0, 4.0, 15.5345, 0.5],
      [DefaultId.ParamBreath, 0.5, 0.5, 3.2345, 0.5]
    ] as [string, number, number, number, number][]) {
      breath.pushBack(
        new BreathParameterData(id.getId(param), offset, peak, cycle, weight)
      );
    }
    this._breath = CubismBreath.create();
    this._breath.setParameters(breath);
  }

  setExpression(name: string): void {
    const motion = this.expressions.get(name);
    if (motion) this._expressionManager.startMotion(motion, false);
  }

  lookAt(x: number, y: number): void {
    this.lookTarget.x = Math.max(-1, Math.min(1, x));
    this.lookTarget.y = Math.max(-1, Math.min(1, y));
  }

  setMouthOpen(v: number): void {
    this.mouthOpen = v;
  }

  private lookTarget = { x: 0, y: 0 };
  private lookCurrent = { x: 0, y: 0 };
  private mouthOpen = 0;
  private ids?: Record<string, any>;

  private id(name: string) {
    if (!this.ids) this.ids = {};
    return (this.ids[name] ??= CubismFramework.getIdManager().getId(name));
  }

  update(dt: number): void {
    const model = this.getModel();
    model.loadParameters();

    let motionPlayed = false;
    if (this._motionManager && !this._motionManager.isFinished()) {
      motionPlayed = this._motionManager.updateMotion(model, dt);
    }
    model.saveParameters();

    this._expressionManager?.updateMotion(model, dt);
    if (!motionPlayed) this._eyeBlink?.updateParameters(model, dt);

    const ease = Math.min(1, 9 * dt);
    this.lookCurrent.x += (this.lookTarget.x - this.lookCurrent.x) * ease;
    this.lookCurrent.y += (this.lookTarget.y - this.lookCurrent.y) * ease;
    const { x, y } = this.lookCurrent;
    model.addParameterValueById(this.id('ParamAngleX'), x * 30);
    model.addParameterValueById(this.id('ParamAngleY'), y * 30);
    model.addParameterValueById(this.id('ParamAngleZ'), x * y * -30);
    model.addParameterValueById(this.id('ParamBodyAngleX'), x * 10);
    model.addParameterValueById(this.id('ParamEyeBallX'), x);
    model.addParameterValueById(this.id('ParamEyeBallY'), y);

    if (this.mouthOpen > 0.01) {
      model.setParameterValueById(this.id('ParamMouthOpenY'), this.mouthOpen);
      model.setParameterValueById(this.id('ParamLipSync'), this.mouthOpen);
    }

    this._breath?.updateParameters(model, dt);
    this._physics?.evaluate(model, dt);
    model.update();
  }

  private art?: { cx: number; cy: number; w: number; h: number };

  private artBounds() {
    if (this.art) return this.art;
    const d = this.getModel()._model.drawables;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < d.count; i++) {
      const v = d.vertexPositions[i];
      for (let k = 0; k < v.length; k += 2) {
        if (v[k] < x0) x0 = v[k];
        if (v[k] > x1) x1 = v[k];
        if (v[k + 1] < y0) y0 = v[k + 1];
        if (v[k + 1] > y1) y1 = v[k + 1];
      }
    }
    this.art = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
    return this.art;
  }

  get artAspect(): number {
    const a = this.artBounds();
    return a.w / a.h;
  }

  draw(gl: WebGLRenderingContext, width: number, height: number): void {
    this.projection.loadIdentity();
    this.projection.scale(1.0, width / height);
    this.projection.multiplyByMatrix(this._modelMatrix);

    const a = this.artBounds();
    const m = this._modelMatrix.getArray();
    const aspect = width / height;
    const wClip = a.w * m[0];
    const hClip = a.h * m[5] * aspect;
    const usable = 2 * (1 - this.margin);
    const k = Math.min(usable / wClip, usable / hClip) * this.zoom;
    const cx = a.cx * m[0] + m[12];
    const cy = (a.cy * m[5] + m[13]) * aspect;

    this.projection.scaleRelative(k, k);
    this.projection.translateRelative(-k * cx, -k * cy);
    // Apply user customized pan offset in NDC coordinates
    const mArr = this.projection.getArray();
    this.projection.translateX(mArr[12] + this.offsetX);
    this.projection.translateY(mArr[13] + this.offsetY);

    const renderer = this.getRenderer();
    renderer.setMvpMatrix(this.projection);
    renderer.setRenderState(null, [0, 0, width, height]);
    renderer.drawModel();
  }
}
