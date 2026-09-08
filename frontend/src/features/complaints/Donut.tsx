const SIZE = 56;
const STROKE = 5;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function Donut({ value, total, colorClass }) {
  const ratio = total > 0 ? value / total : 0;
  const offset = CIRCUMFERENCE * (1 - ratio);

  return (
    <svg className="donut" width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
      <circle className="donut-track" cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} />
      <circle
        className={`donut-value ${colorClass}`}
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={offset}
      />
    </svg>
  );
}

export default Donut;
