// Form tests double Vditor's DOM interface but use its actual bundled Lute parser.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const luteRuntime = { TextDecoder, TextEncoder, console, setTimeout, clearTimeout };
runInNewContext(readFileSync(new URL('../node_modules/vditor/dist/js/lute/lute.min.js', import.meta.url), 'utf8'), luteRuntime);
export default class VditorTestDouble {
  static instances = [];
  static mathAssetsLoaded = true;
  constructor(container, options) {
    if (VditorTestDouble.mathAssetsLoaded) {
      for (const id of ['vditorKatexStyle', 'vditorKatexScript', 'vditorKatexChemScript']) {
        if (!document.getElementById(id)) { const asset = document.createElement('script'); asset.id = id; document.head.appendChild(asset); }
      }
      window.katex = { renderToString: value => value };
    }
    this.options = options;
    this.value = options.value;
    this.vditor = { lute: luteRuntime.Lute.New(), options };
    this.vditor.lute.SetVditorMathBlockPreview(options.preview.markdown.mathBlockPreview);
    this.vditor.lute.SetInlineMathAllowDigitAfterOpenMarker(options.preview.math.inlineDigit);
    this.initialMarkup = this.vditor.lute.Md2VditorIRDOM(options.value);
    this.container = container;
    this.destroyed = false;
    VditorTestDouble.instances.push(this);
    const toolbar = document.createElement('div');
    const modeMenu = document.createElement('div');
    modeMenu.hidden = true;
    this.input = document.createElement('textarea');
    this.input.value = this.value;
    this.preview = document.createElement('div');
    this.preview.className = 'vditor-preview';
    this.previewElement = document.createElement('div');
    this.previewElement.className = options.classes.preview;
    this.preview.appendChild(this.previewElement);
    this.vditor.preview = { previewElement: this.previewElement };
    this.counter = document.createElement('span'); this.counter.className = 'vditor-counter';
    const button = (name, action, parent = toolbar) => {
      const element = document.createElement('button');
      element.type = 'button'; element.textContent = name;
      element.addEventListener('click', action); parent.append(element);
    };
    button('切换编辑模式', () => { modeMenu.hidden = !modeMenu.hidden; });
    for (const mode of ['即时渲染', '所见即所得', '分屏预览'])
      button(mode, () => { modeMenu.hidden = true; this.input.hidden = false; this.preview.hidden = false; }, modeMenu);
    button('预览', () => { this.input.hidden = !this.input.hidden; this.render(); });
    button('编辑 & 预览', () => { this.input.hidden = false; this.preview.hidden = false; this.render(); });
    this.input.addEventListener('input', () => {
      this.value = this.input.value; options.input(this.value); this.render();
    });
    container.append(toolbar, modeMenu, this.input, this.preview, this.counter);
    queueMicrotask(async () => { if (!this.destroyed) { await options.after(); this.render(); } });
  }
  render() { this.previewElement.innerHTML = this.options.preview.transform(''); this.options.counter.after(); }
  setValue(value, clearStack) { this.value = value; this.input.value = value; this.clearedStack = clearStack; this.render(); }
  getValue() { return this.value; }
  insertMD(value) { this.value += value; this.input.value = this.value; this.options.input(this.value); this.render(); }
  disabled() { this.input.disabled = true; }
  enable() { this.input.disabled = false; }
  destroy() { this.destroyed = true; this.container.replaceChildren(); }
}
