import './hero-garden.css';

export function HeroGarden() {
  return <div className="hero-garden" aria-hidden="true">
    <div className="garden-halo" />
    <svg className="garden-orbits" viewBox="0 0 600 600" fill="none"><ellipse cx="300" cy="300" rx="264" ry="138" transform="rotate(-32 300 300)" /><ellipse cx="300" cy="300" rx="240" ry="206" transform="rotate(28 300 300)" /><path d="M60 405 Q290 535 530 184" strokeDasharray="3 9" /></svg>
    <div className="garden-sculpture"><div className="garden-petal petal-one" /><div className="garden-petal petal-two" /><div className="garden-petal petal-three" /><div className="garden-core" /></div>
    <div className="garden-satellite satellite-one"><i /></div><div className="garden-satellite satellite-two"><i /></div>
    <div className="garden-spark spark-one">✳</div><div className="garden-spark spark-two">+</div>
    <div className="garden-seed seed-one" /><div className="garden-seed seed-two" />
  </div>;
}
