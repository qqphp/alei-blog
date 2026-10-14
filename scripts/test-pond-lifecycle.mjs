import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { Window } from 'happy-dom';

registerHooks(await import('./ui-test-loader.mjs'));
const window = new Window({ url: 'http://localhost:3000' });
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event']) {
  Object.defineProperty(globalThis, name, { value: name === 'window' ? window : window[name], configurable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let width = 1156, hidden = false, frameId = 0, resized, disconnected = false;
const frames = new Map(), motionListeners = new Set();
const motion = {
  matches: false,
  addEventListener: (_, listener) => motionListeners.add(listener),
  removeEventListener: (_, listener) => motionListeners.delete(listener),
};
window.matchMedia = () => motion;
Object.defineProperty(window.document, 'hidden', { get: () => hidden });
Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { get: () => width });
Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { get: () => 190 });
globalThis.getComputedStyle = element => ({ width: element.classList.contains('pond-koi-gold') ? '128px' : element.classList.contains('pond-koi-blue') ? '112px' : '120px' });
globalThis.requestAnimationFrame = callback => { const id = ++frameId; frames.set(id, callback); return id; };
globalThis.cancelAnimationFrame = id => frames.delete(id);
globalThis.ResizeObserver = class {
  constructor(callback) { resized = callback; }
  observe() {}
  disconnect() { disconnected = true; }
};
const { createElement } = await import('react');
const { render, act } = await import('@testing-library/react');
const { InvestmentPond } = await import('../components/investment-pond.tsx');
const view = render(createElement(InvestmentPond));
const pond = view.container.querySelector('.investment-pond');
const positions = () => [...pond.querySelectorAll('.pond-koi')].map(element => element.style.transform);
const tick = async time => {
  const pending = [...frames.values()]; frames.clear();
  await act(async () => { pending.forEach(callback => callback(time)); });
};
assert.equal(frames.size, 1);
await tick(1000); const initial = positions(); await tick(1016);
assert.notDeepEqual(positions(), initial, 'animation should move fish');

hidden = true;
await act(async () => { window.document.dispatchEvent(new window.Event('visibilitychange')); });
assert.equal(frames.size, 0);
assert.equal(pond.dataset.paused, 'true');
const paused = positions(); await tick(60000);
assert.deepEqual(positions(), paused);
hidden = false;
await act(async () => { window.document.dispatchEvent(new window.Event('visibilitychange')); });
await tick(60000);
assert.deepEqual(positions(), paused, 'first resumed frame must not jump');
await tick(60016); assert.notDeepEqual(positions(), paused);

motion.matches = true;
await act(async () => { motionListeners.forEach(listener => listener()); });
const still = positions(); await tick(61000);
assert.equal(frames.size, 0);
assert.deepEqual(positions(), still);
assert.equal(pond.dataset.paused, 'true');
motion.matches = false;
await act(async () => { motionListeners.forEach(listener => listener()); });
assert.equal(frames.size, 1);

width = 617;
await act(async () => { resized(); });
assert.notDeepEqual(positions(), still, 'resize should reposition fish');
assert.equal(frames.size, 1, 'resize must not create competing loops');
view.unmount();
assert.equal(frames.size, 0);
assert.equal(motionListeners.size, 0);
assert.equal(disconnected, true);
console.log('Animation, hidden/resumed page, live reduced-motion change, resize and unmount checks passed.');
await window.happyDOM.abort();
